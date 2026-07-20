# SomAI inference pipeline — the whole machine on one page

*How a raw video becomes every arc we display, and exactly what is validated vs a guess.
Updated 2026-07-19 (attention head real-data result in; affect head built).*

## The one honesty rule that colors everything

Only **one link is validated: video → brain activation** (Meta's frozen TRIBE v2). Everything
downstream is **ours**, and is either a **learned hypothesis** (a trained head), a **raw
hypothesis** (arithmetic arc / proxy), or **decoration**. On real data the *raw arithmetic
arc is null* — the trained heads are the only thing that tracks humans.

## The stages

```
 RAW VIDEO
    │
 ┌──▼─────────────────────────────────────────────────────────────────────┐
 │ EXTRACT  [Meta-frozen · VALIDATED]                     GPU (Colab)       │
 │  1. build_events: video → chunked audio+video events                    │
 │  2. TRIBE.predict → preds_<id>.npy  (n_sec, 20484) z-scored SIGNED BOLD  │
 │     code: batch_extract.py / colab_run.ipynb Cell 3-4                    │
 └──┬─────────────────────────────────────────────────────────────────────┘
    │  preds_<id>.npy
    ├─────────────────────────────┬───────────────────────────────────────┐
 ┌──▼──────────────────┐   ┌──────▼──────────────┐   ┌─────────────────────▼─┐
 │ REDUCE (arithmetic) │   │ LEARN (trained)     │   │ AFFECT PROXY (raw)     │
 │ [ours · HYPOTHESIS] │   │ [ours · LEARNED-HYP]│   │ [ours · HYPOTHESIS]    │
 │  3. arc_from_preds  │   │  attention head     │   │  6a. affect_extract    │
 │    → global_mag,    │   │   train_head.py     │   │    → valence/arousal   │
 │      roi_mag (arc)  │   │   ✓ REAL: r~0.20,   │   │      proxy (null-prone)│
 │  → NULL on real     │   │     p~0.03, n=15    │   │  6b. coarse_states     │
 │    data             │   │  affect head        │   │    → 4 quadrants       │
 │  5. weak_spots      │   │   affect_head.py    │   │    [DECORATION]        │
 │    (falsifiable)    │   │   ✓ machine-tested  │   │                        │
 └──────────┬──────────┘   └──────────┬──────────┘   └───────────┬───────────┘
            └───────────────┬─────────┴──────────────────────────┘
 ┌──────────────────────────▼──────────────────────────────────────────────┐
 │ VALIDATE  [ours · the honest yardstick, refuses to hide a null]          │
 │  8. honest_corr_timeseries (arc vs TVSum interest) — the arc is NULL     │
 │  9. incremental_validity (arc vs ffmpeg baseline)                        │
 │ 10. affect_validate (proxy vs LIRIS)                                     │
 │     + head_null_test.py: empirical shuffle-null for a trained head       │
 └──────────────────────────┬──────────────────────────────────────────────┘
 ┌──────────────────────────▼──────────────────────────────────────────────┐
 │ PUBLISH / REPORT  [decoration; honest-by-construction]                   │
 │ 11. publish_results → demo/results.json   12. make_report → report.html  │
 └──────────────────────────────────────────────────────────────────────────┘
```

## What's proven vs a guess (the labels that must ride on every arc)

| Layer | Owner | Status | Reality |
|---|---|---|---|
| video → brain activation | Meta (frozen TRIBE) | **validated** | benchmarked vs real fMRI (Schaefer-1000, r~0.21) |
| arithmetic arc (roi_mag/global_mag) | ours | hypothesis | **NULL** on real TVSum |
| affect proxy (valence/arousal) | ours | hypothesis | the emotion twin of the null arc |
| coarse quadrants | ours | decoration | NOT named emotions |
| **attention head** (train_head) | ours | learned-hypothesis | **real: r~0.20, p~0.03, n=15** |
| **affect head** (affect_head) | ours | learned-hypothesis | machine-verified on synthetic; needs LIRIS for real |
| validators / report | ours | sound | stamp nulls honestly |

## The gaps (what stops this from being a product yet)

1. **The trained heads have no inference path.** `train_head.py` / `affect_head.py` are
   leave-one-VIDEO-out *validation* only — they never fit a final all-data model, never save
   weights, and can't score a **new** ad. So a raw uploaded ad cannot actually receive a
   head-predicted arc. **This is the #1 thing to build next.**
2. **The heads aren't in the demo path.** The demo attention lane is still the *arithmetic*
   (null) arc; the real head arc is never written back into `arc_<id>.json`.
3. **No single command** spans extract → reduce → heads → validate. GPU extract and CPU
   analysis are joined only by a manual zip + `make ingest`.
4. **affect_extract / coarse_states are orphaned** from orchestration (run by hand).

## Next build: the head inference path + one command

- **`train_head.py --fit-all --save validation/head_attn.pkl`** (and the affect twin):
  fit the ridge on ALL videos, persist weights + alpha + the per-video-standardization recipe
  + the feature/mask spec.
- **`head_apply.py preds_<id>.npy --head head_attn.pkl`** → a head-predicted arc, written
  back into `arc_<id>.json` as the HEADLINE lane with a `learned-hypothesis (r~0.20)` badge,
  demoting the arithmetic curve to a secondary trace.
- **`run_full.py` / `make all VIDEO_DIR=...`**: preflight masks + space check → extract (or
  print the Colab command if no GPU) → arithmetic arc + weak spots → affect proxy → apply
  attention & affect heads → validate → publish. Honest boundaries preserved: stage labels
  travel into the JSON the demo reads. Never fakes the GPU step.

## How to run the pieces today

```
make head          # attention head, LOVO stats on real data
make head-null     # empirical shuffle-null (run before trusting a head signal)
make affect-head   # affect head on real data (needs LIRIS targets)
make affect-head-demo   # affect head on synthetic (proves the machine)
make test          # full synthetic regression incl. both heads + the v7.3 .mat guard
```
