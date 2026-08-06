// check-shot-cells.ts — the per-shot pairing rule, asserted against the real function.
//
// Usage: node --experimental-strip-types scripts/check-shot-cells.ts
//
// WHY THIS EXISTS. src/components/dashboard/ShotDiagnosisStrip.tsx used to pair shot `i`
// with remove-candidate `i` whenever it could not match one by time range. Candidates are
// the top-K ranked by est_delta, not one per shot and not in shot order, so shots with no
// candidate of their own silently displayed a neighbour's number under their own
// timestamp — and since the largest delta also writes the summary line, the page told the
// customer to cut a beat the analysis had never recommended.
//
// It imports src/lib/shot-cells.ts rather than restating the rule. That distinction is the
// whole point: the last regression test in this repo that restated its subject's logic
// (test_within_item_scoring.py, clarity scaling) encoded the same wrong assumption as the
// code and agreed with the bug instead of catching it.

import { shotCells } from "../src/lib/shot-cells.ts";
import type { EditCandidate, EditCut, EditShot } from "../src/lib/edit-cuts.ts";

let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function shot(start: number, end: number, delta: number | null = null): EditShot {
  return { start, end, without: null, delta };
}

function candidate(label: string, estDelta: number, removed: [number, number][]): EditCandidate {
  return { kind: "remove", label, estScore: null, estDelta, measured: false, removed };
}

function cut(label: string, estDelta: number): EditCut {
  return {
    position: 1,
    kind: "remove",
    label,
    confidence: "estimate",
    durationS: null,
    estScore: null,
    estDelta,
    measured: false,
    videoUrl: null,
    posterUrl: null,
  };
}

// ── 1. the bug: fewer candidates than shots ──────────────────────────────────────
// Six shots, three candidates. The candidates describe 4.0-6.5s, 11.0-14.0s and 6.5-9.0s
// — none of them the first two shots.
console.log("\nfewer candidates than shots");
{
  const shots = [
    shot(0.0, 2.0),
    shot(2.0, 4.0),
    shot(4.0, 6.5),
    shot(6.5, 9.0),
    shot(9.0, 11.0),
    shot(11.0, 14.0),
  ];
  const cands = [
    candidate("Cut the 4.0-6.5s beat", 9, [[4.0, 6.5]]),
    candidate("Cut the 11.0-14.0s beat", 5, [[11.0, 14.0]]),
    candidate("Cut the 6.5-9.0s beat", 2, [[6.5, 9.0]]),
  ];
  const cells = shotCells(shots, [], cands);

  check("every shot still gets a cell", cells.length === 6, `got ${cells.length}`);
  check("untested 0.0-2.0s has no delta", cells[0].delta === null, `got ${cells[0].delta}`);
  check("untested 2.0-4.0s has no delta", cells[1].delta === null, `got ${cells[1].delta}`);
  check("untested 9.0-11.0s has no delta", cells[4].delta === null, `got ${cells[4].delta}`);
  check("4.0-6.5s keeps its own +9", cells[2].delta === 9, `got ${cells[2].delta}`);
  check("6.5-9.0s keeps its own +2", cells[3].delta === 2, `got ${cells[3].delta}`);
  check("11.0-14.0s keeps its own +5", cells[5].delta === 5, `got ${cells[5].delta}`);

  // The summary line takes the largest delta. Under the old index fallback the borrowed
  // +9 sat on the 0.0-2.0s tile and won, recommending the opening be cut.
  const tested = cells.filter((c) => c.delta !== null) as { start: number; delta: number }[];
  const strongest = tested.reduce((a, b) => (b.delta > a.delta ? b : a));
  check(
    "strongest lift names 4.0s, not the opening",
    strongest.start === 4.0,
    `summary would say ${strongest.start}s`,
  );

  const nines = cells.filter((c) => c.delta === 9).length;
  check("+9 is not printed twice", nines === 1, `appeared ${nines}x`);
}

// ── 2. removed[] outranks the label ──────────────────────────────────────────────
console.log("\nremoved[] outranks a disagreeing label");
{
  // A label that says one thing and segments that say another: the segments produced the
  // estimate, so they decide where the number lands.
  const cells = shotCells(
    [shot(0.0, 2.0), shot(2.0, 4.0)],
    [],
    [candidate("Cut the 0.0-2.0s beat", 7, [[2.0, 4.0]])],
  );
  check("delta follows removed[], not the label", cells[1].delta === 7, `got ${cells[1].delta}`);
  check("the label's shot is left untested", cells[0].delta === null, `got ${cells[0].delta}`);
}

// ── 3. an edit_cuts row, which carries only a label ──────────────────────────────
console.log("\nedit_cuts rows pair by parsed label range");
{
  const cells = shotCells([shot(0.0, 2.0), shot(2.0, 4.0)], [cut("Cut the 2.0-4.0s beat", 4)], []);
  check("2.0-4.0s picks up +4", cells[1].delta === 4, `got ${cells[1].delta}`);
  check("0.0-2.0s stays untested", cells[0].delta === null, `got ${cells[0].delta}`);
}

// ── 3b. a boundary that rounds to exactly the tolerance ──────────────────────────
console.log("\nboundary rounded by exactly the tolerance");
{
  // tools/edit/ops.py _fmt writes "%.1f", so a shot ending at 0.750 is labelled "0.8" —
  // off by 0.050000000000000044, which is larger than TOL_S in binary. A strict `<`, and
  // a bare `<=`, both reject it: the shot reads "not tested" though it was scored, and if
  // it is the only candidate the strip withholds itself and the block disappears.
  const cells = shotCells([shot(0.5, 0.75)], [cut("Cut the 0.5-0.8s beat", 6)], []);
  check("a .X5 boundary still pairs", cells[0].delta === 6, `got ${cells[0].delta}`);
}

// ── 4. no shot boundaries at all ─────────────────────────────────────────────────
console.log("\nno shot boundaries");
{
  // The old code fell back to `i` and `i + 1` as SECONDS for an edit whose range would not
  // parse, inventing a 0-1s timestamp that looked exactly like a real one.
  const cells = shotCells([], [cut("Trim the open", 3), cut("Cut the 5.0-7.0s beat", 6)], []);
  check("unlocatable edit is dropped, not given fake times", cells.length === 1, `got ${cells.length}`);
  check("the locatable one keeps its real range", cells[0].start === 5.0, `got ${cells[0].start}`);
}

// ── 5. the demo shape, where shots carry their own deltas ────────────────────────
console.log("\nshots carrying leave-one-out deltas");
{
  const cells = shotCells([shot(0.0, 2.0, -3), shot(2.0, 4.0, 8)], [], []);
  check("passes straight through", cells[0].delta === -3 && cells[1].delta === 8);
  check("a negative delta survives", cells[0].delta === -3, `got ${cells[0].delta}`);
}

// ── 6. nothing testable ──────────────────────────────────────────────────────────
console.log("\nnothing to pair");
{
  const cells = shotCells([shot(0.0, 2.0), shot(2.0, 4.0)], [], []);
  check("no deltas invented", cells.every((c) => c.delta === null));
}

if (failed) {
  console.log(`\nshot-cells: ${failed} check(s) failed`);
  process.exit(1);
}
console.log("\n✓ shot cells pair by time, never by index");
