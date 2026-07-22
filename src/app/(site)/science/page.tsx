import type { Metadata } from "next";
import Link from "next/link";
import Tier from "@/components/site/Tier";
import { readAdBacktest, viewAdBacktest } from "@/lib/ad-backtest";

export const metadata: Metadata = {
  title: "soma — the science: what it measures, and what it doesn't",
  description:
    "How Soma predicts an average viewer's brain response to a video ad from the file, which part is proven, and which part we're still testing. Built on Meta's public TRIBE v2 encoder.",
};

// Read ad_backtest.json at REQUEST time (no build-time snapshot), so a freshly published
// run shows up without a redeploy and a null is never quietly cached as stale.
export const dynamic = "force-dynamic";

// A small reading-guide sparkline. Illustrative shape only, teal on a faint baseline.
function Spark({ d, mid = false }: { d: string; mid?: boolean }) {
  return (
    <svg
      viewBox="0 0 120 46"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-[46px] w-full rounded-xl border border-[#ececec] bg-[#f5f5f5]"
    >
      <line
        x1="0"
        y1={mid ? 24 : 34}
        x2="120"
        y2={mid ? 24 : 34}
        stroke="#d8d8d8"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <path
        d={d}
        fill="none"
        stroke="#8FB3C0"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const READING = [
  {
    name: "Strong hook",
    variant: "validating" as const,
    tier: "validating",
    spark: "M4,32 C18,11 30,9 46,9 L116,11",
    mid: false,
    see: "Attention rises early and holds through the open.",
    read: "The first seconds landed and bought more time.",
    wrong: "ads with this shape drop off as fast as ads without it.",
  },
  {
    name: "Weak hook",
    variant: "validating" as const,
    tier: "validating",
    spark: "M4,33 C13,10 19,10 25,12 C39,22 51,34 70,35 L116,35",
    mid: false,
    see: "A spike, then a fall back to baseline before the hook resolves.",
    read: "The opening got noticed but did not hold.",
    wrong: "these ads retain as well as ones that sustain the rise.",
  },
  {
    name: "Mid-video leak",
    variant: "validating" as const,
    tier: "validating",
    spark: "M4,14 L36,13 C50,12 54,34 70,34 C86,34 92,18 116,16",
    mid: false,
    see: "The arc dims where a promised payoff should land.",
    read: "A slow stretch. This is the weak-spot the demo pins to the timeline.",
    wrong: "the flagged second is not where viewers actually leave.",
  },
  {
    name: "Flat feeling",
    variant: "hypothesis" as const,
    tier: "hypothesis",
    spark: "M4,24 C28,22 48,26 70,24 C92,22 102,25 116,24",
    mid: true,
    see: "Valence and arousal stay near neutral through a beat meant to land.",
    read: "The moment may not be moving anyone. The affect read is an unproven proxy.",
    wrong: "the proxy fails to track LIRIS human affect ratings.",
  },
  {
    name: "Strong close",
    variant: "hypothesis" as const,
    tier: "hypothesis",
    spark: "M4,30 L70,29 C92,27 102,12 116,9",
    mid: false,
    see: "A late lift in feeling heading into the call to action.",
    read: "The ending may be paying off. Same caveat: affect is a proxy, not a decoder.",
    wrong: "the lift does not line up with real end-of-video response.",
  },
];

const ROADMAP = [
  {
    k: "R0",
    now: true,
    h: "Frozen encoder + honest attention arc",
    p: "TRIBE runs the video; we read a transparent attention arc off it and badge it as a hypothesis under test.",
  },
  {
    k: "R1",
    now: false,
    h: "Attention, learned and validated",
    p: "Train our own read-out head on public attention data, checked leave-one-video-out. The first weights that are honestly ours.",
  },
  {
    k: "R2",
    now: false,
    h: "Two-dimensional feeling",
    p: "The same approach reads valence and arousal against public human-labeled data, every row badged as a proxy.",
  },
  {
    k: "R3",
    now: false,
    h: "Outcomes, and the data flywheel",
    p: "Retrain on partner ads paired with real audience reactions and retention. This is where “predicts where you lose people” earns its claim.",
  },
  {
    k: "R4",
    now: false,
    h: "Named emotions",
    p: "Amusement, tension, warmth, each one earned by a held-out test, never before.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9a9a9a]">
      {children}
    </div>
  );
}

export default async function SciencePage() {
  const adbt = viewAdBacktest(await readAdBacktest());

  return (
    <article>
      {/* header */}
      <header className="mx-auto max-w-[920px] px-[clamp(16px,4vw,24px)] pb-8 pt-[clamp(26px,5vw,44px)]">
        <div className="mb-4 inline-flex items-center gap-[9px] font-mono text-[11px] uppercase tracking-[0.18em] text-[#5f8b99]">
          <span className="h-[6px] w-[6px] rounded-full bg-[#8FB3C0]" />
          The science
        </div>
        <h1 className="max-w-[16ch] text-balance text-[clamp(30px,5.2vw,54px)] font-medium leading-[1.04] tracking-[-0.03em]">
          What Soma measures, and{" "}
          <span className="font-serif font-normal italic">
            what it doesn&rsquo;t
          </span>
          .
        </h1>
        <p className="mt-[18px] max-w-[60ch] text-pretty text-[clamp(15.5px,1.8vw,18px)] leading-[1.5] text-[#4a4a4a]">
          Soma predicts how an average viewer&rsquo;s brain responds to a video
          ad, second by second, straight from the file. This page walks through
          how that works, which part is proven, and which part we are still
          testing. We label both, because the line between them is the point.
        </p>
      </header>

      {/* 01 — the gap */}
      <section className="mx-auto max-w-[920px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>01 · the gap</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-[clamp(23px,3.1vw,32px)] font-medium leading-[1.1] tracking-[-0.025em]">
          Retention graphs tell you where. Not why.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          Your analytics show the drop-off. At second 14, half the viewers are
          gone. What they cannot show is the reason. Was it the cut, the audio,
          the pacing, or a promise the ad set up and never paid off?
        </p>
        <p className="mt-3 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          Surveys do not recover it either. People are poor witnesses to their
          own attention, so asking &ldquo;what did you find engaging?&rdquo;
          returns a story assembled after the fact, not what happened while they
          watched. To get at the why, you have to look at the response itself, as
          it happens. For a long time that meant a scanner and a lab.
        </p>
      </section>

      {/* 02 — ground truth */}
      <section className="mx-auto max-w-[920px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>02 · ground truth</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-[clamp(23px,3.1vw,32px)] font-medium leading-[1.1] tracking-[-0.025em]">
          fMRI is the ground truth for brain response.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          An fMRI scanner tracks blood oxygen across the brain. When a region
          works harder, it pulls in more oxygen, and the scan picks that up (the
          BOLD signal). Show someone a video in the scanner and you get a map of
          which regions responded, how strongly, and when. Not what they reported
          afterward. What their brain did during the ad.
        </p>
        <figure className="mt-6 rounded-2xl border border-[#ececec] bg-[#fafafa] p-[clamp(16px,3vw,26px)]">
          <svg
            viewBox="0 0 640 190"
            role="img"
            aria-label="A stimulus onset followed by a delayed rise and fall in the blood-oxygen signal."
            className="block h-auto w-full"
          >
            <line x1="60" y1="150" x2="610" y2="150" stroke="#d8d8d8" strokeWidth="1.2" />
            <line x1="60" y1="26" x2="60" y2="150" stroke="#d8d8d8" strokeWidth="1.2" />
            <text x="60" y="172" fill="#9a9a9a" fontFamily="ui-monospace,monospace" fontSize="11">
              time →
            </text>
            <text x="22" y="30" fill="#9a9a9a" fontFamily="ui-monospace,monospace" fontSize="11">
              BOLD
            </text>
            <line x1="150" y1="30" x2="150" y2="150" stroke="#8FB3C0" strokeWidth="1.2" strokeDasharray="3 4" opacity=".7" />
            <circle cx="150" cy="150" r="4" fill="#8FB3C0" />
            <text x="150" y="24" fill="#5f8b99" fontFamily="ui-monospace,monospace" fontSize="10.5" textAnchor="middle">
              stimulus
            </text>
            <path
              d="M60,150 L150,150 C185,150 195,52 235,44 C275,36 300,150 360,150 C400,150 420,158 470,150 L610,150"
              fill="none"
              stroke="#5f8b99"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <line x1="235" y1="44" x2="235" y2="150" stroke="#d8d8d8" strokeWidth="1" />
            <text x="245" y="42" fill="#6b6b6b" fontFamily="ui-monospace,monospace" fontSize="10.5">
              peak response, a few seconds later
            </text>
          </svg>
          <figcaption className="mt-3 text-center font-mono text-[11px] leading-[1.55] text-[#9a9a9a]">
            The blood-oxygen response lags the stimulus by a few seconds and then
            settles. TRIBE learns this signal from real scans.
          </figcaption>
        </figure>
        <p className="mt-6 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          Running real fMRI is slow and costly, which is why this stayed inside
          research labs. Scanner time runs into the hundreds of dollars an hour,
          and reading the data takes training. A model that predicts the response
          changes what is possible.
        </p>
      </section>

      {/* 03 — the model */}
      <section className="mx-auto max-w-[920px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>03 · the model</Eyebrow>
        <h2 className="max-w-[22ch] text-balance text-[clamp(23px,3.1vw,32px)] font-medium leading-[1.1] tracking-[-0.025em]">
          TRIBE v2 predicts that response without a scanner.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          In 2025, Meta released TRIBE &mdash; the model that won the Algonauts
          2025 brain-encoding challenge, 1st of 263 teams &mdash; and then TRIBE
          v2, the larger successor we run. Give it a video and it predicts the
          cortical response that video would produce, at one-second resolution
          across about 20,000 points on the cortical surface. It learned the
          mapping from real 3-tesla fMRI recordings of people watching video.
        </p>
        <p className="mt-3 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          The model is public. Anyone can download the same weights. That cuts
          two ways for us: the science is reproducible, and the model by itself is
          not a moat for anyone. We build the read-out on top of it, and we say
          plainly that the encoder is Meta&rsquo;s, not ours.
        </p>
        <div className="mt-6 rounded-2xl border border-[#ecd9a8] bg-[#fdfaf1] p-[clamp(16px,3vw,22px)]">
          <div className="mb-[9px] flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16.5px] font-semibold tracking-[-0.01em]">
              About that &ldquo;92%&rdquo;
            </h3>
            <Tier variant="validated">video → activation: validated</Tier>
          </div>
          <p className="max-w-[64ch] text-pretty text-[14.5px] leading-[1.6] text-[#4a4a4a]">
            You&rsquo;ll see a &ldquo;
            <strong className="font-semibold text-[#0a0a0a]">
              92% correlation with fMRI
            </strong>
            &rdquo; figure quoted by other brain-AI tools and attributed to Meta.
            We can&rsquo;t source it to any Meta publication, so we don&rsquo;t
            use it. Meta&rsquo;s TRIBE actually reports a mean correlation of
            about <strong className="font-semibold text-[#0a0a0a]">0.21</strong>{" "}
            across ~1,000 cortical regions on held-out data &mdash; roughly half
            of the measurable ceiling &mdash; with TRIBE v2 several-fold better
            again. Either way, that number is the accuracy of{" "}
            <strong className="font-semibold text-[#0a0a0a]">
              video&nbsp;→&nbsp;brain&nbsp;activation
            </strong>
            : it says nothing about whether activation predicts whether someone
            keeps watching. That next step is a separate question, and it is the
            one we test in the open.
          </p>
        </div>
      </section>

      {/* 04 — the chain */}
      <section className="mx-auto max-w-[920px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>04 · the chain</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-[clamp(23px,3.1vw,32px)] font-medium leading-[1.1] tracking-[-0.025em]">
          Three steps. Only the first is proven.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          Everything Soma shows runs through the same three steps. Pulling them
          apart is the honest way to look at the product, because the three do not
          carry the same weight of evidence.
        </p>
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-stretch">
          {[
            { lab: "Video ad", sub: "the file you upload" },
            { lab: "Brain activation", sub: "~20k points · 1 Hz" },
            { lab: "Summary numbers", sub: "a few signals / sec" },
            { lab: "Attention & feeling", sub: "the arc you read" },
          ].map((n, idx, arr) => (
            <div key={n.lab} className="contents md:flex md:flex-1 md:items-center">
              <div className="flex flex-1 flex-col gap-[6px] rounded-2xl border border-[#ececec] bg-[#fafafa] p-4">
                <span className="text-[14px] font-semibold tracking-[-0.01em]">
                  {n.lab}
                </span>
                <span className="font-mono text-[11.5px] leading-[1.4] text-[#9a9a9a]">
                  {n.sub}
                </span>
              </div>
              {idx < arr.length - 1 ? (
                <div className="flex shrink-0 items-center justify-center px-1 py-1 text-[#c8c8c8] md:w-[64px] md:flex-col md:gap-[6px]">
                  <span className="font-mono text-[15px]">&rarr;</span>
                  {idx === 0 ? (
                    <Tier variant="validated">proven</Tier>
                  ) : idx === 1 ? (
                    <Tier variant="neutral">descriptive</Tier>
                  ) : (
                    <Tier variant="validating">validating</Tier>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          <strong className="font-semibold text-[#0a0a0a]">
            Step one, video to activation,
          </strong>{" "}
          is TRIBE. Benchmarked against real scans. Not ours.{" "}
          <strong className="font-semibold text-[#0a0a0a]">
            Step two, activation to numbers,
          </strong>{" "}
          is arithmetic over the activation map, descriptive with no claim
          attached.{" "}
          <strong className="font-semibold text-[#0a0a0a]">
            Step three, numbers to attention and feeling,
          </strong>{" "}
          is our read. It is a hypothesis, and we are validating it now against
          real human data. When the demo labels a line &ldquo;attention,&rdquo; it
          is this third step, and it wears an amber badge for a reason.
        </p>
      </section>

      {/* 05 — the trap */}
      <section className="mx-auto max-w-[920px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>05 · the trap</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-[clamp(23px,3.1vw,32px)] font-medium leading-[1.1] tracking-[-0.025em]">
          A spike is not a feeling.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          The most common mistake in this field is reading a burst of activation
          as one specific emotion. The same peak could be interest, confusion,
          mild alarm, or noise. Activation on its own cannot tell you which. Only
          behavior settles it: did they keep watching? We will not claim a feeling
          from activation alone, and you should be wary of anyone who does.
        </p>
      </section>

      {/* 06 — how we test it */}
      <section className="mx-auto max-w-[920px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>06 · how we test it</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-[clamp(23px,3.1vw,32px)] font-medium leading-[1.1] tracking-[-0.025em]">
          We test the third step in the open.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          The question is whether the predicted arc tracks a real human attention
          curve. We test it inside a single video, second against second, on
          public data where the human answer already exists:{" "}
          <strong className="font-semibold text-[#0a0a0a]">TVSum</strong>, where
          20 people rated how interesting each shot was. We line our predicted arc
          up against theirs.
        </p>
        <p className="mt-3 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          A few guardrails keep the test honest. We compare the{" "}
          <strong className="font-semibold text-[#0a0a0a]">
            shape of the change
          </strong>{" "}
          second to second, not the slow drift, so a lucky trend cannot pass as
          signal. We shuffle the timing thousands of times to see what a random
          arc would score, and we only count what beats that. We check the
          predicted arc against a plain baseline of loudness, cuts, brightness,
          and motion, so we can tell whether the brain read adds anything over a
          dumb feature detector. And we write the plan down before we look, so a
          null result gets reported the same as a positive one.
        </p>

        <div className="mt-6 rounded-2xl border border-[#f0c9c4] bg-[#fdf4f2] p-[clamp(16px,3vw,22px)]">
          <div className="mb-[9px] flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16.5px] font-semibold tracking-[-0.01em]">
              The uncomfortable part, from us
            </h3>
            <Tier variant="hypothesis">disclosed prior</Tier>
          </div>
          <p className="max-w-[64ch] text-pretty text-[14.5px] leading-[1.6] text-[#4a4a4a]">
            A published result found that whole-brain activation does{" "}
            <strong className="font-semibold text-[#0a0a0a]">not</strong> predict
            which parts of a YouTube video get replayed. So the whole-cortex
            version of our signal is a likely dead end, and we treat it as the
            baseline to beat. The narrower, region-specific test is the one still
            open. We would rather you hear that from us than find it in diligence.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-[#ececec] bg-[#fafafa] p-[clamp(16px,3vw,22px)]">
          <div className="mb-[9px] flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16.5px] font-semibold tracking-[-0.01em]">
              What the first run actually showed
            </h3>
            <Tier variant="validating">validating · early · n=15</Tier>
          </div>
          <p className="max-w-[64ch] text-pretty text-[14.5px] leading-[1.6] text-[#4a4a4a]">
            We ran it on 15 TVSum clips. The{" "}
            <strong className="font-semibold text-[#0a0a0a]">raw</strong> arc came
            back <strong className="font-semibold text-[#0a0a0a]">null</strong>,
            exactly as pre-registered &mdash; and it does{" "}
            <strong className="font-semibold text-[#0a0a0a]">not</strong> beat the
            loudness/cuts/brightness/motion baseline (0 of 15 clips). The raw
            arithmetic arc, on its own, is not the product.
          </p>
          <p className="mt-3 max-w-[64ch] text-pretty text-[14.5px] leading-[1.6] text-[#4a4a4a]">
            But a small{" "}
            <strong className="font-semibold text-[#0a0a0a]">
              trained read-out
            </strong>{" "}
            over the region features <em className="italic">does</em> track the
            human interest curve, held out video by video: median rank
            correlation{" "}
            <strong className="font-semibold text-[#0a0a0a]">
              r&nbsp;≈&nbsp;0.20
            </strong>{" "}
            &mdash; about 87% of the agreement humans reach with each other &mdash;
            combined{" "}
            <strong className="font-semibold text-[#0a0a0a]">
              p&nbsp;=&nbsp;0.0003
            </strong>
            . And that signal{" "}
            <strong className="font-semibold text-[#0a0a0a]">survives</strong> the
            loudness/cuts/brightness/motion control (partial r&nbsp;≈&nbsp;0.18,
            p&nbsp;=&nbsp;0.0005), so it is not just re-deriving the edit.
          </p>
          <p className="mt-3 max-w-[64ch] text-pretty text-[14.5px] leading-[1.6] text-[#4a4a4a]">
            Honest limits, stated plainly: 15 videos, so any single clip is
            underpowered; TVSum measures{" "}
            <strong className="font-semibold text-[#0a0a0a]">interest</strong>{" "}
            &mdash; a public proxy, not ad retention; and the read-out is a{" "}
            <strong className="font-semibold text-[#0a0a0a]">
              learned hypothesis
            </strong>
            , not a validated engagement model. That is exactly how we report it.{" "}
            <span className="text-[#9a9a9a]">
              (Frozen snapshot of the first n=15 run.)
            </span>
          </p>
        </div>

        {/* ad-backtest block — HYDRATED at request time. Never green. */}
        <div className="mt-4 rounded-2xl border border-[#ececec] bg-[#fafafa] p-[clamp(16px,3vw,22px)]">
          <div className="mb-[9px] flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16.5px] font-semibold tracking-[-0.01em]">
              The next test: does it rank real <em className="italic">ads</em>?
            </h3>
            <Tier variant={adbt.tier}>{adbt.badge}</Tier>
          </div>
          <p className="max-w-[64ch] text-pretty text-[14.5px] leading-[1.6] text-[#4a4a4a]">
            TVSum measures interest inside one clip. The question a marketer
            actually asks is different: given a set of{" "}
            <strong className="font-semibold text-[#0a0a0a]">
              real ads that really ran
            </strong>
            , does our score pick the winner? So we run the same honest yardstick
            across ads &mdash; take ~15&ndash;30 ads with a known real outcome (a
            partner&rsquo;s own CPA / ThruPlay, or a public proxy like TikTok
            Top-Ads rank), score each one, and check whether our score ranks them
            by performance{" "}
            <strong className="font-semibold text-[#0a0a0a]">
              after removing loudness, cuts, and length
            </strong>{" "}
            &mdash; so we can&rsquo;t win just by re-detecting &ldquo;short and
            loud.&rdquo; Pre-registered primary, permutation null, effect floor,
            and the null gets reported like any other.
          </p>
          <p className="mt-3 max-w-[64ch] text-pretty text-[14.5px] leading-[1.6] text-[#4a4a4a]">
            This is the test that turns &ldquo;we can predict your winning
            ad&rdquo; from a hope into a number &mdash; and{" "}
            <strong className="font-semibold text-[#0a0a0a]">
              until that number clears the bar, we don&rsquo;t make the claim.
            </strong>{" "}
            <span className="text-[#6b6b6b]">{adbt.result}</span>
          </p>
        </div>
      </section>

      {/* 07 — how to read the arc */}
      <section className="mx-auto max-w-[920px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>07 · how to read the arc</Eyebrow>
        <h2 className="max-w-[22ch] text-balance text-[clamp(23px,3.1vw,32px)] font-medium leading-[1.1] tracking-[-0.025em]">
          A few shapes come up again and again.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          Once the arc is on screen, the same handful of patterns show up across
          ads. Here is how we read them today. Each is a working interpretation we
          are still testing, not a settled rule, so each carries its evidence tier
          and a note on what would prove it wrong.
        </p>
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[14px]">
          {READING.map((c) => (
            <article
              key={c.name}
              className="flex flex-col gap-[10px] rounded-2xl border border-[#ececec] bg-white p-4"
            >
              <div className="flex items-center justify-between gap-[10px]">
                <span className="text-[15.5px] font-semibold tracking-[-0.01em]">
                  {c.name}
                </span>
                <Tier variant={c.variant}>{c.tier}</Tier>
              </div>
              <Spark d={c.spark} mid={c.mid} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[5px]">
                <dt className="pt-[2px] font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#9a9a9a]">
                  see
                </dt>
                <dd className="text-[13px] leading-[1.5] text-[#4a4a4a]">
                  {c.see}
                </dd>
                <dt className="pt-[2px] font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#9a9a9a]">
                  read
                </dt>
                <dd className="text-[13px] leading-[1.5] text-[#4a4a4a]">
                  {c.read}
                </dd>
              </dl>
              <div className="border-t border-[#ececec] pt-[9px] text-[11.5px] leading-[1.5] text-[#9a9a9a]">
                <strong className="font-semibold text-[#6b6b6b]">
                  Wrong if:
                </strong>{" "}
                {c.wrong}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 08 — the roadmap */}
      <section className="mx-auto max-w-[920px] border-t border-[#ececec] px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>08 · the roadmap</Eyebrow>
        <h2 className="max-w-[22ch] text-balance text-[clamp(23px,3.1vw,32px)] font-medium leading-[1.1] tracking-[-0.025em]">
          We add a claim only when a test reproduces it.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-[#4a4a4a]">
          Each rung is earned by a held-out test, not asserted. This is the order
          we climb, and we do not skip ahead.
        </p>
        <div className="mt-6 flex flex-col gap-[2px]">
          {ROADMAP.map((r) => (
            <div
              key={r.k}
              className="flex items-start gap-4 border border-[#ececec] bg-[#fafafa] p-[15px_18px] first:rounded-t-2xl last:rounded-b-2xl"
            >
              <span className="w-[34px] shrink-0 pt-[1px] font-mono text-[12px] font-semibold text-[#5f8b99]">
                {r.k}
              </span>
              <span
                className={`w-[5px] self-stretch rounded-[3px] ${
                  r.now ? "bg-[#e0a52a]" : "bg-[#d8d8d8]"
                }`}
              />
              <div className="flex-1">
                <h3 className="mb-[3px] text-[15px] font-semibold">
                  {r.h}
                  {r.now ? (
                    <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#b47e00]">
                      you are here
                    </span>
                  ) : null}
                </h3>
                <p className="max-w-[62ch] text-[13px] leading-[1.5] text-[#9a9a9a]">
                  {r.p}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0a0a0a] px-5 py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-[#333]"
          >
            See it on a real ad
          </Link>
          <Link
            href="/compare"
            className="inline-flex items-center gap-2 rounded-xl border border-[#d8d8d8] px-5 py-[13px] text-[15px] font-semibold text-[#0a0a0a] transition-colors hover:border-[#0a0a0a]"
          >
            How Soma compares
          </Link>
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 rounded-xl border border-[#d8d8d8] px-5 py-[13px] text-[15px] font-semibold text-[#0a0a0a] transition-colors hover:border-[#0a0a0a]"
          >
            Read the FAQ
          </Link>
        </div>
      </section>
    </article>
  );
}
