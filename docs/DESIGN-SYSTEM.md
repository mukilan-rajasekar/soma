# SOMA — Design System

The single source of truth for the whole site. Every page (demo, science,
compare, faq, pitch) must feel like **one system**. The tokens below are
extracted from the finished landing hero (`src/components/Landing.tsx` /
`Brain.tsx`) — do not restyle the hero; match it everywhere else.

Tokens live in `src/app/globals.css` inside a Tailwind v4 `@theme static`
block. `static` means every token is emitted as a `:root` CSS custom property
**even before any utility uses it**, so you can consume them two ways:

- **Semantic Tailwind utilities** — `text-ink`, `bg-fill`, `border-line`,
  `rounded-xl`, `text-section`, … (generated on demand when you type them).
- **Raw `var()`** for dynamic canvas/SVG values — `stroke: var(--color-accent)`,
  or in canvas 2D read it once via
  `getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim()`.

**Reach for the semantic class. Never paste a raw hex that a token already covers.**

---

## Ethos

Swiss / editorial minimalism. Restraint **is** the brand. Near-monochrome,
generous whitespace, one delicate scientific hero, and a single serif-italic
accent on the emotional word. No brand accent colour anywhere in the UI; the
one muted slate/teal is reserved strictly for data-viz lanes.

---

## Color

| Role | Token | Utility examples | Value |
|---|---|---|---|
| Page background | `--color-paper` | `bg-paper` | `#ffffff` |
| Primary text / black fill | `--color-ink` | `text-ink` · `bg-ink` | `#0a0a0a` |
| Secondary / body copy | `--color-ink-2` | `text-ink-2` | `#4a4a4a` |
| Tertiary / meta / muted | `--color-ink-3` | `text-ink-3` | `#727272` |
| Default hairline | `--color-line` | `border-line` | `#e2e2e2` |
| Stronger hairline (inputs) | `--color-line-2` | `border-line-2` | `#d8d8d8` |
| Raised surface / card fill | `--color-fill` | `bg-fill` | `#fafafa` |
| Validation / error | `--color-error` | `text-error` | `#b42318` |
| Data-viz lane A / primary | `--color-accent` | `text-accent` · `stroke-accent` | `#3f6f7a` |
| Data-viz lane B / secondary | `--color-accent-2` | `text-accent-2` | `#5f8b99` |
| Data-viz polarity / positive | `--color-pos` | `text-pos` · `stroke` | `#3f7a5a` |
| Data-viz polarity / negative | `--color-neg` | `text-neg` | `#b42318` |

Rules of thumb:
- Text hierarchy is **ink → ink-2 → ink-3**, never a colour.
- Borders are always 1px hairlines: `border-line` for dividers/cards,
  `border-line-2` for form controls (a touch stronger so inputs read as inputs).
- `bg-paper` is the default surface; `bg-fill` is the only "raised" step. Do not
  invent greys in between.
- `accent` / `accent-2` are **data only** — never a button, link, or heading.

---

## Type

Keep the hero's font strategy: a system grotesque **sans** for headings/UI, and
Tailwind's **serif, italic** for the single accent word. Do not add webfonts.
Headings track tight (`-0.02em`); UI tracks `-0.01em`. The type tokens bake the
tracking + leading in, so `text-hero` / `text-section` are already correct.

| Role | Utility | Size / tracking |
|---|---|---|
| Wordmark ("soma") | `text-wordmark` | `23px` · `-0.01em` · 500 |
| Hero headline | `text-hero` | `clamp(30,3.4vw,46)` · `-0.02em` · 500 |
| Section heading | `text-section` | `clamp(28,3vw,34)` · `-0.02em` · 500 |
| Body | `text-body` | `16px` · `1.5` |
| UI (buttons, inputs, nav) | `text-ui` | `15px` · `-0.01em` |
| Meta / label / helper | `text-meta` | `13px` · `1.5` |

### Labels & numeric read-outs — uppercase tracked sans, never mono

