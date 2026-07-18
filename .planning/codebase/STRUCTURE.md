# Codebase Structure

**Analysis Date:** 2026-07-18

## Directory Layout

```
/Users/mukilan/Projects/Brain Project/
├── README.md                           # Project overview, quickstart, file map
├── CLAUDE.md                           # Working constraints, team context, architecture philosophy
├── VISION.md                           # Product vision, roadmap (R0→R4), evidence ladder
├── ROADMAP.md                          # Rung-by-rung staircase and timeline
├── PIPELINE.md                         # End-to-end GPU + analysis runbook
├── PREREGISTRATION.md                  # Locked analysis plan (attention arc vs TVSum)
├── PREREGISTRATION-affect.md           # Locked analysis plan (affect Rung-1 vs LIRIS)
├── colab_README.md                     # Copy-paste Colab T4 instructions (mirrors batch_extract.py)
├── Makefile                            # Local build targets (make test, make pipeline, etc.)
├── requirements.txt                    # Two groups: GPU/inference + CPU/analysis
├── 
├── .planning/                          # GSD planning scratch
│   └── codebase/                       # This architecture map lives here
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
├──
├── === CORE PIPELINE SCRIPTS (root level) ===
├── 
├── batch_extract.py ⭐                # GPU EXTRACTION RUNBOOK. Runs TRIBE v2 on video folder.
│                                       # → preds_<id>.npy, arc_<id>.csv, arc_<id>.json
├── tvsum_prep.py                       # Convert TVSum .mat → human_arc_<id>.csv + human_annos_<id>.npy
├── build_roi_mask.py                   # Build a-priori DMN/DAN/valence/arousal masks on fsaverage5
├── check_preds_space.py                # Detect if preds are 20484 (fsaverage5) or 1000 (Schaefer)
├──
├── honest_corr_timeseries.py ⭐       # PRIMARY VALIDATION. Within-video arc vs human, perm-tested.
│                                       # → results.csv (forest table)
├── honest_corr.py                      # Secondary between-video test (retention %; small n)
├── baseline_extract.py                 # Extract loudness/cuts/luminance/motion from video
├── incremental_validity.py             # Partial correlation: brain vs dumb features
├── affect_extract.py                   # Valence/arousal proxy from OFC/vmPFC + insula masks
├── affect_validate.py                  # Test affect arc against LIRIS-ACCEDE (same harness as attention)
├── liris_prep.py                       # Prepare LIRIS-ACCEDE continuous valence/arousal data
├── coarse_states.py                    # Spread coarse-affect quadrant distribution → arc.json
├── train_head.py                       # Ridge regression over frozen TRIBE features (leave-one-video-out)
├──
├── run_pipeline.py ⭐                 # ORCHESTRATOR. Chain all stages: att → incr → affect → publish → report
├── publish_results.py                  # Honest demo/results.json (stamps null_result if p ≥ α)
├── make_report.py                      # Render forest plots + badges → validation/report.html
├──
├── colab_run.ipynb                     # Free Colab T4 notebook (byte-for-byte mirrors batch_extract.py)
├──
├── === DATA DIRECTORY ===
├── 
├── data/
│   ├── ydata-tvsum50.mat               # TVSum dataset (20 annotators × 50 videos)
│   ├── roi_mask_dmn.npy                # A-priori DMN mask, shape (20484,) bool
│   ├── roi_mask_dan.npy                # A-priori DAN mask
│   ├── roi_mask_valence.npy            # A-priori valence (OFC/vmPFC) mask
│   ├── roi_mask_arousal.npy            # A-priori arousal (insula/ACC) mask
│   ├── clips_trimmed/                  # TVSum clips trimmed to first N sec (for light Colab path)
│   │   ├── tvsum001_trim.mp4
│   │   └── ... (populated by make trim)
│   ├── tvsum_raw/                      # Raw TVSum downloaded files (internal, regenerated)
│   ├── arcs/                           # GPU EXTRACTION OUTPUTS (populated by batch_extract.py / Colab)
│   │   ├── preds_tvsum001.npy          # Raw (T, 20484) predictions, z-scored BOLD
│   │   ├── arc_tvsum001.csv            # Columns: t_sec, global_mag, roi_mag
│   │   └── arc_tvsum001.json           # Demo-ready: timestamps, normalized activation [0..1], weak_spots
│   ├── tvsum/                          # HUMAN DATA (populated by tvsum_prep.py)
│   │   ├── human_arc_tvsum001.csv      # Per-shot → per-second mean importance
│   │   └── human_annos_tvsum001.npy    # (n_annotators=20, n_shots), for LOAO ceiling
│   ├── baseline/                       # BASELINE FEATURES (populated by baseline_extract.py)
│   │   └── baseline_tvsum001.csv       # Per-frame loudness, cuts, luminance, motion
│   ├── liris/                          # LIRIS-ACCEDE data (optional; user-provided or prepared by liris_prep.py)
│   │   └── liris_tvsum001.csv          # Continuous valence/arousal ground truth for affect validation
│   └── clips/                          # Full TVSum clips (optional; for GPU box if processing entire dataset)
│
├── === DEMO / FRONTEND ===
├── 
├── demo/
│   ├── index.html ⭐                   # Main entry point. 3D cortex tour + data console.
│   ├── app.js ⭐                       # Arc player logic. Loads arc.json, renders lanes, syncs playhead.
│   ├── styles.css                      # Main styling (neon, dark mode, responsive)
│   ├── brain3d.js                      # Three.js 3D cortex mesh + scroll-triggered activity flashes
│   ├── scrollbrain.js                  # Background scroll-triggered neon brain (decoration, not data)
│   ├── pitch.html                      # 8-slide YC pitch deck (static)
│   ├── waitlist.html                   # Early-access form (writes to Supabase public.waitlist)
│   ├── supabase-config.js              # Supabase credentials (anon key, project URL)
│   ├── supabase.js                     # Helper: fetch arcs, insert waitlist rows (RLS-controlled)
│   ├── results.example.json            # Example output of publish_results.py (sample data)
│   ├── arcs/                           # PRECOMPUTED SAMPLE ARCS (static assets loaded by app.js)
│   │   ├── sample_arc.json             # Sample hero1
│   │   ├── hero2.json                  # Sample hero2
│   │   └── hero3.json                  # Sample hero3
│   ├── assets/                         # Images, logos, brand assets
│   │   ├── logo.svg
│   │   └── ...
│   ├── vendor/                         # VENDORED JS (no build step, no runtime CDN)
│   │   ├── three/                      # Three.js r185 ES modules
│   │   │   ├── three.module.min.js
│   │   │   └── addons/
│   │   └── lenis/                      # Lenis scroll library
│   ├── .env.local                      # Local Supabase overrides (git-ignored)
│   ├── README.md                       # Demo-specific runbook (Vercel deployment, local serve)
│   └── .vercel/                        # Vercel deployment config (auto-deployment on push)
│
├── === TESTING / HARNESS ===
├── 
├── tests/
│   ├── make_synthetic_data.py          # Generate synthetic fixtures with planted signal + null control
│   │                                   # → preds_synth_sig*.npy, preds_synth_null.npy
│   │                                   # → synth clip.mp4, MANIFEST.json, roi_*.npy
│   ├── dry_run.py ⭐                   # Run ENTIRE PIPELINE on synthetic data. Assert signal + null.
│   │                                   # → 25 checks; fails loudly if any break
│   └── synth/                          # SYNTHETIC DATA DIRECTORY (generated by make_synthetic_data.py)
│       ├── MANIFEST.json               # Video list + metadata
│       ├── preds_synth_sig1.npy        # Synthetic preds with planted signal
│       ├── preds_synth_sig2.npy
│       ├── preds_synth_null.npy        # Synthetic preds with zero signal
│       ├── synth_clip.mp4              # Synthetic video for baseline_extract
│       ├── roi_dmn.npy, roi_valence.npy, roi_arousal.npy
│       ├── ydata-tvsum50.mat           # Synthetic TVSum .mat
│       ├── arcs/                       # Generated by dry_run.py::arc_from_preds
│       │   ├── arc_synth_*.csv
│       │   └── arc_synth_*.json
│       ├── human/                      # Generated by tvsum_prep.py on synthetic .mat
│       │   ├── human_arc_synth_*.csv
│       │   └── human_annos_synth_*.npy
│       ├── baseline/                   # Generated by baseline_extract.py
│       │   └── baseline_synth_*.csv
│       ├── results.csv                 # Output of honest_corr_timeseries.py
│       ├── results_forest.png          # Forest plot
│       └── validation/                 # Full pipeline output scratch dir
│
├── === DATABASE SCHEMA ===
├── 
├── supabase/
│   ├── schema.sql                      # RLS-secured tables: waitlist, arcs, uploads (+ storage bucket)
│   └── README.md                       # Supabase setup, RLS policies, connection string
│
├── === TOOLS ===
├── 
├── tools/
│   └── export_brain.py                 # Utility: export 3D cortex mesh for visualization (niche use)
│
├── === OUTPUTS (generated, not committed) ===
├── 
├── validation/                         # Generated by run_pipeline.py
│   ├── results.csv                     # Attention test (video, feature, n, r, p, etc.)
│   ├── results_forest.png              # Matplotlib forest plot (all videos side-by-side)
│   ├── incremental.csv                 # Incremental validity (raw_r, partial_r, perm_p, adds_signal)
│   ├── affect_results.csv              # Affect validation (valence + arousal rows)
│   └── report.html                     # Comprehensive validation report (forest plot embedded, badges, nulls)
│
├── .git/                               # Git repo (not committed to repo)
├── .venv/                              # Python venv (git-ignored)
├── __pycache__/                        # Compiled Python (git-ignored)
└── .gitignore                          # Excludes .env, .venv, __pycache__, *.pyc, etc.
```

