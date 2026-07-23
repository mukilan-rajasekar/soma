# SomAI inference pipeline — the whole machine on one page

*How a raw video becomes every arc we display, and exactly what is validated vs a guess.
Updated 2026-07-19 (attention head real-data result in; trained-head inference path shipped —
train_head `--save` → head_apply).*

## The one honesty rule that colors everything

Only **one link is validated: video → brain activation** (Meta's frozen TRIBE v2). Everything
downstream is **ours**, and is either a **learned hypothesis** (a trained head), a **raw
hypothesis** (arithmetic arc / proxy), or **decoration**. On real data the *raw arithmetic
arc is null* — the trained attention head is the only lane that shows any signal against
humans, and only weakly (combined Stouffer p=0.0005, but 2 of 15 clips individually beat the
ffmpeg baseline). Not a validated win.

## The stages

```
 RAW VIDEO
    │
 ┌──▼─────────────────────────────────────────────────────────────────────┐
 │ EXTRACT  [Meta-frozen · VALIDATED]                     GPU box           │
 │  1. build_events: video → chunked audio+video events                     │
 │  2. TRIBE.predict → preds_<id>.npy  (n_sec, 20484) z-scored SIGNED BOLD  │
 │     code: batch_extract.py  →  preds_<id>.npy + arc_<id>.csv/.json       │
 └──┬─────────────────────────────────────────────────────────────────────┘
    │  preds_<id>.npy
    ├─────────────────────────────┬───────────────────────────────────────┐
 ┌──▼──────────────────┐   ┌──────▼──────────────┐   ┌─────────────────────▼─┐
 │ REDUCE (arithmetic) │   │ LEARN (trained)     │   │ AFFECT PROXY (raw)     │
 │ [ours · HYPOTHESIS] │   │ [ours · LEARNED-HYP]│   │ [ours · HYPOTHESIS]    │
 │  3. arc_from_preds  │   │  attention head     │   │  6a. affect_extract    │
 │    → global_mag,    │   │   train_head.py     │   │    → valence/arousal   │
 │      roi_mag (arc)  │   │   SHIPPED: fit_all  │   │      proxy (null-prone)│
 │  → NULL on real     │   │   + head_apply →    │   │  6b. coarse_states     │
 │    data             │   │   arc.activation    │   │    → 4 quadrants       │
 │  5. weak_spots      │   │  affect head        │   │    [DECORATION]        │
 │    (falsifiable)    │   │   affect_head.py    │   │                        │
 └──────────┬──────────┘   └──────────┬──────────┘   └───────────┬───────────┘
            └───────────────┬─────────┴──────────────────────────┘
 ┌──────────────────────────▼──────────────────────────────────────────────┐
 │ VALIDATE  [ours · the honest yardstick, refuses to hide a null]          │
 │  8. honest_corr_timeseries (arc vs TVSum interest) — the arc is NULL     │
 │  9. incremental_validity (arc vs ffmpeg baseline)                        │
 │ 10. affect_head (proxy/head vs LIRIS) + ad_backtest (head vs ad outcomes)│
 │     + train_head --shuffle-target: empirical shuffle-null for a head     │
 └──────────────────────────┬──────────────────────────────────────────────┘
 ┌──────────────────────────▼──────────────────────────────────────────────┐
 │ PUBLISH  [decoration; honest-by-construction]                            │
 │ 11. publish_to_supabase.py → Supabase `arcs` table → /api/arcs route     │
 └──────────────────────────────────────────────────────────────────────────┘
```

## What's proven vs a guess (the labels that must ride on every arc)

| Layer | Owner | Status | Reality |
|---|---|---|---|
| video → brain activation | Meta (frozen TRIBE) | **validated** | benchmarked vs real fMRI (Schaefer-1000, r~0.21) |
| arithmetic arc (roi_mag/global_mag) | ours | hypothesis | **NULL** on real TVSum |
| affect proxy (valence/arousal) | ours | hypothesis | the emotion twin of the null arc |
| coarse quadrants | ours | decoration | NOT named emotions |
| **attention head** (train_head) | ours | learned-hypothesis | **weak: median r≈0.20 across n=15, combined Stouffer p=0.0005, but only 2/15 clips beat the ffmpeg baseline** |
| **affect head** (affect_head) | ours | learned-hypothesis | machine-verified on synthetic; needs LIRIS for real |
| validators / report | ours | sound | stamp nulls honestly |

*The attention-head numbers above are quoted from `validation/head_incremental.csv` (footer:
`median_raw=0.1719 median_partial=0.1784 adds=2/15 stouffer_p=0.0005`) and `validation/head.csv`.
This is a weak aggregate signal, **not** a validated result — never label it "validated".*

## What ships today (the trained-head inference path)

The trained head can score a **new**, unseen video end to end — this path already exists:

1. **`train_head.py --fit-all --save`** fits the ridge on ALL videos (not just leave-one-out
   validation), records the chosen alpha, the per-video-standardization recipe, the feature/mask
   spec, and the honest track-record stamp, then persists them via **`head_io.save_head`** as a
   **JSON** file (schema `head-1.0`, `head_io.SCHEMA_VERSION`). The affect twin,
   **`affect_head.py --save-dir`**, writes `head_<dim>.json` the same way.
2. **`head_apply.py`** loads a saved head (`head_io.load_head`), scores `preds_<id>.npy`
   (`head_io.apply_head`), and writes the head-predicted arc back into `arc_<id>.json` — promoting
   the attention head to the HEADLINE lane (`arc.activation`) and demoting the untrained
   arithmetic arc to a labeled `baseline` trace (never deleted). Each lane carries the head's
   honest badge, and a POISONED head (failed leak-check) is refused outright.

A head arc on a brand-new ad is OUT-OF-DISTRIBUTION from the TVSum training proxy — the badge
(`head_io.badge_text`) says exactly that. It is a hypothesis being scored, not a validated result.

## The gaps (what stops this from being a product yet)

1. **The head signal is weak, not validated.** Only 2 of 15 clips individually beat the ffmpeg
   baseline (aggregate Stouffer p=0.0005). The affect head is machine-verified on synthetic data
   only — it needs real LIRIS targets before any real claim.
2. **No single command** spans extract → reduce → heads → validate → publish. GPU extract and CPU
   analysis are joined only by copying `preds_<id>.npy` / `arc_<id>.*` off the GPU box by hand.
3. **affect_extract / coarse_states / message_extract are orphaned** from orchestration (run by
   hand, one script at a time).

## Next build: one orchestrating command

The head inference path itself is done (see above). What is still missing is a single runner that
chains the stages so an operator does not invoke each script by hand:

- A `run_full.py` (does **not** exist yet) that would preflight masks + disk space → extract (or
  print the GPU-box command if no GPU) → arithmetic arc + weak spots → affect proxy → apply the
  attention & affect heads → validate → publish to Supabase. Honest boundaries preserved: stage
  labels travel into the JSON the site reads. It must never fake the GPU step.

## How to run the pieces today

Every command below is a real, tracked script. Paths assume `preds_<id>.npy`, `arc_<id>.csv`, and
`arc_<id>.json` live under `data/arcs/`, a-priori masks (`roi_*.npy`) under `data/`.

```
# 0. a-priori ROI masks (once): DMN drives attention; valence/arousal drive affect
python build_roi_mask.py --network dmn     --out data/roi_mask_dmn.npy
python build_roi_mask.py --network valence --out data/roi_mask_valence.npy
python build_roi_mask.py --network arousal --out data/roi_mask_arousal.npy

# 1. EXTRACT on the GPU box: video -> preds_<id>.npy + arc_<id>.csv + arc_<id>.json
python batch_extract.py --video-dir ./clips --out data/arcs \
    --roi-mask data/roi_mask_dmn.npy

# 2. LEARN — validate the attention head (leave-one-video-out on TVSum), writes validation/head.csv
python train_head.py --preds-dir data/arcs --arc-dir data/arcs \
    --human-dir data/tvsum --masks-dir data --out validation/head

# 2b. FIT + SAVE the reusable inference head (JSON, schema head-1.0)
python train_head.py --preds-dir data/arcs --arc-dir data/arcs \
    --human-dir data/tvsum --masks-dir data \
    --fit-all --save validation/head_attn.json

# 2c. affect heads (needs LIRIS targets); --save-dir writes head_<dim>.json
python affect_head.py --preds-dir data/arcs --target-dir data/liris \
    --masks-dir data --save-dir validation

# 3. APPLY — score videos with saved head(s); promotes the head lane to arc.activation
python head_apply.py --preds-dir data/arcs --arc-dir data/arcs \
    --head validation/head_attn.json
#   (comma-separate to apply attention + both affect heads at once:)
#   --head validation/head_attn.json,validation/head_valence.json,validation/head_arousal.json

# 4. AFFECT PROXY (raw) + coarse quadrants (decoration lanes)
python affect_extract.py --arc-dir data/arcs \
    --valence-mask data/roi_mask_valence.npy --arousal-mask data/roi_mask_arousal.npy
python coarse_states.py --arc-glob "data/arcs/arc_*.json"
#   optional message lane (needs a language ROI: build_roi_mask.py --network language):
python message_extract.py --preds-glob "data/arcs/preds_*.npy" \
    --mask data/roi_mask_language.npy --arc-dir data/arcs

# 5. VALIDATE — the honest yardsticks
python honest_corr_timeseries.py --model-glob "data/arcs/arc_*.csv" --human-dir data/tvsum
python incremental_validity.py --arc-dir data/arcs --human-dir data/tvsum --baseline-dir data/baseline
#   empirical shuffle-null for a head (run before trusting a head signal):
python train_head.py --preds-dir data/arcs --arc-dir data/arcs \
    --human-dir data/tvsum --masks-dir data --shuffle-target
#   ad back-test: head vs real ad outcomes (out-of-distribution):
python ad_backtest.py --manifest data/ads/manifest.csv --score head \
    --head validation/head_attn.json

# 6. PUBLISH -> Supabase `arcs` table (served by src/app/api/arcs/route.ts, NOT a local file)
python publish_to_supabase.py "data/arcs/arc_*.json"
```
