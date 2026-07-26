"use client";

// §08 — edit the ad in the platform, in words.
//
// One instruction goes in. Soma comes back with three different ways to carry it out,
// scores each against the model, ranks them, and applies the winner: the filmstrip drops
// the losing shot and the score re-runs 62 → 66 in place. The point of the beat is that
// an edit stops being a matter of taste — it is a measured delta, before it ships.
//
// The splice options carry no numbers of their own. resolveOption() reads them out of the
// leave-one-shot-out pass in report.json, so the "+4" here and the "+4" printed under §06's
// filmstrip are the same number by construction and cannot drift apart. The reorder is the
// one option marked predicted, because removing a shot is measurable and reshuffling one
// is not — and the applied winner is deliberately a measured option, never that one.

import ArcPlot from "./ArcPlot";
import { useAnimeClock, useReveal } from "./useReveal";
import { fmtT, type Ad, type Report } from "./types";
import {
  EDIT_APPLIED, EDIT_COMMAND, EDIT_OPTIONS, MORE_COMMANDS, STATIC_COMMAND, STATIC_FRAME,
  resolveOption, type EditOption,
} from "./studio";

const T_TYPED = 0.34; // instruction finishes typing
const T_OPTS = 0.5;   // candidate edits land
const T_APPLY = 0.74; // the winner is applied — filmstrip drops the shot, score re-runs
const T_MORE = 0.88;  // the second modality strip

const KIND_LABEL: Record<EditOption["kind"], string> = {
  splice: "Splice",
  reorder: "Reorder",
  overlay: "Overlay",
};

// useAnimeClock is easeOutCubic, which is right for an arc settling into place and wrong
// for a typewriter: off raw `p` a string reaches ~87% of its characters in the first half
// of the run and then crawls. Inverting the ease gives back a constant typing rate while
// leaving every other beat on the eased clock.
const linear = (p: number) => 1 - Math.cbrt(Math.max(0, 1 - p));

