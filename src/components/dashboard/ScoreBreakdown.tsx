// ScoreBreakdown — the three components behind the headline number.
//
// The weights are read from the report rather than hard-coded, because they are a property
// of the run that produced it (report.weights, written by demo/process_batch.py) and a
// second copy here would be a number that silently disagrees with the arithmetic.
//
// Bars, not a chart. Each component is a percentile in 0..100 against the other cuts in the
// same batch, so the honest visual is a proportion of a fixed track — the same 1px
// `bg-line` track with an ink fill that VideoRow and the demo's RunnerRow already use. A
// line chart would imply a series over something, and there is no axis here.

import type { PreflightScores } from "@/components/preflight/types";

const COMPONENTS = [
  {
    key: "hook" as const,
    label: "Hook",
    blurb: "How hard the first three seconds pull, against the other cuts in this run.",
  },
  {
    key: "processing" as const,
    label: "Processing",
    blurb: "How much of the film holds above the model's baseline rather than sagging.",
  },
  {
    key: "clarity" as const,
    label: "Clarity",
    blurb: "Whether the brand and the offer land, and how early they are named.",
  },
];

export default function ScoreBreakdown({
  scores,
  weights,
}: {
  scores: PreflightScores;
  weights: { hook: number; processing: number; clarity: number };
}) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
        What makes up the score
      </h2>

      <div className="mt-5 flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {COMPONENTS.map((component) => {
          const value = scores[component.key];
          const weight = weights[component.key];
          return (
            <div key={component.key} className="bg-paper p-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-ui font-medium text-ink">{component.label}</span>
                <span className="shrink-0 text-meta text-ink-3">
                  <span className="tabular-nums">{Math.round(weight * 100)}%</span> of the
                  score
                </span>
              </div>

              <div className="mt-2.5 flex items-center gap-3">
                <span className="block h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-ink"
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </span>
                <span className="w-[34px] shrink-0 text-right tabular-nums text-ui text-ink">
                  {Math.round(value)}
                </span>
              </div>

              <p className="mt-2 max-w-[62ch] text-pretty text-meta text-ink-3">
                {component.blurb}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
