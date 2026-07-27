"use client";

// The recurring chart. One <canvas> that draws an attention (dorsal) curve with an
// optional surprise (ventral) overlay, the first-3s hook zone, weak-spot bands, and
// brand-mention ticks. Everything obeys the data-viz half of the design system:
//   surface = paper, grid = --color-line hairlines, dorsal = --color-ink solid 2px,
//   ventral = --color-accent-2 dashed (A/B differ by colour + dash, not hue alone),
//   NO glow / neon / shadow.
//
// `progress` (0..1) is the fraction of the curve drawn. Two ways to drive it:
//   `animate={revealed}` — ArcPlot runs its own constant-rate 0→1 clock and the curve
//                          draws itself left to right behind a sweep line, which is how
//                          every scroll section uses it.
//   `progress={n}`       — caller owns the fraction; the live player pins 1 and passes a
//                          `playhead` time instead.
// This header claimed the self-drawing behaviour long before it existed: every caller
// passed `progress={revealed ? 1 : 0}`, a binary, so the arcs snapped from empty to
// complete in one frame and the partial-tip branch in drawCurve below was dead code.
// Nothing here computes numbers; it only plots what it's given.

import { useEffect, useRef, useState } from "react";
import { LANES, laneByKey } from "./lanes";
import { ON_SCREEN, useAnimeClock, useReveal } from "./useReveal";
import { hexToRgba, readVizTokens, tokenVar } from "./tokens";
import { fmtT, type BrandMention, type WeakSpot } from "./types";

type Props = {
  dorsal: number[];
  ventral?: number[];
  /** The comprehension lane (association cortex). Off unless a caller asks for it. */
  comprehension?: number[];
  timestamps: number[];
  duration: number;
  hookSeconds?: number;
  weakSpots?: WeakSpot[];
  brandMentions?: BrandMention[];
  progress?: number; // fraction of the curve to draw (0..1)
  // Hand this a reveal flag instead of a `progress` number and the plot runs its own
  // clock: false holds an empty frame, true draws the curve at a constant rate. Null (the
  // default) leaves `progress` in charge, which is what the live player needs.
  animate?: boolean | null;
  drawMs?: number;
  // Bypass the on-screen gate below and draw as soon as `animate` turns true. Exactly one
  // caller wants this: the hero chart, which is above the fold by construction and is the
  // frame a recording opens on, so it must not sit empty waiting to be scrolled into.
  // Every other plot on the page is deep inside a section and has to wait to be framed.
  eager?: boolean;
  // A labelled dot on one lane at a given time, faded in only once the curve has finished
  // drawing. §02 uses it to put the ventral peak the read-out names ("spikes at 0:02") on
  // the picture, so the sentence and the chart point at the same instant.
  peakMark?: { t: number; lane?: "dorsal" | "ventral"; label?: string } | null;
  playhead?: number | null; // seconds; a vertical rule + dot on the dorsal curve
  height?: number;
  showVentral?: boolean;
  /** Draw and label the comprehension lane. Off by default: most charts on the page are
   *  about the hook, where a third curve is clutter rather than information. */
  showComprehension?: boolean;
  showHook?: boolean;
  /** The explained lane legend under the plot. On by default. Turned OFF for the small arc
   *  inside §03's candidate card: the lanes are taught once in §02, at full size, and that
   *  card re-taught them at half size inside the densest frame in the whole take (~15 data
   *  elements). Once a legend has been read, repeating it is cost with no information. */
  showLegend?: boolean;
  // A second, faint dorsal curve drawn behind the main one on the SAME time axis — the
  // "before" of an edit. §08 passes the unspliced arc here and the spliced arc as `dorsal`,
  // so the change is a single picture rather than two charts side by side.
  ghost?: { dorsal: number[]; timestamps: number[] } | null;
  // A hairline + label at a time inside the span. §08 marks where the shortened cut now
  // ends, which is what makes the curve stopping short of the right edge read as "the ad
  // got shorter" rather than as a chart that failed to finish drawing.
  endMarker?: number | null;
};

