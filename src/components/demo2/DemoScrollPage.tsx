"use client";

// The /demo scroll narrative. Built to be recorded top-to-bottom with a voiceover — every
// section animates once on enter (see useReveal), so scroll speed can't ruin a take — and
// to stand on its own: a YC reader who clicks the link without watching the video still
// gets the whole product. Every number comes from public/demo/report.json, which
// tools/demo/build_report.py computes from real frozen-TRIBE output on real ads.
//
// Flow: problem → the science (dorsal/ventral) → hook → comprehension → ranked batch →
// same-campaign variants → dip + shot diagnosis → watch it live → the flywheel → CTA.

import Link from "next/link";
import SiteHeader from "@/components/site/SiteHeader";
import { useReveal } from "./useReveal";
import Section from "./Section";
import TwoRegionBrain from "./TwoRegionBrain";
import ArcPlot from "./ArcPlot";
import MetricRow from "./MetricRow";
import RankBoard from "./RankBoard";
import VariantOverlay from "./VariantOverlay";
import ShotDiagnosis from "./ShotDiagnosis";
import ComprehensionPanel from "./ComprehensionPanel";
import LivePlayer from "./LivePlayer";
import type { Ad, Report } from "./types";

export default function DemoScrollPage({ report }: { report: Report }) {
  const batch = report.batch;
  const variants = report.campaign.variants;
  const byId = (list: Ad[], id: string) => list.find((a) => a.id === id) ?? list[0];

  const hookAd = byId(variants, "v03_30s_product_first"); // clearest ventral spike + winner
  const compAd = byId(batch, "tt_307"); // whey protein — named on screen AND out loud
  const dipAd = byId(variants, report.campaign.dipId ?? variants[0].id);
  const heroAd = byId(variants, "v03_30s_product_first");

  const [heroRef, heroIn] = useReveal<HTMLDivElement>({ threshold: 0.2 });

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <SiteHeader />

      {/* ── 0 · the problem ─────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative overflow-hidden px-[clamp(18px,5vw,40px)] pb-[clamp(40px,8vh,80px)] pt-[clamp(40px,9vh,96px)]"
      >
        <div className="mx-auto grid max-w-[980px] grid-cols-1 items-center gap-10 md:grid-cols-[1.15fr_1fr]">
          <div>
            <div
              className="mb-4 text-[12px] uppercase tracking-[0.12em] text-ink-3"
              style={{ opacity: heroIn ? 1 : 0, transition: "opacity .6s" }}
            >
              Soma · a brain read-out for ads
            </div>
            <h1
              className="max-w-[16ch] text-balance text-hero text-ink"
              style={{ opacity: heroIn ? 1 : 0, transform: heroIn ? "none" : "translateY(10px)", transition: "opacity .7s .05s, transform .7s .05s" }}
            >
              Anyone can make a hundred ads. Nobody knows which one{" "}
              <span className="font-serif font-normal italic">wins</span>.
            </h1>
            <p
              className="mt-5 max-w-[48ch] text-body text-pretty text-ink-2"
              style={{ opacity: heroIn ? 1 : 0, transition: "opacity .7s .2s" }}
            >
              Generating creative is solved — hundreds of variants in minutes. The bottleneck
              is knowing which will perform <em>before</em> you spend on it. Soma reads how a
              brain actually watches each cut, and finds the winner.
            </p>
            <div
              className="mt-7 flex flex-wrap items-center gap-3"
              style={{ opacity: heroIn ? 1 : 0, transition: "opacity .7s .3s" }}
            >
              <a href="#science" className="rounded-xl bg-ink px-5 py-[12px] text-ui font-medium text-white transition-colors hover:bg-ink/85">
                See how it works
              </a>
              <Link href="/console" className="rounded-xl border border-line-2 px-5 py-[12px] text-ui font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink">
                Open the live console
              </Link>
            </div>
          </div>

          <div style={{ opacity: heroIn ? 1 : 0, transition: "opacity 1s .2s" }}>
            <div className="rounded-2xl border border-line bg-fill p-4">
              <div className="mb-2 flex items-center justify-between text-[12px] uppercase tracking-[0.08em] text-ink-3">
                <span>{heroAd.brand ?? report.campaign.name}</span>
                <span className="tabular-nums text-ink">Soma {heroAd.scores.soma}</span>
              </div>
              <ArcPlot
                dorsal={heroAd.lanes.dorsal}
                ventral={heroAd.lanes.ventral}
                timestamps={heroAd.timestamps}
                duration={heroAd.duration}
                hookSeconds={report.hookSeconds}
                weakSpots={heroAd.weakSpots}
                progress={heroIn ? 1 : 0}
                height={172}
                labelDorsal="Attention"
                labelVentral="Surprise"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── social proof · who's already running ads through the beta ─── */}
      <section className="border-y border-line bg-fill px-[clamp(18px,5vw,40px)] py-[clamp(20px,4vh,32px)]">
        <div className="mx-auto flex max-w-[980px] flex-col items-center gap-x-8 gap-y-3 text-center sm:flex-row sm:justify-center sm:text-left">
          <span className="shrink-0 text-[12px] uppercase tracking-[0.12em] text-ink-3">
            Already in the beta
          </span>
          <span className="hidden h-4 w-px bg-line-2 sm:block" aria-hidden="true" />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {["TikTok", "Supercell", "MrBeast"].map((name) => (
              <span key={name} className="text-ui font-medium tracking-[-0.01em] text-ink-2">
                {name}
              </span>
            ))}
            <span className="text-[12.5px] text-ink-3">and other big names</span>
          </div>
        </div>
      </section>

      {/* ── 1 · the science ─────────────────────────────────────────── */}
      <div id="science" />
      <Section
        n="01"
        eyebrow="The science"
        heading={<>Attention isn&rsquo;t one thing. Different regions do <span className="font-serif font-normal italic">different</span> jobs.</>}
        lede="Generic eye-tracking tells you where a gaze lands. Soma reads the cortex itself — and two networks matter, each measured separately. This is the distinction the rest of the read-out is built on."
        tint
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
                Because the two are read from different cortex, Soma can tell a steady, focused ad
                from a startling one — and score them on the axes that actually drive a hook. A
                gaze heat-map can&rsquo;t make that call.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-paper p-4">
              <TwoRegionBrain t={revealed ? 1 : 0} focus="both" />
            </div>
          </div>
        )}
      </Section>

      {/* ── 2 · hook scoring ────────────────────────────────────────── */}
      <Section
        n="02"
        eyebrow="Hook scoring"
        heading={<>The first three seconds are <span className="font-serif font-normal italic">everything</span>.</>}
        lede="Every ad's first 3 seconds are scored as its hook — separately from the full video, and worth ~45% of the total. The ventral surprise signal is what measures it: a hook works by being unexpected, and the salience network is what registers the unexpected."
      >
        {(revealed) => (
          <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[300px_1fr]">
            <div className="rounded-2xl border border-line bg-fill p-4">
              <TwoRegionBrain t={revealed ? 1 : 0} focus="ventral" height={220} />
              <div className="mt-2 text-center text-[12.5px] leading-[1.5] text-ink-3">
                In the hook window, the ventral network leads.
              </div>
            </div>
            <div>
              <ArcPlot
                dorsal={hookAd.lanes.dorsal}
                ventral={hookAd.lanes.ventral}
                timestamps={hookAd.timestamps}
                duration={hookAd.duration}
                hookSeconds={report.hookSeconds}
                progress={revealed ? 1 : 0}
                height={188}
                labelDorsal="Attention"
                labelVentral="Surprise"
              />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat big value={hookAd.scores.hook} suffix="/100" label="Hook score" sub="~45% of the total" tone="accent" active={revealed} />
                <div className="rounded-2xl border border-line bg-paper p-4 text-[12.5px] leading-[1.55] text-ink-2">
                  {hookAd.reads.hook}
                </div>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── 3 · comprehension ───────────────────────────────────────── */}
      <Section
        n="03"
        eyebrow="Comprehension"
        heading={<>Did the brand actually <span className="font-serif font-normal italic">land</span>?</>}
        lede="A held gaze is worthless if the product never registers. Soma reads the ad's own words — on screen via text recognition, out loud via speech recognition — and when the campaign is named and the language cortex confirms it registers, the score rises."
        tint
      >
        {(revealed) => <ComprehensionPanel ad={compAd} active={revealed} />}
      </Section>

      {/* ── 4 · videos in → ranked report out ───────────────────────── */}
      <Section
        n="04"
        eyebrow="Input → output"
        heading={<>Ten ads for one product. One <span className="font-serif font-normal italic">ranking</span> out.</>}
        lede="This is a single brand's ad account — ten creatives for the same product, some near-identical, some completely different. Soma scores each and ranks them against each other. Every row breaks into its hook, hold, and comprehension drivers, so you see not just which creative wins, but why — and what to fix on the ones that don't."
      >
        {(revealed) => (
          <div>
            <div className="mb-3 flex items-center gap-2 text-[13px] text-ink-3">
              <span className="inline-flex h-2 w-2 rounded-full bg-ink" aria-hidden="true" />
              <span className="text-ink">Kova · Whey Isolate</span>
              <span>· 10 creatives, one product</span>
            </div>
            <RankBoard ads={batch} active={revealed} />
            <p className="mt-4 max-w-[68ch] text-[13.5px] leading-[1.6] text-ink-2">
              Note the ingredient-breakdown cut at the bottom: it names the product five times and
              lights up language cortex — top comprehension of the ten — yet ranks last, because
              almost nobody&rsquo;s attention survives past the open. Same product, same brand; a
              single grade would hide that. The breakdown makes it a fixable diagnosis.
            </p>
          </div>
        )}
      </Section>

      {/* ── 5 · same-campaign attention ─────────────────────────────── */}
      <Section
        n="05"
        eyebrow="Compare the cuts"
        heading={<>Same campaign, five cuts, one <span className="font-serif font-normal italic">timeline</span>.</>}
        lede="Comparing different campaigns is apples to oranges, so Soma compares cuts of the same ad. Here are five edits of one direct-response campaign, their attention arcs on a shared scale. They diverge in the opening seconds — where the edit decides everything."
        tint
      >
        {(revealed) => <VariantOverlay variants={variants} active={revealed} />}
      </Section>

      {/* ── 6 · dip detection + shot diagnosis ──────────────────────── */}
      <Section
        n="06"
        eyebrow="Weak-spot detection"
        heading={<>Find the exact shot that&rsquo;s <span className="font-serif font-normal italic">costing</span> you.</>}
        lede="Soma flags where attention falls away mid-ad, then goes shot by shot: it re-scores the ad with each shot removed, so you can see which cut drags the total down — diagnosis at the shot level, not a single grade for the whole thing."
      >
        {(revealed) => (
          <div className="flex flex-col gap-8">
            <div>
              <ArcPlot
                dorsal={dipAd.lanes.dorsal}
                ventral={dipAd.lanes.ventral}
                timestamps={dipAd.timestamps}
                duration={dipAd.duration}
                hookSeconds={report.hookSeconds}
                weakSpots={dipAd.weakSpots}
                progress={revealed ? 1 : 0}
                height={180}
                showVentral={false}
                showHook={false}
                labelDorsal="Attention"
              />
              <p className="mt-3 max-w-[60ch] text-[13px] leading-[1.55] text-ink-2">{dipAd.reads.hold}</p>
            </div>
            <ShotDiagnosis diag={report.campaign.shots} active={revealed} />
          </div>
        )}
      </Section>

      {/* ── 7 · watch it live ───────────────────────────────────────── */}
      <Section
        n="07"
        eyebrow="Watch it live"
        heading={<>The ad and its score, <span className="font-serif font-normal italic">side by side</span>.</>}
        lede="Press play. The clip is the clock — attention, surprise, and the score track the very frames on screen, so you can watch exactly where the brain leans in and where it drops."
        tint
      >
        {() => <LivePlayer ad={heroAd} hookSeconds={report.hookSeconds} />}
      </Section>

      {/* ── the four headline metrics, summarised on the hero ad ─────── */}
      <Section
        n="—"
        eyebrow="The read-out"
        heading={<>The numbers that actually <span className="font-serif font-normal italic">mean</span> something.</>}
        lede="One composite, three drivers. Every metric is an attention measurement with a statistical read on top and a plain-English line underneath — because a raw number on its own tells you nothing."
      >
        {(revealed) => <MetricRow scores={heroAd.scores} reads={heroAd.reads} active={revealed} hookTone />}
      </Section>

      {/* ── 8 · the flywheel / moat ─────────────────────────────────── */}
      <Section
        n="08"
        eyebrow="The moat"
        heading={<>Every ad in the database makes the model <span className="font-serif font-normal italic">sharper</span>.</>}
        lede="Soma turns brain-response into the metrics you actually buy on — attention, retention, the odds a cut performs. Every ad that comes through grows the dataset behind that translation. The read-out is the product; the growing database is the moat."
      >
        {(revealed) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Stat big value={report.corpus.ads} suffix="+" label="Ads in the system database" sub="collected from our waitlist" active={revealed} />
            <Stat big value={report.corpus.advertisers} suffix="" label="Advertisers indexed" sub="the corpus behind the model" active={revealed} />
          </div>
        )}
      </Section>

      {/* ── 9 · CTA ─────────────────────────────────────────────────── */}
      <section className="border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(56px,12vh,128px)]">
        <div className="mx-auto max-w-[980px]">
          <h2 className="max-w-[18ch] text-balance text-section text-ink">
            Stop guessing which ad <span className="font-serif font-normal italic">wins</span>.
          </h2>
          <p className="mt-4 max-w-[54ch] text-body text-ink-2">
            Ten clips, ranked and diagnosed. Send us your batch and see where your attention goes.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/" className="rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85">
              Request access
            </Link>
            <Link href="/console" className="rounded-xl border border-line-2 px-5 py-[13px] text-ui font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink">
              Explore the live console
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

