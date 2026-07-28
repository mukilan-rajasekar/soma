"use client";

// §07 — generate the ad, not just grade it.
//
// The section runs itself off one reveal clock: a brief types in, 24 candidates rise as
// columns, a pass bar drops across them, nineteen fall below it and dim, and the five
// survivors land as cards ranked by their real Soma score. Nobody has to click — a screen
// recording cannot depend on a click landing at the right moment — but the runner-up rows
// ARE clickable, so the winner panel can be swapped live if there is time in the take.
//
// The cull chart is the argument: generation is cheap, the filter is the product. See
// studio.ts for which numbers are measured and which are scripted.

import { useState } from "react";
import ArcPlot from "./ArcPlot";
import { ON_SCREEN, useAnimeClock, useReveal } from "./useReveal";
import { tokenVar } from "./tokens";
import { englishBatch } from "./corpus";
import { BRAND, BRIEF, GENERATED, LATTICE, SURVIVORS, rankedDirections } from "./studio";
import type { Direction } from "./studio";
import type { Ad, Report } from "./types";

// Phase thresholds on the eased 0→1 reveal clock. Booleans rather than per-frame
// interpolation so the stagger can live in CSS transition delays (the idiom the rest of
// demo2 uses) and so reduced-motion — where the clock snaps to 1 — lands everything at
// once with no animation.
const T_SPAWN = 0.03;
const T_SCORE = 0.4;
const T_CULL = 0.66;
// There is no T_BOARD any more, and it could not be fixed by lowering one. The clock is
// easeOutCubic, so it spends its first third of real time covering two thirds of `p` and then
// crawls: the cull lands at ~1.6s of a 5.2s run and p only travels 0.66 → 1.0 over the
// remaining 3.6 seconds. T_BOARD 0.84 therefore fired at ~2.4s, nearly a second of dead air
// after the argument above it had finished, and any value low enough to fix that lands the
// board on top of the cull it is supposed to be the payoff for. The board now runs off its
// own arrival instead (see `boardSeen` below), which is what every other figure on the page
// does and is the only version that does not depend on how fast the page is being scrolled.

// The cull chart. PASS_MARK is where the hairline sits, in the same 0–100 units as a
// candidate's score: above the best rejected candidate (48) and below the weakest
// survivor (52), so the line is what separates them rather than a decoration drawn near
// them. Change LATTICE and this has to move with it — the weakest survivor moved 51 → 52
// when the weights were aligned to the preflight pipeline, which 50 still clears, but the
// next retune may not leave that gap open. The invariant to hold: every `survives: false`
// score strictly below PASS_MARK, every `survives: true` score strictly above it.
// 118 originally. Two reasons it grew. The frame this panel owns measured 485px of subject in
// an 832px camera band, the thinnest composition in the take, and the empty space was all below
// the panel. And at the 640px the recording is actually watched at, a 118px plot of 24 columns
// downscales to 52px: the five survivors crossing the bar were a few pixels of difference. The
// cull is one of the three things this beat has to say, so it gets the height to say it.
const PLOT_H = 296;
const PASS_MARK = 50;

// useAnimeClock is easeOutCubic, which is right for a bar settling into place and wrong
// for a typewriter: off raw `p` a string reaches ~87% of its characters in the first half
// of the run and then crawls. Inverting the ease restores a constant typing rate and
// leaves every other beat on the eased clock.
const linear = (p: number) => 1 - Math.cbrt(Math.max(0, 1 - p));

