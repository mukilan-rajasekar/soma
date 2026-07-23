"use client";

// The /demo arc player console. Owns the single shared clock + one rAF loop that
// drives every lane (attention / valence / arousal / coarse) + the brain read-out off
// ONE time source, so nothing can drift out of sync. Ported from the old demo/app.js:
//  - transport: play/pause/scrub/seek, video-sync mode OR timer fallback, MM:SS clock
//  - the loop is gated by an IntersectionObserver (console off-screen) + document
//    visibility, with a single-frame re-arm guard so re-entry never spins up a 2nd loop
//  - a failed load holds an error frame instead of repainting stale data
//  - honesty: illustrative sample cards get a plain watermark; lane honesty badges show
//    warning-red for any non-"learned-hypothesis" status; weak-spot callouts pin to time.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  activeWeakSpot,
  clamp01,
  computeStats,
  fmt,
  valAt,
  validArc,
  type Arc,
  type ArcStats,
} from "@/lib/arc";
import { coarseColor, drawAttention, drawCoarse, drawSigned, pal } from "@/lib/arc-draw";
import BrainSvg, { type BrainHandle } from "./BrainSvg";
import Transport from "./Transport";
import Picker, { VIDEOS, isSample, type VideoItem } from "./Picker";
import Compare from "./Compare";
import CorticalProfile from "./CorticalProfile";
import { loadArc, mergeLiveArcs } from "./live";

type LaneBadge = { text: string; color: string } | null;

// honesty badge: any status that is NOT the validated tier ("learned-hypothesis")
// shows in warning error-red, so a smoke / unvalidated / poisoned head can't be mistaken
// for a validated result. Validated reads as calm neutral ink-2 (never a colour).
function badgeFor(txt: string | undefined, status: string | undefined): LaneBadge {
  if (!txt) return null;
  return { text: txt, color: status === "learned-hypothesis" ? "#4a4a4a" : "#b42318" };
}

const EYE =
  "mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3";

// Boot on the REAL welding-ad run (honesty: never default to a synthetic/illustrative
// card). real2 is the trimodal ad cut and the only card carrying a cortical profile, so
// the "where it lights up" panel is visible the instant /demo loads.
const BOOT_ID = "real2";
const bootVideo = VIDEOS.find((v) => v.id === BOOT_ID) || VIDEOS[0];

