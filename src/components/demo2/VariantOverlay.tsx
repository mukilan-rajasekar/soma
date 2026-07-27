"use client";

// Section 5 — attention across variations of the SAME campaign (the chart the team
// flagged "for sure good"). Five cuts of one welding ad, their attention arcs overlaid
// on a shared 0–1 scale so they're directly comparable (same campaign = apples to
// apples). Kept deliberately uncluttered per the spec: the selected cut draws in solid
// ink, the other four sit faint behind it, and a compact ranked legend carries the
// scores. Click a legend row to bring that cut forward.

import { useEffect, useRef, useState } from "react";
import { ON_SCREEN, useAnimeClock, useReveal } from "./useReveal";
import { readVizTokens, roleStyle, roleVar, type SeriesStyle } from "./tokens";
import { fmtT, roleOf, type Ad } from "./types";

// Colour is bound to RANK, never to selection and never to array index — the same code
// /preflight draws (tokens.ts roleStyle). Rank 1 is green, the bottom rank red, the three
// between collapse to one flat pale hairline.
//
// The previous encoding gave each cut its own hue AND dash, which is right in principle and
// unreadable in practice: at the ~640px this page is watched at, four low-contrast dashed
// curves crossing each other are one grey fog, and the section's whole claim — that you can
// SEE why the winner won — dies in it. Two saturated curves in front of three ghosts says
// the same thing and survives the downscale. The middle three are not hidden; they are the
// field the winner and loser are measured against, and the rank numeral at each terminus
// names them without leaning on hue at all.
//
// Selection changes weight and paint order only. If clicking a middle cut turned it green,
// green would mean "best" in one frame and "the one you clicked" in the next.

export default function VariantOverlay({ variants, active }: { variants: Ad[]; active: boolean }) {
  const [sel, setSel] = useState(variants[0]?.id ?? "");
  const ref = useRef<HTMLCanvasElement>(null);
  // The race runs off THIS chart arriving, not off §04 revealing. It is the last thing in a
  // 1,528px section: the section's flag fired 955px of scroll (8.8s at the recording's rate)
  // before the canvas had a single pixel on camera, so five arcs raced each other to a
  // finish nobody could see and the beat played as a still image. ANDed with `active` so it
  // still cannot start before the section it belongs to.
  const [hostRef, framed] = useReveal<HTMLDivElement>(ON_SCREEN);
  const p = useAnimeClock(active && framed, 1600, "linear");
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
    // Live tokens, resolved here rather than at module scope: inside an effect `document`
    // exists and the stylesheet has applied, which is the only place either is guaranteed.
    const TOK = readVizTokens();
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
    ctx.strokeStyle = TOK.line;
    ctx.lineWidth = 1;
    ctx.font = `10.5px ${TOK.fontFamily}`;
    ctx.fillStyle = TOK.ink3;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const y = yAt(g / 4);
      ctx.globalAlpha = g === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.globalAlpha = 1;
      if (g % 2 === 0) ctx.fillText((g / 4).toFixed(1), x0 - 6, y);
    }

    const drawArc = (a: Ad, upto: number, st: SeriesStyle) => {
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
      // No dash variety at all now: the hairlines are one flat pale weight, so the eye has
      // nothing to try to separate in the middle of the field and reads the two saturated
      // curves instead. Dashes at 1px survive a 640px downscale only as noise.
      ctx.strokeStyle = TOK[st.colorToken];
      ctx.lineWidth = st.width;
      ctx.globalAlpha = st.alpha;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.globalAlpha = 1;
      // A dot on the pen while the arc is still drawing. The stroke above ends exactly at
      // (xs[n], ys[n]), so no interpolation is needed to find it. Every cut gets one, in its
      // own colour, which is what turns five lines appearing into five cuts being plotted.
      if (upto < 1 && n < xs.length - 1) {
        ctx.fillStyle = TOK[st.colorToken];
        ctx.beginPath();
        ctx.arc(xs[n], ys[n], st.width >= 2 ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Rank numeral at the curve's own terminus, in the curve's own colour. This is the
      // redundant NON-colour channel: green and red are both saturated at the same weight,
      // so weight alone cannot separate them for a red-green viewer, and the pale three
      // would otherwise be anonymous. Held until the draw finishes so it never chases the pen.
      if (upto >= 1) {
        ctx.fillStyle = TOK[st.colorToken];
        ctx.font = `600 10px ${TOK.fontFamily}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(String(a.rank), Math.min(xs[n] + 5, x1 + 4), ys[n]);
      }
    };

    // Back to front by z: the three hairlines, then the two saturated curves, then whatever
    // is selected — so the winner and loser are never buried under a ghost, which the old
    // "unselected first, selected last" order allowed.
    variants
      .map((v) => ({ v, st: roleStyle(roleOf(v, variants), v.id === sel) }))
      .sort((a, b) => a.st.z - b.st.z)
      .forEach(({ v, st }) => drawArc(v, p, st));

    // axis
    ctx.fillStyle = TOK.ink3;
    ctx.font = `10.5px ${TOK.fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("0:00", x0, y1 + 6);
    ctx.textAlign = "right";
    ctx.fillText(fmtT(maxDur), x1, y1 + 6);
  }, [variants, sel, p, canvasW]);

  return (
    <div ref={hostRef} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
      <div>
        <canvas ref={ref} className="block w-full rounded-xl border border-line bg-paper" style={{ height: 240 }} role="img" aria-label="Attention arcs of five cuts of the same campaign, overlaid" />
        <div className="mt-2.5 text-[11.5px] uppercase tracking-[0.06em] text-ink-3">Attention · normalized 0–1 · same campaign, five cuts</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {variants.map((v) => {
          const on = v.id === sel;
          const role = roleOf(v, variants);
          return (
            <button
              key={v.id}
              onClick={() => setSel(v.id)}
              aria-pressed={on}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${on ? "border-ink bg-fill" : "border-line hover:border-line-2"}`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {/* The rule carries the cut's ROLE colour, so green/red/pale here is the same
                    three-state code the canvas draws and one glance maps a row to a curve.
                    The rank digit beside it is what identifies the three pale rows, which a
                    hairline alone cannot — it is the same digit printed at that curve's
                    terminus. Neither changes with selection; only the row's border and fill do. */}
                <span
                  aria-hidden="true"
                  className="inline-block h-[3px] w-4 shrink-0 rounded-full"
                  style={{ background: roleVar(role) }}
                />
                <span className="text-[10px] tabular-nums text-ink-3">{v.rank}</span>
                <span className={`truncate text-[12.5px] ${on ? "font-medium text-ink" : "text-ink-2"}`}>{v.title}</span>
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
