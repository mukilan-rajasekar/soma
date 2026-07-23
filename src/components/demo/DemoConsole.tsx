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
import { drawAttention, drawMessage, pal } from "@/lib/arc-draw";
import BrainSvg, { type BrainHandle } from "./BrainSvg";
import Transport from "./Transport";
import Picker, { VIDEOS, isSample, type VideoItem } from "./Picker";
import Compare from "./Compare";
import CorticalProfile from "./CorticalProfile";
import ReadoutPanel from "./ReadoutPanel";
import LineupCompare from "./LineupCompare";
import SiteHeader from "@/components/site/SiteHeader";
import { loadArc, mergeLiveArcs } from "./live";

const EYE =
  "mb-3 text-[10.5px] uppercase tracking-[0.12em] text-ink-3";

// The PUBLIC read-out never surfaces emotion (valence/arousal). Those are a private
// research result, not a customer-facing claim — so the cortical profile shows only the
// networks that light up, and everything derived below is positive: attention, the peak,
// weak spots, and comprehension. Emotion nets are filtered out by name everywhere.
const EMOTION_NET = /valence|arousal|emotion/i;

type Takeaway = { n: string; title: string; body: string };
type Readout = { takeaways: Takeaway[] };

// Short, plain-english reads derived from the arc — kept terse on purpose (the charts
// carry the detail). Everything here is positive; emotion is never referenced.
function deriveReadout(arc: Arc): Readout {
  const act = arc.activation || [];
  let pk = 0;
  for (let i = 1; i < act.length; i++) if (act[i] > act[pk]) pk = i;
  const peak = fmt(arc.timestamps?.[pk] ?? 0);

  const lit = (arc.roi_profile || []).filter((p) => p.strong && !EMOTION_NET.test(p.net));
  const att = lit.find((p) => /attention/i.test(p.net));
  const lang = lit.find((p) => /language/i.test(p.net));

  const takeaways: Takeaway[] = [
    { n: "", title: "Attention builds to a peak.", body: "Highest at " + peak + " — where the ad holds best." },
  ];
  const w = (arc.weak_spots || [])[0];
  if (w) {
    takeaways.push({
      n: "",
      title: "Soft open.",
      body: "Weakest from " + fmt(w.start) + " to " + fmt(w.end) + " — re-cut here first.",
    });
  }
  if (att && lang) {
    takeaways.push({
      n: "",
      title: "A rational sell.",
      body: "Attention and language lead — it works on focus and message.",
    });
  }
  // Purchase intent — say what the number is, then read this ad's result off its arc.
  const pi = arc.readout?.purchase_intent;
  if (Array.isArray(pi) && pi.length) {
    const q = Math.max(1, Math.round(pi.length * 0.25));
    const endLean = pi.slice(-q).reduce((s, v) => s + v, 0) / q;
    const crossIdx = pi.findIndex((v) => v > 0.02);
    const when = crossIdx > 0 ? fmt(arc.timestamps?.[crossIdx] ?? crossIdx) : null;
    const result =
      endLean > 0.05
        ? "Here it" + (when ? " swings positive around " + when + " and" : "") + " ends leaning toward buying."
        : endLean < -0.05
          ? "Here it never swings positive — this cut informs more than it sells."
          : "Here it holds near neutral — no strong buy-lean either way.";
    takeaways.push({
      n: "",
      title: "Purchase intent = the buy-signal.",
      body:
        "The brain's value response — a positive number means the ad is building a reason to buy, negative means it isn't yet. " +
        result,
    });
  }
  return { takeaways: takeaways.map((t, i) => ({ ...t, n: String(i + 1).padStart(2, "0") })) };
}

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
  const cMsgRef = useRef<HTMLCanvasElement>(null);
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
    // The lanes are plotted over the TIMESTAMP domain [ts0 .. tsN-1] and the playhead +
    // current-sample dot are positioned off the SAME `duration`. duration_sec is the
    // sample COUNT (one more than the last timestamp at 1 Hz), so using it would ride the
    // dot slightly off the line and let the playhead run a full step past the line's end.
    // The transport domain therefore IS the timestamp span (also closer to the true clip
    // length than the rounded-up sample count).
    const span = ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
    durationRef.current = span || data.duration_sec || ts[ts.length - 1] || 0;
    statsRef.current = computeStats(data);
    setupVideo(data);
    failedRef.current = false;
    setFailed(false);
    setArc(data);
    const badge = span || data.duration_sec;
    if (typeof badge === "number" && badge > 0) {
      setDurations((prev) => ({ ...prev, [item.id]: badge }));
    }
  };

  const bail = (label: string, e: unknown) => {
    failedRef.current = true;
    setFailed(true);
    const msg = (e instanceof Error ? e.message : "") || "error";
    [cAttRef.current, cMsgRef.current].forEach((c) => {
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
    // message / language-load lane (trimodal arcs only) — neutral ink, no emotion.
    if (cMsgRef.current && a.message) drawMessage(cMsgRef.current, a, t, duration);
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

  const activeVideo = videos.find((v) => v.id === currentId) || null;
  const showWatermark = !!activeVideo && !failed && isSample(activeVideo);
  const readout = arc && !failed ? deriveReadout(arc) : null;

  const laneClick = (c: HTMLCanvasElement | null, e: React.MouseEvent) => {
    if (!c) return;
    const r = c.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * durationRef.current);
  };

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1080px] px-[clamp(16px,4vw,28px)] pb-[clamp(18px,4vh,30px)] pt-[clamp(24px,5vh,44px)]">
        {/* page hero */}
        <header className="mb-[clamp(22px,4vh,38px)]">
          <div className="mb-4 text-[11px] uppercase tracking-[0.16em] text-ink-3">
            Live demo · read straight from the file, no panel
          </div>
          <h1 className="max-w-[15ch] text-balance text-hero text-ink">
            See how a brain{" "}
            <span className="font-serif font-normal italic">watches</span> your ad.
          </h1>
          <p className="mt-4 max-w-[54ch] text-body text-ink-2">
            A neural read-out, straight from the video &mdash; attention over
            time, comprehension, and which brain systems light up. No panel. Pick any ad
            below.
          </p>
          <Link
            href="/story"
            className="mt-5 inline-block text-[13px] text-ink-3 transition-colors hover:text-ink"
          >
            result walkthrough ↗
          </Link>
        </header>

        {/* console */}
        <div
          ref={consoleRef}
          className="relative rounded-2xl border border-line bg-paper"
        >
          {showWatermark ? (
            <div className="pointer-events-none absolute left-1/2 top-2.5 z-[6] -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-fill px-2.5 py-[5px] text-[11px] tracking-[0.04em] text-ink-2 shadow-sm">
              <span className="text-ink-3">◆</span> ILLUSTRATIVE SAMPLE — synthetic data, not model output
            </div>
          ) : null}

          <div className="flex items-center gap-2.5 border-b border-line px-[clamp(16px,3vw,20px)] py-3 text-[11px] text-ink-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" />
            <span>soma · analyze</span>
            <span className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-3">
              demo
            </span>
          </div>

          {/* selected-ad label (the page hero carries the thesis; this names the cut) */}
          <div className="flex items-center gap-2 px-[clamp(16px,3vw,20px)] pt-[clamp(16px,3vw,20px)] text-meta text-ink-3">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" />
            <span className="text-ink">{activeVideo?.title || "Analysis"}</span>
          </div>

          {/* read-out (leads the page) */}
          <div className="px-[clamp(16px,3vw,20px)] pb-[clamp(18px,3vw,22px)] pt-[clamp(12px,2vw,16px)]">
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
                  <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.13em] text-ink-3">
                    <span>Cortical activation</span>
                    <b ref={brainTRef} className="font-bold tabular-nums text-ink">
                      0.0s
                    </b>
                  </div>
                  <BrainSvg ref={brainRef} />
                  <div className="mt-2.5 border-t border-line pt-2.5 text-[10px] leading-[1.6] tracking-[0.02em] text-ink-3">
                    Whole-cortex activation · normalized 0&ndash;1 · 1&nbsp;Hz.
                  </div>
                </div>
                {!failed && arc?.roi_profile ? <CorticalProfile arc={arc} /> : null}
                {!failed && arc?.readout ? <ReadoutPanel arc={arc} /> : null}
              </div>

              {/* lanes */}
              <div className="flex min-w-0 flex-col gap-3">
                {/* attention */}
                <div className="rounded-2xl border border-line bg-fill px-[15px] py-3.5">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-ui font-medium">Attention arc</span>
                    <span className="shrink-0 text-meta text-ink-3">where it holds vs loses</span>
                  </div>
                  <canvas
                    ref={cAttRef}
                    width={720}
                    height={150}
                    onClick={(e) => laneClick(cAttRef.current, e)}
                    role="img"
                    aria-label="Attention arc across the clip timeline"
                    className="block h-[150px] w-full cursor-crosshair rounded-xl border border-line bg-paper"
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

                {/* message / language-load lane (trimodal arcs only) */}
                {!failed && arc?.message ? (
                  <div className="rounded-2xl border border-line bg-fill px-[15px] py-3.5">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="text-ui font-medium">Message · language load</span>
                      <span className="shrink-0 text-meta text-ink-3">comprehension</span>
                    </div>
                    <canvas
                      ref={cMsgRef}
                      width={720}
                      height={120}
                      onClick={(e) => laneClick(cMsgRef.current, e)}
                      role="img"
                      aria-label="Message / language-load arc across the clip timeline"
                      className="block h-[120px] w-full cursor-crosshair rounded-xl border border-line bg-paper"
                    />
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

            {/* plain-english takeaways — full width, below the read-out */}
            {readout && readout.takeaways.length ? (
              <div className="mt-5 border-t border-line pt-5">
                <div className={EYE}>In plain english</div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                  {readout.takeaways.map((tk) => (
                    <div key={tk.n}>
                      <h3 className="text-ui font-medium text-ink">{tk.title}</h3>
                      <p className="mt-1 text-meta text-ink-2">{tk.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* pick — analyze another ad, below the result */}
          <div className="border-t border-line p-[clamp(16px,3vw,20px)]">
            <div className={EYE}>Analyze another ad</div>
            <Picker videos={videos} currentId={currentId} durations={durations} onPick={pickVideo} />
          </div>

          {/* the whole roster's cortical profiles side by side + a plain-english read each */}
          <div className="border-t border-line p-[clamp(16px,3vw,20px)]">
            <div className={EYE}>Across the lineup</div>
            <LineupCompare />
          </div>
        </div>

        {/* 3 · A/B compare + live Supabase arcs (its own panel below the player) */}
        <Compare videos={videos} />
      </div>
    </main>
  );
}
