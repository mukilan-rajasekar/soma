"use client";

// The one control on the recording surface, and it does NOT scroll the page.
//
// This page is narrated live: the founder scrolls it by hand and talks over it, so the pace
// is a human decision made in the moment and nothing here should try to author it. Every
// section animates once, as it is scrolled into frame, and that is the whole playback model
// (see useReveal).
//
// What still has to be owned is the START. Left alone, the hero builds during hydration —
// which means it is always already finished by the time a screen recorder is running, and
// the take opens on a page that has stopped moving. This button moves that moment under the
// founder's thumb: click it and the page resets cold (every reveal latch cleared, scrolled
// to the top, hero blanked), the control fades out of shot, and after CUE_MS of deliberate
// stillness the hero builds. That gap is the window to get the pointer out of frame and let
// the recorder settle, and it is also trimmable dead air if the take starts late.
//
// AT REST THE PAGE IS FINISHED, NOT EMPTY. The first version of this held the hero blank from
// load until the button was pressed, on the reasoning that nothing should animate before it is
// asked to. What that produced was a white void with a marquee floating in it and a small
// control in the corner, which reads as a page that failed to load — and it is the first thing
// anyone opening the link sees. The cue is about MOTION, not content: "rest" shows the hero
// complete with every transition suppressed, so nothing has animated and nothing is missing.
// Only the click blanks it, and only for the length of the pause.
//
// It re-arms itself, because takes get retried: scroll away and come back to the very top
// and the control is there again, and clicking it starts a genuinely cold take rather than a
// page with half its animations already spent.

import { useCallback, useEffect, useRef, useState } from "react";

// Long enough to move the pointer off the page and for the button's own fade to finish
// before anything on screen moves, short enough that the head of the take is not a wall of
// dead air. The founder asked for "two, three seconds".
export const CUE_MS = 2600;

type Phase = "idle" | "counting" | "live";

export default function IntroCue({
  scrollRef,
  onCue,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
  /** "reset" at click (blank the hero, clear every reveal, go cold) and "build" at CUE_MS
   *  (run the hero's arrival). Before either, the page sits at rest: complete, unanimated. */
  onCue: (cue: "reset" | "build") => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the page has been scrolled away from the top since the take started. The control
  // may only come back after that, so it can never fade in over the opening frames.
  const left = useRef(false);

  const start = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const m = scrollRef.current;
    if (m) m.scrollTop = 0;
    left.current = false;
    setPhase("counting");
    onCue("reset");
    timer.current = setTimeout(() => {
      onCue("build");
      setPhase("live");
    }, CUE_MS);
  }, [onCue, scrollRef]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // R restarts. A retake usually means "that opening was wrong", and scrolling all the way
  // back up to reach the button is itself a thing you would have to trim out of the next one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave cmd-R alone
      e.preventDefault();
      start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start]);

  useEffect(() => {
    if (phase !== "live") return;
    const m = scrollRef.current;
    if (!m) return;
    const onScroll = () => {
      if (m.scrollTop > 400) left.current = true;
      else if (left.current && m.scrollTop <= 2) setPhase("idle");
    };
    m.addEventListener("scroll", onScroll, { passive: true });
    return () => m.removeEventListener("scroll", onScroll);
  }, [phase, scrollRef]);

  return (
    <button
      type="button"
      onClick={start}
      aria-label="Start the walkthrough: reset the page and build the opening after a short pause"
      className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-line bg-paper/90 py-2 pl-3 pr-4 text-[12.5px] text-ink-2 shadow-[0_1px_2px_rgba(10,10,10,0.04)] backdrop-blur hover:border-line-2 hover:text-ink ${
        phase === "idle"
          ? "opacity-100 transition-opacity duration-300"
          : "pointer-events-none opacity-0 transition-opacity duration-[260ms]"
      }`}
    >
      <svg width="7" height="9" viewBox="0 0 7 9" aria-hidden="true" className="shrink-0">
        <path d="M0 0.5 L7 4.5 L0 8.5 Z" fill="currentColor" />
      </svg>
      <span>Start</span>
    </button>
  );
}
