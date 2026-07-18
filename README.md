# Soma

Neuroscience-grounded video-ad pre-testing. Predict whether a video ad will hold a
viewer's attention — **from the video file alone, no human panel** — by predicting
the brain's response with a public brain-encoding model (Meta **TRIBE v2**, an
Algonauts-2025 winner) and checking that prediction against real human viewing
behavior.

> **The one honesty rule that governs this whole repo:** the model predicts
> **brain activation**, not "interest" or "engagement." The attention arc is a
> **pre-registered, running test that MAY RETURN NULL** — never label it
> "validated." The affect (valence/arousal) layer is an explicit
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

The wedge is the **signal source**, not the arc's shape: competitors read attention
from black-box human panels (Realeyes, Neurons) or simulate self-report by prompting
an LLM persona (Aaru, Simile). Soma predicts the actual cortical response with a
public, reproducible model — with an explicit validated-vs-hypothesis boundary
neither camp offers. The brain model is **not** a moat (anyone can download the same
weights); the moat is validation + product + customers.

## File map

### Pipeline scripts (Python)

| File | Role |
| --- | --- |
| `batch_extract.py` | **GPU-box runbook.** Runs TRIBE v2 on a folder of clips → caches `preds_<id>.npy` (raw `(T, 20484)` predicted activation) + `arc_<id>.csv` (`t_sec, global_mag, roi_mag`) + `arc_<id>.json` (demo-ready). Prints the preds distribution to confirm the z-scored signed BOLD scale. |
| `build_roi_mask.py` | Builds the a-priori ROI masks (DMN / DAN / valence / arousal) on the fsaverage5 surface via nilearn's Destrieux atlas. Asserts length 20484. |
| `tvsum_prep.py` | Turns TVSum (`ydata-tvsum50.mat`, 20-annotator per-frame importance) into per-video human interest arcs + per-annotator matrices on a real seconds timebase. The public replacement for private retention curves. |
| `honest_corr_timeseries.py` | **PRIMARY within-video test.** Predicted arc vs human arc, first-differenced, circular-shift permutation null, leave-one-annotator-out noise ceiling, all-videos forest report. Runs both pre-registered features (`global` baseline + `roi` open test). Exposes reusable stats helpers (`spearman`, `pearson`, `first_diff`, `circular_shift_p`, `resample_to_grid`, ...). |
| `honest_corr.py` | SECONDARY between-video test (outcome = retention_pct). Underpowered at small n; reported transparently. |
| `baseline_extract.py` | Dumb-baseline extractor: per-second loudness / cuts / luminance / motion from the video file (no brain model). |
| `incremental_validity.py` | Partial-correlation test — does the brain arc predict human interest **over and above** the dumb baseline features? |
| `affect_extract.py` | CPU proxy: `preds` + valence/arousal masks → a `valence[] / arousal[]` block (with lo/hi bands) written into `arc_<id>.json`. Status is always `proxy-hypothesis`. |

### Test harness (`tests/`)

| File | Role |
| --- | --- |
| `tests/make_synthetic_data.py` | Generates the synthetic fixtures in `tests/synth/` (preds with a planted signal + a null control, fake TVSum `.mat`, LIRIS-style affect CSVs, ROI masks, a tiny mp4). No GPU, no real data. |
| `tests/dry_run.py` | Runs the **whole** analysis pipeline end-to-end on the synthetic data and asserts it behaves: detects the planted signal, stays quiet on the null control, and every stage produces well-formed output. |
| `tests/synth/` | The generated fixtures + a `MANIFEST.json` (`synth_sig1` / `synth_sig2` carry signal; `synth_null` is a control). |

### Demo (`demo/`)

Self-contained static player — no GPU, no backend, no build step. `index.html` +
`app.js` + `styles.css` load a precomputed `arc_<id>.json` and draw three synced
lanes (attention / valence / arousal) with evidence badges (green validated /
amber weakly / red hypothesis) and a "Vision" roadmap panel. `pitch.html` is the
deck. See `demo/README.md` for the honesty rules baked into the UI (the
"precomputed" chip, the two-tier claim banner, the marked upload stub).

### Docs

| File | Role |
| --- | --- |
| `PIPELINE.md` | End-to-end Day-2 runbook tying every script together (GPU track + demo track). |
| `ROADMAP.md` | Where this goes past the sprint. |
| `WEEK-PLAN.md` | The day-by-day sprint plan. |
| `YC-APPLICATION.md` | The YC application draft + the four interview-killer answers. |
| `PREREGISTRATION.md` | The **locked** attention analysis plan. Read before running the test; do not change after seeing results. |
| `PREREGISTRATION-affect.md` | The locked (hypothesis-level) affect analysis plan. |
| `CLAUDE.md` | Project rules that load every coding session (build half + YC half). |

## Quickstart

There are two independent steps. The **GPU step generates the arcs** (slow, needs a
rented A100). Everything downstream — stats, demo, tests — is **CPU / browser only**.

### 1. GPU / inference step (Colab or a rented box)

Full trimodal TRIBE needs ~28–32 GB VRAM (A100-40GB or L40S; ~$1–2/hr on
RunPod / Lambda / Vast). The audio+video config is the verified default and the
fastest path to a result.

```bash
# on the GPU box, once:
pip install -U "numpy>=1.26,<2.1" scipy pandas nilearn torch   # neuralset needs numpy<2.1
export HF_HUB_DOWNLOAD_TIMEOUT=300

# build the a-priori ROI mask, then batch TRIBE over your clips:
python build_roi_mask.py --network dmn --out ./data/roi_mask_dmn.npy
python batch_extract.py --video-dir ./clips --out ./data/arcs --roi-mask ./data/roi_mask_dmn.npy
```

`preds` are **z-scored, signed BOLD (~[-1, +1]), NOT 0–1 probabilities** — confirm
the printed distribution has a real fraction < 0. The `.npy` caches are
deterministic; never re-run them at analysis time. TRIBE load API is documented in
`batch_extract.py` and `PIPELINE.md`.

### 2. CPU / analysis step (the local venv, no GPU)

```bash
# one-time:
python -m venv .venv && ./.venv/bin/pip install -r requirements.txt   # (install the CPU group)

# fetch + prep the public human arcs, then run the pre-registered test:
python tvsum_prep.py --mat ./tvsum/ydata-tvsum50.mat --out ./data/tvsum --shot-sec 2.0
python honest_corr_timeseries.py \
    --model-glob "./data/arcs/arc_*.csv" --human-dir ./data/tvsum \
    --feature both --n-perm 5000 --out ./validation/tvsum_run
```

Read the forest table + combined p **per feature**. The honest result: does `roi`
survive the circular-shift null across videos while `global` is null? Report all
rows, including a null.

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
- See `requirements.txt` for the two dependency groups (GPU/inference vs
  CPU/analysis) and `PIPELINE.md` for the full runbook.
