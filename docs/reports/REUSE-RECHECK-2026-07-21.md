# Soma — Reuse & Recheck (2026-07-21)

*Consolidated over four adversarially-verified branches (A/B/C/D). Every number below survived an independent `_verify` re-run; where a verifier sharpened or corrected a claim, the corrected value is used and flagged. Read-only `validation/*` priors were reproduced, not overwritten; all new outputs live under `validation/recheck/<branch>/`.*

---

## UPDATE 2026-07-22 — the #1 gate that was GPU-blocked is now RUN → **NULL**

The Mr.HiSum TRIBE preds arrived overnight (`arcs_mrhisum-…zip`, **38/40** videos). The #1 beachhead gate — the one experiment §1 called "the whole game" — was run on **real most-replayed retention labels, n=38**, dorsal-attention (`dan`) ROI, against the 38 locally-extracted ffmpeg baselines:

| Gate | Metric | Result |
|---|---|---|
| **1 · beats shuffle null** | median r_head = **0.03**, Stouffer **p = 0.134** | ❌ no |
| **2 · beats global signal** | median Δr = **0.01**, paired sign-flip **p = 0.338** | ❌ no |
| **3 · beats ffmpeg** | median partial r = **0.04**, Stouffer **p = 0.177**, adds **6/38** | ❌ no |
| leak control (shuffle-target refit) | collapses | ✅ pass |

**Verdict: NULL** (`signal=false`). Exploratory `roi+temporal` also NULL (gate-3 p=0.217, adds 2/38). This is a **real** null, not a pipeline break — verified: preds↔label↔baseline lengths align to ≤1 s across all 38, labels carry real variance (std 0.12–0.35), leak control passes, and **the global signal is null too** (so it is not a wrong-ROI artifact). Per the honesty-first thesis, reported plainly and **not** rescued by fishing for a framing that clears a gate.

**What it means:** the TVSum r=0.20 *proof-of-mechanism* does **not** transfer to real retention at n=38. The pre-registered #1 thesis — "the TRIBE read-out predicts creator retention" — is **falsified on this sample**. Most-replayed is a retention *proxy* and n=38 is still modest, but this is the first real behavioral-label test and it did not clear a single gate. Strategic read: the beachhead as currently specified needs rethinking, not just more data. Full numbers: `validation/recheck/D-hunt-colab-worklist/retention_head_roi.json`.

---

## 1. TL;DR

- **The r=0.20 TVSum ceiling is confirmed, not beaten.** No framing raised it; adding a 5th (language) ROI *lowered* median r to 0.173. The prior head result (r=0.201, Stouffer p=0.00027) reproduced to the digit on real preds.
- **The recheck bought two things the prior run lacked: a tighter null and an honest CI.** The empirical null went from p≈0.032 (30-shuffle floor) to **p=0.0050** (0/200 shuffles beat real). Bootstrap adds nuance that cuts both ways — **mean r 95% CI [0.038, 0.256] excludes 0**, but **median r CI [−0.069, 0.337] crosses 0** (only 78% of draws >0). Aggregate signal is real; the per-video distribution is heterogeneous and underpowered at n=15.
- **Three more tracks came back NULL, honestly.** Ads (absolute + newer shape/temporal read-out, every framing), COGNIMUSE saliency (the supposed *strong* zone), and COGNIMUSE affect are all null. The film track is now dead on both constructs it could plausibly support.
- **Only one signal remains ours-and-honest: the TVSum trained head clears the ffmpeg gate in aggregate** (within-item Stouffer p=0.0005), and temporal-shape features add a modest within-item lift — but on TVSum-importance relabeled as retention, an **exploratory proxy**, and the overall retention verdict is still `signal=false`.
- **Opportunity #1 was GPU-blocked; it is now RUN → NULL (n=38).** ~~One overnight A100 job closes the gap.~~ Done overnight: the retention head clears **0 of 3** gates on real most-replayed labels (see the 2026-07-22 UPDATE banner above). The r=0.20 proof-of-mechanism did not transfer to real retention.
- **Highest-leverage move (revised):** the cheap validations are now exhausted and mostly NULL. The open question is no longer "run the gate" but "**does any honest construct survive**" — the only surviving positive is TVSum attention at n=15 on a proxy. Next real move is a strategy call (below), not another cheap rerun.

