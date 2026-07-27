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
//   /demo-short  variant="short"   7 beats. The recording surface: scrolled by hand and
//                                 narrated live at about three minutes, so what is missing
//                                 from it is missing for being repetitive, not for time.
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
// it — on both routes. Editing opens with the dip arc and the
// per-shot deltas that were "weak-spot detection", then splices the exact shot they name.
// The standalone versions were redundant because they showed the same artifacts a section
// or two early with no result attached, so neither route restores them.
//
// Short-only omissions, now that time is not the constraint. Each one is dropped because
// putting it in the walkthrough would say something the walkthrough already said:
//   novoice     its figure is the one comprehension just used, back to back
//   readout     three metrics the page has already shown being measured and then used
//   tiers       how to buy, which is the founder's line to deliver, not a slide to read out
//   checklist   the best diligence asset on the site and the worst thing to read aloud
// The last three are for the reader who clicks the link, and /demo is where they live.
//
// Two pieces of chrome go the other way and appear only on the SHORT route: the beta marquee
// (asked for there, and the long page has diligence material instead of social proof) and,
// inversely, the act strip, which the short route drops because its numbering has holes in
// it there. Both are flagged where they are rendered.
//
// Every number comes from public/demo/report.json, which tools/demo/build_report.py computes
// from real frozen-TRIBE output, except the three founder-attested stats in the database
// beat (flagged inline there).
//
// Copy rule for this file and everything it renders: NO em dashes. Commas, colons, full
// stops and parentheses instead. If you are adding a sentence here, it has to hold together
// without one.

import Link from "next/link";
import SiteHeader from "@/components/site/SiteHeader";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ON_SCREEN, useAnimeClock, useReveal } from "./useReveal";
import IntroCue from "./IntroCue";
import Section from "./Section";
import TwoRegionBrain3D from "./TwoRegionBrain3D";
import ArcPlot from "./ArcPlot";
import ShotDiagnosis from "./ShotDiagnosis";
import ComprehensionPanel from "./ComprehensionPanel";
import MessageTrack from "./MessageTrack";
import LivePlayer from "./LivePlayer";
import MetricRow from "./MetricRow";
import ServiceTiers from "./ServiceTiers";
import VendorChecklist from "./VendorChecklist";
import GenerateStudio from "./GenerateStudio";
import CorpusWall from "./CorpusWall";
import BatchOverlay from "./BatchOverlay";
import LaneSplit, { type SplitMoment } from "./LaneSplit";
import EditStudio from "./EditStudio";
import { BRAND } from "./studio";
import { fmtT, type Ad, type Report } from "./types";
import type { PreflightReport } from "../preflight/types";

// "full" is /demo — the long-form page a cold reader lands on. "short" is /demo-short, the
// recording surface: seven beats, scrolled by hand and narrated.
export type DemoVariant = "short" | "full";

// ── §01's provenance chips ──────────────────────────────────────────
//
// The three most credibility-bearing facts the company owns, and until now none of them was
// on either demo route: they lived on /science, which almost nobody who watches a three-minute
// walkthrough ever opens. Each traces to something in this repository, which is the only
// reason any of them is here:
//   TRIBE v2 / real fMRI     docs/strategy/VISION.md, SiteFooter.tsx, publish_to_supabase.py
//   1st of 263 teams         docs/GTM/YC-APPLICATION.md ("Algonauts 2025, first out of 263")
//   20,484 points at 1 Hz    docs/science/PREREGISTRATION.md ("all 20484 vertices", "1 Hz arc")
// The model is Meta's and the benchmark result is Meta's; the chips say so in that order, for
// the same reason YC-APPLICATION.md insists on it. Deliberately no scanner field strength: 3T
// is a property of the Algonauts dataset that nothing in this repo states, and a chip is only
// worth its space if every word of it survives being looked up.
const PROVENANCE = [
  "Meta's TRIBE v2, benchmarked against real fMRI",
  "1st of 263 teams, Algonauts 2025",
  "20,484 cortical points, once a second",
] as const;

/** The still cut from `ad`'s own clip at second `t`, under public/demo/split. */
const stillFor = (ad: Ad, t: number) =>
  ad.video
    .replace("/campaign/", "/demo/split/")
    .replace(/\.mp4$/, `_${String(t).padStart(2, "0")}.jpg`);

type SectionDef = {
  key: string;
  anchor?: string;
  eyebrow: string;
  heading: React.ReactNode;
  lede: string;
  fullOnly?: boolean;
  unnumbered?: boolean;
  /** Set this heading at hero size. For a line that is the ARGUMENT rather than a label for
   *  the figure under it: the founder asks it out loud and then answers it, and at section
   *  size it was set in the same type as six other headings and carried no more weight than
   *  any of them. A flag in the section list, next to the copy, because which lines get
   *  promoted is a content decision that will grow. */
  feature?: boolean;
  body: (revealed: boolean) => React.ReactNode;
};

