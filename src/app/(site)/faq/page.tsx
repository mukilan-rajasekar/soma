import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Tier, { type TierVariant } from "@/components/site/Tier";

export const metadata: Metadata = {
  title: "soma — FAQ: honest answers on neural ad pre-testing",
  description:
    "Straight answers to the hard questions about Soma: what it measures, whether it's validated, what the 92% number means, and why the public model isn't the moat.",
};

// One source of truth for both the visible accordion and the FAQPage JSON-LD:
//   q      — question
//   a      — rich answer rendered on the page
//   plain  — the same answer as flat text for schema.org (kept in sync by hand)
//   tier   — optional evidence badge shown above the answer
type Faq = {
  group: string;
  q: string;
  a: ReactNode;
  plain: string;
  tier?: { variant: TierVariant; label: string };
  open?: boolean;
};

const FAQS: Faq[] = [
  {
    group: "What it is",
    q: "What does Soma actually measure?",
    tier: { variant: "validated", label: "encoder validated" },
    open: true,
    a: (
      <>
        <p>
          Soma predicts the cortical activation a video would produce in an
          average viewer, straight from the file, using Meta&rsquo;s public TRIBE
          v2 model. Off that predicted activation we read an{" "}
          <strong className="font-semibold text-[#0a0a0a]">attention arc</strong>{" "}
          and a coarse{" "}
          <strong className="font-semibold text-[#0a0a0a]">affect arc</strong>{" "}
          (valence and arousal).
        </p>
        <p>
          The prediction of activation is the validated part. The attention read
          is{" "}
          <strong className="font-semibold text-[#0a0a0a]">validating now</strong>
          . The affect read is a{" "}
          <strong className="font-semibold text-[#0a0a0a]">
            labeled hypothesis
          </strong>
          . The demo shows all three with those exact badges.
        </p>
      </>
    ),
    plain:
      "Soma predicts the cortical activation a video would produce in an average viewer, from the file, using Meta's public TRIBE v2 model. Off that it reads an attention arc and a coarse affect arc. The activation prediction is validated (Meta's encoder), the attention read is validating now, and the affect read is a labeled hypothesis.",
  },
  {
    group: "What it is",
    q: "Do you measure my viewers' real brains?",
    a: (
      <p>
        No. There are no people and no hardware in the loop. Soma runs a model
        that was trained on real fMRI and{" "}
        <strong className="font-semibold text-[#0a0a0a]">predicts</strong> the
        response an average viewer would have. It is a prediction from the file,
        not a measurement of your audience.
      </p>
    ),
    plain:
      "No. There are no people and no hardware in the loop. Soma runs a model trained on real fMRI and predicts the response an average viewer would have. It is a prediction from the file, not a measurement of your audience.",
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
    q: "Is the arc validated?",
    tier: { variant: "validating", label: "validating now" },
    a: (
      <p>
        The <strong className="font-semibold text-[#0a0a0a]">encoder</strong> is
        validated by Meta against real scans. The{" "}
        <strong className="font-semibold text-[#0a0a0a]">
          attention read-out
        </strong>{" "}
        is being tested right now against public human data (TVSum), and we report
        the result either way, including a null. The{" "}
        <strong className="font-semibold text-[#0a0a0a]">affect read</strong> is a
        labeled proxy, not a decoder. We would rather show you a real null than a
        pretty number that isn&rsquo;t earned. The{" "}
        <Link
          href="/science"
          className="text-[#5f8b99] underline underline-offset-2 hover:text-[#3f6b79]"
        >
          science page
        </Link>{" "}
        lays out the full method.
      </p>
    ),
    plain:
      "The encoder is validated by Meta against real scans. The attention read-out is being tested now against public human data (TVSum), reported either way including a null. The affect read is a labeled proxy, not a decoder.",
  },
  {
    group: "Is it real",
    q: "What's that 92% number I've seen?",
    tier: { variant: "validated", label: "for the encoder only" },
    a: (
      <>
        <p>
          Other brain-AI tools quote a &ldquo;92%&rdquo; figure and attribute it
          to Meta. We can&rsquo;t find it in any Meta publication, so we
          don&rsquo;t use it. Meta&rsquo;s TRIBE actually reports a mean
          correlation around{" "}
          <strong className="font-semibold text-[#0a0a0a]">0.21</strong> across
          ~1,000 cortical regions on held-out data (about half the measurable
          ceiling). Either way it only measures{" "}
          <strong className="font-semibold text-[#0a0a0a]">
            video&nbsp;→&nbsp;brain activation
          </strong>{" "}
          versus real fMRI &mdash; not whether activation predicts whether someone
          keeps watching.
        </p>
        <p>
          That downstream step is a separate question, and it is the one we are
          testing in public.
        </p>
      </>
    ),
    plain:
      "A '92%' figure is quoted by other brain-AI tools and attributed to Meta, but it is not in any Meta publication, so we do not use it. Meta's TRIBE reports a mean correlation around 0.21 across ~1000 cortical regions on held-out data. Either way it only measures video to brain activation versus real fMRI, not whether activation predicts whether someone keeps watching. That downstream step is a separate question we are testing.",
  },
  {
    group: "Is it real",
    q: "What can't it do yet?",
    tier: { variant: "hypothesis", label: "honest limits" },
    a: (
      <>
        <p>
          It cannot name a specific emotion from activation. A spike could be
          interest, confusion, mild alarm, or noise, and only behavior settles
          which. It does not yet predict calibrated retention; that is a roadmap
          rung earned by a held-out test, not a shipped feature.
        </p>
        <p>
          We also disclose a known negative result: whole-brain activation does
          not predict which parts of a YouTube video get replayed, so the
          whole-cortex version of our signal is the baseline to beat, not the win.
        </p>
      </>
    ),
    plain:
      "It cannot name a specific emotion from activation, and it does not yet predict calibrated retention. Those are roadmap rungs earned by held-out tests. We also disclose that whole-brain activation does not predict YouTube replay, so that version of the signal is the baseline to beat.",
  },
  {
    group: "Versus the alternatives",
    q: "Better than prompting GPT or a synthetic panel?",
    a: (
      <p>
        An LLM role-playing a viewer imagines what a person might{" "}
        <strong className="font-semibold text-[#0a0a0a]">say</strong>, and it
        leans toward agreeable, plausible answers. There is no biology under it.
        Soma predicts the neural response from a model trained on real brains, and
        the same input gives the same output run to run. Different signal,
        grounded in a different place. See the{" "}
        <Link
          href="/compare"
          className="text-[#5f8b99] underline underline-offset-2 hover:text-[#3f6b79]"
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
      <p>
        Correct, and we say so plainly: the encoder is not a moat for us or
        anyone. The moat is three things the model can&rsquo;t give you. First,
        the honest validation almost no one bothers to do. Second, the product and
        the daily workflow. Third, a data flywheel of real ads paired with real
        reactions and retention from our partners, which a public-model competitor
        can never scrape. Whoever earns real validation and gathers real outcome
        data first wins the honest version of this race.
      </p>
    ),
    plain:
      "The encoder is not a moat. The moat is honest validation, the product and workflow, and a data flywheel of real ads paired with real reactions and retention from partners, which a public-model competitor cannot scrape.",
  },
  {
    group: "Versus the alternatives",
    q: "Can I check any of this myself?",
    a: (
      <p>
        Yes. The encoder is Meta&rsquo;s public TRIBE v2, so the first step is
        reproducible by anyone. Our test plans are written down before we look at
        results, nulls are reported like any other outcome, and when a real
        validation number lands, it is filled in from the data, not typed by hand.
      </p>
    ),
    plain:
      "Yes. The encoder is Meta's public TRIBE v2, so the first step is reproducible by anyone. Our test plans are written down before we look at results, nulls are reported like any other outcome, and when a real validation number lands it is filled in from the data, not typed by hand.",
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
      className="ml-auto shrink-0 text-[#9a9a9a] transition-transform duration-200 group-open:rotate-180 group-open:text-[#5f8b99]"
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
        <div className="mb-4 inline-flex items-center gap-[9px] font-mono text-[11px] uppercase tracking-[0.18em] text-[#5f8b99]">
          <span className="h-[6px] w-[6px] rounded-full bg-[#8FB3C0]" />
          Questions, answered straight
        </div>
        <h1 className="max-w-[16ch] text-balance text-[clamp(30px,5.2vw,52px)] font-medium leading-[1.05] tracking-[-0.03em]">
          The <span className="font-serif font-normal italic">skeptic&rsquo;s</span>{" "}
          FAQ.
        </h1>
        <p className="mt-[18px] max-w-[60ch] text-pretty text-[clamp(15.5px,1.8vw,18px)] leading-[1.5] text-[#4a4a4a]">
          If you came in doubtful, good. These are the questions a careful reader
          asks, answered without dodging. Where the honest answer is &ldquo;we
          don&rsquo;t know yet, we&rsquo;re testing it,&rdquo; that is what
          you&rsquo;ll read.
        </p>
        <div className="mt-[22px] flex flex-wrap gap-2">
          <Tier variant="validated">validated</Tier>
          <Tier variant="validating">validating now</Tier>
          <Tier variant="hypothesis">labeled hypothesis</Tier>
        </div>
      </header>

      {/* accordion */}
      <div className="mx-auto max-w-[800px] px-[clamp(16px,4vw,24px)] pb-[10px] pt-[clamp(18px,3vw,26px)]">
        {GROUPS.map((group) => (
          <section key={group.name}>
            <div className="mb-[10px] mt-[26px] font-mono text-[11px] uppercase tracking-[0.14em] text-[#9a9a9a]">
              {group.name}
            </div>
            {group.items.map((f) => (
              <details
                key={f.q}
                open={f.open}
                className="group mb-[10px] overflow-hidden rounded-2xl border border-[#ececec] bg-white transition-colors open:border-[#d8d8d8] hover:border-[#d8d8d8]"
              >
                <summary className="flex cursor-pointer list-none items-center gap-[14px] px-[18px] py-4 text-[16.5px] font-semibold tracking-[-0.01em] text-[#0a0a0a] [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Chevron />
                </summary>
                <div className="max-w-[66ch] px-[18px] pb-[18px] text-[15px] leading-[1.62] text-[#4a4a4a] [&_p+p]:mt-[11px]">
                  {f.tier ? (
                    <div className="mb-[10px]">
                      <Tier variant={f.tier.variant}>{f.tier.label}</Tier>
                    </div>
                  ) : null}
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
          className="inline-flex items-center gap-2 rounded-xl bg-[#0a0a0a] px-5 py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-[#333]"
        >
          See the demo
        </Link>
        <Link
          href="/science"
          className="inline-flex items-center gap-2 rounded-xl border border-[#d8d8d8] px-5 py-[13px] text-[15px] font-semibold text-[#0a0a0a] transition-colors hover:border-[#0a0a0a]"
        >
          Read the science
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-[#d8d8d8] px-5 py-[13px] text-[15px] font-semibold text-[#0a0a0a] transition-colors hover:border-[#0a0a0a]"
        >
          Request early access
        </Link>
      </div>
    </article>
  );
}