## Directory Purposes

**Root Level:**
- Purpose: Entry points, orchestration, documentation
- Contains: Pipeline scripts (batch_extract.py, honest_corr_timeseries.py, etc.), docs (README.md, VISION.md, PREREGISTRATION.md)
- Key files: `batch_extract.py` (GPU extraction), `honest_corr_timeseries.py` (validation), `run_pipeline.py` (orchestration)

**`data/`:**
- Purpose: Immutable cached artifacts (predictions, human data, ROI masks) and intermediate outputs
- Contains: Arc CSVs/JSONs (GPU extraction outputs), TVSum human curves, ROI masks (.npy), baseline features, LIRIS data
- Key files: `roi_mask_dmn.npy` (a-priori DMN mask), `ydata-tvsum50.mat` (TVSum dataset), `arcs/arc_<id>.csv` (per-video time-series)

**`demo/`:**
- Purpose: Self-contained static web app (no build step, no backend)
- Contains: HTML/JS/CSS, vendored Three.js, Supabase client, precomputed sample arcs
- Key files: `index.html` (main page), `app.js` (arc player), `styles.css` (design), `brain3d.js` (3D cortex)

**`tests/`:**
- Purpose: Synthetic-data regression harness; proves pipeline detects signal + stays quiet on null
- Contains: Fixture generation (make_synthetic_data.py), end-to-end test runner (dry_run.py), output scratch dir
- Key files: `dry_run.py` (orchestrator), `make_synthetic_data.py` (fixture generator), `synth/` (generated fixtures)

