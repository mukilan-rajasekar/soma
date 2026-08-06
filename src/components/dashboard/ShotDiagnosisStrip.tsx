// ShotDiagnosisStrip — per-shot remove deltas as a filmstrip, without demo theater.
//
// Demo ShotDiagnosis carries leave-one-out {without, delta} on every shot. Customer
// edit_runs.result.shots are usually BOUNDARIES ONLY (scripts/seed_review_data.py writes
// `{"start": a, "end": b}` with no delta), so the number beside a shot has to be found by
// matching it to a remove-candidate. That pairing is src/lib/shot-cells.ts, which explains
// at length why it refuses to guess — a shot nobody scored shows "not tested" rather than
// inheriting the delta of an unrelated shot.
//
// The strip is withheld entirely when NOTHING was tested: a row of "—" tiles reads as a
// failed load rather than as an honest absence.

import { fmtT } from "@/components/preflight/types";
import { shotCells } from "@/lib/shot-cells";
import type { EditCandidate, EditCut, EditShot } from "@/lib/edit-cuts";

export default function ShotDiagnosisStrip({
  shots,
  cuts,
  baseScore,
  title,
  candidates = [],
}: {
  shots: EditShot[];
  cuts: EditCut[];
  baseScore: number | null;
  title: string;
  candidates?: EditCandidate[];
}) {
  const cells = shotCells(shots, cuts, candidates);
  const tested = cells.filter((c) => c.delta !== null) as (typeof cells[number] & {
    delta: number;
  })[];
  if (!tested.length) return null;

  const strongest = tested.reduce((a, b) => (b.delta > a.delta ? b : a));
  const untested = cells.length - tested.length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
        <span>
          <span className="text-ink">{title}</span>
          {baseScore !== null ? (
            <>
              {" "}
              · base{" "}
              <span className="tabular-nums text-ink">{Math.round(baseScore)}</span>
            </>
          ) : null}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-neg/70" /> drags it down
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-ink" /> carries it
          </span>
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {cells.map((s, i) => {
          const delta = s.delta;
          const drag = delta !== null && delta > 0;
          return (
            <div key={`${s.start}-${i}`} className="min-w-[72px] flex-1">
              <div
                className={`overflow-hidden rounded-xl border ${
                  drag && (delta as number) >= 3 ? "border-neg/50" : "border-line"
                } bg-fill px-2 py-3 ${delta === null ? "opacity-55" : ""}`}
              >
                <div className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  {fmtT(s.start)}
                </div>
                <div
                  className={`mt-2 tabular-nums text-[18px] leading-none ${
                    delta === null ? "text-ink-3" : drag ? "text-neg" : "text-ink"
                  }`}
                >
                  {delta === null
                    ? "—"
                    : delta > 0
                      ? `+${Math.round(delta)}`
                      : Math.round(delta) === 0
                        ? "±0"
                        : `${Math.round(delta)}`}
                </div>
                <div className="mt-1.5 truncate text-[11px] text-ink-3">
                  {delta === null ? "not tested" : drag ? "cut raises" : "cut lowers"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {strongest.delta > 0 ? (
        <p className="mt-4 max-w-[64ch] text-pretty text-meta text-ink-3">
          Removing the beat from {fmtT(strongest.start)} to {fmtT(strongest.end)} is the
          strongest lift estimated here (
          <span className="tabular-nums">+{Math.round(strongest.delta)}</span>
          ). Open the edit space to watch the rendered candidates.
        </p>
      ) : null}

      {untested > 0 ? (
        <p className="mt-2 max-w-[64ch] text-pretty text-meta text-ink-3">
          {untested} of {cells.length} shots were not tested — the search ranks candidates
          and renders the top few, so a shot with no number here was never scored on its
          own, not scored as neutral.
        </p>
      ) : null}
    </div>
  );
}
