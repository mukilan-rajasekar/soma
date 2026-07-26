"use client";

// The /demo scroll narrative. Built to be recorded top-to-bottom with a voiceover — every
// section animates once on enter (see useReveal), so scroll speed can't ruin a take — and
// to stand on its own: a YC reader who clicks the link without watching the video still
// gets the whole product. Every number comes from public/demo/report.json, which
// tools/demo/build_report.py computes from real frozen-TRIBE output on real ads.
//
// ONE component, TWO routes. The `variant` prop is the only difference between them:
//
//   /demo        variant="full"   12 beats + the read-out. The page a cold YC reader or a
//                                 buyer in diligence lands on with no video to guide them.
//   /demo-short  variant="short"   6 beats. Built to be screen-recorded top to bottom in
//                                 60 seconds, which is the only reason anything is missing.
//
// Sections live in one ordered array (`defs`) and the short route is that array with the
// `fullOnly` entries filtered out. Section numbers, background tint alternation and the
// act-strip targets are all derived from whatever survives the filter — nothing is typed
// twice, so the two routes cannot drift apart or contradict themselves. Copying this file
// to make the second page would have guaranteed both.
//
// The page tells one three-act story — measure, generate, edit — and the acts are in that
// order on purpose: generation only means anything after a reader believes the measurement.
//
// Acts two and three carry the weight, and each absorbed the section that used to duplicate
// it — on both routes. Generation ends with the five-arc overlay that was "compare the
// cuts": the same five ads the board just ranked, on one time axis, so it is evidence for
// the ranking rather than a second demo of it. Editing opens with the dip arc and the
// per-shot deltas that were "weak-spot detection", then splices the exact shot they name.
// The standalone versions were redundant because they showed the same artifacts a section
// or two early with no result attached, so neither route restores them.
//
// Short-only omissions: comprehension, the silent-ad message track, the read-out recap,
// "watch it live", the service ladder and the buyer's checklist. The brand marquee is on
// NEITHER route — it was removed as a false claim, not for time; see the note where it
// stood. Every number comes from public/demo/report.json, which tools/demo/build_report.py
// computes from real frozen-TRIBE output, except the three founder-attested stats in the
// database beat (flagged inline there).

import Link from "next/link";
import SiteHeader from "@/components/site/SiteHeader";
import { Fragment, useEffect, useRef } from "react";
import { useReveal } from "./useReveal";
import Section from "./Section";
import TwoRegionBrain from "./TwoRegionBrain";
import ArcPlot from "./ArcPlot";
import RankBoard from "./RankBoard";
import VariantOverlay from "./VariantOverlay";
import ShotDiagnosis from "./ShotDiagnosis";
import ComprehensionPanel from "./ComprehensionPanel";
import MessageTrack from "./MessageTrack";
import LivePlayer from "./LivePlayer";
import MetricRow from "./MetricRow";
import ServiceTiers from "./ServiceTiers";
import VendorChecklist from "./VendorChecklist";
import GenerateStudio from "./GenerateStudio";
import EditStudio from "./EditStudio";
import { BRAND } from "./studio";
import type { Ad, Report } from "./types";

// "full" is /demo — the long-form page a cold reader lands on. "short" is /demo-short, the
// six-beat cut built to be screen-recorded in 60 seconds.
export type DemoVariant = "short" | "full";

type SectionDef = {
  key: string;
  anchor?: string;
  eyebrow: string;
  heading: React.ReactNode;
  lede: string;
  fullOnly?: boolean;
  unnumbered?: boolean;
  body: (revealed: boolean) => React.ReactNode;
};