export default function DemoScrollPage({
  report,
  preflight = null,
  variant = "full",
}: {
  report: Report;
  /** public/preflight/batch_report.json, a different artifact from report.json and one that
   *  can legitimately be absent on a fresh clone. Null just falls the comprehension beat back
   *  to its own panels, which is why the loader is fault-tolerant rather than throwing. */
  preflight?: PreflightReport | null;
  variant?: DemoVariant;
}) {
  const batch = report.batch;
  const variants = report.campaign.variants;
  const byId = (list: Ad[], id: string) => list.find((a) => a.id === id) ?? list[0];

  const hookAd = byId(variants, "v03_30s_product_first"); // clearest ventral spike + winner
  const heroAd = byId(variants, "v03_30s_product_first");
  // The other half of §02's pair: the cut in the same set whose hook scores lowest. Found by
  // score rather than named, so a rebuilt report can never leave the "worst" tile on a cut
  // that isn't worst any more.
  const worstHookAd = variants.reduce((a, b) => (b.scores.hook < a.scores.hook ? b : a), variants[0]);
  // the cut with the clearest mid-ad attention dip — the editing beat diagnoses it, then edits it
  const dipAd = byId(variants, report.campaign.dipId ?? variants[0].id);
  const compAd = byId(batch, "tt_307"); // named on screen AND out loud
  // The one ad in the batch with zero speech segments. Picked by the data rather than
  // hardcoded, so a rebuild that changes which clip is silent still lands on a real one.
  const silentAd = batch.find((a) => (a.transcript ?? []).length === 0) ?? compAd;

  // The instant the ventral lane peaks inside the hook window, computed the way
  // build_report.py computes its own `vpeak`: argmax over the first `hookSeconds` of samples.
  // §02 rings it on the chart and quotes it in prose, and both read this.
  const hookPeakT = (() => {
    const v = hookAd.lanes.ventral ?? [];
    const n = hookAd.timestamps.filter((t) => t < report.hookSeconds).length || 1;
    let best = 0;
    for (let i = 1; i < Math.min(n, v.length); i++) if (v[i] > v[best]) best = i;
    return hookAd.timestamps[best] ?? 0;
  })();

  // The two seconds §01's split figure reads. Chosen by looking at heroAd's lanes: 0:05 is
  // where the surprise network runs furthest ahead of the attention network in this cut, and
  // 0:22 is where that reverses hardest. They are FIXED here rather than recomputed on every
  // render for one reason — the stills have to exist on disk, and a moment derived at render
  // time would point at a frame nobody cut. The numbers printed beside them are read from the
  // lanes every time (see LaneSplit), and the figure removes itself if a rebuilt report ever
  // stops the two moments disagreeing, so the pairing cannot go quietly false either way.
  // The stills are pulled from heroAd's own video path, so promoting a different cut to the
  // hero cannot leave this pointing at the old ad's frames.
  const splitMoments: [SplitMoment, SplitMoment] = [
    { t: 5, src: stillFor(heroAd, 5), caption: "the hood comes out of the box" },
    { t: 22, src: stillFor(heroAd, 22), caption: "held steady, brand on screen" },
  ];

  const [heroRef, heroIn] = useReveal<HTMLDivElement>({ threshold: 0.2 });
  // The hero build is replayed for the recording. useReveal latches `revealed` permanently —
  // correct for a reader, wrong for a take, because the hero fires at hydration and a click a
  // minute later would open the recording on an already-finished page. Rather than make the
  // latch resettable (it is depended on by every other consumer), the hero gates on the latch
  // AND a local arm flag that IntroCue drops and raises around its pause: blank while the
  // recorder is being started, then built on cue, so the take opens on the headline arriving.
  // Three states, not two, and the middle one is the whole point. "rest" is a finished hero
  // with every transition suppressed: nothing has animated, but nothing is missing either, so
  // anyone opening the link sees a page rather than a white void. "blank" is the recorder
  // window the intro control opens, and it is a cut, not a fade. "build" is the arrival.
  // /demo never leaves "build": it has no intro control and should behave like any other page.
  const [heroPhase, setHeroPhase] = useState<"rest" | "blank" | "build">(variant === "full" ? "build" : "rest");
  const heroOn = heroIn && heroPhase !== "blank";
  // Everything below the header is keyed on this, so a click on the intro control remounts the
  // whole narrative and every reveal latch inside it goes back to false. That is the only way
  // to get a genuinely COLD page for a retake: the latches are permanent by design (a figure
  // must not re-animate when you scroll back past it mid-take), so the second take would
  // otherwise open on a page that had already spent half its animations. A remount is cheap
  // here — the page is a static document, and the scroll is pinned to the top when it happens.
  const [takeId, setTakeId] = useState(0);
  const introCue = useCallback((cue: "reset" | "build") => {
    if (cue === "build") { setHeroPhase("build"); return; }
    setHeroPhase("blank");
    setTakeId((n) => n + 1);
  }, []);
  // Transitions run in BOTH directions, so sharing one would fade the hero out over a second
  // before rebuilding it — the recording would open on the page dissolving. Only "build" gets
  // a transition, which makes the blanking a cut and leaves "rest" completely still.
  const heroT = (t: string) => (heroPhase === "build" ? t : "none");

  // §01's body, gated on its own arrival rather than on the section's. The two region cards
  // are timed against TwoRegionBrain's internal stages (880ms and 1260ms against the frames
  // where the dorsal and ventral regions light), and the figure now waits to be framed
  // before it builds, so the cards have to wait on the same signal or the pairing the whole
  // section rests on comes apart. Anchored on the grid root, which at md+ is the same row as
  // the figure (the two observers fire ~17px of scroll apart) and in one column is the
  // cards' own top edge, so nothing here animates above the fold at either width.
  const [scienceRef, scienceIn] = useReveal<HTMLDivElement>(ON_SCREEN);

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
      // "two networks" was wrong about the page it opens. §02's arc draws three lanes and §03
      // is entirely the third one, so the beat that introduces the read-out was naming two of
      // the three things the next two beats measure.
      lede: "Generic eye-tracking tells you where a gaze lands. Soma reads the cortex itself: three networks, read separately, once a second for the whole runtime.",
      // The two cards are timed against the figure beside them, not against each other: the
      // dorsal card arrives as the dorsal region lights (TwoRegionBrain's STAGE.dorsal opens
      // at 0.42 of a 2100ms build ≈ 880ms) and the ventral card as the ventral one does
      // (0.60 ≈ 1260ms). Reading the name while the region appears is the whole point of
      // having both; two cards sliding in on a generic 80ms stagger would have been motion
      // for its own sake.
      body: (revealed) => (
        <div>
        {/* The provenance, three chips, at the top of the beat that asks to be believed. Every
            one of these is checkable and none of them was on this route: the strongest
            credibility facts the company owns lived on /science, which most people watching a
            three-minute walkthrough will never open. Sourced, in order:
            docs/strategy/VISION.md and SiteFooter (TRIBE v2, Meta, benchmarked vs real fMRI),
            docs/GTM/YC-APPLICATION.md (1st of 263 teams, Algonauts 2025) and
            docs/science/PREREGISTRATION.md (20,484 vertices, the 1 Hz arc).
            NOT "3T": the scanner field strength is a property of the Algonauts dataset that
            this repository nowhere states, and the chips are only worth having if every one of
            them survives being looked up. */}
        <div className="mb-7 flex flex-wrap gap-2">
          {PROVENANCE.map((c, i) => (
            <span
              key={c}
              className="rounded-badge border border-line-2 px-3 py-[7px] text-[12px] leading-none text-ink-2"
              style={{
                opacity: revealed ? 1 : 0,
                transform: revealed ? "none" : "translateY(6px)",
                transition: `opacity .5s ${120 + i * 90}ms, transform .5s ${120 + i * 90}ms`,
              }}
            >
              {c}
            </span>
          ))}
        </div>
        <div ref={scienceRef} className="grid grid-cols-1 items-stretch gap-8 md:grid-cols-[1fr_360px]">
          {/* Stacked, not side by side. Two short cards next to a ~390px figure left a 130px
              hole above them and another below: the beat's own frame had a void in the middle
              of it. Stacked, the left column is close to the figure's height and the row reads
              as two columns rather than as a figure with something small parked beside it. It
              also survives the downscale better, since each card is now full column width
              instead of half.

              STRETCHED, not centred. `items-center` sizes this column to its content and hangs
              it in the middle of the row, which is what put 109px of empty paper above the
              first card and another 109px below the second: measured at 1512x860, a 228px
              column floating in a 446px row. Stretching makes the two columns the same object
              height, so the row has a top edge and a bottom edge instead of a figure with
              something small parked halfway down it. Two rows rather than auto rows, so the
              cards split the height evenly instead of the first one taking all the slack. */}
          <div className="grid h-full grid-cols-1 grid-rows-2 gap-4">
            <RegionCard
              title="Dorsal attention"
              tag="IPS · FEF · superior parietal"
              body="Decides what the viewer looks at, and holds on."
              tone="ink"
              revealed={revealed && scienceIn}
              delay={880}
            />
            <RegionCard
              title="Ventral · surprise"
              tag="anterior insula · ACC"
              body="Fires on the unexpected. That jolt is what a hook actually is."
              tone="accent"
              revealed={revealed && scienceIn}
              delay={1260}
            />
          </div>
          <div className="flex items-center rounded-2xl border border-line bg-paper p-4">
            {/* The real cortex, as a rotating point cloud, rather than the flat lateral
                outline. It keeps its own reveal easing for the network colours and leaders,
                and falls back to the 2D figure automatically where WebGL is unavailable —
                so the staged-build version is still what ships to those viewers.

                290, DOWN FROM 412, AND THE CORTEX DOES NOT GET SMALLER. The camera fits on
                max(FIT_V, FIT_H / aspect): in a box this narrow the HORIZONTAL term binds, so
                it is pulled back far enough to clear the width while it turns, and everything
                that buys vertically is empty paper. Measured down the range at 1512x860, the
                painted cloud is 236px tall at 412, at 360, at 330, at 310 and at 290, and only
                starts shrinking at 270 (218px) and 250 (201px). So 290 is the knee: 122px of
                dead air removed, the figure itself untouched. Dead space inside the box goes
                from 99px above and 76px below the cloud to 35px and 19px.

                Do not raise this to "give the brain room". It has the room; it cannot use it. */}
            <TwoRegionBrain3D active={revealed && scienceIn} height={290} />
          </div>
        </div>

        {/* The third lane, queued rather than presented. Deliberately NOT a third RegionCard:
            the two above it are the networks this beat's figure actually lights, and the two
            columns beside them are tuned to the same height (see the grid note above), so a
            third peer card would both break that and claim the cortex render shows something
            it does not. Dashed and low-contrast reads as "coming", which is the truth — §03 is
            entirely this lane. The triad is established before §02 draws all three arcs, which
            is the point: it stops §02 introducing a metric §01 never mentioned. */}
        <div
          className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-dashed border-line-2 px-4 py-3"
          style={{
            opacity: revealed && scienceIn ? 1 : 0,
            transition: "opacity .55s 1640ms",
          }}
        >
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-ink-3" />
          <span className="text-ui font-medium text-ink-2">Comprehension</span>
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
            association cortex
          </span>
          <span className="ml-auto text-[12.5px] text-ink-3">
            where meaning gets built · read in 03
          </span>
        </div>

        <LaneSplit ad={heroAd} moments={splitMoments} active={revealed} />
        </div>
      ),
    },
    {
      key: "hook",
      eyebrow: "Hook scoring",
      heading: <>The first three seconds are <span className="font-serif font-normal italic">everything</span>.</>,
      lede: "The first 3 seconds are scored separately, about 45% of the total. Surprise is what measures them.",
      // The science section already renders TwoRegionBrain (focus="both"). A second brain
      // stood here — focus="ventral" plus an "in the hook window, the ventral network leads"
      // caption — repeating the same visual and the same sentence the science body copy had
      // already made, for ~470px. The arc carries the hook argument on its own.
      body: (revealed) => (
        <div>
          <ArcPlot
            dorsal={hookAd.lanes.dorsal}
            ventral={hookAd.lanes.ventral}
            // The third lane, as beads. This beat's whole argument is that attention is not
            // one thing, so showing two of the three networks and naming the third in prose
            // was the figure contradicting its own heading.
            comprehension={hookAd.lanes.language}
            showComprehension
            timestamps={hookAd.timestamps}
            duration={hookAd.duration}
            hookSeconds={report.hookSeconds}
            animate={revealed}
            // Rings the surprise peak the read-out card below names in words. Derived from
            // the same lane and the same window build_report.py's `vpeak` uses (argmax over
            // the hook samples), so the ring, the sentence and the score cannot disagree —
            // a hardcoded 2s would have gone stale the first time the report was rebuilt.
            peakMark={{ t: hookPeakT, lane: "ventral", label: fmtT(hookPeakT) }}
            height={206}
          />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat big value={hookAd.scores.hook} suffix="/100" label={`Hook · ${hookAd.title}`} sub="~45% of the total" tone="pos" active={revealed} />
            <Stat big value={worstHookAd.scores.hook} suffix="/100" label={`Hook · ${worstHookAd.title}`} sub="same product, same length, same 3 seconds" tone="neg" active={revealed} />
            {/* Lands after the arc has drawn and the ring has appeared: the sentence explains
                a picture the reader has already watched being made. */}
            <Rise on={revealed} delay={1500} className="h-full">
              <div className="flex h-full min-h-[178px] items-center rounded-2xl border border-line bg-paper p-5 text-[13px] leading-[1.6] text-ink-2">
                {hookAd.reads.hook}
              </div>
            </Rise>
          </div>
        </div>
      ),
    },
    {
      key: "comprehension",
      // The heading is the line this beat was kept for, so it is set at hero size: it is the
      // question the founder asks out loud and then answers, not a caption for the figure.
      feature: true,
      eyebrow: "Comprehension",
      heading: <>Did the brand actually <span className="font-serif font-normal italic">land</span>?</>,
      lede: "A held gaze is worthless if the product never registers. Soma reads the ad's own words: on screen via text recognition, out loud via speech recognition. When the campaign is named and the language cortex confirms it registers, the score rises.",
      // The figure is /preflight's OverlayPanel, not demo2's VariantOverlay, and it moved here
      // from the generation beat. Two reasons it belongs here specifically. It carries a lane
      // picker, so the same five cuts can be re-read as attention, surprise or COMPREHENSION —
      // which turns a static ranking into the question this heading asks, answered on screen.
      // And it is the better instrument: DeltaChart takes series style as data rather than as a
      // pile of booleans, so one component serves the single-ad player and the five-ad overlay
      // instead of demo2 keeping two copies of the same canvas maths.
      //
      // It reads public/preflight/batch_report.json, which is a DIFFERENT artifact from
      // report.json and can legitimately be absent on a fresh clone. Absent, this falls back
      // to the panels below rather than rendering a hole, and on /demo the panels render
      // anyway: a reader arriving cold wants the words that were actually said, and the
      // walkthrough does not, because the founder is saying them.
      body: (revealed) => (
        <div className="space-y-8">
          {preflight ? (
            <div>
              <BatchOverlay report={preflight} active={revealed} />
              <p className="mt-4 max-w-[68ch] text-[13.5px] leading-[1.6] text-ink-2">
                The same five cuts on one axis. Change the lane and the batch answers a
                different question: which one held the eye, which one surprised, and which one
                actually registered.
              </p>
            </div>
          ) : null}
          {variant === "full" || !preflight ? (
            <>
              <ComprehensionPanel ad={compAd} active={revealed} />
              {/* The words themselves, under the mention pins. The panel above shows THAT
                  the brand was named; this shows what was actually said around it. */}
              <MessageTrack ad={compAd} active={revealed} />
            </>
          ) : null}
        </div>
      ),
    },
    {
      key: "novoice",
      // Kept OFF the recording route on purpose, even with the time to spare. Its figure is
      // MessageTrack, which is the same component the section immediately above it already
      // renders, so back to back the two beats read as one point made twice — and the
      // instruction for this cut was explicitly not to repeat. The claim itself is worth
      // having, which is why it stays on /demo where a reader arrives at it cold.
      fullOnly: true,
      eyebrow: "No voiceover",
      heading: <>An ad that says nothing <span className="font-serif font-normal italic">out loud</span>.</>,
      lede: "Speech recognition finds nothing in this cut, because there is nothing to find: the whole message is on screen. The language lane still reads, which is what separates measuring the cortex from transcribing the audio.",
      body: (revealed) => <MessageTrack ad={silentAd} active={revealed} />,
    },
    {
      key: "generate",
      anchor: "generate",
      eyebrow: "Generation",
      heading: <>Write a brief. Get back the cut that <span className="font-serif font-normal italic">wins</span>.</>,
      lede: "Describe the ad in plain language. Soma generates against your brand kit and kills the losers before you see them.",
      // The five-arc overlay used to close this beat, as evidence for the board's ranking. It
      // now opens the comprehension beat instead, in /preflight's version with a lane picker.
      // The trade is deliberate: here it could only ever re-state a ranking the board had just
      // made in a form the reader had just read, and there it answers the heading above it.
      // This beat is 650px shorter for losing it and does not miss it — the cull chart and the
      // winner card are the argument, and the board is the payoff.
      body: (revealed) => <GenerateStudio report={report} active={revealed} />,
    },
    {
      key: "edit",
      anchor: "edit",
      eyebrow: "AI ad editing",
      heading: <>Change it in a sentence. It re-scores <span className="font-serif font-normal italic">itself</span>.</>,
      lede: "Edited in plain language. Every candidate edit is scored and the best cut comes back, from your frames, never regenerated.",
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
              animate={revealed}
              height={210}
              showVentral={false}
              showHook={false}
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
      // Back on the recording route, and the single strongest addition the extra time buys.
      // It is the only real footage on the page: everything before it is charts ABOUT an ad,
      // and this is the ad, playing, with the score moving against the frames on screen. It
      // was cut at 55 seconds for costing ~4s to re-prove the measurement; narrated, it is
      // the shot where a viewer stops reading the page and believes it.
      eyebrow: "Watch it live",
      heading: <>The ad and its score, <span className="font-serif font-normal italic">side by side</span>.</>,
      lede: "The clip is the clock. Attention, surprise and the score track the frames on screen.",
      body: (revealed) => <LivePlayer ad={heroAd} hookSeconds={report.hookSeconds} active={revealed} />,
    },
    {
      key: "readout",
      // Still off the recording route. It is a recap: by the time a viewer reaches it they
      // have watched the composite be measured in §02, used to rank a batch in §05 and moved
      // by an edit in §06. Restating the same three numbers with a paragraph under each is
      // the one thing a narrated walkthrough cannot afford, because the founder is already
      // saying it out loud.
      fullOnly: true,
      unnumbered: true,
      eyebrow: "The read-out",
      heading: <>The numbers that actually <span className="font-serif font-normal italic">mean</span> something.</>,
      lede: "One composite, three drivers. Every metric is an attention measurement with a statistical read on top and a plain-English line underneath, because a raw number on its own tells you nothing.",
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
      // are typed literals rather than read from report.json. One note for whoever edits this
      // next: "from our design partners" describes provenance this repo cannot corroborate —
      // ad_fetch_bb.py populates the corpus by scraping TikTok Creative Center, and
      // report.corpus.ads is 700, which is a different 700 from the 500 claimed here. It is
      // here because it was asked for directly.
      // Three tiles, one anatomy. They used to have three: bars render only when a tile has a
      // `tone`, so the two counts had none and 92% had one, which left the three sub-labels
      // sitting at different heights across the row and made a deliberate grid look like a
      // rendering accident. The 75% baseline notch made it worse: an unlabelled hairline drawn
      // in paper over the fill, which at the 640px this is watched at reads as a seam in the
      // bar rather than as a reference point.
      // Bars are gone from this beat entirely. Two of these three numbers have no 0-100 scale
      // for a bar to be a fraction OF, so it was never measuring anything here. §02's hook
      // tiles keep theirs, where 0-100 is real and the green/red pair IS the argument.
      // This used to be a heading and one row of numbers, and framed for the walkthrough it was
      // the emptiest shot on the page: ~310px of blank paper below the tiles, about a third of
      // the screen, under the largest claim the page makes. Padding was tried and reverted — it
      // lengthens the page without moving anything into shot. CorpusWall below is the fix that
      // works, because the claim is about ads and the answer to it is ads: ten real ones from
      // report.json's batch, each with the score the model gave it.
      body: (revealed) => (
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat big lg value={500} suffix="" label="Ads in the live database" sub="from our design partners" active={revealed} />
            <Stat big lg value={100} suffix="+" label="Founders and companies" sub="on the waitlist" active={revealed} />
            <Stat big lg value={92} suffix="%" label="Prediction accuracy" sub="up from a 75% baseline" active={revealed} />
          </div>
          <CorpusWall batch={batch} active={revealed} />
          {/* The one thing on this route that did not work, next to the tile that claims 92%.
              Every figure on the page until here moves the right way: scores climb, the edit
              adds points, the top candidate wins, the losers get culled. A page on which
              nothing ever misses is a page a technical reader discounts wholesale, and this
              company happens to own the strongest possible answer to that — a pre-registered
              test with a null outcome, published rather than buried. It was on /demo only,
              inside the vendor checklist, which is the section a narrated walkthrough drops
              because it is five questions to read aloud. The claim survives on its own in one
              sentence, and it belongs under the accuracy number rather than anywhere else.
              Wording is VendorChecklist's, deliberately: that answer is already the vetted
              phrasing and the two must not drift. Source: docs/science/PREREGISTRATION.md
              (Stouffer p ~ 0.69 across 15 videos) and validation/…/retention_head_roi.json. */}
          <Rise on={revealed} delay={900}>
            <p className="mt-6 max-w-[74ch] text-[13px] leading-[1.6] text-ink-3">
              And the one we published that did not work: retention, tested against real
              most-replayed data. It came back null. It sits on{" "}
              <Link href="/science" className="text-ink underline decoration-line-2 underline-offset-[3px] transition-colors hover:decoration-ink">
                the science page
              </Link>{" "}
              next to everything that did work, because a read-out you cannot check is not a
              read-out.
            </p>
          </Rise>
        </div>
      ),
    },
    {
      key: "tiers",
      fullOnly: true,
      eyebrow: "Working with us",
      heading: <>Read it yourself, or hand us the <span className="font-serif font-normal italic">whole account</span>.</>,
      lede: "Four ways in, ordered by how much of the work we take on. Every rung produces more of the one thing a public model cannot buy: creative paired with what it actually did.",
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
    .map((d) => ({ ...d, n: d.unnumbered ? "–" : String(++counter).padStart(2, "0") }));
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
      aria-label="Soma demo: scroll to move through the read-out"
      className="fixed inset-0 overflow-y-auto bg-paper text-ink outline-none"
    >
      <SiteHeader />

      {/* The page does not scroll itself. It is narrated live, by hand, and the only thing
          this control owns is WHEN the first animation happens: it resets the page cold,
          fades itself out of shot, and builds the hero after a short deliberate pause so the
          recording opens on the headline arriving instead of on a page that finished
          animating during hydration. Everything after it is arrival-gated (see useReveal).
          Short route only: /demo is a page to read, and a control that resets it to blank is
          chrome there, not a feature. */}
      {variant === "short" ? <IntroCue scrollRef={scrollRef} onCue={introCue} /> : null}

      {/* Keyed so the intro control can hand back a cold page for a retake: see `takeId`. */}
      <Fragment key={takeId}>
      {/* ── 0 · the problem ─────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative overflow-hidden px-[clamp(18px,5vw,40px)] pb-[clamp(40px,8vh,80px)] pt-[clamp(40px,9vh,96px)]"
      >
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div>
            <div
              className="mb-4 text-[12px] uppercase tracking-[0.12em] text-ink-3"
              style={{ opacity: heroOn ? 1 : 0, transition: heroT("opacity .6s") }}
            >
              Soma · a brain read-out for ads
            </div>
            <h1
              className="max-w-[16ch] text-balance text-hero text-ink"
              style={{ opacity: heroOn ? 1 : 0, transform: heroOn ? "none" : "translateY(10px)", transition: heroT("opacity .7s .05s, transform .7s .05s") }}
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
              style={{ opacity: heroOn ? 1 : 0, transition: heroT("opacity .7s .2s") }}
            >
              Soma reads how a brain watches each cut, then builds and edits against that
              read. Scored before you spend a dollar.
            </p>
            <div
              className="mt-7 flex flex-wrap items-center gap-3"
              style={{ opacity: heroOn ? 1 : 0, transition: heroT("opacity .7s .3s") }}
            >
              <a href="#science" className="rounded-xl bg-ink px-5 py-[12px] text-ui font-medium text-white transition-colors hover:bg-ink/85">
                See how it works
              </a>
              <Link href="/console" className="rounded-xl border border-line-2 px-5 py-[12px] text-ui font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink">
                Open the live console
              </Link>
            </div>
          </div>

          <div style={{ opacity: heroOn ? 1 : 0, transition: heroT("opacity 1s .2s") }}>
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
                animate={heroOn}
                // The one plot on the page that does NOT wait to be framed. Every other
                // ArcPlot gates itself on its own arrival so it cannot draw off camera;
                // this one is the frame the recording opens on, and at some viewport
                // widths its top sits just below the 55% line at scrollTop 0, which would
                // leave the hero holding an empty chart until the take started moving.
                eager
                // No legend on the hero card. The lanes get named properly one screen later,
                // in §01, which is the section that exists to name them, and then explained
                // under §02's arc where all three are drawn; printing the same six lines here
                // first made the hero card a figure with a key attached and pushed the score
                // out of the opening frame. A viewer meets the curves here and learns what
                // they are immediately after, which is the right order.
                showLegend={false}
                height={172}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── the three acts ──────────────────────────────────────────────
          /demo only. On /demo-short it was three section numbers reading 01 · 04 · 05 (the
          two beats between them are full-only), so the strip advertised a table of contents
          with holes in it, and it summarised in one line each what the next 40 seconds show
          anyway. On the long page it earns its space: a cold reader who never scrolls still
          learns what the product does. */}
      {variant === "full" ? <ActStrip acts={acts} /> : null}

      {/* Social proof, /demo-short only, sitting where the act strip does on the long page.
          One flag for whoever edits this next, and then it is the founder's call, not this
          file's: the repo cannot corroborate the customer relationship behind four of these
          five marks. data/ads/advertiser_summary.csv (917 attributions) returns ZERO rows
          for Supercell, MrBeast, NextXI and Browserbase, and TikTok returns 8 ads with
          n_in_corpus = 1 — which is why the earlier "ads from these brands are in the
          corpus" caption was removed as false. The caption now claims a beta relationship
          instead, which is a fact about the business rather than about this repository, and
          PRODUCT.md records those as founder-attested. It is still the most checkable claim
          on the page: any of these five disproves it in one email. Replace with signed
          partners as soon as there are any. */}
      {variant === "short" ? <BetaMarquee /> : null}

      {/* Sections are declared as an ordered list below and rendered here, so the numbers
          come from position and the tint alternates on its own. Two things this buys: the
          act strip can never disagree with the section it links to, and /demo-short is the
          same list with the `fullOnly` entries filtered out — there is no second copy of any
          of this markup to drift. */}
      {sections.map((sec, i) => (
        <Fragment key={sec.key}>
          {sec.anchor ? <div id={sec.anchor} className="scroll-mt-[68px]" /> : null}
          <Section n={sec.n} eyebrow={sec.eyebrow} heading={sec.heading} lede={sec.lede} tint={i % 2 === 0} feature={sec.feature}>
            {sec.body}
          </Section>
        </Fragment>
      ))}

      {/* ── CTA ─────────────────────────────────────────────────────────
          The closing frame, and the only section on the page sized to BE a frame rather than
          to be scrolled through. min-h-screen with its content centred means that however far
          the founder scrolls at the end, the last thing on screen is the close and nothing
          else: no leftovers of the database beat sliced across the top, no empty paper in a
          corner. It used to be a short block, and the most-remembered frame of the take was
          half debris, carried no wordmark and gave a viewer no address to go to. */}
      <section className="flex min-h-screen flex-col justify-center border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(56px,12vh,128px)]">
        <div className="mx-auto w-full max-w-[980px] text-center">
          <span className="text-wordmark text-ink">soma</span>
          <h2 className="mx-auto mt-10 max-w-[14ch] text-balance text-hero text-ink">
            Stop guessing which ad <span className="font-serif font-normal italic">wins</span>.
          </h2>
          {/* Was "Ten clips, ranked and diagnosed. Send us your batch and see where your
              attention goes." — a measurement-only promise, which contradicted the 23
              seconds of generate-and-edit that immediately precede it. */}
          <p className="mx-auto mt-6 max-w-[44ch] text-body text-ink-2">
            Send us your batch. We rank it, diagnose it, and give you back the cut that wins.
          </p>
          {/* What the intake actually is. The page spends three minutes proving the read-out
              and then closed without ever saying what a customer hands over or how long it
              takes, so the last thing a viewer saw was a promise with no mechanics attached.
              Both halves are checkable rather than aspirational: src/lib/upload.ts pins
              ACCEPT_ATTR to "video/mp4" and MAX_UPLOAD_BYTES to 150MB, so mp4 is the literal
              and only thing the product accepts, and "hours, not a research cycle" is
              ServiceTiers' own line, which /demo already carries.
              NO PRICE, on purpose. Every tier is sold in a conversation right now and
              ServiceTiers records the decision not to print one; a number invented for a
              closing frame is exactly the kind this repo calls a bug. */}
          <p className="mx-auto mt-3 max-w-[46ch] text-[13.5px] leading-[1.6] text-ink-3">
            An mp4 per cut is the whole intake. Turnaround in hours, not a research cycle.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="rounded-xl bg-ink px-6 py-[15px] text-ui font-medium text-white transition-colors hover:bg-ink/85">
              Request access
            </Link>
            <Link href="/console" className="rounded-xl border border-line-2 px-6 py-[15px] text-ui font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink">
              Explore the live console
            </Link>
          </div>
          {/* A closing frame with no address is a closing frame a viewer cannot act on. This is
              the one line in the take that tells them where to go. */}
          <div className="mt-12 text-[13px] tracking-[0.02em] text-ink-3">usesoma.work</div>
        </div>
      </section>
      </Fragment>
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
  measure: "Read how a brain watches the cut (hook, attention, comprehension) and rank a batch on it.",
  generate: "Write a brief. Get ads built against your brand kit and filtered by the read before you see them.",
  edit: "Change the cut in a sentence. Every candidate edit is scored, and the winner is applied.",
};

