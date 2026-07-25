"use client";

// Section 5 — attention across variations of the SAME campaign (the chart the team
// flagged "for sure good"). Five cuts of one welding ad, their attention arcs overlaid
// on a shared 0–1 scale so they're directly comparable (same campaign = apples to
// apples). Kept deliberately uncluttered per the spec: the selected cut draws in solid
// ink, the other four sit faint behind it, and a compact ranked legend carries the
// scores. Click a legend row to bring that cut forward.

import { useEffect, useRef, useState } from "react";
import { useAnimeClock } from "./useReveal";
import { fmtT, type Ad } from "./types";

const INK = "#0a0a0a";
const INK3 = "#727272";
const LINE = "#e2e2e2";
const ACCENT = "#3f6f7a";

export default function VariantOverlay({ variants, active }: { variants: Ad[]; active: boolean }) {
  const [sel, setSel] = useState(variants[0]?.id ?? "");
  const ref = useRef<HTMLCanvasElement>(null);
  const p = useAnimeClock(active, 1400);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = 240;
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const PADL = 34, PADR = 14, PADT = 16, PADB = 24;
    const x0 = PADL, x1 = W - PADR, y0 = PADT, y1 = H - PADB;
    // shared time domain = the longest variant, so cuts of different lengths align at t=0
    const maxDur = Math.max(...variants.map((v) => v.duration), 1);
    const xAt = (t: number) => x0 + (t / maxDur) * (x1 - x0);
    const yAt = (v: number) => y1 - v * (y1 - y0);

    // grid
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillStyle = INK3;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const y = yAt(g / 4);
      ctx.globalAlpha = g === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.globalAlpha = 1;
      if (g % 2 === 0) ctx.fillText((g / 4).toFixed(1), x0 - 6, y);
    }

    const drawArc = (a: Ad, upto: number, strong: boolean) => {
      const xs = a.timestamps.map((t) => xAt(t));
      const ys = a.lanes.dorsal.map((v) => yAt(v));
      const n = Math.max(1, Math.floor(upto * (xs.length - 1)));
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 1; i <= n; i++) {
        const xc = (xs[i - 1] + xs[i]) / 2, yc = (ys[i - 1] + ys[i]) / 2;
        ctx.quadraticCurveTo(xs[i - 1], ys[i - 1], xc, yc);
      }
      ctx.lineTo(xs[n], ys[n]);
      if (strong) {
        ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = INK3; ctx.lineWidth = 1; ctx.globalAlpha = 0.28;
      }
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // faint cuts first, selected on top
    variants.forEach((v) => { if (v.id !== sel) drawArc(v, p, false); });
    const s = variants.find((v) => v.id === sel);
    if (s) drawArc(s, p, true);

    // axis
    ctx.fillStyle = INK3;
    ctx.font = "9px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("0:00", x0, y1 + 6);
    ctx.textAlign = "right";
    ctx.fillText(fmtT(maxDur), x1, y1 + 6);
  }, [variants, sel, p]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
      <div>
        <canvas ref={ref} className="block w-full rounded-xl border border-line bg-paper" style={{ height: 240 }} role="img" aria-label="Attention arcs of five cuts of the same campaign, overlaid" />
        <div className="mt-2.5 text-[11.5px] uppercase tracking-[0.06em] text-ink-3">Attention · normalized 0–1 · same campaign, five cuts</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {variants.map((v) => {
          const on = v.id === sel;
          return (
            <button
              key={v.id}
              onClick={() => setSel(v.id)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${on ? "border-ink bg-fill" : "border-line hover:border-line-2"}`}
            >
              <span className="flex items-center gap-2">
                <span className={`inline-block h-[2px] w-4 ${on ? "bg-ink" : "bg-ink-3/40"}`} />
                <span className="text-[12.5px] font-medium text-ink">{v.title}</span>
              </span>
              <span className={`tabular-nums text-[13px] ${on ? "font-semibold text-ink" : "text-ink-3"}`}>{v.scores.soma}</span>
            </button>
          );
        })}
        <div className="mt-1 px-1 text-[12.5px] leading-[1.5] text-ink-3">
          Same footage, recut. Attention diverges in the first seconds — the opener decides the arc.
        </div>
      </div>
    </div>
  );
}
