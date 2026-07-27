"use client";

// The database beat's evidence: real ads out of the corpus, each with the score the model gave
// it, as a single band.
//
// It exists because the beat was three numbers and nothing else. Framed for the walkthrough it
// measured the emptiest shot on the page — the heading, one row of tiles, and then ~310px of
// blank paper before the closing section began, about a third of the screen holding the biggest
// claim the page makes. Adding a fourth statistic would have made it four numbers; the claim is
// about ADS, so the thing that belongs under it is ads.
//
// They are frames from the clips in public/ad-videos, pulled from report.json's batch with the
// scores that report already carries, so nothing here is styled to look like data it is not: no
// invented thumbnails, no filler tiles to make the row come out even. If the batch changes size
// the row changes with it — which it now does, because the caller passes the English half of
// the batch (see corpus.ts) and five of the ten scraped clips are not in English.
//
// THE TILE SIZE IS DERIVED FROM THE COUNT, not fixed. At ten the band was ten narrow slivers
// and read as texture, which was the right answer for ten; at five the same grid would have
// left half the row empty and the wall would have read as a row that failed to load. Column
// count follows the data so the band keeps its width whatever survives the filter.
//
// Deliberately NOT another ranked list. §05's board is five generated cuts being sorted, and
// repeating that form here would read as the same figure twice. This is a wall: no bars, no rank
// numbers, no ordering cues beyond the order the data already has. What it says is "all of these
// have been read", which is the sentence the section heading is making.

import { ON_SCREEN, useReveal } from "./useReveal";
import type { Ad } from "./types";

export default function CorpusWall({ batch, active }: { batch: Ad[]; active: boolean }) {
  // Its own arrival, not the section's: it sits ~430px below the section's top edge, so on the
  // section's gate the band would stagger itself in while still below the fold and arrive
  // already finished.
  const [ref, framed] = useReveal<HTMLDivElement>(ON_SCREEN);
  const on = active && framed;
  const scores = batch.map((a) => a.scores.soma);
  const hi = Math.max(...scores);
  const lo = Math.min(...scores);
  const cols = Math.min(batch.length, 5);
  return (
    // Band and caption side by side, which is what losing five tiles paid for. Full width, five
    // 9:16 tiles come out 226px across and 400px tall, taller than the three statistic cards
    // above them and the heaviest object in the beat by a distance; the caption then sat under
    // them in a 74ch column with 400px of empty paper to its right. Beside each other, the tiles
    // land at ~170px (a 300px still, so still no upscaling), the band is ~300px tall instead of
    // 400, and the row has no hole in it. One column below the md breakpoint, where there is no
    // room for two.
    <div ref={ref} className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px] md:items-end">
      {/* Explicit template rather than a `grid-cols-${n}` class: Tailwind compiles the classes
          it can see in the source, so an interpolated one produces no CSS at all and the grid
          silently collapses to one column. Capped at five across at every width, which is what
          the ten-tile version already did on narrow screens, so the tile keeps one size and a
          longer batch wraps into a second row instead of shrinking into slivers. */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {batch.map((a, i) => (
          <figure
            key={a.id}
            style={{
              opacity: on ? 1 : 0,
              transform: on ? "none" : "translateY(10px)",
              // Left to right, 55ms apart: the band assembles in the reading direction rather
              // than appearing at once, which at ten tiles is the difference between a figure
              // arriving and a block of images flashing on.
              transition: `opacity .5s ${i * 55}ms, transform .5s ${i * 55}ms`,
            }}
          >
            {/* Plain img, like every other frame on this page: fixed 300px-wide stills served
                from public/, so next/image would add a loader round trip to deliver the same
                bytes. Five across a 1180px row renders them at ~226px, inside their native
                width, so nothing here is being upscaled. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.video.replace("/ad-videos/", "/demo/corpus/").replace(/\.mp4$/, ".jpg")}
              alt=""
              loading="lazy"
              className="block aspect-[9/16] w-full rounded-xl border border-line object-cover"
            />
            {/* The score and nothing else. A "soma" label on each tile was the word repeated
                down the row, which reads as texture rather than as separate readings; the line
                under the band says what the number is once. */}
            <figcaption className="mt-2 text-center text-[13px] font-medium tabular-nums leading-none text-ink">
              {a.scores.soma}
            </figcaption>
          </figure>
        ))}
      </div>
      {/* The range, stated. A row of bare numbers is a texture; the same row with its span
          named is a distribution, and it is the only thing on the page that gives the generated
          scores upstream anything to be measured against. It also closes a gap a careful reader
          will find on their own: these run lower than the five generated cuts, and unexplained
          that reads as two grids on two different scales. They are on ONE scale —
          build_report.py's score_ad() is the single place the weights live and every ad here
          goes through it — so the honest move is to say so and let the comparison be the claim.
          The count and both bounds come off the batch rather than being typed, so a rebuilt
          report (or a change to which clips are in English) cannot leave this sentence
          describing a row that is no longer on screen. */}
      <div
        className="text-[13px] leading-[1.6] text-ink-2"
        style={{ opacity: on ? 1 : 0, transition: `opacity .6s ${batch.length * 55 + 260}ms` }}
      >
        <span className="tabular-nums text-ink">{batch.length}</span> of them, as they came in,
        under the Soma score each one came back with. They run{" "}
        <span className="tabular-nums text-ink">{hi}</span> down to{" "}
        <span className="tabular-nums text-ink">{lo}</span> on the same 0-100 the generated cuts
        were scored on, by the same model. Nothing here was made for this page.
      </div>
    </div>
  );
}
