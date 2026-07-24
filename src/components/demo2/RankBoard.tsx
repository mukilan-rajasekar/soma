"use client";

// Section 4 — "videos in → ranked report out". The batch of ads sorted by Soma score,
// each row breaking into its hook / hold / comprehension drivers so the ranking is
// legible, not a black box: you can see WHY an ad lands where it does. Bars race in on
// reveal, staggered top-to-bottom. The top row is the batch winner.

import { useAnimeClock } from "./useReveal";
import type { Ad } from "./types";

function MiniBar({ value, active, delay, tone }: { value: number; active: boolean; delay: number; tone: "ink" | "accent" }) {
  const p = useAnimeClock(active, 700 + delay);
  const eff = Math.max(0, (p - delay / (700 + delay)) / (1 - delay / (700 + delay)));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={tone === "accent" ? "h-full rounded-full bg-accent-2" : "h-full rounded-full bg-ink"} style={{ width: `${value * Math.min(1, Math.max(0, eff))}%` }} />
    </div>
  );
}

export default function RankBoard({ ads, active }: { ads: Ad[]; active: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="grid grid-cols-[28px_1fr_46px] items-center gap-3 border-b border-line bg-fill px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-ink-3 sm:grid-cols-[28px_1.4fr_2.4fr_50px]">
        <span>#</span>
        <span>Ad</span>
        <span className="hidden sm:block">Hook · Hold · Comprehension</span>
        <span className="text-right">Score</span>
      </div>
      {ads.map((a, i) => {
        const winner = i === 0;
        return (
          <div
            key={a.id}
            className={`grid grid-cols-[28px_1fr_46px] items-center gap-3 border-b border-line px-4 py-3 sm:grid-cols-[28px_1.4fr_2.4fr_50px] ${winner ? "bg-fill" : ""}`}
            style={{
              opacity: active ? 1 : 0,
              transform: active ? "none" : "translateY(6px)",
              transition: `opacity .5s ${i * 60}ms, transform .5s ${i * 60}ms`,
            }}
          >
            <span className={`tabular-nums text-[13px] ${winner ? "font-semibold text-ink" : "text-ink-3"}`}>{a.rank}</span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-ink">{a.title}</div>
              <div className="truncate text-[11px] text-ink-3">{a.brand}</div>
            </div>
            <div className="hidden grid-cols-3 gap-2.5 sm:grid">
              <div>
                <MiniBar value={a.scores.hook} active={active} delay={i * 60} tone="accent" />
                <div className="mt-1 text-[9px] uppercase tracking-[0.06em] text-ink-3">hook {a.scores.hook}</div>
              </div>
              <div>
                <MiniBar value={a.scores.hold} active={active} delay={i * 60} tone="ink" />
                <div className="mt-1 text-[9px] uppercase tracking-[0.06em] text-ink-3">hold {a.scores.hold}</div>
              </div>
              <div>
                <MiniBar value={a.scores.comprehension} active={active} delay={i * 60} tone="accent" />
                <div className="mt-1 text-[9px] uppercase tracking-[0.06em] text-ink-3">comp {a.scores.comprehension}</div>
              </div>
            </div>
            <span className={`text-right tabular-nums ${winner ? "text-[19px] font-semibold text-ink" : "text-[16px] text-ink-2"}`}>{a.scores.soma}</span>
          </div>
        );
      })}
    </div>
  );
}
