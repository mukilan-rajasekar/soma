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
const ACCENT2 = "#5f8b99";

// One identity per cut: colour AND dash, never hue alone (the data-viz rule in ArcPlot's
// header). Previously drawArc had exactly two states — the selected cut in solid ink, and
// EVERY other cut in identical #727272 1px at alpha .28. Five arcs were drawn, four of them
// pixel-identical, so the legend promised five identifiable cuts and the chart delivered
// two: "the one you picked" and "the others". That is fatal for a section whose entire
// claim is that you can see WHY 73 beat 51. ACCENT was declared and never used, which was
// the tell. Index-keyed so the legend swatch below can render the same colour + dash and
// the reader can actually map a legend row to a line.
const ARC_STYLES: { color: string; dash: number[] }[] = [
  { color: INK, dash: [] },
  { color: ACCENT, dash: [7, 3] },
  { color: ACCENT2, dash: [2, 3] },
  { color: INK3, dash: [10, 4, 2, 4] },
  { color: ACCENT, dash: [4, 4] },
];
const styleFor = (i: number) => ARC_STYLES[i % ARC_STYLES.length];

export default function VariantOverlay({ variants, active }: { variants: Ad[]; active: boolean }) {
  const [sel, setSel] = useState(variants[0]?.id ?? "");
  const ref = useRef<HTMLCanvasElement>(null);
  // Constant rate: five arcs racing each other across a shared time axis only reads as a
  // race if they advance at the same, steady speed. Under the default easeOutCubic all five
  // lunged to the right edge together and then inched, which looked like a stutter.
  const p = useAnimeClock(active, 1600, "linear");
  // Same stale-width bug ArcPlot had: W comes from clientWidth, which no dependency tracks,
  // so the chart kept its mount width through any resize. It mattered less when this was a
  // mid-page section; it matters now that it is part of a headline beat.
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
    ctx.font = "10.5px system-ui, sans-serif";
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

    const drawArc = (a: Ad, upto: number, strong: boolean, styleIdx: number) => {
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
      // Each cut keeps its own colour + dash whether or not it is selected; selection
      // changes weight and opacity only. That way the legend row you are reading always
      // maps to the same line, and an unselected cut stays identifiable instead of
      // dissolving into an anonymous grey band with the other three.
      const st = styleFor(styleIdx);
      ctx.setLineDash(st.dash);
      ctx.strokeStyle = st.color;
      ctx.lineWidth = strong ? 2.4 : 1.3;
      ctx.globalAlpha = strong ? 1 : 0.45;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // A dot on the pen while the arc is still drawing. The stroke above ends exactly at
      // (xs[n], ys[n]), so no interpolation is needed to find it. Every cut gets one, in its
      // own colour, which is what turns five lines appearing into five cuts being plotted.
      if (upto < 1 && n < xs.length - 1) {
        ctx.fillStyle = st.color;
        ctx.globalAlpha = strong ? 1 : 0.5;
        ctx.beginPath();
        ctx.arc(xs[n], ys[n], strong ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    // unselected first, selected on top so it never sits under another line
    variants.forEach((v, i) => { if (v.id !== sel) drawArc(v, p, false, i); });
    const selIdx = variants.findIndex((v) => v.id === sel);
    if (selIdx >= 0) drawArc(variants[selIdx], p, true, selIdx);

    // axis
    ctx.fillStyle = INK3;
    ctx.font = "10.5px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("0:00", x0, y1 + 6);
    ctx.textAlign = "right";
    ctx.fillText(fmtT(maxDur), x1, y1 + 6);
  }, [variants, sel, p, canvasW]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
      <div>
        <canvas ref={ref} className="block w-full rounded-xl border border-line bg-paper" style={{ height: 240 }} role="img" aria-label="Attention arcs of five cuts of the same campaign, overlaid" />
        <div className="mt-2.5 text-[11.5px] uppercase tracking-[0.06em] text-ink-3">Attention · normalized 0–1 · same campaign, five cuts</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {variants.map((v, i) => {
          const on = v.id === sel;
          const st = styleFor(i);
          return (
            <button
              key={v.id}
              onClick={() => setSel(v.id)}
              aria-pressed={on}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${on ? "border-ink bg-fill" : "border-line hover:border-line-2"}`}
            >
              <span className="flex items-center gap-2">
                {/* The swatch draws the cut's ACTUAL colour and dash, so a legend row can be
                    matched to a line on the chart. It used to be a plain 2px bar, ink when
                    selected and grey otherwise — which told you nothing about which of the
                    four grey lines was this row. */}
                <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true" className="shrink-0 overflow-visible">
                  <line
                    x1="0" y1="4" x2="18" y2="4"
                    stroke={st.color}
                    strokeWidth={on ? 2.4 : 1.6}
                    strokeDasharray={st.dash.length ? st.dash.join(" ") : undefined}
                    opacity={on ? 1 : 0.6}
                  />
                </svg>
                <span className="text-[12.5px] font-medium text-ink">{v.title}</span>
              </span>
              {/* The Soma score used to sit here too. This component now mounts inside §04,
                  directly under the generate board, which already lists these same five cuts
                  with these same five scores against their poster frames — so printing them
                  again ~200px later was the duplication that got the standalone
                  compare-the-cuts section cut, recreated inside one section. The legend's job
                  here is arc identification: swatch + name. The ranking lives above. */}
            </button>
          );
        })}
        {/* Was "Same footage, recut. Attention diverges in the first seconds, the opener
            decides the arc." — a near-verbatim repeat of the line DemoScrollPage prints
            directly above this chart, about 200px up the page. The legend's own footer is
            the one place that can carry what nothing else says: that these rows are
            controls. Nothing else on the page indicated the arcs were selectable. */}
        <div className="mt-1 px-1 text-[12.5px] leading-[1.5] text-ink-3">
          Pick a cut to bring its arc forward.
        </div>
      </div>
    </div>
  );
}
