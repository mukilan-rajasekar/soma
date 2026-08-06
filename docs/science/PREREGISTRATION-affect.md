# Pre-registration — Rung 1: 2D affect arc (valence + arousal)

**Locked before touching results. Do not change the feature/target/test/split after
seeing any number** — that turns an honest test into cherry-picking. A change means
a new dated pre-registration reported alongside this one.

Companion to `PREREGISTRATION.md` (attention arc). Same honesty rules, new target.

## The question
Does a decoder reading TRIBE's predicted cortical activation recover a **relative
valence** (pleasant↔unpleasant) and **relative arousal** (calm↔intense) arc *within*
a video — better than chance AND better than a stimulus-only baseline?

- Relative, not absolute. Dimensional (valence/arousal), NOT named emotions.
- This is a **hypothesis-stage** claim. It ships labeled "hypothesis" until it
  passes this test; only then does the demo badge flip from red to amber.

## Ground truth (target)
- **Primary:** **LIRIS-ACCEDE Continuous** — per-second induced valence & arousal
  ratings on movie clips (the standard continuous affect benchmark).
- **Train/dev:** **Emo-FilM** (OpenNeuro ds004872; per-second consensus affect) and
  **Lettieri "Emotionotopy" 2019** continuous ratings; **StudyForrest** for
  functional alignment into TRIBE's group-average space.

## Feature (pre-registered)
- Input = TRIBE predicted cortical pattern per second, in the **one canonical space**
  we serve: `SERVED_SPACE = fsaverage5-surface (20484 vertices, [lh; rh])`.
  Settled empirically 2026-07-30, not chosen: every prediction array in the repo
  (152 files across `data/ads/arcs/`, `data/arcs/`, `data/mrhisum/preds/`) is
  `(T, 20484)`, all 10 ROI masks are `(20484,)`, and the Schaefer parcels this
  pipeline uses are the **FreeSurfer5.3/fsaverage5 surface annots** (10242/hemi),
  not the paper's Schaefer-1000 MNI volume. Verify on any preds file with
  `check_preds_space.py`. The Schaefer-1000-MNI path stays supported in
  `build_roi_mask.py --n-units 1000` for a future checkpoint that emits it, but
  nothing we have ever produced has been in that space.
- Decoder = **heavily-regularized ridge** on either all vertices or an a-priori
  affect-network feature set (mPFC, ACC, anterior insula, right TPJ, precuneus/PCC).
  A-priori maps (PINES / EmoNet / Neurosynth) may be **input features only** — never
  the target.
- Two separate readouts: `valence`, `arousal`. Labels convolved/shifted to the
  **~4–6 s HRF lag**.
- **Predicted-on-predicted:** train the decoder on TRIBE's OWN forward predictions of
  the training stimuli, so input statistics match inference. Locked as the method.

## Test (exact)
1. Put decoder output and the human affect curve on a common per-second grid.
2. **First-difference** both (removes shared slow drift).
3. Report **Pearson r AND CCC** (concordance) per video for valence and arousal.
4. **Circular-shift permutation null** (≥5000) for per-video p (autocorrelation-safe).
5. **Mandatory stimulus-only baseline:** an ffmpeg/audio/sentiment model
   (loudness, cut-rate, luminance, audio-emotion, dialogue sentiment) predicting the
   SAME target. **The brain decoder must beat this baseline** — otherwise we are just
   re-deriving the ad's editing, not reading the brain. Report both.

## Splits (leakage-proof)
- **Nested leave-one-FILM-out AND leave-one-SUBJECT-out**; report the harder
  **film-generalization** number as the headline.
- ALL preprocessing (z-scoring, feature selection, decoder fit) inside each fold.
- No random-timepoint splits (adjacent seconds are autocorrelated → inflated).

## Decision (agreed in advance)
- **Earns Rung 1 (badge → amber "weakly validated")** if valence and/or arousal
  beat BOTH the circular-shift null AND the stimulus-only baseline on held-out films,
  with consistent sign across films.
- **Null** = does not beat baseline/null. Then it stays a red "hypothesis" badge and
  we say so. A null is a legitimate pre-registered outcome, reported plainly.
- Realistic expectation: arousal r≈0.3–0.5, valence weaker (~0.1–0.3). We report the
  real number, band and all.

## Disclosures
- Cortex-only + group-average ceilings (see ROADMAP.md).
- Domain shift: training is on **movies**, not ads — we report the movies→ads gap
  when Rung 2 data arrives; we do not assume transfer.
- Sign ambiguity: the sign of z-BOLD is NOT the sign of valence; it is learned and
  validated, never assumed.
