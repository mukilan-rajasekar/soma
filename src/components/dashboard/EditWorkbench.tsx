"use client";

// EditWorkbench — the demo's §08 beat, turned into something you can click.
//
// WHAT THE DEMO PROMISES (src/components/demo2/EditStudio.tsx): "One instruction goes in.
// Soma comes back with three different ways to carry it out, scores each against the
// model, ranks them, and applies the winner: the filmstrip drops the losing shot and the
// score re-runs 62 → 66 in place. The point of the beat is that an edit stops being a
// matter of taste — it is a measured delta, before it ships."
//
// Everything in that sentence is real here except the instruction box, which is dropped on
// purpose. The demo types a natural-language command; the actual search enumerates a
// bounded space (every single-shot removal, every adjacent pair, every hoist, two head
// trims — tools/edit/ops.py:enumerate_candidates) and ranks it. A prompt field would be a
// control that implies the system takes direction it does not take. The candidate list IS
// the honest version of the same beat, and it is what the founder can actually demo.
//
// THE LAYOUT is the demo's: player left, ranked options right, the delta stated in place.
// Selecting a cut swaps the player source rather than opening anything, so before/after is
// two clicks in the same frame — which is the comparison the whole product is about.
//
// ESTIMATE VS MEASURED IS RENDERED DIFFERENTLY AND THAT IS NOT NEGOTIABLE. An unmeasured
// delta gets the word "estimate" next to it every single time it appears. tools/edit's
// whole design is built around not letting a re-sliced number pass for an encoder run, and
// a UI that flattens the distinction would undo that in one screen.

import { useState } from "react";

import type { EditCut, EditRun } from "@/lib/edit-cuts";

function fmtDuration(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—";
  return `${s.toFixed(1)}s`;
}

function fmtDelta(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const rounded = Math.round(v);
  if (rounded === 0) return "±0";
  return rounded > 0 ? `+${rounded}` : `−${Math.abs(rounded)}`;
}

export default function EditWorkbench({
  run,
  sourceTitle,
  sourceUrl,
  sourcePoster,
  sourceDurationS,
  sourceScore,
}: {
  run: EditRun;
  sourceTitle: string;
  sourceUrl: string | null;
  sourcePoster: string | null;
  sourceDurationS: number;
  sourceScore: number;
}) {
  // null = the original. The original is a first-class option, not an absence of one:
  // "no edit beat every edit we found" is a real and useful outcome.
  const [selected, setSelected] = useState<number | null>(null);

  const cut: EditCut | null =
    selected === null ? null : run.cuts.find((c) => c.position === selected) ?? null;

  const base = run.baseScore ?? sourceScore;
  const playing = cut?.videoUrl ?? sourceUrl;
  const poster = cut?.posterUrl ?? sourcePoster;
  const shownScore = cut?.estScore ?? base;
  const delta = cut ? cut.estDelta : null;

  return (
    <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── the film ─────────────────────────────────────────────────── */}
      <div className="min-w-0">
        <div className="overflow-hidden rounded-2xl border border-line bg-fill">
          {playing ? (
            <video
              // key forces a remount when the source changes: without it the browser keeps
              // the old buffered film and the poster of the new one, which reads as the
              // edit having done nothing.
              key={cut ? `cut-${cut.position}` : "source"}
              src={playing}
              poster={poster ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="block aspect-video w-full bg-ink object-contain"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-fill">
              <span className="text-meta text-ink-3">
                This cut&rsquo;s file is not available.
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="truncate text-ui font-medium text-ink">
              {cut ? cut.label : sourceTitle}
            </div>
            <div className="mt-0.5 text-meta text-ink-3">
              {cut ? (
                <>
                  {fmtDuration(cut.durationS)} · was {fmtDuration(sourceDurationS)} ·{" "}
                  {cut.measured ? "measured" : cut.confidence}
                </>
              ) : (
                <>{fmtDuration(sourceDurationS)} · the film as delivered</>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-baseline gap-3">
            <span className="tabular-nums text-[30px] leading-none text-ink">
              {Math.round(shownScore)}
            </span>
            {cut && delta !== null ? (
              <span className="text-meta text-ink-3">
                <span className="tabular-nums">{fmtDelta(delta)}</span> vs{" "}
                <span className="tabular-nums">{Math.round(base)}</span>
              </span>
            ) : (
              <span className="text-[11px] uppercase tracking-[0.1em] text-ink-3">
                Original
              </span>
            )}
          </div>
        </div>

        {/* THE SCORE ON THIS SCREEN IS NOT THE SCORE ON THE LIBRARY CARD, and saying so
            is the difference between a defensible number and a wrong one. The library
            shows a percentile against the other cuts in the same run ("34, ranked 5 of
            5"). Nothing here has other cuts to be ranked against — an edit is compared to
            the film it came from — so base and candidates are scored within-item, against
            this clip's own timeline, and land on a different number for the same footage.
            Two adjacent screens showing 34 and 55 for one ad is exactly the thing a
            careful viewer catches, so the qualifier is on the surface rather than in a
            footnote. */}
        <p className="mt-3 text-meta text-ink-3">
          Scored <b className="font-medium text-ink-2">within-item</b>{" "}
          — this cut against itself, not against the rest of the run. The number beside it
          in your library is a different measurement.
        </p>

        {cut && !cut.measured ? (
          <p className="mt-4 max-w-[62ch] text-pretty text-meta text-ink-3">
            That number is an <b className="font-medium text-ink-2">estimate</b>. It comes
            from re-slicing the arc of the unedited film, and the encoder&rsquo;s temporal
            window is non-causal — removing a shot changes what its neighbours predict, and
            a re-slice cannot see that. The film beside it is real; the delta is a ranking
            signal until the cut is scored for itself.
          </p>
        ) : null}
      </div>

      {/* ── the candidates ───────────────────────────────────────────── */}
      <div className="min-w-0">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
          {run.cuts.length} rendered {run.cuts.length === 1 ? "cut" : "cuts"}
        </h2>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-pressed={selected === null}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              selected === null
                ? "border-ink bg-fill"
                : "border-line bg-paper hover:border-line-2"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                Original
              </span>
              <span className="mt-0.5 block text-[11.5px] text-ink-3">
                {fmtDuration(sourceDurationS)} · no edit
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-[15px] text-ink-3">
              {Math.round(base)}
            </span>
          </button>

          {run.cuts.map((option) => {
            const on = selected === option.position;
            return (
              <button
                key={option.position}
                type="button"
                onClick={() => setSelected(option.position)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-ink bg-fill" : "border-line bg-paper hover:border-line-2"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                    {fmtDuration(option.durationS)} ·{" "}
                    {option.measured ? "measured" : option.confidence}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block tabular-nums text-[15px] ${
                      on ? "font-semibold text-ink" : "text-ink-3"
                    }`}
                  >
                    {option.estScore === null ? "—" : Math.round(option.estScore)}
                  </span>
                  <span className="mt-0.5 block tabular-nums text-[11px] text-ink-3">
                    {fmtDelta(option.estDelta)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {cut?.videoUrl ? (
          <a
            href={cut.videoUrl}
            download
            className="mt-5 inline-block cursor-pointer rounded-xl border border-line-2 bg-paper px-4 py-[11px] text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            Download this cut
          </a>
        ) : null}
      </div>
    </div>
  );
}
