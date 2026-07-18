# Demo — precomputed neural ad pre-test player

A **static, self-contained** player: video (or timer) on the left, the predicted
per-second activation arc synced on the right, red weak-spot callouts, and the
honesty labels baked in. No GPU, no backend, no build step — `arc_<id>.json` files
are static assets.

## Run locally
```bash
cd demo
python3 -m http.server 8000
# open http://localhost:8000/            (loads arcs/sample_arc.json)
# open http://localhost:8000/?arc=arcs/arc_hero1.json   (a specific arc)
```
(`fetch()` needs http, not `file://` — hence the tiny server.)

## Deploy (Vercel, zero config)
```bash
cd demo && vercel        # or drag the folder into any static host
```

## Wiring real footage + arcs
1. Run `batch_extract.py` on your hero clips → it writes `arc_<id>.json` here.
2. Drop each into `demo/arcs/`.
3. In each arc JSON, set `"video_src"` to the clip URL to sync real footage.
   Leave it empty to play the arc on a timer (fine for a first pass).

## The honesty rules this demo enforces (do not remove)
- The **"precomputed · cached result"** chip is always visible; say it aloud once
  on stage. The smooth playback is a frozen offline TRIBE result, not live compute.
- The **two-tier claim banner** stays up: *video → activation* is validated;
  *activation → engagement* is a tested hypothesis. Never relabel the arc
  "interest/attention/engagement" as established fact.
- Weak-spot callouts are model **predictions**, not measured eye-tracking/panel.
- The **"Upload your own ad"** button is a deliberate disabled stub. When you build
  the second MVP tier, wire it to a real Modal/Replicate job (see the
  `wireUploadHook()` note in `app.js`). It must **genuinely run** — no fake progress
  bar standing in for inference.
- Keep a **screen recording** of the demo as backup; if you fall back to it on
  stage, say "this is a recording."
