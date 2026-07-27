// Scripted data for the two "studio" sections of /demo — Generate (§07) and Edit (§08).
//
// WHAT IS REAL AND WHAT IS SCRIPTED. Generation and in-platform editing are not shipped
// yet; these two sections are a staged walkthrough of what the platform does, so the
// product story on the page matches the product we are building. The staging sits on top
// of real material, and the split is deliberate:
//
//   REAL — every score, arc, hook read, and leave-one-shot-out delta quoted here comes
//   from public/demo/report.json, which tools/demo/build_report.py computes from frozen
//   TRIBE output over the five actual 30s cuts in public/campaign. "Cut the 1.7–4.9s
//   beat and the score goes 62 → 66" is a measured number, not a guess. The five cuts
//   really are five different edits of one direct-response campaign, and they really do
//   score 73 / 62 / 62 / 59 / 51.
//
//   SCRIPTED — the interaction around those numbers: the brief someone types, the names
//   of the generator directions, the natural-language edit instructions, the candidate
//   counts, and the two predicted deltas marked `predicted: true` below (reorder and
//   text-overlay, which no leave-one-shot-out pass can supply because they change the
//   footage rather than remove from it).
//
// Nothing in this file computes anything. Components read report.json for numbers and
// this file for the words wrapped around them.

import type { Ad, Report, ShotDiagnosis } from "./types";

// ── the customer's brand kit ────────────────────────────────────────────────
//
// Halden Supply is a placeholder account name for the welding-gear advertiser whose
// footage the campaign clips come from — the same convention the ranked batch already
// uses with "Kova · Whey Isolate". Swap this whole object for a real customer's kit
// (it is the only thing the generator needs about a brand).
//
// The palette is not invented: these are the dominant colours sampled out of
// public/campaign/v03_30s_product_first.mp4 itself, so the kit on screen matches the
// footage beside it.

export type Swatch = { hex: string; name: string };
export type BrandKit = {
  account: string;
  monogram: string;
  product: string;
  palette: Swatch[];
  typeface: string;
  tone: string[];
};

export const BRAND: BrandKit = {
  account: "Halden Supply",
  monogram: "H",
  product: "Welding gear · direct response",
  palette: [
    { hex: "#204060", name: "Shield blue" },
    { hex: "#4060a0", name: "Arc blue" },
    { hex: "#c08060", name: "Hide tan" },
    { hex: "#404040", name: "Graphite" },
    { hex: "#e0e0c0", name: "Bone" },
  ],
  typeface: "Grotesque · medium",
  tone: ["Plain-spoken", "Hands-on", "No hype"],
};

// ── §07 · generate ──────────────────────────────────────────────────────────

// What someone types. Written the way a media buyer actually briefs — an objective, a
// constraint, and a runtime — not prompt-engineering.
export const BRIEF =
  "30-second direct response for the new welding helmet. Hands-on, shot in the shop, no hype. End on the offer.";

// How many candidates the generator produced, and how many survived the internal test.
// The cull is the point of the section: generation is cheap, the filter is the product.
export const GENERATED = 24;

// The five survivors, in the order the internal test ranked them. `id` keys into
// report.campaign.variants, so the score, arc, and hook read attached to each card
// downstream are the real measured ones — this table only supplies the words.
export type Direction = {
  id: string;
  label: string;
  // The generative instruction, in the generator's own voice — what it decided to do.
  move: string;
  // Why it made that call, stated in the neural terms the model was trained on. This is
  // the "informed by neural context" claim, made concrete on a specific decision.
  neural: string;
  poster: string;
};

export const DIRECTIONS: Direction[] = [
  {
    id: "v03_30s_product_first",
    label: "Product first",
    move: "Open on the helmet in hand, mid-shot, before a single word.",
    neural: "Ventral surprise peaks when an unexpected object lands in frame, so the object goes first.",
    poster: "/demo/posters/v03_30s_product_first.jpg",
  },
  {
    id: "v01_30s_story_hook",
    label: "Story open",
    move: "Open on the welder mid-job, then reveal what he is wearing.",
    neural: "A person in motion holds dorsal attention, but the brand lands late, so comprehension carries this one.",
    poster: "/demo/posters/v01_30s_story_hook.jpg",
  },
  {
    id: "v02_30s_deal_first",
    label: "Deal first",
    move: "Lead with the offer, then justify it with the product.",
    neural: "Price is a familiar shape. It registers, it does not startle. The hook runs on comprehension, not surprise.",
    poster: "/demo/posters/v02_30s_deal_first.jpg",
  },
  {
    id: "v05_30s_weak_open",
    label: "Slow open",
    move: "Set the scene first (the shop, the sparks), then the product.",
    neural: "Attention has to be earned back after an establishing shot; the arc dips through the first seven seconds.",
    poster: "/demo/posters/v05_30s_weak_open.jpg",
  },
  {
    id: "v04_30s_urgency_first",
    label: "Urgency first",
    move: "Open on the countdown and the deadline.",
    neural: "Almost no surprise response in the first three seconds. The brain has seen this opening a thousand times.",
    poster: "/demo/posters/v04_30s_urgency_first.jpg",
  },
];

