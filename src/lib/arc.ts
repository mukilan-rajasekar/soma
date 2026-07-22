// Runtime arc helpers — the drawable-data layer for the /demo player and (later)
// A/B compare. Types live in ./types/arc; this file adds the pure math ported
// verbatim from the old demo/app.js: validArc, arcDuration, valAt (linear interp),
// per-lane statistics, plus a few small shared formatters. No canvas, no React —
// everything here is a pure function so it is trivially reusable and testable.

import type { Arc } from "./types/arc";

export type { Arc };

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// An arc is drawable only if it has PARALLEL timestamps + activation arrays and a
// real (positive) duration. A length mismatch is REJECTED rather than rendered: it
// would draw a silently wrong-but-plausible curve (samples indexed off the wrong
// axis). Ported verbatim from app.js so live/unvalidated rows can never brick a draw.
export function validArc(d: unknown): d is Arc {
  if (!d || typeof d !== "object") return false;
  const a = d as Arc;
  if (!Array.isArray(a.timestamps) || !a.timestamps.length) return false;
  if (!Array.isArray(a.activation) || !a.activation.length) return false;
  if (a.timestamps.length !== a.activation.length) return false;
  const dur = a.duration_sec || a.timestamps[a.timestamps.length - 1] || 0;
  return dur > 0;
}

// Duration source: duration_sec, else the last timestamp, else 0.
export function arcDuration(a: Arc): number {
  return a.duration_sec || a.timestamps[a.timestamps.length - 1] || 0;
}

// Linear interpolation of a per-sample sequence at wall-clock time `t` (seconds),
// given the clip `duration`. Uniform sampling: sample index = t/duration*(n-1).
export function valAt(seq: number[], t: number, duration: number): number {
  const n = seq.length;
  if (!n || !duration) return seq[0] ?? 0;
  const f = (t / duration) * (n - 1);
  const i = Math.floor(f);
  const fr = f - i;
  const a = seq[i] ?? 0;
  const b = seq[Math.min(i + 1, n - 1)] ?? a;
  return a + (b - a) * fr;
}

// Same interpolation on a NORMALIZED position u in [0,1] — used by A/B compare to
// overlay clips of different lengths on one timeline (Phase 3), kept here beside valAt.
export function sampleAt(arc: Arc, u: number): number {
  const seq = arc.activation || [];
  if (!seq.length) return 0;
  const f = u * (seq.length - 1);
  const i = Math.floor(f);
  const fr = f - i;
  const a = seq[i] ?? 0;
  const b = seq[Math.min(i + 1, seq.length - 1)] ?? a;
  return a + (b - a) * fr;
}

// Per-lane summary statistics, computed ONCE per clip. Honest: peak/mean/min are
// plain descriptive statistics of the very same scalar the curve plots — nothing
// fabricated, nothing per-region.
export type Stat = { min: number; max: number; mean: number; argmax: number };

export function statOf(arr: number[] | undefined): Stat | null {
  if (!Array.isArray(arr) || !arr.length) return null;
  let mn = Infinity;
  let mx = -Infinity;
  let s = 0;
  let ai = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < mn) mn = v;
    if (v > mx) {
      mx = v;
      ai = i;
    }
    s += v;
  }
  return { min: mn, max: mx, mean: s / arr.length, argmax: ai };
}

export type ArcStats = {
  att: Stat | null;
  val: Stat | null;
  aro: Stat | null;
};

export function computeStats(arc: Arc): ArcStats {
  const af = arc.affect || {};
  return {
    att: statOf(arc.activation),
    val: statOf(af.valence),
    aro: statOf(af.arousal),
  };
}

// The weak-spot band (if any) active at time `t` — drives the timeline callout.
export function activeWeakSpot(arc: Arc, t: number) {
  return (arc.weak_spots || []).find((w) => t >= w.start && t <= w.end) || null;
}

// MM:SS clock, floored to whole seconds (transport clock + time-axis tick labels).
export function fmt(s: number): string {
  s = Math.max(0, Math.floor(s || 0));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
