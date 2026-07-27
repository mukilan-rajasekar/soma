"use client";

// Two seconds of one ad, side by side, with both networks read at each of them.
//
// §01 was the only beat on the page that made a claim and showed no evidence for it. Every
// other section has a proof object (a score that moves, five cuts on one axis, an eleven-shot
// delta strip, a clip playing next to a live read-out); this one had two short cards of prose
// and a rotating cortex, and it was also the only beat with no clock on it while the entire
// rest of the page is indexed to the second. Worse, its own lede sets up a comparison —
// generic eye-tracking tells you where a gaze lands, we read the cortex — and then never
// showed the contrast, so the premise the other six beats stand on was the one thing a
// reader had to take on faith.
//
// This is that contrast, in about 200px: the same ad, the same viewer, seventeen seconds
// apart, and the two networks reading opposite ways at each. It is the argument of the
// heading above it stated as a measurement rather than as a sentence, and it doubles as the
// first thing on the page that shows what "per second" means, which §02 otherwise assumes.
//
// EVERY NUMBER IS READ FROM THE LANES AT RENDER TIME. The timestamps and the two stills are
// fixed (a frame of this file at 0:05 is a frame of this file at 0:05 whatever the model
// later says about it), but nothing here restates a value typed into this file, and nothing
// claims a superlative — no "the biggest gap in the ad", which is the sort of phrase that
// goes quietly false the first time report.json is rebuilt. The figure says what the numbers
// say. If a rebuild ever flipped the two moments so that they no longer disagree, `opposed`
// drops the whole block rather than shipping a split that does not split.
//
// The scale is each network against ITS OWN range on THIS clip — which is what the arcs
// above and below are already drawn on (build_report.py: clip((roi_mag - p2) / (p98 - p2))).
// So 100 means "this network's ceiling in this ad", not "100% of a brain". The caption says
// so, because a bare 0-100 next to the word cortex invites exactly the wrong reading.

import { LANES } from "./lanes";
import { tokenVar } from "./tokens";
import { fmtT, type Ad } from "./types";
import { ON_SCREEN, useReveal } from "./useReveal";

export type SplitMoment = {
  /** Seconds into the ad. Must exist in `ad.timestamps`. */
  t: number;
  /** Still pulled from the same clip at the same second, under public/. */
  src: string;
  /** What is on screen at that second, in the fewest words that identify the frame. */
  caption: string;
};

const pct = (v: number | undefined) => Math.round((v ?? 0) * 100);

/** The lane values at `t`, or null if this ad has no sample there. */
function readAt(ad: Ad, t: number) {
  const i = ad.timestamps.indexOf(t);
  if (i < 0) return null;
  const dorsal = ad.lanes.dorsal?.[i];
  const ventral = ad.lanes.ventral?.[i];
  if (dorsal == null || ventral == null) return null;
  return { dorsal: pct(dorsal), ventral: pct(ventral) };
}

export default function LaneSplit({
  ad,
  moments,
  active,
}: {
  ad: Ad;
  /** Exactly two: one the ventral network wins, one the dorsal network wins. */
  moments: [SplitMoment, SplitMoment];
  active: boolean;
}) {
  // Its own arrival, not the section's. It sits below the region cards and the cortex, so on
  // the section's gate the bars would grow while still under the fold and be finished by the
  // time anyone framed them — the same reason CorpusWall and BatchOverlay carry their own.
  const [ref, framed] = useReveal<HTMLDivElement>(ON_SCREEN);
  const on = active && framed;

  const reads = moments.map((m) => readAt(ad, m.t));
  const [a, b] = reads;
  // The figure's entire point is that the two moments disagree, and in opposite directions.
  // If they ever stop doing that, showing them side by side would be an argument against
  // this section's heading rather than for it.
  const opposed =
    a != null && b != null &&
    Math.sign(a.ventral - a.dorsal) !== 0 &&
    Math.sign(a.ventral - a.dorsal) === -Math.sign(b.ventral - b.dorsal);
  if (!opposed) return null;

  const gap = Math.abs(moments[1].t - moments[0].t);

  return (
    <div ref={ref} className="mt-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {moments.map((m, i) => {
          const r = reads[i]!;
          const lead = r.ventral > r.dorsal ? "surprise" : "attention";
          return (
            <div
              key={m.t}
              className="flex gap-4 rounded-2xl border border-line bg-paper p-4"
              style={{
                opacity: on ? 1 : 0,
                transform: on ? "none" : "translateY(9px)",
                transition: `opacity .55s ${i * 140}ms, transform .55s ${i * 140}ms`,
              }}
            >
              {/* Plain img, like every other frame on this page: a fixed 300px still served
                  from public/, so next/image would add a loader round trip for the same
                  bytes. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.src}
                alt=""
                loading="lazy"
                className="block w-[86px] shrink-0 self-start rounded-xl border border-line object-cover"
                style={{ aspectRatio: "9 / 16" }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[15px] font-medium tabular-nums leading-none text-ink">
                    {fmtT(m.t)}
                  </span>
                  <span className="min-w-0 truncate text-[12.5px] text-ink-3">{m.caption}</span>
                </div>
                <div className="mt-3.5 space-y-2.5">
                  <LaneBar laneKey="attention" value={r.dorsal} on={on} delay={i * 140 + 200} />
                  <LaneBar laneKey="surprise" value={r.ventral} on={on} delay={i * 140 + 320} />
                </div>
                {/* Which network is ahead, said in words, so the point survives a viewer who
                    reads the card without comparing the two bar lengths. */}
                <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-3">
                  {lead === "surprise"
                    ? "Something lands. The eye has not settled yet."
                    : "The eye is locked on. Nothing here is a surprise."}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p
        className="mt-4 max-w-[70ch] text-[13px] leading-[1.6] text-ink-2"
        style={{ opacity: on ? 1 : 0, transition: "opacity .6s .5s" }}
      >
        Same ad, same viewer, {gap} seconds apart, and the two networks answer differently at
        both. That is the whole reason one attention number cannot tell you what an ad did.
        Each network is read against its own range on this clip, once a second, for every
        second of the runtime.
      </p>
    </div>
  );
}

// One lane, as a labelled bar. Colour AND position AND the printed number, because the bars
// are short at this size and two greys next to each other is not a reading.
function LaneBar({
  laneKey,
  value,
  on,
  delay,
}: {
  laneKey: "attention" | "surprise";
  value: number;
  on: boolean;
  delay: number;
}) {
  const lane = LANES.find((l) => l.key === laneKey)!;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[64px] shrink-0 text-[11px] uppercase tracking-[0.06em] text-ink-3">
        {lane.label}
      </span>
      <span className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-fill">
        <span
          className="block h-full rounded-full"
          style={{
            background: tokenVar(lane.colorToken),
            transform: on ? `scaleX(${value / 100})` : "scaleX(0)",
            transformOrigin: "left",
            transition: `transform .7s ${delay}ms cubic-bezier(.22,.61,.36,1)`,
          }}
        />
      </span>
      <span
        className="w-[26px] shrink-0 text-right text-[13px] font-medium tabular-nums leading-none text-ink"
        style={{ opacity: on ? 1 : 0, transition: `opacity .4s ${delay + 260}ms` }}
      >
        {value}
      </span>
    </div>
  );
}