## 2. Asset inventory, tiered to OPPORTUNITIES

Tier 1 = reuse directly · Tier 2 = partial / blocked on one input · Tier 3 = dead, demote.

| Asset on disk | Opportunity | Tier | Honest status |
|---|---|---|---|
| `data/arcs/preds_<ytid>.npy` + `arc_*.csv` (15 TVSum) | #1 | **Tier 1** | Real signed BOLD (fsaverage5). Feeds the only validated mechanism (head r=0.20). But TVSum importance is a **public proxy**, not retention. |
| `data/tvsum/` human labels | #1 | **Tier 1** | Real; n=15 is the binding independent-unit count. |
| `data/baseline/` ffmpeg features | #1/#2/#3 | **Tier 1** | The mandatory beat-ffmpeg gate harness. Reused clean across A and C. |
| ROI masks `roi_mask_{dmn,dan,language,valence,arousal}.npy` | #1/#3 | **Tier 1** | Real boolean 20484-vtx arrays. 4-mask config is the reproducing prior; **5th (language) mask dilutes** — do not add. `dan` is the a-priori attention mask. |
| `train_head.py`, `head_null_test.py`, `incremental_validity.py`, `retention_head.py`, `temporal_readout.py` | #1/#2 | **Tier 1** | LOVO/LOO harnesses verified working + leakage-clean on real data. `temporal_readout.py` is pre-registered and ready to "fire" the moment real retention preds exist. |
| `data/mrhisum/retention_<id>.csv` (40 labels) + `sample_ids.txt` + `mr_hisum.h5` | #1 | **Tier 2** | Labels verified real (= min-maxed h5 `gtscore`, worst abs diff 5e-05). Everything present **except preds** → blocked on GPU. |
| `data/mrhisum/preds/` | #1 | **absent** | The one missing artifact for #1. Needs the Colab/A100 TRIBE extractor. |
| `soma_arcs (3).zip` → 29 `preds_meta_NN.npy` + arcs; `data/ads/ad_manifest.csv` outcomes | #2 | **Tier 3** | Absolute + shape/temporal outcome tests **exhausted and null**. 29 rows = 29 distinct advertiser lib IDs → **0 within-brand A/B pairs**; #2 cannot be validated on this set at all. |
| `data/ads/variants/demo_ad` (5 cuts) | #2 | **Tier 3 (dead)** | **Synthetic.** Cannot validate a relative ranker. Only "Compare-Cuts" material, and it does not count. |
| COGNIMUSE preds `CRA/CHI/FNE/BMI` + IF23 saliency labels + local affect CSVs | #1/#3 (attention/affect) | **Tier 3 (dead)** | Null on **both** affect (blind zone) and saliency (nominally strong zone). Positive control proves the null is real, not a power bug. Film track fully demoted. |

## 3. What each recheck found

### A — TVSum squeeze (verdict: mixed · verified CONFIRMED)

**Reproduction (primary, 4-mask prior config):** head median `r_head = 0.201`, combined Stouffer `p = 0.00027`, paired head-vs-arc `p = 0.087` — all bit-identical to prior. The r=0.20 ceiling held.

**New rigor added:**
- **Empirical null tightened:** 200 shuffles, 0/200 beat real → **p = 0.0050** (prior 0.032 at the 30-shuffle floor; 6.4× lower). Signal survives.
- **Bootstrap (B=10000):** **mean r = 0.150, 95% CI [0.038, 0.256]** (excludes 0, 99.7% of draws >0) but **median r = 0.201, 95% CI [−0.069, 0.337]** (crosses 0, only 78% >0). *The aggregate is real; the per-video distribution is heterogeneous/underpowered.* This is the honesty caveat the prior run lacked.
- **Leakage control (mandatory):** `--shuffle-target` collapses (median r=−0.07, signed Stouffer p=0.061 NS) → no target leakage.

