# PREREGISTRATION — trained read-out head (train_head.py)

**Dated: 2026-07-17.** This locks the design of SomAI's first *trained* model BEFORE any
result is seen, so the outcome cannot be reverse-engineered by feature/ROI/alpha hunting.
It is the head analogue of `PREREGISTRATION.md` (which covers the untrained arithmetic arc).

---

## What this is (and is not)

- **Is:** a small, heavily-regularized **ridge** read-out head fit on top of **frozen**
  Meta TRIBE v2 features, mapping per-second cortical activation → the TVSum human-interest
  arc. The head's weights are ours; the encoder is Meta's.
- **Is not:** a new brain encoder, a validated attention/engagement predictor, or a moat.
  Predicting TVSum importance is still **step-3 hypothesis** territory (activation →
  attention), just *learned* instead of hand-picked. TVSum is a **public proxy** for
  top-down interest, not an ad outcome. Head output is badged `status: learned-hypothesis`.

## Honesty pre-commitments (binding)

1. **Report every held-out video** (forest + CSV). No best-of-N.
2. **If the head does not beat the untrained arc out-of-sample, say so plainly.** Do not
   swap features/ROIs/alpha to hunt a win. A null head on a public proxy at ~10–20 videos
   is an expected, honest v0 outcome; the learned-head bet then moves to proprietary
   ad-outcome data — that is the moat, not out-training Meta.
3. **Never** leave a head-generated `results.json` in `demo/`, and never label head output
   "validated."
4. The paired cross-video "beats baseline" test has only ~10–20 independent units
   (VIDEOS, not shots — shots within a video are autocorrelated). It is **underpowered and
   hypothesis-generating**, and must be reported as such.

## Inputs (fixed, a-priori — no fitting, so leakage-impossible)

- **Source:** `preds_<id>.npy`, shape `(n_seconds, 20484)`, z-scored SIGNED BOLD on
  fsaverage5 (NOT [0,1]; NOT the paper's Schaefer-1000 benchmark space).
- **Features:** for each a-priori mask in `build_roi_mask.py` (`dmn`, `dan`, `valence`,
  `arousal`, plus a `visual`/sensory control ROI), per second compute **both**
  `mean|preds[:,m]|` (magnitude, the arc convention) and `mean preds[:,m]` (signed
  direction the arc throws away). ~10–12 features.
- **Nested baseline column:** the untrained `roi_mag` from `arc_<id>.csv` is included as an
  input, so the head can only "win" by adding signal *over* the arithmetic arc.
- Each channel is resampled to TVSum's 2 s shot grid with `resample_to_grid`, then
  **standardized per video using that video's own mean/std** (uses no target, no other
  video — leakage-safe even for the held-out video).

## Model (fixed)

- **Ridge (L2) only** for v0. Closed-form, deterministic, reproducible. Intercept
  unpenalized. `alpha` chosen by **nested leave-one-video-out** over the *training* folds
  only (grid: 0.1, 1, 10, 100, 1000). MLP/temporal-conv are **deferred** until hundreds of
  videos exist — at ~15 folds they would overfit and any "beat" would be self-deception.

## Target + metric (identical yardstick to the untrained arc)

- **Target:** within-video z-scored TVSum importance level per shot.
- **Score:** first-difference BOTH the predicted head arc and the true human arc, take
  **Spearman**, get p from **`circular_shift_p`** (autocorrelation-preserving, honest
  1/(M+1) floor). Report `r`, `perm_p`, LOAO `ceiling`, `r/ceiling` per held-out video;
  aggregate with **signed Stouffer** (primary) + Fisher (omnibus, direction-agnostic).

## Protocol (leave-one-VIDEO-out, all fitting inside the fold)

For each held-out video *v*: (1) train on ALL shots from ALL other videos, never a shot
from *v*; (2) per-video standardize; (3) pick `alpha` by inner LOVO on the training videos;
(4) fit ridge; (5) predict *v*'s shots → predicted arc; (6) first-diff + Spearman +
`circular_shift_p` + ceiling; (7) also score the untrained `roi_mag` arc on the SAME *v*.

## Two comparators the head must pass

- **(A) Head is real:** its per-video first-diff `r` survives its own circular-shift null
  and captures a consistent-sign fraction of the human ceiling across held-out videos.
- **(B) Head beats the untrained arc:** per held-out video compute `delta_r = r_head −
  r_roi_mag` on the same shots; run a **paired** sign/Wilcoxon test across videos; report
  median `delta_r` and its paired p. Because `roi_mag` is a head input, any win is provably
  *incremental*, not a re-derivation.

## Mandatory negative control (leakage guard)

Re-run the whole LOVO pipeline with training targets destroyed (`--shuffle-target`:
circularly-shift each training video's target). Held-out `r` must collapse to ~0 and the
Stouffer p go non-significant. A synthetic planted-signal fixture must, conversely, recover
signal — proving the trainer neither cheats nor is dead. Both wired into `tests/dry_run.py`.

## Gating

Real claims are gated on the GPU extraction of ~10–20 TVSum clips **and** a locked canonical
brain space (`check_preds_space.py`). Only 3 clips exist today — enough to build and
smoke-test `train_head.py` against the synthetic fixtures, not to make any real claim.
