# Mr.HiSum retention head — train a read-out on a REAL per-second engagement label

The highest-ceiling honest bet in the repo. TVSum taught a head `activation → interest` (a
proxy for top-down attention). This pipeline trains a head `activation → most-replayed`, the
closest **public** label we have to the retention outcome the company is built on — on the
cortex TRIBE actually predicts well (sensory / attention, DAN).

> **Status: SCAFFOLD, proven by a GPU-free synthetic smoke test.** The code path runs
> end-to-end on an in-code synthetic sample (`tests/test_retention_head.py`, 7 tests, ~2.2 s —
> the last two exercise the `roi+temporal` seam below).
> A **real** result needs (a) a GPU to extract TRIBE preds on Mr.HiSum videos and (b) the
> Mr.HiSum archive, neither of which is available in this environment. Do not report any number
> from the synthetic fixture as a result — it is plumbing, not science.

---

## What Mr.HiSum is (and the honesty caveat that never comes off)

Mr.HiSum (Sul et al., **NeurIPS 2023 Datasets & Benchmarks**; GitHub `MRHiSum/MR.HiSum`) is
**31,892 YouTube videos**, each with a **per-second "most-replayed" heatmap** normalized over
**50k+ viewers/video**. It is the largest public per-second engagement signal in existence.

- **It is a RETENTION PROXY, not retention.** A high most-replayed value means many viewers
  *re-watched* that second. Rewatch spikes on punchlines / drops / reference moments; *leaving*
  is a different behavior. Every claim says "most-replayed (a retention proxy)", never
  "retention." The code carries that label — keep it.
- **Documented negative prior to beat:** arXiv `2607.01400` reports a **global** TRIBE drive
  does **not** predict most-replayed. So the head must beat (i) that global signal and (ii) the
  dumb ffmpeg covariates. Both gates are wired in — see below.
- Access is gated by a Google-Form request on the GitHub repo; the archive (`mr_hisum.h5` +
  `metadata.csv` + `split.yaml`) is tens of GB. **This env cannot fetch it.**

---

## Pipeline overview

```
Mr.HiSum videos ──(GPU: batch_extract.py)──► preds_<id>.npy         (n_sec, 20484)
Mr.HiSum labels ──(mrhisum_prep.py)────────► retention_<id>.csv     (t_sec, most_replayed∈[0,1])
                         │
                         ▼
           retention_head.py  ──►  leave-one-VIDEO-out validation + 3 gates + saved head
```

Every statistical primitive is **reused, audited code**: `train_head.py` (ridge, nested-LOVO
alpha, circular-shift null, shuffle-target REFIT leak control), `incremental_validity.py`
(partial Spearman + circular-shift null for the ffmpeg gate), `head_io.py` (saved-head JSON +
honest badge). Nothing new was invented in the stats path.

---

### 1. GPU extraction — Mr.HiSum videos → preds  (the expensive step)

Same extractor as everything else (see `PIPELINE.md`). Runs on an A100-40GB / Colab T4.

```bash
# download the videos you sampled (Mr.HiSum ships YouTube ids in metadata.csv), then:
python batch_extract.py --video-dir data/mrhisum/videos --out data/mrhisum/preds
#   -> preds_<id>.npy (n_sec, 20484 fsaverage5) + arc_<id>.csv (t_sec, global_mag, roi_mag)
```

**Scale / cost.** TRIBE is ~2:45 for a 29 s clip on a GPU. Mr.HiSum videos are minutes long, so
budget accordingly and **sample deliberately** — you do **not** need all 31,892. A first honest
read wants **~30–60 videos** (n = videos is the sample size, not seconds). Extraction is the
cost driver; sample a stratified slice (length / category) rather than scraping blindly.

> Run `check_preds_space.py` on the first batch to confirm you got fsaverage5 (20484), not
> Schaefer-1000 parcels, before building masks / training.

### 2. Parse the labels — mrhisum_prep.py

