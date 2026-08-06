// WeakSpots — the sustained dips, as a timeline rather than a table.
//
// A WeakSpot is a run below the clip's own median, MAD-based and therefore scale-invariant
// (src/components/preflight/types.ts). What a person wants from it is "where in my film",
// which is a position, so it is drawn as bands on a single duration-scaled track. Reading
// "4.0s – 7.5s" off a table and mapping it onto a 30-second film by hand is work the page
// should have done.
//
// The bands are `bg-line` at the hairline weight the rest of the system uses — grey, not a
// colour. docs/DESIGN-SYSTEM.md is explicit that `neg` exists only for signed data where
// zero is a real reference point, and a weak spot is a region, not a polarity. Tinting
// these red would make them read as errors rather than as the softest parts of a film.

import { fmtT, type WeakSpot } from "@/components/preflight/types";

export default function WeakSpots({
  spots,
  durationS,
}: {
  spots: WeakSpot[];
  durationS: number;
}) {
  if (!spots.length || !Number.isFinite(durationS) || durationS <= 0) return null;

  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / durationS) * 100))}%`;

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
        Where it sags
      </h2>
      <p className="mt-3 max-w-[62ch] text-pretty text-body text-ink-2">
        {spots.length === 1 ? "One stretch runs" : `${spots.length} stretches run`} below
        this film&rsquo;s own median for long enough to matter. They are the first places
        to point an edit at.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-paper p-4">
        <div className="relative h-8 overflow-hidden rounded-xl bg-fill">
          {spots.map((spot, i) => (
            <span
              key={`${spot.start}-${i}`}
              className="absolute inset-y-0 bg-line"
              style={{ left: pct(spot.start), width: pct(Math.max(0, spot.end - spot.start)) }}
            />
          ))}
        </div>

        <div className="mt-2 flex justify-between text-[11px] tabular-nums text-ink-3">
          <span>0:00</span>
          <span>{fmtT(durationS)}</span>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {spots.map((spot, i) => (
            <li
              key={`row-${spot.start}-${i}`}
              className="flex items-baseline justify-between gap-4 text-meta"
            >
              <span className="tabular-nums text-ink">
                {fmtT(spot.start)} – {fmtT(spot.end)}
              </span>
              <span className="text-ink-3">
                <span className="tabular-nums">{spot.secs.toFixed(1)}s</span> below median
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