// The internal test, as texture. GENERATED candidates go through the model before anyone
// sees them; this is the lattice that shows the cull. Each entry is a candidate's
// predicted score — deterministic, hand-fixed rather than random, because a random fill
// would differ between the server render and the client and flash on hydration. The five
// marked `survives` are the five that become the real cards below, so the lattice and the
// board are visibly the same set of candidates.
export const LATTICE: { score: number; survives: boolean }[] = [
  { score: 38, survives: false }, { score: 51, survives: true }, { score: 29, survives: false },
  { score: 44, survives: false }, { score: 33, survives: false }, { score: 62, survives: true },
  { score: 41, survives: false }, { score: 27, survives: false }, { score: 47, survives: false },
  { score: 59, survives: true }, { score: 31, survives: false }, { score: 43, survives: false },
  { score: 36, survives: false }, { score: 48, survives: false }, { score: 73, survives: true },
  { score: 25, survives: false }, { score: 40, survives: false }, { score: 46, survives: false },
  { score: 34, survives: false }, { score: 62, survives: true }, { score: 30, survives: false },
  { score: 45, survives: false }, { score: 39, survives: false }, { score: 28, survives: false },
];

export const SURVIVORS = LATTICE.filter((c) => c.survives).length;

// Resolve a direction to its real measured ad. Order DIRECTIONS by real Soma score so the
// board is always ranked by the measurement, never by the order they are typed here.
export function rankedDirections(report: Report): { dir: Direction; ad: Ad }[] {
  const byId = new Map(report.campaign.variants.map((v) => [v.id, v]));
  return DIRECTIONS.map((dir) => ({ dir, ad: byId.get(dir.id) as Ad }))
    .filter((r) => r.ad)
    .sort((a, b) => b.ad.scores.soma - a.ad.scores.soma);
}

// ── §08 · edit ──────────────────────────────────────────────────────────────

// The instruction that gets typed, and the three ways the platform found to carry it out.
// Each option is scored, ranked, and the winner is the one that gets applied.
//
// `shotIndex` points into report.campaign.shots.shots — when it is set, `score` and
// `delta` are that shot's real measured leave-one-shot-out values and must not be
// hand-written. `predicted: true` marks the two options that change the footage rather
// than remove from it, which leave-one-shot-out cannot measure.

export const EDIT_COMMAND = "Cut the slow open, get to the product inside the first second.";

export type EditOption = {
  kind: "splice" | "reorder" | "overlay";
  label: string;
  detail: string;
  // A splice names the shot it removes and takes its numbers from that shot's measured
  // leave-one-shot-out entry at render time. Nothing here duplicates a score that
  // report.json can supply — a number typed in two places is a number that will drift.
  shotIndex?: number;
  // Only for options leave-one-shot-out cannot measure. Must be paired with predicted.
  score?: number;
  delta?: number;
  predicted?: boolean;
};

export const EDIT_OPTIONS: EditOption[] = [
  {
    kind: "splice",
    label: "Splice out the 1.7–4.9s beat",
    detail: "Lands on the helmet at 1.7s.",
    shotIndex: 1,
  },
  {
    kind: "splice",
    label: "Splice out the 0.0–1.7s beat",
    detail: "Opens on the bench, no establishing shot.",
    shotIndex: 0,
  },
  {
    kind: "reorder",
    label: "Move the product beat to the front",
    detail: "Every frame kept; the helmet leads.",
    score: 64,
    delta: 2,
    predicted: true,
  },
];

// The applied edit is the top-ranked option, and it must stay a MEASURED one — resting
// the section's punchline on the single option with no measurement behind it is exactly
// the trade this page does not make.
export const EDIT_APPLIED = EDIT_OPTIONS[0];

// Resolve an option against the report: splices read their measured score and delta out
// of the leave-one-shot-out pass, everything else uses its declared prediction.
export function resolveOption(o: EditOption, diag: ShotDiagnosis): { score: number; delta: number; measured: boolean } {
  const shot = o.shotIndex === undefined ? undefined : diag.shots[o.shotIndex];
  if (shot) return { score: shot.without, delta: shot.delta, measured: true };
  return { score: o.score ?? diag.base, delta: o.delta ?? 0, measured: false };
}

// The other two commands shown as available, to make the point that this is one text box
// and not three features. `result` is what the platform reports back after running the
// candidate through the model.
export type Command = { text: string; result: string; predicted?: boolean };

export const MORE_COMMANDS: Command[] = [
  {
    text: "Add the offer as text at 0:04.",
    result: "Placed under the safe area, held 2.1s · comprehension +6, attention unchanged.",
    predicted: true,
  },
  {
    text: "Give me three openings that beat this one.",
    result: "Three cuts generated, scored, ranked. Top cut 68.",
    predicted: true,
  },
];

// ── the static modality ─────────────────────────────────────────────────────
//
// "Both modalities" means the same text box drives static creative too. The still is a
// real frame lifted out of the same campaign, so nothing new has to be shot to show it.

export const STATIC_FRAME = "/demo/posters/v03_30s_product_first.jpg";
export const STATIC_COMMAND = "Same offer, static. Headline top-left.";
