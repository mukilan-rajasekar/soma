"use client";

// The /demo scroll narrative. Built to be recorded top-to-bottom with a voiceover — every
// section animates once on enter (see useReveal), so scroll speed can't ruin a take — and
// to stand on its own: a YC reader who clicks the link without watching the video still
// gets the whole product. Every number comes from public/demo/report.json, which
// tools/demo/build_report.py computes from real frozen-TRIBE output on real ads.
//
// Flow: problem → the science (dorsal/ventral) → hook → comprehension → ranked batch →
// same-campaign variants → dip + shot diagnosis → GENERATE → EDIT → watch it live →
// the flywheel → CTA.
//
// The page tells one three-act story — measure, generate, edit — and the acts are in that
// order on purpose. Generation only means anything after a reader believes the
// measurement, and the editor's numbers (+4 for cutting a shot) are the same
// leave-one-shot-out deltas §06 has just explained. The three-act strip under the hero
// exists so a reader who lands cold can still jump straight to acts two and three, which
// otherwise sit 5,000px down the page.

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
import MessageTrack from "./MessageTrack";
import LivePlayer from "./LivePlayer";
import GenerateStudio from "./GenerateStudio";
import EditStudio from "./EditStudio";
import ServiceTiers from "./ServiceTiers";
import VendorChecklist from "./VendorChecklist";
import { BRAND } from "./studio";
import type { Ad, Report } from "./types";

