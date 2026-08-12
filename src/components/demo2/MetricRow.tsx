"use client";

// The four headline metrics, the spec's minimum bar for a report worth paying for:
// Soma Score, Hook, Hold, Comprehension. Each number counts up on reveal and carries a
// plain-english line underneath — raw numbers mean nothing on their own (the spec's
// rule). The Soma Score reads larger; the three drivers sit beside it. Numbers are
// tabular-nums sans (never mono, per the design system).

import { ON_SCREEN, useAnimeClock, useReveal } from "./useReveal";
import type { Reads, Scores } from "./types";

function CountUp({ value, active, big }: { value: number; active: boolean; big?: boolean }) {
  const p = useAnimeClock(active, big ? 1100 : 850);
  const shown = Math.round(value * p);
  // aria-label carries the real value; the animating digits are aria-hidden so a screen
  // reader never catches the count mid-flight (or the literal pre-animation "0").
  return (
    <span role="img" aria-label={String(value)} className={`tabular-nums font-medium text-ink ${big ? "text-[54px] leading-none" : "text-[30px] leading-none"}`}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}

function Bar({ value, active, tone = "ink" }: { value: number; active: boolean; tone?: "ink" | "accent" }) {
  const p = useAnimeClock(active, 900);
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className={`h-full w-full rounded-full ${tone === "accent" ? "bg-accent-2" : "bg-ink"}`}
        style={{ transform: `scaleX(${(value * p) / 100})`, transformOrigin: "left" }}
      />
    </div>
  );
}

type Props = {
  scores: Scores;
  reads: Reads;
  active: boolean;
  hookTone?: boolean; // colour the hook bar slate to tie it to the ventral/surprise story
};

export default function MetricRow({ scores, reads, active, hookTone }: Props) {
  // Own arrival, not the section's: the row sits ~310px below §11's top edge, so all four
  // count-ups finished while the tiles were still a sliver at the bottom of the frame.
  const [ref, framed] = useReveal<HTMLDivElement>(ON_SCREEN);
  const on = active && framed;
  return (
    <div ref={ref} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Soma score — the composite, larger */}
      <div className="rounded-2xl border border-line bg-fill p-4">
        <div className="text-[12px] uppercase tracking-[0.1em] text-ink-3">Soma score</div>
        <div className="mt-2 flex items-baseline gap-1">
          <CountUp value={scores.soma} active={on} big />
          <span className="text-[15px] text-ink-3">/100</span>
        </div>
        <Bar value={scores.soma} active={on} />
        <p className="mt-3 text-[13.5px] leading-[1.5] text-ink-2">{reads.soma}</p>
      </div>

      <Metric label="Hook" suffix="/100" value={scores.hook} read={reads.hook} active={on} tone={hookTone ? "accent" : "ink"} />
      <Metric label="Hold" suffix="% of ad" value={scores.hold} read={reads.hold} active={on} altValue={scores.holdPct} />
      <Metric label="Comprehension" suffix="/100" value={scores.comprehension} read={reads.comprehension} active={on} tone="accent" />
    </div>
  );
}

function Metric({
  label, suffix, value, read, active, tone = "ink", altValue,
}: {
  label: string; suffix: string; value: number; read: string; active: boolean;
  tone?: "ink" | "accent"; altValue?: number;
}) {
  const shown = altValue ?? value;
  return (
    <div className="rounded-2xl border border-line bg-fill p-4">
      <div className="text-[12px] uppercase tracking-[0.1em] text-ink-3">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <CountUp value={shown} active={active} />
        <span className="text-[13px] text-ink-3">{suffix}</span>
      </div>
      {/* The bar has to plot the number printed above it. It used to plot `value` while the
          CountUp printed `altValue ?? value`, and those are different quantities: the Hold
          card passes value={scores.hold} (82) with altValue={scores.holdPct} (59), so the
          card read "59% of ad" over a bar filled to 82%. Geometry and number now agree. */}
      <Bar value={shown} active={active} tone={tone} />
      <p className="mt-3 text-[13.5px] leading-[1.5] text-ink-2">{read}</p>
    </div>
  );
}
