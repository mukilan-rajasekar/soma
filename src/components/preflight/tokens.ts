"use client";

// One place that resolves design tokens for canvas code. ArcPlot, VariantOverlay and
// TwoRegionBrain each paste their own literal-hex copy of the palette (three copies that
// can drift); /preflight reads the real CSS custom properties instead, which is the
// pattern docs/DESIGN-SYSTEM.md documents.

import type { AdRole } from "./types";

export type VizTokens = {
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  fill: string;
  paper: string;
  accent: string;
  accent2: string;
  pos: string;
  neg: string;
  fontFamily: string;
};

// Only used when there is no document (SSR) or the stylesheet hasn't applied yet.
// Kept in step with globals.css `@theme static` by hand — if these drift the page still
// renders, just off-palette, which is the right failure mode for a fallback.
const FALLBACK: VizTokens = {
  ink: "#0a0a0a",
  ink2: "#4a4a4a",
  ink3: "#727272",
  line: "#e2e2e2",
  line2: "#d8d8d8",
  fill: "#fafafa",
  paper: "#ffffff",
  accent: "#3f6f7a",
  accent2: "#5f8b99",
  pos: "#3f7a5a",
  neg: "#b42318",
  fontFamily: "system-ui, sans-serif",
};

const VARS: Array<[keyof VizTokens, string]> = [
  ["ink", "--color-ink"],
  ["ink2", "--color-ink-2"],
  ["ink3", "--color-ink-3"],
  ["line", "--color-line"],
  ["line2", "--color-line-2"],
  ["fill", "--color-fill"],
  ["paper", "--color-paper"],
  ["accent", "--color-accent"],
  ["accent2", "--color-accent-2"],
  ["pos", "--color-pos"],
  ["neg", "--color-neg"],
];

/**
 * MUST be called from inside an effect or event handler — never at module scope. There
 * is no `document` on the server, and in the browser the stylesheet may not have applied
 * at module-eval time.
 */
export function readVizTokens(): VizTokens {
  if (typeof document === "undefined") return FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const [key, varName] of VARS) {
    const v = css.getPropertyValue(varName).trim();
    if (v) out[key] = v;
  }
  // Canvas labels should be the site font (Geist), not system-ui. ArcPlot hardcodes
  // system-ui, which is a different typeface from everything around it.
  const family = getComputedStyle(document.body).fontFamily;
  if (family) out.fontFamily = family;
  return out;
}

/** #rrggbb -> rgba(). Only handles the 6-digit hex our tokens use. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.trim().replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Token *key*, not a resolved colour — see roleStyle. */
export type ColorToken = keyof Omit<VizTokens, "fontFamily">;

export type SeriesStyle = { colorToken: ColorToken; width: number; z: number; alpha: number };

/**
 * Colour is bound to RANK, never to selection.
 *
 * If clicking a middle ad turned it green, the encoding would be a lie — green would
 * mean "best" in one frame and "the one you clicked" in the next. Selection is expressed
 * by weight, alpha and paint order only, so a selected middle ad reads as a darker
 * neutral rather than borrowing the winner's colour.
 *
 * Returns a token KEY rather than a hex so this stays a pure function. Callers building
 * chart series would otherwise need to resolve tokens from the DOM, which means state +
 * an effect in every panel; instead DeltaChart resolves once, inside its draw effect,
 * where `document` is guaranteed to exist.
 */
export function roleStyle(role: AdRole, selected: boolean): SeriesStyle {
  if (role === "best") {
    return { colorToken: "pos", width: selected ? 2.6 : 2, z: selected ? 5 : 3, alpha: 1 };
  }
  if (role === "worst") {
    return { colorToken: "neg", width: selected ? 2.6 : 2, z: selected ? 5 : 3, alpha: 1 };
  }
  return selected
    ? { colorToken: "ink3", width: 1.6, z: 4, alpha: 1 }
    : { colorToken: "line2", width: 1, z: 1, alpha: 1 };
}

/** The CSS var name for a role, for HTML swatches — no JS resolution needed there
 *  because `@theme static` emits every token as a real `:root` custom property. */
export function roleVar(role: AdRole): string {
  if (role === "best") return "var(--color-pos)";
  if (role === "worst") return "var(--color-neg)";
  return "var(--color-line-2)";
}
