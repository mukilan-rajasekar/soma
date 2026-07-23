# Product

## Register

brand

_(The site (`src/`, the Next.js app) is a marketing + demo surface whose job is to
make a YC-grade first impression and communicate the honest-science positioning.
Design IS the product here. The `/demo` read-out console is an interactive product
artifact inside that brand surface, but the primary register is brand.)_

## Users

- **Primary:** YC partners, angels, and design-partner prospects (DTC brand /
  performance-marketing leads) evaluating Soma. They arrive skeptical, technical,
  and time-poor. They are testing two things at once: "is this real science?" and
  "would this help me ship better ads?"
- **Context:** desktop first (a pitch, a shared link, a laptop demo), but must hold
  up on a phone passed across a table. Often viewed live while a founder narrates.
- **Job to be done:** in under a minute, understand what Soma predicts, see it move
  on a real timeline, and trust the boundary between what's validated and what's a
  labeled hypothesis.

## Product Purpose

Soma predicts an average viewer's second-by-second cortical response to a video ad
(via Meta's public TRIBE v2 encoder), then reads an **attention arc**, a
**comprehension / language-load** lane, and **weak-spot callouts** off it — from the
file, no human panel.
The site's purpose is to convey that capability *and its honest evidence ladder*
credibly enough to win a conversation. Success = a skeptical expert leaves
believing the team is rigorous, not overclaiming.

## Brand Personality

- **Three words:** clinical, honest, alive.
- **Voice:** a scientific instrument that talks straight. Confident about what's
  proven, plainly labeled about what isn't. No hype adjectives, no fake urgency,
  no fabricated numbers.
- **Emotional goal:** the calm authority of a well-made measuring device. The
  visitor should feel they're looking at a real lab tool, not a pitch skin.

## Anti-references

- **Generic AI-SaaS:** neon-blue gradient hero, gradient-clipped headline text,
  glass cards, big-number hero-metric template, tiny tracked uppercase eyebrow над
  every section. Soma must not read as "another AI wrapper landing page."
- **Overclaiming neuro-marketing incumbents** (Realeyes/System1 style "trust our
  black box"): our edge is doing the validation honestly — running the held-out test
  and reporting it, never dressing a hypothesis up as a result — so the design must
  reflect that discipline, not an opaque score.
- **Fractured multi-template feel:** the former three-pages-three-fonts state.
  One system, everywhere.

## Design Principles

1. **Honesty is the interface.** Show plainly what the model shows; never dress a
   hypothesis up as a result. Colour never encodes an evidence tier — the old
   green/amber/red tier UI is gone, and the one muted slate/teal is reserved
   strictly for data-viz lanes (see `docs/DESIGN-SYSTEM.md`).
2. **The instrument, not the skin.** Chrome, telemetry labels, and the read-out
   console should feel like a real scientific tool. Restraint reads as rigor.
3. **One coherent system.** A single type scale, palette, spacing rhythm, and
   motion language across demo / science / compare / faq / pitch. No page looks like
   a different product.
4. **Decoration is fenced from data.** The beautiful cortex visuals are explicitly
   labeled decoration; the only pixels bound to model output live in the console
   and are captioned as such. This separation is a feature, not a disclaimer.
5. **Calm motion.** Ease-out, short, purposeful. Motion clarifies state (playhead,
   reveal, selection); it never performs. Every animation has a reduced-motion path.

## Accessibility & Inclusion

- Target WCAG 2.1 AA: body text ≥4.5:1, large/label text ≥3:1, including muted
  greys on the white surfaces (verify, don't assume).
- Full `prefers-reduced-motion` support: the 3D flythrough, scroll flashes, and
  section reveals all degrade to static, legible states.
- Keyboard-operable transport, picker, and forms; visible focus rings;
  `aria-live` on status/callout regions.
