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
  // Seven across, or fewer if the batch is. Was five, when five was all that survived the
  // language filter; seven tiles at 1180px still land at ~160px, inside the 300px stills'
  // native width, so nothing upscales.
  const cols = Math.min(batch.length, 7);
  return (
    // Full width again. It briefly sat in a two-column row with the caption beside it, because
    // five 9:16 tiles across 1180px came out 400px tall — heavier than the three statistic cards
    // above them. Seven tiles solve that on their own: ~160px each, a ~285px band, and with the
    // caption gone there is no second column for the row to hold.
    <div ref={ref} className="mt-8">
      {/* Explicit template rather than a `grid-cols-${n}` class: Tailwind compiles the classes
          it can see in the source, so an interpolated one produces no CSS at all and the grid
          silently collapses to one column. One row at every width: the tile keeps a single size
          and a longer batch wraps rather than shrinking into slivers. */}
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
                down the row, which reads as texture rather than as separate readings.
                15px semibold, up from 13px medium: with the caption gone these seven numbers
                are the only text in the beat's whole lower half and the entire evidence for
                the heading above them, and `leading-none` under a 160px tile gives them no
                surrounding type to be read in the context of. */}
            <figcaption className="mt-2 text-center text-[15px] font-semibold tabular-nums leading-none text-ink">
              {a.scores.soma}
            </figcaption>
          </figure>
        ))}
      </div>
      {/* The caption is gone on purpose. It named the count and the range and said the scores
          were on the same scale as the generated cuts — all true, and all of it either said out
          loud by the founder over this frame or already made in print two beats earlier, where
          the score that needs the comparison actually is (GenerateStudio's closing line, which
          still derives its reference number from this same list). What is left is the thing the
          heading asks for: ads, and what the model said about each one. */}
    </div>
  );
}
