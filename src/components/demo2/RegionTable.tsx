"use client";

// The cortical profile as a table: every network the mask set covers, its magnitude, and
// how far it runs above or below this clip's whole-cortex mean.
//
// The lift column is the load-bearing one. A raw ROI magnitude is meaningless on its own
// — it scales with the clip — but magnitude relative to the whole-cortex mean says
// something a reader can act on: 1.44 means dorsal attention is running 44% above
// average for this ad, 0.46 means the vmPFC mask is running at less than half.
//
// WHAT THESE MASKS ARE. Hand-picked Destrieux label sets from build_roi_mask.py, chosen
// a priori from the anatomy literature. They are NOT validated functional localisers,
// and nothing here has been checked against a subject's own localiser scan. "Value
// (vmPFC)" is the one to be most careful with: the canonical buy-signal is the nucleus
// accumbens, which is subcortical and absent from the fsaverage5 surface entirely, so
// this is a cortical neighbour standing in for it. The footnote says so on the page,
// because a table like this invites exactly the over-reading it must not get.

import type { Ad } from "./types";

export default function RegionTable({ ad, active }: { ad: Ad; active: boolean }) {
  const rows = ad.regions ?? [];
  if (rows.length === 0) return null;

  // Bars are drawn against the strongest lift in the table so the shape is legible;
  // the numbers are absolute, so the scaling cannot mislead.
  const maxLift = Math.max(...rows.map((r) => r.lift ?? 0), 1);

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[12px] uppercase tracking-[0.08em] text-ink-3">
          Cortical profile · {rows.length} networks
        </span>
        <span className="text-[12px] tabular-nums text-ink-3">
          whole-cortex mean {ad.levels?.baseline?.toFixed(4) ?? "—"}
        </span>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-3">
            <th className="pb-2 font-normal">Network</th>
            <th className="pb-2 text-right font-normal tabular-nums">Magnitude</th>
            <th className="pb-2 pl-4 font-normal">vs cortex mean</th>
            <th className="pb-2 pr-1 text-right font-normal tabular-nums">Vertices</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const lift = r.lift ?? 0;
            const above = lift >= 1;
            return (
              <tr
                key={r.net}
                className="border-b border-line last:border-0"
                style={{
                  opacity: active ? 1 : 0,
                  transition: `opacity .45s ${i * 60}ms`,
                }}
              >
                <td className="py-2.5 pr-3 text-[14px] leading-[1.4] text-ink">{r.label}</td>
                <td className="py-2.5 text-right text-[13px] tabular-nums text-ink-2">
                  {r.value.toFixed(4)}
                </td>
                <td className="py-2.5 pl-4">
                  <div className="flex items-center gap-2.5">
                    <div className="relative h-1.5 w-full min-w-[64px] max-w-[160px] overflow-hidden rounded-full bg-fill">
                      <div
                        className={`h-full rounded-full ${above ? "bg-accent-2" : "bg-line-2"}`}
                        style={{
                          transform: `scaleX(${active ? Math.min(lift / maxLift, 1) : 0})`,
                          transformOrigin: "left",
                          transition: `transform .7s ${i * 60}ms`,
                        }}
                      />
                    </div>
                    <span className={`shrink-0 text-[13px] tabular-nums ${above ? "text-ink" : "text-ink-3"}`}>
                      {lift.toFixed(2)}×
                    </span>
                  </div>
                </td>
                <td className="py-2.5 pl-3 pr-1 text-right text-[12px] tabular-nums text-ink-3">
                  {r.vertices.toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 max-w-[68ch] text-[12px] leading-[1.55] text-ink-3">
        Networks are a-priori anatomical masks, not functional localisers &mdash; no
        subject-specific localiser has been run against them.{" "}
        <span className="text-ink-2">Value (vmPFC)</span> is a cortical stand-in: the
        nucleus accumbens, the canonical value signal, is subcortical and does not appear
        on the fsaverage5 surface this encoder reads.
      </p>
    </div>
  );
}
