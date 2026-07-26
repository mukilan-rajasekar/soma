// The three lanes /preflight reads, defined ONCE — label, region, stroke, and where the
// numbers live in the report. The player legend, the batch-comparison dropdown and the
// hook comparison all render from this, so a lane can never be called "salience" in one
// place and "surprise" in another.
//
// Vocabulary matches /demo on purpose: attention is dorsal, surprise is ventral. The
// third lane is the higher-order association cortex (Default + Control networks), which
// is where meaning gets built — "comprehension" here, the same word /demo uses for the
// did-the-brand-land read.
//
// STROKES: three curves share one axis, so each must be identifiable without colour.
// Attention is solid ink, surprise is long-dashed slate, comprehension is round-dotted
// grey — different hue AND different dash pattern AND different weight, per
// docs/DESIGN-SYSTEM.md ("colour + dash, not hue alone").

import type { ColorToken } from "./tokens";
import type { ArcScale, PreflightAd } from "./types";

/** demo/process_batch.py:85 HOOK_WINDOW_S — the first 3 s scored as the hook. Not in the
 *  artifact, so it is restated here; if that constant changes, change this. */
export const HOOK_SECONDS = 3;

export type LaneKey = "attention" | "surprise" | "comprehension";

export type LaneDef = {
  key: LaneKey;
  /** "Attention" — the plain word. */
  label: string;
  /** "dorsal" — the region, shown parenthesised beside the label. */
  region: string;
  /** Short ROI name for the y-axis caption. */
  axis: string;
  /** One line of plain English for the legend. */
  note: string;
  colorToken: ColorToken;
  /** Same colour as `colorToken`, for HTML swatches that don't go through canvas. */
  cssVar: string;
  /** CSS border-style for the legend swatch — mirrors `dash`. */
  border: "solid" | "dashed" | "dotted";
  width: number;
  dash?: number[];
  /** paint order, ascending */
  z: number;
};

export const LANES: readonly LaneDef[] = [
  {
    key: "attention",
    label: "Attention",
    region: "dorsal",
    axis: "Dorsal attention network",
    note: "where the ad holds the eye",
    colorToken: "ink",
    cssVar: "var(--color-ink)",
    border: "solid",
    width: 2.6,
    z: 3,
  },
  {
    key: "surprise",
    label: "Surprise",
    region: "ventral",
    axis: "Ventral salience network",
    note: "the jolt of something unexpected",
    colorToken: "accent2",
    cssVar: "var(--color-accent-2)",
    border: "dashed",
    width: 2,
    dash: [7, 4],
    z: 2,
  },
  {
    key: "comprehension",
    label: "Comprehension",
    region: "association",
    axis: "Higher-order association cortex",
    note: "where meaning gets built",
    colorToken: "ink3",
    cssVar: "var(--color-ink-3)",
    border: "dotted",
    // A zero-length dash with the round line cap DeltaChart sets draws beads, not ticks —
    // unmistakable next to the surprise lane's long dashes even in greyscale.
    width: 2.2,
    dash: [0.1, 5],
    z: 1,
  },
] as const;

export const laneByKey = (key: LaneKey): LaneDef =>
  LANES.find((l) => l.key === key) ?? LANES[0];

/** The lane's samples for one ad, or undefined when the run didn't produce it. Parallel
 *  to `ad.timestamps` in every case. */
export function laneValues(
  ad: PreflightAd,
  key: LaneKey,
  scale: ArcScale,
): number[] | undefined {
  if (key === "attention") return ad.arc?.[scale];
  if (key === "surprise") return ad.lanes?.salventattn?.[scale];
  return ad.lanes?.higherOrder?.[scale];
}

/**
 * One y-domain per lane, spanning the WHOLE batch — not the ad on screen. A per-ad domain
 * would rescale the axis under the reader every time they switch cuts, which is exactly
 * the comparison this page exists to make. Always includes zero, because zero is the
 * black-screen baseline and a chart that hides its baseline is lying about it.
 */
export function laneDomain(
  ads: PreflightAd[],
  keys: LaneKey[],
  scale: ArcScale,
): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const ad of ads) {
    for (const key of keys) {
      for (const v of laneValues(ad, key, scale) ?? []) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  const pad = 0.08 * (hi - lo || 1);
  return [lo - pad, hi + pad];
}
