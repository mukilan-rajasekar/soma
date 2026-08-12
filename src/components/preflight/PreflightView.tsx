"use client";

// The /preflight shell — the YC walk-through. Same narrative spine as /demo (problem →
// the live read-out → the batch → the science → the hook → comprehension → the moat →
// CTA) but every figure on this page is drawn from ONE real batch: public/preflight/
// batch_report.json, produced by demo/process_batch.py on a GPU box.
//
// It owns the one piece of shared state — which cut is selected — because that is the
// page's thesis: THIS ad, seen against its batch. The player renders the selection, the
// batch comparison highlights it, and both write to it.
//
// Every section drops the numbered eyebrow /demo uses: the charts are the argument here,
// and the micro-labels above each heading read as chrome next to them.

import Link from "next/link";
import { useState } from "react";

import AdList from "./AdList";
import HookCompare from "./HookCompare";
import OverlayPanel from "./OverlayPanel";
import PlayerPanel from "./PlayerPanel";
import Section from "../demo2/Section";
import SiteHeader from "../site/SiteHeader";
import RegionCard from "../demo2/RegionCard";
import Stat from "../demo2/Stat";
import TwoRegionBrain3D from "../demo2/TwoRegionBrain3D";
import { useReveal } from "../demo2/useReveal";
import { HOOK_SECONDS } from "./lanes";
import type { PreflightReport } from "./types";

type Props = {
  report: PreflightReport;
  /** From public/demo/report.json — the corpus behind the model, shared with /demo so the
   *  two pages can never quote different numbers. Omitted if that file can't be read. */
  corpus?: { ads: number; advertisers: number } | null;
};

