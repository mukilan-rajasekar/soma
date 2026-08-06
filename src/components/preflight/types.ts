// Shape of public/preflight/batch_report.json, emitted by demo/process_batch.py.
// Keep this file in step with that script — it is the contract between the GPU box and
// the page, and the page is a dumb renderer on purpose.
//
// UNITS, the thing to get right: every `arc` array is a BASELINE-SUBTRACTED delta in raw
// TRIBE units — NOT the per-clip 0..1 normalization /demo uses (build_report.py's
// norm_activation). Zero means "no different from the model's response to a black
// screen", which is what makes five different ads honestly comparable on one y-axis.
//
// The script precomputes everything the charts need — yDomain, xDomain, ranks,
// best/worst ids, the render order — so nothing here does arithmetic on the data.

export type ArcScale = "raw" | "psc";

/** Per-timepoint lane. Arrays are parallel to the ad's `timestamps`. */
export type PreflightArc = {
  /** Baseline-subtracted, signed. The default lane. */
  raw: number[];
  /** raw / SD of the black-screen baseline — divides out any per-clip gain difference. */
  psc: number[];
  /** |preds| magnitude lane. Diagnostic: if sd(raw) << sd(mag) the signed arc is noise. */
  mag?: number[];
  stats?: {
    mean: number;
    sd: number;
    min: number;
    max: number;
    peakT: number;
    troughT: number;
    fracAboveZero: number;
  };
};

/** A sustained run below the clip's own median. MAD-based, so scale-invariant —
 *  `raw` and `psc` yield identical spots and the script computes them once. */
export type WeakSpot = {
  start: number;
  end: number;
  secs: number;
  depth: number;
};

export type PreflightScores = {
  /** 0.40*hook + 0.35*processing + 0.25*clarity. Batch-relative percentile. */
  preflight: number;
  hook: number;
  processing: number;
  clarity: number;
};

export type Speech = { t: number; end: number; text: string };

export type PreflightAd = {
  id: string;
  title: string;
  rank: number;
  durationS: number;
  /** TWO PRODUCERS, two shapes, and PlayerPanel takes either because it only ever does
   *  `src={ad.video}`.
   *    /preflight   public-relative, always begins with a single "/". Validated on load
   *                 by report.ts's safeVideoPath — that check is what keeps a committed
   *                 artifact from pointing the player at an off-site URL.
   *    /r/<token>   an absolute, short-lived Supabase signed URL, minted per request by
   *                 the result page. The customer's footage lives in a PRIVATE bucket,
   *                 so there is no public path it could be given instead.
   *  report.ts's validator is deliberately not in the second path: it loads a committed
   *  file, and signing is what authorizes the second. */
  video: string | null;
  poster?: string | null;
  timestamps: number[];
  /** null when the script's timing check failed for this ad — scores are still
   *  present and the ad must still render, just without a curve. */
  arc: PreflightArc | null;
  lanes?: Partial<Record<"salventattn" | "higherOrder" | "visual", PreflightArc>>;
  weakSpots: WeakSpot[];
  scores: PreflightScores;
  features?: Record<string, number>;
  clarity?: { windows?: Record<string, string> };
  media?: {
    asrBackend?: string;
    ocrBackend?: string;
    transcript?: Speech[];
  };
  diagnostics?: Record<string, unknown>;
  flags?: string[];
};

export type PreflightChart = {
  arcRoiLabel: string;
  /** Which of arc.raw / arc.psc to plot. Flips to "psc" if the script's per-run
   *  z-score test fires, i.e. when cross-ad LEVELS can't be trusted. */
  defaultScale: ArcScale;
  units: Record<ArcScale, string>;
  xDomain: [number, number];
  /** Shared across all ads — the whole reason the comparison is honest. Guaranteed
   *  (and re-normalized on load) to span 0 so the zero line is always on canvas. */
  yDomain: Record<ArcScale, [number, number]>;
  fpsArc?: number;
  zeroLine?: number;
};

export type PreflightReport = {
  schemaVersion: string;
  generatedAt: string;
  generator?: Record<string, string>;
  license?: string;
  claim?: { validated: string; hypothesis: string };
  batch: {
    name: string;
    nAds: number;
    platform?: string;
    placement?: string;
    objective?: string;
    product?: string;
    audience?: string;
    durationBucket?: string;
    message?: Record<string, string>;
  };
  weights: { hook: number; processing: number; clarity: number };
  scoring?: {
    percentileGrid?: number[];
    scoreRange?: [number, number];
    smallNCaveat?: string;
    partialBatch?: boolean;
    /** Which reference point the scores use, written by process_batch.py.
     *  "batch"       a percentile against the other ads in the run (n >= 3).
     *  "within_item" against the clip's own timeline, which is what a run of one or
     *                two gets. THE TWO ARE NOT COMPARABLE — an 80 within-item means
     *                "this ad's hook beats 80% of its own seconds", an 80 in a batch
     *                means "better than 80% of the ads you sent". Any surface printing
     *                the number has to say which it is. Absent on artifacts produced
     *                before the field existed; treat that as "batch". */
    scale?: "batch" | "within_item";
    cohortN?: number;
  };
  chart: PreflightChart;
  bestId: string;
  worstId: string;
  /** Ad ids in rank order, so the page never sorts. */
  order: string[];
  ads: PreflightAd[];
  comparability?: {
    crossAdLevelsTrustworthy?: boolean;
    baselineSpreadRatio?: number;
    verdict?: string;
    note?: string;
  };
  sanity?: {
    visualPositive?: boolean;
    fullVisualByAd?: Record<string, number>;
    note?: string;
  };
  warnings?: string[];
};

/** Where an ad sits in the batch. Drives colour, which is bound to RANK, not selection. */
export type AdRole = "best" | "worst" | "mid";

export function roleOf(ad: PreflightAd, report: PreflightReport): AdRole {
  if (ad.id === report.bestId) return "best";
  if (ad.id === report.worstId) return "worst";
  return "mid";
}

export const fmtT = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Signed, with a real minus sign, and decimals derived from the tick step so labels
 *  don't read 0.10000000001. */
export function fmtDelta(v: number, step: number): string {
  const decimals = Math.min(4, Math.max(0, Math.ceil(-Math.log10(Math.abs(step || 1))) + 1));
  const s = Math.abs(v).toFixed(decimals);
  if (Number(s) === 0) return s;
  return v < 0 ? `−${s}` : s;
}
