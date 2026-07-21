# colab_run.ipynb — free T4 run instructions

A single copy-paste Colab notebook that runs Meta's public **TRIBE v2** brain-encoding
model on a folder of video clips and caches the same artifacts as `batch_extract.py`, so
the output drops straight into `honest_corr_timeseries.py` and the demo player.

- **Config:** audio + video only (text/LLaMA path OFF) — the config verified to run on a
  free Colab **T4**.
- **Outputs per clip** (written to your Drive `arcs/` folder):
  - `preds_<id>.npy` — raw predicted activation, shape `(n_seconds, 20484)` (fsaverage5).
  - `arc_<id>.csv` — `t_sec, global_mag[, roi_mag]` (per-second magnitudes).
  - `arc_<id>.json` — demo-ready normalized arc + predicted weak-spot spans.

## Two data paths — pick one

- **Path A (simplest, heaviest on GPU quota).** Cell 2 downloads all of TVSum into Colab
  and does everything on the GPU clock. Fine for a one-off; wastes free-tier minutes on a
  641 MB download + extraction.
- **Path B (recommended, least GPU).** Do the cheap work on your laptop first:
  ```
  brew install ffmpeg            # one time
  make trim N=3 SEC=120          # download TVSum + trim each clip to its first 2 min + downscale
  ```
  Upload `data/clips_trimmed/` to Google Drive at `MyDrive/soma/clips`, then use **Cell 2B**.
  Colab spends its GPU minutes *only* on the brain-math. Results write to Drive, so runs
  **resume** across disconnects — a wiped machine or a hit quota never costs you a redo, and
  small batches stack up (3 today + 3 tomorrow). This is what stretches the free quota furthest.
  - **Honesty:** for TVSum the trim is always from `t=0`. The validator lines the brain arc up
    with the human arc by *video second*, so a first-N-seconds excerpt compares cleanly against the
    same window; trimming from the middle would silently desync the grids — so don't.
  - **COGNIMUSE clips are the opposite end** and easy to get wrong: the annotation covers the last
    ~30 min of each film's STORY, so `cognimuse_films.py` cuts a window ENDING at the last story
    frame (via `--story-end`, not the file's end — the file's tail is 3–9 min of end credits the
    annotation never rated). See `COGNIMUSE-ALIGNMENT-FIX.md`. Same rule holds: clip-second t must
    equal annotation-second t, so verify a re-cut clip's last frame is a story shot, not a credit.

## Before you start

1. In Colab: **Runtime ▸ Change runtime type ▸ Hardware accelerator = T4 GPU**.
2. **Data:** Path A → nothing to prep, Cell 2 downloads TVSum into the runtime. Path B → run
   `make trim` on your laptop and drop the clips in `MyDrive/soma/clips` (Cell 2B). Own ad
   clips also go through Cell 2B.
3. **HuggingFace:** `facebook/tribev2` is **public — no license/access request needed**. A
   free HF token is optional (avoids rate limits); the audio+video config never touches the
   gated LLaMA path. **Trimodal** (audio+video+**text**) is the full-strength upgrade and DOES
   need gated **`meta-llama/Llama-3.2-3B`** access + `uv`/whisperx — it lives in the **T1/T3/T4
   cells** below and is documented in `TRIMODAL.md`. (Transcription is built into tribev2 — the
   text branch makes its own transcript with whisperx; you supply nothing.)
4. (Optional, for the a-priori ROI test) run `build_roi_mask.py` locally, upload the
   resulting boolean `.npy` (length 20484) to Drive/Colab, and set `ROI_MASK_PATH`.

## The steps

1. **Cell 1 — install deps.** Installs the pinned TRIBE/neuralset stack and force-pins
   `numpy>=1.26,<2.1` + `scipy 1.13–1.16`, and sets `HF_HUB_DOWNLOAD_TIMEOUT=300`. It ends
   by telling you to **Runtime ▸ Restart session** — do it, then re-run from **Cell 2**
   (skip Cell 1 on the second pass). The restart is required so Colab reloads the pinned
   NumPy/SciPy.
2. **Cell 2 — get TVSum50.** Downloads the 641 MB archive into the runtime, extracts it,
   stages `N_CLIPS` videos into `CLIP_DIR`, and copies `ydata-tvsum50.mat` into `OUT_DIR` so
   it rides home in the results zip. Sets every path Cell 4 needs — no Drive required. (TVSum
   videos are 1–11 min each, so start with a small `N_CLIPS`.)
   - **Cell 2B** (Path B) — mounts Drive, reads the pre-trimmed clips from
     `MyDrive/soma/clips`, and writes results to `MyDrive/soma/arcs` so they **persist**. It
     prints `already done -> N to run` so you can see the resume working. Use this *instead of*
     Cell 2. (Also the cell for your own ad clips.)
3. **Cell 3 — load TRIBE.** Loads `facebook/tribev2` with the verified
   `features_to_use=["audio","video"]` config. First run downloads ~1 GB into `./cache`.
4. **Cell 4 — batch extract.** Per clip: build events → `model.predict` → save
   `preds_<id>.npy` → reduce to `arc_<id>.csv` + `arc_<id>.json`. It prints the `preds`
   distribution **once** so you can confirm the values are z-scored, signed BOLD
   (~[-1, 1]), **not** 0..1 probabilities. Already-cached clips are skipped; a bad clip is
   logged and the batch continues.
5. **Cell 5 — zip + download.** Zips `OUT_DIR` and downloads it. Results are also already
   in your Drive.

### Trimodal cells (T1 / T3 / T4 — the optional full-strength upgrade)

After Cell 5 there's a **TRIMODAL** block that runs the model at full strength (audio + video +
**text/dialogue**). Requires an **A100** + gated **`meta-llama/Llama-3.2-3B`** access. Run order in
a fresh session: **Cell 1 → restart → T1** (installs `uv`/whisperx, HF login; wait for `[OK]`) **→
Cell 2B → T3** (loads `model_tri` with `features_to_use=['audio','video','text']`) **→ T4** (writes
to a **separate** `MyDrive/soma/arcs_trimodal/`). It never touches your AV `arcs/`, so you can
compare av vs trimodal on the same clips. Full details + Llama-access steps: **`TRIMODAL.md`**.

## Honesty notes (do not remove)

- Only **step 1** (video → brain activation) is validated; TRIBE is benchmarked against
  real fMRI. The activation → attention/engagement reading is **our hypothesis, not a
  result.** The attention arc is pre-registered and may return null.
- `preds` are **z-scored, signed BOLD**, not probabilities — Cell 4 prints the real
  distribution so you never have to assume it. This is the fix for the old
  `mean(preds > 0.6)` bug.
- Outputs are group-average, cortex-only. Nothing is trained on our side (inference only).
  No numbers in this notebook are fabricated — every cell ships with empty outputs.

## Troubleshooting

- **`ModuleNotFoundError: tribev2` after Cell 3** — you skipped the restart in step 1.
  Re-run Cell 1, restart, then continue from Cell 2.
- **No clips found (Cell 2)** — fix `CLIP_DIR` / `GLOB`; the path is case-sensitive and
  Drive mounts under `/content/drive/MyDrive/...`.
- **HF download stalls** — the timeout is already 300 s; re-run Cell 3, it resumes from the
  `./cache` partial download.
- **`ROI mask length ... != n_vertices`** — the mask must be length 20484 (fsaverage5,
  `[lh; rh]`); rebuild it with `build_roi_mask.py`.
