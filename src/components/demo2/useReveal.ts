"use client";

// Reveal-on-enter, the one motion primitive for the whole /demo page, and since the page is
// now narrated live and scrolled by hand it is the ONLY playback mechanism there is. A figure
// fires exactly ONCE, the first time it is scrolled into frame, so the recording can be taken
// at whatever pace the voiceover wants: pausing on a beat, scrolling back, or moving fast
// through a section cannot desynchronise anything, because there is no clock but arrival.
// Honours prefers-reduced-motion by reporting "revealed" immediately with no animation clock.

import { useCallback, useEffect, useState } from "react";

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
// The one hole this leaves — an element that can never climb above the line, because it sits
// inside the last screenful at the document's maximum scroll — is closed by the `atEnd`
// fallback in useReveal below rather than by checking geometry per call site.
//
// WHY 40 IS A FLOOR AND NOT THE ANSWER. -40% fires an element when its top crosses 60% of the
// viewport. For a 240px chart that means it is fully on camera before a pixel of it moves,
// which is exactly right. For the 870px generation panel it means 41% of it is on camera and
// 510px of it is still below the fold — the panel spends the first third of a five-second
// animation playing to nobody. A single margin cannot serve both, because it is a fixed
// screen position and the elements are not a fixed size.
//
// `frame` fixes that: it asks for a FRACTION OF THE ELEMENT to be on camera, and useReveal
// converts it to a root margin using the element's measured height. 0.62 of an 870px panel is
// a -60% margin; 0.62 of a 240px chart works out below the floor, so the floor holds and short
// figures keep firing fully framed. Everything self-tunes when a component changes height,
// which is the property the old hand-picked number never had.
//
// The floor does not go lower. -32% was tried and read as figures animating while they were
// still arriving from the bottom edge; 40 is the point where the element's top is comfortably
// inside the frame before anything moves, which is all this gate was ever protecting.
export const ON_SCREEN = { threshold: 0, rootMargin: "0px 0px -40% 0px", frame: 0.62 } as const;
// The ceiling on the computed margin. Past this the fire line is so high on screen that a
// figure sitting near the document's end can never reach it — and while `atEnd` below catches
// that case, a reveal that only ever happens because you hit the bottom of the page is not a
// reveal anyone watches.
const FRAME_MAX_PCT = 65;

