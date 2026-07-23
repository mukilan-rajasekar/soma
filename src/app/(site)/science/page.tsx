import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "soma — the science: how it reads a video ad",
  description:
    "How Soma reads an average viewer's brain response to a video ad, second by second, straight from the file. Built on Meta's public TRIBE v2 encoder.",
};

export const dynamic = "force-dynamic";

// A small reading-guide sparkline. Illustrative shape only, teal on a faint baseline.
function Spark({ d, mid = false }: { d: string; mid?: boolean }) {
  return (
    <svg
      viewBox="0 0 120 46"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-[46px] w-full rounded-xl border border-line bg-fill"
    >
      <line
        x1="0"
        y1={mid ? 24 : 34}
        x2="120"
        y2={mid ? 24 : 34}
        strokeWidth="1"
        strokeDasharray="3 4"
        className="stroke-line-2"
      />
      <path
        d={d}
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        className="stroke-accent"
      />
    </svg>
  );
}

const READING = [
  {
    name: "Strong hook",
    spark: "M4,32 C18,11 30,9 46,9 L116,11",
    mid: false,
    see: "Attention rises early and holds through the open.",
    read: "The first seconds landed and bought more time.",
  },
  {
    name: "Weak hook",
    spark: "M4,33 C13,10 19,10 25,12 C39,22 51,34 70,35 L116,35",
    mid: false,
    see: "A spike, then a fall back to baseline before the hook resolves.",
    read: "The opening got noticed but did not hold.",
  },
  {
    name: "Mid-video leak",
    spark: "M4,14 L36,13 C50,12 54,34 70,34 C86,34 92,18 116,16",
    mid: false,
    see: "The arc dims where a promised payoff should land.",
    read: "A slow stretch. This is the weak-spot the demo pins to the timeline.",
  },
  {
    name: "Flat feeling",
    spark: "M4,24 C28,22 48,26 70,24 C92,22 102,25 116,24",
    mid: true,
    see: "Valence and arousal stay near neutral through a beat meant to land.",
    read: "The moment is not moving anyone. The feeling reads flat.",
  },
  {
    name: "Strong close",
    spark: "M4,30 L70,29 C92,27 102,12 116,9",
    mid: false,
    see: "A late lift in feeling heading into the call to action.",
    read: "The ending is paying off. Feeling lifts into the close.",
  },
];

const ROADMAP = [
  {
    k: "R0",
    now: true,
    h: "Encoder + attention arc",
    p: "TRIBE runs the video; Soma reads a transparent attention arc off it, second by second.",
  },
  {
    k: "R1",
    now: false,
    h: "Attention, learned",
    p: "Train our own read-out head on public attention data. The first weights that are ours.",
  },
  {
    k: "R2",
    now: false,
    h: "Two-dimensional feeling",
    p: "The same approach reads valence and arousal — the two dimensions of feeling.",
  },
  {
    k: "R3",
    now: false,
    h: "Outcomes, and the data flywheel",
    p: "Retrain on partner ads paired with real audience reactions and retention. This is where Soma predicts where you lose people.",
  },
  {
    k: "R4",
    now: false,
    h: "Named emotions",
    p: "Amusement, tension, warmth — each named emotion read straight from the ad.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink-3">
      {children}
    </div>
  );
}