**What did NOT squeeze more (all reproduced):**
- 5-mask (add language ROI): median r = **0.173** — *lower*. Extra mask dilutes.
- Raw ROI arc vs ffmpeg: **0/15** (fails outright). Raw global arc: **3/15** (aggregate only).

**Within-item vs ffmpeg (the OPPORTUNITIES regime):** the trained **head** clears the gate in aggregate — 4-mask Stouffer `p = 0.0005` (per-video 2/15, median partial 0.178); 5-mask 3/15 `p = 0.0004`. So "0/15-ROI is the ceiling" is true for the **raw arc** but not the **trained head**.

**Retention framing (EXPLORATORY — TVSum importance column-renamed to `retention_<id>.csv`, same real labels, harder global-nested 2s-grid baseline, not directly comparable to 0.20):**
- `--features roi`: gate1 r=0.11 (p=0.0001); gate3 partial 0.09 (p=0.0009, **below the 0.1 floor**).
- `--features roi+temporal`: gate1 r=0.16 (p=0.0002); gate3 partial 0.13 (**PASS**, p=0.0011).
- **Verifier correction / do-not-overclaim:** the **overall retention verdict is `signal=false` (NULL) for BOTH** roi and roi+temporal. Temporal features flip **only gate3 (ffmpeg)** to PASS; roi+temporal still **fails gate2 (beats-global, paired p=0.149)**. The temporal lift is real but modest, exploratory, and not an overall retention win.

Net: **genuine proof-of-mechanism** (the head learns a real, leakage-clean, ffmpeg-surviving signal), **not** proof of a large effect. r=0.20 is the honest ceiling; more videos, not a cleverer framing, is the binding constraint.

### B — Ads temporal (verdict: confirmed-null · verified CONFIRMED)

The newer shape/temporal read-out **rescues nothing**. Reproduced byte-for-byte against root priors (deterministic crc32 seed).

