// Which of report.json's batch ads are in English.
//
// The batch is ten real clips scraped off TikTok Creative Center, and five of them are not in
// English: two Arabic, two Portuguese, one carrying a Spanish caption. On the database beat
// they are shown as a wall of stills with their scores under them, and half that wall was
// foreign-language captions — which for a US product, in a pitch recording, reads as a
// screenshot of somebody else's corpus rather than as the company's own data.
//
// AN ALLOW-LIST, NOT A DETECTOR. Every candidate heuristic here is wrong on this data:
//   - transcript language: tt_33 has NO speech at all (its message is entirely on screen) and
//     is perfectly good English; tt_607's speech transcribes as English song lyrics with a
//     Chinese fragment in the middle while its on-screen caption is Spanish.
//   - on-screen text: tt_264 and tt_128 carry no text at all, and they differ — tt_264 speaks
//     English, tt_128 speaks Arabic.
// So an ad is in only if BOTH what it says and what it shows are English, and the call was
// made by reading all ten. The evidence is written down beside each exclusion so the next
// person does not have to watch them again.
//
// This can be deleted the moment there are more scored ads to draw from. It exists because
// the batch is exactly ten: the other arcs on disk (data/ads/arcs) are meta_* clips carrying
// two scalar series, t_sec/global_mag/roi_mag, with no dorsal, ventral or language lane and
// no roi_profile, so they cannot be scored the way build_report.py scores these without the
// GPU extraction being re-run. Filtering was the only lever available.

import type { Ad } from "./types";

/** Batch ads whose speech AND on-screen text are both English. */
const ENGLISH = new Set([
  "tt_313", // "Japanese style hat versus an American style hat…", no caption
  "tt_449", // "UK weather almost spoiled My skin but we moveee"
  "tt_264", // "If you love", no caption
  "tt_401", // "…the world through rose-coloured glasses", CASPARA product card
  "tt_33",  // no speech at all; on screen, "Anniversary Sale NOW $45.99"
]);

// Left out, and why. Kept as a comment rather than a second Set because nothing reads it —
// it is here so the exclusions are auditable without re-watching ten clips:
//   tt_131  Arabic caption (التوليب), Arabic speech
//   tt_607  Spanish caption ("Cuando no quieres elegir entre un macaron y un helado")
//   tt_128  no caption, Arabic speech
//   tt_471  Indonesian caption ("Pantesan Aisyah Aqilah pake ini terus…"), Portuguese speech
//   tt_307  Portuguese caption ("formas mais práticas"), Portuguese speech

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
