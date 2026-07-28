"use client";

// Section A — the clip on the left, its arc on the right, one clock between them.

import { useMemo, useRef } from "react";

import DeltaChart, { type ChartSeries } from "./DeltaChart";
import { prefersReducedMotion, useAnimeClock } from "../demo2/useReveal";
// No hook band on this chart: the weak-spot bands already shade regions of the timeline
// here, and a second tinted band overlapping them turns the first seconds into mush. The
// hook window is shaded on the two charts that are about it.
import { LANES, laneDomain, laneValues } from "./lanes";
import { useVideoClock } from "./useVideoClock";
import { fmtT, type PreflightAd, type PreflightReport } from "./types";

type Props = { ad: PreflightAd; report: PreflightReport; active: boolean };

const LANE_KEYS = LANES.map((l) => l.key);

export default function PlayerPanel({ ad, report, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clock = useVideoClock(videoRef, ad.durationS, ad.id);
  const scale = report.chart.defaultScale;

  const reduced = typeof window !== "undefined" && prefersReducedMotion();
  const drawn = useAnimeClock(active, 1100);
  const progress = reduced ? 1 : drawn;

  // One curve per lane, all drawn by the same reveal `progress` so they sweep right
  // together rather than one leading the others.
  const series = useMemo<ChartSeries[]>(
    () =>
      LANES.flatMap((l) => {
        const values = laneValues(ad, l.key, scale);
        if (!values) return [];
        return [{
          id: l.key === "attention" ? ad.id : `${ad.id}:${l.key}`,
          label: l.label,
          timestamps: ad.timestamps,
          values,
          colorToken: l.colorToken,
          width: l.width,
          dash: l.dash ? [...l.dash] : undefined,
          z: l.z,
        }];
      }),
    [ad, scale],
  );

  const shown = useMemo(
    () => LANES.filter((l) => series.some((s) => s.label === l.label)),
    [series],
  );

  // One domain covering all three lanes across the whole batch. report.chart.yDomain is
  // derived from the attention lane alone and clips surprise, which dips below it; and a
  // per-ad domain would make the cuts non-comparable, which is what this page sells.
  const yDomain = useMemo<[number, number]>(
    () => laneDomain(report.ads, LANE_KEYS, scale),
    [report.ads, scale],
  );

  const xDomain = useMemo<[number, number]>(() => [0, ad.durationS], [ad.durationS]);
  const bands = useMemo(
    () => ad.weakSpots.map((w) => ({ start: w.start, end: w.end })),
    [ad.weakSpots],
  );

  const unavailable = !ad.video || clock.error;

  return (
    <div className="grid gap-6 md:grid-cols-[248px_1fr]">
      {/* ── the clip ───────────────────────────────────────────────────────────── */}
      <div>
        <div className="relative overflow-hidden rounded-2xl border border-line bg-ink">
          {ad.video ? (
            <video
              ref={videoRef}
              src={ad.video}
              poster={ad.poster ?? undefined}
              playsInline
              muted={clock.muted}
              preload="metadata"
              onClick={clock.toggle}
              className="block h-[340px] w-full cursor-pointer object-contain"
            />
          ) : (
            <div className="flex h-[340px] w-full items-center justify-center bg-fill px-6">
              <p className="text-center text-[12px] leading-[1.6] text-ink-3">
                Clip unavailable.
                <br />
                The arc beside it is still real.
              </p>
            </div>
          )}
          {ad.video && !clock.playing ? (
            <button
              type="button"
              onClick={clock.toggle}
              aria-label={`Play ${ad.title}, ${fmtT(ad.durationS)}`}
              className="absolute inset-0 flex cursor-pointer items-center justify-center"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper/90">
                <span
                  aria-hidden
                  className="ml-1 block h-0 w-0"
                  style={{
                    borderTop: "8px solid transparent",
                    borderBottom: "8px solid transparent",
                    borderLeft: "13px solid var(--color-ink)",
                  }}
                />
              </span>
            </button>
          ) : null}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={clock.toggle}
            disabled={!!unavailable}
            className="cursor-pointer rounded-xl border border-line-2 bg-paper px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-40"
          >
            {clock.playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => clock.setMuted(!clock.muted)}
            disabled={!!unavailable}
            className="cursor-pointer rounded-xl border border-line-2 bg-paper px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-40"
          >
            {clock.muted ? "Unmute" : "Mute"}
          </button>
          {/* aria-hidden: a 60 Hz live region floods screen readers. The button's
              accessible name above carries the duration statically. */}
          <span aria-hidden className="ml-auto tabular-nums text-[12px] text-ink-3">
            {fmtT(clock.t)} / {fmtT(ad.durationS)}
          </span>
        </div>
        {/* Fixed slot. A load error on one cut and not the next would otherwise resize
            this column, and the grid row is as tall as this column — which is what makes
            everything below the panel jump when you switch cuts. */}
        <div className="mt-2 h-[34px] overflow-hidden">
          {clock.error ? (
            <p className="text-[12.5px] leading-[1.5] text-ink-3">
              {clock.error} The arc is still real.
            </p>
          ) : null}
        </div>
      </div>

      {/* ── the arc ────────────────────────────────────────────────────────────── */}
      <div>
        {ad.arc ? (
          <DeltaChart
            series={series}
            yDomain={yDomain}
            xDomain={xDomain}
            bands={bands}
            playhead={clock.t}
            playheadSeriesId={ad.id}
            onScrub={clock.scrub}
            progress={progress}
            height={230}
            unit={report.chart.units[scale]}
            ariaLabel={`Predicted attention, surprise and comprehension across ${ad.title}`}
          />
        ) : (
          <div className="flex h-[230px] items-center justify-center rounded-xl border border-line bg-fill px-6">
            <p className="max-w-[40ch] text-center text-[12px] leading-[1.6] text-ink-3">
              No arc for this cut — the timing check failed, so the curve is withheld
              rather than guessed. Its score still stands.
            </p>
          </div>
        )}

        {/* A fixed three-column grid, not a wrapping row: an ad missing a lane drops an
            entry, and on a flex row that re-wraps the rest and shifts everything below the
            panel when you switch cuts. */}
        <div className="mt-3.5 grid min-h-[52px] grid-cols-1 gap-x-5 gap-y-2.5 text-[12px] leading-[1.45] text-ink-3 sm:grid-cols-3">
          {shown.map((l) => (
            <div key={l.key} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-[6px] inline-block h-0 w-5 shrink-0"
                style={{ borderTopWidth: 2.5, borderTopStyle: l.border, borderTopColor: l.cssVar }}
              />
              <span className="min-w-0">
                <b className="font-medium text-ink">{l.label}</b>{" "}
                <span className="whitespace-nowrap">({l.region})</span>
                <br />
                <span>{l.note}</span>
              </span>
            </div>
          ))}
        </div>

        {/* The shaded bands are the most striking thing on this chart and nothing else on
            the page says what they are. Only rendered when this cut actually has one. */}
        {bands.length ? (
          <div className="mt-1 flex items-start gap-2 text-[12px] leading-[1.45] text-ink-3">
            <span
              aria-hidden
              className="mt-[3px] inline-block h-3 w-5 shrink-0 rounded-[3px]"
              // Same fill/stroke alphas DeltaChart paints the band with, expressed through
              // the token rather than a second copy of the hex.
              style={{
                background: "color-mix(in srgb, var(--color-neg) 7%, transparent)",
                border: "1px dashed color-mix(in srgb, var(--color-neg) 35%, transparent)",
              }}
            />
            <span>
              <b className="font-medium text-ink">Weak spot</b>{" "}
              · a sustained stretch where attention sits below this cut&rsquo;s own median
              —{" "}
              {bands.length === 1 ? "one here" : `${bands.length} here`}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
