// Pure Canvas-2D drawing functions for the /demo lanes, ported verbatim from the old
// demo/app.js. The math/geometry/animation are UNCHANGED — the only thing this file
// does differently from the dark "instrument" original is COLOUR: every lane now paints
// on the SOMA light editorial surface (white/#fafafa plots, ink/slate lines, hairline
// grids), resolved from the design tokens in globals.css. `duration` and the precomputed
// `ArcStats` are passed in explicitly (the React player owns them in refs). Each function
// is a pure renderer: give it a canvas + arc + time and it paints one frame.

import type { Arc } from "./types/arc";
import { clamp01, valAt, fmt, type ArcStats, type Stat } from "./arc";

export const PADL = 30; // left gutter holds the y-axis tick labels
export const PADR = 12;

type Ctx = CanvasRenderingContext2D;
type YTick = { v: number; label: string };

// ── SOMA palette, resolved once from the CSS tokens in globals.css ────────────────
// These renderers run only inside the browser rAF loop (never during SSR), so on first
// paint we read the design tokens off :root and cache them. Canvas 2D can't consume
// var() directly — this is the resolve-once pattern the design system prescribes. The
// fallbacks mirror the @theme values, so a paint before styles resolve is still on
// palette.
export type Palette = {
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  fill: string;
  paper: string;
  accent: string;
  accent2: string;
  error: string;
};

let _pal: Palette | null = null;

export function pal(): Palette {
  if (_pal) return _pal;
  const cs =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement)
      : null;
  const v = (name: string, fallback: string) =>
    cs?.getPropertyValue(name).trim() || fallback;
  _pal = {
    ink: v("--color-ink", "#0a0a0a"),
    ink2: v("--color-ink-2", "#4a4a4a"),
    ink3: v("--color-ink-3", "#8a8a8a"),
    line: v("--color-line", "#e2e2e2"),
    line2: v("--color-line-2", "#d8d8d8"),
    fill: v("--color-fill", "#fafafa"),
    paper: v("--color-paper", "#ffffff"),
    accent: v("--color-accent", "#3f6f7a"),
    accent2: v("--color-accent-2", "#5f8b99"),
    error: v("--color-error", "#b42318"),
  };
  return _pal;
}

// token hex (#rrggbb) → rgba() string at alpha `a`, for translucent canvas fills/bands.
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Retina sizing: match the backing store to the displayed CSS box × devicePixelRatio and
// scale the context so all drawing happens in CSS pixels — crisp lines/text on hi-dpi
// screens (the fixed 720×150 backing used to upscale and look grainy). Returns the
// CSS-pixel W/H that the draw functions use as their coordinate space.
function hidpi(c: HTMLCanvasElement): {
  x: CanvasRenderingContext2D | null;
  W: number;
  H: number;
} {
  const x = c.getContext("2d");
  const dpr =
    typeof window !== "undefined"
      ? Math.min(3, Math.max(1, window.devicePixelRatio || 1))
      : 1;
  const W = Math.round(c.clientWidth || c.width);
  const H = Math.round(c.clientHeight || c.height);
  const bw = Math.round(W * dpr);
  const bh = Math.round(H * dpr);
  if (c.width !== bw) c.width = bw;
  if (c.height !== bh) c.height = bh;
  if (x) x.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { x, W, H };
}

// Horizontal position of time `t` (seconds) on a lane canvas (CSS pixels).
export function xAt(c: HTMLCanvasElement, t: number, duration: number): number {
  const W = c.clientWidth || c.width;
  return PADL + (duration ? t / duration : 0) * (W - PADL - PADR);
}

// Evenly-spaced time gridlines across the clip (0..duration).
function timeTicks(duration: number): number[] {
  if (!duration) return [];
  const n = 4;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push((duration * i) / n);
  return out;
}

