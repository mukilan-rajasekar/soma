# Pipeline role catalog

Python that turns video into arcs, scores, and science checks. **Paths stay where they
are** (root, `demo/`, `tools/`) so the gate and existing imports keep working. This
catalog is the map; thin `python -m pipeline.<name>` wrappers in this package re-dispatch
to those paths without moving files.

Canonical customer scorer: **`demo/process_batch.py`**.

## How to invoke

```bash
# preferred discovery (same argv as the real script)
./.venv/bin/python -m pipeline.batch_extract --help
./.venv/bin/python -m pipeline.process_batch --help

# always valid — the files the wrappers call
./.venv/bin/python batch_extract.py …
./.venv/bin/python demo/process_batch.py …
```

## Roles

### Extract activation

| Module | Path | Job |
|---|---|---|
| `batch_extract` | `batch_extract.py` | TRIBE v2 over a folder; caches `preds_*.npy`, arcs |
| `build_roi_mask` | `build_roi_mask.py` | A-priori ROI masks on fsaverage5 |
| `baseline_extract` | `baseline_extract.py` | ffmpeg stimulus covariates |
| `readout_extract` | `readout_extract.py` | Legacy / exploratory readout extract |

### Customer batch scorer (product)

| Module | Path | Job |
|---|---|---|
| `process_batch` | `demo/process_batch.py` | **Canonical** upload→report scorer (concierge + ingest) |

### Attention head

| Module | Path | Job |
|---|---|---|
| `train_head` | `train_head.py` | Fit ridge head vs TVSum |
| `head_io` | `head_io.py` | Serialize / apply head JSON |
| `head_apply` | `head_apply.py` | Score a clip with a saved head |
| `head_null_test` | `head_null_test.py` | Null harness (name must stay importable for pytest) |

### Validation

| Module | Path | Job |
|---|---|---|
| `honest_corr_timeseries` | `honest_corr_timeseries.py` | Within-video TRIBE vs TVSum |
| `incremental_validity` | `incremental_validity.py` | Partial corr vs ffmpeg baseline |
| `ad_backtest` | `ad_backtest.py` | Cross-sectional ad outcome ranking |
| `check_preds_space` | `check_preds_space.py` | Preds layout / space checks |

### Corpus / ads scraping (science, not Serve write)

| Module | Path | Job |
|---|---|---|
| `ad_fetch_bb` | `ad_fetch_bb.py` | Browserbase Ad Library / Creative Center scrape |
| `ad_performance` | `ad_performance.py` | Label corpus (e.g. TikTok `ctr_index`) |
| `ad_advertisers` | `ad_advertisers.py` | Advertiser catalog |
| — | `tools/corpus/*` | Audit, subset, Meta failure collection, bundle |

### Exploratory affect / message (unvalidated)

| Module | Path | Job |
|---|---|---|
| `affect_extract` | `affect_extract.py` | Valence/arousal proxy |
| `affect_head` | `affect_head.py` | Affect head vs LIRIS-ACCEDE |
| `coarse_states` | `coarse_states.py` | Affect quadrant spread |
| `message_extract` | `message_extract.py` | Language-ROI load lane |

### Publish / site build

| Module | Path | Job |
|---|---|---|
| `publish_to_supabase` | `publish_to_supabase.py` | Push arcs to Supabase |
| — | `tools/export_brain.py` | Cortical mesh → `public/brain/*.bin` |

### Improve / Serve / readout (under `tools/`)

| Path | Job | Status |
|---|---|---|
| `tools/edit/*` | Edit DSL, search, render | Product beta |
| `tools/generate/*` | Generation pipeline | Product beta |
| `tools/concierge/*` | Batch worker / provision | Production ops |
| `tools/capture/*` | `/run` honesty recorder | Live |
| `tools/demo/*` | Marketing report build + claim/coherence gates | Live |
| `tools/readout/windows.py` | Window finder (Stage 2) | Library + tests; scorer still inlines weak spots — see `tools/readout/README.md` |
| `tools/serve/*` | Outcomes CSV, Meta PAUSED client, guards, calibration, **pricing** (`pricing.py` is canonical weekly quote) | Scaffold + pricing engine (see `docs/strategy/SERVE-ACCESS.md`, `BUILD-PLAN-REVENUE.md`) |
| `scripts/ingest_partner_ad.py` | One ad → dashboard rows | Concierge |
| `scripts/stage1_tiktok_dryrun.py` | Stage 1 readiness printer | No GPU claim without arcs |

### Tests

Root `test_*.py` stay at repo root (pytest collection + gate). Do not move them into
`pipeline/` without updating `scripts/verify.sh` and every import path.

## Do not

- Invent a second `process_batch` at repo root.
- Import from gitignored `/data/`, `/tests/`, `/cloud/` in CI or the gate.
- Renumber applied migrations to “fix” gaps (see `supabase/migrations/README.md`).
