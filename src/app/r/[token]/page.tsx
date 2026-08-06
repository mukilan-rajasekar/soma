// /r/<share_token> — the customer's address for one scored batch.
//
// THE CAPABILITY URL. There is no account system and no login. Holding the token IS the
// authorization, which is the right shape for a concierge product that hands someone a
// link, and is only safe because the token is 16 random bytes (migration 0003) and every
// response for a bad token is identical to the response for a token that does not exist.
// noindex is not decoration here: a customer's unreleased creative must never be
// crawlable, so the metadata below is load-bearing.
//
// FOUR STATES, and each is a real page rather than a placeholder:
//   queued      accepted, not started. Says so, and says how long to expect.
//   processing  on the box now.
//   failed      did not finish. Says why, in the pipeline's own words.
//   done        the read-out.
// The first two are what make "turnaround in hours" feel like a product instead of
// silence; BatchStatus polls and refreshes this segment when the state changes.
//
// SIGNING. The report stores storage OBJECT KEYS for media, not URLs, because the bucket
// is private and a URL would be stale the moment it was written. They are exchanged for
// short-lived signed URLs here, per request, at render time. See mediaUrls() below.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import BatchStatus from "@/components/result/BatchStatus";
import ResultReport from "@/components/result/ResultReport";
import SiteHeader from "@/components/site/SiteHeader";
import { isShareToken } from "@/lib/batch";
import { editSearchAvailable } from "@/lib/edit-capability";
import { serviceClient } from "@/lib/supabase/server";
import type { PreflightReport } from "@/components/preflight/types";

// Always fresh: a status page that a CDN can hold is a status page that lies.
export const dynamic = "force-dynamic";

/** One hour. Long enough to watch every cut in a batch without a re-mint, short enough
 *  that a URL copied out of devtools stops working the same afternoon. A reload re-signs. */
const SIGNED_URL_TTL_S = 60 * 60;

