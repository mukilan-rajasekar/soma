"use client";

// Section 7 — the one interactive panel, and a new capability: watch the ad next to its
// score. The clip on the left is the clock; a rAF loop reads video.currentTime and drives
// a playhead across the attention/surprise arc plus a live per-second read-out on the
// right. Muted by default (a card must never blare audio at a visitor) with an opt-in
// sound toggle. Everything shown is this ad's real arc — the video and the curve are the
// same measurement, side by side.

import { useEffect, useRef, useState } from "react";
import ArcPlot from "./ArcPlot";
import { fmtT, type Ad } from "./types";

function sampleAt(series: number[], t: number, dur: number): number {
  if (!series.length || dur <= 0) return 0;
  const u = Math.max(0, Math.min(1, t / dur));
  const i = u * (series.length - 1);
  const a = Math.floor(i);
  const b = Math.min(series.length - 1, a + 1);
  return series[a] + (series[b] - series[a]) * (i - a);
}

export default function LivePlayer({ ad, hookSeconds }: { ad: Ad; hookSeconds: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const rafRef = useRef(0);

  useEffect(() => {
    const loop = () => {
      const v = videoRef.current;
      if (v) setT(v.currentTime);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const dur = ad.duration;
  const att = sampleAt(ad.lanes.dorsal, t, dur);
  const sur = sampleAt(ad.lanes.ventral, t, dur);
  const inHook = t <= hookSeconds;

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[248px_1fr]">
      {/* the clip */}
      <div className="flex flex-col gap-2.5">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-ink">
          <video
            ref={videoRef}
            src={ad.video}
            playsInline
            muted={muted}
            preload="metadata"
            onClick={toggle}
            onEnded={() => setPlaying(false)}
            aria-label={`${ad.title} — ad footage`}
            className="block h-[340px] w-full cursor-pointer object-contain"
          />
          {!playing && (
            <button
              onClick={toggle}
              aria-label="Play ad"
              className="absolute inset-0 flex items-center justify-center bg-ink/10 transition-colors hover:bg-ink/20"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper/90 shadow-md">
                <svg viewBox="0 0 12 12" className="ml-0.5 h-4 w-4 fill-ink"><polygon points="2,1 11,6 2,11" /></svg>
              </span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-3">
          <button onClick={toggle} className="rounded-lg border border-line-2 px-2.5 py-1 text-ink-2 transition-colors hover:border-ink hover:text-ink">
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={() => { setMuted((m) => { const n = !m; if (videoRef.current) videoRef.current.muted = n; return n; }); }} className="rounded-lg border border-line-2 px-2.5 py-1 text-ink-2 transition-colors hover:border-ink hover:text-ink">
            {muted ? "Unmute" : "Mute"}
          </button>
          <span className="ml-auto tabular-nums">{fmtT(t)} / {fmtT(dur)}</span>
        </div>
      </div>

      {/* live read-out */}
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <LiveStat label="Attention" sub="dorsal" value={att} tone="ink" flash={false} />
          <LiveStat label="Surprise" sub="ventral" value={sur} tone="accent" flash={inHook} />
          <div className="rounded-2xl border border-line bg-fill p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">Soma score</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-[28px] font-medium tabular-nums leading-none text-ink">{ad.scores.soma}</span>
              <span className="text-[12px] text-ink-3">/100</span>
            </div>
            <div className="mt-2 text-[10px] leading-[1.4] text-ink-3">
              {inHook ? "reading the hook…" : "full-ad composite"}
            </div>
          </div>
        </div>

        <ArcPlot
          dorsal={ad.lanes.dorsal}
          ventral={ad.lanes.ventral}
          timestamps={ad.timestamps}
          duration={dur}
          hookSeconds={hookSeconds}
          weakSpots={ad.weakSpots}
          brandMentions={ad.brandMentions}
          progress={1}
          playhead={t}
          height={168}
          labelDorsal="Attention"
          labelVentral="Surprise"
        />

        <p className="text-[12.5px] leading-[1.55] text-ink-2">{ad.reads.soma} {ad.reads.hook}</p>
      </div>
    </div>
  );
}

function LiveStat({ label, sub, value, tone, flash }: { label: string; sub: string; value: number; tone: "ink" | "accent"; flash: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div className={`rounded-2xl border bg-fill p-3 transition-colors ${flash ? "border-accent-2/60" : "border-line"}`}>
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</div>
        <div className="text-[9px] uppercase tracking-[0.08em] text-ink-3">{sub}</div>
      </div>
      <div className="mt-1.5 text-[22px] font-medium tabular-nums leading-none text-ink">{pct}</div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
        <div className={tone === "accent" ? "h-full rounded-full bg-accent-2" : "h-full rounded-full bg-ink"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
