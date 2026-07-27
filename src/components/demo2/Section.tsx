"use client";

// One section shell for the scroll page: an uppercase-sans eyebrow, a text-section
// heading (with room for the single serif-italic accent word), an optional lede, and a
// reveal that fires the section's animation once on enter. Children get the `revealed`
// flag so their own count-ups / arc draws can key off it. Numbered so the voiceover and
// the recording guide can reference "section 3" unambiguously.
//
// Every text slot is optional: /preflight drops the eyebrow row on every section (the
// numbers and micro-labels read as chrome next to the charts) and drops the heading
// entirely on the section that is nothing but the live demo.

import { useReveal } from "./useReveal";

type Props = {
  n?: string;
  eyebrow?: string;
  heading?: React.ReactNode;
  lede?: React.ReactNode;
  children?: (revealed: boolean) => React.ReactNode;
  tint?: boolean;
  /** Heading at hero size: see SectionDef.feature in DemoScrollPage. */
  feature?: boolean;
};

export default function Section({ n, eyebrow, heading, lede, children, tint, feature }: Props) {
  // Triggered on the section's top edge crossing 75% of the viewport, NOT on a visible-area
  // ratio. `threshold: 0.25` made the trigger point depend on section height: 25% of a
  // 1,187px section is ~300px of scroll, 25% of a 514px section is ~128px, so sections
  // revealed at different distances and the page animated at an uneven cadence — the one
  // thing a fixed-rate scroll recording cannot compensate for. A zero threshold plus a
  // negative bottom rootMargin fires every section at the same screen position whatever
  // its height, so each beat gets the same lead-in.
  const [ref, revealed] = useReveal<HTMLElement>({ threshold: 0, rootMargin: "0px 0px -25% 0px" });
  const hasText = Boolean(n || eyebrow || heading || lede);
  return (
    // 9vh top AND bottom put 162px of pure padding between the last figure of one beat and the
    // eyebrow of the next at a 900px viewport, and the recording framed a good share of it: two
    // stops ended on ~255px of empty paper. 6.5vh is ~59px, which still separates the beats
    // cleanly and takes ~350px off the page. That second effect is the more valuable one: the
    // take is a fixed 55 seconds, so a shorter page is the same time spread over less distance,
    // which reads as calmer rather than faster.
    <section
      ref={ref}
      className={`scroll-mt-16 border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(36px,5vh,64px)] ${tint ? "bg-fill" : "bg-paper"}`}
    >
      <div className="mx-auto max-w-[1180px]">
        {n || eyebrow ? (
          <div
            className="mb-3 flex items-center gap-2.5 text-[12px] uppercase tracking-[0.1em] text-ink-3"
            style={{ opacity: revealed ? 1 : 0, transition: "opacity .5s" }}
          >
            {n ? <span className="tabular-nums">{n}</span> : null}
            {n && eyebrow ? <span className="h-px w-6 bg-line-2" /> : null}
            {eyebrow ? <span>{eyebrow}</span> : null}
          </div>
        ) : null}
        {heading ? (
          <h2
            className={`text-balance text-ink ${feature ? "max-w-[15ch] text-hero" : "max-w-[20ch] text-section"}`}
            style={{ opacity: revealed ? 1 : 0, transform: revealed ? "none" : "translateY(8px)", transition: "opacity .6s .05s, transform .6s .05s" }}
          >
            {heading}
          </h2>
        ) : null}
        {lede ? (
          <p
            className="mt-4 max-w-[62ch] text-body text-pretty text-ink-2"
            style={{ opacity: revealed ? 1 : 0, transition: "opacity .6s .15s" }}
          >
            {lede}
          </p>
        ) : null}
        {children ? <div className={hasText ? "mt-8" : ""}>{children(revealed)}</div> : null}
      </div>
    </section>
  );
}
