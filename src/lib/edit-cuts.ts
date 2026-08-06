// edit-cuts.ts — reading a finished edit search, with the rendered films attached.
//
// WHY THIS READS AND NEVER RUNS. The edit search shells out to Python and ffmpeg
// (src/lib/edit-runner.ts) and the site deploys to Vercel, which has neither — that is the
// whole reason src/lib/edit-capability.ts exists and defaults closed. So the dashboard's
// editor is a READER over artifacts that were produced somewhere with the stack on it:
// scripts/ingest_partner_ad.py renders the cuts, uploads them, and writes the rows this
// file selects. Nothing on the request path spawns a process.
//
// That is not a demo shortcut, it is the shape docs/strategy/PLAN.md § 0.2 already argues
// for: "precompute the edit candidates on the scorer box during the batch run and store
// them in the report JSON. The second is better — it's the same estimator, it runs where
// Python already lives, and it makes the block real instead of hidden."
//
// THE `measured` FLAG IS THE POINT OF THIS FILE, and it must survive to the UI intact.
// false: the delta was estimated by re-slicing the arc of the UNEDITED film, which cannot
//        know that removing a shot changes what its neighbours predict.
// true:  the rendered file was run back through the encoder and that is its real score.
// tools/edit/ops.py refuses to set it and only the verify stage may. A UI that prints both
// the same way would be claiming the expensive number while having paid for the cheap one.

import "server-only";

import { isShareToken } from "@/lib/batch";
import { signKeys } from "@/lib/dashboard";
import { sessionClient } from "@/lib/supabase/session";

export type EditCut = {
  position: number;
  kind: string;
  label: string;
  confidence: string;
  durationS: number | null;
  estScore: number | null;
  estDelta: number | null;
  /** See the header. Never render an estimate as though it were measured. */
  measured: boolean;
  videoUrl: string | null;
  posterUrl: string | null;
};

export type EditShot = {
  start: number;
  end: number;
  without: number | null;
  delta: number | null;
};

/** A scored edit candidate from result.candidates when the search path persisted them.
 *  Ingest/seed usually omit this; edit_cuts still carries the rendered winners. */
export type EditCandidate = {
  kind: string;
  label: string;
  estScore: number | null;
  estDelta: number | null;
  measured: boolean;
  removed: [number, number][];
};

export type EditRun = {
  token: string;
  status: "queued" | "processing" | "done" | "failed";
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  /** The score of the film before any edit, so a delta has something to be a delta from. */
  baseScore: number | null;
  /**
   * Shot boundaries from the ingest/search result. Customer writers store {start,end}
   * only — demo-style without/delta leave-one-out is NOT in this array. Deltas are merged
   * on read from result.candidates (kind "remove") or left null for the UI to fill from
   * edit_cuts.
   */
  shots: EditShot[];
  /** Present when tools/edit/search.py wrote the full payload; empty for thin ingest rows. */
  candidates: EditCandidate[];
  cuts: EditCut[];
};

