import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "soma — FAQ: straight answers on neural ad pre-testing",
  description:
    "Straight answers to the hard questions about Soma: what it measures, how it reads an ad, what the 92% number really is, and why the public model isn't the moat.",
};

// One source of truth for both the visible accordion and the FAQPage JSON-LD:
//   q      — question
//   a      — rich answer rendered on the page
//   plain  — the same answer as flat text for schema.org (kept in sync by hand)
type Faq = {
  group: string;
  q: string;
  a: ReactNode;
  plain: string;
  open?: boolean;
};

const FAQS: Faq[] = [
  {
    group: "What it is",
    q: "What does Soma actually measure?",
    open: true,
    a: (
      <>
        <p>
          Soma reads the cortical activation a video produces in an average
          viewer, straight from the file, using Meta&rsquo;s public TRIBE v2
          model. Off that activation it reads an{" "}
          <strong className="font-semibold text-ink">attention arc</strong>{" "}
          &mdash; how the ad earns and holds attention &mdash; and an{" "}
          <strong className="font-semibold text-ink">affect arc</strong>{" "}
          (valence and arousal), how it lands emotionally.
        </p>
        <p>The demo shows the whole read, second by second.</p>
      </>
    ),
    plain:
      "Soma reads the cortical activation a video produces in an average viewer, straight from the file, using Meta's public TRIBE v2 model. Off that activation it reads an attention arc — how the ad earns and holds attention — and an affect arc (valence and arousal), how it lands emotionally. The demo shows the whole read, second by second.",
  },
  {
    group: "What it is",
    q: "Do you measure my viewers' real brains?",
    a: (
      <p>
        No hardware, no panels, no waiting. Soma runs a model trained on real
        fMRI to read the neural response an average viewer&rsquo;s brain has to
        your ad &mdash; straight from the file, in minutes.
      </p>
    ),
    plain:
      "No hardware, no panels, no waiting. Soma runs a model trained on real fMRI to read the neural response an average viewer's brain has to your ad — straight from the file, in minutes.",
  },
  {
    group: "What it is",
    q: "What video does it work on, and how fast?",
    a: (
      <p>
        Short-form video: TikTok, Reels, Shorts, and paid-social ad cuts. It
        reads from the file in minutes, so you can run every variant instead of
        only the one you could afford to put through a panel. Pricing is being set
        for performance and creative teams; it will sit far below a human panel
        study.
      </p>
    ),
    plain:
      "Short-form video: TikTok, Reels, Shorts, and paid-social ad cuts. It reads from the file in minutes, so you can run every variant instead of only the one you could afford to put through a panel. Pricing is being set for performance and creative teams and will sit far below a human panel study.",
  },
  {
    group: "Is it real",
    q: "Is this grounded in real science?",
    a: (
      <p>
        Yes. The <strong className="font-semibold text-ink">encoder</strong> is
        Meta&rsquo;s TRIBE v2, built and validated against real fMRI scans, and
        Soma reads its{" "}
        <strong className="font-semibold text-ink">
          attention and affect arcs
        </strong>{" "}
        directly off that neural signal. The{" "}
        <Link
          href="/science"
          className="font-medium text-ink underline underline-offset-2 hover:text-ink-2"
        >
          science page
        </Link>{" "}
        lays out the full method.
      </p>
    ),
    plain:
      "Yes. The encoder is Meta's TRIBE v2, built and validated against real fMRI scans, and Soma reads its attention and affect arcs directly off that neural signal. The science page lays out the full method.",
  },
  {
    group: "Is it real",
    q: "What's that 92% number I've seen?",
    a: (
      <p>
        Other brain-AI tools quote a &ldquo;92%&rdquo; figure and attribute it
        to Meta, but it appears in no Meta publication. Meta&rsquo;s TRIBE
        reports a mean correlation around{" "}
        <strong className="font-semibold text-ink">0.21</strong> across ~1,000
        cortical regions on held-out data &mdash; roughly half the measurable
        ceiling, and a real result you can check. Soma builds its read on that
        science, not a marketing number.
      </p>
    ),
    plain:
      "Other brain-AI tools quote a '92%' figure and attribute it to Meta, but it appears in no Meta publication. Meta's TRIBE reports a mean correlation around 0.21 across ~1,000 cortical regions on held-out data, roughly half the measurable ceiling and a real result you can check. Soma builds its read on that science, not a marketing number.",
  },
  {
    group: "Versus the alternatives",
    q: "Better than prompting GPT or a synthetic panel?",
    a: (
      <p>
        An LLM role-playing a viewer imagines what a person might{" "}
        <strong className="font-semibold text-ink">say</strong>, and it
        leans toward agreeable, plausible answers. There is no biology under it.
        Soma predicts the neural response from a model trained on real brains, and
        the same input gives the same output run to run. Different signal,
        grounded in a different place. See the{" "}
        <Link
          href="/compare"
          className="font-medium text-ink underline underline-offset-2 hover:text-ink-2"
        >
          comparison
        </Link>{" "}
        for the full field.
      </p>
    ),
    plain:
      "An LLM role-playing a viewer imagines what a person might say and leans toward agreeable answers, with no biology under it. Soma predicts the neural response from a model trained on real brains, and gives the same output run to run.",
  },
  {
    group: "Versus the alternatives",
    q: "Why won't Realeyes or Neurons just build this?",
    a: (
      <p>
        They could download the same public model tomorrow. The reason they are
        slow to is that a transparent, from-the-file prediction undercuts their
        own pitch: recruit a panel, trust our score, pay per study. It is a
        business-model conflict, not an engineering gap. Incumbents rarely ship
        the thing that commoditizes their pricing.
      </p>
    ),
    plain:
      "They could use the same public model, but a transparent from-the-file prediction undercuts their pitch of recruiting a panel and charging per study. It is a business-model conflict, not an engineering gap.",
  },
  {
    group: "Versus the alternatives",
    q: "The model is public. So what's the moat?",
    a: (
      <>
        <p>
          Correct &mdash; and the encoder was never the moat. Anyone can download
          TRIBE v2 tomorrow and produce a score. A score is not defensible.
        </p>
        <p>
          The moat is the corpus: real ads paired with the performance they
          actually got. 733 so far, each carrying CTR percentile, engagement and
          spend index alongside its brain response. Every ad a customer sends adds
          one more pairing, and that pairing is what a public-model competitor
          cannot scrape.
        </p>
        <p>
          The corpus is also what makes the real product trainable: a layer that
          translates cortical response into advertising outcome. That layer is in
          training, not finished, and we will keep saying so until it is.
        </p>
        <p>
          Behind those two: the product and the daily workflow, and the validation
          discipline that keeps both honest. Whoever gathers real outcome data
          first wins this race.
        </p>
      </>
    ),
    plain:
      "The encoder was never the moat — anyone can download TRIBE v2 and produce a score. The moat is the corpus: 733 real ads so far, each paired with the performance it actually got. Every ad a customer sends adds another pairing, and that is what a public-model competitor cannot scrape. The corpus is what makes the real product trainable — a layer that translates cortical response into advertising outcome, which is in training and labelled that way until it is finished.",
  },
  {
    group: "Versus the alternatives",
    q: "Can I check any of this myself?",
    a: (
      <p>
        Yes. The encoder is Meta&rsquo;s public TRIBE v2, so the first step is
        reproducible by anyone. Every number on this site is generated from the
        data, not typed by hand &mdash; so what you see is what the model
        actually does.
      </p>
    ),
    plain:
      "Yes. The encoder is Meta's public TRIBE v2, so the first step is reproducible by anyone. Every number on this site is generated from the data, not typed by hand, so what you see is what the model actually does.",
  },
];

