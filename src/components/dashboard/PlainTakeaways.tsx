// PlainTakeaways — DESIGN-SYSTEM "In plain english" row under the instruments.
//
// One short sentence per actionable finding. Derived only from data already on the ad /
// report so it cannot invent a diagnosis the arc did not support.

import { fmtT, type PreflightAd, type PreflightReport } from "@/components/preflight/types";
import { HOOK_SECONDS } from "@/components/preflight/lanes";

export default function PlainTakeaways({
  ad,
  report,
}: {
  ad: PreflightAd;
  report: PreflightReport;
}) {
  const lines: string[] = [];

  const worst = [...ad.weakSpots].sort((a, b) => b.secs - a.secs)[0];
  if (worst) {
    lines.push(
      `Attention sags hardest from ${fmtT(worst.start)} to ${fmtT(worst.end)} (${worst.secs.toFixed(1)}s below this cut's own median).`,
    );
  }

  // WHAT THE HOOK NUMBER IS COMPARED AGAINST depends on the cohort, so the sentence has
  // to say the right thing for both. A batch score is a percentile against the other ads
  // in the run; a within-item score is the cut against its own timeline, which is what a
  // single ad necessarily gets (demo/process_batch.py falls back below three ads).
  // These lines used to claim "against the other cuts in this run" unconditionally, while
  // the closing line below said "not against other ads" — so a single-ad run, the flow
  // this product now leads with, contradicted itself on screen.
  const withinItem = report.scoring?.scale === "within_item" || report.ads.length < 2;

  if (ad.scores.hook < 40) {
    lines.push(
      withinItem
        ? `The first ${HOOK_SECONDS} seconds are the softest stretch of this cut's own timeline (hook ${Math.round(ad.scores.hook)}).`
        : `The first ${HOOK_SECONDS} seconds are the softest part of this cut against the rest of the run (hook ${Math.round(ad.scores.hook)}).`,
    );
  } else if (ad.scores.hook >= 70) {
    lines.push(
      withinItem
        ? `The opening holds: hook scores ${Math.round(ad.scores.hook)} against the rest of this cut's own timeline.`
        : `The opening holds: hook scores ${Math.round(ad.scores.hook)} against the other cuts in this run.`,
    );
  }

  if ((ad.flags ?? []).includes("no_identity_text")) {
    lines.push("The brand name was not found in the opening seconds.");
  } else if (ad.scores.clarity < 40) {
    lines.push(
      `Clarity is weak (${Math.round(ad.scores.clarity)}): the brief may not be landing on screen or out loud.`,
    );
  }

  if (withinItem) {
    lines.push(
      "This number is within-item: the cut ranked against its own timeline, not against other ads.",
    );
  }

  if (!lines.length) return null;

  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
        In plain english
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {lines.map((line) => (
          <li
            key={line}
            className="max-w-[68ch] text-pretty border-l-2 border-line pl-4 text-body text-ink-2"
          >
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
