"use client";

// One number, big, with a label above and a caption below — the stat tile used by the demo
// page's hook and database beats and by /preflight's hook comparison.
//
// There used to be a SECOND, private copy of this inside DemoScrollPage that shadowed the
// import site. The two drifted on type scale, on whether the number counts up, and on which
// tones existed at all — which is why the polarity bars could never be switched on from the
// page: the copy that actually rendered on /demo only knew "ink" and "accent". One copy now.
// The larger type scale and the count-up won, because both routes exist to be screen-recorded
// and watched at ~640px wide, where a 10px label and a 4px bar disappear, and a number that
// simply appears next to a self-drawing arc reads as a static image dropped into a moving page.

import { useAnimeClock } from "./useReveal";

export default function Stat({
  value,
  suffix,
  label,
  sub,
  tone,
  active,
  big,
  baseline,
}: {
  value: number;
  suffix: string;
  label: string;
  sub: string;
  // `pos`/`neg` are the polarity pair: they are only honest on a 0–100 quantity, because the
  // bar length below is value/100. A tone on a count (1,500 ads) draws a permanently full bar,
  // which encodes nothing — leave those untoned.
  tone?: "ink" | "accent" | "pos" | "neg";
  active: boolean;
  big?: boolean;
  // Reference point on the same 0–100 track, drawn as a notch the fill has to clear. Turns a
  // lone percentage into a measured gain. Only meaningful when `value` is itself 0–100.
  baseline?: number;
}) {
  // Counts up rather than fading in at full value, which is what every other number on the
  // page does (MetricRow, RankBoard, the studios). Rounded off the eased clock, so the last
  // digit settles.
  const p = useAnimeClock(active, big ? 1200 : 900);
  const bar =
    tone === "accent" ? "bg-accent-2"
    : tone === "pos" ? "bg-pos"
    : tone === "neg" ? "bg-neg"
    : "bg-ink";
  return (
    <div className="rounded-2xl border border-line bg-fill p-5">
      <div className="text-[12px] uppercase tracking-[0.1em] text-ink-3">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={`font-medium tabular-nums leading-none text-ink ${big ? "text-[44px]" : "text-[28px]"}`}
        >
          {Math.round(value * p).toLocaleString()}
        </span>
        <span className="text-[16px] text-ink-3">{suffix}</span>
      </div>
      <div className={`relative mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line ${big && tone ? "" : "hidden"}`}>
        {/* grow via transform: scaleX (compositor-only) rather than animating width, which
            would trigger layout on every frame. transform-origin left so it fills L→R. */}
        <div
          className={`h-full w-full rounded-full ${bar}`}
          style={{ transform: active ? `scaleX(${Math.min(100, value) / 100})` : "scaleX(0)", transformOrigin: "left", transition: "transform .9s" }}
        />
        {/* The baseline notch is paper, not a new colour: it cuts the fill rather than adding
            a mark on top of it, so the tile still carries exactly one hue. It lands after the
            fill has finished growing, so the reader watches the bar clear the mark. */}
        {baseline == null ? null : (
          <span
            aria-hidden="true"
            className="absolute top-0 h-full w-1 bg-paper"
            style={{ left: `calc(${Math.min(100, baseline)}% - 2px)`, opacity: active ? 1 : 0, transition: "opacity .35s .85s" }}
          />
        )}
      </div>
      <div className="mt-2 text-[12.5px] text-ink-3">{sub}</div>
    </div>
  );
}