// The palette used to be a literal copy of globals.css pasted here (and again in
// VariantOverlay, and again in TwoRegionBrain). It is now resolved from the real CSS custom
// properties inside the draw effect — see ./tokens — so those copies cannot drift apart, and
// the labels come out in the site face instead of system-ui.

const PADL = 34;
const PADR = 14;
const PADT = 16;
const PADB = 26;
// Extra top padding reserved when the hook band is drawn, so its caption can sit ABOVE the
// plot frame instead of inside it. See the label block for why that matters.
const PADT_HOOK = 28;

// Uniform Catmull-Rom evaluated on `vals` at segment `i`, local param `f∈[0,1]`.
// A Catmull-Rom spline passes THROUGH every data point, so a dot placed on it (at a
// sample or interpolated between two) sits exactly on the drawn line — unlike the old
// midpoint-quadratic smoothing, which floated the dot off the curve.
function crAt(vals: number[], i: number, f: number): number {
  const n = vals.length;
  const p0 = vals[Math.max(0, i - 1)];
  const p1 = vals[i];
  const p2 = vals[Math.min(n - 1, i + 1)];
  const p3 = vals[Math.min(n - 1, i + 2)];
  const f2 = f * f;
  const f3 = f2 * f;
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
}

// Draw a Catmull-Rom curve through (xs, ys), up to fraction `upto` of the index domain.
function drawCurve(ctx: CanvasRenderingContext2D, xs: number[], ys: number[], upto: number) {
  const n = xs.length;
  if (n < 2) return;
  const last = Math.max(0, Math.min(1, upto)) * (n - 1);
  const full = Math.floor(last);
  ctx.beginPath();
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 0; i < full; i++) {
    const x1 = xs[i], y1 = ys[i];
    const x2 = xs[i + 1], y2 = ys[i + 1];
    const x0 = xs[Math.max(0, i - 1)], y0 = ys[Math.max(0, i - 1)];
    const x3 = xs[Math.min(n - 1, i + 2)], y3 = ys[Math.min(n - 1, i + 2)];
    const c1x = x1 + (x2 - x0) / 6, c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6, c2y = y2 - (y3 - y1) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
  }
  // partial leading tip during the reveal animation
  const f = last - full;
  if (full < n - 1 && f > 0) {
    const px = xs[full] + (xs[full + 1] - xs[full]) * f;
    ctx.lineTo(px, crAt(ys, full, f));
  }
  ctx.stroke();
}

// Where the pen is at fraction `upto` — the same interpolation drawCurve stops at, so the
// sweep line and the leading dot land exactly on the end of the drawn stroke rather than
// near it.
function tipAt(xs: number[], ys: number[], upto: number): { x: number; y: number } {
  const n = xs.length;
  const last = Math.max(0, Math.min(1, upto)) * (n - 1);
  const full = Math.floor(last);
  if (full >= n - 1) return { x: xs[n - 1], y: ys[n - 1] };
  const f = last - full;
  return { x: xs[full] + (xs[full + 1] - xs[full]) * f, y: crAt(ys, full, f) };
}

