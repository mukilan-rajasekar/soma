"use client";

// The hero card: the ad playing, and its arc being written by the ad.
//
// This used to be a static chart of a clip nobody could see, which meant the most convincing
// object on the page — real footage with the read-out moving against it — did not appear until
// §06, about 80% of the way down. The opening frame of the recording asserted a measurement;
// the proof was four minutes of narration later.
//
// It is NOT a copy of §06. That section is the full instrument: three lanes named, three live
// per-second numbers, brand pins, weak spots, a verdict. The point there is that you can READ
// the measurement. The point here is that it is BEING TAKEN — the curve is drawn by the video's
// own clock, arriving one second at a time, and nothing else is on the card. Same footage, two
// different sentences, and they are 3 minutes apart in the take.
//
// PLAYBACK FOLLOWS THE HERO'S EXISTING STATE MACHINE and adds no control of its own. That is
// the whole reason this works on the recording route: the founder clicks the one intro control,
// starts the screen recorder during the pause it opens, and the take begins on the ad starting
// and the curve beginning to draw. There is no second click to make on camera, and no autoplay
// firing at a moment nobody chose.
//   rest   paused on the opening frame, arc drawn in full, no playhead. A finished page. This
//          matters more than it looks: an empty chart waiting for a play button is exactly the
//          "page that failed to load" the hero was rebuilt to stop being.
//   blank  the cut the intro control opens. Reset to zero so a retake starts from zero.
//   build  from the top, in step with the clip.
// /demo never leaves "build", so a cold reader gets it playing on arrival — muted, inline,
// which is the condition browsers allow that under.

import { useEffect, useRef, useState } from "react";
import ArcPlot from "./ArcPlot";
import { type Ad } from "./types";

export type HeroPhase = "rest" | "blank" | "build";

export default function HeroReadout({
  ad,
  hookSeconds,
  phase,
  poster,
}: {
  ad: Ad;
  hookSeconds: number;
  phase: HeroPhase;
  /** Still from this clip's opening second, so "rest" shows the ad rather than a black box. */
  poster: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const live = phase === "build";

  // `playing` is never set from here, only from the element's own play/pause events. That is
  // both what the linter wants (no setState inside an effect) and the more honest source: a
  // play() that a policy rejects, or a pause the user causes by clicking the frame, both end up
  // in the same place instead of in two places that can disagree about whether the clip is
  // running. `t` needs no reset either — nothing reads it unless `live`, and the only route
  // into "build" is through "blank", which remounts the whole subtree via takeId.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (phase === "build") {
      // From the top every time. The element survives a phase change on /demo, so without the
      // seek a re-entry would resume mid-clip.
      v.currentTime = 0;
      v.play().catch(() => {});
      return;
    }
    v.pause();
    v.currentTime = 0;
  }, [phase]);

  // Only run the clock while frames are actually advancing — otherwise this is a setState per
  // frame for the life of the page, and this component sits at the top of a page that is then
  // scrolled through for three minutes.
  useEffect(() => {
    if (!playing) return;
    const loop = () => {
      const v = videoRef.current;
      if (v) setT(v.currentTime);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const dur = ad.duration;

  return (
    // 140px, and the plot height below is 140 * 16/9 so the two bottom edges line up. Sized
    // from the footage rather than from the chart: at 110 the clip read as a thumbnail glued to
    // a figure, and the claim this card makes is that the curve came off THAT video, which only
    // lands if the video is legible. 140 is as wide as the column takes before the plot loses
    // the room to show a 29-second arc.
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <div className="relative overflow-hidden rounded-xl border border-line bg-ink">
        <video
          ref={videoRef}
          src={ad.video}
          poster={poster}
          playsInline
          muted
          // The clip is shorter than the hero is talked over. Without this it ends on a frozen
          // last frame, which is a dead object in the most-looked-at corner of the opening shot.
          loop
          preload="auto"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          // Safety net: the rAF loop only runs while `playing`, so the arc would hold a stale
          // time after a pause, a seek or a loop wrap without this.
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          aria-label={`${ad.title} — ad footage`}
          className="block aspect-[9/16] w-full cursor-pointer object-cover"
        />
        {/* Fallback only, and only once the page has asked for playback. A play button on a
            page at rest advertises that something has not started yet, which is the opposite of
            what the resting hero is for; a play button on a build that a policy blocked is the
            one thing that rescues the take. */}
        {live && !playing ? (
          <button
            onClick={toggle}
            aria-label="Play ad"
            className="absolute inset-0 flex items-center justify-center bg-ink/10 transition-colors hover:bg-ink/20"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 shadow-md">
              <svg viewBox="0 0 12 12" className="ml-0.5 h-3 w-3 fill-ink"><polygon points="2,1 11,6 2,11" /></svg>
            </span>
          </button>
        ) : null}
      </div>

      <ArcPlot
        dorsal={ad.lanes.dorsal}
        ventral={ad.lanes.ventral}
        timestamps={ad.timestamps}
        duration={dur}
        hookSeconds={hookSeconds}
        weakSpots={ad.weakSpots}
        // `animate` deliberately omitted: ArcPlot hands the draw to `progress` whenever animate
        // is null, and progress here is the VIDEO's clock rather than a timer. That is the whole
        // idea — the curve cannot run ahead of the footage or lag behind it, because there is
        // only one clock in the card.
        //
        // At rest the curve is drawn in full with no playhead, which is the finished page a cold
        // visitor should land on. It also means this plot needs no `eager` flag any more: the
        // reason the old one had it was that a gated chart sat empty at scrollTop 0 waiting to be
        // framed, and a chart that is complete until the take starts cannot do that.
        progress={live ? Math.min(1, dur > 0 ? t / dur : 1) : 1}
        playhead={live ? t : null}
        // The lanes are named one screen down, in the section that exists to name them, and
        // explained under §02's arc where all three are drawn. A key attached to the opening
        // frame pushed the score out of shot for six lines nobody reads yet.
        showLegend={false}
        height={249}
      />
    </div>
  );
}
