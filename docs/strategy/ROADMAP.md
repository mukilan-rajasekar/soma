# ROADMAP — from attention arc to specific emotions (honest staircase)

We ship only what a held-out test can reproduce. Named emotions are the goal,
earned **one rung at a time**. Each rung states: goal, how, data needed, the
honest claim it earns, and rough timeframe. Nothing above the current rung goes on
a customer slide as a result — it lives in the greyed "Vision" panel only.

**Two hard ceilings to remember at every rung:**
- **Cortex only.** TRIBE predicts the outer brain surface (fsaverage5). The
  "basement" that gives fear/reward their specificity — amygdala, ventral striatum
  — is invisible until the whole-brain upgrade (Rung 4 prep).
- **Group average.** TRIBE predicts the *average* subject, not an individual. Much
  of the trackable arousal signal is shared stimulus-driven response, not private
  felt emotion.
- Plus: TRIBE's own encoder explains brain responses at only r≈0.2–0.3, so every
  downstream read inherits a modest ceiling.

---

## Rung 0 — Attention arc  *(shipped)*
- **Goal:** relative moment-to-moment attention/salience over an ad.
- **How:** within-video arc from TRIBE cortical predictions, validated vs **TVSum**
  (20-annotator human interest) with a **circular-shift permutation null**
  (`honest_corr_timeseries.py`).
- **Data:** already have — TRIBE fsaverage5 preds + public TVSum. No new data.
- **Honest claim:** "relative attention over this ad, validated vs TVSum, beats a
  circular-shift null." No emotion, no absolute scale.
- **Timeframe:** now (this sprint).

## Rung 1 — 2D affect arc (valence + arousal)  *(near-term, public-data validated)*
- **Goal:** relative valence (feels good↔bad) + arousal (calm↔excited) over time.
- **How:** heavily-regularized ridge (or ROI-feature ridge/PLS collapsing ~20k
  vertices to an affect-network feature set: mPFC, ACC, anterior insula, right TPJ,
  precuneus/PCC) → continuous valence + arousal. A-priori affect maps
  (PINES/EmoNet/Neurosynth) used **only as input features, never as ground truth**.
  Align labels to the ~4–6s HRF lag.
- **Data (all public):** **Emo-FilM** (OpenNeuro ds004872; 30 subjects, 14 films,
  ~1 Hz consensus emotion + valence/arousal), **Lettieri "Emotionotopy" 2019**
  (continuous 6-dim ratings on Forrest Gump), **StudyForrest** for alignment.
  **Validate** held-out per-second against **LIRIS-ACCEDE Continuous** (per-second
  valence/arousal) and require beating BOTH a circular-shift null AND a
  stimulus-only baseline (ffmpeg loudness/cuts/luminance + audio-emotion + sentiment).
- **Honest claim:** "relative 2D affect arc — direction and dynamics of valence and
  arousal." Explicitly relative, dimensional (not named). Realistic ceiling: group
  arousal r≈0.3–0.5, valence weaker (~0.1–0.3).
- **Timeframe:** ~months 0–3 (crude version this sprint = illustrative, labeled).

## Rung 2 — Calibrated affect on **real ads** + start the flywheel  *(months 6–12)*
- **Goal:** per-second valence + arousal with confidence bands, on actual ads.
- **How:** stand up the reaction pyramid on every client engagement — **webcam
  facial coding** (Realeyes/AFFDEX via iMotions; cheap, wide), **continuous
  self-report dials** (CARMA/DARMA; closest cheap felt-affect label, same
  instrument LIRIS used), **wearable EDA/HR** (Empatica/Shimmer; hard-to-fake
  arousal). Per ad, mint `{ad, TRIBE arc, decoder arc, reactions, KPI}`. Score vs
  held-out reactions; residual errors fine-tune. Measure the movies→ads domain gap
  directly (ads are 6–60s, high-cut, no story build).
- **Data:** proprietary + self-funding (client ads × reactions). Start of the moat.
- **Honest claim:** "calibrated valence + arousal with confidence bands on real ads,
  validated on our own held-out ads." First rung that speaks to ads, not movies.

## Rung 3 — A few discrete states, only where signal supports  *(months 12–24)*
- **Goal:** a small set of named states (amusement, tension/suspense, disgust,
  boredom) — each shipped one at a time behind a preset accuracy bar, with an
  **abstain** option.
- **How:** multinomial-logistic / one-vs-rest on vertices/parcels + probability
  calibration. Start with states facial coding is reliable for (happiness,
  surprise); add others only as they clear held-out AUROC on our facial +
  self-report labels. Use rare gold labels to de-bias the cheap facial base.
  Priors: Cam-CAN suspense, Emo-FilM discrete items, Saarimäki 2016, Kragel &
  LaBar 2015 (honest: those used sustained blocks; per-second is harder).
- **Honest claim:** "a small set of states we can separate reliably," per-category
  confidence, abstains when unsure. Realistic: ~40–60% for 3 classes (chance 33%),
  aggregated over clips not seconds.

## Rung 4 — Specific named emotions, fMRI-earned  *(months 24–48)*
- **Goal:** per-second probabilities over a validated subset of the Cowen-Keltner
  27 / Horikawa 34 emotion taxonomy.
- **How:** commission naturalistic **ad-viewing fMRI** (~10–30 subjects,
  whole-brain so subcortex is captured, projected to TRIBE's exact space),
  following **Horikawa, Cowen, Keltner & Kamitani 2020** (iScience; 34 categories
  decoded, categories beat dimensions). Train a reduced-rank / PLS readout;
  pretrain temporal context on unlabeled movie fMRI; the proprietary
  ads×reactions×outcomes corpus supervises the fine distinctions no public set can.
  Parallel track: re-head TRIBE to predict **subcortex** (Tian/CIT168 amygdala-
  striatum atlas) so fear/reward become supportable.
- **Honest claim:** "per-second probabilities over a validated subset of the
  taxonomy," reported as a profile with a per-emotion accuracy table, calibrated
  confidence, abstention, AND a published list of emotions we cannot detect. No
  confident per-second discrete percentages ship before this exists.

---

## The three biggest levers
1. **Train the decoder on TRIBE's OWN predictions** ("predicted-on-predicted"): run
   TRIBE forward on training stimuli, teach the emotion head from *those* outputs,
   so input statistics match at inference. Highest-value accuracy fix.
2. **The proprietary flywheel** `{ad × reactions × KPI}` — the only supervision for
   ad-domain + specific-emotion claims, and the moat competitors can't scrape.
3. **Validation discipline** — held-out films AND subjects, all preprocessing inside
   each fold, circular-shift + phase-randomization nulls, and a mandatory
   stimulus-only baseline the brain decoder must beat.

## Do first (unblocks everything)
Resolve which TRIBE we actually serve: the Algonauts-2025 winner natively predicts
**1,000 Schaefer parcels in MNI volume**, while our pipeline assumes the
**fsaverage5 ~20k-vertex surface** variant. These are NOT interchangeable. Pick one
canonical space and force every training set through the identical transform, or the
decoder's learned weights are meaningless on TRIBE's output.
