// dashboard.ts — "my videos", derived rather than stored.
//
// THE UNIT PROBLEM. A YouTube-Studio dashboard lists VIDEOS. This schema has no videos
// table and should not grow one: a scored cut already exists in three places that must
// agree — an `uploads` row (the bytes), an entry in `batches.report.ads[]` (the arc and
// the scores), and a position in `batches.report.order` (the rank). A fourth copy would
// be a fourth thing to keep in step, and the first one to go stale.
//
// So a DashboardVideo is a JOIN done in TypeScript, keyed by (batch share_token, ad id).
// That pair is already the addressing scheme the edit flow uses
// (src/lib/edit-source.ts: loadBatchEditSource(token, adId)), so the dashboard and the
// editor resolve a video the same way, and a URL in one is meaningful to the other.
//
// WHY THE SCORE IS A BATCH-RELATIVE PERCENTILE, AND WHY THAT IS ON THE CARD. Every
// component score out of demo/process_batch.py is a percentile against the OTHER ads in
// the same run (percentile_rank, process_batch.py:1004). Two videos from two different
// batches do not share a scale — an 80 in a batch of three weak cuts is not an 80 in a
// batch of ten strong ones. The library therefore shows the batch a video was scored in
// beside its number, and never sorts the whole library by score as though it were one
// ranking. Doing that would be the single most misleading thing this screen could do.
//
// READS GO THROUGH THE SESSION CLIENT, not service_role, so migration 0008's RLS
// ("owners read their batches") is what enforces ownership. A WHERE clause here would be
// a second, weaker copy of that rule which someone will one day forget to write.

import "server-only";

import type { PreflightAd, PreflightReport } from "@/components/preflight/types";
import { sessionClient } from "@/lib/supabase/session";
import { serviceClient } from "@/lib/supabase/server";
import { isShareToken } from "@/lib/batch";

/** One hour, matching /r/<token>. Long enough to watch everything, short enough that a
 *  URL copied out of devtools stops working the same afternoon. */
export const SIGNED_URL_TTL_S = 60 * 60;

export type BatchStatus = "queued" | "processing" | "done" | "failed";

/** "batch" = ranked against the other ads in the run; "within_item" = against its own
 *  timeline. Carried on every video so no surface has to guess from the ad count. */
export type ScoreScale = "batch" | "within_item";

export type DashboardVideo = {
  /** The batch this cut was scored in. Also its address: /dashboard/v/<token>/<adId>. */
  token: string;
  adId: string;
  title: string;
  batchName: string;
  /** Rank within its batch, 1-based, and how many it was ranked against. */
  rank: number;
  ofN: number;
  score: number;
  /** Components that make up `score`. Same batch-relative percentiles. */
  hook: number;
  processing: number;
  clarity: number;
  durationS: number;
  posterUrl: string | null;
  scoredAt: string | null;
  scale: ScoreScale;
};

/** A run that has no read-out to show yet — queued, processing, or failed. */
export type DashboardPendingRun = {
  token: string;
  batchName: string;
  status: Exclude<BatchStatus, "done">;
  adCount: number;
  createdAt: string;
  error: string | null;
};

export type DashboardLibrary = {
  videos: DashboardVideo[];
  pending: DashboardPendingRun[];
  /** True when Supabase is not configured at all, so the UI can say that rather than
   *  render a confident empty state that means something different. */
  unconfigured: boolean;
};

