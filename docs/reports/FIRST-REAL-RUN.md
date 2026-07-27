# First real TRIBE run — log

*2026-07-19. The first time real Meta-TRIBE brain data ran through the whole SomAI pipeline.
Every number here is real (n is tiny — read the caveats). Nothing fabricated.*

## What ran

- **Path A (Cell 2)** on a Colab Pro T4: 3 full-length TVSum clips, **global feature only**
  (no ROI mask was set, so no `roi_mag`). Runtime disconnected after Cell 4 but Cell 5 saved
  `soma_arcs.zip`, so the results survived.
- Clips: `-esJrBWj2d8` (231 s), `0tmA_C6XwfM` (142 s), `37rzWOQsNIw` (192 s).

## The brain data is real

preds are genuine z-scored **signed** BOLD on fsaverage5 — not probabilities:

| clip | shape | min | max | mean | std | frac<0 |
|---|---|---|---|---|---|---|
| -esJrBWj2d8 | (231, 20484) | −1.38 | 1.06 | 0.028 | 0.156 | 43.3% |
| 0tmA_C6XwfM | (142, 20484) | −1.51 | 1.38 | 0.052 | 0.178 | 38.6% |
| 37rzWOQsNIw | (192, 20484) | −1.87 | 1.81 | 0.049 | 0.185 | 37.9% |

The ~38–43% negative values confirm it's signed BOLD (the old `mean(preds>0.6)`
probability-bug interpretation is dead). float32, ~15 MB/clip.

## Result 1 — GLOBAL attention validation → NULL (as pre-registered)

`honest_corr_timeseries.py`, first-differenced, circular-shift null, n = time:

| clip | n | r | perm_p | split-half ceiling |
|---|---|---|---|---|
| -esJrBWj2d8 | 114 | 0.12 | 0.245 | 0.16 |
| 0tmA_C6XwfM | 69 | −0.02 | 0.80 | 0.16 |
| 37rzWOQsNIw | 94 | −0.01 | 0.89 | 0.13 |

**GLOBAL combined: median r = −0.01, Stouffer p = 0.66 → NULL.** This is the *documented
likely-null baseline* (a global TRIBE drive is published NOT to predict replay), and it came
back null on real data — the control behaving exactly as pre-registered. Not a failure.

## Result 2 — the head runs on real data (plumbing de-risked)

`make head` on the 3 real clips (global baseline, since no ROI arcs yet): ran clean end-to-end,
verdict **NULL** (median r_head = 0.13, Stouffer p = 0.23; median delta_r vs baseline = 0.15,
paired p = 1.0). Expected at n=3 — the value is that the trainer works on real preds with no
new bugs, before the big run.

## Bug found & fixed (would have blocked EVERY real run)

The real TVSum `.mat` is **MATLAB v7.3 (HDF5)**; `tvsum_prep.py` only handled the synthetic
v7 fixture and crashed with *"Please use HDF reader for matlab v7.3 files."* Fixed: added an
h5py loader that dispatches on the file's magic bytes (v7.3→h5py, v7→scipy); added h5py to
requirements. Synthetic tests still 28/28 green. Classic case of synthetic fixtures masking a
real-world break.

## What has NOT happened yet (the actual open questions)

- **The ROI test** — the whole point (global is the null baseline; ROI is the open
  hypothesis). Needs `ROI_MASK_PATH` set in Colab. Did not run this time.
- **Real n** — 3 videos is far too few; need 15–50.
- **The head on ROI features** with the untrained `roi_mag` as a real nested baseline.

## Next run (the one that produces a real answer)

Path B, so it can't repeat this run's gap:
1. Upload the 15 (or 50) trimmed clips + `roi_mask_dmn.npy` to `MyDrive/soma/`.
2. **Cell 2B** with `ROI_MASK_PATH` set (now defaulted + existence-checked in the notebook, so
   it can't be silently skipped) → produces `roi_mag`.
3. `make ingest` → global **and** ROI validation. `make head` → head on real ROI features.

Honest posture for the pitch: "we ran it; global is null exactly as the literature predicts;
the ROI test is the open question we're powering up."

---

## UPDATE — full ROI run, n=15 (2026-07-19)

15 trimmed clips, `feature=roi` (DMN mask, 3393 vtx) via Cell 2B on Colab Pro. Slow (~15h;
`num_workers=20` on a 2-core box + Drive I/O), but completed; all 15 arcs carry `roi_mag`.

**Raw arithmetic arcs → NULL (both):**
- GLOBAL: 15 videos, median r = 0.03, Stouffer p = 0.065 → null (the pre-registered baseline).
- ROI (single DMN arc): median r = −0.03, Stouffer p = 0.69 → clearly null.
- The hand-picked, UN-trained arc does not track human interest across videos.

**Trained head → REAL SIGNAL (verified against a shuffle null):**
- `make head`: median r_head = **0.20** (≈0.87× the ~0.23 human ceiling), Stouffer p = **0.0003**.
  6 of 15 videos individually significant (positive), effect is distributed (not one outlier).
- `head_null_test.py` (30 shuffled-target runs): **0/30 reached the real p**; shuffle median
  p = 0.46, shuffle median r ≈ 0. **Empirical p ≈ 0.032** (at the 30-shuffle floor). So the
  head signal is not a fitting artifact.
- Head vs untrained arc: median delta_r = **0.21** (head not null, arc is), but the paired
  test is **p = 0.087** — trending, NOT significant at n=15 (underpowered).

**What this means (honest):** the core thesis held on real data — the RAW brain arc is null,
but a small TRAINED head over a-priori ROI features tracks human interest. That is the
"proprietary read-out layer, not the raw output" bet, with first real evidence. Caveats that
must travel with it: n=15, empirical p at the 0.032 floor, TVSum importance is a PUBLIC PROXY
(learned hypothesis, not validated attention/engagement), head-beats-arc not yet significant.
**Proof-of-architecture, NOT the moat, NOT a validated outcome model.** Not published to the demo.

**Next:** power to n≈50 (fix the num_workers slowdown first) → tightens the head empirical p
and gives the head-vs-arc paired test real power. Reproduce with `make head` + `make head-null`.