**`supabase/`:**
- Purpose: Database schema and setup
- Contains: schema.sql (tables + RLS policies), README (connection instructions)
- Key files: `schema.sql` (waitlist, arcs, uploads tables)

**`validation/`:**
- Purpose: Analysis outputs (ephemeral; regenerated on each run_pipeline.py)
- Contains: results.csv (correlation table), forest plot PNG, report.html
- Key files: `results.csv` (primary output), `report.html` (shareable validation report)

## Key File Locations

**Entry Points:**
- `batch_extract.py`: GPU inference runbook (Colab/rented A100)
- `run_pipeline.py`: CPU analysis orchestration (local machine)
- `demo/index.html`: Web frontend (browser / Vercel)
- `tests/dry_run.py`: Synthetic-data validation (CI equivalent)

**Configuration:**
- `requirements.txt`: Dependency groups (GPU / CPU)
- `.env.local` (demo/): Supabase credentials (git-ignored)
- `Makefile`: Local task shortcuts (make test, make pipeline, etc.)

**Core Logic:**
- `batch_extract.py::arc_from_preds()`: Reduce (T, 20484) → per-second scalars
- `honest_corr_timeseries.py`: Within-video validation harness (first-diff, circular-shift null)
- `demo/app.js`: Arc player (time-sync three lanes, render glyphs, load Supabase data)

