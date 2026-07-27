# Soma

Two things live in this repo:

1. **The site** — a [Next.js 16](https://nextjs.org) product/marketing site (`src/`, `public/`),
   live at **[usesoma.work](https://usesoma.work)**.
2. **The pipeline** — a Python inference pipeline that turns a video into a Meta TRIBE v2
   brain-activation arc, then into a trained attention read-out.

The pipeline produces the arcs the site renders. Everything below is honest about what is
validated and what is not — read the "Where the science stands" section before quoting any number.

## The site

A white editorial marketing/product site built on Next.js 16 (App Router, React 19, Tailwind v4,
Geist font). Routes live under `src/app/` — `/` (landing), `/demo` (arc player), `/story`,
`/brain-lab`, `/science`, `/compare`, `/pitch`, `/faq`. The 3D brain hero
(`src/components/BrainField.tsx`, `src/components/brainlab/*`) renders the fsaverage cortical
surface from `public/brain/*.bin`.

Run it locally:

```bash
npm install
npm run dev      # http://localhost:3000
```

> Note: this is Next.js 16, which has breaking changes vs. earlier majors. See `AGENTS.md`.

## The pipeline

`video → Meta TRIBE v2 brain-activation arc → trained read-out head → arc_<id>.json`. The TRIBE v2
encoder is frozen and Meta's; the read-out weights are ours. The tracked scripts, by role:

**Extract activation**
- `batch_extract.py` — runs TRIBE v2 on a folder of clips, caching per clip `preds_<id>.npy`
  (raw signed BOLD, `n_timesteps × 20484`), `arc_<id>.csv`, and the demo-ready `arc_<id>.json`.
  Computes two pre-registered features: `global` (whole-cortex magnitude, the likely-null baseline)
  and `roi` (magnitude within an a-priori region).
- `build_roi_mask.py` — builds the a-priori ROI vertex mask on the fsaverage5 20,484-vertex surface
  (default: Default Mode Network).

**Read-out head (attention)**
- `train_head.py` — fits a small ridge read-out head mapping activation to the TVSum human-interest
  arc, validated leave-one-video-out. Must beat the untrained arithmetic `roi_mag` arc (nested as
  an input) for any win to count as incremental.
- `head_io.py` — serializes a fitted head to a self-contained JSON (schema `head-1.0`, weights +
  masks packed together) and applies it to an unseen clip's preds.
- `head_apply.py` — scores a new video with a saved head, writing the head-predicted lane into
  `arc_<id>.json` as the headline and demoting the arithmetic arc to a labeled baseline.

**Validation harnesses**
- `honest_corr_timeseries.py` — within-video arc validation (TRIBE activation vs. TVSum attention),
  first-differenced with a circular-shift null and a leave-one-annotator-out ceiling.
- `incremental_validity.py` — partial correlation: does the brain arc predict human interest
  over-and-above a dumb ffmpeg baseline (loudness/cuts/luminance/motion)?
- `ad_backtest.py` — cross-sectional test: does one neural score per ad rank real ads by their real
  outcome, over-and-above the ffmpeg summary? `ad_fetch_bb.py` collects the ad set (Browserbase).

**Exploratory affect / message lanes** (unvalidated proxies — hypotheses, not results)
- `affect_extract.py` — crude a-priori valence/arousal proxy arc.
- `affect_head.py` — the trained-head analogue for affect (validated against LIRIS-ACCEDE).
- `coarse_states.py` — soft affect-quadrant probability spread over time.
- `message_extract.py` — semantic-integration-load lane over an a-priori language ROI.

**Publish / build**
- `publish_to_supabase.py` — pushes `arc_<id>.json` files into the shared Supabase `arcs` table so
  they appear live in the demo without a redeploy (server-side, service_role key).
- `tools/export_brain.py` — build-time only: dumps the fsaverage cortical surface to
  `public/brain/*.bin` for the site's 3D hero. Decoration, never a real prediction.

Run the pipeline locally:

```bash
python3 -m venv .venv                        # 3.13.13 is the interpreter in use here
./.venv/bin/pip install -r requirements.txt
npm test                                     # the Python suite (.venv/bin/python -m pytest -q)
```

Nothing here is installed system-wide: every script, and step 3 of the gate below, expects
`./.venv/bin/python`. Deps are in `requirements.txt`, annotated with why each one is pinned —
read its header before adding to it, since the GPU (TRIBE v2) group installs into a *separate*
environment from the one above.

## Checks

```bash
npm run verify                 # the gate: build + eslint src + pytest + a Playwright smoke pass
SKIP_SMOKE=1 npm run verify    # same without the smoke pass (~40s)
npm run typecheck              # tsc --noEmit, the fast subset while iterating
```

`scripts/verify.sh` is the only command that says whether a change is shippable — run it before
you push. It is also what the unattended improvement loop (`scripts/loop.sh`) judges each
iteration by, so treat it as the contract rather than as a convenience script.

## How the two connect

The pipeline emits arc JSON; the site renders it, two ways:

- **Bundled samples** — `public/arcs/*.json` ship with the app as the `/demo` player's baseline.
- **Live arcs** — `publish_to_supabase.py` writes arcs into Supabase; `src/app/api/arcs/route.ts`
  serves the public rows, and the demo client (`src/components/demo/live.ts`) fetches them. A newly
  published arc shows up without a redeploy; if Supabase is unconfigured the demo falls back to the
  bundled samples.
- **Brain mesh** — `tools/export_brain.py` emits `public/brain/*.bin`, which the brain components
  fetch directly.

## Where the science stands

Be careful with claims here; the pre-registration is locked in `docs/science/PREREGISTRATION.md` and
`docs/science/PREREGISTRATION-addendum.md`, and the numbers live in `validation/*.csv`.

- The **primary, pre-registered test** — the raw brain arc vs. human attention on TVSum (n=15) —
  came back **null**.
- The **exploratory trained read-out head** shows a weak aggregate signal but is **not a validated
  win**. The head does not beat the plain ffmpeg baseline on most clips. Quoting the
  `validation/head_incremental.csv` footer verbatim:

  ```
  # median_raw=0.1719 median_partial=0.1784 adds=2/15 stouffer_p=0.0005
  ```

  i.e. a combined Stouffer p of 0.0005, but only 2 of 15 clips individually beat the baseline.

A head arc on a new video is out-of-distribution from the training proxy — a hypothesis, not a
validated result — and the code badges it that way. Do not describe the attention/affect read-outs
as "validated."

## Docs

- `docs/strategy/` — `VISION.md`, `PRODUCT.md`, `ROADMAP.md`, `COMPETITORS.md`, `OPPORTUNITIES.md`.
- `docs/science/` — the locked pre-registration and its addendum.
- `docs/pipeline/` — `INFERENCE-PIPELINE.md`, the pipeline walkthrough.
- `docs/DESIGN-SYSTEM.md` — the current design source of truth. `docs/BUILD-SPEC.md` — build spec.

## Author

Mukilan Rajasekar &lt;mukilan.rajasekar@gmail.com&gt;
