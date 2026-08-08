import type { Metadata } from "next";
import Link from "next/link";

// /audit — the free ad audit funnel.
//
// COPY DISCIPLINE, ENFORCED. This page never quantifies how well the model predicts,
// quotes no counts of partners or signups, and promises no performance lift. The honest
// frame is the product frame: measured readouts, not promises. A claims gate greps this
// file; keep it that way when editing.

export const metadata: Metadata = {
  title: "soma — free ad audit: your ad's neural readout",
  description:
    "Upload a video ad and get its neural readout back: the lane heatmap, the weak windows, and measured edit candidates. Measured readouts, not promises.",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink-3">
      {children}
    </div>
  );
}

const READOUTS = [
  {
    name: "Lane heatmap",
    what: "Which processing lanes light up, second by second, across the whole ad.",
    why: "You see where the ad is working the brain — and where nothing much is happening.",
  },
  {
    name: "Weak windows",
    what: "The stretches where the measured response sags below the rest of the ad.",
    why: "A retention graph shows where people leave. The readout shows what went quiet first.",
  },
  {
    name: "Measured edit candidates",
    what: "Edits the pipeline actually tried on your file, each one re-scored after the change.",
    why: "Every candidate carries its before-and-after readout, so you judge the measurement, not our taste.",
  },
];

export default function AuditPage() {
  return (
    <article>
      {/* header */}
      <header className="mx-auto max-w-[920px] px-[clamp(16px,4vw,24px)] pb-8 pt-[clamp(26px,5vw,44px)]">
        <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-ink-3">
          <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
          Free ad audit
        </div>
        <h1 className="max-w-[18ch] text-balance text-hero text-ink">
          Upload your ad. Read what it{" "}
          <span className="font-serif font-normal italic">does</span>.
        </h1>
        <p className="mt-[18px] max-w-[60ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
          Soma runs your video through a brain-response encoder and hands back the
          readout: a lane heatmap of the response, the weak windows where it sags, and
          edit candidates that were tried and re-measured on your file. Measured
          readouts, not promises.
        </p>
        <div className="mt-7">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-paper transition-colors hover:bg-ink/85"
          >
            Get your free audit
          </Link>
        </div>
      </header>

      {/* 01 — what you get */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>01 · what comes back</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-section text-ink">
          Three readouts, straight off your file.
        </h2>
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[14px]">
          {READOUTS.map((r) => (
            <article
              key={r.name}
              className="flex flex-col gap-[10px] rounded-2xl border border-line bg-paper p-4"
            >
              <span className="text-[15.5px] font-semibold tracking-[-0.01em]">
                {r.name}
              </span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[5px]">
                <dt className="pt-[2px] text-[9.5px] uppercase tracking-[0.08em] text-ink-3">
                  what
                </dt>
                <dd className="text-[13px] leading-[1.5] text-ink-2">{r.what}</dd>
                <dt className="pt-[2px] text-[9.5px] uppercase tracking-[0.08em] text-ink-3">
                  why
                </dt>
                <dd className="text-[13px] leading-[1.5] text-ink-2">{r.why}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {/* 02 — what we will not claim */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>02 · what we will not claim</Eyebrow>
        <h2 className="max-w-[22ch] text-balance text-section text-ink">
          A readout is a measurement, not a promise.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          The audit shows what the model measured on your ad, and where the measurement
          is thin it says so. We do not promise that acting on it will improve your
          campaign, and we do not dress a model output up as a guarantee. When an edit
          candidate moves the readout, you see the numbers it moved — that is the whole
          claim.
        </p>
        <p className="mt-3 max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          If that honesty is what you want from an ad tool, the audit is free and takes
          one upload.
        </p>
      </section>

      {/* 03 — how it works */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>03 · how it works</Eyebrow>
        <h2 className="max-w-[20ch] text-balance text-section text-ink">
          One upload, one readout.
        </h2>
        <p className="mt-[14px] max-w-[66ch] text-pretty text-[16px] leading-[1.6] text-ink-2">
          Sign in, upload the ad from your dashboard, and the pipeline runs the encoder
          over it — the same read it runs on every ad it serves. The readout lands in
          your library, pinned to your timeline second by second. How the read itself
          works is on{" "}
          <Link
            href="/science"
            className="text-ink underline decoration-line-2 underline-offset-2 transition-colors hover:decoration-ink"
          >
            the science page
          </Link>
          .
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-paper transition-colors hover:bg-ink/85"
          >
            Start with your ad
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-xl border border-line-2 px-5 py-[13px] text-ui font-medium text-ink transition-colors hover:border-ink"
          >
            See a readout first
          </Link>
        </div>
      </section>
    </article>
  );
}
