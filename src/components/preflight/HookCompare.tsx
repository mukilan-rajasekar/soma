"use client";

// The hook section's figure: the ventral (surprise) lane of the batch's BEST cut against
// its WORST, on one axis, with the 3-second hook window shaded.
//
// Two curves rather than five on purpose — this section makes a single claim ("the first
// three seconds decide it") and two lines are the smallest figure that can carry it. The
// batch comparison above already shows all five.
//
// Colour is the same rank encoding as every other chart on the page: green is the
// top-ranked cut, red the bottom one. Dash and an end-of-curve rank badge repeat the
// distinction so it survives greyscale and deuteranopia.

import { useMemo } from "react";

import DeltaChart, { type ChartSeries } from "./DeltaChart";
import Stat from "../demo2/Stat";
import { useAnimeClock } from "../demo2/useReveal";
import { HOOK_SECONDS, laneDomain, laneValues } from "./lanes";
import { fmtDelta, type ArcScale, type PreflightAd, type PreflightReport } from "./types";

type Props = { report: PreflightReport; active: boolean };

/** Mean of the lane inside the hook window. Prefers the script's own figure (the exact
 *  number the hook score is computed from) and falls back to averaging the samples that
 *  fall in the window, so the legend never states a value the report didn't produce. */
function hookMean(ad: PreflightAd, values: number[], scale: ArcScale): number | null {
  // features.* are raw-scale figures; on the psc axis they'd be in the wrong units.
  const own = scale === "raw" ? ad.features?.hookSalventattn : undefined;
  if (typeof own === "number" && Number.isFinite(own)) return own;
  const inWindow = values.filter((_, i) => ad.timestamps[i] <= HOOK_SECONDS);
  if (!inWindow.length) return null;
  return inWindow.reduce((a, b) => a + b, 0) / inWindow.length;
}

export default function HookCompare({ report, active }: Props) {
  const progress = useAnimeClock(active, 1200);
  const scale = report.chart.defaultScale;

  const best = report.ads.find((a) => a.id === report.bestId);
  const worst = report.ads.find((a) => a.id === report.worstId);

  const pair = useMemo(
    () =>
      ([
        { ad: best, role: "best" as const, colorToken: "pos" as const, dash: undefined, cssVar: "var(--color-pos)", border: "solid" as const },
        { ad: worst, role: "worst" as const, colorToken: "neg" as const, dash: [6, 4], cssVar: "var(--color-neg)", border: "dashed" as const },
      ]).flatMap((p) => {
        if (!p.ad) return [];
        const values = laneValues(p.ad, "surprise", scale);
        if (!values) return [];
        return [{
          ...p,
          ad: p.ad as PreflightAd,
          values,
          hookMean: hookMean(p.ad, values, scale),
        }];
      }),
    [best, worst, scale],
  );

  const series = useMemo<ChartSeries[]>(
    () =>
      pair.map((p) => ({
        id: p.ad.id,
        label: p.ad.title,
        timestamps: p.ad.timestamps,
        values: p.values,
        colorToken: p.colorToken,
        width: 2.4,
        dash: p.dash ? [...p.dash] : undefined,
        z: p.role === "best" ? 3 : 2,
        endLabel: String(p.ad.rank),
      })),
    [pair],
  );

  // Domain over the whole batch's ventral lane, not just these two, so this chart is
  // readable against the batch comparison above rather than on its own private scale.
  const yDomain = useMemo<[number, number]>(
    () => laneDomain(report.ads, ["surprise"], scale),
    [report.ads, scale],
  );
  const xDomain = useMemo<[number, number]>(
    () => [0, Math.max(...pair.map((p) => p.ad.durationS), 1)],
    [pair],
  );

  if (pair.length < 2) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-line bg-fill px-6">
        <p className="max-w-[44ch] text-center text-[12px] leading-[1.6] text-ink-3">
          The ventral lane is missing for this run, so the hook comparison is withheld
          rather than drawn from the attention curve instead.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <DeltaChart
        series={series}
        yDomain={yDomain}
        xDomain={xDomain}
        hookSeconds={HOOK_SECONDS}
        progress={progress}
        height={240}
        unit={`Ventral salience network · ${report.chart.units[scale]}`}
        ariaLabel={`Ventral surprise response of the batch's best and worst cut, on one axis`}
      />

      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-[12.5px] leading-[1.5] text-ink-3 sm:grid-cols-2">
        {pair.map((p) => (
          <div key={p.ad.id} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[6px] inline-block h-0 w-5 shrink-0"
              style={{ borderTopWidth: 2.5, borderTopStyle: p.border, borderTopColor: p.cssVar }}
            />
            <span>
              <b className="font-medium text-ink">{p.ad.title}</b>{" "}
              <span>· rank {p.ad.rank} of {report.ads.length}</span>
              <br />
              <span>
                {p.hookMean == null
                  ? "hook window not measurable"
                  : `hook window averages ${fmtDelta(p.hookMean, 0.01)} vs baseline`}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {pair.map((p) => (
          <Stat
            key={p.ad.id}
            big
            value={Math.round(p.ad.scores.hook)}
            suffix="/100"
            label={`Hook · ${p.ad.title}`}
            sub={`rank ${p.ad.rank} · ${Math.round(report.weights.hook * 100)}% of the total`}
            tone={p.role === "best" ? "pos" : "neg"}
            active={active}
          />
        ))}
        <div className="rounded-2xl border border-line bg-paper p-5 text-[12.5px] leading-[1.6] text-ink-2">
          Same product, same length, same batch. The two cuts separate inside the first
          three seconds — and the hook score is measured on exactly that window, before the
          rest of the ad gets a chance to recover it.
        </div>
      </div>
    </div>
  );
}
