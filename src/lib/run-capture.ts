// run-capture.ts — the shape of a recorded pipeline run, as the page reads it.
//
// The data comes from src/data/run-capture.json, which tools/capture/summarize.py folds
// out of a run.jsonl that tools/capture/recorder.py wrote WHILE the pipeline ran. Nothing
// in that chain is hand-authored, and scripts/verify.sh re-folds the source and fails if
// the committed JSON drifted — so a value rendered here is a value some process actually
// observed. That guarantee is the entire reason /run exists; see the summarize.py header.
//
// STAGE_TITLES must stay in step with STAGE_KEYS in tools/capture/recorder.py. The Python
// side already refuses to fold a capture containing a key this file does not know, so the
// failure mode is a gate failure naming the key rather than an untitled box on the page.

import raw from "@/data/run-capture.json";

export type StageStatus = "ok" | "skipped" | "failed";

export type Artifact = {
  path: string;
  role: string;
  label: string | null;
  present: boolean;
  bytes?: number | null;
  sha256?: string | null;
};

export type Stage = {
  key: string;
  title: string;
  status: StageStatus;
  reason: string | null;
  startMs: number;
  elapsedMs: number | null;
  facts: { k: string; v: unknown }[];
  artifacts: Artifact[];
  log: { stream: string; text: string }[];
  logTruncated: number;
};

export type Presence = { present: boolean; reason?: string; version?: string | null };

export type TorchInfo = Presence & {
  backend?: string;
  cudaVersion?: string | null;
  devices?: { index: number; name: string; totalMemoryMb: number }[];
};

export type RunCapture = {
  runId: string;
  startedAt: string;
  argv: string[];
  status: string;
  elapsedMs: number | null;
  env: {
    host?: string;
    platform?: string;
    python?: string;
    git?: string | null;
    ffmpeg?: string | null;
    tesseract?: string | null;
    torch: TorchInfo;
    tribeWeights: Presence & { path?: string };
    fasterWhisper?: Presence;
    dryRun?: boolean;
    [k: string]: unknown;
  };
  stages: Stage[];
  counts: { ok: number; skipped: number; failed: number };
  outputs: Record<string, unknown>;
  sourceJsonl?: string;
};

// One short line per stage explaining what the stage IS, for a reader who has never seen
// this pipeline. The recorder's own `title` says what it did; this says why it matters.
export const STAGE_TITLES: Record<string, string> = {
  probe: "The file as it arrived, hashed so every later claim is about this exact cut.",
  shots: "ffmpeg scene detection. Everything downstream is defined in terms of these boundaries.",
  render: "Each candidate re-cut is really encoded — not simulated — so its score is measured.",
  encode: "The TRIBE v2 forward pass. The GPU step, and the only one costed in minutes.",
  score: "Arcs collapse to hook / processing / clarity, then to a single read-out.",
  posters: "One frame per cut, for the library grid.",
  publish: "Storage objects, database rows, and the URL the customer opens.",
};

export const capture = raw as unknown as RunCapture;

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** What compute this run actually had, in one phrase, from observed facts only. */
export function deviceLine(env: RunCapture["env"]): string {
  const t = env.torch;
  if (!t?.present) return "no model stack on this host";
  const dev = t.devices?.[0];
  if (t.backend === "cuda" && dev) {
    return `${dev.name} · CUDA ${t.cudaVersion ?? "?"} · ${(dev.totalMemoryMb / 1024).toFixed(0)} GB`;
  }
  return `torch ${t.version ?? "?"} on ${t.backend ?? "unknown"}`;
}

/**
 * Did a model actually run? The one question this whole page exists to answer, so it is
 * computed from the stage record rather than from the presence of scores — a report can
 * be produced from a cache, but an `ok` encode stage cannot be produced without the pass.
 */
export function encoderRan(cap: RunCapture): boolean {
  return cap.stages.some((s) => s.key === "encode" && s.status === "ok");
}
