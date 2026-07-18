# Pre-registration — within-video arc validation

**Locked on: 2026-07-17 (Day 2). Do not change anything below after looking at
results.** The whole point of pre-registration is that switching the feature,
region, alignment, or test *after* seeing `r` turns an honest permutation test
back into best-of-N cherry-picking — the exact sin we removed from the notebook.
If we genuinely must change something, we start a new dated pre-registration and
report both.

## The question
Does TRIBE v2's predicted per-second cortical **activation arc** track a
**multi-annotator human attention arc** *within* a single video?

- This is a **within-video** test: n = time (tens–hundreds of aligned points per
  video), not n = videos.
- It is **necessary-but-not-sufficient** evidence for predicting retention. It is
  NOT a retention test. We never say "predicts retention/drop-off" on the basis of
  this alone.

## Ground truth (outcome)
- **Primary:** TVSum mean interest arc — 20 annotators × 1–5 importance per
  2-second shot, averaged (`tvsum_prep.py` → `human_arc_<id>.csv`).
- **Noise ceiling:** leave-one-annotator-out agreement across the 20 annotators
  (`human_annos_<id>.npy`). The model is judged **relative to this ceiling**, not
  in a vacuum. The model cannot beat how well humans predict each other.
- **Secondary (disclosed):** YouTube "most-replayed" heatmap on the actual hero
  ads. No annotator ceiling; closer to real behavior. Reported separately, never
  as the ceilinged primary.

## Features (pre-registered, BOTH reported side by side)
| id | definition | status |
|----|------------|--------|
| `global` | `mean over all 20484 vertices of \|preds[t,v]\|` | **documented likely-NULL baseline** — a global TRIBE drive is already published NOT to predict YouTube replay. We run it anyway, expecting null, and report it. |
| `roi` | `mean over ROI vertices of \|preds[t,v]\|`, ROI = **Default Mode Network** (`build_roi_mask.py --network dmn`) | **the distinct, still-open test.** |

- Magnitude (`|preds|`), not signed mean and not a fixed threshold, so the
  z-scored-scale bug (old `preds > 0.6`) cannot resurface. Direction is handled by
  Spearman + first-differencing.
- **ROI is chosen a-priori** (DMN: strongest, most reliable across-subject
  responses in naturalistic viewing; tracks narrative/semantic engagement). We do
  **not** scan regions for the best `r`. If we ever prefer a different a-priori
  region, we change it here *before* running and note the change.

## Test (exact procedure)
1. Align the 1 Hz model arc onto TVSum's 2 s shot grid by bin-averaging
   (`resample_to_grid`).
2. **First-difference** both series (removes shared slow drift; tests
   moment-to-moment co-movement, not shared trend).
3. **Spearman** correlation of the differenced series.
4. **Circular-shift permutation null** (≥5000 rolls, `min_shift=3`): two-sided
   p = (1 + #{|r_perm| ≥ |r_obs|}) / (n_perm + 1). This preserves each series'
   autocorrelation and is the **primary** p-value.
5. Effective-N parametric p reported only as a **cross-check**.

## Aggregation across videos
- Report **every** video (forest plot + results CSV). No dropping the ugly ones.
- Combined significance via **signed Stouffer** (primary) and **Fisher**
  (secondary), per feature.
- Report **median r** and **median ceiling** per feature.

## Confirmatory family / multiple comparisons
- **One pre-specified primary.** The **single** confirmatory test is the `roi`
  feature's **combined signed-Stouffer p across videos at alpha = 0.05**. Because
  there is exactly one pre-specified primary, **no multiple-comparisons correction
  is required.**
- **`global` is a CONTRAST baseline, not a second shot at significance.** It is
  pre-specified and **expected null**; its job is to *differ from* `roi` (which is
  what makes a positive `roi` a *distinct* finding vs. the published
  global-vs-replay null), not to be an independent test. It is reported **side by
  side** with `roi` but is **NOT counted in the confirmatory family.**
- **Everything else is EXPLORATORY.** Any additional feature, ROI, or aggregation —
  Fisher omnibus, effective-N parametric p, the affect prereg, incremental
  validity — is **exploratory** and badged as such in every report. Exploratory
  results generate hypotheses; they do not confirm them.
- **If a second feature is ever elevated to confirmatory**, apply
  **Holm–Bonferroni** across the confirmatory family and record the change **here,
  before running.** We never expand the family after seeing results.

## Decision / interpretation (agreed in advance)
- **Signal** = `roi` survives the circular-shift null with a consistent-sign,
  non-trivial fraction of the human ceiling across videos, **while** `global` is
  null (which would make the result a *distinct* finding from the published
  global-vs-replay null).
- **Minimum effect size:** a result counts as **non-trivial only if
  `|median r| >= 0.10`**; below that we report it as **effectively null even when
  p < alpha** — the same floor used for incremental validity. The preferred
  long-term bar is **'fraction of the noise ceiling'** (a post-YC refinement); the
  raw-`r` floor is the **locked interim** (2026-07-18).
- **Null** = nothing survives. That is a legitimate pre-registered outcome and we
  report it plainly. The honest pitch line then leads with the validated step 1
  and the machine, not a rescued correlation.
- **Non-negotiable:** the number we report is the real one. An
  autocorrelation-inflated "r across smooth points as if independent" is
  self-deception a sharp interviewer dismantles in one question.

## Known prior we will disclose proactively
There is a published result that a **global** TRIBE drive signal does not predict
YouTube most-replayed. We cite it, and frame our `roi` test as the distinct,
still-open question — disclosing it builds more credibility than an investor
catching it. *(Verify the exact citation before it goes in the deck.)*
