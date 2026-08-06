// BriefEcho — the message we scored clarity against.
//
// Lifted from ResultReport's brief block so a single-ad Studio page can show the same
// honesty without mounting the whole batch report.

import type { PreflightReport } from "@/components/preflight/types";

export default function BriefEcho({ report }: { report: PreflightReport }) {
  const message = report.batch?.message;
  if (!message) return null;

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
        What we scored the message against
      </h2>
      <p className="mt-3 max-w-[62ch] text-pretty text-body text-ink-2">
        Comprehension is checked against these words. If any of this is wrong, that part of
        the score is measuring the wrong thing.
      </p>
      <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        {(
          [
            ["Brand", message.brandName],
            ["Product", message.productName],
            ["Problem", message.primaryProblem],
            ["Promise", message.primaryBenefit],
            ["Offer", message.offer],
            ["Call to action", message.desiredCta],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="bg-paper p-4">
            <dt className="text-[12px] uppercase tracking-[0.07em] text-ink-3">{k}</dt>
            <dd className="mt-1.5 text-body text-ink">
              {v || <span className="text-ink-3">not given</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
