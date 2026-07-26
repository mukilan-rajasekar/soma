// Shape of public/demo/report.json — the single artifact tools/demo/build_report.py
// emits. Every number the scroll page shows comes from here; the page does no numerics
// of its own. Keep in step with build_report.py.

export type Scores = {
  soma: number;
  hook: number;
  hold: number;
  comprehension: number;
  holdPct: number;
  components: {
    ventralHook: number;
    dorsalHook: number;
    attentionLift: number | null;
    languageLift: number | null;
    brand: number;
  };
};

export type WeakSpot = { start: number; end: number; secs: number; depth: number };
export type BrandMention = { t: number; text: string; source: "speech" | "screen" };
export type Speech = { t: number; end: number; text: string };
export type Reads = { hook: string; hold: string; comprehension: string; soma: string };

export type Ad = {
  id: string;
  title: string;
  brand?: string;
  rank: number;
  duration: number;
  video: string;
  timestamps: number[];
  lanes: { dorsal: number[]; ventral: number[]; language: number[] };
  levels: Record<string, number | null>;
  scores: Scores;
  weakSpots: WeakSpot[];
  brandMentions: BrandMention[];
  reads: Reads;
  transcript: Speech[];
  // Fraction of the clip's seconds carrying any on-screen type, from the OCR pass.
  // Coverage rather than the strings themselves: macOS Vision mangles small, stylised
  // social-video type often enough that the text is not publishable, while presence
  // survives the mangling. null means no OCR pass exists for this clip — which is not
  // the same as a measured zero.
  screenCoverage: number | null;
};

export type Shot = { start: number; end: number; without: number; delta: number };
export type ShotDiagnosis = {
  base: number;
  adId: string;
  title: string;
  shots: Shot[];
  // One frame per shot, written by build_report.py alongside the deltas. Optional because
  // a report built before the thumbnails existed is still valid — consumers fall back to
  // an empty tile.
  thumbs?: (string | null)[];
};

export type Report = {
  weights: { hook: number; hold: number; comprehension: number };
  hookSeconds: number;
  corpus: { ads: number; advertisers: number };
  batch: Ad[];
  campaign: { name: string; variants: Ad[]; shots: ShotDiagnosis; dipId?: string };
};

export const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
