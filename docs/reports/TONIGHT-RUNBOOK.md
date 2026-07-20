# Tonight's run — COGNIMUSE + VEATIC + StudyForrest

Goal: get `preds_<id>.npy` for every clip via the improved Colab notebook, so the emotion
head can be validated on three independent targets. All prep tools are built + tested.

## What's already done (no action)
- **COGNIMUSE** clips — **7 movies now cut** (aligned to the annotation window, English audio):
  - `data/clips_cognimuse/` → CHI, FNE, GLA (batch 1)
  - `data/clips_cognimuse_batch2/` → BMI, CRA, DEP, LOR (batch 2 — the 4 new uploads)
- **COGNIMUSE** ratings: `data/cognimuse/human_affect_*.csv` (12 movies).
- **VEATIC** clips + ratings: `data/clips_veatic/` (30) + `data/veatic/human_affect_*.csv`.
- **StudyForrest** human trace: `data/studyforrest/human_affect_forrestgump.csv` (9 observers, 1 Hz).

7 COGNIMUSE movies (up from 3) = a much stronger leave-one-movie-out affect head.

## 1. VEATIC (the sure thing — ships its own clips)
```bash
pip install gdown && gdown 1HZIw8RGsRwwENhJlhNJRL88YyfiE442N   # ~the VEATIC bundle
# unzip it somewhere, e.g. ~/VEATIC (must contain video/ and rating_averaged/)
make veatic VEATIC=~/VEATIC IDS=0-19        # first 20 clips: ratings + downscaled clips
# -> data/veatic/human_affect_veatic*.csv  and  data/clips_veatic/veatic*.mp4
```
Character-affect target (weaker than COGNIMUSE) — good as a supporting check, badged honestly.

## 2. StudyForrest film (the stretch — needs the RIGHT copy)
Source a **25 fps (PAL/European) Blu-ray** Forrest Gump — a US 23.976 fps disc will NOT align.
```bash
make studyforrest-film FILM=~/ForrestGump_25fps.mkv DRY=1   # preview the 7-span plan first
make studyforrest-film FILM=~/ForrestGump_25fps.mkv         # -> data/clips_studyforrest/forrestgump.mp4
```
**Then eyeball one segment boundary** against the movie before trusting it. If your copy
isn't 25 fps or the boundaries look off, skip StudyForrest tonight — COGNIMUSE + VEATIC is a
full night's work — and we'll do shot-cut warping later.

## 3. Upload + run Colab
The improved Cell 2B sweeps **subfolders**, so upload each batch into its OWN subfolder under
`MyDrive/soma/clips` (no need to re-upload finished ones; nothing collides):
   - `clips/cognimuse/`        ← `data/clips_cognimuse/*.mp4` (CHI, FNE, GLA)
   - `clips/cognimuse_batch2/` ← `data/clips_cognimuse_batch2/*.mp4` (BMI, CRA, DEP, LOR)
   - `clips/veatic/`           ← `data/clips_veatic/*.mp4` (30)
   - `clips/studyforrest/`     ← `data/clips_studyforrest/forrestgump.mp4` (only if step 2 checked out)

Also upload `roi_mask_dmn.npy` to `MyDrive/soma/` (as a FILE) — without it you get GLOBAL only.

1. Run the notebook: **Cell 1 → restart → Cell 2B → Cell 3 → Cell 4 → Cell 5** (L4 GPU).
   Cell 2B lists every folder + a `todo` count; Cell 4 loops each clip → `preds_<id>.npy`,
   caches to Drive, prints a live ETA, and SKIPS clips already done. A disconnect resumes —
   safe to leave overnight, and you can add more batches on later nights.
2. Download the results zip; drop every `preds_*.npy` into `data/arcs/`.

## Priorities + budget (it's a lot of video)
COGNIMUSE ≈ 7 × ~30 min ≈ 210 min + VEATIC ≈ 20–30 min + Forrest Gump ≈ 118 min = several
GPU-hours. Order that matters if the night is short: **COGNIMUSE → VEATIC → Forrest Gump**
(FG is longest and has the alignment risk). Because Cell 4 resumes, you can stop any time and
the rest picks up next run. audio+video is fine for all tonight — the German-audio nuance only
matters for the *later* fMRI brain-vs-brain check, not this emotion-head test.

## After the preds are back (I'll drive this)
Different tool per dataset — ping me and I'll run them:
- **COGNIMUSE** (viewer-felt, 7 movies) → `make affect-head-save TARGET=data/cognimuse` (leave-one-movie-out head — the strongest of the three).
- **VEATIC** (character, 30 clips) → `make affect-head-save TARGET=data/veatic`.
- **StudyForrest** (portrayed, 1 movie) → within-video affect test (single-movie, first-diff rank vs circular-shift null), plus the fMRI rung later.