// Returns [ref, revealed]. `revealed` flips true once and stays true. The element type is
// only constrained to Element so an <svg> can be observed directly (TwoRegionBrain), which
// an HTMLElement bound would have forced into a wrapper div.
export function useReveal<T extends Element = HTMLDivElement>(
  opts: { threshold?: number; rootMargin?: string; frame?: number } = {},
): [React.RefCallback<T>, boolean] {
  // A CALLBACK REF INTO STATE, not a useRef. The difference is that this effect re-runs when
  // the observed NODE changes, and a plain ref object cannot tell it that: React writes
  // `.current` and notifies nobody.
  //
  // That is not theoretical here. /demo-short's intro control remounts everything below the
  // header on every take (DemoScrollPage's `takeId`), while two of these hooks — the hero's and
  // the science beat's — are called ABOVE that boundary and attach their refs below it. With a
  // ref object the effect's deps never changed, so the observer stayed bound to the node that
  // had just been thrown away, and the replacement node was watched by nothing. The failure was
  // silent and it was worst on exactly the path that matters: press Start, and from the second
  // take onward the cortex and its two region cards had no gate at all.
  //
  // Identity has to be stable or React tears the ref down and rebuilds it every render, so the
  // setter is wrapped once and never re-created.
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((n: T | null) => setNode(n), []);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = node;
    if (!el || revealed) return;
    if (!("IntersectionObserver" in window)) {
      // Deferred a frame rather than set synchronously in the effect body, which cascades
      // an extra render pass. Same end state, no react-hooks/set-state-in-effect error.
      const id = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(id);
    }
    let rootMargin = opts.rootMargin ?? "0px 0px -8% 0px";
    // Height-aware fire line: see ON_SCREEN above. Measured off the element itself at observe
    // time, so a panel that grows or shrinks re-derives its own gate instead of inheriting a
    // number that was chosen when it was a different size. `min(h, vh)` caps the ask at one
    // screenful, because an element taller than the viewport can never be 62% framed and
    // asking for it would push the line off the top of the screen.
    const vh = window.innerHeight;
    const h = el.getBoundingClientRect().height;
    if (opts.frame != null && vh > 0 && h > 0) {
      const floor = -parseFloat(/(-?\d+(?:\.\d+)?)%\s*0px\s*$/.exec(rootMargin)?.[1] ?? "0") || 0;
      const want = Math.min(FRAME_MAX_PCT, Math.max(floor, (opts.frame * Math.min(h, vh) / vh) * 100));
      rootMargin = `0px 0px -${want.toFixed(1)}% 0px`;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: opts.threshold ?? 0.35, rootMargin },
    );
    // Stamp the resolved gate onto the element, as a positive percentage of the viewport. It
    // is what makes the fire line auditable from outside: a measurement pass can read every
    // gate off the live DOM and check that nothing on the page starts animating while it is
    // below the fold, without keeping its own list of selectors that would drift from this
    // observer silently. Stamped AFTER the height-aware adjustment above, so what is recorded
    // is the margin that actually fired, not the one that was asked for.
    // The disable is for react-hooks/immutability, and it is a false positive with a real
    // cause: the observed node is held in STATE now (see the callback ref above), so the rule
    // sees a write through a state-derived binding and calls it a state mutation. It is not —
    // it is a data attribute on a DOM element, which is the same side effect this line always
    // performed, and the element is not React-rendered content. Nothing about the value or its
    // lifetime changed; only where the reference came from.
    const pct = /(-?\d+(?:\.\d+)?)%\s*0px\s*$/.exec(rootMargin);
    if (el instanceof HTMLElement || el instanceof SVGElement) {
      // eslint-disable-next-line react-hooks/immutability
      el.dataset.reveal = String(pct ? -parseFloat(pct[1]) : 0);
    }

    const scroller = el.closest("main") ?? document.scrollingElement;
    const fire = () => {
      setRevealed(true);
      io.disconnect();
      scroller?.removeEventListener("scroll", onScroll);
      if (idle) clearTimeout(idle);
    };

    // ── IF IT IS ON CAMERA AND THE PAGE HAS STOPPED, IT PLAYS ────────────────────────
    // The fire line above is a fixed height on screen, which is the right rule while the page
    // is MOVING: it is what stops a figure animating to nobody as it arrives from the bottom
    // edge. It is the wrong rule the moment the page stops, because everything between that
    // line and the bottom of the screen is then something the viewer is looking straight at,
    // sitting in its zero state, for as long as the narration lasts.
    //
    // That is not hypothetical. The hook beat's two score tiles land 594px down a 900px
    // screen, 54px below the line, and a walkthrough that came to rest on that section held
    // two tiles reading "0 /100" with empty bars under a heading about how much the first
    // three seconds matter. The old stepped take never showed it because its planner could
    // raise the camera until every figure in shot had fired; hand-scrolled, nothing can.
    //
    // Coming to rest is the strongest signal available that a frame is being composed on
    // purpose, so it is treated as one: settle for REST_MS with a third of the element on
    // camera and it plays. The fraction matters — it keeps a tall panel peeking in at the
    // bottom edge from starting a five-second animation that will finish before it is framed,
    // which is exactly what the fixed line exists to prevent. `min(h, vh)` again, because an
    // element taller than the screen can never show a third of ITSELF and would be excluded
    // from its own rule.
    const REST_MS = 260, REST_FRAC = 0.34;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const settled = () => {
      const r = el.getBoundingClientRect();
      const view = window.innerHeight;
      // A zero-size box is not "on camera", it is not measurable, and it must never satisfy
      // this rule. Detached and display:none nodes both report an all-zero rect, and the
      // comparison below reads 0 >= 0 on one — true — so the figure would fire on the first
      // scroll pause anywhere on the page, including at the top. The callback ref above is what
      // stops the detached case arising at all; this is the guard that makes the rule itself
      // honest, and it costs one comparison.
      if (r.height <= 0) return;
      const shown = Math.max(0, Math.min(r.bottom, view) - Math.max(r.top, 0));
      if (shown >= REST_FRAC * Math.min(r.height, view)) fire();
    };
    const onScroll = () => {
      // The end of the document is the one place the fire line can strand a figure outright:
      // an element inside the last screenful at maximum scroll can never climb high enough to
      // cross it, however long anyone looks at it.
      if (scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) { fire(); return; }
      if (idle) clearTimeout(idle);
      idle = setTimeout(settled, REST_MS);
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    io.observe(el);
    return () => {
      io.disconnect();
      scroller?.removeEventListener("scroll", onScroll);
      if (idle) clearTimeout(idle);
    };
    // `node` first, and it is the dependency this whole hook turns on: it is what re-attaches
    // the observer when a remount hands the same hook a different element.
  }, [node, revealed, opts.threshold, opts.rootMargin, opts.frame]);

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