export default function ArcPlot({
  dorsal,
  ventral,
  comprehension,
  timestamps,
  duration,
  hookSeconds = 3,
  weakSpots = [],
  brandMentions = [],
  progress = 1,
  animate = null,
  drawMs = 1500,
  eager = false,
  peakMark = null,
  playhead = null,
  height = 190,
  showVentral = true,
  showComprehension = false,
  showHook = true,
  showLegend = true,
  ghost = null,
  endMarker = null,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The curve draws off the CANVAS arriving, not off its section revealing. `animate` says
  // the beat is due; ON_SCREEN says this plot is actually in frame. Both are required, so a
  // plot can be delayed by its own arrival but never fire ahead of its section. Without it
  // every arc below the first screen of its section drew itself off camera: §02's hook arc
  // finished with 71px of itself on screen, and the winner arc inside GenerateStudio
  // finished 68px of scroll before its first pixel at 640px wide.
  const [hostRef, framed] = useReveal<HTMLDivElement>(ON_SCREEN);
  // Constant rate, not eased: see the note on useAnimeClock's `ease` argument. The hook is
  // called unconditionally and simply ignored when the caller owns `progress`.
  const clock = useAnimeClock(animate === true && (eager || framed), drawMs, "linear");
  // Pulled out of the object because callers build it inline (`peakMark={{ t, lane }}`), a
  // fresh identity every render. Depending on the fields keeps the draw effect from re-running
  // on every parent render, and lets exhaustive-deps verify the list rather than be silenced.
  const markT = peakMark?.t;
  const markLane = peakMark?.lane;
  const markLabel = peakMark?.label;
  const p = animate == null ? progress : clock;
  // Canvas width is read imperatively below, so nothing in the draw effect's dependency
  // list changes when the element resizes — the chart kept whatever width it had at mount
  // forever. On a page that exists to be screen-recorded that is a real failure: framing
  // the shot by resizing the window, or recording after a device-pixel-ratio change when a
  // window moves between displays, left every arc drawn at the old width and either
  // stretched or clipped. This observer makes width a reactive input like any other prop.
  const [canvasW, setCanvasW] = useState(0);
  useEffect(() => {
    const c = ref.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      setCanvasW((prev) => (prev === w ? prev : w));
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Live tokens, resolved here rather than at module scope: inside an effect `document`
    // exists and the stylesheet has applied, which is the only place either is guaranteed.
    const TOK = readVizTokens();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = height;
    if (c.width !== W * dpr || c.height !== H * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const span = duration > 0 ? duration : Math.max(1, timestamps[timestamps.length - 1] || 1);
    const hookOn = showHook && hookSeconds > 0 && hookSeconds < span;
    const x0 = PADL;
    const x1 = W - PADR;
    const y0 = hookOn ? PADT_HOOK : PADT;
    const y1 = H - PADB;
    const xAt = (t: number) => x0 + (t / span) * (x1 - x0);
    const yAt = (v: number) => y1 - v * (y1 - y0);

    // grid — 4 horizontal hairlines
    ctx.strokeStyle = TOK.line;
    ctx.lineWidth = 1;
    ctx.font = `11.5px ${TOK.fontFamily}`;
    ctx.fillStyle = TOK.ink3;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const v = g / 4;
      const y = yAt(v);
      ctx.globalAlpha = g === 0 ? 1 : 0.55;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (g % 2 === 0) ctx.fillText(v.toFixed(1), x0 - 6, y);
    }

    const xs = timestamps.map((t) => xAt(t));
    const yd = dorsal.map((v) => yAt(v));
    // Where the pen is right now. Needed before the hook band so the band can fill in behind
    // the trace instead of being there waiting for it.
    const tip = tipAt(xs, yd, p);

    // hook zone — the first `hookSeconds`, a light fill + a boundary rule
    if (hookOn) {
      const hx = xAt(hookSeconds);
      // The band fills to the pen, then stops at the hook boundary: the reader watches the
      // window being measured rather than finding it already marked. The boundary rule only
      // appears once the trace reaches it, because a rule sitting ahead of the curve reads as
      // a target the chart is aiming for rather than a measurement it just took.
      const bandTo = animate == null ? hx : Math.min(hx, Math.max(x0, tip.x));
      ctx.fillStyle = hexToRgba(TOK.accent, 0.05);
      ctx.fillRect(x0, y0, bandTo - x0, y1 - y0);
      if (bandTo >= hx - 0.5) {
        ctx.strokeStyle = TOK.accent;
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, y0);
        ctx.lineTo(hx, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = TOK.accent;
      // 8px was illegible at recording scale, and the label was the string "HOOK · 0–3s"
      // while the band it labels is drawn from the `hookSeconds` prop — change the prop (or
      // report.hookSeconds) and the picture moved while the caption kept saying 3s.
      //
      // Drawn in the top padding gutter, OUTSIDE the plot rect, not at (x0+5, y0+9) inside
      // it. Inside the rect it sat in the busiest corner of the chart: the hook band is by
      // definition where both curves open, and on the hero ad the ventral curve peaks near
      // 0.9 within the first three seconds, so the dashed line ran straight through the
      // caption. Nudging the offset only moved which ad collided. Above y0 there is no data
      // by construction, which is why PADT grows to PADT_HOOK to make room for it.
      ctx.font = `11.5px ${TOK.fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`HOOK · 0–${hookSeconds % 1 === 0 ? hookSeconds : hookSeconds.toFixed(1)}s`, x0, y0 - 6);
      ctx.textBaseline = "middle";
    }

    // weak-spot bands — light error tint behind the curve
    ctx.textAlign = "center";
    for (const w of weakSpots) {
      const wx0 = xAt(w.start);
      const wx1 = xAt(w.end);
      ctx.fillStyle = hexToRgba(TOK.error, 0.07);
      ctx.fillRect(wx0, y0, wx1 - wx0, y1 - y0);
      ctx.strokeStyle = hexToRgba(TOK.error, 0.35);
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(wx0, y0);
      ctx.lineTo(wx0, y1);
      ctx.moveTo(wx1, y0);
      ctx.lineTo(wx1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // the "before" curve, if one was handed in — hairline, faint, behind everything, so
    // the live curve reads as the subject and this reads as where it used to be.
    if (ghost && ghost.dorsal.length > 1) {
      ctx.strokeStyle = TOK.ink3;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.lineJoin = "round";
      drawCurve(ctx, ghost.timestamps.map((t) => xAt(t)), ghost.dorsal.map((v) => yAt(v)), 1);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Strokes come off the lane table (lanes.ts), which is also what the legend below
    // renders — so a curve's weight and dash cannot drift away from the swatch describing
    // it. Painted in ascending z, so the solid attention curve finishes on top.
    const COMP = laneByKey("comprehension");
    if (showComprehension && comprehension && comprehension.length) {
      const yc = comprehension.map((v) => yAt(v));
      ctx.strokeStyle = TOK[COMP.colorToken];
      ctx.lineWidth = COMP.width;
      // Round caps turn the near-zero dash into beads rather than ticks; it has to be put
      // back afterwards or the pen and the tip dots inherit it.
      ctx.lineCap = "round";
      ctx.setLineDash(COMP.dash ? [...COMP.dash] : []);
      ctx.lineJoin = "round";
      drawCurve(ctx, xs, yc, p);
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
    }

    const SURP = laneByKey("surprise");
    if (showVentral && ventral && ventral.length) {
      const yv = ventral.map((v) => yAt(v));
      ctx.strokeStyle = TOK[SURP.colorToken];
      ctx.lineWidth = SURP.width;
      ctx.setLineDash(SURP.dash ? [...SURP.dash] : []);
      ctx.lineJoin = "round";
      drawCurve(ctx, xs, yv, p);
      ctx.setLineDash([]);
    }

    const ATT = laneByKey("attention");
    ctx.strokeStyle = TOK[ATT.colorToken];
    ctx.lineWidth = ATT.width;
    ctx.lineJoin = "round";
    drawCurve(ctx, xs, yd, p);

    // the pen. While the curve is still drawing, a hairline sweep at the leading edge plus
    // a dot riding the dorsal tip: the difference between a chart that fades in and an
    // instrument plotting a signal as the clip plays. Both disappear at p >= 1 so the
    // finished frame — the one a still screenshot catches — is the clean chart.
    if (p > 0.002 && p < 1) {
      ctx.strokeStyle = TOK.ink;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tip.x, y0);
      ctx.lineTo(tip.x, y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = TOK.ink;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
      ctx.fill();
      if (showVentral && ventral && ventral.length) {
        const vtip = tipAt(xs, ventral.map((v) => yAt(v)), p);
        ctx.fillStyle = TOK.accent2;
        ctx.beginPath();
        ctx.arc(vtip.x, vtip.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The named instant. Fades in over the last 15% of the draw, so it arrives as the pen
    // leaves the frame rather than sitting on the chart while the curve is still catching up
    // to it. The lane it marks decides its colour, which is what lets the reader tie the
    // callout to the right curve without a legend entry.
    if (markT != null && markT >= 0 && markT <= span) {
      const a = Math.max(0, Math.min(1, (p - 0.85) / 0.15));
      if (a > 0.01) {
        const lane = markLane === "dorsal" ? dorsal : (ventral ?? dorsal);
        const ys = lane.map((v) => yAt(v));
        // Nearest sample to the marked time; the reads are computed on whole samples, so an
        // interpolated y here would place the dot slightly off the value being cited.
        let idx = 0;
        for (let i = 1; i < timestamps.length; i++) {
          if (Math.abs(timestamps[i] - markT) < Math.abs(timestamps[idx] - markT)) idx = i;
        }
        const mx = xs[idx];
        const my = ys[idx];
        const col = markLane === "dorsal" ? TOK.ink : TOK.accent2;
        ctx.globalAlpha = a;
        // A hollow ring, not a filled dot: the pen dots are filled, and this has to read as
        // an annotation on the finished chart rather than a leftover from the draw.
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        if (markLabel) {
          ctx.font = `11.5px ${TOK.fontFamily}`;
          ctx.textBaseline = "middle";
          // Trailing side by default. A marked peak is a peak, so the curve climbs INTO the
          // ring from the left and falls away to the right — putting the label ahead of the
          // ring lays it straight along the line it is annotating, which is what the first
          // version did and what the hook caption used to do inside the plot rect. Behind the
          // ring the curve has already left that height, so the space is clear. Flips forward
          // only when there is not room to the left.
          const w = ctx.measureText(markLabel).width;
          const back = mx - 9 - w >= x0 + 2;
          ctx.textAlign = back ? "right" : "left";
          const lx = mx + (back ? -9 : 9);
          // Paper halo under the type. The band, the grid and two curves all pass through this
          // area on some ad; a 3px stroke in the surface colour keeps the label readable over
          // any of them without moving it somewhere it no longer points at anything.
          ctx.lineWidth = 3;
          ctx.strokeStyle = TOK.paper;
          ctx.strokeText(markLabel, lx, my);
          // The RING stays in the lane colour, because that is what ties it to the curve it
          // sits on; the TYPE does not. §02 marks the ventral peak, and accent-2 (#5f8b99) is
          // 3.72:1 on paper — below WCAG AA for normal text, at 11.5px, on the one label the
          // narration points at out loud ("spikes at 0:02"). The halo above rescues it from the
          // band and the grid passing underneath, but a halo cannot add contrast.
          ctx.fillStyle = TOK.ink;
          ctx.fillText(markLabel, lx, my);
          ctx.textAlign = "left";
        }
        ctx.globalAlpha = 1;
      }
    }

    // brand-mention ticks along the baseline
    ctx.textAlign = "center";
    for (const m of brandMentions) {
      const mx = xAt(m.t);
      ctx.fillStyle = m.source === "screen" ? TOK.accent : TOK.ink;
      ctx.beginPath();
      ctx.arc(mx, y1 + 8, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // playhead (live player only)
    if (playhead != null && p >= 1) {
      const px = xAt(Math.max(0, Math.min(span, playhead)));
      ctx.strokeStyle = TOK.ink;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, y0);
      ctx.lineTo(px, y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // dot ON the dorsal curve — evaluated with the SAME Catmull-Rom the line is drawn
      // with, at the exact playhead time, so it tracks the line cleanly (no floating).
      const n = yd.length;
      // Map playhead time → fractional sample index by walking the ACTUAL timestamps,
      // rather than `((playhead - timestamps[0]) / span) * (n - 1)`. That old form divides
      // by `span` (the video duration) and so assumes the samples are spread uniformly
      // across the whole clip starting at t=0. The curve's own x positions come from
      // xAt(timestamps[i]), so whenever the trace starts late or ends before the video does
      // — which is the normal case, the sampler stops at the last whole second — the two
      // disagreed and the dot rode above or below the line it is supposed to sit on.
      const tp = Math.max(0, Math.min(span, playhead));
      let idxF = 0;
      if (n > 1) {
        let hi = 1;
        while (hi < n && timestamps[hi] < tp) hi++;
        if (hi >= n) {
          idxF = n - 1;
        } else {
          const lo = hi - 1;
          const dt = timestamps[hi] - timestamps[lo];
          idxF = lo + (dt > 0 ? (tp - timestamps[lo]) / dt : 0);
        }
      }
      const seg = Math.max(0, Math.min(n - 2, Math.floor(idxF)));
      const dotY = crAt(yd, seg, idxF - seg);
      ctx.fillStyle = TOK.ink;
      ctx.beginPath();
      ctx.arc(px, dotY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // x-axis end labels
    ctx.fillStyle = TOK.ink3;
    ctx.font = `11.5px ${TOK.fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("0:00", x0, y1 + 6);
    ctx.textAlign = "right";
    ctx.fillText(fmtT(span), x1, y1 + 6);

    // the new end of a shortened cut. Drawn last so it sits over the curves, and labelled,
    // because an unlabelled rule short of the right edge reads as a rendering bug.
    if (endMarker != null && endMarker > 0 && endMarker < span && p >= 1) {
      const ex = xAt(endMarker);
      ctx.strokeStyle = TOK.ink;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex, y0);
      ctx.lineTo(ex, y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = TOK.ink;
      ctx.textAlign = "right";
      ctx.fillText(fmtT(endMarker), ex - 4, y1 + 6);
    }
  }, [
    dorsal, ventral, comprehension, showComprehension, timestamps, duration, hookSeconds, weakSpots, brandMentions,
    p, animate, playhead, height, showVentral, showHook, ghost, endMarker,
    markT, markLane, markLabel,
    // canvasW is not read in the body — clientWidth is. It is here so a resize re-runs
    // the draw; removing it silently reintroduces the stale-width bug.
    canvasW,
  ]);

  return (
    <div ref={hostRef}>
      <canvas
        ref={ref}
        role="img"
        aria-label={`${laneByKey("attention").label} across the ad timeline`}
        className="block w-full rounded-xl border border-line bg-paper"
        style={{ height }}
      />
      {showLegend && (showVentral || showHook) && (
        /* The explained legend, ported from /preflight: a rule in the lane's ACTUAL colour
           and dash, the plain word, the region parenthesised, and a second line saying what
           the lane is for. The old one-row version named the anatomy ("ATTENTION · DORSAL")
           without ever saying what it measured, which is the one thing a reader who is not a
           neuroscientist needs. Sized so the notes sit under their own labels rather than
           wrapping into each other. */
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {LANES.filter((l) =>
            l.key === "attention" ||
            (l.key === "surprise" && showVentral && ventral && ventral.length) ||
            (l.key === "comprehension" && showComprehension && comprehension && comprehension.length)
          ).map((l) => (
            <div key={l.key} className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block w-5 shrink-0"
                  style={{ borderTopWidth: l.width, borderTopStyle: l.border, borderTopColor: tokenVar(l.colorToken) }}
                />
                <span className="text-[12.5px] font-medium text-ink">{l.label}</span>
                <span className="whitespace-nowrap text-[12.5px] text-ink-3">({l.region})</span>
              </div>
              <div className="mt-0.5 pl-7 text-[12.5px] leading-[1.45] text-ink-3">{l.note}</div>
            </div>
          ))}
          {brandMentions.length ? (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                <span className="text-[12.5px] font-medium text-ink">Brand named</span>
              </div>
              <div className="mt-0.5 pl-[26px] text-[12.5px] leading-[1.45] text-ink-3">on screen or out loud</div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
