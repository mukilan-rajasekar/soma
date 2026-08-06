// ShotDiagnosisStrip — per-shot remove deltas as a filmstrip, without demo theater.
//
// Demo ShotDiagnosis carries leave-one-out {without, delta} on every shot. Customer
// edit_runs.result.shots are usually BOUNDARIES ONLY (ingest/seed). Deltas come from, in
// order: (1) shot.delta if present, (2) result.candidates kind "remove" merged in
// loadEditRuns, (3) rendered edit_cuts with kind "remove" / "Drop shot …" labels.
// A strip with no deltas at all is withheld — empty "—" tiles read as a failed load.

import { fmtT } from "@/components/preflight/types";
import type { EditCandidate, EditCut, EditShot } from "@/lib/edit-cuts";

type Cell = {
  start: number;
  end: number;
  delta: number | null;
  label: string;
};

function isRemoveCut(c: { kind: string; label: string }): boolean {
  return (
    c.kind === "remove" ||
    c.kind === "drop_shot" ||
    c.kind === "remove_shot" ||
    /drop shot/i.test(c.label)
  );
}

function cellsFrom(
  shots: EditShot[],
  cuts: EditCut[],
  candidates: EditCandidate[],
): Cell[] {
  if (shots.some((s) => s.delta !== null)) {
    return shots.map((s, i) => ({
      start: s.start,
      end: s.end,
      delta: s.delta,
      label: `Shot ${i + 1}`,
    }));
  }

  const removeCuts = [
    ...cuts.filter(isRemoveCut),
    ...candidates
      .filter((c) => c.kind === "remove")
      .map(
        (c, i): EditCut => ({
          position: -1 - i,
          kind: c.kind,
          label: c.label,
          confidence: c.measured ? "measured" : "estimate",
          durationS: null,
          estScore: c.estScore,
          estDelta: c.estDelta,
          measured: c.measured,
          videoUrl: null,
          posterUrl: null,
        }),
      ),
  ];

  if (shots.length && removeCuts.length) {
    return shots.map((s, i) => {
      const byRange = removeCuts.find((c) => {
        const m = c.label.match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
        if (!m) return false;
        return Math.abs(Number(m[1]) - s.start) < 0.05 && Math.abs(Number(m[2]) - s.end) < 0.05;
      });
      const cut = byRange ?? removeCuts[i];
      return {
        start: s.start,
        end: s.end,
        delta: cut?.estDelta ?? null,
        label: cut?.label ?? `Shot ${i + 1}`,
      };
    });
  }

  if (removeCuts.length) {
    return removeCuts.map((c, i) => {
      const m = c.label.match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
      const start = m ? Number(m[1]) : i;
      const end = m ? Number(m[2]) : i + 1;
      return {
        start: Number.isFinite(start) ? start : i,
        end: Number.isFinite(end) ? end : i + 1,
        delta: c.estDelta,
        label: c.label,
      };
    });
  }

  return [];
}

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
  const cells = cellsFrom(shots, cuts, candidates).filter((c) => c.delta !== null);
  if (!cells.length) return null;

  const withDelta = cells as (Cell & { delta: number })[];
  const worst = withDelta.reduce((a, b) => (b.delta > a.delta ? b : a));

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
          const delta = s.delta as number;
          const drag = delta > 0;
          return (
            <div key={`${s.start}-${i}`} className="min-w-[72px] flex-1">
              <div
                className={`overflow-hidden rounded-xl border ${
                  drag && delta >= 3 ? "border-neg/50" : "border-line"
                } bg-fill px-2 py-3`}
              >
                <div className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  {fmtT(s.start)}
                </div>
                <div
                  className={`mt-2 tabular-nums text-[18px] leading-none ${
                    drag ? "text-neg" : "text-ink"
                  }`}
                >
                  {delta > 0
                    ? `+${Math.round(delta)}`
                    : Math.round(delta) === 0
                      ? "±0"
                      : `${Math.round(delta)}`}
                </div>
                <div className="mt-1.5 truncate text-[11px] text-ink-3">
                  {drag ? "cut raises" : "cut lowers"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {worst.delta > 0 ? (
        <p className="mt-4 max-w-[64ch] text-pretty text-meta text-ink-3">
          Removing the beat from {fmtT(worst.start)} to {fmtT(worst.end)} is the strongest
          lift estimated here (
          <span className="tabular-nums">+{Math.round(worst.delta)}</span>
          ). Open the edit space to watch the rendered candidates.
        </p>
      ) : null}
    </div>
  );
}