type BatchRow = {
  id: string;
  status: "queued" | "processing" | "done" | "failed";
  batch_name: string | null;
  manifest: { ads?: unknown[]; batch_name?: string } | null;
  report: PreflightReport | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

async function loadBatch(token: string): Promise<BatchRow | null> {
  if (!isShareToken(token)) return null;
  const supabase = serviceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("batches")
    .select("id, status, batch_name, manifest, report, error, created_at, started_at, completed_at")
    .eq("share_token", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as BatchRow;
}

// ── media ───────────────────────────────────────────────────────────────────────
//
// A value that already starts with "/" is a public site asset and is left alone (that is
// what the committed /preflight artifact carries, and a batch scored against footage the
// site already ships can legitimately point there). Anything else is an object key in the
// private `uploads` bucket and is exchanged for a signed URL.
//
// Signed in ONE batch call rather than per ad: ten ads would otherwise be twenty
// sequential round-trips on the critical path of the page.
function isStorageKey(v: string | null | undefined): v is string {
  return typeof v === "string" && v.length > 0 && !v.startsWith("/") && !v.startsWith("http");
}

async function withSignedMedia(report: PreflightReport): Promise<PreflightReport> {
  const supabase = serviceClient();
  if (!supabase) return report;

  const keys = [
    ...new Set(
      report.ads.flatMap((a) => [a.video, a.poster].filter(isStorageKey)),
    ),
  ];
  if (keys.length === 0) return report;

  const { data, error } = await supabase.storage
    .from("uploads")
    .createSignedUrls(keys, SIGNED_URL_TTL_S);

  if (error || !data) return report;

  const signed = new Map<string, string>();
  for (const row of data) {
    // createSignedUrls returns a per-item error rather than throwing, so a single
    // missing object degrades that one player to its "unavailable" state instead of
    // taking the whole report down.
    if (row.signedUrl && row.path) signed.set(row.path, row.signedUrl);
  }

  return {
    ...report,
    ads: report.ads.map((a) => ({
      ...a,
      video: isStorageKey(a.video) ? signed.get(a.video) ?? null : a.video,
      poster: isStorageKey(a.poster) ? signed.get(a.poster) ?? null : a.poster,
    })),
  };
}

// ── metadata ────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const batch = await loadBatch(token);
  const name = batch?.batch_name ?? batch?.manifest?.batch_name ?? "your batch";
  return {
    title: `soma · ${name}`,
    description: "A Soma read-out: every cut in the batch, scored second by second.",
    // Load-bearing. This page shows a customer's unreleased creative.
    robots: { index: false, follow: false, nocache: true },
  };
}

// ── page ────────────────────────────────────────────────────────────────────────

export default async function ResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const batch = await loadBatch(token);

  // Identical 404 for a malformed token, an unknown token, and an unconfigured
  // environment. Anything distinguishable turns this route into an oracle for probing
  // which tokens exist.
  if (!batch) notFound();

  const name = batch.batch_name ?? batch.manifest?.batch_name ?? "Your batch";
  const adCount = Array.isArray(batch.manifest?.ads) ? batch.manifest.ads.length : 0;

  if (batch.status === "done" && batch.report) {
    const report = await withSignedMedia(batch.report);
    return (
      <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
        <SiteHeader />
        <ResultReport
          report={report}
          batchName={name}
          generatedAt={batch.completed_at ?? report.generatedAt ?? null}
          batchToken={token}
          // Decided on the server, per host: the edit blocks spend Python and ffmpeg,
          // which the deploy target does not have. See src/lib/edit-capability.ts.
          editsAvailable={editSearchAvailable()}
        />
      </main>
    );
  }

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <SiteHeader />
      <div className="mx-auto max-w-[720px] px-[clamp(18px,5vw,40px)] pb-32 pt-[clamp(48px,12vh,120px)]">
        <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
          {name}
          {adCount ? ` · ${adCount} cuts` : ""}
        </div>

        {batch.status === "failed" ? (
          <>
            <h1 className="mt-3 max-w-[20ch] text-balance text-hero text-ink">
              This run didn&rsquo;t finish.
            </h1>
            <p className="mt-5 max-w-[56ch] text-pretty text-body text-ink-2">
              Nothing is wrong with your footage as far as you need to care. The pipeline
              stops rather than publishing numbers it cannot stand behind, and this run hit
              one of those stops.
            </p>
            {batch.error ? (
              <div className="mt-6 rounded-2xl border border-line bg-fill p-4">
                <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
                  What the run said
                </div>
                <p className="mt-2 font-mono text-[12.5px] leading-[1.65] text-ink-2">
                  {batch.error}
                </p>
              </div>
            ) : null}
            <p className="mt-6 max-w-[56ch] text-pretty text-body text-ink-2">
              A failed run lands in our queue the same moment it lands here, and we look at
              every one. There is nothing you need to do.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 max-w-[20ch] text-balance text-hero text-ink">
              {batch.status === "processing" ? (
                <>
                  Scoring your{" "}
                  <span className="font-serif font-normal italic">batch</span>.
                </>
              ) : (
                <>
                  Your batch is{" "}
                  <span className="font-serif font-normal italic">queued</span>.
                </>
              )}
            </h1>
            <p className="mt-5 max-w-[56ch] text-pretty text-body text-ink-2">
              Each cut is padded, run through the encoder a second at a time, and scored
              against the others in the batch. Turnaround is measured in hours, not a
              research cycle.
            </p>

            {/* The three states, with the current one lit. Tells someone who lands here
                twenty minutes in exactly where their run sits, which is the whole reason
                this page exists rather than an email that arrives whenever it arrives. */}
            <ol className="mt-8 flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {[
                { k: "queued", label: "Received", body: "Your cuts are in the queue, in order." },
                { k: "processing", label: "Scoring", body: "Running on the box: encoder, then the three components." },
                { k: "done", label: "Ready", body: "The read-out replaces this page automatically." },
              ].map((step) => {
                const active = step.k === batch.status;
                const passed =
                  (batch.status === "processing" && step.k === "queued") ||
                  batch.status === "done";
                return (
                  <li key={step.k} className="flex items-start gap-3 bg-paper p-4">
                    <span
                      className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${
                        active ? "bg-accent-2" : passed ? "bg-ink" : "bg-line-2"
                      }`}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-ui ${active ? "font-medium text-ink" : "text-ink-2"}`}
                      >
                        {step.label}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink-3">
                        {step.body}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>

            <BatchStatus
              token={token}
              initialStatus={batch.status}
              startedAtMs={new Date(batch.created_at).getTime()}
            />

            <p className="mt-10 max-w-[56ch] text-[13px] leading-[1.6] text-ink-3">
              This address is yours. Bookmark it: it is the only link to this run, and it
              keeps working after the read-out lands.
            </p>
          </>
        )}

        <div className="mt-12">
          <Link
            href="/"
            className="text-[13px] text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
          >
            soma
          </Link>
        </div>
      </div>
    </main>
  );
}
