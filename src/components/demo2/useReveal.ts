"use client";

// Reveal-on-enter, the one motion primitive for the whole /demo page. A section fires
// its animation exactly ONCE, the first time it scrolls into view — so scroll speed
// never affects playback and a screen-recording take can't be ruined by scrolling too
// fast or too slow (the spec's hard constraint). Honours prefers-reduced-motion by
// reporting "revealed" immediately with no animation clock.

import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

// The options a COMPONENT uses to fire off its own arrival instead of its section's.
//
// Section reveals on the section's top edge, which for anything sitting below the first
// screen of a tall section is seconds of scroll before the thing itself is on camera: the
// five-arc overlay's race finished ~8.8s before its first pixel (measured at 1440x900,
// scrolled at 109px/s); DemoScrollPage's stat tiles hit the same thing, which is why they
// call this too.
//
// NOT a ratio, for the reason Section.tsx:26-31 already documents: an IntersectionObserver
// threshold is a fraction of the TARGET's area, so `threshold: 0.22` fires when a tall
// element is still a sliver at the bottom edge and the trigger point moves with the
// element's height (0.22 of an 806px panel is 177px of it showing, 0.22 of a 240px chart is
// 53px). Zero threshold plus a negative bottom root margin fires when the element's TOP
// crosses a fixed line, at the same screen position whatever the element's height.
//
// One caveat before reusing it: an element that can never scroll above that line, i.e. one
// sitting inside the last 40% of a viewport at the document's maximum scroll, never fires at
// all. Check the geometry before gating anything at the very bottom of a page.
//
// WHY 40 AND NOT 45. This margin has a second job nobody designed it for: AutoScroll refuses to
// stop above a figure's fire line, so the number is also the FLOOR on where the camera may come
// to rest. At -45% it was the binding constraint on two of the nine stops rather than
// composition being it. On §02 the stat tiles' fire line stopped the camera 48px above the
// section's own top edge, which tucked the eyebrow under the header and left 255px of empty
// paper below the tiles. 60% still has the element's top well inside the frame when it starts
// animating, which is all the gate was ever protecting.
//
// It does not go further. -32% was tried and cost three of the nine stops: a lower floor also
// satisfies the planner's frame-merge test more often, so units that should be separate beats
// fused and the take jumped 1,437px in one leg, skipping the ranked board entirely. 40 is the
// point that buys placement freedom without collapsing the beat structure.
export const ON_SCREEN = { threshold: 0, rootMargin: "0px 0px -40% 0px" } as const;

// Returns [ref, revealed]. `revealed` flips true once and stays true. The element type is
// only constrained to Element so an <svg> can be observed directly (TwoRegionBrain), which
// an HTMLElement bound would have forced into a wrapper div.
export function useReveal<T extends Element = HTMLDivElement>(
  opts: { threshold?: number; rootMargin?: string } = {},
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;
    if (!("IntersectionObserver" in window)) {
      // Deferred a frame rather than set synchronously in the effect body, which cascades
      // an extra render pass. Same end state, no react-hooks/set-state-in-effect error.
      const id = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(id);
    }
    const rootMargin = opts.rootMargin ?? "0px 0px -8% 0px";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: opts.threshold ?? 0.35, rootMargin },
    );
    // Stamp the gate onto the element so anything that has to PLAN around reveals can read
    // them off the DOM instead of keeping its own list of selectors. AutoScroll uses this to
    // work out the scroll position at which each figure starts animating, and therefore
    // where it is allowed to stop; a hand-maintained list would drift from this observer
    // silently, and the failure mode is a recording that halts on a blank chart.
    // data-reveal is the bottom root-margin as a positive percentage: 40 here, 25 for Section.
    const pct = /(-?\d+(?:\.\d+)?)%\s*0px\s*$/.exec(rootMargin);
    if (el instanceof HTMLElement || el instanceof SVGElement) {
      el.dataset.reveal = String(pct ? -parseFloat(pct[1]) : 0);
    }
    io.observe(el);
    return () => io.disconnect();
  }, [revealed, opts.threshold, opts.rootMargin]);

  return [ref, revealed];
}

// A monotonic 0..1 progress clock that runs for `ms` once `active` turns true. Drives
// self-drawing arcs, count-ups, and bar races. Eased (easeOutCubic) so motion decelerates
// into place — the "calm motion" the design system asks for. Instant under reduced-motion.
//
// `ease: "linear"` exists for one case: a curve drawing itself along a time axis. Under
// easeOutCubic the trace is 87% finished at the halfway point, so an arc lunges to the
// right edge and then crawls — it reads as a glitch, not as a plot being drawn. A constant
// rate is what makes the x axis look like it is being played back at real speed, which is
// the whole point of the arc animating rather than appearing.
export function useAnimeClock(active: boolean, ms: number, ease: "out" | "linear" = "out"): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      const id = requestAnimationFrame(() => setP(1));
      return () => cancelAnimationFrame(id);
    }
    // The clock is anchored to performance.now() at effect time, NOT to the first rAF
    // timestamp. The old version did `if (!start) start = ts`, which meant frame one always
    // computed u = 0 and rendered the initial state — every count-up needed two frames just
    // to leave zero. On a throttled or contended frame budget (which is exactly what a
    // screen recorder plus a 30-bar chart produces) that first frame can be the only one
    // that lands before the recorder scrolls past, and the section is captured reading 0.
    // Anchoring to effect time means frame one already carries ~16ms of elapsed progress.
    const start = performance.now();
    let raf = 0;
    const step = (ts: number) => {
      const u = Math.min(1, (ts - start) / ms);
      setP(ease === "linear" ? u : 1 - Math.pow(1 - u, 3));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, ms, ease]);
  return p;
}
