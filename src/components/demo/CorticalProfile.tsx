// The "where it lights up" figure for the /demo read-out. A static (non-timeline)
// bar panel: mean predicted activation per brain system for the whole clip. This is
// the honest thesis in one chart — strong in attention & language, faint in the
// emotion cortex — so it reads next to the brain viz, not on the shared clock.
//
// Design system: near-monochrome; the ONE slate/teal accent is reserved for data,
// so STRONG lanes paint accent and the emotion DEAD zone paints ink-3 (grey) — the
// contrast IS the point. The whole-cortex baseline is a hairline tick.

import type { Arc } from "@/lib/arc";

export default function CorticalProfile({ arc }: { arc: Arc }) {
  const prof = arc.roi_profile;
  if (!prof || !prof.length) return null;

  const base = arc.roi_baseline ?? 0;
  const max = Math.max(...prof.map((p) => p.value), base) * 1.08 || 1;

  return (
    <div className="rounded-2xl border border-line bg-fill p-3.5">
      <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.13em] text-ink-3">
        <span>Cortical network profile</span>
        <span>where it lights up</span>
      </div>
      <div className="flex flex-col gap-[7px]">
        {prof.map((p) => (
          <div
            key={p.net}
            className="grid grid-cols-[84px_1fr_42px] items-center gap-2 text-[11px]"
          >
            <span className="truncate text-right text-ink-2">
              {p.net}
              {p.strong ? "" : <span className="text-ink-3"> · dead</span>}
            </span>
            <span className="relative block h-2.5 rounded-sm border border-line bg-paper">
              <i
                className="absolute inset-y-0 left-0 rounded-[1px]"
                style={{
                  width: `${Math.max(2, (p.value / max) * 100)}%`,
                  background: p.strong ? "var(--color-accent)" : "var(--color-ink-3)",
                }}
              />
              <span
                className="absolute -inset-y-[3px] z-[2] w-px bg-ink-3"
                style={{ left: `${(base / max) * 100}%` }}
                aria-hidden="true"
              />
            </span>
            <span className="text-right tabular-nums text-ink">{p.value.toFixed(3)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 border-t border-line pt-2.5 font-mono text-[10px] leading-[1.6] tracking-[0.02em] text-ink-3">
        Mean activation per brain system. Strong in attention &amp; language, faint in the
        emotion cortex (&#9474;&nbsp;= whole-cortex baseline) &mdash; shown, not hidden.
      </div>
    </div>
  );
}