function ActStrip({ acts }: { acts: { n: string; title: string; body: string; href: string }[] }) {
  return (
    <section className="border-t border-line px-[clamp(18px,5vw,40px)] py-[clamp(20px,4vh,34px)]">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
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
// ── the beta cohort marquee ─────────────────────────────────────────
//
// An infinite sideways scroll of the beta cohort's marks. `logo` points to an SVG under
// public/logos; when absent, `mark` (a monogram letter) is shown instead. The badge forces
// the mark to white via filter, so a plain dark logo file drops straight in — EXCEPT when
// `rawLogo` is set, meaning the SVG already carries its own on-badge colours and must be
// rendered as-is.
//   → To add a logo later: drop public/logos/<name>.svg and set `logo` below.
//
// `size` is the rendered box in px, defaulting to 19. It exists because equal boxes do not
// give equal weight: a wide silhouette letterboxed into a square box lands optically smaller
// than a square glyph in the same box, and a solid disc lands larger. The three values below
// are the ones that read level against TikTok and Browserbase at the real 36px badge.
type Brand = { name: string; mark: string; logo?: string; rawLogo?: boolean; size?: number };
// TikTok leads. The opening frame of the recording is the one frame guaranteed to be seen, so
// the roster enters on its most recognisable mark instead of ending on it.
const BETA_BRANDS: Brand[] = [
  { name: "TikTok", mark: "T", logo: "/logos/tiktok.svg" },
  { name: "Browserbase", mark: "B", logo: "/logos/browserbase.svg", rawLogo: true },
  // Supercell's only mark is the stacked SUP/ERC/ELL wordmark, which at 19px is nine glyphs
  // across three rows and rasterises to noise. The badge carries its S alone, cut from that
  // wordmark, so the slab letterform is theirs rather than a monogram set in our UI face.
  { name: "Supercell", mark: "S", logo: "/logos/supercell.svg", size: 18 },
  // Panther head with the bolt through it, reduced to one silhouette: the bolt and the open
  // jaw are knocked out, which is what keeps it reading as a cat and not a blob. The long
  // thin bolt tail is cropped off — at this size it only stole width from the head. Runs
  // larger than the rest because the artwork is wider than it is tall.
  { name: "MrBeast", mark: "M", logo: "/logos/mrbeast.svg", size: 22 },
  // Disc, dashed ring, light letterforms. "NEXTXI" cannot be read at 19px so only the XI is
  // kept, and the ring is coarsened to 14 dashes so the gaps survive the downsample.
  { name: "NextXI", mark: "N", logo: "/logos/nextxi.svg", size: 18 },
];

// Per-instance marquee tuning. --marquee-gap is the space between logos (and, because
// BrandMark carries it as margin-right, the seam gap between the two copies too);
// --marquee-duration is one full loop. Both cascade to the track, whose keyframes and
// reduced-motion fallback live in globals.css. The edge masks fade marks in and out at the
// rails so nothing pops at the boundary.
// The gap is what decides whether the loop's seam is visible. One copy of the roster at the old
// clamp(32px,6vw,72px) measured about 1,160px, so inside a 1,440px frame you saw the end of copy
// one AND the start of copy two: the opening frame of the recording showed "Supercell" twice,
// once whole and once cut off at the rail, which reads as a rendering fault rather than as an
// infinite scroll. Widening the gap pushes a single copy past the frame width so the join
// happens outside it, and the deeper edge fade covers what is left at the rails.
const EDGE_FADE = "linear-gradient(to right, transparent, #000 11%, #000 89%, transparent)";
const marqueeStyle = {
  "--marquee-gap": "clamp(40px, 8vw, 108px)",
  "--marquee-duration": "42s",
  WebkitMaskImage: EDGE_FADE,
  maskImage: EDGE_FADE,
} as React.CSSProperties;

function BrandMark({ brand }: { brand: Brand }) {
  return (
    <div className="mr-[var(--marquee-gap)] flex shrink-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="rounded-badge flex h-9 w-9 shrink-0 items-center justify-center bg-ink"
      >
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo}
            alt=""
            className="object-contain"
            style={{
              width: brand.size ?? 19,
              height: brand.size ?? 19,
              // rawLogo SVGs are already coloured for the ink badge; everything else is forced
              // to a clean white silhouette so any dark logo file works.
              filter: brand.rawLogo ? undefined : "brightness(0) invert(1)",
            }}
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
      <div className="mx-auto mb-[clamp(14px,2.6vh,22px)] max-w-[1180px] px-[clamp(18px,5vw,40px)]">
        <span className="text-[12px] uppercase tracking-[0.12em] text-ink-3">
          Already running ads through the beta
        </span>
      </div>
      <div className="marquee relative overflow-hidden" style={marqueeStyle}>
        {/* Two identical copies: the track translates exactly one copy width, so the second
            lands flush where the first began and the loop has no seam. The duplicate is
            aria-hidden so a screen reader hears the roster once. */}
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

// Fade-and-rise on reveal, with a delay in ms. The one motion primitive for prose and cards,
// so a beat's supporting copy arrives after the thing it supports instead of with it. CSS
// transitions rather than a rAF clock: no per-element animation frame, and the compositor
// handles both properties.
function Rise({
  on, delay = 0, className = "", children,
}: {
  on: boolean; delay?: number; className?: string; children: React.ReactNode;
}) {
  return (
    <div
      className={className}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : "translateY(9px)",
        transition: `opacity .55s ${delay}ms, transform .55s ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function RegionCard({
  title, tag, body, tone, revealed = true, delay = 0,
}: {
  title: string; tag: string; body: string; tone: "ink" | "accent";
  revealed?: boolean; delay?: number;
}) {
  return (
    <Rise on={revealed} delay={delay} className="h-full">
      {/* Content centred rather than top-aligned. The column is stretched to the figure's
          height beside it, so a card is now taller than the three lines inside it; parked at
          the top, those lines read as a card that failed to finish loading. */}
      <div className="flex h-full flex-col justify-center rounded-2xl border border-line bg-paper p-4">
        <div className="flex items-center gap-2">
          {/* The dot rings out once as the card lands, the same way the region it names
              scales up in the figure beside it. Both are the same gesture at two scales,
              which is what ties the card to the ellipse. */}
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
            <span
              className={`absolute inset-0 rounded-full ${tone === "accent" ? "bg-accent-2" : "bg-ink"}`}
              // Base opacity 0 with no fill-mode, so the ring is invisible through the delay
              // and invisible again after the single pass; the keyframes own the visible part.
              style={{
                opacity: 0,
                animation: revealed ? `somaPing 1.1s ${delay + 120}ms ease-out 1` : "none",
              }}
            />
            <span className={`relative inline-block h-2.5 w-2.5 rounded-full ${tone === "accent" ? "bg-accent-2" : "bg-ink"}`} />
          </span>
          <span className="text-ui font-medium text-ink">{title}</span>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-ink-3">{tag}</div>
        <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-2">{body}</p>
      </div>
    </Rise>
  );
}

function Stat({
  value, suffix, label, sub, tone, active, big, baseline, lg,
}: {
  value: number; suffix: string; label: string; sub: string; tone?: "ink" | "accent" | "pos" | "neg"; active: boolean; big?: boolean; baseline?: number;
  /** The moat beat's three tiles. That section is a heading and one row of numbers, and at the
   *  recording's framing it measured the emptiest frame in the whole take (2.4% ink, a 347px
   *  void below the row). The claim is the largest one on the page and it was also the
   *  quietest thing on screen. `lg` gives the row the weight the argument has. */
  lg?: boolean;
}) {
  // Counts up rather than fading in at full value, which is what every other number on the
  // page does (MetricRow, the studios) — these three were the only headline
  // figures that just appeared, and next to a self-drawing arc that read as a static image
  // dropped into a moving page. Rounded off the eased clock, so the last digit settles.
  // Off its own arrival, not the section's: the hook tile sits ~720px below §02's top edge
  // and the moat tiles ~450px below §09's, so both count-ups used to reach their final
  // figure before the tile was on camera and the number arrived pre-counted.
  const [ref, framed] = useReveal<HTMLDivElement>(ON_SCREEN);
  const on = active && framed;
  const p = useAnimeClock(on, big ? 1200 : 900);
  return (
    <div ref={ref} className={`flex flex-col rounded-2xl border border-line bg-fill ${lg ? "px-6 py-8" : big ? "min-h-[178px] px-5 py-6" : "p-5"}`}>
      <div className="text-[12px] uppercase tracking-[0.1em] text-ink-3">{label}</div>
      <div className={`flex items-baseline gap-1 ${lg ? "mt-5" : "mt-2"}`}>
        <span
          className={`font-medium tabular-nums leading-none text-ink ${lg ? "text-[62px] tracking-[-0.03em]" : big ? "text-[44px]" : "text-[28px]"}`}
        >
          {Math.round(value * p).toLocaleString()}
        </span>
        <span className={`text-ink-3 ${lg ? "text-[22px]" : "text-[16px]"}`}>{suffix}</span>
      </div>
      <div className={`relative mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line ${big && tone ? "" : "hidden"}`}>
        {/* grow via transform: scaleX (compositor-only) rather than animating width, which
            would trigger layout on every frame. transform-origin left so it fills L→R. */}
        <div
          className={`h-full w-full rounded-full ${
            tone === "accent" ? "bg-accent-2"
            : tone === "pos" ? "bg-pos"
            : tone === "neg" ? "bg-neg"
            : "bg-ink"
          }`}
          style={{ transform: on ? `scaleX(${Math.min(100, value) / 100})` : "scaleX(0)", transformOrigin: "left", transition: "transform .9s" }}
        />
        {/* Where the figure started, so a lone bar reads as a move rather than an absolute.
            Drawn in paper over the fill so it reads as a notch cut out of the bar. */}
        {baseline == null ? null : (
          <span aria-hidden className="absolute top-0 h-full w-px bg-paper/80" style={{ left: `${Math.min(100, baseline)}%` }} />
        )}
      </div>
      <div className={`text-ink-3 ${lg ? "mt-4 text-[13.5px]" : big ? "mt-auto pt-3 text-[12.5px]" : "mt-2 text-[12.5px]"}`}>{sub}</div>
    </div>
  );
}
