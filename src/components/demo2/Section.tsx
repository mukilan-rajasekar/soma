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
};

export default function Section({ n, eyebrow, heading, lede, children, tint }: Props) {
  const [ref, revealed] = useReveal<HTMLElement>({ threshold: 0.25 });
  const hasText = Boolean(n || eyebrow || heading || lede);
  return (
    <section
      ref={ref}
      className={`scroll-mt-16 border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(48px,9vh,104px)] ${tint ? "bg-fill" : "bg-paper"}`}
    >
      <div className="mx-auto max-w-[980px]">
        {n || eyebrow ? (
          <div
            className="mb-3 flex items-center gap-2.5 text-[10.5px] uppercase tracking-[0.14em] text-ink-3"
            style={{ opacity: revealed ? 1 : 0, transition: "opacity .5s" }}
          >
            {n ? <span className="tabular-nums">{n}</span> : null}
            {n && eyebrow ? <span className="h-px w-6 bg-line-2" /> : null}
            {eyebrow ? <span>{eyebrow}</span> : null}
          </div>
        ) : null}
        {heading ? (
          <h2
            className="max-w-[20ch] text-balance text-section text-ink"
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
