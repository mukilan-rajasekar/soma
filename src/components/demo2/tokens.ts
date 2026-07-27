"use client";

// One place that resolves design tokens for demo2's drawing code. ArcPlot, VariantOverlay
// and TwoRegionBrain each carried their own literal-hex copy of the palette — three copies
// that can drift from globals.css and from each other — plus a scatter of raw rgba()
// literals inside ArcPlot's draw effect. This reads the real CSS custom properties instead,
// which is the pattern docs/DESIGN-SYSTEM.md documents and /preflight already follows.
//
// It also picks up document.body's font-family, so canvas and SVG labels render in the site
// face (Geist) rather than the system-ui the literals hardcoded. That is the ONLY visible
// change this module makes: every colour it returns is the same value the literal it
// replaced spelled out.

import { useSyncExternalStore } from "react";
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
  error: string;
  pos: string;
  neg: string;
  fontFamily: string;
};

/** Token *key*, not a resolved colour — see tokenVar and roleStyle. */
export type ColorToken = keyof Omit<VizTokens, "fontFamily">;

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
  error: "#b42318",
  pos: "#3f7a5a",
  neg: "#b42318",
  fontFamily: "system-ui, sans-serif",
};

const VAR_NAME: Record<ColorToken, string> = {
  ink: "--color-ink",
  ink2: "--color-ink-2",
  ink3: "--color-ink-3",
  line: "--color-line",
  line2: "--color-line-2",
  fill: "--color-fill",
  paper: "--color-paper",
  accent: "--color-accent",
  accent2: "--color-accent-2",
  error: "--color-error",
  pos: "--color-pos",
  neg: "--color-neg",
};

const COLOR_KEYS = Object.keys(VAR_NAME) as ColorToken[];

/**
 * MUST be called from inside an effect or event handler — never at module scope. There
 * is no `document` on the server, and in the browser the stylesheet may not have applied
 * at module-eval time.
 */
export function readVizTokens(): VizTokens {
  if (typeof document === "undefined") return FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const key of COLOR_KEYS) {
    const v = css.getPropertyValue(VAR_NAME[key]).trim();
    if (v) out[key] = v;
  }
  // Canvas labels should be the site font, not system-ui — a different typeface from
  // everything around them, which is exactly what the charts were drawing in.
  const family = getComputedStyle(document.body).fontFamily;
  if (family) out.fontFamily = family;
  return out;
}

// The resolved palette, read once and held: getSnapshot below MUST return a stable
// reference or React re-renders forever. Nothing on this site swaps stylesheets at runtime,
// so a single read is also the correct one — and canvas code never comes through here, it
// calls readVizTokens() fresh inside each draw.
let snap: VizTokens | null = null;
const getSnapshot = (): VizTokens => (snap ??= readVizTokens());
const getServerSnapshot = (): VizTokens => FALLBACK;
// The stylesheet is not a store that emits; there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * For components that draw with tokens but have no canvas draw effect to resolve them in —
 * TwoRegionBrain's SVG attributes. useSyncExternalStore rather than state + an effect
 * because that is what this is: a read from an external system (the CSSOM) that React does
 * not own. It also gets the server/hydration pass right for free — both render FALLBACK,
 * which is the same hexes globals.css declares, so resolving is not a visible swap.
 */
export function useVizTokens(): VizTokens {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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

/** The CSS var reference for a token, for HTML/SVG style values — no JS resolution needed
 *  there because `@theme static` emits every token as a real `:root` custom property. */
export function tokenVar(token: ColorToken): string {
  return `var(${VAR_NAME[token]})`;
}

/** A token at partial opacity, for style values where hexToRgba can't be used because the
 *  colour is never resolved in JS. color-mix() premultiplies, so a colour mixed with
 *  `transparent` at N% is that colour at alpha N/100 — the same pixels the literal rgba()
 *  produced. It is also exactly what Tailwind's own `/opacity` modifiers compile to, which
 *  this page already ships (e.g. `border-error/60` in EditStudio). */
export function tokenAlpha(token: ColorToken, alpha: number): string {
  const pct = +(alpha * 100).toFixed(4);
  return `color-mix(in oklab, var(${VAR_NAME[token]}) ${pct}%, transparent)`;
}

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
 * an effect in every panel; instead the chart resolves once, inside its draw effect,
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

/** The CSS var name for a role, for HTML swatches. */
export function roleVar(role: AdRole): string {
  if (role === "best") return tokenVar("pos");
  if (role === "worst") return tokenVar("neg");
  return tokenVar("line2");
}