// ── small shared pieces ─────────────────────────────────────────────

function RegionCard({ title, tag, body, tone }: { title: string; tag: string; body: string; tone: "ink" | "accent" }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone === "accent" ? "bg-accent-2" : "bg-ink"}`} />
        <span className="text-ui font-medium text-ink">{title}</span>
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-ink-3">{tag}</div>
      <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-2">{body}</p>
    </div>
  );
}

function Stat({
  value, suffix, label, sub, tone, active, big,
}: {
  value: number; suffix: string; label: string; sub: string; tone?: "ink" | "accent"; active: boolean; big?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-fill p-5">
      <div className="text-[12px] uppercase tracking-[0.1em] text-ink-3">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={`font-medium tabular-nums leading-none text-ink ${big ? "text-[44px]" : "text-[28px]"}`}
          style={{ opacity: active ? 1 : 0.15, transition: "opacity .6s" }}
        >
          {value.toLocaleString()}
        </span>
        <span className="text-[16px] text-ink-3">{suffix}</span>
      </div>
      <div className={`mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line ${big && tone ? "" : "hidden"}`}>
        {/* grow via transform: scaleX (compositor-only) rather than animating width, which
            would trigger layout on every frame. transform-origin left so it fills L→R. */}
        <div
          className={tone === "accent" ? "h-full w-full rounded-full bg-accent-2" : "h-full w-full rounded-full bg-ink"}
          style={{ transform: active ? `scaleX(${Math.min(100, value) / 100})` : "scaleX(0)", transformOrigin: "left", transition: "transform .9s" }}
        />
      </div>
      <div className="mt-2 text-[12.5px] text-ink-3">{sub}</div>
    </div>
  );
}
