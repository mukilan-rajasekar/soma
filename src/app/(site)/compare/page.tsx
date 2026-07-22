import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "soma vs the field — human panels, synthetic, VidCognition",
  description:
    "How Soma compares to human-panel pre-testing (Realeyes, Neurons, System1, Nielsen) and synthetic LLM panels (Aaru, Simile). Predicted from the file, no panel, with a visible validated-vs-hypothesis line.",
};

// Comparison matrix cell mark.
function Mark({ kind }: { kind: "y" | "n" | "p" }) {
  const map = {
    y: { ch: "✓", cls: "border-[#8FB3C0] text-[#5f8b99]" },
    n: { ch: "–", cls: "border-[#e2e2e2] text-[#b0b0b0]" },
    p: { ch: "~", cls: "border-[#ecd9a8] text-[#c08a1e]" },
  } as const;
  const m = map[kind];
  return (
    <span
      className={`inline-flex h-[20px] w-[20px] items-center justify-center rounded-full border-[1.5px] text-[13px] font-bold ${m.cls}`}
    >
      {m.ch}
    </span>
  );
}

const CAMPS = [
  {
    src: "panel · neuro",
    name: "Webcam & eye-tracking",
    who: "Recruited viewers, watched by a camera.",
    tag: "Realeyes, Neurons.",
    us: false,
  },
  {
    src: "panel · survey",
    name: "Surveys & ratings",
    who: "Recruited panels rate the ad, tied to norms.",
    tag: "System1, Nielsen.",
    us: false,
  },
  {
    src: "synthetic",
    name: "LLM personas",
    who: "An LLM role-plays a consumer and self-reports.",
    tag: "Aaru, Simile.",
    us: false,
  },
  {
    src: "predicted biology",
    name: "Brain response, from the file",
    who: "A model trained on real fMRI predicts the cortical response.",
    tag: "Soma.",
    us: true,
  },
];

// Comparison matrix. Column order: Human panels · Synthetic · VidCognition · Soma.
const COLS = ["Human panels", "Synthetic", "VidCognition", "Soma"] as const;
const COLSUB = ["Realeyes · Neurons · System1", "Aaru · Simile", "same model", ""];

type Cell = { mark?: "y" | "n" | "p"; text?: string; sub?: string };
const ROWS: { label: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  {
    label: "Signal source",
    cells: [
      { text: "faces, gaze, self-report" },
      { text: "LLM guess" },
      { text: "predicted brain" },
      { text: "predicted brain" },
    ],
  },
  {
    label: "Needs recruited people",
    cells: [
      { mark: "n", sub: "yes, per study" },
      { mark: "y", sub: "none" },
      { mark: "y", sub: "none" },
      { mark: "y", sub: "none" },
    ],
  },
  {
    label: "Result in minutes",
    cells: [
      { mark: "n", sub: "days" },
      { mark: "y" },
      { mark: "y" },
      { mark: "y" },
    ],
  },
  {
    label: "Cheap enough for every cut",
    cells: [{ mark: "n" }, { mark: "y" }, { mark: "y" }, { mark: "y" }],
  },
  {
    label: "Grounded in biology",
    cells: [
      { mark: "p", sub: "a proxy" },
      { mark: "n" },
      { mark: "y" },
      { mark: "y" },
    ],
  },
  {
    label: "Shows validated vs hypothesis",
    cells: [
      { mark: "n" },
      { mark: "n" },
      { mark: "n", sub: "claims it as fact" },
      { mark: "y", sub: "on every claim" },
    ],
  },
];

