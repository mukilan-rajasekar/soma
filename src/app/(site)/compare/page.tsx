import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "soma vs the field — human panels, synthetic, VidCognition",
  description:
    "How Soma compares to human-panel pre-testing (Realeyes, Neurons, System1, Nielsen) and synthetic LLM panels (Aaru, Simile). Soma reads the actual cortical response straight from the video file.",
};

// Comparison matrix cell mark.
function Mark({ kind }: { kind: "y" | "n" | "p" }) {
  const map = {
    y: { ch: "✓", cls: "border-ink text-ink" },
    n: { ch: "–", cls: "border-line text-ink-3" },
    p: { ch: "~", cls: "border-line-2 text-ink-2" },
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
    src: "biology",
    name: "Brain response, from the file",
    who: "A model trained on real fMRI reads the cortical response.",
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
      { text: "cortical response" },
      { text: "cortical response" },
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
  // HOURS, NOT MINUTES, and the row is still won. The comparison that matters here is
  // against a recruited panel's DAYS, and the honest turnaround is what ServiceTiers and
  // /demo's closing frame both already print ("turnaround in hours", "hours, not a research
  // cycle"). A minutes claim on this page put the site in disagreement with itself on the one
  // number a buyer schedules around. Restore "minutes" only when a run actually returns in
  // minutes — that is a runner change, not a copy change.
  {
    label: "Result in hours",
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
];

const HEADTOHEAD = [
  {
    id: "vs-realeyes",
    name: "vs Realeyes",
    tag: "webcam facial-coding + eye-tracking",
    strong:
      "Real human reactions on camera. An established brand with agency trust and years of normative data.",
    diff: (
      <>
        We read from the{" "}
        <strong className="font-semibold text-ink">file</strong>. No webcam,
        no recruited panel, no scheduling, in hours at a fraction of the cost, so
        you test every variant. Their read is a facial proxy for an internal state;
        ours is the cortical state itself.
      </>
    ),
    caveat: (
      <>
        <strong className="font-semibold text-ink-2">
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
        <strong className="font-semibold text-ink">where the eye goes</strong>
        . Soma reads the{" "}
        <strong className="font-semibold text-ink">
          full cortical response
        </strong>
        , attention and an affect read, from a brain-encoding model. We are
        priced for performance teams, not five-figure enterprise contracts.
      </>
    ),
    caveat: (
      <>
        Pricing figure (about &euro;15,000/year for five seats) is from a
        third-party page; verify before quoting.
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
        Two real forks.{" "}
        <strong className="font-semibold text-ink">Buyer:</strong> they
        sell creators a hook score; we sell performance teams a decision instrument
        tied to real media spend and a data flywheel.{" "}
        <strong className="font-semibold text-ink">Depth:</strong> they stop at
        a hook score on the shared model; we turn the read into a media-spend
        decision backed by real outcome data.
      </>
    ),
    caveat: (
      <>
        Verify their current claims and pricing before citing them by name in
        public.
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
        <strong className="font-semibold text-ink">No biology.</strong> They
        predict what a person might{" "}
        <strong className="font-semibold text-ink">say</strong>, and LLM
        personas lean toward agreeable, plausible answers. We read the actual
        neural response from a model trained on real fMRI, reproducible run to run.
      </>
    ),
    caveat: null,
  },
];

export default function ComparePage() {
  return (
    <article>
      {/* header */}
      <header className="mx-auto max-w-[960px] px-[clamp(16px,4vw,24px)] pb-6 pt-[clamp(26px,5vw,44px)]">
        <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-ink-3">
          <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
          How Soma compares
        </div>
        <h1 className="max-w-[18ch] text-balance text-hero text-ink">
          Read from the file. Not a panel, a webcam, or an{" "}
          <span className="font-serif font-normal italic">LLM guessing</span>.
        </h1>
        <p className="mt-[18px] max-w-[64ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
          Everyone else measures reactions from{" "}
          <strong className="font-semibold text-ink">recruited humans</strong>{" "}
          (panels, webcams, surveys) or{" "}
          <strong className="font-semibold text-ink">simulates</strong> them
          by prompting an LLM to role-play a person. Soma reads the{" "}
          <strong className="font-semibold text-ink">
            actual cortical response
          </strong>{" "}
          straight from the video file.
        </p>
      </header>

      {/* signal source strip */}
      <section className="mx-auto max-w-[960px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(28px,4.5vw,48px)]">
        <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink-3">
          the real difference · where the signal comes from
        </div>
        <h2 className="max-w-[22ch] text-balance text-section text-ink">
          Same output shape. Different source.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
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
                  ? "border-line-2 bg-fill"
                  : "border-line bg-fill"
              }`}
            >
              <div
                className={`text-[10px] uppercase tracking-[0.1em] ${
                  c.us ? "text-ink" : "text-ink-3"
                }`}
              >
                {c.src}
              </div>
              <div className="text-[15.5px] font-semibold tracking-[-0.01em]">
                {c.name}
              </div>
              <div className="text-[12.5px] leading-[1.5] text-ink-2">
                {c.who}{" "}
                <strong className="font-semibold text-ink">{c.tag}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* matrix */}
      <section className="mx-auto max-w-[960px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(28px,4.5vw,48px)]">
        <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink-3">
          at a glance
        </div>
        <h2 className="max-w-[22ch] text-balance text-section text-ink">
          The comparison in one table.
        </h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr>
                <th className="border-b border-line px-3 py-[15px] text-left align-bottom text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3">
                  &nbsp;
                </th>
                {COLS.map((c, i) => (
                  <th
                    key={c}
                    className={`border-b border-line px-3 py-[15px] text-center align-bottom text-[13.5px] font-semibold tracking-[-0.01em] ${
                      i === 3 ? "bg-fill text-ink" : "text-ink-2"
                    }`}
                  >
                    {c}
                    {COLSUB[i] ? (
                      <span className="mt-1 block text-[10px] font-normal text-ink-3">
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
                  <th className="whitespace-nowrap border-b border-line px-[14px] py-[13px] text-left text-[14px] font-medium text-ink">
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`border-b border-line px-3 py-[13px] text-center align-middle ${
                        i === 3
                          ? "bg-fill text-ink"
                          : "text-ink-2"
                      }`}
                    >
                      {cell.mark ? <Mark kind={cell.mark} /> : null}
                      {cell.text ? cell.text : null}
                      {cell.sub ? (
                        <span
                          className={`mt-1 block text-[10px] ${
                            i === 3 ? "text-ink" : "text-ink-3"
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
        <p className="mt-[14px] max-w-[70ch] text-[13px] leading-[1.6] text-ink-3">
          Soma competes on source, speed, and cost: the actual cortical response,
          read from the file, in hours, cheap enough for every cut. Figures for
          named competitors are from their own material; verify before quoting.
        </p>
      </section>

      {/* per-competitor */}
      <section className="mx-auto max-w-[960px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(28px,4.5vw,48px)]">
        <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink-3">
          head to head
        </div>
        <h2 className="max-w-[22ch] text-balance text-section text-ink">
          Where each one is strong, and how Soma differs.
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          {HEADTOHEAD.map((v) => (
            <article
              key={v.id}
              id={v.id}
              className="scroll-mt-[70px] rounded-2xl border border-line bg-fill p-[clamp(18px,3vw,26px)]"
            >
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-[20px] font-semibold tracking-[-0.02em]">
                  {v.name}
                </h3>
                <span className="text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                  {v.tag}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-[14px_22px] sm:grid-cols-2">
                <div>
                  <h4 className="mb-[6px] flex items-center gap-[7px] text-[10px] uppercase tracking-[0.1em] text-ink-3">
                    <span className="h-[6px] w-[6px] rounded-full bg-ink-3" />
                    Where they&rsquo;re strong
                  </h4>
                  <p className="text-[14px] leading-[1.55] text-ink-2">
                    {v.strong}
                  </p>
                </div>
                <div>
                  <h4 className="mb-[6px] flex items-center gap-[7px] text-[10px] uppercase tracking-[0.1em] text-ink-3">
                    <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
                    How Soma differs
                  </h4>
                  <p className="text-[14px] leading-[1.55] text-ink-2">
                    {v.diff}
                  </p>
                </div>
              </div>
              {v.caveat ? (
                <div className="mt-4 border-t border-line pt-[13px] text-[13px] leading-[1.55] text-ink-3">
                  {v.caveat}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* guardrails — what we don't claim */}
      <section className="mx-auto max-w-[960px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(28px,4.5vw,48px)]">
        <div className="rounded-2xl border border-line bg-fill p-[clamp(20px,3.5vw,30px)]">
          <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink-3">
            the bottom line
          </div>
          <h2 className="text-section text-ink">
            Why teams pick Soma.
          </h2>
          <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
            Soma reads how an ad earns attention, holds comprehension, and lands
            in the brain, straight from the file, in hours, at a fraction of
            panel cost, so you test every cut.
          </p>
          <ul className="mt-4 grid gap-[11px]">
            {[
              <>
                The signal is the{" "}
                <strong className="font-semibold text-ink">
                  actual cortical response
                </strong>
                , read from the file, not a webcam read or an LLM guess.
              </>,
              <>
                A result in{" "}
                <strong className="font-semibold text-ink">hours</strong>, not
                days, and cheap enough to run on every variant.
              </>,
              <>
                Built for{" "}
                <strong className="font-semibold text-ink">
                  performance teams
                </strong>{" "}
                shipping dozens of paid-social videos a week.
              </>,
              <>
                Every read ties to{" "}
                <strong className="font-semibold text-ink">
                  real media spend
                </strong>{" "}
                and the data flywheel that compounds with every campaign.
              </>,
            ].map((li, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-[15px] leading-[1.5] text-ink-2"
              >
                <span className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-line-2 text-[11px] text-ink">
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
      </section>
    </article>
  );
}
