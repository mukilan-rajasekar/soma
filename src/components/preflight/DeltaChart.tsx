"use client";

// The one chart on /preflight. It serves BOTH the single-ad player (one curve, a
// playhead, weak-spot bands) and the five-ad overlay (N curves, no playhead), because
// series style is DATA — colour/width/dash/alpha/z come in per series — rather than a
// pile of boolean props. That is what collapses /demo's ArcPlot + VariantOverlay, which
// are two copies of the same canvas maths, into one component.
//
// It computes nothing about the data. The y-domain, x-domain and every value arrive
// precomputed from demo/process_batch.py; this only plots what it is given.
//
// PERF CONTRACT FOR CALLERS: memoize `series`, `yDomain`, `xDomain` and `bands`. The
// static layer (grid, bands, curves, labels) is cached in an offscreen canvas and only
// regenerated when those change; a new array identity every render defeats it.

import { useEffect, useMemo, useRef, useState } from "react";

import { clamp, niceTicks, niceTimeStep, sampleAt } from "./series";
import { hexToRgba, readVizTokens, type ColorToken, type VizTokens } from "./tokens";
import { fmtDelta, fmtT } from "./types";

export type ChartSeries = {
  id: string;
  label: string;
  timestamps: number[];
  values: number[];
  /** A design-token key, resolved here from the live CSS custom properties. Callers
   *  pass intent, not hex, so no panel has to touch the DOM to build a series. */
  colorToken: ColorToken;
  width?: number;
  dash?: number[];
  alpha?: number;
  /** paint order, ascending */
  z?: number;
  /** drawn at the curve's right terminus — the non-colour redundant encoding */
  endLabel?: string;
};

export type ChartBand = { start: number; end: number };

type Props = {
  series: ChartSeries[];
  yDomain: [number, number];
  xDomain: [number, number];
  bands?: ChartBand[];
  hookSeconds?: number | null;
  playhead?: number | null;
  playheadSeriesId?: string;
  /** 0..1 fraction of each curve drawn, for the reveal animation */
  progress?: number;
  height?: number;
  unit: string;
  zeroLabel?: string | null;
  ariaLabel: string;
  /** Makes the chart a scrubber: drag anywhere on the plot to seek. Receives a time in
   *  xDomain units. Omit and the canvas stays a static image, as the overlay wants. */
  onScrub?: (t: number) => void;
};

const PADL = 46; // signed decimals need a wider gutter than ArcPlot's 34
const PADR = 26; // room for the endLabel rank badges
const PADT = 18;
const PADB = 28;

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
  const frac = upto * (xs.length - 1) - n;
  if (n < xs.length - 1 && frac > 0) {
    const i = n + 1;
    ctx.lineTo(
      xs[i - 1] + (xs[i] - xs[i - 1]) * frac,
      ys[i - 1] + (ys[i] - ys[i - 1]) * frac,
    );
  } else {
    ctx.lineTo(xs[n], ys[n]);
  }
  ctx.stroke();
}