**Testing:**
- `tests/dry_run.py`: Full pipeline on synthetic data (25 assertions)
- `tests/make_synthetic_data.py`: Fixture generator (planted signal + null control)

## Naming Conventions

**Files:**

| Pattern | Example | Meaning |
|---------|---------|---------|
| `arc_<id>.csv` | `arc_tvsum001.csv` | Per-second model predictions (columns: t_sec, global_mag, roi_mag) |
| `arc_<id>.json` | `arc_tvsum001.json` | Demo-ready arc with timestamps, normalized activation, weak_spots |
| `preds_<id>.npy` | `preds_tvsum001.npy` | Raw (T, 20484) TRIBE predictions, z-scored BOLD, from batch_extract.py |
| `human_arc_<id>.csv` | `human_arc_tvsum001.csv` | Human attention curve (per-shot → per-second mean importance) |
| `human_annos_<id>.npy` | `human_annos_tvsum001.npy` | (n_annotators, n_shots) matrix for LOAO ceiling calculation |
| `baseline_<id>.csv` | `baseline_tvsum001.csv` | Per-frame dumb features (loudness, cuts, luminance, motion) |
| `liris_<id>.csv` | `liris_tvsum001.csv` | Continuous LIRIS valence/arousal ground truth |
| `roi_mask_<region>.npy` | `roi_mask_dmn.npy` | Boolean (20484,) mask for an anatomical region |
| `results.csv` | `validation/results.csv` | Attention validation output (one row per video+feature) |
| `<stage>_results.csv` | `affect_results.csv`, `incremental.csv` | Secondary/tertiary test outputs |
| `results.json` | `demo/results.json` | Published demo data (from publish_results.py) |

**Directories:**

| Pattern | Example | Meaning |
|---------|---------|---------|
| `data/arcs/` | `data/arcs/` | GPU extraction outputs (arc CSVs + JSONs); cache these |
| `data/tvsum/` | `data/tvsum/` | Human attention curves from TVSum prep |
| `data/baseline/` | `data/baseline/` | Dumb baseline features (optional; enables incremental test) |
| `data/liris/` | `data/liris/` | LIRIS-ACCEDE data (optional; enables affect validation) |
| `data/clips_trimmed/` | `data/clips_trimmed/` | TVSum clips trimmed to first N sec (laptop-friendly) |
| `validation/` | `validation/` | Analysis outputs (results.csv, report.html, etc.) |
| `demo/arcs/` | `demo/arcs/` | Precomputed sample arcs (static demo assets) |
| `tests/synth/` | `tests/synth/` | Synthetic data fixtures (generated by make_synthetic_data.py) |

**Functions/Classes:**

| Pattern | Example | Meaning |
|---------|---------|---------|
| `arc_from_preds()` | `batch_extract.py` | Reduce (T, 20484) → (global_mag, roi_mag) per second |
| `describe_preds()` | `batch_extract.py` | Print preds distribution (confirm z-scored scale) |
| `detect_weak_spots()` | `batch_extract.py` | Find sustained low-activation stretches in arc |
| `write_demo_json()` | `batch_extract.py` | Normalize arc [0..1] + package for browser |
| `pearson()`, `spearman()` | `honest_corr_timeseries.py` | Correlation functions (numpy-only, no scipy) |
| `perm_null_circular_shift()` | `honest_corr_timeseries.py` | Permutation null (rotate one series N times) |
| `_rankdata()` | `honest_corr_timeseries.py` | Average-rank Spearman implementation |