```bash
# real archive (after `pip install h5py` and the gated download):
python mrhisum_prep.py --h5 data/mrhisum/mr_hisum.h5 \
    --metadata data/mrhisum/metadata.csv --out data/mrhisum
#   -> retention_<id>.csv (t_sec, most_replayed in [0,1], min-maxed per video)

# GPU-free plumbing sample (no network, no h5py) — what the tests use:
python mrhisum_prep.py --synth --out data/mrhisum --n-videos 6
```

`load_real_mrhisum()` reads each video group's `gtscore` (the per-second most-replayed
importance, already ~1 Hz), min-maxes it to `[0,1]`, and names each file by its YouTube id via
`metadata.csv`. It is the documented **plug-in seam** — faithful to the published HDF5 layout,
lazily importing `h5py` so the module's only hard dependency stays numpy.

### 3. Train + validate the head — retention_head.py

```bash
python retention_head.py \
    --preds-dir data/mrhisum/preds --retention-dir data/mrhisum \
    --masks-dir data --roi dan \
    --baseline-dir data/mrhisum/baseline \
    --out validation/retention_head.csv \
    --json-out validation/retention_head.json \
    --save validation/head_retention.json
```

`baseline_<id>.csv` (for the ffmpeg gate) comes from the existing CPU extractor:
`python baseline_extract.py --video-dir data/mrhisum/videos --out data/mrhisum/baseline`.

**Make target (documented here, NOT added to the Makefile this run — the temporal-module agent
owns the Makefile edit for its target; this runbook owns the retention command).** If/when a
target is added it should be equivalent to:

```make
# retention-head: train + LOVO-validate the Mr.HiSum retention head (needs preds + labels)
# retention-head:
# 	$(PY) $(ROOT)/retention_head.py --preds-dir data/mrhisum/preds \
# 	    --retention-dir data/mrhisum --masks-dir data --roi dan \
# 	    --baseline-dir data/mrhisum/baseline --out validation/retention_head.csv \
# 	    --json-out validation/retention_head.json --save validation/head_retention.json
```

### 4. Optional — temporal features from temporal_readout.py  ✅ WIRED

`--features roi+temporal` appends temporal features via a generic seam so the two deliverables
compose without a hard dependency. **The seam is now live**: `temporal_readout.py` exposes both
halves of the agreed interface (`retention_head._temporal_columns` prefers the pooled one):

```python
def per_second_features(preds): ...    # -> (n_sec, k) LOCAL temporal-shape descriptors
def pooled_features(preds, edges): ... # -> (n_bins, k) = per_second_features mean-pooled onto
                                       #    the head's grid via resample_to_grid (retention_head
                                       #    resamples the per-second fallback the same way)
```

Both read `preds` **only** — there is no label argument — so the columns are **leakage-free by
construction** (no target value can enter the fit). They read the LOCAL shape of the per-second
neural series `s = mean|activation|` (the same series `preds_series` / `global_mag` use), the
part the ROI mean-LEVEL columns and the nested global baseline structurally cannot see. The
`k = 5` columns (locked in `temporal_readout.WINDOW_FEATURES`):

| column | reads | definition |
|---|---|---|
| `velocity` | local rate of change | first difference `s[t] − s[t-1]` (0 at t=0) |
| `acceleration` | local curvature | second difference `s[t] − 2 s[t-1] + s[t-2]` (0 for t<2) |
| `roll_var` | local burstiness / dynamic range | variance of `s` in a ±2-second window centred on `t` |
| `surprise` | outsized jumps | `|velocity[t]|` ÷ (median `|first-diff|` + ε) — within-clip, scale-free |
| `time_pos` | monotone drift | normalized clock position `t/(n-1)` ∈ [0,1] |

Temporal is still an **exploratory** add-on (the pre-registered PRIMARY is `--features roi`): the
three honesty gates + the REFIT leak control apply exactly as for `roi`, and multiple elevated
feature sets are **Holm**-corrected — never quote `roi+temporal` because it beat `roi`. A
temporal-augmented head is validated but **not** saved via `head_io` (its column layout doesn't
fit the mask-packed saved-head format): `--save` prints a skip note and only the ROI head ships;
report temporal side by side.