// Hairline editorial grid: horizontal y-gridlines + tick labels, vertical time
// gridlines + time labels — #e2e2e2 hairlines, ink-3 labels, on white.
export function drawGrid(
  x: Ctx,
  c: HTMLCanvasElement,
  W: number,
  top: number,
  bot: number,
  yTicks: YTick[],
  Yfn: (v: number) => number,
  duration: number,
): void {
  const P = pal();
  x.save();
  x.font = "9px system-ui, -apple-system, Helvetica, Arial, sans-serif";
  x.lineWidth = 1;
  x.textBaseline = "middle";
  x.textAlign = "right";
  yTicks.forEach((tk) => {
    const py = Yfn(tk.v);
    x.strokeStyle = P.line;
    x.beginPath();
    x.moveTo(PADL, py);
    x.lineTo(W - PADR, py);
    x.stroke();
    x.fillStyle = P.ink3;
    x.fillText(tk.label, PADL - 6, py);
  });
  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  timeTicks(duration).forEach((tt) => {
    const px = xAt(c, tt, duration);
    x.strokeStyle = rgba(P.line, 0.6);
    x.beginPath();
    x.moveTo(px, top);
    x.lineTo(px, bot);
    x.stroke();
    x.fillStyle = P.ink3;
    x.fillText(fmt(tt), px, bot + 12);
  });
  x.restore();
}

// Live NOW / PEAK / mean readout, top-right of a lane.
export function drawStats(x: Ctx, W: number, cur: number, s: Stat | null): void {
  if (!s) return;
  x.save();
  x.font = "9px system-ui, -apple-system, Helvetica, Arial, sans-serif";
  x.textAlign = "right";
  x.textBaseline = "top";
  x.fillStyle = pal().ink2;
  x.fillText(
    "NOW " + cur.toFixed(2) + "   PK " + s.max.toFixed(2) + "   μ " + s.mean.toFixed(2),
    W - PADR,
    2,
  );
  x.restore();
}

// The shared vertical playhead.
export function playhead(
  x: Ctx,
  c: HTMLCanvasElement,
  t: number,
  top: number,
  bot: number,
  duration: number,
): void {
  const px = xAt(c, t, duration);
  x.beginPath();
  x.moveTo(px, top - 4);
  x.lineTo(px, bot);
  x.strokeStyle = pal().ink;
  x.lineWidth = 1.4;
  x.stroke();
}

// ---- attention lane -------------------------------------------------------------
// area fill + weak-spot warning bands + demoted dashed baseline + solid slate accent
// line + peak marker + playhead + current-sample dot + NOW/PK/μ overlay. Attention is
// THE single data accent (slate/teal); everything else is ink/grey.
export function drawAttention(
  c: HTMLCanvasElement,
  arc: Arc,
  t: number,
  duration: number,
  stats: ArcStats | null,
): void {
  const { x, W, H } = hidpi(c);
  if (!x) return;
  const P = pal();
  const top = 14;
  const bot = H - 22;
  const xs = arc.timestamps;
  const ys = arc.activation;
  x.clearRect(0, 0, W, H);
  const Y = (v: number) => bot - clamp01(v) * (bot - top);
  drawGrid(
    x,
    c,
    W,
    top,
    bot,
    [
      { v: 1, label: "1.0" },
      { v: 0.5, label: "0.5" },
      { v: 0, label: "0" },
    ],
    Y,
    duration,
  );
  // weak-spot warning bands — a faint error tint (matches the red weak-spot callout)
  (arc.weak_spots || []).forEach((w) => {
    x.fillStyle = rgba(P.error, 0.06);
    x.fillRect(
      xAt(c, w.start, duration),
      top,
      xAt(c, w.end, duration) - xAt(c, w.start, duration),
      bot - top,
    );
  });
  // area fill under the curve
  x.beginPath();
  xs.forEach((tt, i) => {
    const px = xAt(c, tt, duration);
    const py = Y(ys[i]);
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  });
  x.lineTo(xAt(c, xs[xs.length - 1], duration), bot);
  x.lineTo(xAt(c, xs[0], duration), bot);
  x.closePath();
  x.fillStyle = rgba(P.accent, 0.06);
  x.fill();
  // demoted arithmetic baseline (faint dashed) — present only once a trained-head arc
  // replaced it as the headline, so the honest before/after is visible not hidden.
  const bl = arc._baseline;
  if (bl && bl.length === xs.length) {
    x.save();
    x.setLineDash([5, 4]);
    x.lineWidth = 1.1;
    x.strokeStyle = rgba(P.ink3, 0.8);
    x.beginPath();
    xs.forEach((tt, i) => {
      const px = xAt(c, tt, duration);
      const py = Y(clamp01(bl[i]));
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    });
    x.stroke();
    x.restore();
  }
  // solid slate accent line (no gradient, no glow — clarity over drama)
  x.save();
  x.beginPath();
  x.lineWidth = 2.1;
  x.strokeStyle = P.accent;
  xs.forEach((tt, i) => {
    const px = xAt(c, tt, duration);
    const py = Y(ys[i]);
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  });
  x.stroke();
  x.restore();
  // peak marker (drops a stem to the highest predicted sample)
  const s = stats?.att ?? null;
  if (s) {
    const pkx = xAt(c, xs[s.argmax], duration);
    const pky = Y(s.max);
    x.strokeStyle = rgba(P.accent, 0.35);
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(pkx, top);
    x.lineTo(pkx, pky);
    x.stroke();
    x.fillStyle = P.accent;
    x.beginPath();
    x.arc(pkx, pky, 2.3, 0, 7);
    x.fill();
  }
  // playhead + current-sample dot + live metrics
  playhead(x, c, t, top, bot, duration);
  const cur = clamp01(valAt(ys, t, duration));
  x.fillStyle = P.accent;
  x.beginPath();
  x.arc(xAt(c, t, duration), Y(cur), 3, 0, 7);
  x.fill();
  drawStats(x, W, cur, s);
}