## Where to Add New Code

**New Feature (e.g., a new attention metric):**
- Primary code: `<metric_name>.py` at root level (mirrors existing pattern: honest_corr_timeseries.py, incremental_validity.py)
- Tests: `tests/dry_run.py` — add a new assertion checking the metric detects signal on synth_sig* and stays quiet on synth_null
- Integration: Add to run_pipeline.py as an optional stage (skip if input missing, required=False)
- Output: Write a `<metric_name>.csv` following the existing schema (video, feature, n, r, p, p_param, ceiling, frac, note)
- Demo: Update publish_results.py to fold the new metric into demo/results.json if needed

**New Component/Module (e.g., a helper library for common stats):**
- Implementation: Create `lib_<name>.py` at root level (or under a future `lib/` if codebase grows)
- Pattern: Pure functions, no global state. Use numpy + stdlib only (scipy is okay).
- Testing: Import and test in tests/dry_run.py or add a new test script

**Utilities/Helpers (e.g., plotting functions, data loaders):**
- Shared helpers: Create `utils.py` or `viz.py` at root level
- Non-shared (single-use): Keep inline in the calling script (e.g., fireColor() in demo/app.js)

**Web Frontend:**
- New page: Add `demo/<name>.html` (static, no build step)
- New visualization: Add logic to `demo/app.js` or create `demo/<name>.js` (imported in HTML)
- Styling: Add CSS to `demo/styles.css` (no separate sheet per component)
- Assets: Place SVGs/images in `demo/assets/`

**Data Pipeline:**
- New input type (e.g., LIRIS valence/arousal): Add a prep script `<source>_prep.py` at root (mirrors tvsum_prep.py)
- New output format: Add to the appropriate stage script or create a new stage
- Storage: Use `data/<domain>/` directory (e.g., data/liris/, data/baseline/)

**Testing/Fixtures:**
- New synthetic fixture: Extend `tests/make_synthetic_data.py` (add a new video entry to MANIFEST, add preds generation)
- New validation assertion: Add check() call in `tests/dry_run.py`

**Documentation:**
- Architecture changes: Update ARCHITECTURE.md (this file)
- User-facing changes: Update README.md or add a new .md file (VISION.md, ROADMAP.md are already split)
- Pre-registration changes: Add a new PREREGISTRATION-<topic>.md (mirrors PREREGISTRATION-affect.md)

## Special Directories

**`.git/`:**
- Purpose: Version control
- Generated: Yes
- Committed: Yes
- Note: Repo is initialized; large files (*.npy, *.mat, .mp4) are git-ignored

**`.venv/`:**
- Purpose: Python virtual environment
- Generated: Yes (via `python -m venv .venv`)
- Committed: No (git-ignored)
- Note: Install dependencies with `pip install -r requirements.txt`

**`__pycache__/`:**
- Purpose: Compiled Python bytecode
- Generated: Yes (automatic)
- Committed: No (git-ignored)

**`validation/`:**
- Purpose: Analysis outputs (ephemeral)
- Generated: Yes (by run_pipeline.py, make_report.py)
- Committed: No (git-ignored; regenerated on each run)

**`demo/arcs/` and `data/arcs/`:**
- Purpose: Cached arc CSVs/JSONs
- Generated: Yes (by batch_extract.py)
- Committed: No (git-ignored; regenerated on each GPU run)
- Note: Deterministic (same preds_<id>.npy always → same arc_<id>.csv)

**`demo/.vercel/` and `demo/.gstack/`:**
- Purpose: Deployment config (Vercel, Gstack)
- Generated: Partially (credentials are git-ignored, config is committed)
- Committed: Config only; secrets go in .env.local (git-ignored)

---

*Structure analysis: 2026-07-18*
