# SomAI — optimization backlog

*From a multi-agent audit (GPU/cost, correctness, statistical honesty, demo/UX) on
2026-07-17, ranked by impact, then adversarially honesty-checked. Status reflects what I did
this session vs what needs your decision or the GPU.*

Legend: ✅ done this session · 🟡 needs your decision (I did NOT change it unilaterally) ·
🔵 needs the GPU / real data · ⚪ deferred polish

| # | Item | Dim | Status |
|---|---|---|---|
| 1 | Attention badge said "weakly validated · vs TVSum / shipped" with **no run done** — made data-driven, defaults to "validation pending · not yet run"; ladder Rung 0 → "test not yet run"; nav chip → "sample arc"; flyRung → "0 rungs validated" | honesty | ✅ |
| 2 | `incremental_validity.py` two bugs (baseline on arc timebase → crash; compact-before-diff → fabricated co-movement) + strided/unseeded shift null | correctness | ✅ |
| 3 | Add train_head shuffle-target control + planted-signal check to `dry_run.py` | correctness | ✅ (head control added; a real-**length-mismatch** fixture still 🟡) |
| 4 | Scrub "proprietary model" so it never means frozen TRIBE | honesty | ✅ (demo already correct; codified in STRATEGY-PROPRIETARY-MODEL.md) |
| 5 | Lock ONE canonical brain space before training a head (`check_preds_space.py`); never borrow the paper's Schaefer-1000 benchmark for our fsaverage5 projection | correctness | 🔵 run on real preds |
| 6 | Noise-ceiling mismatch (model vs 20-annotator mean; ceiling leave-one-out) → r/ceiling can exceed 1 | statistics | 🟡 **deleted the false "cannot beat ceiling" docstring**; the split-half redesign needs your sign-off |
| 7 | Direction-blind Fisher printed as "combined p" | statistics | ✅ relabeled "omnibus, direction-agnostic" (here + train_head) |
| 8 | `publish_results.py` OR'd null_result with (beats is False) → mislabels a real signal "null" | statistics | ✅ separated: null_result = attention only; beats_baseline its own verdict |
| 9 | Inconsistent effect-size floors (0.05 vs 0.1) across tools | statistics | 🟡 needs one pre-registered number (r as fraction of ceiling) |
| 10 | No family-wise correction across ~5 tests (~23% chance one clears p<.05 under the null) | statistics | 🟡 needs a pre-registration decision (designate roi primary + Holm) |
| 11 | Dated `PREREGISTRATION-head.md` locking the head spec before results | honesty | ✅ |
| 12 | `train_head.py` — ridge read-out head, nested-LOVO alpha, roi_mag nested, paired delta_r + partial-corr, loud power caveat | honesty | ✅ built + tested on synthetic + in dry_run |
| 13 | Shuffle-target / planted-signal controls for the head | correctness | ✅ (`--shuffle-target`; aggregate collapses 0.022→0.639 on synthetic) |
| 14 | Make Colab Path B the default, demote Path A | compute | ✅ (intro + README present B as recommended; A labeled heavy fallback) |
| 15 | `batch_extract.py` preds float64 → float32 (matches Colab) | compute | ✅ |
| 16 | 2D fallback scroll-brain had no on-screen "not data" label | demo-ux | ✅ added `#scrollBrainTag` (hidden when 3D hero + its watermark run) |
| 17 | Nav chip "cached result" implied a real run | honesty | ✅ → "precomputed · sample arc" |
| 18 | HUD said "fsaverage5 · 20,484 vtx" but brain3d renders fs6/81,924 | honesty | ✅ → "decorative cortical mesh" |
| 19 | `detect_weak_spots` is circular (always flags ~25% of any clip) | statistics | 🟡 keep the "predicted, to A/B test" label; falsifiable redesign needs your call |
| 20 | Pause the 3 rAF loops (brain3d / scrollbrain / app.js) when off-screen | demo-ux | ⚪ real perf win; not yet done |
| 21 | Accessibility: aria-label Pause/Play, scrubber label, contrast on disclaimers | a11y | ⚪ not yet done |
| 22 | Colab Cell 5: zip only arcs, not preds | compute | ❌ **rejected — would break `train_head.py`, which needs `preds_*.npy`.** Kept preds in the zip; on Path B they also persist in Drive. |
| 23 | Prefetch/overlap event-building with GPU predict; investigate multi-clip batching | compute | 🔵 needs the model API + a GPU box to measure (nvidia-smi dmon first) |
| 24 | fp16/bf16 + input-downscaling — **only behind a numeric-equivalence check** (they alter the one validated link); wrap production as scale-to-zero serverless | compute | 🔵/🟡 gated on equivalence check; do not ship silently |

## The three things this session actually shipped (verified)

1. **Correctness:** the two `incremental_validity.py` bugs that would have made the
   "beats-the-ffmpeg-baseline" number wrong on the *real* GPU run (the one that matters) are
   fixed and mirror the audited harness. `make test` = 28/28 PASS.
2. **The proprietary head exists:** `train_head.py` builds, recovers planted signal on
   synthetic, correctly reports null where appropriate, and its leakage control collapses —
   all protected by `dry_run.py`.
3. **The demo stopped overclaiming:** the attention arc no longer says "validated/shipped"
   anywhere while no run has happened.

## What needs YOU (decisions I deliberately did not make alone)

- **#6 / #9 / #10** are statistical-design choices that belong in `PREREGISTRATION.md` (the
  ceiling basis, the one effect-size floor, the confirmatory family + primary test). Changing
  them silently could *hurt* honesty, so I left them for you with the fix spelled out.
- **#19** weak-spot falsifiability — a product-judgment call.
- **#5 / #23 / #24** need the GPU run / model API to do safely.