Eyebrows, captions, meta labels, and numeric read-outs are the **system sans**,
uppercase, tracked `0.1–0.12em` at small sizes (`text-meta` / ~10–11px). There is
**no monospace anywhere on the site — the `/demo` data tool included**; mono was
pulled out of the demo entirely. Numbers are sans + `tabular-nums` (digits align
without a monospace face), never `font-mono`.

```tsx
{/* eyebrow / meta label */}
<div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3">In plain english</div>

{/* numeric read-out — sans + tabular-nums, never mono */}
<b className="tabular-nums text-ink">0.0s</b>
```

### The serif-italic accent rule

Exactly **one** accent word per view, on the emotional word, inside an otherwise
`font-medium` sans heading. It is `font-serif font-normal italic` — nothing else
gets italicised. The live `/demo` headline is the canonical example: "Where this ad
earns *attention*." — one serif-italic word inside a `text-section` sans head.

```tsx
<h2 className="text-section text-ink text-balance">
  Which ad wins <span className="font-serif font-normal italic">attention</span>?
</h2>
```

```tsx
<p className="mt-5 max-w-[340px] text-body text-pretty text-ink-2">
  You can’t sugarcoat brain activity.
</p>
```

---

## Shape

- Controls (buttons, inputs, selects): `rounded-xl` (12px, `--radius-xl`).
- Cards, modals, canvases, panels: `rounded-2xl` (16px, `--radius-2xl`).
- Borders: 1px hairlines only.
- Shadows: **overlays only** (dialogs, popovers). Flat surfaces get a hairline
  border, never a shadow. Never a glow.

```tsx
{/* Card */}
<div className="rounded-2xl border border-line bg-fill p-6">…</div>

{/* Overlay — the one place a soft shadow is allowed */}
<div className="rounded-2xl border border-line bg-paper p-6 shadow-xl">…</div>
```

---

## Buttons & inputs

**Primary** — black fill, white text:

```tsx
<button className="cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85">
  Join waitlist
</button>
```

**Secondary** — paper + hairline, ink-2 → ink on hover:

```tsx
<button className="cursor-pointer rounded-xl border border-line-2 bg-paper px-5 py-[13px] text-ui font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink">
  Learn more
</button>
```

**Text input:**

```tsx
<input className="rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui text-ink outline-none placeholder:text-ink-3" />
```

**Inline error** (paired with an input):

```tsx
<div className="mt-2 text-meta text-error">Enter a valid email.</div>
```

---

## Motion

Subtle only: `transition-colors` / opacity, ~150–200ms. No transforms on
scroll-in, no bounce, no parallax in the UI chrome (the hero brain is the one
animated element and it is finished). Interactive lift, where used, is a tiny
`hover:scale-[1.02]` at most.

---

## Data viz (light surface)

The old demo curves were neon-on-black. On the white site they must be
**ink/slate on light**, accessible, with lots of air.