The synthetic smoke pins both directions (`tests/test_retention_head.py`): a signal planted in
the **temporal shape** of the preds (target ∝ the local burst variance, with the LEVEL held flat)
is **recovered** by `roi+temporal` over the perm null and over the global baseline with
`leak_check == pass`, while the pure-`roi` head on the same data recovers nothing (the temporal
columns are provably load-bearing); and a null control (preds carrying no information about the
target) stays quiet. `tests/test_temporal_readout.py` pins the seam itself: correct `(n_sec, k)`
/ `(n_bins, k)` shapes, label-independence (leakage-free), pooled == resampled-per-second
(aggregate-consistency), and that each descriptor reads the shape it claims.

---

## Honesty guardrails (baked into the code, verified by the test)

The head is declared a **SIGNAL** only if it clears **all** of these; a miss on any is a
plainly-reported **NULL**, and a failed leak control voids everything.

| Gate | Test | Enforced by |
|---|---|---|
| **Anti-overfit** — never regress raw 20484 | features restricted to an a-priori sensory/attention ROI (DAN) pooled to 2 dims/mask + nested global; strong ridge, nested-LOVO alpha | `retention_head.video_data` / `train_head.pick_alpha` |
| **1. Beats the perm null** | per-video **circular-shift** null, combined **signed Stouffer**, `median r ≥ MIN_EFFECT_R (0.10)` **and** `p < 0.05` | `train_head.run` + `honest_corr_timeseries.stouffer` |
| **2. Beats the GLOBAL baseline** | `global_mag` is **nested** as the head's last input; `delta_r = r_head − r_global`; paired sign-flip `p < 0.05`, `median delta > 0` | `train_head.paired_sign_perm` |
| **3. Beats ffmpeg** | LOVO prediction **partial-Spearman** vs most-replayed after removing loudness/cuts/luminance/motion, circular-shift null, `1/(M+1)` floor | `incremental_validity.partial_spearman` / `partial_shift_p` |
| **Leak control (REFIT)** | shuffle each training video's target and **re-fit the whole LOVO pipeline** every permutation — held-out r must collapse. A **fixed-prediction** permutation is INVALID and is not used. | `train_head.leak_check` |
| **No best-of-N** | one pre-registered PRIMARY feature set (`roi`); others exploratory; **Holm** if multiple are elevated to co-primary | `retention_head.report` |
| **Poison gate** | saved head stamps `leak_check`; a non-`pass` head is badged POISONED and `head_apply` refuses it | `head_io.badge_text` |

Test proves both directions: a planted arc that depends on ROI activation is **recovered** above
the perm null and above global; a **null control** (retention independent of preds) stays quiet;
a pure **ffmpeg confound** (ROI and target both driven by loudness) **collapses** under the
partial. Run: `.venv/bin/python -m pytest tests/test_retention_head.py -q`.

---

## What you may / may not say

✅ *"We trained a read-out head on frozen TRIBE features against Mr.HiSum most-replayed (a public
per-second engagement proxy, 50k+ viewers/video). On N videos it predicts the most-replayed arc
leave-one-video-out over the perm null, over the global-drive baseline (which the literature says
is null), and over ffmpeg edit features (partial r = …, combined p = …). Early, a retention
**proxy** (rewatch ≠ not-leaving), scorer applied out-of-distribution to new ads, n = videos — a
learned hypothesis we're powering up on partner data."*

❌ *"We predict retention"* / *"validated engagement model"* / quoting most-replayed as
"retention" / citing seconds instead of the **number of videos** as n / quoting an exploratory
feature set because it beat `roi` / reporting the **synthetic** smoke numbers as a result /
shipping a head whose leak control did not pass.

---

## Files

- `mrhisum_prep.py` — labels → `retention_<id>.csv`; `--synth` fixture (numpy only) +
  `load_real_mrhisum()` plug-in (lazy `h5py`).
- `retention_head.py` — leakage-safe LOVO head, 3 gates, `head_io` saved head + honest badge.
- `tests/test_retention_head.py` — GPU-free planted-signal-vs-null-control + ffmpeg-confound smoke.
- Outputs under `validation/`: `retention_head.csv` (per-video audit trail),
  `retention_head.json` (machine-readable verdict), `head_retention.json` (reusable inference head).
