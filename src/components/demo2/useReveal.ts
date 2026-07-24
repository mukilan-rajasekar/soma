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
      setRevealed(true);
      return;
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
      setP(1);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const u = Math.min(1, (ts - start) / ms);
      const eased = 1 - Math.pow(1 - u, 3);
      setP(eased);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, ms]);
  return p;
}
