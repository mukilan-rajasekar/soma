<!-- refreshed: 2026-07-18 -->
# Architecture

**Analysis Date:** 2026-07-18

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INPUT LAYER                                         │
│  Video File → GPU Extraction (TRIBE v2, Colab/A100)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  `batch_extract.py` / `colab_run.ipynb`                                    │
│  ↓                                                                           │
│  preds_<id>.npy (T, 20484) + arc_<id>.csv + arc_<id>.json                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                    ANALYSIS LAYER (CPU-Only)                                │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ ATTENTION (Primary) ────────────────────────────────────────────────  │  │
│  │ • tvsum_prep.py      → human_arc_<id>.csv (20-annotator curves)     │  │
│  │ • honest_corr_timeseries.py (PRIMARY) → results.csv                 │  │
│  │   (within-video, first-differenced, circular-shift null)            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ BASELINES (Secondary) ──────────────────────────────────────────────  │  │
│  │ • baseline_extract.py   → loudness/cuts/luminance/motion features   │  │
│  │ • incremental_validity.py → partial correlation test                │  │
│  │   (does brain arc beat ffmpeg-only features?)                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ AFFECT (Tertiary, Experimental) ───────────────────────────────────  │  │
│  │ • affect_extract.py      → valence/arousal masks → arc_<id>.json    │  │
│  │ • affect_validate.py     → LIRIS-ACCEDE validation (same harness)   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ ORCHESTRATION                                                        │  │
│  │ • run_pipeline.py → chains all stages (att → incr → affect)         │  │
│  │ • publish_results.py → demo/results.json (honest null handling)     │  │
│  │ • make_report.py → validation/report.html (forest plots, badges)   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│                    OUTPUT / DELIVERY LAYER                                   │
│                                                                              │
│  ┌─────────────────────────────────┐   ┌───────────────────────────────┐   │
│  │ DEMO (Static Web App)           │   │ REPORT (HTML)                 │   │
│  │ `demo/index.html`               │   │ `validation/report.html`      │   │
│  │ `demo/app.js`                   │   │ (embedeed forest plots,       │   │
│  │ • Loads arc.json (static asset) │   │  nulls/badges, etc.)          │   │
│  │ • 3D cortex (decoration)        │   │                               │   │
│  │ • Three lanes: att/val/aro      │   │ Supabase:                     │   │
│  │ • Evidence badges               │   │ • waitlist (write-only)       │   │
│  │ • Weak-spot callouts            │   │ • arcs table (shared results) │   │
│  │                                 │   │ • uploads (concierge queue)   │   │
│  │ Vercel deployment               │   │                               │   │
│  └─────────────────────────────────┘   └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Prediction** | Load TRIBE v2 model; extract brain activation from video file | `batch_extract.py` / `colab_run.ipynb` |
| **Arc Reduction** | Reduce (T, 20484) predictions → per-second global_mag + roi_mag | `batch_extract.py::arc_from_preds()` |
| **Weak-Spot Detection** | Identify sustained low-activation stretches (smoothed, percentile-based) | `batch_extract.py::detect_weak_spots()` |
| **Demo JSON Generation** | Normalize arc [0..1], package with evidence claims for browser | `batch_extract.py::write_demo_json()` |
| **Human Arcs** | Parse TVSum .mat → per-video per-annotator importance → mean curves | `tvsum_prep.py` |
| **ROI Masks** | Build fsaverage5 surface masks (DMN/DAN/valence/arousal) via nilearn | `build_roi_mask.py` |
| **Attention Validation** | Within-video first-differenced correlation vs TVSum; circular-shift null | `honest_corr_timeseries.py` |
| **Between-Video Test** | Scalar retention % correlation; small-n, reported transparently | `honest_corr.py` |
| **Baseline Features** | Extract loudness, cuts, luminance, motion from raw video | `baseline_extract.py` |
| **Incremental Validity** | Partial correlation: does brain arc add signal beyond dumb features? | `incremental_validity.py` |
| **Affect Extraction** | Valence/arousal proxy from OFC/vmPFC + insula regions | `affect_extract.py` |
| **Affect Validation** | Test affect arc against LIRIS-ACCEDE (same harness as attention) | `affect_validate.py` |
| **Head Training** | Ridge regression over frozen TRIBE features; leave-one-video-out | `train_head.py` |
| **Pipeline Orchestration** | Chain all stages in order, handle optional inputs, skip missing data | `run_pipeline.py` |
| **Result Publishing** | Write honest demo/results.json (stamp "null_result" if p ≥ α) | `publish_results.py` |
| **Report Generation** | Render forest plots, evidence badges, null handling into report.html | `make_report.py` |
| **Demo Player** | Load arc.json; time-sync three lanes; render fire-blob attention glyph | `demo/app.js` |
| **3D Cortex** | Three.js mesh + scroll-triggered activity flashes (decoration only) | `demo/brain3d.js` |
| **Test Harness** | Synthetic-data regression; validate signal detection + null control | `tests/dry_run.py` + `tests/make_synthetic_data.py` |
| **Supabase** | Write-only waitlist; public-read arcs table; upload concierge queue | `supabase/schema.sql` |