export default function DemoConsole() {
  // ---- React state (changes only on pick / load, never per frame) ----
  const [videos, setVideos] = useState<VideoItem[]>(VIDEOS);
  const [arc, setArc] = useState<Arc | null>(null);
  // seed the selection at init so the boot effect never calls setState synchronously.
  const [currentId, setCurrentId] = useState<string | null>(bootVideo?.id ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [durations, setDurations] = useState<Record<string, number>>({});

  // ---- refs owned by the loop (mutated every frame, never trigger a render) ----
  const arcRef = useRef<Arc | null>(null);
  const durationRef = useRef(0);
  const statsRef = useRef<ArcStats | null>(null);
  const playingRef = useRef(false);
  const hasVideoRef = useRef(false);
  const failedRef = useRef(false);
  const timerBaseRef = useRef(0);
  const timerT0Ref = useRef(0);
  const loadTokenRef = useRef(0);

  // ---- element refs ----
  const consoleRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const brainRef = useRef<BrainHandle>(null);
  const brainTRef = useRef<HTMLElement>(null);
  const cAttRef = useRef<HTMLCanvasElement>(null);
  const cValRef = useRef<HTMLCanvasElement>(null);
  const cAroRef = useRef<HTMLCanvasElement>(null);
  const cCoarseRef = useRef<HTMLCanvasElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const calloutStrongRef = useRef<HTMLElement>(null);
  const calloutLabelRef = useRef<HTMLSpanElement>(null);

  // ---- shared clock (video-sync OR timer fallback), ported 1:1 ----
  const currentTime = (): number => {
    const v = videoRef.current;
    if (hasVideoRef.current && v) return Math.min(durationRef.current || Infinity, v.currentTime || 0);
    if (!playingRef.current) return timerBaseRef.current;
    return Math.min(durationRef.current, timerBaseRef.current + (performance.now() - timerT0Ref.current) / 1000);
  };

  // setBtn: flag + icon only (used by native <video> events too).
  const setBtn = (on: boolean) => {
    playingRef.current = on;
    setIsPlaying(on);
  };
  const setPlaying = (on: boolean) => {
    const v = videoRef.current;
    if (hasVideoRef.current && v) {
      // video mode: command it; native events sync the button
      if (on) {
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      } else {
        v.pause();
      }
      return;
    }
    setBtn(on);
    if (on) timerT0Ref.current = performance.now();
    else timerBaseRef.current = currentTime();
  };
  const seek = (t: number) => {
    const d = durationRef.current;
    t = Math.max(0, Math.min(d, t));
    timerBaseRef.current = t;
    timerT0Ref.current = performance.now();
    const v = videoRef.current;
    if (hasVideoRef.current && v) {
      try {
        v.currentTime = t;
      } catch {
        /* seeking before metadata is fine */
      }
    }
  };

  // ---- (a) real footage sync if arc.video_src is non-empty; else timer ----
  const setupVideo = (data: Arc) => {
    const v = videoRef.current;
    hasVideoRef.current = false;
    if (!v) return;
    const src = (data.video_src || "").trim();
    if (!src) {
      try {
        v.pause();
      } catch {
        /* nothing playing */
      }
      v.removeAttribute("src");
      v.load?.();
      v.hidden = true;
      return;
    }
    hasVideoRef.current = true;
    if (v.getAttribute("src") !== src) {
      v.setAttribute("src", src);
      v.load?.();
    }
    v.hidden = false;
    v.onloadedmetadata = () => {
      if (!data.duration_sec && isFinite(v.duration) && v.duration > 0) durationRef.current = v.duration;
    };
    v.onplay = () => setBtn(true);
    v.onpause = () => setBtn(false);
    v.onended = () => setBtn(false);
    try {
      v.currentTime = currentTime();
    } catch {
      /* pre-metadata */
    }
  };

  const applyArc = (data: Arc, item: VideoItem) => {
    // when head_apply.py has written a trained-head lane, the demoted arithmetic arc
    // rides along as arc.baseline — drawn faint under the headline (honest before/after).
    data._baseline = data.baseline && Array.isArray(data.baseline.activation) ? data.baseline.activation : null;
    arcRef.current = data;
    const ts = data.timestamps || [];
    durationRef.current = data.duration_sec || ts[ts.length - 1] || 0;
    statsRef.current = computeStats(data);
    setupVideo(data);
    failedRef.current = false;
    setFailed(false);
    setArc(data);
    if (typeof data.duration_sec === "number") {
      const d = data.duration_sec;
      setDurations((prev) => ({ ...prev, [item.id]: d }));
    }
  };

  const bail = (label: string, e: unknown) => {
    failedRef.current = true;
    setFailed(true);
    const msg = (e instanceof Error ? e.message : "") || "error";
    [cAttRef.current, cValRef.current, cAroRef.current].forEach((c) => {
      if (!c) return;
      const x = c.getContext("2d");
      if (!x) return;
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = pal().error;
      x.font = "13px ui-monospace,monospace";
      x.fillText("Could not load " + label + " — " + msg, 14, 26);
    });
  };

  const load = (item: VideoItem) => {
    const label = item.title || item.id || item.arc || "arc";
    const token = ++loadTokenRef.current; // guard: a newer pick supersedes a late resolve
    // loadArc resolves an inline in-memory arc (live Supabase rows) OR fetches the sample
    // json URL, so a live card plays back exactly like the static sample cards.
    loadArc(item)
      .then((data: unknown) => {
        if (token !== loadTokenRef.current) return;
        if (!validArc(data)) {
          bail(label, new Error("malformed arc data"));
          return;
        }
        applyArc(data, item);
      })
      .catch((e: unknown) => {
        if (token !== loadTokenRef.current) return;
        bail(label, e);
      });
  };

  const pickVideo = (v: VideoItem) => {
    setCurrentId(v.id);
    seek(0);
    setPlaying(false);
    load(v);
  };

  // ---- one shared draw, off the single clock ----
  const draw = (t: number) => {
    const a = arcRef.current;
    const duration = durationRef.current;
    const stats = statsRef.current;
    // transport read-outs (ice progress fill + MM:SS clock + a11y time announce)
    const pct = duration ? (t / duration) * 100 : 0;
    const scrub = scrubRef.current;
    if (scrub) {
      scrub.value = String(pct);
      scrub.style.setProperty("--val", pct.toFixed(2) + "%");
      scrub.setAttribute("aria-valuetext", fmt(t) + " of " + fmt(duration));
    }
    if (clockRef.current) clockRef.current.textContent = fmt(t) + " / " + fmt(duration);
    if (!a) return;
    if (cAttRef.current) drawAttention(cAttRef.current, a, t, duration, stats);
    const af = a.affect || {};
    const P = pal();
    // valence rides on ink; arousal on a lighter ink tint (ink-2) — attention keeps the
    // one slate accent to itself.
    if (cValRef.current)
      drawSigned(cValRef.current, af.valence, af.valence_lo, af.valence_hi, t, P.ink, "center", stats?.val ?? null, a, duration);
    if (cAroRef.current)
      drawSigned(cAroRef.current, af.arousal, af.arousal_lo, af.arousal_hi, t, P.ink2, "bottom", stats?.aro ?? null, a, duration);
    if (cCoarseRef.current) drawCoarse(cCoarseRef.current, a, t, duration);
    brainRef.current?.apply(clamp01(valAt(a.activation, t, duration)), stats?.att?.max ?? null);
    if (brainTRef.current) brainTRef.current.textContent = t.toFixed(1) + "s";
    // weak-spot callout pinned to the timeline
    const ws = activeWeakSpot(a, t);
    const co = calloutRef.current;
    if (co) {
      if (ws) {
        co.hidden = false;
        if (calloutStrongRef.current) calloutStrongRef.current.textContent = "Weak spot at " + fmt(ws.start);
        if (calloutLabelRef.current) calloutLabelRef.current.textContent = " — " + ws.label;
      } else {
        co.hidden = true;
      }
    }
  };

  // ---- single rAF loop, gated + re-armable (never double-armed) ----
  useEffect(() => {
    let rafId = 0;
    let loopRunning = false; // single-frame guard against a duplicate loop
    let consoleOnScreen = true;
    let stopped = false;
    let loopErrLogged = false;

    const loopActive = () => consoleOnScreen && !document.hidden && !stopped;
    const startLoop = () => {
      if (loopRunning || !loopActive()) return;
      loopRunning = true;
      rafId = requestAnimationFrame(loop);
    };
    const loop = () => {
      loopRunning = false; // this frame is executing; a fresh one is armed only via startLoop()
      if (!loopActive()) return;
      // a failed load left an error frame — keep the loop alive but don't repaint stale data over it
      if (failedRef.current) {
        startLoop();
        return;
      }
      try {
        const t = currentTime();
        if (playingRef.current && !hasVideoRef.current && t >= durationRef.current) setPlaying(false);
        draw(t);
      } catch (e) {
        // a draw error must never kill the rAF chain (it re-arms below). Warn once, not at 60fps.
        if (!loopErrLogged) {
          loopErrLogged = true;
          console.warn("Soma loop draw error (suppressed after first):", e);
        }
      }
      startLoop();
    };

    // pause the loop when it can't be seen (console off-screen) or the tab is hidden.
    const stage = consoleRef.current;
    let io: IntersectionObserver | null = null;
    if (stage && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          consoleOnScreen = entries.some((en) => en.isIntersecting);
          startLoop();
        },
        { threshold: 0 },
      );
      io.observe(stage);
    }
    const onVis = () => {
      if (!document.hidden) startLoop();
    };
    document.addEventListener("visibilitychange", onVis);
    startLoop();

    return () => {
      stopped = true;
      if (io) io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- boot: kick off the REAL run's async load (no synchronous setState here — the
  // selection is already seeded into currentId's initializer). ----
  useEffect(() => {
    if (!bootVideo) return;
    seek(0);
    load(bootVideo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- fold in any live Supabase arcs (async; no-op if unconfigured). Local sample arcs
  // stay the baseline; validated live rows are APPENDED (never unshift) so the featured
  // real run + sample cards never jump under the visitor. Compare picks them up
  // automatically (it re-renders on `videos`). ----
  useEffect(() => {
    let cancelled = false;
    mergeLiveArcs(VIDEOS).then((live) => {
      if (cancelled || !live.length) return;
      setVideos((prev) => {
        const have = new Set(prev.map((v) => v.id));
        const add = live.filter((v) => !have.has(v.id));
        return add.length ? [...prev, ...add] : prev;
      });
      // seed known durations for live cards so the thumb label isn't the "30s" default.
      setDurations((prev) => {
        const next = { ...prev };
        for (const v of live) {
          const ts = v.arcData?.timestamps;
          const d = v.arcData?.duration_sec ?? (ts && ts.length ? ts[ts.length - 1] : undefined);
          if (typeof d === "number" && d > 0 && next[v.id] == null) next[v.id] = d;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- derived (React-rendered) bits ----
  const attBadge = arc ? badgeFor(arc.attention_badge || arc.lanes?.attention?.badge, arc.attention_status || arc.lanes?.attention?.status) : null;
  const valBadge = arc ? badgeFor(arc.affect?.valence_badge || arc.lanes?.valence?.badge, arc.affect?.valence_status || arc.lanes?.valence?.status) : null;
  const aroBadge = arc ? badgeFor(arc.affect?.arousal_badge || arc.lanes?.arousal?.badge, arc.affect?.arousal_status || arc.lanes?.arousal?.status) : null;

  const cs = arc?.affect?.coarse_states;
  const hasCoarse = !!(cs && Array.isArray(cs.labels) && cs.labels.length && Array.isArray(cs.probs) && cs.probs.length && Array.isArray(cs.probs[0]));

  const activeVideo = videos.find((v) => v.id === currentId) || null;
  const showWatermark = !!activeVideo && !failed && isSample(activeVideo);

  const laneClick = (c: HTMLCanvasElement | null, e: React.MouseEvent) => {
    if (!c) return;
    const r = c.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * durationRef.current);
  };

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <div className="mx-auto w-full max-w-[1080px] px-[clamp(16px,4vw,28px)] py-[clamp(18px,4vh,30px)]">
        {/* top bar */}
        <header className="mb-[clamp(16px,3vh,24px)] flex items-center justify-between">
          <Link href="/" className="text-wordmark text-ink hover:text-ink">
            soma
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="/story"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-ink"
            >
              result walkthrough ↗
            </Link>
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-ink"
            >
              ← back to home
            </Link>
          </div>
        </header>

        {/* console */}
        <div
          ref={consoleRef}
          className="relative rounded-2xl border border-line bg-paper"
        >
          {showWatermark ? (
            <div className="pointer-events-none absolute left-1/2 top-2.5 z-[6] -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-fill px-2.5 py-[5px] font-mono text-[11px] tracking-[0.04em] text-ink-2 shadow-sm">
              <span className="text-ink-3">◆</span> ILLUSTRATIVE SAMPLE — synthetic data, not model output
            </div>
          ) : null}

          <div className="flex items-center gap-2.5 border-b border-line px-[clamp(16px,3vw,20px)] py-3 font-mono text-[11px] text-ink-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" />
            <span>soma · analyze</span>
            <span className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-3">
              demo
            </span>
          </div>

          {/* 1 · pick */}
          <div className="p-[clamp(16px,3vw,20px)]">
            <div className={EYE}>1 · Pick an ad</div>
            <Picker videos={videos} currentId={currentId} durations={durations} onPick={pickVideo} />
          </div>

          {/* 2 · read-out */}
          <div className="px-[clamp(16px,3vw,20px)] pb-[clamp(18px,3vw,22px)]">
            <div className={EYE}>2 · Neural read-out (one shared timeline)</div>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[300px_1fr]">
              {/* brain */}
              <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-2xl border border-line bg-fill p-3.5">
                  <video
                    ref={videoRef}
                    hidden
                    playsInline
                    muted
                    preload="metadata"
                    className="mb-2.5 block w-full rounded-xl border border-line bg-ink"
                  />
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.13em] text-ink-3">
                    <span>Predicted cortical activation</span>
                    <b ref={brainTRef} className="font-bold tabular-nums text-ink">
                      0.0s
                    </b>
                  </div>
                  <BrainSvg ref={brainRef} />
                  <div className="mt-2.5 border-t border-line pt-2.5 font-mono text-[10px] leading-[1.6] tracking-[0.02em] text-ink-3">
                    Whole-cortex activation magnitude · average viewer · normalized 0&ndash;1 · 1&nbsp;Hz.
                  </div>
                </div>
                {!failed && arc?.roi_profile ? <CorticalProfile arc={arc} /> : null}
              </div>

              {/* lanes */}
              <div className="flex min-w-0 flex-col gap-3">
                {/* attention */}
                <div className="rounded-2xl border border-line bg-fill px-[15px] py-3.5">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold tracking-[-0.01em]">
                      Attention arc
                      <small className="mt-0.5 block font-mono text-[10px] font-normal tracking-[0.02em] text-ink-3">
                        where the ad holds vs loses people
                      </small>
                      {!failed && attBadge ? (
                        <small className="mt-1.5 block max-w-[62ch] font-mono text-[11px] leading-[1.35] tracking-[0.02em] opacity-90" style={{ color: attBadge.color }}>
                          {attBadge.text}
                        </small>
                      ) : null}
                    </span>
                  </div>
                  <canvas
                    ref={cAttRef}
                    width={720}
                    height={150}
                    onClick={(e) => laneClick(cAttRef.current, e)}
                    role="img"
                    aria-label="Attention arc across the clip timeline"
                    className="block h-auto w-full cursor-crosshair rounded-xl border border-line bg-paper"
                  />
                </div>

                {/* weak-spot callout */}
                <div
                  ref={calloutRef}
                  hidden
                  className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/[0.06] px-3.5 py-2.5 text-[13px] text-error"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0">
                    <path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="M8 6.2v3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="8" cy="11.6" r=".6" fill="currentColor" />
                  </svg>
                  <span>
                    <strong ref={calloutStrongRef} className="font-semibold text-error" />
                    <span ref={calloutLabelRef} />
                  </span>
                </div>

                {/* valence */}
                <div className="rounded-2xl border border-line bg-fill px-[15px] py-3.5">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold tracking-[-0.01em]">
                      Valence · feels good ↔ bad
                      <small className="mt-0.5 block font-mono text-[10px] font-normal tracking-[0.02em] text-ink-3">
                        pleasant (up) / unpleasant (down)
                      </small>
                      {!failed && valBadge ? (
                        <small className="mt-1.5 block max-w-[62ch] font-mono text-[11px] leading-[1.35] tracking-[0.02em] opacity-90" style={{ color: valBadge.color }}>
                          {valBadge.text}
                        </small>
                      ) : null}
                    </span>
                  </div>
                  <canvas
                    ref={cValRef}
                    width={720}
                    height={120}
                    onClick={(e) => laneClick(cValRef.current, e)}
                    role="img"
                    aria-label="Valence arc across the clip timeline"
                    className="block h-auto w-full cursor-crosshair rounded-xl border border-line bg-paper"
                  />
                </div>

                {/* arousal */}
                <div className="rounded-2xl border border-line bg-fill px-[15px] py-3.5">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold tracking-[-0.01em]">
                      Arousal · calm ↔ excited
                      <small className="mt-0.5 block font-mono text-[10px] font-normal tracking-[0.02em] text-ink-3">
                        how worked-up the moment is
                      </small>
                      {!failed && aroBadge ? (
                        <small className="mt-1.5 block max-w-[62ch] font-mono text-[11px] leading-[1.35] tracking-[0.02em] opacity-90" style={{ color: aroBadge.color }}>
                          {aroBadge.text}
                        </small>
                      ) : null}
                    </span>
                  </div>
                  <canvas
                    ref={cAroRef}
                    width={720}
                    height={120}
                    onClick={(e) => laneClick(cAroRef.current, e)}
                    role="img"
                    aria-label="Arousal arc across the clip timeline"
                    className="block h-auto w-full cursor-crosshair rounded-xl border border-line bg-paper"
                  />
                </div>

                {/* coarse discrete-state distribution (only when present) */}
                {!failed && hasCoarse && cs ? (
                  <div className="rounded-2xl border border-line bg-fill px-[15px] py-3.5">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="text-[14px] font-semibold tracking-[-0.01em]">
                        Coarse affective states
                        <small className="mt-0.5 block font-mono text-[10px] font-normal tracking-[0.02em] text-ink-3">
                          probability spread over the clip
                        </small>
                      </span>
                    </div>
                    <canvas
                      ref={cCoarseRef}
                      width={720}
                      height={96}
                      onClick={(e) => laneClick(cCoarseRef.current, e)}
                      role="img"
                      aria-label="Coarse affective-state probabilities across the clip"
                      className="block h-auto w-full cursor-crosshair rounded-xl border border-line bg-paper"
                    />
                    <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-2 font-mono text-[10px] text-ink-3">
                      {cs.labels.map((lb, i) => (
                        <span key={lb + i} className="inline-flex items-center gap-1.5">
                          <i
                            className="inline-block h-[9px] w-[9px] rounded-[3px]"
                            style={{ background: coarseColor(i, cs.labels.length) }}
                          />
                          {lb}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Transport
                  playing={isPlaying}
                  onToggle={() => setPlaying(!playingRef.current)}
                  onScrub={(pct) => seek((pct / 100) * durationRef.current)}
                  scrubRef={scrubRef}
                  clockRef={clockRef}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3 · A/B compare + live Supabase arcs (its own panel below the player) */}
        <Compare videos={videos} />
      </div>
    </main>
  );
}