- **Absolute, HEAD score:** partial r = **−0.13**, perm p = 0.548 → NULL (reproduces prior −0.128).
- **Absolute, ARC score:** partial r = **+0.12**, perm p = 0.559 → NULL (sign differs only by scorer choice; both null).
- **Temporal arc/global, `hook_decay`:** partial r = **0.40**, raw perm p = 0.054, **Holm p = 0.327 → does NOT survive.** This is the identical persistent lead already in the docstring — *a lead, not a finding. Do not quote it as a result.*
- **Combined LOO ridge arc/global:** OOS r = 0.14, perm p = 0.615 → NULL.
- **Temporal arc/roi:** OOS r = −0.21, perm p = 0.443; all 6 features Holm p = 1.000 → NULL.
- **Features surviving Holm across all framings: 0 of 6.**
- `source=preds` and `source=arc/global_mag` are **byte-identical** (global_mag *is* whole-cortex mean|activation|); preds adds no independent test. Only arc/roi is a distinct series, and it is weaker.
- **Within-brand reality (#2):** 29 rows = **29 distinct lib IDs, 0 repeats → 0 within-brand A/B pairs.** #2 is **data-blocked, not falsified** — it needs ≥2 real ads per advertiser with differing outcomes; the 5 synthetic demo cuts cannot substitute.

### C — COGNIMUSE saliency (verdict: confirmed-null · verified CONFIRMED)

Re-tested the *right* construct — saliency/attention (TRIBE's strong zone) — after affect came back null.

- **PRIMARY DAN vs AVS saliency (first-diff, 4 films):** median r = **−0.016**, Stouffer p = 0.36 (Fisher p = 0.87); all 4 films |r| < 0.04 → NULL.
- **Incremental over ffmpeg:** median partial r = −0.016, Stouffer p = 0.37 → no lift (ffmpeg itself is null vs saliency, so nothing to beat).
- **POSITIVE CONTROL (same harness, same near-saturated labels):** saliency Sensory-vs-AVS r = **0.33–0.50**, all p = 0.001 (Visual-vs-AVS 0.13–0.29). *The harness detects real structure → the TRIBE null is real, not a power/saturation bug.*
- **EXPLORATORY levels (no first-diff):** DAN-vs-AVS Stouffer p = 0.0093 **but median r = −0.095 (wrong sign, below floor)**; global r = −0.079, p = 0.013. A shared slow-drift artifact that first-differencing removes — **NOT signal** (a p-hacker would have headlined this; the finder correctly did not).
- **Fallback affect head on real film preds:** r_head ∈ [−0.032, 0.043], perm p 0.19–0.79 → confirms the affect null is a **construct** problem, not a code bug.
- **Verifier extension (not in original claim):** hemodynamic lag sweep −2…+8 s all null (max |median r| ~0.011, all Stouffer p ≥ 0.16) → the null is robust, not lag-fragile.

Conclusion: **COGNIMUSE/film is null on both affect and saliency → fully demoted.** Not reusable for an attention gate. Stop spending on the film track.

### D — Hunt + Colab work-list (verdict: confirmed-prior · verified CONFIRMED)

Read-only gap confirmation. Produces the work-list, does **not** close the gate.

- **40** Mr.HiSum labeled videos (`retention_*.csv` == `sample_ids.txt`, diff empty). Labels verified real: each = min-maxed `gtscore` in the staged `mr_hisum.h5`, worst abs diff **5e-05**.
- **0 of 40** IDs present as preds/arc in any `~/Downloads` zip or `data/arcs` (verifier: 421 preds/arc entries scanned across 13 zips + 51 local preds; 0 matches — the load-bearing count is robust).
- **0** Mr.HiSum `.mp4` clips staged anywhere (must be yt-dlp'd on Colab).
- `data/mrhisum/preds/` **absent**; `data/mrhisum/baseline/` **absent**.
- Total **5064** video-seconds (mean 126.6, min 121, max 132). GPU estimate ~**3–4 h A100 / ~8 h T4** (extrapolated from TRIBE's ~5.7 GPU-s/video-s — explicitly a caveat, not measured).
- **Gate-3 trap caught:** `retention_head.py` *silently skips* the beat-ffmpeg gate if `--baseline-dir` is absent (`if not baseline_dir: return None`; `beats_ffmpeg is not False` means None does not block). Without a baseline cell the run yields a **falsely-complete #1**. The work-list adds a `baseline_extract` cell to prevent this.

## 4. The one thing to do next

**Close the #1 beachhead: produce Mr.HiSum TRIBE preds + ffmpeg baselines, then run the retention gate.** Everything else for #1 is on disk and verified real.

Colab RUN-2 sequence (from `validation/recheck/D-hunt-colab-worklist/COLAB-WORKLIST.md`):
1. Upload `sample_ids.txt` (the 40 IDs) → **Cell 2C** sets the `roi_mask_dan` mask.
2. **yt-dlp cell** — download the 40 clips (expect some private/removed → n may drop below 40; re-sample from `metadata.csv` if power falls).
3. **`baseline_extract` cell** — produce `baseline_<id>.csv` on the *same* clips (mandatory for gate 3; do not skip).
4. **Cell 3 → Cell 4 → Cell 5** — AV model → extract preds → zip.
5. Drop arc + baseline zips in `~/Downloads`, stage into `data/mrhisum/{preds,baseline}/`, verify 20484 vertices via `check_preds_space.py`.
6. Run **one** `retention_head.py --features roi` (out under `validation/recheck/`) for the 3-gate verdict = **the first honest #1 number**. Then, and only as an exploratory follow-up, `--features roi+temporal`.

**Newer-code win worth keeping:** the temporal-shape features in `retention_head.py`/`temporal_readout.py`. On TVSum they lifted the within-item head (gate1 r 0.11→0.16) and flipped gate3 to PASS — modest, exploratory, and *not* an overall win yet, but the pre-registered 6-feature + LOO-ridge harness is verified correct on real data and is the right thing to run on real retention labels. It will genuinely test the temporal-lift hypothesis when Mr.HiSum preds arrive.

Secondary (not the beachhead): extend TVSum beyond 15 clips to pull the median-r bootstrap CI off 0 and power the head-vs-arc paired test (currently p=0.087).

## 5. Honesty ledger

**Every framing tried, and whether it beat the ffmpeg baseline.**

| Framing | Result vs ffmpeg / null | Status |
|---|---|---|
| TVSum head, 4-mask, cross-video | r=0.20; beats shuffle null (emp. p=0.005); within-item Stouffer p=0.0005 (per-video 2/15) | **Beats ffmpeg in aggregate.** Validated *mechanism*, on a proxy. |
| TVSum head, 5-mask (add language) | median r=0.173 (lower) | Dilutes — not a win. |
| TVSum raw ROI arc vs ffmpeg | 0/15 | **Fails.** |
| TVSum raw global arc vs ffmpeg | 3/15 (aggregate) | Fails. |
| TVSum retention, roi (exploratory) | gate1 r=0.11; gate3 partial 0.09 (below floor); overall `signal=false` | **NULL.** |
| TVSum retention, roi+temporal (exploratory) | gate1 r=0.16; gate3 PASS (0.13); **gate2 FAIL (p=0.149)**; overall `signal=false` | **NULL overall** (gate3 only). |
| Ads absolute, head score | partial r=−0.13, p=0.548 | **NULL.** |
| Ads absolute, arc score | partial r=+0.12, p=0.559 | **NULL.** |
| Ads temporal arc/global (hook_decay) | r=0.40, raw p=0.054, **Holm p=0.327** | **NULL** (does not survive Holm). |
| Ads temporal arc/global (combined ridge) | OOS r=0.14, p=0.615 | **NULL.** |
| Ads temporal arc/roi | OOS r=−0.21; all 6 Holm p=1.0 | **NULL.** |
| COGNIMUSE DAN vs saliency (first-diff, primary) | median r=−0.016, p=0.36 | **NULL.** |
| COGNIMUSE DAN vs saliency + ffmpeg partial | median partial r=−0.016, p=0.37 | **NULL.** |
| COGNIMUSE levels (no first-diff) | p=0.0093 but median r=−0.095 (wrong sign) | **NULL** (slow-drift artifact, not signal). |
| COGNIMUSE affect head | r_head ∈ [−0.032, 0.043], p 0.19–0.79 | **NULL** (construct, not bug). |

**What beat ffmpeg:** only the TVSum trained head, and only in the aggregate/within-item sense (Stouffer p=0.0005; per-video 2–3/15). Nothing else cleared the gate.

**Validated vs hypothesis (the boundary that must travel with the pitch):**
- **Validated (real data, leakage-clean, beats ffmpeg + shuffle null):** the TVSum trained head learns a real per-video signal — but on **TVSum importance, a public proxy**, at **n=15**. This is **proof-of-mechanism** ("proprietary read-out layer, not the raw output"), *not* proof of a large effect and *not* a validated retention/engagement outcome model. Bootstrap median CI crosses 0; head-vs-arc paired test p=0.087.
- **Hypothesis / blocked (no claim):** #1 on real Mr.HiSum retention (GPU-blocked — the one experiment that would upgrade the mechanism to a behavioral claim); #2 within-brand relative ranker (data-blocked — 0 real same-advertiser pairs); #3 comprehension (no trimodal-text data, no test yet).
- **Killed as NULL (do not resurrect):** absolute cross-ad outcome prediction (r=−0.13, n=29), ad shape/temporal read-out (every framing), and the entire COGNIMUSE film track (affect *and* saliency). Consistent with OPPORTUNITIES' "Do NOT build" list — absolute scores and TRIBE's blind zones stay null.

Nothing here is sold above its evidence: one honest, reproducible, ffmpeg-surviving mechanism on a proxy; three clean NULLs; one GPU-blocked experiment that is the whole game.
