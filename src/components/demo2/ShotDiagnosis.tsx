"use client";

// Section 6 companion — shot-level diagnosis, not just one number. The dip ad's shots as
// a filmstrip; each thumbnail carries what happens to the Soma score when that shot is
// cut. A shot whose removal RAISES the score is dragging the ad down (tinted red); a shot
// whose removal DROPS the score is load-bearing (neutral). This is the spec's "full ad vs
// versions with specific shots removed" — computed leave-one-shot-out over the real arc.

import { tokenAlpha } from "./tokens";
import { ON_SCREEN, useReveal } from "./useReveal";
import { fmtT, type ShotDiagnosis as Diag } from "./types";

export default function ShotDiagnosis({
  diag,
  active,
  showThumbs = true,
}: {
  diag: Diag;
  active: boolean;
  showThumbs?: boolean;
}) {
  const worst = diag.shots.reduce((a, b) => (b.delta > a.delta ? b : a), diag.shots[0]);
  const rawThumbs: (string | null)[] = (diag as unknown as { thumbs?: (string | null)[] }).thumbs ?? [];
  // §05 mounts this above EditStudio, which renders the very same eleven frames as its
  // before/after filmstrip. Showing them here too would put the identical strip on screen
  // twice inside one section — the exact duplication that got the standalone weak-spot
  // section cut. With showThumbs off, this contributes only what EditStudio does NOT have:
  // the per-shot leave-one-shot-out deltas that explain WHICH shot to cut and why.
  const thumbs = showThumbs ? rawThumbs : [];
  // The worst shot is picked from the data by max delta, but the sentence below used to
  // open with the hardcoded words "The opening" — so if the costliest shot were anywhere
  // other than the top of the ad, the prose asserted something the data contradicted.
  // Positioned by TIME, not by array index: with eleven unevenly-spaced shots, index 1 of 11
  // is 9% of the way through the list but 0:01 of a 0:29 ad — indexing called that "mid-ad"
  // when it is plainly the opening. Fractions of runtime are what a viewer actually sees.
  const runtime = Math.max(...diag.shots.map((s) => s.end), 1);
  const at = worst.start / runtime;
  const worstWhere = at <= 0.2 ? "The opening" : at >= 0.7 ? "The closing" : "The mid-ad";
  // The strip lands off its OWN arrival, not the section's. It sits ~1,230px below §05's top
  // edge, so the eleven staggered shots used to have finished arriving ~700px of scroll
  // before the first of them was on camera. ANDed with `active`, which still gates it.
  const [ref, framed] = useReveal<HTMLDivElement>(ON_SCREEN);
  const on = active && framed;
  return (
    <div ref={ref}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
        <span>
          <span className="text-ink">{diag.title}</span> · base score{" "}
          <span className="tabular-nums text-ink">{diag.base}</span>
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-error/70" /> drags it down</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-ink" /> carries it</span>
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {diag.shots.map((s, i) => {
          const drag = s.delta > 0; // cutting it raises the score → it drags
          const mag = Math.min(1, Math.abs(s.delta) / 5);
          return (
            <div
              key={i}
              className="relative flex-1 min-w-[62px]"
              style={{
                opacity: on ? 1 : 0,
                transform: on ? "none" : "translateY(6px)",
                transition: `opacity .4s ${i * 55}ms, transform .4s ${i * 55}ms`,
              }}
            >
              <div className={`overflow-hidden rounded-xl border ${drag && s.delta >= 3 ? "border-error/50" : "border-line"}`}>
                {thumbs[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs[i] as string} alt="" className="block h-[74px] w-full object-cover" />
                ) : showThumbs ? (
                  <div className="h-[74px] w-full bg-fill" />
                ) : null}
                {/* Without thumbnails this bar IS the shot: a taller block so the strip still
                    reads as eleven shots along the runtime rather than a row of loose numbers. */}
                <div
                  className={showThumbs ? "h-1" : "h-7"}
                  style={{ background: drag ? tokenAlpha("error", 0.25 + mag * 0.6) : tokenAlpha("ink", 0.2 + mag * 0.6) }}
                />
              </div>
              <div className="mt-1.5 text-center text-[11px] tabular-nums text-ink-3">{fmtT(s.start)}</div>
              <div className={`text-center text-[13px] font-medium tabular-nums ${drag ? "text-error" : "text-ink"}`}>
                {s.delta > 0 ? `+${s.delta}` : s.delta}
              </div>
            </div>
          );
        })}
      </div>

      {/* Deliberately stops short of narrating the outcome. §08 applies this exact cut and
          counts the score up in front of the reader; saying "climbs to 66" here spends that
          beat two sections early. The per-shot deltas above still carry the diagnosis. */}
      <p className="mt-3 max-w-[60ch] text-[13px] leading-[1.55] text-ink-2">
        {worstWhere}{" "}
        <span className="text-ink">{fmtT(worst.start)}–{fmtT(worst.end)}</span> shot is dragging it
        down. Cut it and the score goes up.
      </p>
    </div>
  );
}