export default function PreflightView({ report, corpus }: Props) {
  const [selectedId, setSelectedId] = useState(report.bestId);
  const selected = report.ads.find((a) => a.id === selectedId) ?? report.ads[0];
  const [heroRef, heroIn] = useReveal<HTMLElement>({ threshold: 0.2 });

  const ordered = report.order
    .map((id) => report.ads.find((a) => a.id === id))
    .filter(Boolean) as PreflightReport["ads"];

  return (
    // globals.css forces overflow:hidden on html/body so the fixed landing hero can't
    // scroll. Routes outside the (site) group must bring their own scroll container.
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <SiteHeader />

      {/* ── the problem ──────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="px-[clamp(18px,5vw,40px)] pb-[clamp(40px,8vh,80px)] pt-[clamp(40px,9vh,96px)]"
      >
        <div className="mx-auto max-w-[980px]">
          <h1
            className="max-w-[21ch] text-balance text-hero text-ink"
            style={{
              opacity: heroIn ? 1 : 0,
              transform: heroIn ? "none" : "translateY(10px)",
              transition: "opacity .7s .05s, transform .7s .05s",
            }}
          >
            Anyone can make a hundred ads. Nobody knows which one{" "}
            <span className="font-serif font-normal italic">wins</span>.
          </h1>
          <p
            className="mt-5 max-w-[54ch] text-pretty text-body text-ink-2"
            style={{ opacity: heroIn ? 1 : 0, transition: "opacity .7s .2s" }}
          >
            Generating creative is solved — hundreds of variants in minutes. The bottleneck
            is knowing which will perform <em>before</em> you spend on it. Soma reads how a
            brain actually watches each cut, and finds the winner.
          </p>
        </div>
      </section>

      {/* ── the live read-out ────────────────────────────────────────────────── */}
      {/* No heading: the player IS the statement. Text above it would only describe what
          the reader is about to press play on. */}
      <Section>
        {(revealed) => (
          <div className="flex flex-col gap-8">
            {/* Keyed on the ad: switching cuts remounts the panel, the <video> and the
                video clock together, so no playhead, buffer or error state leaks across. */}
            <PlayerPanel key={selected.id} ad={selected} report={report} active={revealed} />
            <AdList
              ads={ordered}
              report={report}
              selectedId={selectedId}
              onSelect={setSelectedId}
              orientation="row"
              active={revealed}
            />
          </div>
        )}
      </Section>

      {/* ── compare across the batch ─────────────────────────────────────────── */}
      <Section
        tint
        heading={
          <>
            Compare across the{" "}
            <span className="font-serif font-normal italic">batch</span>.
          </>
        }
      >
        {(revealed) => (
          <OverlayPanel
            report={report}
            selectedId={selectedId}
            onSelect={setSelectedId}
            active={revealed}
          />
        )}
      </Section>

      {/* ── the science ──────────────────────────────────────────────────────── */}
      <Section
        heading={
          <>
            Attention isn&rsquo;t one thing. Different regions do{" "}
            <span className="font-serif font-normal italic">different</span> jobs.
          </>
        }
        lede="Generic eye-tracking tells you where a gaze lands. Soma reads the cortex itself — and two networks matter, each measured separately. This is the distinction the rest of the read-out is built on."
      >
        {(revealed) => (
          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[1fr_360px]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RegionCard
                title="Dorsal attention"
                tag="IPS · FEF · superior parietal"
                body="Where focus is steered — the top-down system that decides what the viewer looks at and holds on."
                tone="ink"
              />
              <RegionCard
                title="Ventral · surprise"
                tag="anterior insula · ACC"
                body="The salience network — it fires on the unexpected. This is what registers a hook: not attention in general, but the jolt of something the brain didn't see coming."
                tone="accent"
              />
              <p className="text-[12.5px] leading-[1.6] text-ink-2 sm:col-span-2">
                Because the two are read from different cortex, Soma can tell a steady,
                focused ad from a startling one — and score them on the axes that actually
                drive a hook. A gaze heat-map can&rsquo;t make that call.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-fill p-4">
              {/* The figure is shared with /demo; these five numbers are the whole of what
                  this page wants differently. It is read at 1:1 by someone who dwells on it,
                  not at ~640px in a 50-second take, so it turns faster, draws the ventral
                  patches smaller, and sits on a denser cloud. */}
              <TwoRegionBrain3D
                active={revealed}
                spinRate={0.19}
                insulaReach={0.21}
                operculumReach={0.24}
                cloudGrey={0.52}
                cloudAlpha={0.48}
              />
            </div>
          </div>
        )}
      </Section>

      {/* ── the hook ─────────────────────────────────────────────────────────── */}
      {/* Not tinted: the stat tiles inside are bg-fill, and on a tinted section they'd sit
          on their own colour and stop reading as raised. Same reason /demo doesn't tint it. */}
      <Section
        heading={
          <>
            The first three seconds are{" "}
            <span className="font-serif font-normal italic">everything</span>.
          </>
        }
        lede={
          <>
            Every ad&rsquo;s first {HOOK_SECONDS} seconds are scored as its hook —
            separately from the full video, and worth{" "}
            {Math.round(report.weights.hook * 100)}% of the total. The ventral surprise
            signal is what measures it: a hook works by being unexpected, and the salience
            network is what registers the unexpected.
          </>
        }
      >
        {(revealed) => <HookCompare report={report} active={revealed} />}
      </Section>

      {/* ── comprehension ────────────────────────────────────────────────────── */}
      {/* Tinted: this beat is text only, and the fill gives it enough presence between two
          chart-heavy sections to read as its own chapter rather than a stray paragraph. */}
      <Section
        tint
        heading={
          <>
            Did the brand actually{" "}
            <span className="font-serif font-normal italic">land</span>?
          </>
        }
        lede="A held gaze is worthless if the product never registers. Soma reads the ad's own words — on screen via text recognition, out loud via speech recognition — and when the campaign is named and the language cortex confirms it registers, the score rises."
      />

      {/* ── the moat ─────────────────────────────────────────────────────────── */}
      <Section
        heading={
          <>
            Every batch makes the model{" "}
            <span className="font-serif font-normal italic">sharper</span>.
          </>
        }
        lede="Soma turns brain-response into the metrics you actually buy on — attention, retention, the odds a cut performs. Every batch of customer ads ingested grows the dataset behind that translation. The read-out is the product; the growing corpus is the moat."
      >
        {(revealed) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {corpus ? (
              <>
                <Stat big value={corpus.ads} suffix="+" label="Ads processed" sub="and counting, every batch" active={revealed} />
                <Stat big value={corpus.advertisers} suffix="" label="Advertisers indexed" sub="the corpus behind the model" active={revealed} />
              </>
            ) : null}
            <div className="rounded-2xl border border-line bg-fill p-5 text-[13px] leading-[1.6] text-ink-2">
              The neural model is public. The edge is the layer between neural signal and
              real ad performance — and it&rsquo;s trained on data that arrives with every
              customer.
            </div>
          </div>
        )}
      </Section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(56px,12vh,128px)]">
        <div className="mx-auto max-w-[980px]">
          <h2 className="max-w-[18ch] text-balance text-section text-ink">
            Stop guessing which ad{" "}
            <span className="font-serif font-normal italic">wins</span>.
          </h2>
          <p className="mt-4 max-w-[54ch] text-body text-ink-2">
            {report.ads.length} clips, ranked and diagnosed. Send us your batch and see
            where your attention goes.
          </p>
          <div className="mt-7">
            <Link
              href="/sign-up"
              prefetch={false}
              className="inline-block rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
            >
              Create your account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