// ---- message / language-load lane ------------------------------------------------
// Same 0..1 shape as attention, rendered in neutral ink (the slate accent is reserved
// for the attention lane). Reads arc.message; a no-op when it is absent. No emotion.
export function drawMessage(
  c: HTMLCanvasElement,
  arc: Arc,
  t: number,
  duration: number,
): void {
  const seq = arc.message;
  if (!seq || !seq.length) return;
  const { x, W, H } = hidpi(c);
  if (!x) return;
  const P = pal();
  const top = 14;
  const bot = H - 22;
  const xs = arc.timestamps;
  x.clearRect(0, 0, W, H);
  const Y = (v: number) => bot - clamp01(v) * (bot - top);
  drawGrid(
    x,
    c,
    W,
    top,
    bot,
    [
      { v: 1, label: "1.0" },
      { v: 0.5, label: "0.5" },
      { v: 0, label: "0" },
    ],
    Y,
    duration,
  );
  // faint neutral area fill under the curve
  x.beginPath();
  xs.forEach((tt, i) => {
    const px = xAt(c, tt, duration);
    const py = Y(seq[i]);
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  });
  x.lineTo(xAt(c, xs[xs.length - 1], duration), bot);
  x.lineTo(xAt(c, xs[0], duration), bot);
  x.closePath();
  x.fillStyle = rgba(P.ink2, 0.05);
  x.fill();
  // neutral ink-2 line
  x.save();
  x.beginPath();
  x.lineWidth = 1.8;
  x.strokeStyle = P.ink2;
  xs.forEach((tt, i) => {
    const px = xAt(c, tt, duration);
    const py = Y(seq[i]);
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  });
  x.stroke();
  x.restore();
  // playhead + current-sample dot
  playhead(x, c, t, top, bot, duration);
  x.fillStyle = P.ink2;
  x.beginPath();
  x.arc(xAt(c, t, duration), Y(clamp01(valAt(seq, t, duration))), 3, 0, 7);
  x.fill();
}

