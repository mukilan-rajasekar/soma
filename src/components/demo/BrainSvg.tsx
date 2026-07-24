"use client";

// The cortical read-out: a lateral hemisphere outline over a deterministic vertex
// mesh, plus a live whole-cortex magnitude readout + activation colorbar. The ENTIRE
// mesh warms UNIFORMLY off ONE global scalar — nothing is per-region, and no
// per-region numbers are ever printed. The SVG is built ONCE (setupBrain); per frame
// we only set a handful of attributes / text (no reparse). Ported from app.js.
//
// This is the *player* brain (the SVG activation readout) — distinct from the Phase-5
// hero WebGL Brain.tsx.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// SOMA tokens inlined as literals: SVG presentation-attribute strings can't read
// var(), so the design tokens from globals.css are mirrored here as concrete values.
// ink #0a0a0a · accent(slate) #3f6f7a · accent-2 #5f8b99 · ink-3 #8a8a8a · fill #fafafa.
// The whole read-out warms toward the one slate accent as activation rises — no glow,
// no neon; the mesh brightening IS the intensity cue on a white surface.
const INK = "#0a0a0a";
const ACCENT = "#3f6f7a";
const ACCENT_RGB = "63,111,122"; // ACCENT as rgb parts, for the per-frame shell fill
const ACCENT2 = "#5f8b99";
// Mirrors --color-ink-3. Inlined because this SVG is built as a string (no class
// context), so it can't reach the token — keep it in step with globals.css.
const INK3 = "#727272";
const FILL = "#fafafa";

export type BrainHandle = {
  // a = clamp01(global activation) this frame; pkMax = running peak (or null).
  apply: (a: number, pkMax: number | null) => void;
};

const CORTEX_PATH =
  "M262,120 C262,80 232,52 190,46 C168,43 150,42 132,44 C96,48 60,64 46,96 C38,114 40,128 54,138 C64,145 78,146 92,150 C98,160 108,172 126,176 C150,182 178,180 200,170 C226,158 250,150 262,120 Z";

const SULCI = [
  "M62,102 C98,90 150,88 196,98 C224,104 244,108 256,114",
  "M66,124 C104,120 150,124 198,130 C222,133 240,134 252,131",
  "M94,150 C122,150 150,152 182,149",
];

// deterministic vertex mesh: a grid of dots clipped to the cortex outline — evokes the
// fsaverage vertex surface. Each dot's baseline alpha is fixed decorative texture; the
// whole GROUP's opacity is what tracks activation, so every "vertex" brightens together
// off the single global magnitude (never per-region).
function meshDots(): string {
  let out = "";
  for (let gy = 50; gy <= 180; gy += 10) {
    for (let gx = 30; gx <= 258; gx += 10) {
      const seed = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
      const a = 0.3 + ((seed % 1000) / 1000) * 0.6; // fixed per-dot texture
      const r = (1.0 + (((seed >> 10) % 100) / 100) * 0.8).toFixed(2);
      out += `<circle cx="${gx}" cy="${gy}" r="${r}" fill="${ACCENT}" fill-opacity="${a.toFixed(2)}"/>`;
    }
  }
  return out;
}

type BrainEls = {
  glow: SVGPathElement;
  shell: SVGPathElement;
  mesh: SVGGElement;
  mark: SVGRectElement;
  mag: SVGTextElement;
  pk: SVGTextElement;
};

const BrainSvg = forwardRef<BrainHandle>(function BrainSvg(_props, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const elsRef = useRef<BrainEls | null>(null);

  // build ONCE — after this, apply() only mutates a few attributes / textContent.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const sulci = SULCI.map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${ACCENT2}" stroke-width="1" opacity=".3"/>`,
    ).join("");
    svg.innerHTML =
      `<defs>` +
      `<clipPath id="brClip"><path d="${CORTEX_PATH}"/></clipPath>` +
      `<linearGradient id="brBarGrad" x1="0" y1="1" x2="0" y2="0">` +
      `<stop offset="0" stop-color="${FILL}"/><stop offset=".45" stop-color="${ACCENT2}"/><stop offset="1" stop-color="${ACCENT}"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<text id="brMag" x="14" y="30" fill="${INK}" font-family="system-ui,sans-serif" font-size="21" font-weight="600">0.00</text>` +
      `<text x="14" y="43" fill="${INK3}" font-family="system-ui,sans-serif" font-size="8" letter-spacing=".8">GLOBAL ACTIVATION · NORM</text>` +
      `<text id="brPk" x="252" y="24" text-anchor="end" fill="${ACCENT}" font-family="system-ui,sans-serif" font-size="9">PK 0.00</text>` +
      // The cortex outline's top sits at y~42, which collided with the "GLOBAL ACTIVATION"
      // label baseline (y43). Push the whole graphic (brain + colorbar) down so it clears
      // the header. The mesh clip rides along because clipPathUnits is userSpaceOnUse — it
      // resolves in the (now translated) coordinate system of the clipped element.
      `<g transform="translate(0,15)">` +
      `<path id="brGlow" d="${CORTEX_PATH}" fill="none" stroke="${ACCENT2}" stroke-width="7" opacity="0"/>` +
      `<path id="brShell" d="${CORTEX_PATH}" fill="rgba(${ACCENT_RGB},.05)" stroke="${ACCENT}" stroke-width="1.1" stroke-opacity=".6"/>` +
      sulci +
      `<g id="brMesh" clip-path="url(#brClip)" opacity="0.12">${meshDots()}</g>` +
      `<rect x="270" y="56" width="6" height="122" rx="3" fill="url(#brBarGrad)" opacity=".72"/>` +
      `<rect x="270" y="56" width="6" height="122" rx="3" fill="none" stroke="${ACCENT}" stroke-opacity=".3"/>` +
      `<text x="266" y="59" text-anchor="end" fill="${INK3}" font-family="system-ui,sans-serif" font-size="8">1.0</text>` +
      `<text x="266" y="181" text-anchor="end" fill="${INK3}" font-family="system-ui,sans-serif" font-size="8">0</text>` +
      `<rect id="brMark" x="267" y="176" width="12" height="2.2" rx="1" fill="${INK}"/>` +
      `</g>`;
    elsRef.current = {
      glow: svg.querySelector("#brGlow") as SVGPathElement,
      shell: svg.querySelector("#brShell") as SVGPathElement,
      mesh: svg.querySelector("#brMesh") as SVGGElement,
      mark: svg.querySelector("#brMark") as SVGRectElement,
      mag: svg.querySelector("#brMag") as SVGTextElement,
      pk: svg.querySelector("#brPk") as SVGTextElement,
    };
    return () => {
      svg.innerHTML = "";
      elsRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      apply(a: number, pkMax: number | null) {
        const e = elsRef.current;
        if (!e) return;
        // shell always visible (floor); the whole mesh brightens uniformly off `a`.
        e.shell.setAttribute("fill", `rgba(${ACCENT_RGB},${(0.05 + a * 0.1).toFixed(3)})`);
        e.glow.setAttribute("opacity", (a * 0.35).toFixed(3));
        e.mesh.setAttribute("opacity", (0.12 + a * 0.8).toFixed(3)); // uniform — one global value
        e.mark.setAttribute("y", (176 - a * 120).toFixed(1)); // colorbar marker: 0 bottom → 1 top
        e.mag.textContent = a.toFixed(2);
        if (pkMax != null) e.pk.textContent = "PK " + pkMax.toFixed(2);
      },
    }),
    [],
  );

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 300 230"
      role="img"
      aria-label="Cortical activation, updating with the timeline"
      className="block w-full"
    />
  );
});

export default BrainSvg;