export default async function SciencePage() {
  return (
    <article>
      {/* header */}
      <header className="mx-auto max-w-[920px] px-[clamp(16px,4vw,24px)] pb-8 pt-[clamp(26px,5vw,44px)]">
        <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-accent-2">
          <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
          The science
        </div>
        <h1 className="max-w-[16ch] text-balance text-hero text-ink">
          How Soma reads a video{" "}
          <span className="font-serif font-normal italic">
            ad
          </span>
          .
        </h1>
        <p className="mt-[18px] max-w-[60ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
          Soma reads how an average viewer&rsquo;s brain responds to a video
          ad, second by second, straight from the file. This page walks through
          how that works &mdash; the ground truth it is built on, the model that
          powers it, and the arc you read.
        </p>
      </header>

      {/* 01 — the gap */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>01 · the gap</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-section text-ink">
          Retention graphs tell you where. Not why.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          Your analytics show the drop-off. At second 14, half the viewers are
          gone. What they cannot show is the reason. Was it the cut, the audio,
          the pacing, or a promise the ad set up and never paid off?
        </p>
        <p className="mt-3 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          Surveys do not recover it either. People are poor witnesses to their
          own attention, so asking &ldquo;what did you find engaging?&rdquo;
          returns a story assembled after the fact, not what happened while they
          watched. To get at the why, you have to look at the response itself, as
          it happens. For a long time that meant a scanner and a lab.
        </p>
      </section>

      {/* 02 — ground truth */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>02 · ground truth</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-section text-ink">
          fMRI is the ground truth for brain response.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          An fMRI scanner tracks blood oxygen across the brain. When a region
          works harder, it pulls in more oxygen, and the scan picks that up (the
          BOLD signal). Show someone a video in the scanner and you get a map of
          which regions responded, how strongly, and when. Not what they reported
          afterward. What their brain did during the ad.
        </p>
        <figure className="mt-6 rounded-2xl border border-line bg-fill p-[clamp(16px,3vw,26px)]">
          <svg
            viewBox="0 0 640 190"
            role="img"
            aria-label="A stimulus onset followed by a delayed rise and fall in the blood-oxygen signal."
            className="block h-auto w-full"
          >
            <line x1="60" y1="150" x2="610" y2="150" strokeWidth="1.2" className="stroke-line-2" />
            <line x1="60" y1="26" x2="60" y2="150" strokeWidth="1.2" className="stroke-line-2" />
            <text x="60" y="172" fontSize="11" className="fill-ink-3">
              time →
            </text>
            <text x="22" y="30" fontSize="11" className="fill-ink-3">
              BOLD
            </text>
            <line x1="150" y1="30" x2="150" y2="150" strokeWidth="1.2" strokeDasharray="3 4" opacity=".7" className="stroke-accent-2" />
            <circle cx="150" cy="150" r="4" className="fill-accent-2" />
            <text x="150" y="24" fontSize="10.5" textAnchor="middle" className="fill-accent-2">
              stimulus
            </text>
            <path
              d="M60,150 L150,150 C185,150 195,52 235,44 C275,36 300,150 360,150 C400,150 420,158 470,150 L610,150"
              fill="none"
              strokeWidth="2.4"
              strokeLinecap="round"
              className="stroke-accent"
            />
            <line x1="235" y1="44" x2="235" y2="150" strokeWidth="1" className="stroke-line-2" />
            <text x="245" y="42" fontSize="10.5" className="fill-ink-2">
              peak response, a few seconds later
            </text>
          </svg>
          <figcaption className="mt-3 text-center text-[11px] leading-[1.55] text-ink-3">
            The blood-oxygen response lags the stimulus by a few seconds and then
            settles. TRIBE learns this signal from real scans.
          </figcaption>
        </figure>
        <p className="mt-6 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          Running real fMRI is slow and costly, which is why this stayed inside
          research labs. Scanner time runs into the hundreds of dollars an hour,
          and reading the data takes training. A model that predicts the response
          changes what is possible.
        </p>
      </section>

      {/* 03 — the model */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>03 · the model</Eyebrow>
        <h2 className="max-w-[22ch] text-balance text-section text-ink">
          TRIBE v2 predicts that response without a scanner.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          In 2025, Meta released TRIBE &mdash; the model that won the Algonauts
          2025 brain-encoding challenge, 1st of 263 teams &mdash; and then TRIBE
          v2, the larger successor we run. Give it a video and it predicts the
          cortical response that video would produce, at one-second resolution
          across about 20,000 points on the cortical surface. It learned the
          mapping from real 3-tesla fMRI recordings of people watching video.
        </p>
        <p className="mt-3 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          The model is public and the science is reproducible &mdash; anyone can
          download the same weights. Soma builds its read-out on top, turning a
          research-grade encoder into a product that reads ads.
        </p>
      </section>

      {/* 04 — the chain */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>04 · the chain</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-section text-ink">
          Three steps, from video to feeling.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          Everything Soma shows runs through the same three steps. Here is how a
          video becomes an arc you can read.
        </p>
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-stretch">
          {[
            { lab: "Video ad", sub: "the file you upload" },
            { lab: "Brain activation", sub: "~20k points · 1 Hz" },
            { lab: "Summary numbers", sub: "a few signals / sec" },
            { lab: "Attention & feeling", sub: "the arc you read" },
          ].map((n, idx, arr) => (
            <div key={n.lab} className="contents md:flex md:flex-1 md:items-center">
              <div className="flex flex-1 flex-col gap-[6px] rounded-2xl border border-line bg-fill p-4">
                <span className="text-[14px] font-semibold tracking-[-0.01em]">
                  {n.lab}
                </span>
                <span className="text-[11.5px] leading-[1.4] text-ink-3">
                  {n.sub}
                </span>
              </div>
              {idx < arr.length - 1 ? (
                <div className="flex shrink-0 items-center justify-center px-1 py-1 text-ink-3 md:w-[64px] md:flex-col md:gap-[6px]">
                  <span className="text-[15px]">&rarr;</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          <strong className="font-semibold text-ink">
            Step one, video to activation,
          </strong>{" "}
          is TRIBE, benchmarked against real scans.{" "}
          <strong className="font-semibold text-ink">
            Step two, activation to numbers,
          </strong>{" "}
          distills the activation map into a handful of signals per second.{" "}
          <strong className="font-semibold text-ink">
            Step three, numbers to attention and feeling,
          </strong>{" "}
          is Soma&rsquo;s read &mdash; the arc you see in the demo.
        </p>
      </section>

      {/* 05 — how to read the arc */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>05 · how to read the arc</Eyebrow>
        <h2 className="max-w-[22ch] text-balance text-section text-ink">
          A few shapes come up again and again.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          Once the arc is on screen, the same handful of patterns show up across
          ads. Here is how Soma reads them.
        </p>
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[14px]">
          {READING.map((c) => (
            <article
              key={c.name}
              className="flex flex-col gap-[10px] rounded-2xl border border-line bg-paper p-4"
            >
              <div className="flex items-center justify-between gap-[10px]">
                <span className="text-[15.5px] font-semibold tracking-[-0.01em]">
                  {c.name}
                </span>
              </div>
              <Spark d={c.spark} mid={c.mid} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[5px]">
                <dt className="pt-[2px] text-[9.5px] uppercase tracking-[0.08em] text-ink-3">
                  see
                </dt>
                <dd className="text-[13px] leading-[1.5] text-ink-2">
                  {c.see}
                </dd>
                <dt className="pt-[2px] text-[9.5px] uppercase tracking-[0.08em] text-ink-3">
                  read
                </dt>
                <dd className="text-[13px] leading-[1.5] text-ink-2">
                  {c.read}
                </dd>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {/* 06 — the roadmap */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>06 · the roadmap</Eyebrow>
        <h2 className="max-w-[22ch] text-balance text-section text-ink">
          Where Soma goes next.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          This is the order we climb, each release reading the ad more deeply
          than the last.
        </p>
        <div className="mt-6 flex flex-col gap-[2px]">
          {ROADMAP.map((r) => (
            <div
              key={r.k}
              className="flex items-start gap-4 border border-line bg-fill p-[15px_18px] first:rounded-t-2xl last:rounded-b-2xl"
            >
              <span className="w-[34px] shrink-0 pt-[1px] text-[12px] font-semibold text-accent-2">
                {r.k}
              </span>
              <span
                className={`w-[5px] self-stretch rounded-[3px] ${
                  r.now ? "bg-ink" : "bg-line-2"
                }`}
              />
              <div className="flex-1">
                <h3 className="mb-[3px] text-ui font-medium">
                  {r.h}
                  {r.now ? (
                    <span className="ml-2 text-[9.5px] uppercase tracking-[0.1em] text-accent-2">
                      you are here
                    </span>
                  ) : null}
                </h3>
                <p className="max-w-[62ch] text-[13px] leading-[1.5] text-ink-3">
                  {r.p}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-paper transition-colors hover:bg-ink/85"
          >
            See it on a real ad
          </Link>
          <Link
            href="/compare"
            className="inline-flex items-center gap-2 rounded-xl border border-line-2 px-5 py-[13px] text-ui font-medium text-ink transition-colors hover:border-ink"
          >
            How Soma compares
          </Link>
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 rounded-xl border border-line-2 px-5 py-[13px] text-ui font-medium text-ink transition-colors hover:border-ink"
          >
            Read the FAQ
          </Link>
        </div>
      </section>
    </article>
  );
}