// ---- signed lanes (valence & arousal) -------------------------------------------
// mode 'center' => baseline mid (valence, ~[-1,1]); 'bottom' => baseline bottom
// (arousal, [0,1]). `stroke` is the solid lane colour (ink for valence, ink-2 for
// arousal); the uncertainty band is always a light-grey hairline fill.
export function drawSigned(
  c: HTMLCanvasElement,
  seq: number[] | undefined,
  lo: number[] | undefined,
  hi: number[] | undefined,
  t: number,
  stroke: string,
  mode: "center" | "bottom",
  stat: Stat | null,
  arc: Arc,
  duration: number,
): void {
  const x = c.getContext("2d");
  if (!x) return;
  const P = pal();
  const W = c.width;
  const H = c.height;
  const top = 14;
  const bot = H - 20;
  x.clearRect(0, 0, W, H);
  if (!seq) return; // no affect track on this clip → leave the lane clean
  const base = mode === "center" ? (top + bot) / 2 : bot;
  const scale = mode === "center" ? (bot - top) / 2 : bot - top;
  const Y = (v: number) => base - v * scale;
  const yTicks: YTick[] =
    mode === "center"
      ? [
          { v: 1, label: "+1" },
          { v: 0, label: "0" },
          { v: -1, label: "−1" },
        ]
      : [
          { v: 1, label: "1.0" },
          { v: 0.5, label: "0.5" },
          { v: 0, label: "0" },
        ];
  drawGrid(x, c, W, top, bot, yTicks, Y, duration);
  // emphasized zero/baseline
  x.strokeStyle = rgba(P.ink, 0.3);
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(PADL, base);
  x.lineTo(W - PADR, base);
  x.stroke();
  const ts = arc.timestamps;
  // uncertainty band — light-grey, never a coloured fill
  if (lo && hi) {
    x.beginPath();
    ts.forEach((tt, i) => {
      const px = xAt(c, tt, duration);
      const py = Y(hi[i]);
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    });
    for (let i = ts.length - 1; i >= 0; i--) x.lineTo(xAt(c, ts[i], duration), Y(lo[i]));
    x.closePath();
    x.fillStyle = rgba(P.line, 0.6);
    x.fill();
  }
  // line
  x.beginPath();
  x.lineWidth = 2.1;
  x.strokeStyle = stroke;
  ts.forEach((tt, i) => {
    const px = xAt(c, tt, duration);
    const py = Y(seq[i]);
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  });
  x.stroke();
  // playhead + current-sample dot + live metrics
  playhead(x, c, t, top, bot, duration);
  const cur = valAt(seq, t, duration);
  x.fillStyle = stroke;
  x.beginPath();
  x.arc(xAt(c, t, duration), Y(cur), 3, 0, 7);
  x.fill();
  drawStats(x, W, cur, stat);
}

// ---- coarse discrete-state distribution -----------------------------------------
// A stacked cumulative probability band over time — a whole distribution, never a
// single confident named-emotion %. Self-guards: draws nothing if coarse_states is
// absent/malformed. Monochrome SLATE ramp (no rainbow) sized for a light surface:
// darker bands read as more probability mass, lighter toward the top of the stack.
export function coarseColor(i: number, n: number): string {
  const l = 44 + (i / Math.max(1, n - 1)) * 30; // 44% → 74% lightness, slate hue
  return `hsl(196 22% ${l}%)`;
}

export function drawCoarse(
  c: HTMLCanvasElement,
  arc: Arc,
  t: number,
  duration: number,
): void {
  const cs = arc.affect?.coarse_states;
  const ok =
    !!cs &&
    Array.isArray(cs.labels) &&
    cs.labels.length > 0 &&
    Array.isArray(cs.probs) &&
    cs.probs.length > 0 &&
    Array.isArray(cs.probs[0]);
  if (!ok || !cs) return;
  const x = c.getContext("2d");
  if (!x) return;
  const W = c.width;
  const H = c.height;
  const top = 6;
  const bot = H - 6;
  x.clearRect(0, 0, W, H);
  const labels = cs.labels;
  const probs = cs.probs;
  const n = probs.length;
  const nb = labels.length;
  const useTs = !!arc.timestamps && probs.length === arc.timestamps.length;
  const pxAt = (i: number) =>
    useTs ? xAt(c, arc.timestamps[i], duration) : 8 + (i / Math.max(1, n - 1)) * (W - 16);
  const Y = (v: number) => bot - clamp01(v) * (bot - top);
  // stacked bands: band b spans cumulative[b-1] .. cumulative[b]
  for (let b = 0; b < nb; b++) {
    x.beginPath();
    for (let i = 0; i < n; i++) {
      let cum = 0;
      for (let k = 0; k <= b; k++) cum += clamp01((probs[i] || [])[k] || 0);
      const px = pxAt(i);
      const py = Y(cum);
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    }
    for (let i = n - 1; i >= 0; i--) {
      let cum = 0;
      for (let k = 0; k < b; k++) cum += clamp01((probs[i] || [])[k] || 0);
      x.lineTo(pxAt(i), Y(cum));
    }
    x.closePath();
    x.fillStyle = coarseColor(b, nb);
    x.globalAlpha = 0.82;
    x.fill();
    x.globalAlpha = 1;
  }
  // playhead
  const phx = useTs ? xAt(c, t, duration) : 8 + (duration ? t / duration : 0) * (W - 16);
  x.beginPath();
  x.moveTo(phx, top - 2);
  x.lineTo(phx, bot);
  x.strokeStyle = pal().ink;
  x.lineWidth = 1.4;
  x.stroke();
}
