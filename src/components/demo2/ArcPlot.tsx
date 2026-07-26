"use client";

// The recurring chart. One <canvas> that draws an attention (dorsal) curve with an
// optional surprise (ventral) overlay, the first-3s hook zone, weak-spot bands, and
// brand-mention ticks. Everything obeys the data-viz half of the design system:
//   surface = paper, grid = --color-line hairlines, dorsal = --color-ink solid 2px,
//   ventral = --color-accent-2 dashed (A/B differ by colour + dash, not hue alone),
//   NO glow / neon / shadow.
//
// `progress` (0..1) is the fraction of the curve drawn — the scroll sections animate it
// 0→1 on reveal so the arc draws itself; the live player pins it to 1 and passes a
// `playhead` time instead. Nothing here computes numbers; it only plots what it's given.

import { useEffect, useRef } from "react";
import { fmtT, type BrandMention, type WeakSpot } from "./types";

type Props = {
  dorsal: number[];
  ventral?: number[];
  timestamps: number[];
  duration: number;
  hookSeconds?: number;
  weakSpots?: WeakSpot[];
  brandMentions?: BrandMention[];
  progress?: number; // fraction of the curve to draw (0..1)
  playhead?: number | null; // seconds; a vertical rule + dot on the dorsal curve
  height?: number;
  showVentral?: boolean;
  showHook?: boolean;
  labelDorsal?: string;
  labelVentral?: string;
  // A second, faint dorsal curve drawn behind the main one on the SAME time axis — the
  // "before" of an edit. §08 passes the unspliced arc here and the spliced arc as `dorsal`,
  // so the change is a single picture rather than two charts side by side.
  ghost?: { dorsal: number[]; timestamps: number[] } | null;
  // A hairline + label at a time inside the span. §08 marks where the shortened cut now
  // ends, which is what makes the curve stopping short of the right edge read as "the ad
  // got shorter" rather than as a chart that failed to finish drawing.
  endMarker?: number | null;
};

const TOK = {
  ink: "#0a0a0a",
  ink2: "#4a4a4a",
  ink3: "#727272",
  line: "#e2e2e2",
  line2: "#d8d8d8",
  fill: "#fafafa",
  accent: "#3f6f7a",
  accent2: "#5f8b99",
  error: "#b42318",
};

const PADL = 34;
const PADR = 14;
const PADT = 16;
const PADB = 26;

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

export default function ArcPlot({
  dorsal,
  ventral,
  timestamps,
  duration,
  hookSeconds = 3,
  weakSpots = [],
  brandMentions = [],
  progress = 1,
  playhead = null,
  height = 190,
  showVentral = true,
  showHook = true,
  labelDorsal = "Attention",
  labelVentral = "Surprise",
  ghost = null,
  endMarker = null,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = height;
    if (c.width !== W * dpr || c.height !== H * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const x0 = PADL;
    const x1 = W - PADR;
    const y0 = PADT;
    const y1 = H - PADB;
    const span = duration > 0 ? duration : Math.max(1, timestamps[timestamps.length - 1] || 1);
    const xAt = (t: number) => x0 + (t / span) * (x1 - x0);
    const yAt = (v: number) => y1 - v * (y1 - y0);

    // grid — 4 horizontal hairlines
    ctx.strokeStyle = TOK.line;
    ctx.lineWidth = 1;
    ctx.font = "9px system-ui, sans-serif";
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

    // hook zone — the first `hookSeconds`, a light fill + a boundary rule
    if (showHook && hookSeconds > 0 && hookSeconds < span) {
      const hx = xAt(hookSeconds);
      ctx.fillStyle = "rgba(63,111,122,0.05)";
      ctx.fillRect(x0, y0, hx - x0, y1 - y0);
      ctx.strokeStyle = TOK.accent;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, y0);
      ctx.lineTo(hx, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = TOK.accent;
      ctx.font = "8px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("HOOK · 0–3s", x0 + 5, y0 + 8);
    }

    // weak-spot bands — light error tint behind the curve
    ctx.textAlign = "center";
    for (const w of weakSpots) {
      const wx0 = xAt(w.start);
      const wx1 = xAt(w.end);
      ctx.fillStyle = "rgba(180,35,24,0.07)";
      ctx.fillRect(wx0, y0, wx1 - wx0, y1 - y0);
      ctx.strokeStyle = "rgba(180,35,24,0.35)";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(wx0, y0);
      ctx.lineTo(wx0, y1);
      ctx.moveTo(wx1, y0);
      ctx.lineTo(wx1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const xs = timestamps.map((t) => xAt(t));

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

    // ventral (surprise) — dashed slate, drawn first so dorsal sits on top
    if (showVentral && ventral && ventral.length) {
      const yv = ventral.map((v) => yAt(v));
      ctx.strokeStyle = TOK.accent2;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.lineJoin = "round";
      drawCurve(ctx, xs, yv, progress);
      ctx.setLineDash([]);
    }

    // dorsal (attention) — solid ink
    const yd = dorsal.map((v) => yAt(v));
    ctx.strokeStyle = TOK.ink;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    drawCurve(ctx, xs, yd, progress);

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
    if (playhead != null && progress >= 1) {
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
      const idxF = span > 0 ? Math.max(0, Math.min(n - 1, ((playhead - timestamps[0]) / span) * (n - 1))) : 0;
      const seg = Math.max(0, Math.min(n - 2, Math.floor(idxF)));
      const dotY = crAt(yd, seg, idxF - seg);
      ctx.fillStyle = TOK.ink;
      ctx.beginPath();
      ctx.arc(px, dotY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // x-axis end labels
    ctx.fillStyle = TOK.ink3;
    ctx.font = "9px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("0:00", x0, y1 + 6);
    ctx.textAlign = "right";
    ctx.fillText(fmtT(span), x1, y1 + 6);

    // the new end of a shortened cut. Drawn last so it sits over the curves, and labelled,
    // because an unlabelled rule short of the right edge reads as a rendering bug.
    if (endMarker != null && endMarker > 0 && endMarker < span && progress >= 1) {
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
    dorsal, ventral, timestamps, duration, hookSeconds, weakSpots, brandMentions,
    progress, playhead, height, showVentral, showHook, ghost, endMarker,
  ]);

  return (
    <div>
      <canvas
        ref={ref}
        role="img"
        aria-label={`${labelDorsal} across the ad timeline`}
        className="block w-full rounded-xl border border-line bg-paper"
        style={{ height }}
      />
      {(showVentral || showHook) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] uppercase tracking-[0.06em] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 bg-ink" /> {labelDorsal} · dorsal
          </span>
          {showVentral && ventral && ventral.length ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4" style={{ background: "repeating-linear-gradient(90deg,#5f8b99 0 4px,transparent 4px 7px)" }} />
              {labelVentral} · ventral
            </span>
          ) : null}
          {brandMentions.length ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink" /> brand named
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
