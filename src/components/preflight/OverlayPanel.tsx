"use client";

// Compare across the batch — every cut on one axis. The point of the whole page: same
// model, same preprocessing, same run, same y-axis, so the shape of the batch is visible
// before any single number is.
//
// The metric picker switches which cortical lane is being compared. Colour still encodes
// RANK (green = best, red = worst, hairlines between), so switching metrics answers "does
// the winner win on this one too?" — which is the interesting question, and the reason the
// ranking never re-sorts underneath the reader.

import { useMemo, useState } from "react";

import AdList from "./AdList";
import DeltaChart, { type ChartSeries } from "./DeltaChart";
import { useAnimeClock } from "../demo2/useReveal";
import { HOOK_SECONDS, LANES, laneDomain, laneValues, type LaneKey } from "./lanes";
import { roleStyle } from "./tokens";
import { roleOf, type PreflightReport } from "./types";

type Props = {
  report: PreflightReport;
  selectedId: string;
  onSelect: (id: string) => void;
  active: boolean;
};

export default function OverlayPanel({ report, selectedId, onSelect, active }: Props) {
  const progress = useAnimeClock(active, 1400);
  const scale = report.chart.defaultScale;
  const [metric, setMetric] = useState<LaneKey>("attention");
  const lane = LANES.find((l) => l.key === metric) ?? LANES[0];

  const ordered = useMemo(
    () => report.order.map((id) => report.ads.find((a) => a.id === id)).filter(Boolean) as
      PreflightReport["ads"],
    [report.order, report.ads],
  );

  // Only offer a lane the run actually produced for every ad — a dropdown entry that
  // empties the chart is worse than no entry.
  const options = useMemo(
    () => LANES.filter((l) => ordered.every((ad) => laneValues(ad, l.key, scale))),
    [ordered, scale],
  );

  const series = useMemo<ChartSeries[]>(
    () =>
      ordered.flatMap((ad) => {
        const values = laneValues(ad, metric, scale);
        if (!values) return [];
        const style = roleStyle(roleOf(ad, report), ad.id === selectedId);
        return [{
          id: ad.id,
          label: ad.title,
          timestamps: ad.timestamps,
          values,
          colorToken: style.colorToken,
          width: style.width,
          alpha: style.alpha,
          z: style.z,
          endLabel: String(ad.rank),
        }];
      }),
    [ordered, report, selectedId, scale, metric],
  );

  // The attention domain is precomputed in the artifact; the other lanes are measured off
  // the batch here, the same way, so every metric gets an axis that spans all five cuts
  // and always shows the zero line.
  const yDomain = useMemo<[number, number]>(
    () => (metric === "attention"
      ? report.chart.yDomain[scale]
      : laneDomain(report.ads, [metric], scale)),
    [metric, report.ads, report.chart.yDomain, scale],
  );
  const xDomain = useMemo(() => report.chart.xDomain, [report.chart.xDomain]);

  const missing = ordered.filter((a) => !laneValues(a, metric, scale));

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_248px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <label
            htmlFor="preflight-metric"
            className="text-[10px] uppercase tracking-[0.12em] text-ink-3"
          >
            Metric
          </label>
          <select
            id="preflight-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as LaneKey)}
            className="cursor-pointer rounded-xl border border-line-2 bg-paper px-3 py-2 text-[13px] text-ink outline-none transition-colors hover:border-ink focus-visible:border-ink"
          >
            {options.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label} ({l.region})
              </option>
            ))}
          </select>
        </div>

        <DeltaChart
          series={series}
          yDomain={yDomain}
          xDomain={xDomain}
          hookSeconds={HOOK_SECONDS}
          progress={progress}
          height={280}
          unit={`${lane.axis} · ${report.chart.units[scale]}`}
          ariaLabel={`${lane.label} arcs for all ${ordered.length} ads in the batch, on one shared axis`}
        />
        {report.comparability?.crossAdLevelsTrustworthy === false ? (
          <p className="mt-3 max-w-[64ch] text-[11.5px] leading-[1.6] text-ink-2">
            Levels are not directly comparable in this run, so read the shapes rather than
            the heights.
          </p>
        ) : null}
        {missing.length ? (
          <p className="mt-2 text-[11.5px] text-ink-3">
            No {lane.label.toLowerCase()} curve for{" "}
            {missing.map((a) => a.title).join(", ")} — the timing check failed, so the
            curve is withheld. The score still stands.
          </p>
        ) : null}
      </div>

      <AdList
        ads={ordered}
        report={report}
        selectedId={selectedId}
        onSelect={onSelect}
        orientation="column"
        active={active}
      />
    </div>
  );
}