export default function DeltaChart({
  series,
  yDomain,
  xDomain,
  bands,
  hookSeconds = null,
  playhead = null,
  playheadSeriesId,
  progress = 1,
  height = 200,
  unit,
  zeroLabel = "BASELINE",
  ariaLabel,
  onScrub,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubbing = useRef(false);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const tokRef = useRef<VizTokens | null>(null);
  const [w, setW] = useState(0);
  const [dpr, setDpr] = useState(1);
  // Identity tuple of everything the static layer depends on. Compared by reference each
  // pass so the expensive layer is rebuilt only when it genuinely changed — which is why
  // callers must memoize the array props (see the perf contract above).
  const staticKeyRef = useRef<unknown[]>([]);

  // Width from a ResizeObserver. ArcPlot and VariantOverlay both read clientWidth once
  // in an effect keyed on data only, so resizing the window leaves a stretched, blurry
  // canvas until the data happens to change.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setW(Math.round(el.clientWidth));
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? 0;
      setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track device pixel ratio so dragging the window to a different-density display
  // re-renders sharp instead of staying soft.
  useEffect(() => {
    const read = () => setDpr(Math.min(2, window.devicePixelRatio || 1));
    read();
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener?.("change", read);
    return () => mq.removeEventListener?.("change", read);
  }, []);

  const geom = useMemo(() => {
    const x0 = PADL;
    const x1 = Math.max(PADL + 10, w - PADR);
    const y0 = PADT;
    const y1 = height - PADB;
    const [t0, t1] = xDomain;
    const [lo, hi] = yDomain;
    const tSpan = Math.max(1e-6, t1 - t0);
    const vSpan = Math.max(1e-9, hi - lo);
    return {
      x0, x1, y0, y1, lo, hi, t0,
      xAt: (t: number) => x0 + ((t - t0) / tSpan) * (x1 - x0),
      yAt: (v: number) => y1 - ((v - lo) / vSpan) * (y1 - y0),
    };
  }, [w, height, xDomain, yDomain]);

  // ── one effect: rebuild the static layer only if it changed, then blit + playhead ──
  // Per-frame work while playing is drawImage + one line + one arc, which is what makes
  // a 60 Hz playhead free even with five curves on screen.
  useEffect(() => {
    if (w <= 0) return; // ResizeObserver can fire at 0 during a reveal transition
    const c = canvasRef.current;
    if (!c) return;
    const vis = c.getContext("2d");
    if (!vis) return;
    if (!tokRef.current) tokRef.current = readVizTokens();
    const tok = tokRef.current;

    const key = [w, dpr, height, geom, series, bands, hookSeconds, progress, zeroLabel, xDomain];
    const stale =
      staticKeyRef.current.length !== key.length
      || key.some((v, i) => v !== staticKeyRef.current[i]);
    if (stale) {
      staticKeyRef.current = key;
      drawStatic(tok);
    }

    if (c.width !== w * dpr || c.height !== height * dpr) {
      c.width = w * dpr;
      c.height = height * dpr;
    }
    vis.setTransform(1, 0, 0, 1, 0, 0);
    vis.clearRect(0, 0, c.width, c.height);
    if (staticRef.current) vis.drawImage(staticRef.current, 0, 0);
    vis.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (playhead != null && progress >= 1) {
      const { x0: px0, x1: px1, y0: py0, y1: py1, xAt: pxAt, yAt: pyAt } = geom;
      const t = clamp(playhead, xDomain[0], xDomain[1]);
      const px = clamp(pxAt(t), px0, px1);

      vis.strokeStyle = tok.ink;
      vis.globalAlpha = 0.5;
      vis.lineWidth = 1;
      vis.beginPath();
      vis.moveTo(px, py0);
      vis.lineTo(px, py1);
      vis.stroke();
      vis.globalAlpha = 1;

      const target = playheadSeriesId
        ? series.find((s) => s.id === playheadSeriesId)
        : series[0];
      if (target) {
        const v = sampleAt(target.timestamps, target.values, t);
        vis.fillStyle = tok.ink;
        vis.beginPath();
        vis.arc(px, pyAt(v), 3.5, 0, Math.PI * 2);
        vis.fill();
      }
    }

    function drawStatic(tok: VizTokens) {
    let off = staticRef.current;
    if (!off) {
      off = document.createElement("canvas");
      staticRef.current = off;
    }
    if (off.width !== w * dpr || off.height !== height * dpr) {
      off.width = w * dpr;
      off.height = height * dpr;
    }
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);

    const { x0, x1, y0, y1, lo, hi, xAt, yAt } = geom;
    const { ticks, step } = niceTicks(lo, hi, 4);

    // grid — every tick a hairline, except zero which is solid and stronger so it
    // reads as the reference rather than as one gridline among several
    ctx.lineWidth = 1;
    ctx.font = `11px ${tok.fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const v of ticks) {
      const y = yAt(v);
      const isZero = Math.abs(v) < step * 1e-6;
      ctx.strokeStyle = isZero ? tok.line2 : tok.line;
      ctx.globalAlpha = isZero ? 1 : 0.55;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = tok.ink3;
      ctx.fillText(fmtDelta(v, step), x0 - 6, y);
    }

    if (zeroLabel && lo <= 0 && hi >= 0) {
      ctx.fillStyle = tok.ink3;
      ctx.font = `10.5px ${tok.fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(zeroLabel, x0 + 5, yAt(0) - 4);
    }

    // hook zone
    if (hookSeconds && hookSeconds > 0) {
      const hx = xAt(hookSeconds);
      ctx.fillStyle = hexToRgba(tok.accent, 0.05);
      ctx.fillRect(x0, y0, Math.max(0, hx - x0), y1 - y0);
      ctx.strokeStyle = tok.accent;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, y0);
      ctx.lineTo(hx, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = tok.accent;
      ctx.font = `10.5px ${tok.fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`HOOK · 0–${hookSeconds}s`, x0 + 5, y0 + 2);
    }

    // weak-spot bands
    for (const b of bands ?? []) {
      const bx0 = xAt(b.start);
      const bx1 = xAt(b.end);
      ctx.fillStyle = hexToRgba(tok.neg, 0.07);
      ctx.fillRect(bx0, y0, bx1 - bx0, y1 - y0);
      ctx.strokeStyle = hexToRgba(tok.neg, 0.35);
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(bx0, y0);
      ctx.lineTo(bx0, y1);
      ctx.moveTo(bx1, y0);
      ctx.lineTo(bx1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // curves, in z order
    const ordered = [...series].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    for (const s of ordered) {
      const n = Math.min(s.timestamps.length, s.values.length);
      if (n < 2) continue;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < n; i++) {
        xs.push(xAt(s.timestamps[i]));
        ys.push(yAt(s.values[i]));
      }
      const color = tok[s.colorToken];
      ctx.strokeStyle = color;
      ctx.lineWidth = s.width ?? 1;
      ctx.globalAlpha = s.alpha ?? 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (s.dash?.length) ctx.setLineDash(s.dash);
      smoothPath(ctx, xs, ys, clamp(progress, 0, 1));
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // rank badge at the right terminus — redundant, non-colour encoding so the
      // chart survives deuteranopia (best and worst are both solid 2px, so weight
      // alone can't separate them)
      if (s.endLabel && progress >= 1) {
        // INK, not the series colour. This badge exists to be the non-colour encoding — the
        // comment above says so — and it was being painted in the very colour it is supposed to
        // be redundant to. roleStyle gives every unselected middle-rank series colorToken
        // "line2" (#d8d8d8, 1.4:1 on paper), so three of the five rank numerals were drawn in a
        // hairline grey: invisible before compression even starts, and the one thing a viewer
        // needs in order to map a curve to a row in the list beside it. The terminus position
        // already says which curve the badge belongs to; the numeral only has to be readable.
        ctx.fillStyle = tok.ink;
        ctx.font = `600 11px ${tok.fontFamily}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(s.endLabel, Math.min(xs[n - 1] + 5, x1 + 4), ys[n - 1]);
      }
    }

    // x axis
    ctx.strokeStyle = tok.line;
    ctx.fillStyle = tok.ink3;
    ctx.font = `11px ${tok.fontFamily}`;
    ctx.textBaseline = "top";
    const tStep = niceTimeStep(xDomain[1] - xDomain[0]);
    for (let t = xDomain[0]; t <= xDomain[1] + 1e-6; t += tStep) {
      const x = xAt(t);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y1 + 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
    ctx.fillText(fmtT(xDomain[0]), x0, y1 + 7);
    ctx.textAlign = "right";
    ctx.fillText(fmtT(xDomain[1]), x1, y1 + 7);
    }
  }, [
    w, dpr, height, geom, series, bands, hookSeconds, progress, zeroLabel, xDomain,
    playhead, playheadSeriesId,
  ]);

  // Inverse of geom.xAt. The canvas is laid out at `w` CSS px but its backing store is
  // w*dpr, and a reveal transition can leave rect.width mid-animation — so rescale by the
  // live rect rather than trusting the two to agree.
  function timeAtClientX(clientX: number): number | null {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const px = (clientX - rect.left) * (w / rect.width);
    const frac = clamp((px - geom.x0) / Math.max(1e-6, geom.x1 - geom.x0), 0, 1);
    return xDomain[0] + frac * (xDomain[1] - xDomain[0]);
  }

  function beginScrub(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!onScrub) return;
    const t = timeAtClientX(e.clientX);
    if (t == null) return;
    scrubbing.current = true;
    // Capture so a drag that leaves the canvas — or the window — keeps seeking and still
    // gets its pointerup, instead of sticking in a scrubbing state.
    e.currentTarget.setPointerCapture(e.pointerId);
    onScrub(t);
  }

  function moveScrub(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!onScrub || !scrubbing.current) return;
    const t = timeAtClientX(e.clientX);
    if (t != null) onScrub(t);
  }

  function endScrub(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function keyScrub(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!onScrub || playhead == null) return;
    const step = e.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = playhead + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = playhead - step;
    else if (e.key === "Home") next = xDomain[0];
    else if (e.key === "End") next = xDomain[1];
    if (next == null) return;
    e.preventDefault();
    onScrub(clamp(next, xDomain[0], xDomain[1]));
  }

  return (
    <div>
      <div className="mb-1.5 text-[12px] uppercase tracking-[0.07em] text-ink-3">{unit}</div>
      <div ref={wrapRef} className="w-full">
        <canvas
          ref={canvasRef}
          role={onScrub ? "slider" : "img"}
          aria-label={ariaLabel}
          aria-valuemin={onScrub ? Math.round(xDomain[0]) : undefined}
          aria-valuemax={onScrub ? Math.round(xDomain[1]) : undefined}
          aria-valuenow={onScrub && playhead != null ? Math.round(playhead) : undefined}
          aria-valuetext={onScrub && playhead != null ? fmtT(playhead) : undefined}
          tabIndex={onScrub ? 0 : undefined}
          onPointerDown={beginScrub}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onKeyDown={keyScrub}
          className={`block w-full rounded-xl border border-line bg-paper ${
            onScrub ? "cursor-ew-resize touch-none" : ""
          }`}
          style={{ height }}
        />
      </div>
    </div>
  );
}