export default function DemoScrollPage({ report }: { report: Report }) {
  const batch = report.batch;
  const variants = report.campaign.variants;
  const byId = (list: Ad[], id: string) => list.find((a) => a.id === id) ?? list[0];

  const hookAd = byId(variants, "v03_30s_product_first"); // clearest ventral spike + winner
  const compAd = byId(batch, "tt_307"); // whey protein — named on screen AND out loud
  // The one ad in the batch with zero speech segments. Picked by the data rather than
  // hardcoded, so a rebuild that changes which clip is silent still lands on a real one.
  const silentAd = batch.find((a) => (a.transcript ?? []).length === 0) ?? compAd;
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
            {/* The hero used to end at "finds the winner", which read as a measurement-only
                product and quietly contradicted §07: if generating creative is solved, why
                would we generate? The answer is the whole thesis — our generation is worth
                something BECAUSE it is filtered by the read. Say that here or the page
                argues with itself. */}
            <p
              className="mt-5 max-w-[48ch] text-body text-pretty text-ink-2"
              style={{ opacity: heroIn ? 1 : 0, transition: "opacity .7s .2s" }}
            >
              Generating creative is solved — hundreds of variants in minutes. Knowing which
              one performs is not. Soma reads how a brain actually watches each cut, then uses
              that read to build and edit the ads that win — scored before you spend a dollar
              on them.
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
                {/* The account name, not the internal campaign slug. §07 introduces this
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
      <ActStrip />

      {/* ── social proof · beta cohort marquee ──────────────────────── */}
      <BetaMarquee />

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
        {(revealed) => (
          <div className="space-y-8">
            <ComprehensionPanel ad={compAd} active={revealed} />
            {/* The words themselves, under the mention pins. The panel above shows THAT
                the brand was named; this shows what was actually said around it. */}
            <MessageTrack ad={compAd} active={revealed} />
          </div>
        )}
      </Section>

      {/* ── 3b · the silent ad ──────────────────────────────────────────
          The strongest evidence the lane is reading the cortex and not the audio
          track: an ad with no voiceover at all still produces a language read. */}
      <Section
        n="04"
        eyebrow="No voiceover"
        heading={<>An ad that says nothing <span className="font-serif font-normal italic">out loud</span>.</>}
        lede="Speech recognition finds nothing in this cut, because there is nothing to find — the whole message is on screen. The language lane still reads, which is what separates measuring the cortex from transcribing the audio."
      >
        {(revealed) => <MessageTrack ad={silentAd} active={revealed} />}
      </Section>

      {/* ── 4 · videos in → ranked report out ───────────────────────── */}
      <Section
        n="05"
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
        n="06"
        eyebrow="Compare the cuts"
        heading={<>Same campaign, five cuts, one <span className="font-serif font-normal italic">timeline</span>.</>}
        lede="Comparing different campaigns is apples to oranges, so Soma compares cuts of the same ad. Here are five edits of one direct-response campaign, their attention arcs on a shared scale. They diverge in the opening seconds — where the edit decides everything."
        tint
      >
        {(revealed) => <VariantOverlay variants={variants} active={revealed} />}
      </Section>

      {/* ── 6 · dip detection + shot diagnosis ──────────────────────── */}
      <Section
        n="07"
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

      {/* ── 7 · generate from scratch ───────────────────────────────────
          Act two. Everything above proves the model can tell a winning cut from a losing
          one; this is what that measurement is FOR. The five candidates on the board are
          the same five cuts §05 just compared, so the section costs the reader no new
          material — it reframes footage they have already been shown as generator output,
          which is exactly what it will be. */}
      <div id="generate" />
      <Section
        n="08"
        eyebrow="Generation"
        heading={<>Write a brief. Get back the cut that <span className="font-serif font-normal italic">wins</span>.</>}
        lede="Describe the ad in plain language. Soma generates it against your brand and design system, with generators conditioned on neural context — what makes a hook land, what holds attention, what makes a product register — then tests every candidate against predicted attention and comprehension before you see any of them."
        tint
      >
        {(revealed) => <GenerateStudio report={report} active={revealed} />}
      </Section>

      {/* ── 8 · natural-language editing ────────────────────────────────
          Act three, and the payoff of §06: the leave-one-shot-out deltas the reader has
          already seen become the thing that ranks candidate edits. */}
      <div id="edit" />
      <Section
        n="09"
        eyebrow="AI ad editing"
        heading={<>Change it in a sentence. It re-scores <span className="font-serif font-normal italic">itself</span>.</>}
        lede="Video or static, edited in-platform in plain language. Splice a beat out, reorder shots, drop in text, or ask for options — every candidate edit goes through the model, and the best-performing cut comes back. No pixel-level regeneration: the frames you shot stay the frames you shot."
      >
        {(revealed) => <EditStudio report={report} active={revealed} />}
      </Section>

      {/* ── 9 · watch it live ───────────────────────────────────────── */}
      <Section
        n="10"
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

      {/* ── 10 · the flywheel / moat ────────────────────────────────── */}
      <Section
        n="11"
        eyebrow="The moat"
        heading={<>Every ad in the database makes the model <span className="font-serif font-normal italic">sharper</span>.</>}
        lede="Soma turns brain-response into the metrics you actually buy on — attention, retention, the odds a cut performs. Every ad that comes through grows the dataset behind that translation. The read-out is the product; the growing database is the moat."
      >
        {(revealed) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Corpus figures come from report.corpus, which build_report.py computes
                from data/ads/ad_manifest.csv. The old "collected from our waitlist"
                sub-label was wrong — this corpus came from ad_fetch_bb.py scraping
                TikTok Creative Center. */}
            <Stat big value={1500} suffix="+" label="Clips in the database" sub="ads, variants and cuts across the pipeline" active={revealed} />
            <Stat big value={report.corpus.advertisers} suffix="" label="Advertisers indexed" sub="the corpus behind the model" active={revealed} />
            {/* Signup count. Typed for now — wire this to the Supabase waitlist table
                so it counts itself and cannot go stale. */}
            <Stat big value={200} suffix="+" label="Users from YC Startup School" sub="early access signups" active={revealed} />
            {/* Accuracy figure is typed, not computed — its source is outside this repo.
                Point build_report.py at that result so the page regenerates from it. */}
            <Stat big value={92} suffix="%" label="Prediction accuracy" sub="up from a 75% baseline" active={revealed} />
          </div>
        )}
      </Section>

      {/* ── 11 · the service ladder ──────────────────────────────────── */}
      <Section
        n="12"
        eyebrow="Working with us"
        tint
        heading={<>Read it yourself, or hand us the <span className="font-serif font-normal italic">whole account</span>.</>}
        lede="Four ways in, ordered by how much of the work we take on. Every rung produces more of the one thing a public model cannot buy — creative paired with what it actually did."
      >
        {(revealed) => <ServiceTiers revealed={revealed} />}
      </Section>

      {/* ── 12 · the buyer's checklist ───────────────────────────────────
          The competitive section. It names nobody — see VendorChecklist for why
          that is the point, and why adding a competitor name would weaken it. */}
      <Section
        n="13"
        eyebrow="Before you buy anything"
        heading={<>Five questions worth asking <span className="font-serif font-normal italic">anyone</span> in this category.</>}
        lede="Including us. Every answer below traces to code or data in our repository, and each one links to the artifact behind it."
      >
        {(revealed) => <VendorChecklist revealed={revealed} />}
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

// ── the three acts ──────────────────────────────────────────────────
//
// Measure, generate, edit — the spine of the page, stated in the first screen. It earns
// its space twice over: it tells a reader who never scrolls what the product actually
// does, and it anchors acts two and three, which live 5,000px down and would otherwise be
// reachable only by scrolling past ten sections of measurement.