const HEADTOHEAD = [
  {
    id: "vs-realeyes",
    name: "vs Realeyes",
    tag: "webcam facial-coding + eye-tracking",
    strong:
      "Real human reactions, not predicted. An established brand with agency trust and years of normative data.",
    diff: (
      <>
        We predict from the{" "}
        <strong className="font-semibold text-[#0a0a0a]">file</strong>. No webcam,
        no recruited panel, no scheduling, in minutes at a fraction of the cost, so
        you test every variant. Their read is a facial proxy for an internal state;
        ours is the predicted cortical state, with the evidence tier on every claim.
      </>
    ),
    caveat: (
      <>
        <strong className="font-semibold text-[#6b6b6b]">
          Why won&rsquo;t they build it?
        </strong>{" "}
        A public, from-the-file model undercuts their own pitch of recruiting a
        panel and charging per study. It is a business-model conflict, not an
        engineering gap.
      </>
    ),
  },
  {
    id: "vs-neurons",
    name: "vs Neurons Inc",
    tag: "AI attention / gaze prediction",
    strong:
      "The closest shipping product to ours, polished, with a real per-frame attention model that is mature in its domain. Established with enterprise marketing teams.",
    diff: (
      <>
        Neurons predicts{" "}
        <strong className="font-semibold text-[#0a0a0a]">where the eye goes</strong>
        . Soma predicts the{" "}
        <strong className="font-semibold text-[#0a0a0a]">
          full cortical response
        </strong>
        , attention and a coarse affect read, from a brain-encoding model. We are
        priced for performance teams, not five-figure enterprise contracts, and we
        carry the honesty boundary they don&rsquo;t.
      </>
    ),
    caveat: (
      <>
        <strong className="font-semibold text-[#6b6b6b]">Honest caveat:</strong>{" "}
        their attention model is mature; ours is validating, not validated. We
        differ on breadth of signal, price, and honesty, not on an accuracy claim
        we haven&rsquo;t earned. Pricing figure (about &euro;15,000/year for five
        seats) is from a third-party page; verify before quoting.
      </>
    ),
  },
  {
    id: "vs-system1",
    name: "vs System1 & Nielsen",
    tag: "panel emotion + normative databases",
    strong:
      "Outcome-linked norms and credibility with brand marketers who care about long-term brand building.",
    diff: "Panel-based, per-study, slow, and built for a handful of hero spots at brand budgets. Soma is the high-volume, low-cost, from-the-file read for teams shipping dozens of paid-social videos a week, the segment their model is too slow and pricey to serve.",
    caveat: null,
  },
  {
    id: "vs-vidcognition",
    name: "vs VidCognition",
    tag: "same public TRIBE v2 model",
    strong:
      "Built on the same public encoder we use, with a clean creator funnel and a good plain-English way of describing patterns. On the model itself, we are even; neither of us owns it.",
    diff: (
      <>
        Three real forks.{" "}
        <strong className="font-semibold text-[#0a0a0a]">Honesty:</strong> they
        present the activation-to-engagement step as settled fact while admitting
        they run no validation of their own; we show the tier and run the held-out
        test. <strong className="font-semibold text-[#0a0a0a]">Buyer:</strong> they
        sell creators a hook score; we sell performance teams a decision instrument
        tied to real media spend and a data flywheel.{" "}
        <strong className="font-semibold text-[#0a0a0a]">Disclosure:</strong> we
        volunteer the negative prior; they quote only the flattering number.
      </>
    ),
    caveat: (
      <>
        <strong className="font-semibold text-[#6b6b6b]">
          Since the model is shared, the race is honest validation and real outcome
          data.
        </strong>{" "}
        Whoever earns those first wins. Verify their current claims and pricing
        before citing them by name in public.
      </>
    ),
  },
  {
    id: "vs-synthetic",
    name: "vs Aaru & Simile",
    tag: "synthetic research, LLM personas",
    strong:
      "Genuinely fast and cheap, and flexible enough to answer any question you can phrase, not only second-by-second attention.",
    diff: (
      <>
        <strong className="font-semibold text-[#0a0a0a]">No biology.</strong> They
        predict what a person might{" "}
        <strong className="font-semibold text-[#0a0a0a]">say</strong>, and LLM
        personas lean toward agreeable, plausible answers. We predict the actual
        neural response from a model trained on real fMRI, reproducible run to run.
      </>
    ),
    caveat: (
      <>
        <strong className="font-semibold text-[#6b6b6b]">Honest caveat:</strong> it
        is partly a different job. They run broad simulated surveys; we read a
        second-by-second neural arc on video. The contrast is grounded versus
        ungrounded for the video-reaction question, not strictly either-or.
      </>
    ),
  },
];

