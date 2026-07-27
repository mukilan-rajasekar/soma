// Which of report.json's batch ads have a frame worth showing.
//
// The batch is ten real clips scraped off TikTok Creative Center, and half of them carry
// foreign-language captions: Arabic, Portuguese, Indonesian, Spanish. On the database beat
// they are shown as a wall of stills, and half that wall was foreign captions — which for a US
// product, in a pitch recording, reads as a screenshot of somebody else's corpus.
//
// AN ALLOW-LIST, NOT A DETECTOR, and the call was made by looking. Every heuristic available
// is wrong on this data: tt_33 has NO speech at all and is fine; tt_607's speech transcribes
// as English lyrics with a Chinese fragment while its captions are mostly Spanish; tt_264 and
// tt_128 carry no on-screen text whatsoever and differ only in what they say out loud. Three
// frames per clip were cut across the runtime and read; the survivors and their timestamps are
// below, and the frames themselves are the stills in public/demo/corpus.
//
// This can be deleted the moment there are more scored ads to draw from. It exists because
// the batch is exactly ten: the other arcs on disk (data/ads/arcs) are meta_* clips carrying
// two scalar series, t_sec/global_mag/roi_mag, with no dorsal, ventral or language lane and
// no roi_profile, so they cannot be scored the way build_report.py scores these without the
// GPU extraction being re-run. Filtering was the only lever available.

import type { Ad } from "./types";

/**
 * Batch ads with a frame that reads as English, in report order.
 *
 * THE TEST IS THE FRAME, because the frame is all this renders. The wall is stills with scores
 * under them and no transcript, no caption and no claim about language, so what disqualifies a
 * clip is foreign text burned into the picture. Three clips fail that in EVERY frame; the
 * others have at least one second that carries none. Each entry below names the second its
 * still is cut at (see public/demo/corpus) and what is in it.
 *
 * Two of these seven speak a language other than English and are in anyway, which is a call
 * worth being explicit about: tt_128 and tt_607 are audio-only foreign, nothing on this page
 * plays their audio or quotes them, and every number beside them is the model's real output.
 * If a transcript is ever shown next to this wall, that changes and they come out — which is
 * exactly why the comprehension panel picks its ad separately (DemoScrollPage, compAd) rather
 * than taking the head of this list.
 */
const ENGLISH = new Set([
  "tt_313", // 10.2s  creator holding a white cap, no caption. English speech.
  "tt_449", //  8.8s  "UK weather almost spoiled My skin but we moveee". English speech.
  "tt_264", //  6.3s  woman on the sofa, no caption. English speech.
  "tt_607", //  9.4s  "Frozen yogurth + macarons". Spanish captions elsewhere in the clip.
  "tt_401", // 11.2s  CASPARA flat-lay, brand names only. English speech.
  "tt_33",  // 63.2s  socket set in the tool chest, no caption. No speech at all.
  "tt_128", //  3.6s  full-length dress by the window, no caption anywhere. Arabic speech.
]);

// Left out, and why: foreign text is burned into every frame of these three, so there is no
// still to cut. Kept as a comment rather than a second Set because nothing reads it — it is
// here so the exclusions are auditable without re-watching the clips.
//   tt_131  Arabic caption (التوليب) held through the whole clip
//   tt_471  Indonesian caption ("Pantesan Aisyah Aqilah pake ini terus…") held throughout
//   tt_307  Portuguese caption ("formas mais práticas") plus TikTok watermarks over everything

/**
 * The batch, in its existing order, with the non-English clips dropped.
 *
 * Order is preserved rather than re-sorted: report.json already sorts the batch by score, and
 * the wall's whole point is that it is not a ranking. Falls back to the full batch if the
 * filter empties it, so a rebuilt report that renames every ad degrades to showing everything
 * rather than to showing nothing.
 */
export function englishBatch(batch: Ad[]): Ad[] {
  const kept = batch.filter((a) => ENGLISH.has(a.id));
  return kept.length ? kept : batch;
}
