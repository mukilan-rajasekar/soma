# Demo — Soma neural ad pre-test player

A **static, self-contained** marketing + product demo. No build step, no runtime CDN:
everything is vendored, and `arc_<id>.json` files are static assets (live arcs are
fetched from Supabase at runtime — see below).

## What's on the page (`index.html`)

- **3D cortex hero** (`brain3d.js`) — a front-facing translucent fsaverage6 surface with
  a scroll flythrough. **Decoration, not prediction data** (watermarked as such). Degrades
  3D → 2D (`scrollbrain.js`) → static frame on no-WebGL / reduced-motion.
- **Read-out console** (`app.js`) — pick an ad, then three time-synced lanes on one
  playhead: **attention** (amber *predicted · validating* badge), **valence** + **arousal**
  (red *hypothesis* badges), plus an optional coarse-affect lane. A left cortical read-out
  animates with the activation scalar. Weak-spot callouts pin to the timeline.
- **Upload box** — a **real** concierge intake: a visitor's video goes to a private
  Supabase Storage bucket + an `uploads` queue row (see `../supabase/`). Not a stub.
- **A/B compare**, a **roadmap** ladder, and a link to **`waitlist.html`** (early access,
  writes to Supabase via the `join_waitlist` RPC, `localStorage` fallback).
- `pitch.html` — an 8-slide keyboard deck (not linked from the demo by design).

## Honesty labels this demo carries (do not quietly remove)

- **Per-lane evidence badges** encode the tier the console reads at: attention =
  amber *predicted · validating* (the activation→attention step is our hypothesis,
  being tested vs TVSum); valence/arousal = red *hypothesis* (an unvalidated cortical
  proxy, not a decoder). Never relabel the arc as established "interest/engagement."
- The 3D hero + the 2D background brain are **decoration** and say so (watermark/comment).
- Weak-spot callouts are model **predictions**, not measured eye-tracking or panel data.
- The console SVG is an **illustrative regional view**, not a per-vertex render.

## Run locally
```bash
cd demo
python3 -m http.server 8000
# open http://localhost:8000/     (fetch() needs http, not file://, hence the server)
```

## Deploy
Push to `main` → **Vercel auto-deploys** (root = `demo/`; ~15s). Security headers +
CSP come from `vercel.json`. (Or `cd demo && vercel --prod` for a manual deploy.)

## Adding real arcs
Two ways — the **live** path needs no redeploy:

1. **Live (preferred):** run the pipeline → `arc_<id>.json` → `python
   ../publish_to_supabase.py arc_<id>.json`. `app.js` `mergeLiveArcs()` folds any
   published arc into the picker on the next page load. See `../supabase/README.md`.
2. **Static:** drop `arc_<id>.json` into `demo/arcs/` and add an entry to the `VIDEOS`
   array in `app.js`. Set `"video_src"` in the arc to sync real footage; leave it empty
   to play on a timer.

## Files
`index.html` · `app.js` (console) · `brain3d.js` (3D hero) · `scrollbrain.js` (2D
fallback) · `styles.css` + `DESIGN.md` (design system) · `supabase.js` +
`supabase-config.js` (live arcs / waitlist / upload) · `waitlist.html` · `pitch.html`
· `arcs/` (sample + real arc JSON) · `assets/` (fs6 geometry) · `vendor/` (three.js, lenis).
