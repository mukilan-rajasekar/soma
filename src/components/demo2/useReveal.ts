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

// Returns [ref, revealed]. `revealed` flips true once and stays true.
export function useReveal<T extends HTMLElement = HTMLDivElement>(
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
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: opts.threshold ?? 0.35, rootMargin: opts.rootMargin ?? "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [revealed, opts.threshold, opts.rootMargin]);

  return [ref, revealed];
}

// A monotonic 0..1 progress clock that runs for `ms` once `active` turns true. Drives
// self-drawing arcs, count-ups, and bar races. Eased (easeOutCubic) so motion decelerates
// into place — the "calm motion" the design system asks for. Instant under reduced-motion.
export function useAnimeClock(active: boolean, ms: number): number {
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
      setP(1 - Math.pow(1 - u, 3));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, ms]);
  return p;
}
