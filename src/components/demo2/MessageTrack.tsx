"use client";

// What was actually said, and when — the words behind the comprehension score.
//
// ComprehensionPanel pins brand *mentions* on two channel timelines. It never shows the
// speech itself, so a reader sees that "whey" was said at 0:04 without ever seeing the
// sentence it sat in. This renders the transcript proper, each line anchored to the
// stretch of clip it occupies, from faster-whisper via tools/demo/media_text.py.
//
// ON-SCREEN TEXT IS A COVERAGE FIGURE, NOT A QUOTE. The OCR pass returns strings mangled
// often enough to be unpublishable on this page — "Mesh 5 Pan81", "weat,her" — while the
// fact that type was on screen at a given second survives the mangling intact. So we
// publish presence and say that is what it is. Brand mentions are the exception, and only
// because find_brand matches known terms, which is robust to the noise.
//
// The silent case is not an edge case to guard — it is the most interesting ad in the
// batch. tt_33 has no voiceover at all and carries its message entirely on screen, which
// is exactly the kind of thing a language-load lane should be able to see.

import { fmtT, type Ad } from "./types";

export default function MessageTrack({ ad, active }: { ad: Ad; active: boolean }) {
  const dur = ad.duration || 1;
  const lines = ad.transcript ?? [];
  const cov = ad.screenCoverage;
  const silent = lines.length === 0;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_240px]">
      <div className="rounded-2xl border border-line bg-paper p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-[12px] uppercase tracking-[0.08em] text-ink-3">
            Spoken · speech recognition
          </span>
          <span className="text-[12px] tabular-nums text-ink-3">
            {silent ? "no speech detected" : `${lines.length} lines`}
          </span>
        </div>

        {silent ? (
          <p className="max-w-[58ch] text-body text-pretty text-ink-2">
            No voiceover anywhere in this cut. Whatever this ad says, it says on screen —
            and the language lane still has something to read, which is the point of
            measuring the cortex rather than the audio track.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {lines.map((l, i) => {
              const left = Math.max(0, Math.min(100, (l.t / dur) * 100));
              const width = Math.max(1.5, Math.min(100 - left, ((l.end - l.t) / dur) * 100));
              return (
                <li
                  key={`${l.t}-${i}`}
                  style={{
                    opacity: active ? 1 : 0,
                    transform: active ? "none" : "translateY(4px)",
                    transition: `opacity .45s ${i * 70}ms, transform .45s ${i * 70}ms`,
                  }}
                >
                  {/* the stretch of clip this line occupies */}
                  <div className="relative h-[3px] w-full rounded-full bg-fill">
                    <div
                      className="absolute inset-y-0 rounded-full bg-accent-2"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex gap-3">
                    <span className="w-[52px] shrink-0 pt-[2px] text-[12px] tabular-nums text-ink-3">
                      {fmtT(l.t)}
                    </span>
                    <p lang="und" className="max-w-[54ch] text-[14px] leading-[1.55] text-pretty text-ink-2">
                      {l.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-line bg-fill p-4">
          <div className="text-[12px] uppercase tracking-[0.1em] text-ink-3">On-screen type</div>
          {cov == null ? (
            <p className="mt-2 text-[13px] leading-[1.55] text-ink-2">Not measured for this clip.</p>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[42px] font-medium tabular-nums leading-none text-ink">
                  {Math.round(cov * 100)}
                </span>
                <span className="text-[14px] text-ink-3">%</span>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent-2"
                  style={{ transform: `scaleX(${active ? cov : 0})`, transformOrigin: "left", transition: "transform .8s" }}
                />
              </div>
              <p className="mt-2.5 text-[12px] leading-[1.5] text-ink-3">
                of the clip&rsquo;s seconds carry type
              </p>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-paper p-4 text-[13px] leading-[1.55] text-ink-2">
          Speech is transcribed verbatim. On-screen type is reported as coverage rather
          than quoted &mdash; recognition on small, moving social type is unreliable enough
          that the strings would misrepresent the ad, while presence does not.
        </div>
      </div>
    </div>
  );
}
