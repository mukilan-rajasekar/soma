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

  if (ad.scores.hook < 40) {
    lines.push(
      `The first ${HOOK_SECONDS} seconds are the softest part of this cut against the rest of the run (hook ${Math.round(ad.scores.hook)}).`,
    );
  } else if (ad.scores.hook >= 70) {
    lines.push(
      `The opening holds: hook scores ${Math.round(ad.scores.hook)} against the other cuts in this run.`,
    );
  }

  if ((ad.flags ?? []).includes("no_identity_text")) {
    lines.push("The brand name was not found in the opening seconds.");
  } else if (ad.scores.clarity < 40) {
    lines.push(
      `Clarity is weak (${Math.round(ad.scores.clarity)}): the brief may not be landing on screen or out loud.`,
    );
  }

  if (report.scoring?.scale === "within_item" || report.ads.length < 2) {
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
