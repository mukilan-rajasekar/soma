"use client";

// The database beat's evidence: ten real ads out of the corpus, each with the score the model
// gave it, as a single dense band.
//
// It exists because the beat was three numbers and nothing else. Framed for the walkthrough it
// measured the emptiest shot on the page — the heading, one row of tiles, and then ~310px of
// blank paper before the closing section began, about a third of the screen holding the biggest
// claim the page makes. Adding a fourth statistic would have made it four numbers; the claim is
// about ADS, so the thing that belongs under it is ads.
//
// They are frames from the ten clips in public/ad-videos, pulled from report.json's batch with
// the scores that report already carries, so nothing here is styled to look like data it is not:
// no invented thumbnails, no filler tiles to make the row come out even. If the batch changes
// size the row changes with it.
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
  return (
    <div ref={ref} className="mt-8">
      <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-10">
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
            {/* Plain img, like every other frame on this page: these are ten fixed 300px-wide
                stills served from public/, so next/image would add a loader round trip to
                deliver the same bytes. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.video.replace("/ad-videos/", "/demo/corpus/").replace(/\.mp4$/, ".jpg")}
              alt=""
              loading="lazy"
              className="block aspect-[9/16] w-full rounded-xl border border-line object-cover"
            />
            {/* The score and nothing else. A "soma" label on each tile was the word printed ten
                times in a row, which reads as texture rather than as ten separate readings; the
                line under the band says what the number is once. */}
            <figcaption className="mt-2 text-center text-[13px] font-medium tabular-nums leading-none text-ink">
              {a.scores.soma}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="mt-4 text-[13px] leading-[1.6] text-ink-2">
        Ten of them, as they came in, under the Soma score each one came back with. Nothing here
        was made for this page.
      </div>
    </div>
  );
}
