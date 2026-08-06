// HookCallout — the first three seconds, stated next to the component score.
//
// Demo § hook and /r HookCompare make this the argument of a whole section. On a single-ad
// Studio page there is nothing to compare against, so the same claim is a callout: the
// window length, the weight, and this cut's hook percentile.

import { HOOK_SECONDS } from "@/components/preflight/lanes";
import type { PreflightScores } from "@/components/preflight/types";

export default function HookCallout({
  scores,
  weight,
  ofN,
}: {
  scores: PreflightScores;
  weight: number;
  ofN: number;
}) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
        The first {HOOK_SECONDS} seconds
      </h2>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6 rounded-2xl border border-line bg-fill px-5 py-5">
        <div className="min-w-0 max-w-[52ch]">
          <p className="text-pretty text-body text-ink-2">
            Worth{" "}
            <span className="tabular-nums text-ink">{Math.round(weight * 100)}%</span> of
            the Soma score
            {ofN >= 2
              ? ", measured as ventral surprise against the other cuts in this run."
              : ", measured against this cut's own timeline when the run has no siblings."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular-nums text-[36px] leading-none text-ink">
            {Math.round(scores.hook)}
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.1em] text-ink-3">Hook</div>
        </div>
      </div>
    </section>
  );
}