type EditRunRow = {
  id: string;
  share_token: string;
  ad_id: string;
  status: EditRun["status"];
  result: {
    baseScore?: unknown;
    shots?: unknown;
    candidates?: unknown;
  } | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type EditCutRow = {
  edit_run_id: string;
  position: number;
  kind: string;
  label: string;
  confidence: string;
  storage_path: string;
  poster_path: string | null;
  duration_s: string | number | null;
  est_score: string | number | null;
  est_delta: string | number | null;
  measured: boolean;
};

/** Postgres `numeric` arrives as a string over PostgREST. Number() on null yields 0,
 *  which would print a confident 0.0s duration, so null has to stay null. */
function num(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every edit run for one video, newest first, with rendered media signed.
 *
 * Ownership is enforced by RLS on edit_runs (migration 0008) because this reads through
 * the cookie-scoped client — a run belonging to someone else simply is not in the result
 * set. Returns [] rather than throwing when auth is unconfigured.
 */
export async function loadEditRuns(batchToken: string, adId: string): Promise<EditRun[]> {
  if (!isShareToken(batchToken)) return [];

  const supabase = await sessionClient();
  if (!supabase) return [];

  const { data: runRows, error: runError } = await supabase
    .from("edit_runs")
    .select("id, share_token, ad_id, status, result, error, created_at, completed_at")
    .eq("batch_share_token", batchToken)
    .eq("ad_id", adId)
    .order("created_at", { ascending: false });

  if (runError || !runRows?.length) return [];
  const runs = runRows as EditRunRow[];

  const { data: cutRows } = await supabase
    .from("edit_cuts")
    .select(
      "edit_run_id, position, kind, label, confidence, storage_path, poster_path, duration_s, est_score, est_delta, measured",
    )
    .in(
      "edit_run_id",
      runs.map((r) => r.id),
    )
    .order("position", { ascending: true });

  const cuts = (cutRows ?? []) as EditCutRow[];

  // One signing round-trip for every cut across every run, rather than one per run.
  const signed = await signKeys(
    cuts.flatMap((c) => [c.storage_path, c.poster_path ?? ""]),
  );
  const resolve = (key: string | null): string | null => {
    if (!key) return null;
    if (key.startsWith("/") || key.startsWith("http")) return key;
    return signed.get(key) ?? null;
  };

  const byRun = new Map<string, EditCut[]>();
  for (const cut of cuts) {
    const list = byRun.get(cut.edit_run_id) ?? [];
    list.push({
      position: cut.position,
      kind: cut.kind,
      label: cut.label,
      confidence: cut.confidence,
      durationS: num(cut.duration_s),
      estScore: num(cut.est_score),
      estDelta: num(cut.est_delta),
      measured: cut.measured,
      videoUrl: resolve(cut.storage_path),
      posterUrl: resolve(cut.poster_path),
    });
    byRun.set(cut.edit_run_id, list);
  }

  return runs.map((run) => {
    const candidates = parseCandidates(run.result?.candidates);
    const shots = enrichShots(parseShots(run.result?.shots), candidates);
    return {
      token: run.share_token,
      status: run.status,
      createdAt: run.created_at,
      completedAt: run.completed_at,
      error: run.error,
      baseScore: typeof run.result?.baseScore === "number" ? run.result.baseScore : null,
      shots,
      candidates,
      cuts: byRun.get(run.id) ?? [],
    };
  });
}

function parseShots(raw: unknown): EditShot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      const row = s as { start?: unknown; end?: unknown; without?: unknown; delta?: unknown };
      const start = typeof row.start === "number" ? row.start : null;
      const end = typeof row.end === "number" ? row.end : null;
      if (start === null || end === null) return null;
      return {
        start,
        end,
        without: typeof row.without === "number" ? row.without : null,
        delta: typeof row.delta === "number" ? row.delta : null,
      };
    })
    .filter((s): s is EditShot => s !== null);
}

function parseCandidates(raw: unknown): EditCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      const row = c as {
        kind?: unknown;
        label?: unknown;
        est_score?: unknown;
        est_delta?: unknown;
        measured?: unknown;
        confidence?: unknown;
        removed?: unknown;
      };
      if (typeof row.kind !== "string" || typeof row.label !== "string") return null;
      const removed = Array.isArray(row.removed)
        ? row.removed
            .map((pair) => {
              if (!Array.isArray(pair) || pair.length < 2) return null;
              const a = Number(pair[0]);
              const b = Number(pair[1]);
              return Number.isFinite(a) && Number.isFinite(b) ? ([a, b] as [number, number]) : null;
            })
            .filter((p): p is [number, number] => p !== null)
        : [];
      const measured =
        row.measured === true ||
        (typeof row.confidence === "string" && row.confidence === "measured");
      return {
        kind: row.kind,
        label: row.label,
        estScore: typeof row.est_score === "number" ? row.est_score : null,
        estDelta: typeof row.est_delta === "number" ? row.est_delta : null,
        measured,
        removed,
      };
    })
    .filter((c): c is EditCandidate => c !== null);
}

/** Attach remove-candidate deltas onto matching shot boundaries when LOO fields are absent. */
function enrichShots(shots: EditShot[], candidates: EditCandidate[]): EditShot[] {
  if (!shots.length) return shots;
  const removes = candidates.filter((c) => c.kind === "remove" && c.estDelta !== null);
  if (!removes.length) return shots;

  return shots.map((shot) => {
    if (shot.delta !== null) return shot;
    const match = removes.find((c) =>
      c.removed.some(
        ([a, b]) => Math.abs(a - shot.start) < 0.05 && Math.abs(b - shot.end) < 0.05,
      ),
    );
    if (!match || match.estDelta === null) return shot;
    return {
      ...shot,
      delta: match.estDelta,
      without:
        match.estScore !== null
          ? match.estScore
          : shot.without,
    };
  });
}
