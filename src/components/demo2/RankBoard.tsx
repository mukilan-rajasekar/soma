"use client";

// Section 4 — "videos in → ranked report out". The batch of ads sorted by Soma score,
// each row breaking into its hook / hold / comprehension drivers so the ranking is
// legible, not a black box: you can see WHY an ad lands where it does. Bars race in on
// reveal, staggered top-to-bottom, and every number counts up alongside its own bar. The
// top row is the batch winner.
//
// ONE clock for the whole board, not one per bar. Every MiniBar used to call useAnimeClock
// itself, so a ten-row board ran thirty concurrent rAF loops, each setting state on its own
// component every frame — thirty renders per frame on the section that is on screen while
// the page is being screen-recorded. A single clock at the top and plain arithmetic per cell
// gives byte-identical motion for one loop and one render.

import { useAnimeClock } from "./useReveal";
import type { Ad } from "./types";

const RACE_MS = 700; // how long any single bar takes
const STAGGER_MS = 60; // per-row offset down the board

// Row `i`'s own 0..1 progress, carved out of the shared clock.
const rowP = (p: number, total: number, i: number) =>
  Math.max(0, Math.min(1, (p * total - i * STAGGER_MS) / RACE_MS));

function MiniBar({ p, value, tone }: { p: number; value: number; tone: "ink" | "accent" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className={tone === "accent" ? "h-full w-full rounded-full bg-accent-2" : "h-full w-full rounded-full bg-ink"}
        style={{ transform: `scaleX(${(p * value) / 100})`, transformOrigin: "left" }}
      />
    </div>
  );
}

export default function RankBoard({ ads, active }: { ads: Ad[]; active: boolean }) {
  const total = RACE_MS + Math.max(0, ads.length - 1) * STAGGER_MS;
  const p = useAnimeClock(active, total);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="grid grid-cols-[28px_1fr_46px] items-center gap-3 border-b border-line bg-fill px-4 py-3 text-[11.5px] uppercase tracking-[0.08em] text-ink-3 sm:grid-cols-[28px_1.4fr_2.4fr_50px]">
        <span>#</span>
        <span>Ad</span>
        <span className="hidden sm:block">Hook · Hold · Comprehension</span>
        <span className="text-right">Score</span>
      </div>
      {ads.map((a, i) => {
        const winner = i === 0;
        const rp = rowP(p, total, i);
        // Rounded off the row's own progress, so the digits climb in step with the bar beside
        // them. Printing the final number over a bar still filling was the one thing on this
        // board that gave away that the motion was decoration rather than the measurement
        // arriving.
        const n = (v: number) => Math.round(v * rp);
        return (
          <div
            key={a.id}
            className={`grid grid-cols-[28px_1fr_46px] items-center gap-3 border-b border-line px-4 py-3 sm:grid-cols-[28px_1.4fr_2.4fr_50px] ${winner ? "bg-fill" : ""}`}
            style={{
              opacity: active ? 1 : 0,
              transform: active ? "none" : "translateY(6px)",
              transition: `opacity .5s ${i * STAGGER_MS}ms, transform .5s ${i * STAGGER_MS}ms`,
            }}
          >
            <span className={`tabular-nums text-[14px] ${winner ? "font-semibold text-ink" : "text-ink-3"}`}>{a.rank}</span>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">{a.title}</div>
              {/* Was `{a.brand}`, which printed the same account name on all ten rows of a
                  board whose own premise made it redundant — the section now names the
                  account once, above the board. Below the `sm` breakpoint the bar column is
                  hidden, so the section's lede ("every row breaks into its hook, hold and
                  comprehension drivers") was a promise the mobile layout silently broke.
                  This line is the mobile-only fallback for that promise; the bars take over
                  at `sm`. */}
              <div className="truncate text-[12px] tabular-nums text-ink-3 sm:hidden">
                {n(a.scores.hook)} · {n(a.scores.hold)} · {n(a.scores.comprehension)}
                <span className="ml-1 tracking-[0.04em]">hook·hold·comp</span>
              </div>
            </div>
            <div className="hidden grid-cols-3 gap-2.5 sm:grid">
              <div>
                <MiniBar p={rp} value={a.scores.hook} tone="accent" />
                <div className="mt-1.5 text-[11px] uppercase tracking-[0.05em] tabular-nums text-ink-3">hook {n(a.scores.hook)}</div>
              </div>
              <div>
                <MiniBar p={rp} value={a.scores.hold} tone="ink" />
                <div className="mt-1.5 text-[11px] uppercase tracking-[0.05em] tabular-nums text-ink-3">hold {n(a.scores.hold)}</div>
              </div>
              <div>
                <MiniBar p={rp} value={a.scores.comprehension} tone="accent" />
                <div className="mt-1.5 text-[11px] uppercase tracking-[0.05em] tabular-nums text-ink-3">comp {n(a.scores.comprehension)}</div>
              </div>
            </div>
            <span className={`text-right tabular-nums ${winner ? "text-[20px] font-semibold text-ink" : "text-[16px] text-ink-2"}`}>
              {n(a.scores.soma)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
