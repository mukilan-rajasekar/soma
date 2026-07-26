"use client";

// The provenance tag that sits next to every figure on a public surface.
//
// Four states, defined in docs/strategy/PRODUCT.md ("The disclosure rule"). The state is
// always visible — not a tooltip, not a footnote. That is the whole point: a buyer
// comparing two vendors side by side should be able to see, without hovering, which
// numbers on our page are measured and which are not. Nobody else in this category
// labels at all, so the contrast does the arguing and we never have to.
//
// `proxy` is the load-bearing one. Purchase intent and recall stand in for structures
// (nucleus accumbens, hippocampus) that are subcortical and therefore not on the
// fsaverage5 surface the encoder reads. readout_extract.py has always said so in code;
// this is what says it on the page.

export type State = "measured" | "modeled" | "proxy" | "decoration";

const COPY: Record<State, { label: string; title: string }> = {
  measured: {
    label: "measured",
    title: "From the encoder, or from committed code over real data.",
  },
  modeled: {
    label: "modeled",
    title: "A fitted output that has not cleared validation. Directional.",
  },
  proxy: {
    label: "proxy",
    title:
      "Stands in for a structure the encoder cannot resolve. The cortical surface does not include it.",
  },
  decoration: {
    label: "decoration",
    title: "Illustrative. Not bound to model output.",
  },
};

// Measured reads as ink; everything else is deliberately quieter than the number it
// annotates. A label that competes with the figure just gets designed away later.
const TONE: Record<State, string> = {
  measured: "border-line-2 text-ink-2",
  modeled: "border-line text-ink-3",
  proxy: "border-line text-ink-3",
  decoration: "border-line text-ink-3",
};

export default function Provenance({
  state,
  note,
  className = "",
}: {
  state: State;
  /** Appended after the label, e.g. "n=38" or "subcortical". Keep it to a few words. */
  note?: string;
  className?: string;
}) {
  const { label, title } = COPY[state];
  return (
    <span
      title={note ? `${title} (${note})` : title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-[3px] border px-1.5 py-[1px] text-[10px] uppercase leading-[1.5] tracking-[0.08em] ${TONE[state]} ${className}`}
    >
      {label}
      {note ? <span className="normal-case tracking-normal opacity-70">· {note}</span> : null}
    </span>
  );
}
