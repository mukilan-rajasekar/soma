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

function smoothPath(
  ctx: CanvasRenderingContext2D,
  xs: number[],
  ys: number[],
  upto: number,
) {
  if (xs.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(xs[0], ys[0]);
  const n = Math.max(1, Math.floor(upto * (xs.length - 1)));
  for (let i = 1; i <= n; i++) {
    const xc = (xs[i - 1] + xs[i]) / 2;
    const yc = (ys[i - 1] + ys[i]) / 2;
    ctx.quadraticCurveTo(xs[i - 1], ys[i - 1], xc, yc);
  }
  // partial last segment for a smooth leading edge
  const frac = upto * (xs.length - 1) - (n - 0);
  if (n < xs.length - 1 && frac > 0) {
    const i = n + 1;
    const x = xs[i - 1] + (xs[i] - xs[i - 1]) * frac;
    const y = ys[i - 1] + (ys[i] - ys[i - 1]) * frac;
    ctx.lineTo(x, y);
  } else {
    ctx.lineTo(xs[n], ys[n]);
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

    // ventral (surprise) — dashed slate, drawn first so dorsal sits on top
    if (showVentral && ventral && ventral.length) {
      const yv = ventral.map((v) => yAt(v));
      ctx.strokeStyle = TOK.accent2;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.lineJoin = "round";
      smoothPath(ctx, xs, yv, progress);
      ctx.setLineDash([]);
    }

    // dorsal (attention) — solid ink
    const yd = dorsal.map((v) => yAt(v));
    ctx.strokeStyle = TOK.ink;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    smoothPath(ctx, xs, yd, progress);

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
      // dot on the dorsal curve
      const idx = Math.max(0, Math.min(dorsal.length - 1, Math.round((playhead / span) * (dorsal.length - 1))));
      ctx.fillStyle = TOK.ink;
      ctx.beginPath();
      ctx.arc(px, yAt(dorsal[idx]), 3.5, 0, Math.PI * 2);
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
  }, [
    dorsal, ventral, timestamps, duration, hookSeconds, weakSpots, brandMentions,
    progress, playhead, height, showVentral, showHook,
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
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-ink-3">
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