export default function EditStudio({ report, active }: { report: Report; active: boolean }) {
  // The component owns its own reveal rather than running on Section's `revealed` flag.
  // Section fires at 25% of the SECTION — i.e. when the heading enters — and this section
  // is taller than the viewport, so on a continuous scroll the whole beat would play out
  // above the fold and be over by the time the panel is on camera.
  const [ref, seen] = useReveal<HTMLDivElement>({ threshold: 0.22 });
  const p = useAnimeClock(active && seen, 5400);

  const diag = report.campaign.shots;
  const source = report.campaign.variants.find((v) => v.id === diag.adId);

  const typed = EDIT_COMMAND.slice(0, Math.round(Math.min(1, linear(p) / T_TYPED) * EDIT_COMMAND.length));
  const typing = p > 0 && linear(p) < T_TYPED;
  const opts = p > T_OPTS;
  const applied = p > T_APPLY;
  const more = p > T_MORE;

  const winner = resolveOption(EDIT_APPLIED, diag);
  const maxDelta = Math.max(...EDIT_OPTIONS.map((o) => resolveOption(o, diag).delta), 1);

  // The score re-runs in place: base → the applied option's measured score.
  const u = Math.max(0, Math.min(1, (p - T_APPLY) / (1 - T_APPLY)));
  const score = Math.round(diag.base + (winner.score - diag.base) * u);
  const cutIndex = EDIT_APPLIED.shotIndex ?? -1;
  const cut = diag.shots[cutIndex];
  const rows = source && cut ? timelineRows(source, diag.shots.length, cut.start, cut.end) : [];
  const after = source && cut ? spliceLane(source, cut.start, cut.end) : { dorsal: [], timestamps: [], duration: 0 };

  return (
    <div ref={ref} className="flex flex-col gap-5">
      {/* ── the instruction ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line-2 bg-paper p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[12px] uppercase tracking-[0.1em] text-ink-3">Ask for the edit</span>
          <span className="ml-auto text-[12.5px] text-ink-3">
            {applied ? (
              <>Applied · 0 frames re-rendered</>
            ) : opts ? (
              <>All {diag.shots.length} shots scored · top 3 ways ranked</>
            ) : (
              <>Reading the cut…</>
            )}
          </span>
        </div>
        <p className="mt-2 text-[16px] leading-[1.45] text-ink">
          {typed}
          {typing ? <span className="ml-px inline-block h-[1.05em] w-px translate-y-[0.15em] bg-ink" /> : null}
        </p>
      </div>

      {/* ── the three candidate edits ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {EDIT_OPTIONS.map((o, i) => {
          const r = resolveOption(o, diag);
          const won = applied && o === EDIT_APPLIED;
          return (
            <div
              key={o.label}
              className={`flex flex-col rounded-2xl border p-3.5 transition-colors ${
                won ? "border-ink bg-fill" : "border-line bg-paper"
              }`}
              style={{
                opacity: opts ? (applied && !won ? 0.45 : 1) : 0,
                transform: opts ? "none" : "translateY(8px)",
                transition: `opacity .45s ${i * 90}ms, transform .45s ${i * 90}ms, border-color .35s`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
                  {KIND_LABEL[o.kind]}
                </span>
                {won ? (
                  <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em] text-white">
                    Applied
                  </span>
                ) : null}
                <span className="ml-auto flex items-baseline gap-1">
                  <span className="text-[20px] font-medium leading-none tabular-nums text-ink">{r.score}</span>
                  <span className={`text-[13px] tabular-nums ${r.delta > 0 ? "text-ink-2" : "text-ink-3"}`}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </span>
                </span>
              </div>
              <div className="mt-2 text-[13.5px] font-medium leading-[1.35] text-ink">{o.label}</div>
              <p className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-2">{o.detail}</p>
              {/* The bar encodes the DELTA, not the score. Scaled to score/100 the three
                  options read 66/65/64 — three near-identical bars — and the ranking, which
                  is the whole point of the row, becomes invisible. */}
              <div className="mt-auto flex items-center gap-2 pt-2.5">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full w-full rounded-full bg-ink"
                    style={{
                      transform: opts ? `scaleX(${r.delta / maxDelta})` : "scaleX(0)",
                      transformOrigin: "left",
                      transition: `transform .7s ${200 + i * 90}ms`,
                    }}
                  />
                </span>
                {/* Never symmetrised. The asymmetry between a measured option and a
                    predicted one is the honest part of this row — do not tidy it away. */}
                <span className="text-[11px] uppercase tracking-[0.07em] text-ink-3">
                  {r.measured ? "measured" : "predicted"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── the cut itself, re-scored in place ──────────────────────────── */}
      <div className="rounded-2xl border border-line bg-fill p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[188px_1fr]">
          <div>
            <div className="text-[12px] uppercase tracking-[0.1em] text-ink-3">Soma score</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[40px] font-medium leading-none tabular-nums text-ink">{score}</span>
              <span
                className="text-[15px] font-medium tabular-nums text-ink-2"
                style={{ opacity: applied ? 1 : 0, transition: "opacity .5s" }}
              >
                +{winner.score - diag.base}
              </span>
              <span
                className="text-[13px] text-ink-3 line-through"
                style={{ opacity: applied ? 1 : 0, transition: "opacity .5s" }}
              >
                {diag.base}
              </span>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-[1.5] text-ink-3">
              {applied && cut ? (
                <>
                  The <span className="tabular-nums text-ink">{fmtT(cut.start)}–{fmtT(cut.end)}</span> beat
                  is gone and the shots either side close the gap.
                </>
              ) : (
                <>{diag.shots.length} shots, each already scored for what it costs or earns the ad.</>
              )}
            </p>
          </div>

          {/* The arc, re-spliced. Plotted against the ORIGINAL span with the old curve
              behind it as a ghost, so the new curve visibly stops short of the right edge —
              the ad is shorter now, and that is the picture. Attention only: the ventral
              lane and the hook band would be three ideas in a chart that is making one. */}
          {source && cut ? (
            <div>
              <ArcPlot
                dorsal={after.dorsal}
                timestamps={after.timestamps}
                duration={source.duration}
                progress={applied ? 1 : 0}
                showVentral={false}
                showHook={false}
                height={118}
                ghost={applied ? { dorsal: source.lanes.dorsal, timestamps: source.timestamps } : null}
                endMarker={applied ? after.duration : null}
                labelDorsal="Attention"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-[2px] w-4 bg-ink" /> After the splice
                </span>
                {/* dashed, because the ghost curve is dashed — a legend swatch that does
                    not match its curve is worse than no legend */}
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t border-dashed border-ink-3/60" /> Before
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* filmstrip — the removed shot physically collapses out of the timeline */}
        <div className="mt-3.5 flex items-start overflow-hidden">
          {diag.shots.map((s, i) => {
            const gone = applied && i === cutIndex;
            const drag = s.delta > 0;
            return (
              // This one animates layout on purpose, and it is the exception rather than the
              // pattern — the cull bars in GenerateStudio use transform for the same reason
              // this cannot. The beat IS the reflow: the spliced shot has to leave the
              // timeline and the ten that remain have to close over the gap. No
              // transform-only version of that exists; scaling the removed item to zero
              // leaves its space behind, which is the opposite of the point. Cost is bounded
              // — one 0.6s transition over eleven small elements, fired once per page load.
              <div
                key={i}
                className="min-w-0"
                style={{
                  flex: gone ? "0 0 0%" : "1 1 0%",
                  marginRight: gone ? 0 : 6,
                  opacity: gone ? 0 : 1,
                  transition: "flex .6s cubic-bezier(.4,0,.2,1), margin-right .6s cubic-bezier(.4,0,.2,1), opacity .35s",
                }}
              >
                <div className={`overflow-hidden rounded-md border ${gone ? "border-error/60" : "border-line"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={diag.thumbs?.[i] ?? ""} alt="" className="block h-[68px] w-full object-cover" />
                  <div
                    className="h-[3px]"
                    style={{ background: drag ? "rgba(180,35,24,.55)" : "rgba(10,10,10,.35)" }}
                  />
                </div>
                <div className="mt-1 truncate text-center text-[10.5px] tabular-nums text-ink-3">{fmtT(s.start)}</div>
              </div>
            );
          })}
        </div>

        {/* What the edit did to the timeline, kept below a hairline and away from the big
            number — these four are arithmetic on real fields (duration, weakSpots, shot
            count, brand mentions), not another prediction, and they are what makes the
            edit read as physical rather than as a score going up. */}
        {rows.length ? (
          <div
            className="mt-4 flex flex-wrap gap-x-7 gap-y-2 border-t border-line pt-3"
            style={{ opacity: applied ? 1 : 0, transition: "opacity .5s .2s" }}
          >
            {rows.map((r) => (
              <div key={r.label}>
                <div className="text-[10.5px] uppercase tracking-[0.09em] text-ink-3">{r.label}</div>
                <div className="mt-0.5 text-[13px] tabular-nums text-ink-2">
                  <span className="line-through">{r.before}</span>
                  <span className="mx-1.5 text-ink-3">→</span>
                  <span className="font-medium text-ink">{r.after}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── the same box, the other modality ────────────────────────────── */}
      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]"
        style={{ opacity: more ? 1 : 0, transform: more ? "none" : "translateY(8px)", transition: "opacity .55s, transform .55s" }}
      >
        <div className="flex gap-3 rounded-2xl border border-line bg-paper p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={STATIC_FRAME} alt="" className="block h-[70px] w-[57px] shrink-0 rounded-lg border border-line object-cover" />
          {/* "from this campaign" and not a filename or a 1080×1350 spec: the still is a
              frame lifted out of this campaign's footage, and implying a separately
              uploaded JPG is a claim a reader can disprove with one right-click. */}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.1em] text-ink-3">Static, from this campaign</div>
            <p className="mt-1 text-[12.5px] leading-[1.45] text-ink-2">{STATIC_COMMAND}</p>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-2">
          {MORE_COMMANDS.map((c) => (
            <div key={c.text} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="text-[13.5px] text-ink">&ldquo;{c.text}&rdquo;</span>
              <span className="text-[12.5px] text-ink-3">{c.result}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── the spliced lane ────────────────────────────────────────────────────────
//
// Drop every sample inside [cutStart, cutEnd) and shift what follows left by the length of
// the removed beat — the arc of the ad that now exists. This is not a re-measurement and
// must never be described as one: it is the same operation build_report.py performs to
// produce the leave-one-shot-out score the card is showing, applied to the lane so the
// picture and the number come from one place.
function spliceLane(ad: Ad, cutStart: number, cutEnd: number) {
  const len = cutEnd - cutStart;
  const dorsal: number[] = [];
  const timestamps: number[] = [];
  ad.timestamps.forEach((t, i) => {
    if (t >= cutStart && t < cutEnd) return;
    timestamps.push(t < cutStart ? t : t - len);
    dorsal.push(ad.lanes.dorsal[i]);
  });
  return { dorsal, timestamps, duration: ad.duration - len };
}

// ── what the splice did to the timeline ─────────────────────────────────────
//
// Every row is arithmetic over report.json — runtime from the ad's duration, dead air
// from its weak spots, shots from the diagnosis, brand mentions from the transcript pass.
// Nothing here is typed in by hand, which is why "brand named" holding at 5× is worth
// showing: it is the row that proves the cut took nothing load-bearing with it.
function timelineRows(ad: Ad, shots: number, cutStart: number, cutEnd: number) {
  const len = cutEnd - cutStart;
  const overlap = (a: number, b: number) => Math.max(0, Math.min(b, cutEnd) - Math.max(a, cutStart));
  const dead = ad.weakSpots.reduce((s, w) => s + (w.end - w.start), 0);
  const deadAfter = ad.weakSpots.reduce((s, w) => s + (w.end - w.start) - overlap(w.start, w.end), 0);
  const brandAfter = ad.brandMentions.filter((m) => m.t < cutStart || m.t >= cutEnd).length;
  return [
    { label: "Runtime", before: fmtT(ad.duration), after: fmtT(ad.duration - len) },
    { label: "Dead air", before: `${dead.toFixed(1)}s`, after: `${deadAfter.toFixed(1)}s` },
    { label: "Shots", before: `${shots}`, after: `${shots - 1}` },
    { label: "Brand named", before: `${ad.brandMentions.length}×`, after: `${brandAfter}×` },
  ];
}