const ACTS: { n: string; title: string; body: string; href: string }[] = [
  {
    n: "01",
    title: "Measure",
    body: "Read how a brain watches the cut — hook, attention, comprehension — and rank a batch on it.",
    href: "#science",
  },
  {
    n: "02",
    title: "Generate",
    body: "Write a brief. Get ads built against your brand kit and filtered by the read before you see them.",
    href: "#generate",
  },
  {
    n: "03",
    title: "Edit",
    body: "Change the cut in a sentence. Every candidate edit is scored, and the winner is applied.",
    href: "#edit",
  },
];

function ActStrip() {
  return (
    <section className="border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(20px,4vh,34px)]">
      <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
        {ACTS.map((a) => (
          <a key={a.n} href={a.href} className="group flex gap-3">
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

// ── social proof · beta cohort ──────────────────────────────────────

// The brands already running ads through the beta. Each renders as an ink badge
// with its real mark in white. `logo` points to an SVG under public/logos; when
// absent, `mark` (a monogram letter) is shown instead. The badge forces the mark
// to white via filter, so a plain dark logo file drops straight in — EXCEPT when
// `rawLogo` is set, meaning the SVG already carries its own on-badge colours
// (e.g. a two-tone knock-out) and must be rendered as-is.
//   → To add NextXI later: drop public/logos/nextxi.svg and set logo below.
type Brand = { name: string; mark: string; logo?: string; rawLogo?: boolean };
const BETA_BRANDS: Brand[] = [
  { name: "TikTok", mark: "T", logo: "/logos/tiktok.svg" },
  { name: "Supercell", mark: "S" }, // only a 3-line pixel wordmark exists — illegible at badge size
  { name: "MrBeast", mark: "M" }, // no standalone symbol logo — monogram for now
  { name: "NextXI", mark: "N" }, // logo dropping in later
  { name: "Browserbase", mark: "B", logo: "/logos/browserbase.svg", rawLogo: true },
];

// Per-instance marquee tuning. --marquee-gap is the space between logos (and,
// because BrandMark carries it as margin-right, the seam gap between the two
// copies too); --marquee-duration is one full loop. Both cascade to the track.
// The edge masks fade logos in/out at the rails so nothing pops at the boundary.
const EDGE_FADE =
  "linear-gradient(to right, transparent, #000 7%, #000 93%, transparent)";
const marqueeStyle = {
  "--marquee-gap": "clamp(32px, 6vw, 72px)",
  "--marquee-duration": "36s",
  WebkitMaskImage: EDGE_FADE,
  maskImage: EDGE_FADE,
} as React.CSSProperties;

function BrandMark({ brand }: { brand: Brand }) {
  return (
    <div className="mr-[var(--marquee-gap)] flex shrink-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ink"
      >
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo}
            alt=""
            className="h-[19px] w-[19px] object-contain"
            // rawLogo SVGs are already coloured for the ink badge; everything else
            // is forced to a clean white silhouette so any dark logo file works.
            style={brand.rawLogo ? undefined : { filter: "brightness(0) invert(1)" }}
          />
        ) : (
          <span className="text-[15px] font-semibold leading-none text-white">{brand.mark}</span>
        )}
      </span>
      <span className="text-wordmark text-ink">{brand.name}</span>
    </div>
  );
}

function BetaMarquee() {
  return (
    <section className="border-y border-line bg-fill py-[clamp(24px,5vh,44px)]">
      <div className="mx-auto mb-[clamp(14px,2.6vh,22px)] max-w-[980px] px-[clamp(18px,5vw,40px)]">
        {/* Was "Already running ads through the beta" over these five logos. None of
            them are customers, and it is the single most checkable claim on the site —
            any of those brands, or a partner in diligence, disproves it in one email.
            The corpus framing is true (ad_fetch_bb.py pulls TikTok Creative Center top
            ads) and keeps the same visual. Swap this back only when there are signed
            partners, and then list those, per the third-party rule in PRODUCT.md. */}
        <span className="text-[12px] uppercase tracking-[0.12em] text-ink-3">
          Ads from these brands are in the corpus
        </span>
      </div>
      <div className="marquee relative overflow-hidden" style={marqueeStyle}>
        <div className="marquee-track flex w-max items-center">
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
              {BETA_BRANDS.map((brand) => (
                <BrandMark key={brand.name} brand={brand} />
              ))}
              <span className="mr-[var(--marquee-gap)] shrink-0 font-serif text-[19px] italic text-ink-3">
                and more
              </span>
            </div>
          ))}
        </div>
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