- **Surface:** `bg-paper` (#fff) or `bg-fill` (#fafafa). Never a dark panel.
- **Grid / baseline:** `--color-line` (#e2e2e2) hairlines, 1px.
- **Primary curve (lane A):** `--color-ink` (#0a0a0a), solid, ~2px.
- **Secondary curve (lane B):** `--color-accent-2` (#5f8b99) — or `--color-accent`
  (#3f6f7a) for a heavier read — dashed, so A/B differ by **colour + dash**, not
  hue alone.
- **At most one accent per lane.** No third colour.
- **Uncertainty:** a light-grey band, e.g. `--color-line` at low opacity
  (`rgba(226,226,226,0.6)`) — never a coloured fill.
- **No** `shadowBlur`, glow, or neon. Clarity over drama.

### Polarity (signed data only)

`--color-pos` (#3f7a5a) and `--color-neg` (#b42318) exist for **one** case: a series
whose zero is a real reference point, so that above and below the line mean opposite
things. `/preflight`'s baseline-subtracted attention delta is the only such series today
— zero there means "no different from a black screen".

- Permitted **only** when zero is a genuine reference, never as a generic good/bad tint,
  and never on UI (no buttons, links, headings, badges). Same rule as `accent`.
- The green is tuned to sit beside `--color-accent`: same value, same low chroma, 5.07:1
  vs 5.58:1 on paper. They read as one instrument, not a traffic light.
- `--color-neg` is deliberately the same hex as `--color-error`. The site has exactly one
  red; a chart doesn't get a second one.
- **Colour must not be the only encoding.** Pair it with a rank label, a dash, or a
  weight so the chart survives deuteranopia — the "colour + dash, not hue alone" rule
  above applies here too.
- Selection state must never *recolour* a series. If hue encodes rank, changing hue on
  click makes the encoding a lie — vary weight, alpha, and z-order instead.

Canvas 2D can't read `var()` directly — resolve tokens once:

```ts
const css = getComputedStyle(document.documentElement);
const INK = css.getPropertyValue("--color-ink").trim();       // #0a0a0a
const LANE_B = css.getPropertyValue("--color-accent-2").trim(); // #5f8b99
const GRID = css.getPropertyValue("--color-line").trim();      // #e2e2e2
ctx.strokeStyle = INK;
```

Inline SVG can use the vars or utilities directly:

```tsx
<path d="…" fill="none" className="stroke-ink" strokeWidth={2} />
<path d="…" fill="none" style={{ stroke: "var(--color-accent-2)" }} strokeDasharray="6 5" />
```

The `/demo` scrubber (`.demo-scrub` in `globals.css`) already follows this: ink
fill + thumb on a `line-2` track, ringed in paper.

---

## Demo / data-tool patterns

The `/demo` data tool obeys the same system as every page — sans labels, one
serif-italic accent, hairlines, `accent` reserved for data. Two rules are specific
to it (and to any public read-out):

### Thesis-first read-out

The page **opens with the result**, not the controls. Order, top to bottom:

1. A small meta line naming the selected ad, then a `text-section` headline that
   carries the single serif-italic accent word: "Where this ad earns *attention*."
2. The **read-out grid** (`md:grid-cols-[300px_1fr]`):
   - **left** — the brain viz + the promoted **Cortical Profile** ("where it lights up").
   - **right** — the **Attention arc** + a **Message / language-load** lane.
3. A compact **"In plain english"** takeaways row: an uppercase-sans eyebrow over
   2–3 terse *title + one-line* reads — no numbered markers.
4. The picker (**"Analyze another ad"**) sits **below** the result.

Keep the copy terse — the charts carry the detail.

### Public read-outs never surface emotion

The emotion networks (**valence / arousal**) are a **private research result**, not a
customer-facing claim. They must **never** appear on a public page — `/demo` or
`/story`. Only positive, validated reads are shown publicly: **attention**,
**comprehension / language load**, and the **cortical profile of the networks that
light up**. The Cortical Profile filters emotion nets out **by name**
(`/valence|arousal|emotion/i`); the demo carries **no** valence/arousal lanes.

---

## Layout note (scrolling)

`globals.css` forces `overflow: hidden` on `html/body` so the fixed landing hero
can't scroll. Content routes therefore get their own scroll container — the
`(site)` group wraps children in `<main className="fixed inset-0 overflow-y-auto">`.
Any new full-page route outside `(site)` must do the same, or it won't scroll.

---

## Do / Don't

- **Do** use semantic tokens (`text-ink-2`, `bg-fill`, `border-line`).
  **Don't** paste `#4a4a4a` / `#fafafa` / `#e2e2e2` — a token covers it.
- **Do** keep one serif-italic accent word per view.
  **Don't** italicise anything else or add a second accent.
- **Do** set labels + numbers in uppercase tracked sans (numbers `tabular-nums`).
  **Don't** reach for `font-mono` — labels are uppercase tracked sans.
- **Do** show attention, language load, and the lit cortical profile publicly.
  **Don't** surface valence / arousal (emotion) on `/demo` or `/story` — it's private research.
- **Do** keep `accent` / `accent-2` inside charts.
  **Don't** use them for buttons, links, or headings.
- **Do** separate surfaces with hairlines.
  **Don't** add shadows to flat surfaces or glows to curves.
- **Do** leave the hero (`Landing.tsx` / `Brain.tsx`) untouched.
