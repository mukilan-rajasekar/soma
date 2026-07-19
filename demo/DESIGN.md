# Soma — Design System

The single visual system for every page in `demo/` (index, waitlist, pitch). Dark,
clinical, instrument-grade. Pure-black canvas, white data, and a strict 3-tier
semantic color key. No webfonts fetched at runtime (vendored / system only).

## Theme

Committed **dark, monochrome-with-semantic-color**. Pure black is the lab. Data is
white/ice. The *only* hues are the honesty tiers (green/amber/red) because that
color carries meaning. The warm fMRI "hot" colormap is confined to the decorative
3D cortex hero and never appears on data. Strategy: **Restrained** (tinted-neutral
surfaces + one cool data accent ≤10% + the semantic key).

## Color (tokens)

```
--base:        #000000   /* the lab — pure black canvas */
--surface-1:   #0C0C0E   /* elevated panels (console, compare, valid, vision) */
--surface-2:   #141416   /* lanes, cards, brainbox, inputs */
--surface-3:   #1C1C1F   /* raised controls (play button) */
--hair:        rgba(255,255,255,.08)   /* default hairline */
--hair-soft:   rgba(255,255,255,.055)  /* interior separators */
--hair-strong: rgba(255,255,255,.14)   /* focused / selected edges */

--ink:   #F5F5F7   /* primary text (~17:1 on black) */
--dim:   #ADADB2   /* secondary text — bumped from #A1A1A6 for AA on surfaces */
--faint: #7C7C82   /* labels / telemetry — ≥4.5:1 on base & surface-1/2 */

--ice:    #BFE0EC   /* the one data accent: attention arc, playhead, focus */
--ice-dim:#8FB3C0   /* ice at rest / secondary data line */

/* semantic honesty key — meaning only, never decoration */
--ok:    #4ADE9E   /* validated (green) */
--amber: #FFCB5C   /* validating / pending (amber) */
--hyp:   #FF7A7A   /* hypothesis (red) */
```

Contrast rules: `--dim` and `--faint` were tuned upward until they clear 4.5:1 on
`--base` and `--surface-2`. Never place `--faint` on `--surface-3`. Placeholder
text uses `--faint`, not lighter.

## Typography

Deliberate single-family system stack (respects the no-CDN constraint; unifies all
three pages). Hierarchy comes from weight + size + tracking contrast, not font
switching. None of the reflex-reject families (Inter/Space Grotesk/Space Mono/etc.)
are used — those are removed from waitlist/pitch.

```
--sans: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto,
        'Helvetica Neue', Arial, sans-serif;
--mono: ui-monospace, 'SF Mono', 'SFMono-Regular', 'Menlo', 'Cascadia Mono',
        'Roboto Mono', monospace;
```

- **Display / h1:** `--sans` 680–700 weight, `clamp(30px, 5vw, 60px)`, tracking
  `-0.03em`, `line-height:1.05`, `text-wrap:balance`. Hero display max ≤ 60px
  (never shout).
- **h2 (chapters):** `clamp(22px, 3vw, 30px)`, 700, `-0.025em`.
- **h3 (section):** 20–21px, 640, `-0.02em`.
- **Body:** `--sans` 400, 15–16px, `line-height:1.6`, `text-wrap:pretty`, measure
  ≤ 68ch.
- **Telemetry / labels / badges / time:** `--mono`, 10–11.5px, tracking `.04–.16em`,
  often uppercase. This mono voice is what sells "instrument."
- No gradient-clipped text anywhere. Emphasis = weight or the ice accent on a word,
  never a gradient fill.

## Spacing & Radii

- Base rhythm: 4px grid; section padding `clamp(20px, 4vw, 32px)`; section gaps
  `clamp(20px, 5vh, 40px)`.
- Radii (squircle language, consistent): panels `24px`; lanes/cards/canvas `18–20px`;
  small controls/inputs `14px`; pills/round buttons `999px`.
- Content max-width `1080px`; body copy measure capped independently at ~68ch.

## Components

- **Nav:** fixed, `blur(10px)` scrim gradient, hairline bottom on scroll. Fades out
  only at hero-top. Brand orb = calm radial (no neon halo).
- **Evidence badge:** mono, `border + 8% tint` in the tier color; always paired with
  a text label. `.g/.a/.r` variants.
- **Panel:** `--surface-1`, hairline, `inset 0 1px rgba(255,255,255,.03)` top sheen,
  deep soft drop shadow. No colored rims.
- **Read-out lane:** `--surface-2`, hairline, header (name + sublabel + badge) then a
  full-width canvas. Ice line for attention; white/ice-dim for affect.
- **Transport:** attached directly beneath the lanes — round play button
  (`--surface-3`), a real track with ice progress fill + grabbable thumb, mono time.
- **Video card:** real identity — generative cortical mini-arc preview on a tinted
  gradient, title + mono meta, unmistakable selected state (ice ring + lift).
- **Chapter panel (hero):** stronger local scrim (panel bg opacity up + radial
  darken behind) so copy always clears 4.5:1 over the brain.

## Motion

```
--ease: cubic-bezier(.22,1,.36,1);        /* ease-out-quint — the default */
--ease-soft: cubic-bezier(.33,1,.68,1);   /* gentler for larger moves */
--dur-1: .16s;  --dur-2: .28s;  --dur-3: .5s;
```

- Reveals enhance already-visible content (never gate visibility on a class).
- Staggered entrances allowed per list; no uniform whole-page fade reflex.
- Hover: 2px lift + hairline→strong on cards/buttons; ice focus ring on inputs.
- Full `@media (prefers-reduced-motion: reduce)` fallback: crossfade/instant, no
  camera flight, no flashes.

## Absolute bans (enforced here)

- No gradient-clipped text. No side-stripe (`border-left/right > 1px` accent)
  borders — the validation stats and the waitlist one-liner are rebuilt without
  them. No glassmorphism as decoration. No hero-metric template. No per-section
  tracked-uppercase eyebrow used as scaffolding (the console step-labels "1 · …",
  "2 · …" are a real numbered sequence and stay).

## Why no build step (deliberate static architecture)

The demo ships as plain HTML/CSS/JS with **no bundler, no toolchain, no build
step** — on purpose:

- **Auditable in the browser.** All code is human-readable directly in DevTools
  (view-source, no minified/transpiled bundle). This matches the company's
  honesty posture — the honesty labels and validated-vs-hypothesis boundaries in
  the UI are backed by source anyone can read without un-minifying.
- **Modules already work with zero tooling.** ES modules load natively via a
  `<script type="importmap">` (see `index.html`), so the "modules need a bundler"
  premise is false — cross-file imports resolve in the browser as-is.
- **Simpler CSP.** With no bundler and no `eval`/`new Function`, the Content
  Security Policy stays tight and easy to reason about.
- **Nothing to break during the sprint.** There is no build toolchain to
  misconfigure, version-drift, or fail at the worst moment mid-sprint.
- **When to revisit.** Add a bundler (e.g. esbuild) *only* if cross-file
  bundling ever becomes genuinely unavoidable (many modules / tree-shaking /
  legacy-target transpile) — not before.