type BatchRow = {
  id: string;
  share_token: string;
  batch_name: string | null;
  status: BatchStatus;
  manifest: { ads?: unknown[]; batch_name?: string } | null;
  report: PreflightReport | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

const BATCH_COLUMNS =
  "id, share_token, batch_name, status, manifest, report, error, created_at, completed_at";

/** Absent on reports written before the field existed — those were all n>=3 runs. */
function scaleOf(report: PreflightReport): ScoreScale {
  return report.scoring?.scale === "within_item" ? "within_item" : "batch";
}

function batchLabel(row: BatchRow): string {
  return row.batch_name ?? row.report?.batch?.name ?? row.manifest?.batch_name ?? "Untitled run";
}

/** Ads in the report's own rank order, so nothing here sorts. */
function orderedAds(report: PreflightReport): PreflightAd[] {
  const byId = new Map(report.ads.map((ad) => [ad.id, ad]));
  const ranked = report.order.map((id) => byId.get(id)).filter((ad): ad is PreflightAd => !!ad);
  // Defensive: an ad present in `ads` but missing from `order` would otherwise vanish
  // from the library while still being reachable by URL.
  const seen = new Set(ranked.map((ad) => ad.id));
  return [...ranked, ...report.ads.filter((ad) => !seen.has(ad.id))];
}

/**
 * Object keys in the private bucket exchanged for short-lived signed URLs, in ONE call.
 *
 * A value already beginning with "/" is a public site asset and is passed through — the
 * committed /preflight artifact legitimately points there. Mirrors withSignedMedia() in
 * src/app/r/[token]/page.tsx; the two exist separately because that one rewrites a whole
 * report and this one only needs posters for a grid.
 */
export async function signKeys(keys: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const needed = [...new Set(keys.filter((k) => k && !k.startsWith("/") && !k.startsWith("http")))];
  if (needed.length === 0) return signed;

  // Signing is a privileged operation on a private bucket: the anon key cannot mint a
  // signed URL, and the row-level check that this user may see these objects has already
  // happened above, in RLS, when their batches were selected.
  const supabase = serviceClient();
  if (!supabase) return signed;

  const { data, error } = await supabase.storage
    .from("uploads")
    .createSignedUrls(needed, SIGNED_URL_TTL_S);
  if (error || !data) return signed;

  for (const row of data) {
    // Per-item errors rather than a throw, so one missing object degrades one poster
    // instead of taking the page down.
    if (row.signedUrl && row.path) signed.set(row.path, row.signedUrl);
  }
  return signed;
}

/** Every video the signed-in user owns, plus the runs still in flight. */
export async function loadLibrary(): Promise<DashboardLibrary> {
  const supabase = await sessionClient();
  if (!supabase) return { videos: [], pending: [], unconfigured: true };

  const { data, error } = await supabase
    .from("batches")
    .select(BATCH_COLUMNS)
    .order("created_at", { ascending: false });

  if (error || !data) return { videos: [], pending: [], unconfigured: false };
  const rows = data as BatchRow[];

  const videos: DashboardVideo[] = [];
  const pending: DashboardPendingRun[] = [];

  for (const row of rows) {
    if (row.status !== "done" || !row.report) {
      pending.push({
        token: row.share_token,
        batchName: batchLabel(row),
        status: row.status as Exclude<BatchStatus, "done">,
        adCount: Array.isArray(row.manifest?.ads) ? row.manifest.ads.length : 0,
        createdAt: row.created_at,
        error: row.error,
      });
      continue;
    }

    // Bound outside the closure: TypeScript's narrowing from the guard above does not
    // survive into a callback, and `row.report!` would be a lie waiting to be edited.
    const report = row.report;
    const label = batchLabel(row);
    const scale = scaleOf(report);
    const ads = orderedAds(report);

    ads.forEach((ad, i) => {
      videos.push({
        token: row.share_token,
        adId: ad.id,
        title: ad.title,
        batchName: label,
        rank: ad.rank ?? i + 1,
        ofN: ads.length,
        score: ad.scores.preflight,
        hook: ad.scores.hook,
        processing: ad.scores.processing,
        clarity: ad.scores.clarity,
        durationS: ad.durationS,
        posterUrl: ad.poster ?? null,
        scoredAt: row.completed_at ?? report.generatedAt ?? null,
        scale,
      });
    });
  }

  const signed = await signKeys(videos.map((v) => v.posterUrl ?? ""));
  for (const v of videos) {
    if (v.posterUrl && signed.has(v.posterUrl)) v.posterUrl = signed.get(v.posterUrl)!;
    else if (v.posterUrl && !v.posterUrl.startsWith("/")) v.posterUrl = null;
  }

  return { videos, pending, unconfigured: false };
}

export type DashboardVideoDetail = {
  video: DashboardVideo;
  ad: PreflightAd;
  report: PreflightReport;
  videoUrl: string | null;
};

/**
 * One video, with its media signed, or null when the user does not own it.
 *
 * Null covers "no such batch", "not yours", "not finished", and "no such ad in it"
 * without distinguishing them — the caller turns all four into the same notFound(), so
 * this cannot be used to probe which tokens exist.
 */
export async function loadVideo(
  token: string,
  adId: string,
): Promise<DashboardVideoDetail | null> {
  if (!isShareToken(token)) return null;

  const supabase = await sessionClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("batches")
    .select(BATCH_COLUMNS)
    .eq("share_token", token)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as BatchRow;
  if (row.status !== "done" || !row.report) return null;

  const ads = orderedAds(row.report);
  const index = ads.findIndex((a) => a.id === adId);
  if (index < 0) return null;
  const ad = ads[index];

  const signed = await signKeys([ad.video ?? "", ad.poster ?? ""]);
  const resolve = (key: string | null | undefined): string | null => {
    if (!key) return null;
    if (key.startsWith("/") || key.startsWith("http")) return key;
    return signed.get(key) ?? null;
  };

  return {
    video: {
      token: row.share_token,
      adId: ad.id,
      title: ad.title,
      batchName: batchLabel(row),
      rank: ad.rank ?? index + 1,
      ofN: ads.length,
      score: ad.scores.preflight,
      hook: ad.scores.hook,
      processing: ad.scores.processing,
      clarity: ad.scores.clarity,
      durationS: ad.durationS,
      posterUrl: resolve(ad.poster),
      scoredAt: row.completed_at ?? row.report.generatedAt ?? null,
      scale: scaleOf(row.report),
    },
    ad: { ...ad, video: resolve(ad.video), poster: resolve(ad.poster) },
    report: row.report,
    videoUrl: resolve(ad.video),
  };
}

export type DashboardRun = {
  token: string;
  batchName: string;
  report: PreflightReport;
  generatedAt: string | null;
  scale: ScoreScale;
};

/**
 * A whole finished run with every cut's media signed, or null when the user does not own it.
 *
 * Same null-collapsing rule as loadVideo: missing, unfinished, and not-yours are identical
 * to the caller so the token space cannot be probed from the dashboard.
 */
export async function loadRun(token: string): Promise<DashboardRun | null> {
  if (!isShareToken(token)) return null;

  const supabase = await sessionClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("batches")
    .select(BATCH_COLUMNS)
    .eq("share_token", token)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as BatchRow;
  if (row.status !== "done" || !row.report) return null;

  const report = row.report;
  const keys = report.ads.flatMap((a) => [a.video ?? "", a.poster ?? ""]);
  const signed = await signKeys(keys);
  const resolve = (key: string | null | undefined): string | null => {
    if (!key) return null;
    if (key.startsWith("/") || key.startsWith("http")) return key;
    return signed.get(key) ?? null;
  };

  return {
    token: row.share_token,
    batchName: batchLabel(row),
    generatedAt: row.completed_at ?? report.generatedAt ?? null,
    scale: scaleOf(report),
    report: {
      ...report,
      ads: report.ads.map((a) => ({
        ...a,
        video: resolve(a.video),
        poster: resolve(a.poster),
      })),
    },
  };
}