// Group the flat list, preserving first-seen order.
const GROUPS = FAQS.reduce<{ name: string; items: Faq[] }[]>((acc, f) => {
  const g = acc.find((x) => x.name === f.group);
  if (g) g.items.push(f);
  else acc.push({ name: f.group, items: [f] });
  return acc;
}, []);

// FAQPage structured data, generated from the SAME array so it can never drift from the
// visible copy. Escape "<" per Next 16 JSON-LD guidance before dangerouslySetInnerHTML.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.plain },
  })),
};

function Chevron() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      className="ml-auto shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180 group-open:text-ink"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FaqPage() {
  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* header */}
      <header className="mx-auto max-w-[800px] px-[clamp(16px,4vw,24px)] pb-6 pt-[clamp(26px,5vw,44px)]">
        <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-ink-3">
          <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
          Questions, answered straight
        </div>
        <h1 className="max-w-[16ch] text-balance text-hero text-ink">
          The <span className="font-serif font-normal italic">skeptic&rsquo;s</span>{" "}
          FAQ.
        </h1>
        <p className="mt-[18px] max-w-[60ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
          If you came in doubtful, good. These are the questions a careful reader
          asks, answered without dodging &mdash; plainly, and in full.
        </p>
      </header>

      {/* accordion */}
      <div className="mx-auto max-w-[800px] px-[clamp(16px,4vw,24px)] pb-[10px] pt-[clamp(18px,3vw,26px)]">
        {GROUPS.map((group) => (
          <section key={group.name}>
            <div className="mb-[12px] mt-[30px] text-[11px] uppercase tracking-[0.16em] text-ink-3">
              {group.name}
            </div>
            {group.items.map((f) => (
              <details
                key={f.q}
                open={f.open}
                className="group mb-[10px] overflow-hidden rounded-2xl border border-line bg-paper transition-colors open:border-line-2 hover:border-line-2"
              >
                <summary className="flex cursor-pointer list-none items-center gap-[14px] px-[18px] py-4 text-[16.5px] font-semibold tracking-[-0.01em] text-ink [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Chevron />
                </summary>
                <div className="max-w-[66ch] px-[18px] pb-[18px] text-[15px] leading-[1.62] text-ink-2 [&_p+p]:mt-[11px]">
                  {f.a}
                </div>
              </details>
            ))}
          </section>
        ))}
      </div>

      {/* cta */}
      <div className="mx-auto mt-[30px] flex max-w-[800px] flex-wrap gap-3 px-[clamp(16px,4vw,24px)]">
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-paper transition-colors hover:bg-ink/85"
        >
          See the demo
        </Link>
        <Link
          href="/science"
          className="inline-flex items-center gap-2 rounded-xl border border-line-2 px-5 py-[13px] text-ui font-medium text-ink transition-colors hover:border-ink"
        >
          Read the science
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-line-2 px-5 py-[13px] text-ui font-medium text-ink transition-colors hover:border-ink"
        >
          Request early access
        </Link>
      </div>
    </article>
  );
}
