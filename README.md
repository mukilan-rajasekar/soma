# Soma

**Predict how a video ad performs — from the file alone, no human panel.**

Upload a video; Soma runs it through a *simulated brain* (Meta's public **TRIBE v2**
encoder, an Algonauts-2025 winner) and reads out a second-by-second **attention arc**,
a coarse **emotion arc** (valence / arousal), and **weak-spot callouts** ("you lose
them at 0:12") — then lets you compare cuts and variants across runs. Faster and
cheaper than panel-based pre-testing.

**🔗 Live demo → https://soma-jet-tau.vercel.app**  ·  Product vision & roadmap → [`VISION.md`](VISION.md)

> **The one honesty rule that governs this whole repo:** the model predicts
> **brain activation**, not "interest" or "engagement." The attention arc is a
> **pre-registered, running test that MAY RETURN NULL** — never label it
> "validated." The affect (valence / arousal) layer is an explicit
> **hypothesis / unvalidated proxy**. All outputs are **group-average, cortex-only**.
> We never fabricate numbers or named-emotion percentages.

## The honest framing (read this first)

There is a three-step chain and **only step 1 is externally validated**:

1. **video → brain activation** — Meta's TRIBE v2. Public, benchmarked, not ours.
2. **activation → summary arc** — arithmetic on the predicted activation
   (magnitude in an a-priori ROI). Descriptive.
3. **arc → "attention / engagement"** — **our hypothesis.** Being tested *now*
   against a public human-attention curve (TVSum, 20 annotators) within each
   video, with an autocorrelation-aware permutation null. A null is a legitimate,
   pre-registered outcome and we report it as such.

**Meta built the eye; Soma builds the lens.** The encoder is public — anyone can
download the same weights, so it is **not** a moat. The moat is (1) honest
validation nobody else does, (2) the product, and (3) the proprietary *ad ×
real-outcome* data flywheel our design partners generate. See [`VISION.md`](VISION.md)
for the full "what's Meta's vs ours" and the evidence ladder.

## Live demo & deployment

- **`demo/`** is a self-contained static site — no build step, no runtime CDN. A 3D
  translucent cortex hero (decorative, watermarked) scrolls into a **data console**
  that renders real precomputed arcs: attention / valence / arousal lanes, weak-spot
  callouts, an A/B variant compare, and green/amber/red evidence badges.
- **Deployed on Vercel**, auto-deploys on push to `main`; every PR gets a preview URL.
- **Early-access waitlist** writes to **Supabase** (`supabase/schema.sql`,
  `supabase/README.md`) with row-level security; falls back to `localStorage` if
  unconfigured. A shared `arcs` table backs cross-team results.

## File map

### Pipeline scripts (Python)

| File | Role |
| --- | --- |
| `batch_extract.py` | **GPU runbook.** Runs TRIBE v2 on a folder of clips → caches `preds_<id>.npy` (raw `(T, 20484)` predicted activation) + `arc_<id>.csv` (`t_sec, global_mag, roi_mag`) + `arc_<id>.json` (demo-ready). Prints the preds distribution to confirm the z-scored signed-BOLD scale. |
| `tvsum_trim.py` / `make trim` | Downloads TVSum + trims/downscales each clip to its first N seconds on your laptop, so Colab spends GPU minutes only on the brain-math. |
| `build_roi_mask.py` | Builds the a-priori ROI masks (DMN / DAN / valence / arousal) on the fsaverage5 surface via nilearn. Asserts length 20484. |
| `tvsum_prep.py` | Turns TVSum (20-annotator per-frame importance) into per-video human-interest arcs — the public replacement for private retention curves. |
| `honest_corr_timeseries.py` | **PRIMARY within-video test.** Predicted arc vs human arc, first-differenced, circular-shift permutation null, leave-one-annotator-out ceiling, all-videos forest report. Runs `global` (baseline) + `roi` (open test). |
| `train_head.py` | Our first *trained* read-out head — a small ridge over frozen TRIBE features → attention, validated leave-one-**video**-out with a nested baseline it must beat. Weights are ours; encoder is Meta's. **Not validated until the real GPU run lands.** |
| `honest_corr.py` | SECONDARY between-video test (retention_pct); underpowered at small n, reported transparently. |
| `baseline_extract.py` + `incremental_validity.py` | The "why not just ffmpeg?" guard — does the brain arc beat dumb audiovisual features (loudness/cuts/luminance/motion)? |
| `affect_extract.py` | CPU proxy: `preds` + valence/arousal masks → a `valence[] / arousal[]` block in `arc_<id>.json`, always badged `proxy-hypothesis`. |
| `publish_results.py` | Turns a **real** `results.csv` into `demo/results.json`. Honest by construction: stamps `null_result` when p ≥ α. |

### Test harness (`tests/`)

| File | Role |
| --- | --- |
| `tests/make_synthetic_data.py` | Generates fixtures (`synth_sig*` carry a planted signal, `synth_null` is a control). No GPU, no real data. |
| `tests/dry_run.py` | Runs the **whole** pipeline on the fixtures and asserts it behaves: detects the planted signal, stays quiet on the null, and every stage produces well-formed output. |

### Docs (in this repo)

| File | Role |
| --- | --- |
| [`VISION.md`](VISION.md) | Product vision, the pitch, the honest evidence ladder, and the R0→R4 roadmap. |
| `ROADMAP.md` | The rung-by-rung staircase past the sprint. |
| `PIPELINE.md` | End-to-end runbook tying every script together (GPU track + demo track). |
| `colab_README.md` | Copy-paste free-T4 Colab runbook (mirrors `batch_extract.py`). |
| `PREREGISTRATION.md` / `PREREGISTRATION-affect.md` | The **locked** analysis plans. Read before running; do not change after seeing results. |

> Some strategy/application docs (e.g. the YC draft, session notes) are kept **out of
> this repo by design** — see `.gitignore`. Nothing here fabricates a result.

## Quickstart

Two independent steps. The **GPU step generates the arcs** (slow, needs a big GPU);
everything downstream — stats, demo, tests — is **CPU / browser only**.

### 1. GPU / inference step (free Colab T4, recommended)

The audio+video TRIBE config runs on a free Colab **T4**. Open `colab_run.ipynb` and
follow `colab_README.md`:

```bash
# on your laptop, once — trim clips so Colab only spends GPU on the brain-math:
brew install ffmpeg
make trim N=15 SEC=120        # download TVSum + trim each clip to its first 2 min
# → upload data/clips_trimmed/ to Google Drive (MyDrive/soma/clips), then run Colab Cell 2B
```

Per clip Colab writes `preds_<id>.npy` + `arc_<id>.csv` + `arc_<id>.json` to Drive
(runs **resume** across disconnects). `preds` are **z-scored, signed BOLD (~[-1,+1]),
NOT 0–1 probabilities** — Cell 4 prints the real distribution so you never assume it.

### 2. CPU / analysis step (local venv, no GPU)

```bash
python -m venv .venv && ./.venv/bin/pip install -r requirements.txt

python tvsum_prep.py --mat ./data/ydata-tvsum50.mat --out ./data/tvsum --shot-sec 2.0
python honest_corr_timeseries.py \
    --model-glob "./data/arcs/arc_*.csv" --human-dir ./data/tvsum \
    --feature both --n-perm 5000 --out ./validation/tvsum_run
```

Read the forest table + combined p **per feature**: does `roi` survive the
circular-shift null across videos while `global` is null? Report every row, including
a null.

### Verify the plumbing without a GPU

```bash
make synth      # generate synthetic fixtures in tests/synth/
make dryrun     # run the full pipeline on them; asserts signal detected + null quiet
```

## Reproducibility notes

- **Analysis is fully CPU/local.** The only GPU dependency is generating
  `preds_<id>.npy`; once cached, the arcs are static assets.
- The pinned `numpy>=1.26,<2.1` constraint is a hard requirement of the TRIBE /
  neuralset stack — do not bump it.
- See `requirements.txt` for the two dependency groups (GPU/inference vs CPU/analysis)
  and `PIPELINE.md` for the full runbook.
