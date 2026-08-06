// shot-cells.ts — pair each shot with the remove-candidate that actually covers it.
//
// WHY THIS IS ITS OWN FILE. This used to live inside ShotDiagnosisStrip.tsx, where it
// could not be tested: the repo's test runner is pytest, and a .tsx component needs a
// DOM. Extracted, it is a pure function over plain data, and scripts/check-shot-cells.ts
// asserts the pairing rule against THIS function rather than a copy of it. A copy would
// have re-encoded whatever assumption the original made, which is how the bug below
// survived review in the first place.
//
// THE BUG THIS FILE EXISTS TO PREVENT. The previous rule was:
//
//     const cut = byRange ?? removeCuts[i];        // <- pair shot i with candidate i
//
// Candidates are the top-K ranked by est_delta (tools/edit/ops.py rank()), not one per
// shot and not in shot order. So a shot with no candidate of its own silently borrowed
// the number belonging to an unrelated shot, and rendered it under its OWN timestamp.
// With 6 shots and 3 candidates that put a +9 belonging to 4.0-6.5s onto the 0-2s tile,
// printed the same +9 twice, and — because the strongest lift wins the summary line —
// told the customer to cut their opening when the analysis said to cut the middle.
//
// Wrong is worse than missing here. A shot nobody scored gets `delta: null` and is
// rendered as "not tested"; it never inherits a neighbour's number.
//
// HOW A SHOT AND A CANDIDATE ARE MATCHED, best source first:
//   1. EditCandidate.removed — the actual [start, end] segments the search removed.
//      Authoritative, because it is the data the estimate was computed from.
//   2. The time range parsed out of the label ("Cut the 4.0-6.5s beat"), which is all
//      an edit_cuts row carries — that table stores a label, not the segments.
// No third resort. If neither identifies the shot, the shot is untested.

import type { EditCandidate, EditCut, EditShot } from "./edit-cuts";

export type ShotCell = {
  start: number;
  end: number;
  /** null means "no candidate covered this shot", NOT "removing it changes nothing". */
  delta: number | null;
  label: string;
};

/** Tolerance when comparing a candidate's boundaries to a shot's, in seconds. Shot
 *  boundaries round-trip through JSON and a label formatted at one decimal
 *  (tools/edit/ops.py _fmt), so an exact === would miss a correct pairing. */
const TOL_S = 0.05;

/** Matches "4.0-6.5" in a label, with either an ASCII hyphen (what _fmt emits) or an
 *  en dash (what a human editing a label is likely to type). */
const RANGE = /([\d.]+)\s*[–-]\s*([\d.]+)/;

export function isRemoveCut(c: { kind: string; label: string }): boolean {
  return (
    c.kind === "remove" ||
    c.kind === "drop_shot" ||
    c.kind === "remove_shot" ||
    /drop shot/i.test(c.label)
  );
}

function rangeFromLabel(label: string): [number, number] | null {
  const m = label.match(RANGE);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

function covers(range: [number, number], shot: { start: number; end: number }): boolean {
  return Math.abs(range[0] - shot.start) < TOL_S && Math.abs(range[1] - shot.end) < TOL_S;
}

/** Every way we know of to locate a remove-edit on the timeline, most reliable first. */
type Removal = { ranges: [number, number][]; label: string; delta: number | null };

function removals(cuts: EditCut[], candidates: EditCandidate[]): Removal[] {
  const out: Removal[] = [];

  for (const c of candidates) {
    if (c.kind !== "remove") continue;
    const ranges = c.removed?.length ? c.removed : ([] as [number, number][]);
    const fallback = rangeFromLabel(c.label);
    out.push({
      ranges: ranges.length ? ranges : fallback ? [fallback] : [],
      label: c.label,
      delta: c.estDelta,
    });
  }

  for (const c of cuts) {
    if (!isRemoveCut(c)) continue;
    const r = rangeFromLabel(c.label);
    out.push({ ranges: r ? [r] : [], label: c.label, delta: c.estDelta });
  }

  return out;
}

/**
 * One cell per shot when shot boundaries are known, else one cell per locatable
 * remove-edit. Cells may carry a null delta; the caller decides how to render an
 * untested shot, and is expected to withhold the whole strip if nothing was tested.
 */
export function shotCells(
  shots: EditShot[],
  cuts: EditCut[],
  candidates: EditCandidate[],
): ShotCell[] {
  // Best case: the search wrote leave-one-out deltas onto the shots themselves, so
  // there is nothing to pair. This is the demo's shape; ingest and seed are not.
  if (shots.some((s) => s.delta !== null)) {
    return shots.map((s, i) => ({
      start: s.start,
      end: s.end,
      delta: s.delta,
      label: `Shot ${i + 1}`,
    }));
  }

  const found = removals(cuts, candidates);

  if (shots.length) {
    return shots.map((s, i) => {
      const hit = found.find((r) => r.ranges.some((range) => covers(range, s)));
      return {
        start: s.start,
        end: s.end,
        delta: hit ? hit.delta : null,
        label: hit ? hit.label : `Shot ${i + 1}`,
      };
    });
  }

  // No shot boundaries at all: fall back to the edits themselves. An edit whose position
  // on the timeline cannot be recovered is DROPPED rather than assigned a synthetic
  // index — the old code used `i` and `i + 1` as seconds, inventing timestamps that
  // looked like real ones.
  return found
    .filter((r) => r.ranges.length > 0)
    .map((r) => ({
      start: r.ranges[0][0],
      end: r.ranges[0][1],
      delta: r.delta,
      label: r.label,
    }));
}