export default function GenerateStudio({ report, active }: { report: Report; active: boolean }) {
  // The component owns its own reveal rather than running on Section's `revealed` flag.
  // Section fires at 25% of the SECTION — i.e. when the heading enters — and this section
  // is taller than the viewport, so on a continuous scroll the cull would play out above
  // the fold and be finished before the chart is on camera.
  //
  // ON_SCREEN rather than the `threshold: 0.22` this used to pass: a threshold is a fraction
  // of the TARGET's area, so the trigger point moved with the panel's own height (0.22 of
  // this 806px panel is 177px of it showing, 0.22 of the 240px overlay below it is 53px).
  // The bottom root margin fires every gated element at one screen position instead.
  const [ref, seen] = useReveal<HTMLDivElement>(ON_SCREEN);
  const p = useAnimeClock(active && seen, 5200);
  const ranked = rankedDirections(report);
  const [sel, setSel] = useState(0);

  // The board's own gate, and deliberately NOT ON_SCREEN. That preset asks for a fixed 40% of
  // the viewport at minimum, so the board's top had to climb past the middle of the screen
  // before anything started: you watched it arrive from the bottom edge and sit blank for the
  // whole second half of that travel, then fade for another 0.6s. ON_SCREEN exists to stop a
  // long BUILD playing off camera (the 5.2s cull above it is exactly that case). This is a
  // fade and a rise, so there is nothing to miss, and it should start as the board enters.
  // -14% fires when its top crosses 86% of the screen, i.e. as it clears the bottom edge, and
  // the fade then runs while it travels up into frame instead of after it gets there.
  const [boardRef, boardSeen] = useReveal<HTMLDivElement>({ threshold: 0, rootMargin: "0px 0px -14% 0px" });

  const spawned = p > T_SPAWN;
  const scored = p > T_SCORE;
  const culled = p > T_CULL;
  // Gated on `scored`, not on `culled`. Something has to stop a board headed "the five that
  // cleared" from arriving before there is a bar to clear, and `scored` is that: it is the
  // moment the pass mark drops across the chart, at ~816ms of the clock. `culled` was the
  // obvious choice and it was the wrong one — it lands at ~1.57s, which on any brisk scroll is
  // later than the board's own arrival, so the gate that was supposed to be a safety net
  // became the thing holding the board back. The cull still plays out above; it just no longer
  // has to finish before the payoff is allowed on screen.
  const board = boardSeen && scored;

  // Count-up that lands exactly on GENERATED as the lattice finishes filling.
  const counted = Math.round(Math.min(1, p / T_SCORE) * GENERATED);

  // The best of the REAL ads the database beat puts on screen as a wall of frames with their
  // scores under them. It is here because a score out of 100 with nothing to compare it against
  // is not a reading: a reader has no way to know whether 72 is good. The two sets are directly
  // comparable and it matters that the page says so out loud — build_report.py's score_ad() is
  // the one place the weights live, and every ad on this page, generated or scraped, goes
  // through it. So the same reader who notices that the generated spread sits above the real one
  // is noticing the actual claim, not an inconsistency, and the page is better off making that
  // claim than leaving it to be found.
  // Filtered the same way the wall is (corpus.ts), or this sentence would quote a number off an
  // ad that is not on the page — and the top of the unfiltered batch is an English clip anyway,
  // so today the two agree. Deriving it means they cannot stop agreeing.
  const bestReal = englishBatch(report.batch).reduce((m, a) => Math.max(m, a.scores.soma), 0);
  const winner = ranked[sel] ?? ranked[0];
  const hookLead = winner
    ? leadsHookWindow(winner.ad, ranked.map((r) => r.ad), report.hookSeconds)
    : null;

  return (
    <div ref={ref} className="flex flex-col gap-5">
      {/* ── brief + brand kit | the internal test ──────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[296px_1fr]">
        <InputCard p={p} />

        <div className="rounded-2xl border border-line bg-paper p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">The internal test</span>
            <span className="ml-auto text-[12.5px] text-ink-3">
              <span className="tabular-nums text-ink">{counted}</span> generated
              <span className="mx-1.5 text-ink-3">·</span>
              {/* Printed from the start, not held back until the cull fires. This used to
                  render a literal "·" placeholder until p > T_CULL, which is 3.4s into a 5.2s
                  clock — and the recording settles on this beat ~0.7s in, so the camera held on
                  "24 generated · · survive": the beat's entire claim as a missing glyph, next
                  to a second stray dot that read as a rendering fault. The count of survivors is
                  a fact about the run, not something to reveal; the cull ITSELF is the reveal,
                  and it still plays out in the bars below. */}
              <span className="tabular-nums text-ink">{SURVIVORS}</span> survive
            </span>
          </div>

          <div className="mt-3 text-[12px] uppercase tracking-[0.06em] text-ink-3">
            Predicted score, one column per candidate
          </div>

          {/* The cull, as one chart. Each candidate is a column at its predicted score;
              the dashed hairline is the bar it has to clear. Five columns cross it and stay
              ink — and those five are the five cards below, so the eye carries the set from
              the filter straight into the board. Deliberately a chart and not a grid of
              tiles: empty tiles read as a page that has not finished loading. */}
          <div className="relative mt-2" style={{ height: PLOT_H }}>
            {/* the pass bar */}
            <div
              className="absolute inset-x-0 flex items-center"
              style={{
                bottom: (PASS_MARK / 100) * PLOT_H,
                opacity: scored ? 1 : 0,
                transition: "opacity .5s .15s",
              }}
            >
              <span
                className="h-px flex-1"
                style={{ backgroundImage: `repeating-linear-gradient(90deg,${tokenVar("ink3")} 0 5px,transparent 5px 11px)` }}
              />
              {/* Hidden on phones: at 390px the label sits over the last four columns,
                  and a legend that obscures its own chart is worse than no legend. The
                  dashed rule still reads as a threshold on its own. */}
              <span className="ml-2 hidden shrink-0 bg-paper pl-1 text-[12px] uppercase tracking-[0.06em] text-ink-3 sm:inline">
                Pass bar
              </span>
            </div>

            <div className="flex h-full items-end gap-[3px]">
              {LATTICE.map((c, i) => {
                const dead = culled && !c.survives;
                return (
                  // Full-height bar scaled from its base rather than a growing `height`.
                  // Twenty-four staggered height transitions would run layout on every
                  // frame for the whole 1.2s of the cull — on the one page in the product
                  // that exists to be screen-recorded. scaleY is compositor-only, and it is
                  // the same fix the stat bars in DemoScrollPage already use.
                  <span key={i} className="flex-1 self-stretch">
                    <span
                      className={`block h-full w-full rounded-[2px] ${c.survives ? "bg-ink" : "bg-ink-3"}`}
                      style={{
                        transform: `scaleY(${spawned ? c.score / 100 : 0.02})`,
                        transformOrigin: "bottom",
                        opacity: !spawned ? 0 : dead ? 0.3 : 1,
                        transition: `transform .55s cubic-bezier(.2,.7,.3,1) ${i * 28}ms, opacity .5s ${dead ? 0 : i * 28}ms`,
                      }}
                    />
                  </span>
                );
              })}
            </div>
          </div>

          <p className="mt-3.5 max-w-[64ch] text-[13px] leading-[1.55] text-ink-2">
            {culled ? (
              <>
                Nineteen never reach you. Only the cuts that clear the bar are surfaced.
                <span className="text-ink"> Survivors, not output.</span>
              </>
            ) : (
              <>Generating against the brand kit, then scoring every candidate before anyone sees it.</>
            )}
          </p>
        </div>
      </div>

      {/* ── the survivors, ranked by their real measured score ──────────── */}
      <div
        ref={boardRef}
        className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_1fr]"
        style={{ opacity: board ? 1 : 0, transform: board ? "none" : "translateY(8px)", transition: "opacity .6s, transform .6s" }}
      >
        <WinnerCard entry={winner} rank={sel + 1} hookLead={hookLead} hookSeconds={report.hookSeconds} active={board} />
        <div className="flex flex-col gap-1.5">
          <div className="mb-0.5 flex items-baseline justify-between text-[12px] uppercase tracking-[0.07em] text-ink-3">
            <span>The five that cleared</span>
            <span>Soma</span>
          </div>
          {ranked.map((e, i) => (
            <RunnerRow
              key={e.dir.id}
              entry={e}
              i={i}
              on={i === sel}
              active={board}
              onPick={() => setSel(i)}
            />
          ))}
          {/* The closing line and the provenance note, deliberately one paragraph. Stating
              where the numbers come from is what makes the board checkable rather than a
              mock-up, and it is the one sentence in this section that has to stay true.
              This used to end "these are the five cuts §05 compared" — a cross-reference to
              the compare-the-cuts section, which the 60-second cut removed. The provenance
              claim is now made on its own terms instead of pointing at a section that is no
              longer on the page. */}
          <p className="mt-2 px-0.5 text-[12.5px] leading-[1.55] text-ink-3">
            Same brief, five directions. The spread from{" "}
            <span className="tabular-nums text-ink">{ranked[ranked.length - 1]?.ad.scores.soma}</span> to{" "}
            <span className="tabular-nums text-ink">{ranked[0]?.ad.scores.soma}</span> is the difference
            between an ad that works and one that burns the budget, decided before a dollar is spent.
            Same 0-100, same model, as the real ads further down this page: the best of those
            reads <span className="tabular-nums text-ink">{bestReal}</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── the receipt ─────────────────────────────────────────────────────────────
//
// Does `ad` carry the highest ventral (surprise) response of the set at EVERY sample
// inside the hook window? Compared by timestamp rather than by array index, because the
// five cuts have different durations and therefore different lane lengths. Returns the
// number of samples checked when it leads outright, and null otherwise — so the copy that
// depends on it simply disappears if a different candidate is promoted or the report is
// rebuilt with different footage. Nothing here is allowed to assert what it cannot check.
function leadsHookWindow(ad: Ad, all: Ad[], hookSeconds: number): number | null {
  const at = (a: Ad, t: number): number | null => {
    const i = a.timestamps.findIndex((x) => Math.abs(x - t) < 1e-6);
    return i < 0 ? null : a.lanes.ventral[i] ?? null;
  };
  const window = ad.timestamps.filter((t) => t <= hookSeconds);
  if (!window.length) return null;
  const others = all.filter((o) => o.id !== ad.id);
  if (!others.length) return null;
  const leads = window.every((t) => {
    const mine = at(ad, t);
    if (mine === null) return false;
    return others.every((o) => {
      const theirs = at(o, t);
      return theirs === null || theirs < mine;
    });
  });
  return leads ? window.length : null;
}

// ── the input: one brief, one brand kit ─────────────────────────────────────
//
// A single card, not two. The brief and the kit are one input — the sentence and the
// system it gets generated against — and splitting them cost ~70px of height on a section
// that has to fit its chart and its payoff in one frame on camera.
//
// The brief types itself out of the reveal clock rather than a timer of its own, so it
// cannot drift out of step with the chart beside it, and so reduced-motion (clock pinned
// to 1) renders the whole thing instantly. min-h holds three lines of space so the card
// does not grow under the caret and shove the layout down mid-take.
function InputCard({ p }: { p: number }) {
  const u = linear(p);
  const shown = BRIEF.slice(0, Math.round(Math.min(1, u / T_SCORE) * BRIEF.length));
  const typing = p > 0 && u < T_SCORE;
  return (
    <div className="flex flex-col rounded-2xl border border-line-2 bg-paper">
      <div className="p-4">
        <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">The brief</div>
        <p className="mt-2 min-h-[4.7em] text-[14px] leading-[1.55] text-ink">
          {shown}
          {typing ? <span className="ml-px inline-block h-[1.05em] w-px translate-y-[0.15em] bg-ink" /> : null}
        </p>
      </div>
      <BrandCard />
    </div>
  );
}

// ── the brand kit ───────────────────────────────────────────────────────────

function BrandCard() {
  return (
    <div className="rounded-b-2xl border-t border-line bg-fill p-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="rounded-badge flex h-8 w-8 shrink-0 items-center justify-center bg-ink text-[14px] font-semibold leading-none text-white"
        >
          {BRAND.monogram}
        </span>
        <div className="min-w-0">
          <div className="truncate text-ui font-medium text-ink">{BRAND.account}</div>
          <div className="truncate text-[12.5px] text-ink-3">{BRAND.product}</div>
        </div>
      </div>

      <div className="mt-3.5 text-[12px] uppercase tracking-[0.07em] text-ink-3">Brand kit</div>
      <div className="mt-2 flex items-center gap-1.5">
        {/* Rings, not filled discs. These five brand hexes are the loudest colour event in
            §04, and they sit ~340px above the overlay where green/red stops being decoration
            and starts being the encoding. Filled, they teach the eye that colour on this
            section is just brand texture right before the section needs colour to mean rank
            — and the tan (#c08060) is close enough to the red at a 640px downscale to be read
            as related to it. An inset ring keeps every hex identifiable at the same 20px
            while cutting its saturated area by roughly three quarters, so the only filled
            colour left in §04 is the one that carries meaning. */}
        {BRAND.palette.map((s) => (
          <span
            key={s.hex}
            title={s.name}
            aria-label={s.name}
            className="h-5 w-5 rounded-full border border-line"
            style={{ boxShadow: `inset 0 0 0 3px ${s.hex}` }}
          />
        ))}
        <span className="ml-1 truncate text-[12.5px] text-ink-3">{BRAND.typeface}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {BRAND.tone.map((t) => (
          <span key={t} className="rounded-full border border-line bg-paper px-1.5 py-0.5 text-[12px] text-ink-2">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── the promoted candidate ──────────────────────────────────────────────────

function WinnerCard({
  entry, rank, hookLead, hookSeconds, active,
}: {
  entry: { dir: Direction; ad: Ad }; rank: number; hookLead: number | null;
  hookSeconds: number; active: boolean;
}) {
  const { dir, ad } = entry;
  return (
    <div className="rounded-2xl border border-line bg-fill p-4">
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dir.poster}
          alt=""
          className="block h-[118px] w-[96px] shrink-0 rounded-xl border border-line object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
              {rank === 1 ? "Top candidate" : `Candidate ${rank}`}
            </span>
            <span className="ml-auto flex items-baseline gap-1">
              <span className="text-[30px] font-medium leading-none tabular-nums text-ink">{ad.scores.soma}</span>
              <span className="text-[12px] text-ink-3">/100</span>
            </span>
          </div>
          <div className="mt-1.5 text-ui font-medium text-ink">{dir.label}</div>
          <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-2">{dir.move}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniScore label="Hook" v={ad.scores.hook} tone="accent" />
            <MiniScore label="Hold" v={ad.scores.hold} />
            <MiniScore label="Comp." v={ad.scores.comprehension} />
          </div>
        </div>
      </div>

      <div className="mt-3.5 rounded-xl border border-line bg-paper p-3">
        <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">Why the generator chose it</div>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-2">{dir.neural}</p>
        {/* The receipt, and it is a real one — leadsHookWindow checks the measured ventral
            lane sample by sample and this line only renders when the check passes. A
            generator that says "surprise peaks when the object lands" and a measurement
            that agrees at every second of the hook window is the difference between a
            claim and a demonstration. */}
        {hookLead ? (
          <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-[1.5] text-ink-3">
            Highest surprise of the five, at all{" "}
            <span className="tabular-nums text-ink">{hookLead}</span> samples in the hook window.
          </p>
        ) : null}
      </div>

      {/* The candidate's own arc, in the same chart the rest of the page reads scores off.
          It costs no new machinery — ArcPlot computes nothing and plots what it is given —
          and it closes the loop the section opened: the thing the generator produced is
          measured with the thing §01–§03 just explained. */}
      <div className="mt-3">
        <ArcPlot
          dorsal={ad.lanes.dorsal}
          ventral={ad.lanes.ventral}
          timestamps={ad.timestamps}
          duration={ad.duration}
          hookSeconds={hookSeconds}
          animate={active}
          drawMs={1100}
          height={112}
          // The lanes were taught at full size in §02. Repeating the explained legend here put
          // it at half size inside the densest frame in the take, where it was the clearest
          // thing left to cut.
          showLegend={false}
        />
      </div>
    </div>
  );
}

function MiniScore({ label, v, tone }: { label: string; v: number; tone?: "accent" }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-2 py-1.5">
      <div className="text-[12px] uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="mt-0.5 text-[16px] font-medium leading-none tabular-nums text-ink">{v}</div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full w-full rounded-full ${tone === "accent" ? "bg-accent-2" : "bg-ink"}`}
          style={{ transform: `scaleX(${v / 100})`, transformOrigin: "left" }}
        />
      </div>
    </div>
  );
}

// ── the runner-up rows ──────────────────────────────────────────────────────

function RunnerRow({
  entry, i, on, active, onPick,
}: {
  entry: { dir: Direction; ad: Ad }; i: number; on: boolean; active: boolean; onPick: () => void;
}) {
  const { dir, ad } = entry;
  return (
    <button
      onClick={onPick}
      className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors ${
        on ? "border-ink bg-fill" : "border-line hover:border-line-2"
      }`}
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "none" : "translateY(6px)",
        transition: `opacity .45s ${i * 70}ms, transform .45s ${i * 70}ms, border-color .2s`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dir.poster} alt="" className="block h-[38px] w-[31px] shrink-0 rounded-xl border border-line object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{dir.label}</span>
        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-line">
          <span
            className="block h-full w-full rounded-full bg-ink"
            style={{ transform: active ? `scaleX(${ad.scores.soma / 100})` : "scaleX(0)", transformOrigin: "left", transition: `transform .7s ${180 + i * 70}ms` }}
          />
        </span>
      </span>
      <span className={`shrink-0 tabular-nums text-[15px] ${on ? "font-semibold text-ink" : "text-ink-3"}`}>
        {ad.scores.soma}
      </span>
    </button>
  );
}