export default function DemoScrollPage({
  report,
  variant = "full",
}: {
  report: Report;
  variant?: DemoVariant;
}) {
  const batch = report.batch;
  const variants = report.campaign.variants;
  const byId = (list: Ad[], id: string) => list.find((a) => a.id === id) ?? list[0];

  const hookAd = byId(variants, "v03_30s_product_first"); // clearest ventral spike + winner
  const heroAd = byId(variants, "v03_30s_product_first");
  // the cut with the clearest mid-ad attention dip — the editing beat diagnoses it, then edits it
  const dipAd = byId(variants, report.campaign.dipId ?? variants[0].id);
  const compAd = byId(batch, "tt_307"); // named on screen AND out loud
  // The one ad in the batch with zero speech segments. Picked by the data rather than
  // hardcoded, so a rebuild that changes which clip is silent still lands on a real one.
  const silentAd = batch.find((a) => (a.transcript ?? []).length === 0) ?? compAd;

  const [heroRef, heroIn] = useReveal<HTMLDivElement>({ threshold: 0.2 });

  // globals.css puts `overflow: hidden` on html/body for the fixed hero, so the page
  // actually scrolls inside this element. A scrollable div is not keyboard-focusable by
  // default, which meant PageDown / Space / arrow keys did nothing at all on a page whose
  // entire purpose is to be scrolled top-to-bottom for a recording — and it failed the
  // basic accessibility requirement that a scrollable region be reachable by keyboard.
  // tabIndex makes it focusable; focusing it on mount (preventScroll so the position does
  // not jump) means the keys work without having to click the page first.
  const scrollRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash) return; // don't fight an anchor landing
    scrollRef.current?.focus({ preventScroll: true });
  }, []);

  // ── the section list ────────────────────────────────────────────────
  // Declared in scroll order. `fullOnly` entries are dropped on /demo-short; everything
  // else — numbering, tint alternation, the act-strip targets — is derived from what
  // survives the filter, so the two routes cannot disagree with themselves or each other.
  const defs: SectionDef[] = [
    {
      key: "science",
      anchor: "science",
      eyebrow: "The science",
      heading: <>Attention isn&rsquo;t one thing. Different regions do <span className="font-serif font-normal italic">different</span> jobs.</>,
      lede: "Generic eye-tracking tells you where a gaze lands. Soma reads the cortex itself — and two networks matter, each measured separately. This is the distinction the rest of the read-out is built on.",
      body: (revealed) => (
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
      ),
    },
    {
      key: "hook",
      eyebrow: "Hook scoring",
      heading: <>The first three seconds are <span className="font-serif font-normal italic">everything</span>.</>,
      lede: "Every ad's first 3 seconds are scored as its hook — separately from the full video, and worth ~45% of the total. The ventral surprise signal is what measures it: a hook works by being unexpected, and the salience network is what registers the unexpected.",
      // The science section already renders TwoRegionBrain (focus="both"). A second brain
      // stood here — focus="ventral" plus an "in the hook window, the ventral network leads"
      // caption — repeating the same visual and the same sentence the science body copy had
      // already made, for ~470px. The arc carries the hook argument on its own.
      body: (revealed) => (
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
      ),
    },
    {
      key: "comprehension",
      fullOnly: true,
      eyebrow: "Comprehension",
      heading: <>Did the brand actually <span className="font-serif font-normal italic">land</span>?</>,
      lede: "A held gaze is worthless if the product never registers. Soma reads the ad's own words — on screen via text recognition, out loud via speech recognition — and when the campaign is named and the language cortex confirms it registers, the score rises.",
      body: (revealed) => (
        <div className="space-y-8">
          <ComprehensionPanel ad={compAd} active={revealed} />
          {/* The words themselves, under the mention pins. The panel above shows THAT
              the brand was named; this shows what was actually said around it. */}
          <MessageTrack ad={compAd} active={revealed} />
        </div>
      ),
    },
    {
      key: "novoice",
      fullOnly: true,
      eyebrow: "No voiceover",
      heading: <>An ad that says nothing <span className="font-serif font-normal italic">out loud</span>.</>,
      lede: "Speech recognition finds nothing in this cut, because there is nothing to find — the whole message is on screen. The language lane still reads, which is what separates measuring the cortex from transcribing the audio.",
      body: (revealed) => <MessageTrack ad={silentAd} active={revealed} />,
    },
    {
      key: "batch",
      eyebrow: "Input → output",
      heading: <>Ten ads in. One <span className="font-serif font-normal italic">ranking</span> out.</>,
      lede: "Send a batch. Soma scores every clip and ranks them against each other, and every row breaks into its hook, hold and comprehension drivers — so you see not just which creative wins, but why, and what to fix on the ones that don't.",
      body: (revealed) => (
        <div>
          {/* This block used to open "This is a single brand's ad account — ten creatives
              for the same product". It isn't, and build_report.py:501-506 says so in its
              own comment: the ten clips are unrelated TikTok Creative Center scrapes
              (ice cream, jewellery, Milwaukee tools, whey) and only the TITLES map
              presents them as one campaign. The scores, arcs and drivers ARE real
              per-video model output. So the copy now claims exactly that and no more —
              "ten ads in, one ranking out" is both true and the actual product. The
              caveat line below is the disclosure PRODUCT.md's honesty doctrine requires. */}
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
            <span className="inline-flex h-2 w-2 rounded-full bg-ink" aria-hidden="true" />
            <span className="text-ink">Ten real ads, scored end to end</span>
            <span>· ranked against each other</span>
          </div>
          <RankBoard ads={batch} active={revealed} />
          <p className="mt-4 max-w-[68ch] text-[13.5px] leading-[1.6] text-ink-2">
            Note the bottom row: it names its product five times and lights up language
            cortex — top comprehension of the ten — yet ranks last, because almost nobody&rsquo;s
            attention survives the open. A single grade would hide that. The breakdown makes
            it a fixable diagnosis.
          </p>
          <p className="mt-3 max-w-[68ch] text-[12px] leading-[1.55] text-ink-3">
            Creative titles are illustrative. Every score, arc and driver on this board is
            real model output over real footage.
          </p>
        </div>
      ),
    },
    {
      key: "generate",
      anchor: "generate",
      eyebrow: "Generation",
      heading: <>Write a brief. Get back the cut that <span className="font-serif font-normal italic">wins</span>.</>,
      lede: "Describe the ad in plain language. Soma generates against your brand kit, then scores every candidate and kills the losers before you see any of them.",
      body: (revealed) => (
        <div className="space-y-9">
          <GenerateStudio report={report} active={revealed} />
          {/* The five survivor cards on the board above are these five arcs — same ads,
              same scores, one shared time axis. Kept inside this section rather than as its
              own "compare the cuts" section, on BOTH routes: as a separate section it read
              as a second, independent demonstration of the same five clips. Here it is the
              evidence for the board's ranking — the board says 73 beat 51, this shows where. */}
          <div>
            <div className="mb-3 max-w-[68ch] text-[13.5px] leading-[1.6] text-ink-2">
              The five that cleared the bar, on one timeline. Same footage, recut — and the
              spread opens in the first seconds, which is where the opener decides the arc.
            </div>
            <VariantOverlay variants={variants} active={revealed} />
          </div>
        </div>
      ),
    },
    {
      key: "edit",
      anchor: "edit",
      eyebrow: "AI ad editing",
      heading: <>Change it in a sentence. It re-scores <span className="font-serif font-normal italic">itself</span>.</>,
      lede: "Edited in plain language. Every candidate edit goes through the model and the best-performing cut comes back. No pixel-level regeneration: the frames you shot stay the frames you shot.",
      body: (revealed) => (
        <div className="space-y-9">
          {/* Diagnosis first, then the edit that acts on it — on both routes. This is the
              payoff ordering the standalone weak-spot section could never have: it named the
              costly shot two sections before anything cut it. Here the deltas name the shot
              and EditStudio immediately splices that exact beat and counts 62 → 66 in front
              of the reader. showThumbs is off because EditStudio's own filmstrip below
              renders these same eleven frames. */}
          <div>
            <ArcPlot
              dorsal={dipAd.lanes.dorsal}
              ventral={dipAd.lanes.ventral}
              timestamps={dipAd.timestamps}
              duration={dipAd.duration}
              hookSeconds={report.hookSeconds}
              weakSpots={dipAd.weakSpots}
              progress={revealed ? 1 : 0}
              height={170}
              showVentral={false}
              showHook={false}
              labelDorsal="Attention"
            />
            <p className="mt-3 max-w-[62ch] text-[13px] leading-[1.55] text-ink-2">{dipAd.reads.hold}</p>
            <div className="mt-6">
              <ShotDiagnosis diag={report.campaign.shots} active={revealed} showThumbs={false} />
            </div>
          </div>
          <EditStudio report={report} active={revealed} />
        </div>
      ),
    },
    {
      key: "live",
      fullOnly: true,
      eyebrow: "Watch it live",
      heading: <>The ad and its score, <span className="font-serif font-normal italic">side by side</span>.</>,
      lede: "The clip is the clock — attention, surprise and the score track the frames on screen.",
      body: (revealed) => <LivePlayer ad={heroAd} hookSeconds={report.hookSeconds} active={revealed} />,
    },
    {
      key: "readout",
      fullOnly: true,
      unnumbered: true,
      eyebrow: "The read-out",
      heading: <>The numbers that actually <span className="font-serif font-normal italic">mean</span> something.</>,
      lede: "One composite, three drivers. Every metric is an attention measurement with a statistical read on top and a plain-English line underneath — because a raw number on its own tells you nothing.",
      body: (revealed) => <MetricRow scores={heroAd.scores} reads={heroAd.reads} active={revealed} hookTone />,
    },
    {
      key: "database",
      eyebrow: "The database",
      heading: <>Every ad that comes through makes the model <span className="font-serif font-normal italic">sharper</span>.</>,
      lede: "The read-out is the product; the database behind it is what a public model cannot buy.",
      // Three stats, not four. The dropped one was "Advertisers indexed 3,115 / the corpus
      // behind the model": 3,115 counts ADS, not advertisers — advertiser_summary.csv has 917
      // attributions, 38 of them with footage — so the label was wrong about its own number
      // and is removed rather than relabelled.
      // The remaining three are founder-attested (docs/strategy/PRODUCT.md), which is why they
      // are typed literals rather than read from report.json. Two notes for whoever edits this
      // next: "from people" describes provenance this repo cannot corroborate — ad_fetch_bb.py
      // populates the corpus by scraping TikTok Creative Center and report.corpus.ads is 700 —
      // and "biggest database in the category" is a comparative claim with no benchmark behind
      // it. Both are here because they were asked for directly.
      body: (revealed) => (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat big value={1500} suffix="+" label="Clips in the database" sub="from people — the biggest database in the category" active={revealed} />
          <Stat big value={200} suffix="+" label="Users from YC Startup School" sub="early access signups" active={revealed} />
          <Stat big value={92} suffix="%" label="Prediction accuracy" sub="up from a 75% baseline" active={revealed} />
        </div>
      ),
    },
    {
      key: "tiers",
      fullOnly: true,
      eyebrow: "Working with us",
      heading: <>Read it yourself, or hand us the <span className="font-serif font-normal italic">whole account</span>.</>,
      lede: "Four ways in, ordered by how much of the work we take on. Every rung produces more of the one thing a public model cannot buy — creative paired with what it actually did.",
      body: (revealed) => <ServiceTiers revealed={revealed} />,
    },
    {
      key: "checklist",
      fullOnly: true,
      eyebrow: "Before you buy anything",
      heading: <>Five questions worth asking <span className="font-serif font-normal italic">anyone</span> in this category.</>,
      lede: "Including us. Every answer below traces to code or data in our repository, and each one links to the artifact behind it.",
      body: (revealed) => <VendorChecklist revealed={revealed} />,
    },
  ];

  let counter = 0;
  const sections = defs
    .filter((d) => variant === "full" || !d.fullOnly)
    .map((d) => ({ ...d, n: d.unnumbered ? "—" : String(++counter).padStart(2, "0") }));
  const numberOf = (key: string) => sections.find((s) => s.key === key)?.n ?? "";

  const acts = [
    { n: numberOf("science"), title: "Measure", body: ACT_COPY.measure, href: "#science" },
    { n: numberOf("generate"), title: "Generate", body: ACT_COPY.generate, href: "#generate" },
    { n: numberOf("edit"), title: "Edit", body: ACT_COPY.edit, href: "#edit" },
  ];

  return (
    <main
      ref={scrollRef}
      tabIndex={0}
      aria-label="Soma demo — scroll to move through the read-out"
      className="fixed inset-0 overflow-y-auto bg-paper text-ink outline-none"
    >
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
            {/* The hero used to end at "finds the winner", which read as a measurement-only
                product and quietly contradicted §04: if generating creative is solved, why
                would we generate? The answer is the whole thesis — our generation is worth
                something BECAUSE it is filtered by the read. Say that here or the page
                argues with itself.
                Cut from four sentences to two: at a 7-second hero dwell nobody finished the
                original, and the two clauses that carry the thesis are the first and third. */}
            <p
              className="mt-5 max-w-[48ch] text-body text-pretty text-ink-2"
              style={{ opacity: heroIn ? 1 : 0, transition: "opacity .7s .2s" }}
            >
              Generating creative is solved. Knowing which one performs is not. Soma reads how
              a brain watches each cut, then builds and edits against that read — scored
              before you spend a dollar.
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
                {/* The account name, not the internal campaign slug. §04 introduces this
                    footage as Halden Supply's; the hero must not call the same five cuts
                    something else two screens earlier. */}
                <span>{heroAd.brand ?? BRAND.account}</span>
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

      {/* ── the three acts ──────────────────────────────────────────── */}
      <ActStrip acts={acts} />

      {/* The beta logo marquee stood here. Removed, not trimmed for time: the caption
          "Ads from these brands are in the corpus" is false for four of the five logos.
          Checked against data/ads/advertiser_summary.csv (917 attributions): Supercell,
          MrBeast, NextXI and Browserbase return ZERO rows — no ads attributed, none in
          corpus. TikTok returns 8 ads with n_in_corpus = 1. So the claim held for one
          logo and one ad out of 733, over a logo wall that a viewer reads as a customer
          list. The block's own comment called it "the single most checkable claim on the
          site", which was right — it just checked the wrong fact.
          To bring it back: list advertisers that actually return n_in_corpus > 0 (38 of
          the 917 have footage at all), or wait for signed partners and name those, per
          the third-party rule in PRODUCT.md. */}

      {/* Sections are declared as an ordered list below and rendered here, so the numbers
          come from position and the tint alternates on its own. Two things this buys: the
          act strip can never disagree with the section it links to, and /demo-short is the
          same list with the `fullOnly` entries filtered out — there is no second copy of any
          of this markup to drift. */}
      {sections.map((sec, i) => (
        <Fragment key={sec.key}>
          {sec.anchor ? <div id={sec.anchor} className="scroll-mt-[68px]" /> : null}
          <Section n={sec.n} eyebrow={sec.eyebrow} heading={sec.heading} lede={sec.lede} tint={i % 2 === 0}>
            {sec.body}
          </Section>
        </Fragment>
      ))}

      {/* ── CTA ─────────────────────────────────────────────────────────
          The 60-second cut ends on the editor. "Watch it live" (LivePlayer) stood here and
          was cut on purpose: it was the only real footage in the take, but it spent ~4s
          re-proving the measurement the first three beats had already established, and the
          two beats that actually differentiate — generate and edit — are worth that time
          instead. The read-out recap, the moat stats, the service ladder and the buyer's
          checklist were removed earlier. All of it is preserved in this branch's history;
          the checklist and service ladder are the strongest diligence assets on the site
          and want a home on /science or a /demo/full route rather than deletion. */}
      <section className="border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(56px,12vh,128px)]">
        <div className="mx-auto max-w-[980px]">
          <h2 className="max-w-[18ch] text-balance text-section text-ink">
            Stop guessing which ad <span className="font-serif font-normal italic">wins</span>.
          </h2>
          {/* Was "Ten clips, ranked and diagnosed. Send us your batch and see where your
              attention goes." — a measurement-only promise, which contradicted the 23
              seconds of generate-and-edit that immediately precede it. */}
          <p className="mt-4 max-w-[54ch] text-body text-ink-2">
            Send us your batch. We rank it, diagnose it, and give you back the cut that wins.
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

// ── the three acts ──────────────────────────────────────────────────
//
// Measure, generate, edit — the spine of the page, stated in the first screen. It earns
// its space twice over: it tells a reader who never scrolls what the product actually
// does, and it anchors acts two and three.
//
// The `n` values are the SECTION numbers each act links to, and they are passed in rather
// than typed here. They were once act indices (01/02/03), which meant the strip said
// "02 Generate" while the section it scrolled to was headed "08 Generation". Hardcoding the
// corrected numbers only moved the bug: the two variants number their sections differently,
// so "Generate" is §04 on /demo-short and §06 on /demo. Both are now derived from the
// rendered order, which is the only version that cannot go stale.

const ACT_COPY = {
  measure: "Read how a brain watches the cut — hook, attention, comprehension — and rank a batch on it.",
  generate: "Write a brief. Get ads built against your brand kit and filtered by the read before you see them.",
  edit: "Change the cut in a sentence. Every candidate edit is scored, and the winner is applied.",
};

function ActStrip({ acts }: { acts: { n: string; title: string; body: string; href: string }[] }) {
  return (
    <section className="border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(20px,4vh,34px)]">
      <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
        {acts.map((a) => (
          <a key={a.href} href={a.href} className="group flex gap-3">
            <span className="mt-[3px] text-[12px] tabular-nums tracking-[0.1em] text-ink-3">{a.n}</span>
            <span className="min-w-0">
              <span className="block text-ui font-medium text-ink transition-colors group-hover:text-ink-2">
                {a.title}
              </span>
              <span className="mt-1 block text-[12.5px] leading-[1.5] text-ink-3">{a.body}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
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
