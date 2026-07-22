// Pure Canvas-2D drawing functions for the /demo lanes, ported verbatim from the old
// demo/app.js. The math is unchanged; the only structural change is that `duration`
// and the precomputed `ArcStats` are passed in explicitly instead of being read off
// module-level globals (the React player owns them in refs). Each function is a pure
// renderer: give it a canvas + arc + time and it paints one frame. The instrument
// colours (ice-on-dark grids, #EAF6FA playhead) assume a dark lane surface.

import type { Arc } from "./types/arc";
import { clamp01, valAt, fmt, type ArcStats, type Stat } from "./arc";

export const PADL = 30; // left gutter holds the y-axis tick labels
export const PADR = 12;

type Ctx = CanvasRenderingContext2D;
type YTick = { v: number; label: string };

// Horizontal position of time `t` (seconds) on a lane canvas.
export function xAt(c: HTMLCanvasElement, t: number, duration: number): number {
  return PADL + (duration ? t / duration : 0) * (c.width - PADL - PADR);
}

// Evenly-spaced time gridlines across the clip (0..duration).
function timeTicks(duration: number): number[] {
  if (!duration) return [];
  const n = 4;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push((duration * i) / n);
  return out;
}

// Faint instrument grid: horizontal y-gridlines + tick labels, vertical time
// gridlines + time labels.
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
  x.save();
  x.font = "9px ui-monospace, monospace";
  x.lineWidth = 1;
  x.textBaseline = "middle";
  x.textAlign = "right";
  yTicks.forEach((tk) => {
    const py = Yfn(tk.v);
    x.strokeStyle = "rgba(255,255,255,.055)";
    x.beginPath();
    x.moveTo(PADL, py);
    x.lineTo(W - PADR, py);
    x.stroke();
    x.fillStyle = "rgba(124,124,130,.85)";
    x.fillText(tk.label, PADL - 6, py);
  });
  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  timeTicks(duration).forEach((tt) => {
    const px = xAt(c, tt, duration);
    x.strokeStyle = "rgba(255,255,255,.035)";
    x.beginPath();
    x.moveTo(px, top);
    x.lineTo(px, bot);
    x.stroke();
    x.fillStyle = "rgba(124,124,130,.7)";
    x.fillText(fmt(tt), px, bot + 12);
  });
  x.restore();
}

// Live NOW / PEAK / mean readout, top-right of a lane.
export function drawStats(x: Ctx, W: number, cur: number, s: Stat | null): void {
  if (!s) return;
  x.save();
  x.font = "9px ui-monospace, monospace";
  x.textAlign = "right";
  x.textBaseline = "top";
  x.fillStyle = "rgba(191,224,236,.85)";
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
  x.strokeStyle = "#EAF6FA";
  x.lineWidth = 1.4;
  x.stroke();
}

// ---- attention lane -------------------------------------------------------------
// area fill + weak-spot warning bands + demoted dashed baseline + glowing ice line +
// peak marker + playhead + current-sample dot + NOW/PK/μ overlay.
export function drawAttention(
  c: HTMLCanvasElement,
  arc: Arc,
  t: number,
  duration: number,
  stats: ArcStats | null,
): void {
  const x = c.getContext("2d");
  if (!x) return;
  const W = c.width;
  const H = c.height;
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
  // weak-spot warning bands
  (arc.weak_spots || []).forEach((w) => {
    x.fillStyle = "rgba(255,122,122,0.09)";
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
  x.fillStyle = "rgba(191,224,236,.06)";
  x.fill();
  // demoted arithmetic baseline (faint dashed) — present only once a trained-head arc
  // replaced it as the headline, so the honest before/after is visible not hidden.
  const bl = arc._baseline;
  if (bl && bl.length === xs.length) {
    x.save();
    x.setLineDash([5, 4]);
    x.lineWidth = 1.1;
    x.strokeStyle = "rgba(124,124,130,.55)";
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
  // ice line
  const grad = x.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#8FB3C0");
  grad.addColorStop(0.5, "#EAF6FA");
  grad.addColorStop(1, "#8FB3C0");
  x.save();
  x.beginPath();
  x.lineWidth = 2.1;
  x.strokeStyle = grad;
  x.shadowColor = "rgba(191,224,236,.5)";
  x.shadowBlur = 9;
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
    x.strokeStyle = "rgba(191,224,236,.32)";
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(pkx, top);
    x.lineTo(pkx, pky);
    x.stroke();
    x.fillStyle = "rgba(191,224,236,.9)";
    x.beginPath();
    x.arc(pkx, pky, 2.3, 0, 7);
    x.fill();
  }
  // playhead + current-sample dot + live metrics
  playhead(x, c, t, top, bot, duration);
  const cur = clamp01(valAt(ys, t, duration));
  x.fillStyle = "#EAF6FA";
  x.beginPath();
  x.arc(xAt(c, t, duration), Y(cur), 3, 0, 7);
  x.fill();
  drawStats(x, W, cur, s);
}

// ---- signed lanes (valence & arousal) -------------------------------------------
// mode 'center' => baseline mid (valence, ~[-1,1]); 'bottom' => baseline bottom
// (arousal, [0,1]). `colorCss` carries a "COLOR" placeholder swapped for the alpha.
export function drawSigned(
  c: HTMLCanvasElement,
  seq: number[] | undefined,
  lo: number[] | undefined,
  hi: number[] | undefined,
  t: number,
  colorCss: string,
  mode: "center" | "bottom",
  stat: Stat | null,
  arc: Arc,
  duration: number,
): void {
  const x = c.getContext("2d");
  if (!x) return;
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
  x.strokeStyle = "rgba(255,255,255,.2)";
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(PADL, base);
  x.lineTo(W - PADR, base);
  x.stroke();
  const ts = arc.timestamps;
  // uncertainty band
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
    x.fillStyle = colorCss.replace("COLOR", ".13");
    x.fill();
  }
  // line
  x.beginPath();
  x.lineWidth = 2.1;
  x.strokeStyle = colorCss.replace("COLOR", "1");
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
  x.fillStyle = colorCss.replace("COLOR", "1");
  x.beginPath();
  x.arc(xAt(c, t, duration), Y(cur), 3, 0, 7);
  x.fill();
  drawStats(x, W, cur, stat);
}

// ---- coarse discrete-state distribution -----------------------------------------
// A stacked cumulative probability band over time — a whole distribution, never a
// single confident named-emotion %. Self-guards: draws nothing if coarse_states is
// absent/malformed. Monochrome cool-grey ramp (no rainbow) to fit the theme.
export function coarseColor(i: number, n: number): string {
  const l = 38 + (i / Math.max(1, n - 1)) * 46;
  return `hsl(202 24% ${l}%)`;
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
  x.strokeStyle = "#EAF6FA";
  x.lineWidth = 1.4;
  x.stroke();
}
