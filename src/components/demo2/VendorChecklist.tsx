"use client";

// "Worth asking anyone in this category."
//
// Five questions a buyer can put to any vendor doing predictive creative testing. We
// answer all five inline. No competitor is named, no comparison is drawn, and nothing
// here is a claim about anyone else's product — the section reads as a buyer's guide.
//
// It works because every line is something we can answer from committed artifacts and
// most of the category cannot answer at all: they don't name an encoder, don't publish a
// baseline, don't disclose effective sample size, don't distinguish cortical from
// subcortical, and never publish a negative result. A reader who takes this list to
// another vendor's site does the comparison for us. That is the entire mechanism — do
// not add a competitor name to it, or it stops being a buyer's guide and starts being an
// attack, which is both weaker and easier to dismiss.
//
// SOURCES: every `answer` traces to a committed artifact named in `source`, rendered
// under the answer as the trace line. These should eventually be emitted by
// tools/demo/build_report.py into report.json rather than living here — see the `facts`
// prop. Until then the defaults below carry the artifact path so the claim stays
// checkable.

export type ChecklistFact = {
  q: string;
  answer: React.ReactNode;
  /** Repo path or URL backing the answer. Rendered as the trace line. */
  source: string;
  href?: string;
};

export const DEFAULT_FACTS: ChecklistFact[] = [
  {
    q: "Which encoder, by name?",
    answer: (
      <>
        Meta&rsquo;s <span className="font-serif italic">TRIBE v2</span>, public and frozen.
        The first step reproduces on anyone&rsquo;s machine.
      </>
    ),
    source: "README · build_roi_mask.py",
    href: "/science",
  },
  {
    q: "What does the accuracy beat?",
    answer: (
      <>
        We publish the metadata-only baseline our own numbers have to clear &mdash; and
        name the confound inside it, which is our scrape window, not skill.
      </>
    ),
    source: "data/ads/ad_performance.csv",
  },
  {
    q: "How many independent samples per ad?",
    answer: (
      <>
        Roughly one. A second-by-second trace is strongly autocorrelated, so the effective
        sample is far smaller than the sample count suggests.
      </>
    ),
    source: "honest_corr_timeseries.py",
  },
  {
    q: "Which regions can the model actually resolve?",
    answer: (
      <>
        The cortical surface only. Purchase intent and recall depend on subcortical
        structures the encoder cannot see, so both are inferred &mdash; we say so rather
        than presenting them as measurements.
      </>
    ),
    source: "readout_extract.py · build_roi_mask.py",
    href: "/science",
  },
  {
    q: "What did you test that didn't work?",
    answer: (
      <>
        Retention, against real most-replayed data. It came back null, and it is published
        next to everything that did work.
      </>
    ),
    source: "validation/…/retention_head_roi.json",
    href: "/science",
  },
];

export default function VendorChecklist({
  facts = DEFAULT_FACTS,
  revealed = true,
}: {
  facts?: ChecklistFact[];
  revealed?: boolean;
}) {
  return (
    <ul className="border-t border-line">
      {facts.map((f, i) => (
        <li
          key={f.q}
          className="grid grid-cols-1 gap-x-8 gap-y-2 border-b border-line py-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? "none" : "translateY(6px)",
            transition: `opacity .5s ${0.06 * i}s, transform .5s ${0.06 * i}s`,
          }}
        >
          <p className="text-body text-ink">{f.q}</p>
          <div>
            <p className="max-w-[52ch] text-body text-pretty text-ink-2">{f.answer}</p>
            <p className="mt-1.5 font-mono text-[11px] leading-[1.6] text-ink-3">
              {f.href ? (
                <a className="underline decoration-line-2 underline-offset-2 hover:text-ink-2" href={f.href}>
                  {f.source}
                </a>
              ) : (
                f.source
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
