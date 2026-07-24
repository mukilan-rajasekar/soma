"use client";

// Section 3 — the comprehension layer. If the product/brand is named in the ad — on
// screen (text recognition) or out loud (speech recognition) — and the language cortex
// confirms the words register, the score rises. This shows the two channels on a
// timeline: each mention as a pin (filled = spoken, ringed = on screen), the language-
// load arc behind them, and the comprehension number that results. Real detections from
// tools/demo/media_text.py (macOS Vision OCR + faster-whisper).

import { useAnimeClock } from "./useReveal";
import { fmtT, type Ad } from "./types";

export default function ComprehensionPanel({ ad, active }: { ad: Ad; active: boolean }) {
  const p = useAnimeClock(active, 1200);
  const dur = ad.duration;
  const spoken = ad.brandMentions.filter((m) => m.source === "speech");
  const screen = ad.brandMentions.filter((m) => m.source === "screen");

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px]">
      <div>
        {/* two-channel timeline */}
        <div className="rounded-2xl border border-line bg-paper p-4">
          {[
            { label: "On screen", sub: "text recognition", items: screen, ring: true },
            { label: "Spoken", sub: "speech recognition", items: spoken, ring: false },
          ].map((row) => (
            <div key={row.label} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-baseline gap-2 text-[10px] uppercase tracking-[0.1em] text-ink-3">
                <span className="text-ink-2">{row.label}</span>
                <span>· {row.sub}</span>
              </div>
              <div className="relative h-8 rounded-lg bg-fill">
                <div className="absolute inset-y-0 left-0 border-l border-line" />
                {row.items.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${Math.min(97, (m.t / dur) * 100)}%`, opacity: active ? 1 : 0, transition: `opacity .4s ${i * 120}ms` }}
                  >
                    <span className={`block h-2.5 w-2.5 rounded-full ${row.ring ? "border-2 border-accent bg-paper" : "bg-ink"}`} />
                    <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[9.5px] tabular-nums text-ink-3">
                      {m.text} · {fmtT(m.t)}
                    </span>
                  </div>
                ))}
                {row.items.length === 0 && (
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-3">not detected</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 max-w-[60ch] text-[13px] leading-[1.55] text-ink-2">{ad.reads.comprehension}</p>
      </div>

      {/* the lift it produces */}
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-line bg-fill p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">Comprehension</div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-[42px] font-medium tabular-nums leading-none text-ink">{Math.round(ad.scores.comprehension * p)}</span>
            <span className="text-[14px] text-ink-3">/100</span>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent-2" style={{ width: `${ad.scores.comprehension * p}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-4 text-[12px] leading-[1.55] text-ink-2">
          <span className="text-ink">Named {ad.brandMentions.length}×</span> — {spoken.length} spoken, {screen.length} on screen.
          Language cortex confirms the words register, so the score lifts. Customers submit the campaign
          name and goal alongside the video, so Soma knows what to listen for.
        </div>
      </div>
    </div>
  );
}
