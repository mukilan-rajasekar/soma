"use client";

import { useEffect, useState, type ReactNode } from "react";

const clamp = (n: number, len: number) => Math.max(0, Math.min(len - 1, n));

function Viz({ children }: { children: ReactNode }) {
  return (
    <div className="mt-[22px] inline-flex items-center gap-[9px] font-mono text-[12px] tracking-[0.02em] text-[#9a9a9a]">
      <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#8FB3C0]" />
      {children}
    </div>
  );
}

function Node({ children, pub = false }: { children: ReactNode; pub?: boolean }) {
  return (
    <span
      className={`rounded-[11px] border px-[13px] py-[9px] font-mono text-[12px] ${
        pub
          ? "border-[#8FB3C0] bg-[#f4fafc] text-[#0a0a0a]"
          : "border-[#ececec] bg-[#fafafa] text-[#4a4a4a]"
      }`}
    >
      {children}
    </span>
  );
}

function Arrow() {
  return <span className="font-mono text-[#b0b0b0]">&rarr;</span>;
}

const SLIDES: { kick: string; title: ReactNode; body: ReactNode }[] = [
  {
    kick: "The problem",
    title: (
      <>
        Brands spend billions on video ads and test them with{" "}
        <span className="font-serif font-normal italic">guesses</span>.
      </>
    ),
    body: (
      <>
        <p className="max-w-[70ch] text-[clamp(15px,1.5vw,18px)] leading-[1.62] text-[#4a4a4a]">
          Ad pre-testing is slow, expensive, and ungrounded. Panels and surveys
          take days to weeks and cost thousands per study &mdash; and they capture
          what people <strong className="text-[#0a0a0a]">say</strong>, not how a
          brain is likely to respond. Meanwhile a performance team ships dozens of
          paid-social videos a week; they can&rsquo;t wait for a panel, so they
          post and pray. Incumbents (Nielsen, System1, Realeyes) are built for a
          handful of hero spots. The high-volume, low-cost end &mdash; where most
          video actually gets made &mdash; is unserved.
        </p>
        <Viz>test 1, ship 30 blind.</Viz>
      </>
    ),
  },
  {
    kick: "The insight / wedge",
    title: (
      <>
        The brain&rsquo;s response to video is now a{" "}
        <span className="font-serif font-normal italic">public model</span>.
      </>
    ),
    body: (
      <>
        <p className="max-w-[70ch] text-[clamp(15px,1.5vw,18px)] leading-[1.62] text-[#4a4a4a]">
          Meta released <strong className="text-[#0a0a0a]">TRIBE</strong> &mdash;
          winner of Algonauts 2025 &mdash; which predicts second-by-second brain
          (fMRI) activation from video, benchmarked against real human scans. We
          don&rsquo;t reinvent the brain; we build the last mile on top of it:
          upload an ad, get a <strong className="text-[#0a0a0a]">predicted</strong>{" "}
          cortical response in minutes, from the file &mdash; no panel, no webcam,
          no survey. Our edge is turning that public brain model into the handful
          of signals advertisers actually act on. Competitors sell an opaque score
          you take on faith; we predict the actual cortical response &mdash;{" "}
          <strong className="text-[#0a0a0a]">
            transparent, reproducible, grounded in real biology.
          </strong>
        </p>
        <div className="mt-[22px] flex flex-wrap items-center gap-[10px]">
          <Node>ad video</Node>
          <Arrow />
          <Node pub>PUBLIC TRIBE (Algonauts-2025 winner)</Node>
          <Arrow />
          <Node>predicted cortical response</Node>
          <Arrow />
          <Node>interest + affect arcs</Node>
        </div>
      </>
    ),
  },
  {
    kick: "The product",
    title: (
      <>
        A <span className="font-serif font-normal italic">predicted</span>,
        group-average read of your ad &mdash; second by second.
      </>
    ),
    body: (
      <>
        <p className="max-w-[70ch] text-[clamp(15px,1.5vw,18px)] leading-[1.62] text-[#4a4a4a]">
          Upload a video. Soma runs TRIBE and reads off a{" "}
          <strong className="text-[#0a0a0a]">predicted attention arc</strong>{" "}
          (where the brain engages vs tunes out) and a{" "}
          <strong className="text-[#0a0a0a]">2D affect</strong> read (valence =
          feels good/bad, arousal = calm/excited). It flags weak spots in plain
          language: &ldquo;the model predicts attention drops at 0:07 &mdash; two
          seconds before your logo lands.&rdquo; Repeatable, per-file, in minutes.
          A pre-flight check before spend, not a research project after it.
        </p>
        <Viz>
          Live demo: the ad plays with the predicted arcs scrubbing in sync + a
          weak-spot flag pinned to the timeline. Real screen recording, not a
          mockup.
        </Viz>
      </>
    ),
  },
  {
    kick: "The science",
    title: (
      <>
        Grounded in{" "}
        <span className="font-serif font-normal italic">real biology</span> &mdash;
        benchmarked, reproducible.
      </>
    ),
    body: (
      <>
        <ul className="mt-4 flex max-w-[74ch] list-none flex-col gap-[11px]">
          {[
            <>
              <strong className="text-[#0a0a0a]">Video → brain activation.</strong>{" "}
              Meta&rsquo;s TRIBE&nbsp;v2, benchmarked against real fMRI and an
              Algonauts-2025 winner. The hard science &mdash; already public.
            </>,
            <>
              <strong className="text-[#0a0a0a]">Attention arc.</strong> Read off
              the predicted cortical response: where the ad holds moment to moment,
              with weak-spot callouts pinned to the timeline.
            </>,
            <>
              <strong className="text-[#0a0a0a]">2D affect.</strong> Valence and
              arousal from a-priori cortical regions (OFC, insula, ACC, STS)
              &mdash; pleasant vs unpleasant, calm vs excited.
            </>,
            <>
              <strong className="text-[#0a0a0a]">Reproducible, run to run.</strong>{" "}
              A public, transparent model &mdash; not an opaque panel you take on
              faith.
            </>,
          ].map((li, i) => (
            <li
              key={i}
              className="flex gap-[11px] text-[15.5px] leading-[1.5] text-[#4a4a4a]"
            >
              <span className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#8FB3C0]" />
              <span>{li}</span>
            </li>
          ))}
        </ul>
        <p className="mt-[18px] font-mono text-[10px] leading-[1.7] text-[#9a9a9a]">
          A digital fMRI of your ad, predicted from the file &mdash; the signal
          source neither the panel incumbents nor the LLM-persona tools can match.
        </p>
      </>
    ),
  },
  {
    kick: "Roadmap + moat",
    title: (
      <>
        A staircase to named emotions &mdash; each rung{" "}
        <span className="font-serif font-normal italic">earned</span> as we learn
        from real reactions.
      </>
    ),
    body: (
      <>
        <div className="mt-[22px] flex flex-wrap items-end gap-2">
          {[
            { r: "R0", t: "attention arc (live)", live: true },
            { r: "R1", t: "2D affect (shipping)", live: true },
            { r: "R2", t: "calibrated affect on real ads", live: false },
            { r: "R3", t: "a few discrete states", live: false },
            { r: "R4", t: "named emotions fMRI-grounded", live: false },
          ].map((s) => (
            <div
              key={s.r}
              className={`min-w-[112px] rounded-t-[12px] border p-[11px_13px] text-center font-mono text-[11px] leading-[1.4] ${
                s.live
                  ? "border-[#ecd9a8] bg-[#fdfaf1] text-[#0a0a0a]"
                  : "border-[#ececec] bg-[#fafafa] text-[#4a4a4a]"
              }`}
            >
              <span
                className={`mb-1 block text-[13px] font-bold ${
                  s.live ? "text-[#c08a1e]" : "text-[#0a0a0a]"
                }`}
              >
                {s.r}
              </span>
              {s.t}
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-[70ch] text-[clamp(15px,1.5vw,18px)] leading-[1.62] text-[#4a4a4a]">
          The moat is <strong className="text-[#0a0a0a]">not</strong> the public
          model. It&rsquo;s (1) the inference layer on top, (2) a proprietary{" "}
          <strong className="text-[#0a0a0a]">data flywheel</strong> &mdash; ads ×
          real reactions × sales outcomes &mdash; that compounds with every
          customer, and (3) the daily workflow. Why won&rsquo;t Realeyes build it?
          A public, transparent model directly undercuts their &ldquo;trust our
          panel&rdquo; pitch and per-study pricing &mdash; a business-model
          conflict, not an engineering gap.
        </p>
      </>
    ),
  },
  {
    kick: "Market + who pays",
    title: (
      <>
        DTC &amp; performance teams{" "}
        <span className="font-serif font-normal italic">drowning</span> in
        paid-social video.
      </>
    ),
    body: (
      <>
        <p className="max-w-[70ch] text-[clamp(15px,1.5vw,18px)] leading-[1.62] text-[#4a4a4a]">
          Beachhead: DTC brands and growth teams running high-volume paid social
          &mdash; the low end Nielsen/System1/Realeyes ignore because their panel
          model is too slow and pricey per asset. They test dozens of creatives a
          week with real budget tied to spend, so a per-video pre-flight check pays
          for itself. Who pays: growth and creative leads, on per-seat / per-video
          SaaS priced far below a panel study. The value anchor: flagging where the
          model <strong className="text-[#0a0a0a]">predicts</strong> an attention
          drop before you commit six figures of media. Better than prompting GPT?
          GPT imagines what a person might say; we predict the actual cortical
          signal from a model benchmarked against real brains &mdash; biology, not
          a vibe, reproducible run to run.
        </p>
        <div className="mt-4 flex flex-wrap gap-[14px] font-mono text-[11px] text-[#4a4a4a]">
          <span className="inline-flex items-center gap-2">
            <span className="h-[9px] w-[9px] rounded-full bg-[#b0b0b0]" />
            Nielsen/System1/Realeyes &mdash; few, expensive, high-end
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-[9px] w-[9px] rounded-full bg-[#b0b0b0]" />
            Aaru/Simile &mdash; no biology
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-[9px] w-[9px] rounded-full bg-[#8FB3C0]" />
            <strong className="text-[#0a0a0a]">
              Soma &mdash; high-volume, low-cost, real neural signal
            </strong>
          </span>
        </div>
      </>
    ),
  },
  {
    kick: "Team",
    title: (
      <>
        Three technical founders who&rsquo;ve built together{" "}
        <span className="font-serif font-normal italic">since high school</span>.
      </>
    ),
    body: (
      <>
        <div className="mt-[22px] grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              n: "Mukilan Rajasekar",
              p: "Columbia (Fin-Econ + CS). Founding engineer @ Krypton AI — AI equity-research platform to 5,000+ users in a month, $250K pre-seed (Afore). Wrote the Soma app, pipeline, demo + validation harness.",
              t: "ships AI products + raises",
            },
            {
              n: "Aayaan Sahu",
              p: "CS + Econ @ UIUC. ML research editing activations in latent space (interpretability). Shipped a secure platform for a DV nonprofit (700+ survivors). Debate TOC champ, 1570.",
              t: "ML + full-stack",
            },
            {
              n: "Aarya Srinivasan",
              p: "Data Science + AI @ UC Berkeley, with a philosophy + neuroscience background — the team's neuro literacy. Undergrad researcher @ Haas; AI analyst @ AfterQuery. Debate TOC champ, 1570.",
              t: "data + AI + neuro",
            },
          ].map((f) => (
            <div
              key={f.n}
              className="rounded-2xl border border-[#ececec] bg-[#fafafa] p-4"
            >
              <h4 className="mb-[5px] text-[15px] font-semibold tracking-[-0.01em]">
                {f.n}
              </h4>
              <p className="text-[12.5px] leading-[1.5] text-[#4a4a4a]">{f.p}</p>
              <span className="mt-2 block font-mono text-[10px] tracking-[0.02em] text-[#5f8b99]">
                {f.t}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-[18px] font-mono text-[10px] leading-[1.7] text-[#9a9a9a]">
          Archbishop Mitty friends; all three worked together at AfterQuery
          &mdash; trust + velocity out of the gate (Aaru pattern). Full-time on
          Soma (winding down LLMBDA to go all-in). Senior neuroscience{" "}
          <strong className="text-[#6b6b6b]">advisor</strong> in progress.
        </p>
      </>
    ),
  },
  {
    kick: "The ask",
    title: (
      <>
        YC Fall 2026, standard{" "}
        <span className="font-serif font-normal italic">$500K</span> &mdash; to
        earn the next rung.
      </>
    ),
    body: (
      <>
        <p className="max-w-[70ch] text-[clamp(15px,1.5vw,18px)] leading-[1.62] text-[#4a4a4a]">
          The bet: an honest neural-inference layer plus a compounding proprietary
          dataset becomes the standard pre-flight check for every video ad &mdash;
          the one grounded in the brain, not the survey. We lead with the numbers,
          including the ones that aren&rsquo;t final yet.
        </p>
        <div className="mt-5 flex flex-col gap-[9px] font-mono text-[14px] text-[#4a4a4a]">
          {[
            "Publish the attention validation vs TVSum",
            "Ship 2D affect — valence + arousal",
            "Sign design-partner DTC brands — start the data flywheel",
          ].map((a) => (
            <div key={a} className="flex items-center gap-[11px]">
              <span className="h-[15px] w-[15px] shrink-0 rounded-[4px] border border-[#b0b0b0]" />
              {a}
            </div>
          ))}
        </div>
        <p className="mt-5 font-mono text-[10px] leading-[1.7] text-[#9a9a9a]">
          $500K · YC Fall 2026 · deadline Mon Jul 27, 8:00 PM PT
        </p>
      </>
    ),
  },
];

export default function PitchDeck() {
  const [i, setI] = useState(0);
  const len = SLIDES.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setI((p) => clamp(p + 1, len));
      } else if (e.key === "ArrowLeft") {
        setI((p) => clamp(p - 1, len));
      } else if (e.key === "Home") {
        setI(0);
      } else if (e.key === "End") {
        setI(len - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [len]);

  const slide = SLIDES[i];

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-58px)] max-w-[1100px] flex-col px-[clamp(16px,7vw,88px)] py-[6vh]">
      <div className="flex items-center justify-between font-mono text-[12px] text-[#9a9a9a]">
        <span className="text-[#5f8b99]">{slide.kick}</span>
        <span>
          {i + 1} / {len}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center py-8">
        <h1 className="mb-[18px] max-w-[17ch] text-balance text-[clamp(28px,4.2vw,46px)] font-medium leading-[1.08] tracking-[-0.028em]">
          {slide.title}
        </h1>
        {slide.body}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#ececec] pt-5 font-mono text-[12px] text-[#9a9a9a]">
        <button
          type="button"
          onClick={() => setI((p) => clamp(p - 1, len))}
          disabled={i === 0}
          className="rounded-[12px] border border-[#d8d8d8] bg-white px-[13px] py-[7px] text-[#0a0a0a] transition-colors hover:border-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#d8d8d8]"
        >
          &larr; prev
        </button>
        <div className="flex items-center gap-[6px]">
          {SLIDES.map((_, k) => (
            <button
              key={k}
              type="button"
              aria-label={`Go to slide ${k + 1}`}
              onClick={() => setI(k)}
              className={`h-[7px] w-[7px] rounded-full transition-colors ${
                k === i ? "bg-[#5f8b99]" : "bg-[#d8d8d8] hover:bg-[#b0b0b0]"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setI((p) => clamp(p + 1, len))}
          disabled={i === len - 1}
          className="rounded-[12px] border border-[#d8d8d8] bg-white px-[13px] py-[7px] text-[#0a0a0a] transition-colors hover:border-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#d8d8d8]"
        >
          next &rarr;
        </button>
        <span className="ml-2 hidden sm:inline">&larr; / &rarr; to navigate</span>
      </div>
    </section>
  );
}
