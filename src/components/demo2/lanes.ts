// The three lanes the read-out draws, defined ONCE — label, region, stroke and the one line
// of plain English that says what the lane means. Every chart legend renders from this, so a
// lane can never be called "surprise" on one figure and "salience" on the next, and a stroke
// can never drift out of step with the swatch that claims to describe it.
//
// Ported from /preflight, which had the cleaner version of this: the labels there carry the
// region in parentheses AND a plain-English note, where demo-short's legend was a bare
// "ATTENTION · DORSAL" that names the anatomy without saying what it is for.
//
// STROKES: three curves share one axis, so each has to be identifiable WITHOUT colour —
// different hue AND different dash AND different weight (docs/DESIGN-SYSTEM.md, "colour +
// dash, not hue alone"). That is what keeps the figure readable in greyscale, at embed size,
// and after video compression has eaten the chroma.

import type { ColorToken } from "./tokens";

export type LaneKey = "attention" | "surprise" | "comprehension";

export type LaneDef = {
  key: LaneKey;
  /** The plain word. */
  label: string;
  /** The region, shown parenthesised beside the label. */
  region: string;
  /** One line of plain English for the legend. */
  note: string;
  colorToken: ColorToken;
  /** CSS border-style for the HTML swatch — mirrors `dash`. */
  border: "solid" | "dashed" | "dotted";
  width: number;
  dash?: number[];
  /** Paint order, ascending — so the solid attention curve lands on top. */
  z: number;
};

export const LANES: readonly LaneDef[] = [
  {
    key: "attention",
    label: "Attention",
    region: "dorsal",
    note: "where the ad holds the eye",
    colorToken: "ink",
    border: "solid",
    width: 2.6,
    z: 3,
  },
  {
    key: "surprise",
    label: "Surprise",
    region: "ventral",
    note: "the jolt of something unexpected",
    colorToken: "accent2",
    border: "dashed",
    width: 2,
    dash: [7, 4],
    z: 2,
  },
  {
    key: "comprehension",
    label: "Comprehension",
    region: "association",
    note: "where meaning gets built",
    colorToken: "ink3",
    border: "dotted",
    // A near-zero dash with a round line cap draws BEADS rather than ticks — unmistakable
    // next to the surprise lane's long dashes even with the colour taken away.
    width: 2.2,
    dash: [0.1, 5],
    z: 1,
  },
] as const;

export const laneByKey = (key: LaneKey): LaneDef =>
  LANES.find((l) => l.key === key) ?? LANES[0];