## Pattern Overview

**Overall:** Neuroscience-grounded validation pipeline with **honest uncertainty quantification**.

**Key Characteristics:**
- **Separation of concerns**: GPU inference (colab_run.ipynb) is completely independent from CPU analysis. Both use the same arc_*.csv schema.
- **No re-training on target**: TRIBE model is frozen (Meta's public facebook/tribev2). All readouts (attention, affect, head) are computed from cached predictions.
- **Pre-registration enforced**: Features (global vs roi) and test specs must be locked in PREREGISTRATION.md before running honest_corr_timeseries.py. No cherry-picking.
- **Null reporting**: All stages report p-values. A null (p ≥ 0.05) is a legitimate, documented outcome—never suppressed or retrofit.
- **Within-video n**: Statistics powered by time (T = tens-to-hundreds per video), not videos (n = handful). Autocorrelation-aware circular-shift null, first-differencing.
- **Evidence badges**: Every claim on the demo wears a tier: green=validated (TRIBE), amber=pending-test (attention), red=hypothesis (affect). No ambiguity.

## Layers

**GPU Inference Layer:**
- Purpose: Run TRIBE v2 encoder on video input; cache predictions to disk so analysis is deterministic and reproducible.
- Location: `batch_extract.py` (orchestrator) + `colab_run.ipynb` (Colab T4 path)
- Contains: Model loading, event building, batch prediction, preds distribution logging
- Depends on: TRIBE v2 (facebook/tribev2, ~1 GB), neuralset (event transforms), torch
- Used by: Everything downstream (analysis reads arc_*.csv, arc_*.json)
- Output schema: 
  - `preds_<id>.npy` shape (T, 20484), z-scored signed BOLD (~[-1,+1])
  - `arc_<id>.csv` columns: t_sec, global_mag, roi_mag
  - `arc_<id>.json` demo-ready with timestamps, normalized activation, weak_spots

**Data Preparation Layer:**
- Purpose: Convert raw TVSum + other annotated datasets into per-video per-second curves; build anatomical ROI masks
- Location: `tvsum_prep.py`, `liris_prep.py`, `build_roi_mask.py`, `baseline_extract.py`
- Contains: .mat parsing, mask generation via nilearn Destrieux atlas, ffmpeg feature extraction
- Depends on: scipy (loadmat), nilearn (atlas), opencv (frame analysis), imageio-ffmpeg
- Used by: Validation stage (honest_corr_timeseries.py consumes human_arc_*.csv + human_annos_*.npy)

**Validation Layer (Attention):**
- Purpose: Test whether predicted arc correlates with human attention curve using rigorous stats
- Location: `honest_corr_timeseries.py`
- Contains: Spearman correlation, first-differencing, circular-shift permutation, LOAO ceiling, forest plot rendering
- Depends on: numpy, scipy.stats (rankdata, norm), matplotlib (forest plot)
- Used by: run_pipeline.py, publish_results.py
- Harness: Within-video (n=time), autocorrelation-aware, pre-registered features

**Secondary Validation Layer (Incremental + Affect):**
- Purpose: Incremental validity (brain vs ffmpeg) + affect hypothesis testing
- Location: `incremental_validity.py`, `affect_extract.py`, `affect_validate.py`
- Contains: Partial correlation, affect mask application, coarse-state quadrant spreading
- Depends on: Same as validation layer + pre-computed ROI masks
- Used by: run_pipeline.py (optional; skipped if input missing)

**Head Training Layer:**
- Purpose: Ridge regression over frozen TRIBE features with leave-one-video-out CV
- Location: `train_head.py`
- Contains: sklearn ridge, cross-validation, weight serialization
- Depends on: scikit-learn, numpy
- Used by: Rung-1→Rung-2 roadmap (not yet a core deliverable)

**Orchestration Layer:**
- Purpose: Chain all stages in one command; handle optional inputs gracefully; publish when ready
- Location: `run_pipeline.py`, `publish_results.py`, `make_report.py`
- Contains: Subprocess orchestration, results aggregation, demo/report generation
- Depends on: subprocess, argparse, numpy (for JSON serialization)
- Used by: `make pipeline`, `make ingest`

**Demo / Delivery Layer:**
- Purpose: Browser-based arc player with 3D cortex hero, evidence badges, honest claims
- Location: `demo/` (static HTML/JS, no build step, no runtime backend)
- Contains: Canvas rendering, Three.js 3D mesh, Supabase client, arc loading
- Depends on: Three.js r185 (vendored), Lenis scroll library (vendored), Supabase JS client
- Used by: Public-facing website; Vercel deployment
- Entry points: `demo/index.html` (main demo), `demo/waitlist.html` (early-access signup), `demo/pitch.html` (deck)

## Data Flow

### Primary Request Path (Attention Validation)

1. **Video input** (`demo/` or `colab_run.ipynb`): User uploads or Colab processes an MP4
2. **GPU extraction** (`batch_extract.py::build_events()` → `TribeModel.predict()`): ~2-3 min/clip on Colab T4, caches preds_<id>.npy
3. **Arc reduction** (`batch_extract.py::arc_from_preds()`): Reduce (T, 20484) → global_mag[t] + roi_mag[t]
4. **Human data prep** (`tvsum_prep.py`): Load TVSum .mat → human_arc_<id>.csv (mean) + human_annos_<id>.npy (20 annotators for ceiling)
5. **Validation** (`honest_corr_timeseries.py`):
   - Load model arc_<id>.csv + human_arc_<id>.csv
   - First-difference both → removes shared drift
   - Spearman ρ on first-differenced series
   - Circular-shift null: rotate one series N times, compute ρ each time
   - Report r, p (permutation), p_param (parametric fallback), ceiling (LOAO), frac (effect size)
   - Forest: all videos side-by-side; Stouffer/Fisher combined p
6. **Publication** (`publish_results.py`): Write demo/results.json with evidence badges; stamp "null_result" if p ≥ 0.05
7. **Report** (`make_report.py`): Embed forest plot PNG, null-handling table, badge legend → validation/report.html
8. **Demo render** (`demo/app.js`): Load arc.json, render three lanes synced to timer or video element

### Secondary Flow: Incremental Validity (Beats Ffmpeg?)

1. **Baseline extraction** (`baseline_extract.py`): Per-frame luminance, motion, cuts, audio loudness → baseline_<id>.csv (n_frames columns)
2. **Incremental test** (`incremental_validity.py`):
   - Load brain arc + baseline arc
   - Downsample baseline to match arc resolution (t_sec)
   - Partial correlation: brain arc | baseline → residuals
   - Circular-shift null on residuals
   - Report raw_r (brain vs human), partial_r (after baseline removal), perm_p
3. **Publication** (`publish_results.py --incremental`): Fold incremental CSV into demo/results.json as "beats_baseline" flag

### Tertiary Flow: Affect Hypothesis (Valence/Arousal Proxy)

1. **Affect extraction** (`affect_extract.py`): Load preds_<id>.npy + OFC/vmPFC + insula masks → per-second valence[] / arousal[]
2. **Coarse states** (`coarse_states.py`): Spread quadrant distribution (high val / high aro / etc.) → arc.affect.coarse_states in arc_<id>.json
3. **Affect validation** (`affect_validate.py`):
   - Load LIRIS continuous valence/arousal from liris_<id>.csv
   - Run SAME within-video / first-diff / perm-shift harness as attention
   - Report separately for valence + arousal
   - Badge: "hypothesis" (not yet validated) → "proxy tracks" (if perm-tested result exists)

### State Management

- **Arcs are immutable assets**: arc_<id>.csv (raw per-second scalars) is cached once from GPU run, never recomputed. Arc_<id>.json (demo-ready) is also cached.
- **Results are ephemeral**: results.csv, incremental.csv, affect_results.csv are recomputed on each validation run. No state carries across runs.
- **Supabase as SoR**: The `public.arcs` table (Supabase) is the shared source of truth for team results. `demo/results.json` is derived from a pre-registered run.
- **Pre-registration is locked**: PREREGISTRATION.md sets feature/ROI/test *before* any results look. Changes require a new .md file (e.g., PREREGISTRATION-affect.md).

## Key Abstractions

**Arc Object (CSV + JSON):**
- Purpose: Per-second prediction summary (global magnitude, ROI magnitude, weak-spot callouts, evidence tier)
- Examples: `data/arcs/arc_tvsum001.csv` (raw), `data/arcs/arc_tvsum001.json` (demo-ready)
- Pattern: Reusable, cache-friendly; JSON version auto-generated from CSV + ROI reduction; both are immutable after GPU run

**ROI Mask:**
- Purpose: Anatomical region (DMN, DAN, valence, arousal) encoded as boolean vector (20484,)
- Examples: `data/roi_mask_dmn.npy`, `data/roi_mask_valence.npy`
- Pattern: Built once via `build_roi_mask.py` using Destrieux atlas; reused for all videos and stats

**Human Attention Curve (TVSum):**
- Purpose: Multi-annotator ground truth for validation
- Examples: `data/tvsum/human_arc_tvsum001.csv` (mean), `data/tvsum/human_annos_tvsum001.npy` (n_annotators, n_shots)
- Pattern: Per-shot importance, interpolated to per-second if arc is 1 Hz

**Results Matrix (CSV):**
- Purpose: Tabular output of one statistical test (attention, incremental, affect)
- Examples: `validation/results.csv`, `validation/incremental.csv`, `validation/affect_results.csv`
- Pattern: One row per (video, feature) pair; columns: video, feature, n, r, p, p_param, n_eff, ceiling, frac, note

**Evidence Badge (JSON):**
- Purpose: Declare evidence tier for a claim (validated / pending / hypothesis)
- Examples: `{"status": "permutation-tested", "vs": "TVSum", "note": "circular-shift null"}` (attention); `{"status": "hypothesis"}` (affect)
- Pattern: Rendered in demo/report with color coding; demo shows badge on every lane

## Entry Points

**`batch_extract.py` (GPU Inference):**
- Location: `/Users/mukilan/Projects/Brain Project/batch_extract.py`
- Triggers: Rented A100 box or Colab Cell 2B (after video upload)
- Responsibilities: Loop over video files, predict with TRIBE, reduce arcs, cache preds/CSVs/JSONs
- Interface: `--video-dir`, `--out`, `--roi-mask`, `--modality` (av | trimodal | video)
- Exit: Writes preds_<id>.npy, arc_<id>.csv, arc_<id>.json; prints preds distribution

**`run_pipeline.py` (CPU Orchestration):**
- Location: `/Users/mukilan/Projects/Brain Project/run_pipeline.py`
- Triggers: Local `make pipeline` after arcs are cached
- Responsibilities: Chain honest_corr → incremental → affect → publish → report in order
- Interface: `--arc-dir`, `--human-dir`, `--baseline-dir`, `--arc-json-dir`, `--out-dir`, `--demo`, `--report`
- Exit: Writes validation/ CSVs + report.html; optionally demo/results.json

**`demo/index.html` (Web Frontend):**
- Location: `/Users/mukilan/Projects/Brain Project/demo/index.html`
- Triggers: Browser open or Vercel auto-deployment on push to main
- Responsibilities: Load demo/results.json or sample arcs; render 3D cortex + arc lanes + badges
- Interface: URL param `?arc=arcs/arc_<id>.json` (static sample) or auto-load demo/results.json
- Exit: Browser renders interactive demo with playhead sync, weak-spot callouts, evidence badges

**`tests/dry_run.py` (Synthetic Validation):**
- Location: `/Users/mukilan/Projects/Brain Project/tests/dry_run.py`
- Triggers: `make test` before trusting any change
- Responsibilities: Run entire pipeline on synthetic fixtures; assert signal detected, null control quiet
- Interface: Reads tests/synth/MANIFEST.json, preds_*.npy, roi_*.npy
- Exit: 25 assertions; fails loudly if any break

## Architectural Constraints

- **Threading:** Single-threaded event loop (Python scripts). Colab uses one GPU session per run.
- **Global state:** None in the analysis layer (pure functions on arc CSVs). TRIBE model is loaded once per batch_extract.py run, held in memory.
- **Circular imports:** None detected. Scripts are organized as entry points, not interdependent modules.
- **Numpy version lock:** `numpy>=1.26,<2.1` is HARD. TRIBE + neuralset compiled extensions break on numpy 2.x. Do not bump.
- **No async / await:** All I/O is blocking (file read/write, subprocess.run). Colab notebooks handle GPU interleaving via cell isolation.
- **ROI mask immutability:** build_roi_mask.py produces one .npy file per region. Changes to Destrieux atlas mapping require a new run + .npy rename.
- **Arc determinism:** Given the same preds_<id>.npy + roi_mask, arc_from_preds() always returns the same CSV/JSON. No randomness.
- **Demo static asset assumption:** demo/results.json is a hand-curated, pre-computed JSON. The demo assumes it's already published; no real-time backend connection.
- **Supabase availability:** Waitlist and shared arcs table degrade to localStorage fallback if Supabase is unreachable (demo/supabase.js has try/catch).

## Anti-Patterns

### Fabricated Results

**What happens:** Shipping results that were cherry-picked or best-of-N without pre-registration.
**Why it's wrong:** Inflates false-positive rate; violates pre-registration contract; erodes credibility with YC / scientific peers.
**Do this instead:** Pre-register feature/ROI/null in PREREGISTRATION.md *before* looking at data. Report every video (forest table), not just the winner. A null is a valid, publishable outcome.

### Treating Activation as Interest

**What happens:** Calling predicted brain activation "interest" or "engagement" without validation.
**Why it's wrong:** Activation ≠ interest; reverse-inference trap. Same peak could be interest, confusion, mild alarm, or noise.
**Do this instead:** Use "predicted activation" or "neural response" in all internal docs. The "attention arc" is a *hypothesis* (our downstream inference) with an explicit test plan. Only call it validated once the permutation test clears α.

### Ignoring Autocorrelation

**What happens:** Using naive Pearson r on two smooth, autocorrelated time series without adjusting the null.
**Why it's wrong:** Treats 180 smooth time points as 180 independent observations; manufactures spuriously tiny p.
**Do this instead:** First-difference both series (removes shared slow drift), then circular-shift permutation null (preserves autocorrelation structure in the null). This is what honest_corr_timeseries.py does.

### Leaking Global Signal

**What happens:** Computing whole-cortex activation (`global_mag`) as the demo feature; claiming it predicts interest.
**Why it's wrong:** Global TRIBE drive is *published* NOT to predict YouTube most-replayed. It's the documented likely-null baseline.
**Do this instead:** Use the a-priori ROI (`roi_mag`, DMN by default) as the main test. Report global as the null baseline, side-by-side in the forest table. Cite the published negative prior proactively.

### Re-introducing Views/Likes

**What happens:** Swapping retention % back to views or likes as the validation outcome.
**Why it's wrong:** Views are algorithm-driven (thumbnail, title, timing); retention is content-driven. Only retention reflects what the model sees (video bytes).
**Do this instead:** Use retention_pct from real data, or TVSum's human-importance curve. Never promote views/likes metrics back into the core science.

## Error Handling

**Strategy:** Fail fast on GPU extraction; graceful degradation on analysis.

**Patterns:**
- **batch_extract.py**: Logs one bad clip → continues batch (BLE001 bare except). Prints preds distribution *once* so you confirm z-scored scale; repeats silently on cache hits.
- **honest_corr_timeseries.py**: Missing human_arc → skips that video (logged). All videos always processed; combined p is still computed if ≥1 video survives.
- **run_pipeline.py**: Missing optional input (e.g., baseline_*.csv) → stage is skipped with a printed note, pipeline continues. Required stage (attention) fails hard.
- **publish_results.py**: Stamps `"null_result": true` when p ≥ 0.05; demo reads this flag and renders "not validated" badge, never fabricates.
- **demo/app.js**: Failed arc.json fetch → renders error message on canvas; does not crash the page.
- **Supabase downtime**: demo/supabase.js wraps all calls in try/catch; falls back to localStorage for waitlist.

## Cross-Cutting Concerns

**Logging:**
- **Approach:** Bare print() statements (no logging module). Scripts log to stdout; Colab cells capture and display.
- **Key messages:** "preds distribution" (confirm scale once), "[skip] / [done]" (stage lifecycle), "[ERROR] / [FAIL]" (condition failures).
- **No log file:** Output is ephemeral; results are in CSV/JSON/HTML files.

**Validation:**
- **Approach:** Pre-registration enforced in code (see PREREGISTRATION.md). Feature/ROI locked before run_pipeline.py touches data.
- **Harness:** Synthetic-data regression (make test). Plants a signal in tests/synth/ fixtures; asserts honest_corr_timeseries detects it + stays quiet on null control.
- **CI/CD:** No automated CI; tests run manually on developer machines before each code change.

**Authentication:**
- **Approach:** Supabase RLS (Row-Level Security) + anon/service_role keys.
- **Details:** 
  - Waitlist: write-only for anon (browser can submit email, can't read list).
  - Arcs table: read-only for anon (public demo can fetch), write-only for service_role (backend publish only).
  - Uploads: write-only for anon (upload video), read-only for service_role (queue processing).
- **No API auth in demo:** Uses Supabase's public anon key; all security is table-level RLS.

---

*Architecture analysis: 2026-07-18*