export default function ComparePage() {
  return (
    <article>
      {/* header */}
      <header className="mx-auto max-w-[960px] px-[clamp(16px,4vw,24px)] pb-6 pt-[clamp(26px,5vw,44px)]">
        <div className="mb-4 inline-flex items-center gap-[9px] font-mono text-[11px] uppercase tracking-[0.18em] text-[#5f8b99]">
          <span className="h-[6px] w-[6px] rounded-full bg-[#8FB3C0]" />
          How Soma compares
        </div>
        <h1 className="max-w-[18ch] text-balance text-[clamp(29px,5vw,52px)] font-medium leading-[1.05] tracking-[-0.03em]">
          Predicted from the file. Not a panel, a webcam, or an{" "}
          <span className="font-serif font-normal italic">LLM guessing</span>.
        </h1>
        <p className="mt-[18px] max-w-[64ch] text-pretty text-[clamp(15.5px,1.8vw,18px)] leading-[1.5] text-[#4a4a4a]">
          Everyone else measures reactions from{" "}
          <strong className="font-semibold text-[#0a0a0a]">recruited humans</strong>{" "}
          (panels, webcams, surveys) or{" "}
          <strong className="font-semibold text-[#0a0a0a]">simulates</strong> them
          by prompting an LLM to role-play a person. Soma predicts the{" "}
          <strong className="font-semibold text-[#0a0a0a]">
            actual cortical response
          </strong>{" "}
          from the video file, and is the only one that draws a visible line
          between what is validated and what is still a labeled hypothesis.
        </p>
      </header>

      {/* signal source strip */}
      <section className="mx-auto max-w-[960px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(28px,4.5vw,48px)]">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9a9a9a]">
          the real difference · where the signal comes from
        </div>
        <h2 className="max-w-[22ch] text-balance text-[clamp(22px,3vw,30px)] font-medium leading-[1.12] tracking-[-0.025em]">
          Same output shape. Different source.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          Per-second attention curves and weak-spot callouts already exist. The
          question that matters is where the signal underneath them comes from.
          That is the whole comparison.
        </p>
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {CAMPS.map((c) => (
            <div
              key={c.name}
              className={`flex flex-col gap-[10px] rounded-2xl border p-[18px_16px] ${
                c.us
                  ? "border-[#9fc7d4] bg-[#f4fafc]"
                  : "border-[#ececec] bg-[#fafafa]"
              }`}
            >
              <div
                className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
                  c.us ? "text-[#5f8b99]" : "text-[#9a9a9a]"
                }`}
              >
                {c.src}
              </div>
              <div className="text-[15.5px] font-semibold tracking-[-0.01em]">
                {c.name}
              </div>
              <div className="text-[12.5px] leading-[1.5] text-[#4a4a4a]">
                {c.who}{" "}
                <strong className="font-semibold text-[#0a0a0a]">{c.tag}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* matrix */}
      <section className="mx-auto max-w-[960px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(28px,4.5vw,48px)]">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9a9a9a]">
          at a glance
        </div>
        <h2 className="max-w-[22ch] text-balance text-[clamp(22px,3vw,30px)] font-medium leading-[1.12] tracking-[-0.025em]">
          The comparison in one table.
        </h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[#ececec]">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr>
                <th className="border-b border-[#ececec] px-3 py-[15px] text-left align-bottom font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#9a9a9a]">
                  &nbsp;
                </th>
                {COLS.map((c, i) => (
                  <th
                    key={c}
                    className={`border-b border-[#ececec] px-3 py-[15px] text-center align-bottom text-[13.5px] font-semibold tracking-[-0.01em] ${
                      i === 3 ? "bg-[#f4fafc] text-[#5f8b99]" : "text-[#4a4a4a]"
                    }`}
                  >
                    {c}
                    {COLSUB[i] ? (
                      <span className="mt-1 block font-mono text-[10px] font-normal text-[#9a9a9a]">
                        {COLSUB[i]}
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th className="whitespace-nowrap border-b border-[#f0f0f0] px-[14px] py-[13px] text-left text-[14px] font-medium text-[#0a0a0a]">
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`border-b border-[#f0f0f0] px-3 py-[13px] text-center align-middle ${
                        i === 3
                          ? "bg-[#f4fafc] text-[#0a0a0a]"
                          : "text-[#4a4a4a]"
                      }`}
                    >
                      {cell.mark ? <Mark kind={cell.mark} /> : null}
                      {cell.text ? cell.text : null}
                      {cell.sub ? (
                        <span
                          className={`mt-1 block font-mono text-[10px] ${
                            i === 3 ? "text-[#5f8b99]" : "text-[#9a9a9a]"
                          }`}
                        >
                          {cell.sub}
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-[14px] max-w-[70ch] text-[13px] leading-[1.6] text-[#9a9a9a]">
          Honest framing: the panel column is a real human reaction, which we
          don&rsquo;t have, and we don&rsquo;t claim to be more accurate than a
          panel. We compete on source, speed, cost, and honesty. Figures for named
          competitors are from their own material; verify before quoting.
        </p>
      </section>

      {/* per-competitor */}
      <section className="mx-auto max-w-[960px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(28px,4.5vw,48px)]">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9a9a9a]">
          head to head
        </div>
        <h2 className="max-w-[22ch] text-balance text-[clamp(22px,3vw,30px)] font-medium leading-[1.12] tracking-[-0.025em]">
          Where each one is strong, and how Soma differs.
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          {HEADTOHEAD.map((v) => (
            <article
              key={v.id}
              id={v.id}
              className="scroll-mt-[70px] rounded-2xl border border-[#ececec] bg-[#fafafa] p-[clamp(18px,3vw,26px)]"
            >
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-[20px] font-semibold tracking-[-0.02em]">
                  {v.name}
                </h3>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5f8b99]">
                  {v.tag}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-[14px_22px] sm:grid-cols-2">
                <div>
                  <h4 className="mb-[6px] flex items-center gap-[7px] font-mono text-[10px] uppercase tracking-[0.1em] text-[#9a9a9a]">
                    <span className="h-[6px] w-[6px] rounded-full bg-[#b0b0b0]" />
                    Where they&rsquo;re strong
                  </h4>
                  <p className="text-[14px] leading-[1.55] text-[#4a4a4a]">
                    {v.strong}
                  </p>
                </div>
                <div>
                  <h4 className="mb-[6px] flex items-center gap-[7px] font-mono text-[10px] uppercase tracking-[0.1em] text-[#9a9a9a]">
                    <span className="h-[6px] w-[6px] rounded-full bg-[#8FB3C0]" />
                    How Soma differs
                  </h4>
                  <p className="text-[14px] leading-[1.55] text-[#4a4a4a]">
                    {v.diff}
                  </p>
                </div>
              </div>
              {v.caveat ? (
                <div className="mt-4 border-t border-[#ececec] pt-[13px] text-[13px] leading-[1.55] text-[#9a9a9a]">
                  {v.caveat}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* guardrails — what we don't claim */}
      <section className="mx-auto max-w-[960px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(28px,4.5vw,48px)]">
        <div className="rounded-2xl border border-[#ececec] bg-[#fafafa] p-[clamp(20px,3.5vw,30px)]">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9a9a9a]">
            where we hold the line
          </div>
          <h2 className="text-[clamp(22px,3vw,30px)] font-medium leading-[1.12] tracking-[-0.025em]">
            What Soma does not claim.
          </h2>
          <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
            A comparison page that only lists strengths is a sales sheet. Here is
            what we refuse to say, on purpose, because our whole edge is being
            trusted by a reader who checks.
          </p>
          <ul className="mt-4 grid gap-[11px]">
            {[
              <>
                We do <strong className="font-semibold text-[#0a0a0a]">not</strong>{" "}
                claim to be more accurate than a human panel. That takes validation
                we are still running.
              </>,
              <>
                We do <strong className="font-semibold text-[#0a0a0a]">not</strong>{" "}
                claim the arc predicts retention. That is the outcome we are
                testing, framed as a roadmap rung, not a shipped feature.
              </>,
              <>
                We do <strong className="font-semibold text-[#0a0a0a]">not</strong>{" "}
                call the public model a moat. It isn&rsquo;t. The moat is
                validation, the product, and the data flywheel.
              </>,
              <>
                We <strong className="font-semibold text-[#0a0a0a]">do</strong>{" "}
                state each competitor&rsquo;s real strength, and we disclose the
                negative prior about whole-brain signal, because hiding it would be
                the fastest way to lose a careful reader.
              </>,
            ].map((li, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-[15px] leading-[1.5] text-[#4a4a4a]"
              >
                <span className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[#9fc7d4] text-[11px] text-[#5f8b99]">
                  ✓
                </span>
                <span className="min-w-0 flex-1">{li}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
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
      </section>
    </article>
  );
}
