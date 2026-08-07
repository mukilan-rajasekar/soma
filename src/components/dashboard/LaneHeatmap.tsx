// LaneHeatmap — the per-second lanes as shade, one row per lane.
//
// The player's DeltaChart answers "what is each curve doing"; this answers "where are the
// hot seconds" in one glance, which a three-line chart makes the reader hunt for. Each
// cell is the accent token at an opacity scaled by that second's value — accent is a
// chart-only colour in this system, and this is a chart.
//
// NORMALIZED PER LANE, and that is the honesty decision here. The three lanes live in
// different units and ranges, so each row is re-scaled to its OWN min/max before it
// becomes opacity. A shared scale would either flatten the quietest lane into nothing or
// invite reading "attention is darker than surprise" as a claim — a comparison the data
// does not license, and the caption under the grid says so in words.
//
// A SERVER COMPONENT on purpose: this is a pure function of the stored report — no
// playhead, no hover state — and the read-out page should only ship client JS that pays
// for itself in interactivity.
//
// laneValues() accepts both higherOrder (normalized /preflight) and higher_order
// (raw batches.report from process_batch.py), so this component does not re-implement
// the fallback.

import { LANES, laneValues } from "@/components/preflight/lanes";
import {
  fmtT,
  type PreflightAd,
  type PreflightReport,
} from "@/components/preflight/types";
import { BADGE } from "@/lib/readout-phrase";

/** Wide enough that a cell is visibly a second, narrow enough that a 45s cut fits an
 *  860px card before the scroll kicks in. */
const CELL_W = 14;
const ROW_H = 26;
const ROW_GAP = 6;
const AXIS_H = 20;
const TICK_EVERY_S = 5;

type LaneRow = {
  label: string;
  /** Normalized [0,1] per second; null where no sample landed in that second. */
  cells: (number | null)[];
};

/** Samples pooled into one-second bins by mean. The stored arcs are 1 Hz today
 *  (chart.fpsArc), so this is usually the identity — but a report sampled faster must
 *  average rather than let the last sample in a second win. */
function secondBins(
  timestamps: number[],
  values: number[],
  seconds: number,
): (number | null)[] {
  const sums = new Array<number>(seconds).fill(0);
  const counts = new Array<number>(seconds).fill(0);
  for (let i = 0; i < timestamps.length; i += 1) {
    const v = values[i];
    const s = Math.floor(timestamps[i]);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s < 0 || s >= seconds) continue;
    sums[s] += v;
    counts[s] += 1;
  }
  return sums.map((sum, s) => (counts[s] > 0 ? sum / counts[s] : null));
}

export default function LaneHeatmap({
  ad,
  report,
}: {
  ad: PreflightAd;
  report: PreflightReport;
}) {
  // Same scale the charts above plot, so a psc-flipped report stays consistent here.
  const scale = report.chart.defaultScale;
  const seconds = Math.ceil(ad.durationS);
  if (!Number.isFinite(seconds) || seconds <= 0 || ad.timestamps.length === 0) return null;

  const rows: LaneRow[] = [];
  for (const lane of LANES) {
    const values = laneValues(ad, lane.key, scale);
    if (!values || values.length === 0) continue;

    const cells = secondBins(ad.timestamps, values, seconds);
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of cells) {
      if (c === null) continue;
      if (c < lo) lo = c;
      if (c > hi) hi = c;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;

    // A perfectly flat lane has no within-lane contrast to show; normalize it to zero
    // opacity rather than divide by zero or invent a midpoint.
    const range = hi - lo;
    rows.push({
      label: lane.label,
      cells: cells.map((c) => (c === null ? null : range > 0 ? (c - lo) / range : 0)),
    });
  }
  if (rows.length === 0) return null;

  const gridW = seconds * CELL_W;
  const gridH = rows.length * ROW_H + (rows.length - 1) * ROW_GAP;
  // Extra width so the right-most tick label is not clipped by the viewport edge.
  const svgW = gridW + 14;
  const svgH = gridH + AXIS_H;

  const ticks: number[] = [];
  for (let s = 0; s <= seconds; s += TICK_EVERY_S) ticks.push(s);

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Heat by lane</h2>
      <p className="mt-3 max-w-[62ch] text-pretty text-body text-ink-2">
        The same per-second lanes as the chart above, drawn as shade: the darker a cell,
        the higher that lane runs in that second of the film.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-paper p-4">
        <div className="flex items-start gap-3">
          <div className="flex shrink-0 flex-col" style={{ rowGap: ROW_GAP }}>
            {rows.map((row) => (
              <span
                key={row.label}
                className="flex items-center text-[11px] text-ink-3"
                style={{ height: ROW_H }}
              >
                {row.label}
              </span>
            ))}
          </div>

          {/* The grid scrolls inside the card on long cuts; the page never scrolls
              sideways, and the labels above stay put outside the scroll container. */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <svg
              width={svgW}
              height={svgH}
              viewBox={`0 0 ${svgW} ${svgH}`}
              role="img"
              aria-label={`Per-second heat across ${rows.length} lanes over ${fmtT(seconds)}`}
            >
              {rows.map((row, r) => {
                const y = r * (ROW_H + ROW_GAP);
                return (
                  <g key={row.label}>
                    {/* The track behind the cells, so a zero-opacity second still reads
                        as "measured, just cold" rather than as missing data. */}
                    <rect x={0} y={y} width={gridW} height={ROW_H} rx={4} fill="var(--color-fill)" />
                    {row.cells.map((norm, s) =>
                      norm === null ? null : (
                        <rect
                          key={s}
                          x={s * CELL_W + 0.5}
                          y={y + 0.5}
                          width={CELL_W - 1}
                          height={ROW_H - 1}
                          fill="var(--color-accent)"
                          fillOpacity={norm}
                        />
                      ),
                    )}
                  </g>
                );
              })}

              {ticks.map((s) => (
                <g key={s}>
                  <line
                    x1={s * CELL_W}
                    y1={gridH + 2}
                    x2={s * CELL_W}
                    y2={gridH + 6}
                    stroke="var(--color-line-2)"
                  />
                  <text
                    x={s * CELL_W}
                    y={gridH + AXIS_H - 3}
                    textAnchor={s === 0 ? "start" : "middle"}
                    fontSize={10}
                    fill="var(--color-ink-3)"
                    className="tabular-nums"
                  >
                    {fmtT(s)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      <p className="mt-3 max-w-[64ch] text-pretty text-meta text-ink-3">
        Shade is the model&rsquo;s predicted response re-scaled within each lane to its own
        range, so it compares seconds within a row, never one lane against another — and it
        is not validated against outcomes.
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-ink-3">{BADGE}</p>
    </section>
  );
}
