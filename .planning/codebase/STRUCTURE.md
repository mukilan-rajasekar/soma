
# Codebase Structure

**Analysis Date:** 2026-07-28

## Directory Layout

```
soma/
├── src/                             # Next.js app source (TypeScript)
│   ├── app/                         # App directory (routes & layouts)
│   │   ├── (site)/                  # Route group (no URL path change)
│   │   │   ├── layout.tsx           # Shared header/footer for /upload /edit /generate /compare /pitch
│   │   │   ├── upload/page.tsx      # Batch upload flow
│   │   │   ├── edit/page.tsx        # Edit form (beta)
│   │   │   ├── generate/page.tsx    # Generation form (beta)
│   │   │   ├── science/page.tsx     # Science explainer
│   │   │   ├── pitch/page.tsx       # Pitch/pricing
│   │   │   └── compare/page.tsx     # A/B compare page
│   │   ├── api/                     # API route handlers (all POST/GET)
│   │   │   ├── uploads/
│   │   │   │   ├── sign/route.ts    # GET signed URL for file upload
│   │   │   │   └── complete/route.ts # (Legacy, unused by batch flow)
│   │   │   ├── batches/
│   │   │   │   ├── create/route.ts  # Queue batch for scoring
│   │   │   │   └── [token]/
│   │   │   │       ├── status/route.ts # Poll batch status
│   │   │   │       └── edit-preview/route.ts # Beta feature
│   │   │   ├── edit/
│   │   │   │   ├── create/route.ts  # Queue edit search
│   │   │   │   ├── run/route.ts     # (Unused)
│   │   │   │   └── [token]/
│   │   │   │       └── status/route.ts
│   │   │   ├── generate/
│   │   │   │   ├── create/route.ts  # Queue generation job
│   │   │   │   ├── run/route.ts     # (Unused)
│   │   │   │   └── [token]/
│   │   │   │       └── status/route.ts
│   │   │   ├── arcs/route.ts        # Get live arc data (demo)
│   │   │   └── waitlist/route.ts    # Email capture (landing page)
│   │   ├── r/[token]/page.tsx       # Batch result page (capability URL)
│   │   ├── e/[token]/page.tsx       # Edit result page
│   │   ├── g/[token]/page.tsx       # Generation result page
│   │   ├── demo/page.tsx            # Public demo (uses committed artifact)
│   │   ├── preflight/page.tsx       # Same as /demo
│   │   ├── brain-lab/page.tsx       # Interactive brain visualization
│   │   ├── story/page.tsx           # Story/narrative page
│   │   ├── console/page.tsx         # Internal console (not public)
│   │   ├── layout.tsx               # Root layout (font, metadata)
│   │   ├── page.tsx                 # Landing page (/)
│   │   └── globals.css              # Root styles (Tailwind)
│   │
│   ├── lib/                         # Business logic (pure TypeScript)
│   │   ├── types/
│   │   │   └── arc.ts               # Arc type (neuroscience data shape)
│   │   ├── supabase/
│   │   │   └── server.ts            # Server-only Supabase client factory
│   │   ├── batch.ts                 # Batch validation, manifest building (shared client/server)
│   │   ├── upload.ts                # Upload validation & helpers (shared client/server)
│   │   ├── arc.ts                   # Arc math (interpolation, stats, formatting)
│   │   ├── arc-draw.ts              # Canvas drawing logic for arcs
│   │   ├── edit-runner.ts           # Edit search subprocess wrapper
│   │   ├── generate-runner.ts       # Generation subprocess wrapper
│   │   ├── beta-gate.ts             # Concurrent run limiting
│   │   ├── upload-client.ts         # Browser-side upload helpers
│   │   ├── edit-source.ts           # Ad data assembler for edit
│   │   ├── notify.ts                # Email helpers
│   │   └── demo-report.ts           # (Minimal, likely unused)
│   │
│   └── components/                  # React components (TSX)
│       ├── Landing.tsx              # Home page component
│       ├── BrainField.tsx           # Brain visualization (Three.js)
│       ├── UploadDialog.tsx         # File upload dialog
│       ├── site/
│       │   ├── SiteHeader.tsx       # Navigation header
│       │   ├── SiteFooter.tsx       # Footer
│       │   └── PitchDeck.tsx        # Pricing/pitch component
│       ├── upload/
│       │   └── BatchUpload.tsx      # Batch upload form & flow
│       ├── edit/
│       │   └── EditBeta.tsx         # Edit search form
│       ├── generate/
│       │   └── GenerateBeta.tsx     # Generation form
│       ├── preflight/
│       │   ├── PreflightView.tsx    # Main result view
│       │   ├── types.ts             # PreflightReport shape
│       │   ├── PlayerPanel.tsx      # Video player
│       │   ├── AdList.tsx           # Ad selection list
│       │   ├── ReadoutPanel.tsx     # ROI/readout view
│       │   ├── OverlayPanel.tsx     # Weak spots & diagnostics
│       │   └── HookCompare.tsx      # Hook comparison chart
│       ├── result/
│       │   ├── ResultReport.tsx     # Batch results display
│       │   ├── BatchStatus.tsx      # Status poller
│       │   ├── BatchEditPreview.tsx # Edit preview component
│       │   └── RunStatus.tsx        # Edit/generation status
│       ├── demo/
│       │   ├── DemoConsole.tsx      # Demo control panel
│       │   ├── DemoScrollPage.tsx   # (Legacy)
│       │   ├── BrainSvg.tsx         # Brain diagram
│       │   ├── ReadoutPanel.tsx     # (Duplicate of preflight?)
│       │   ├── Transport.tsx        # Timeline scrubber
│       │   ├── Picker.tsx           # Ad selector
│       │   └── CorticalProfile.tsx  # ROI bar chart
│       ├── demo2/
│       │   ├── DemoScrollPage.tsx   # Main demo page layout
│       │   ├── LivePlayer.tsx       # Live video playback
│       │   ├── ArcPlot.tsx          # Arc chart (Recharts or canvas)
│       │   ├── MessageTrack.tsx     # Message lane visualization
│       │   ├── CorpusWall.tsx       # Corpus browser
│       │   ├── EditStudio.tsx       # Edit showcase
│       │   ├── GenerateStudio.tsx   # Generation showcase
│       │   ├── ShotDiagnosis.tsx    # Diagnostic panel
│       │   ├── VendorChecklist.tsx  # Vendor integration checklist
│       │   ├── ServiceTiers.tsx     # Pricing tiers
│       │   ├── MetricRow.tsx        # KPI display
│       │   ├── Stat.tsx             # Single stat display
│       │   ├── RegionCard.tsx       # Brain region card
│       │   ├── TwoRegionBrain.tsx   # 2D brain with regions
│       │   └── TwoRegionBrain3D.tsx # 3D brain (Three.js)
│       ├── brainlab/
│       │   ├── BrainSignalSweep.tsx # Interactive signal display
│       │   ├── BrainPointFiring.tsx # Point-cloud visualization
│       │   └── BrainPulseDrift.tsx  # Pulsing animation
│       └── demo/
│           └── LineupCompare.tsx    # (Legacy compare)
│
├── tools/                           # Python backend tooling
│   ├── concierge/
│   │   ├── run_batch.py            # Orchestrator: downloads files, invokes processing
│   │   └── process_batch.py        # (In docs/pipeline?) Main scoring pipeline
│   ├── edit/
│   │   ├── __init__.py
│   │   ├── search.py               # Edit search algorithm
│   │   ├── ops.py                  # Edit operations (cut, trim, etc)
│   │   └── render.py               # Render edits to video
│   ├── generate/
│   │   ├── __init__.py
│   │   ├── pipeline.py             # Generation orchestrator (AI video)
│   │   ├── provider.py             # Provider abstraction (Flux, Runway, etc)
│   │   └── directions.py           # Prompt engineering
│   ├── corpus/
│   │   ├── meta_ads.py             # Meta ad corpus ingestion
│   │   └── audit.py                # Corpus audit & validation
│   ├── demo/
│   │   ├── build_report.py         # Build scoring report for demo
│   │   ├── check_coherence.py      # Validation checks
│   │   └── media_text.py           # Extract text from media
│   └── export_brain.py             # Export brain models
│
├── public/                          # Static assets (committed)
│   ├── demo/                       # Demo video & corpus files
│   │   ├── corpus/
│   │   ├── split/
│   │   ├── shots/
│   │   ├── posters/
│   │   └── *_report.json           # Committed batch reports
│   ├── preflight/
│   │   └── batch_report.json       # Main demo artifact
│   ├── brain/                      # Brain model files, meshes
│   ├── logos/
│   ├── campaign/
│   ├── arcs/                       # (Legacy arc data?)
│   └── ad-videos/
│
├── docs/                            # Documentation
│   ├── science/                    # Neuroscience docs
│   ├── GTM/                        # Go-to-market
│   ├── strategy/                   # Strategy & vision
│   ├── reports/                    # Reports & analysis
│   ├── pipeline/                   # Pipeline docs & process_batch.py
│   └── demo/                       # Demo-related docs
│
├── supabase/
│   └── migrations/                 # Database migrations (SQL)
│       ├── 0001_init.sql
│       ├── 0002_*.sql
│       ├── 0003_*.sql              # Share token schema, storage
│       └── ...
│
├── scripts/                         # Bash/utility scripts
│   ├── loop.sh                     # Local dev loop (re-runs on file change)
│   └── verify.sh                   # Pre-commit verification
│
├── validation/                      # Validation data (gitignored, local only)
│   ├── recheck/                    # Revalidation runs
│   └── message_lane_demo/          # Message lane demo data
│
├── .claude/                         # Claude Code setup
│   └── loop/
│       └── rollbacks/
│
├── .planning/                       # GSD planning (generated)
│   └── codebase/                   # Codebase maps (this directory)
│
├── .impeccable/                     # Component cache
│   └── hook.cache.json             # (Gitignored)
│
├── Root-level Python files          # Analysis/processing scripts
│   ├── head_io.py                  # Head model I/O
│   ├── head_apply.py               # Apply head model
│   ├── head_null_test.py           # Testing
│   ├── batch_extract.py            # Extract batch features
│   ├── affect_extract.py           # Affect (emotion) extraction
│   ├── affect_head.py              # Affect head model
│   ├── message_extract.py          # Message/semantic extraction
│   ├── readout_extract.py          # Readout (comprehension, recall) extraction
│   ├── incremental_validity.py     # Validation testing
│   ├── honest_corr_timeseries.py   # Correlation analysis
│   ├── coarse_states.py            # Coarse emotional states
│   ├── ad_fetch_bb.py              # Fetch ads from provider
│   ├── ad_performance.py           # Ad performance metrics
│   ├── ad_backtest.py              # Backtest ad scoring
│   ├── ad_advertisers.py           # Advertiser data
│   ├── build_roi_mask.py           # ROI mask construction
│   ├── publish_to_supabase.py      # Publish results
│   └── requirements.txt            # Python dependencies
│
├── Config files
│   ├── package.json                # Node deps (Next.js, React, Tailwind, etc)
│   ├── package-lock.json
│   ├── tsconfig.json               # TypeScript config (@/* alias, strict)
│   ├── eslint.config.mjs           # ESLint rules
│   ├── postcss.config.mjs          # PostCSS (Tailwind)
│   ├── next.config.ts              # Next.js config (minimal)
│   ├── .nvmrc                      # Node version (22.13.0+)
│   ├── .env.example                # Example env vars
│   └── .gitignore
│
└── Root files
    ├── README.md
    ├── CLAUDE.md
    └── AGENTS.md
```

## Directory Purposes

**`src/app`:**
- Purpose: Next.js app directory — routes, layouts, and API handlers
- Contains: Page components, layout wrappers, API route handlers
- Key files: layout.tsx (root), page.tsx (landing), r/[token]/page.tsx (results)

**`src/lib`:**
- Purpose: Shared business logic (pure TypeScript, no framework dependencies)
- Contains: Validation functions, type definitions, utility helpers, arc math
- Key files: batch.ts (batch schema), arc.ts (arc math), upload.ts (upload validation)
- Invariant: No React hooks, no server-only code, can run in browser or server

**`src/components`:**
- Purpose: React components (TSX, client and server)
- Contains: Organized by feature (upload, edit, generate, result, demo, etc)
- Key folders: preflight (result view), upload (batch form), demo2 (demo page)

**`tools`:**
- Purpose: Python backend (executables invoked from API routes)
- Contains: Modules with `__main__` or __init__ exposing CLI entry points
- Run via: `python -m tools.<module>.<submodule> --arg value`
- Example: `python -m tools.edit.search --ad json --out-dir /tmp`

**`public`:**
- Purpose: Static assets and committed demo artifacts
- Contains: Video files, images, Brain model meshes, committed batch_report.json
- Access: Direct URLs from HTML/CSS (no signing needed)

**`docs`:**
- Purpose: Documentation (not code)
- Contains: Science explainers, strategy, pipeline docs, reports

**`supabase/migrations`:**
- Purpose: Database schema evolution (SQL)
- Files are versioned; applied in order on deploy
- Key: migration 0003 defines batches, uploads, share_token, storage

**`scripts`:**
- Purpose: Development and CI scripts
- loop.sh: Local rapid iteration
- verify.sh: Pre-commit checks (lint, typecheck, test)

**`.claude/loop`:**
- Purpose: Claude Code loop artifacts
- rollbacks/: Backup of previous state if iteration fails

**`validation/` (gitignored):**
- Purpose: Local test data and revalidation runs
- Never committed; team members create as needed

## Key File Locations

**Entry Points:**
- `src/app/page.tsx` — Landing page (/)
- `src/app/layout.tsx` — Root layout (font, metadata, HTML structure)
- `src/app/(site)/upload/page.tsx` — Batch upload (/upload)
- `src/app/(site)/edit/page.tsx` — Edit form (/edit)
- `src/app/(site)/generate/page.tsx` — Generation (/generate)
- `src/app/r/[token]/page.tsx` — Batch result (/r/<token>)

**Configuration:**
- `tsconfig.json` — TypeScript settings (@/* alias)
- `eslint.config.mjs` — ESLint rules
- `postcss.config.mjs` — Tailwind CSS pipeline
- `next.config.ts` — Next.js config (minimal)
- `package.json` — Node dependencies and scripts
- `.env.example` — Environment variable reference

**Core Logic:**
- `src/lib/batch.ts` — Batch schema, validation, manifest generation
- `src/lib/arc.ts` — Arc mathematics (interpolation, statistics)
- `src/lib/edit-runner.ts` — Edit search execution wrapper
- `src/lib/beta-gate.ts` — Concurrent run limiting
- `src/app/api/batches/create/route.ts` — Batch queueing endpoint

**Testing:**
- `head_null_test.py` — Python test for head model (must be importable)

**Database:**
- `supabase/migrations/*.sql` — Schema definitions

## Naming Conventions

**Files:**
- API routes: `route.ts` (never named after handler)
- Pages: `page.tsx`
- Layouts: `layout.tsx`
- Components: PascalCase.tsx (e.g., BatchUpload.tsx)
- Utilities: camelCase.ts (e.g., arc-draw.ts, edit-runner.ts)
- Types: (no prefix) — e.g., arc.ts, types.ts
- Python: snake_case.py (e.g., process_batch.py, run_batch.py)

**Directories:**
- Feature-based: `/components/upload/*`, `/components/edit/*`
- API: `/api/<feature>/<operation>/route.ts` or `/api/<feature>/[id]/...`
- Types: `/types/` at module level (e.g., `src/lib/types/arc.ts`)
- Python modules: `/tools/<name>/<subname>/`

## Where to Add New Code

**New Feature (e.g., a beta feature for scoring):**
- Primary implementation:
  - `src/app/(site)/<feature>/page.tsx` — Page/form
  - `src/app/api/<feature>/create/route.ts` — Queue endpoint
  - `src/lib/<feature>-runner.ts` — Python subprocess wrapper
- Components: `src/components/<feature>/*.tsx` — Form, status, result
- Tests: `<feature>_test.py` (Python only; JS tests not yet organized)
- Database: `supabase/migrations/NNNN_add_<feature>_tables.sql`

**New Component/UI:**
- File: `src/components/<section>/<ComponentName>.tsx`
- Example: New ROI visualization goes in `src/components/demo2/RoiVisualization.tsx`
- Use existing demo2 components as pattern (client/server, state management)

**New Utility/Helper:**
- Shared between client/server: `src/lib/<feature>.ts` (no server-only code)
- Server-only (subprocess, Supabase): `src/lib/<feature>-runner.ts`
- Math/pure logic: `src/lib/arc.ts` pattern (reusable in tests, Node, browser)
- Component helpers: Inline in component file or `src/components/<section>/helpers.ts`

**New Python Analysis Script:**
- Simple one-off: `<name>.py` in root (e.g., `build_roi_mask.py`)
- Runnable from CLI: `tools/<category>/<name>.py` with `if __name__ == '__main__'` block
- Invoked from Node: Wrap in `src/lib/<name>-runner.ts` using `execFileAsync()`

**New Database Table:**
- Migration: `supabase/migrations/NNNN_<description>.sql` (NNNN = next sequence)
- RLS: Add policies (insert/select/update/delete with service_role bypass for API)
- Type: If table is queried from API, add type definition in `src/lib/types/` or inline at route

## Special Directories

**`public/demo/` (and subdirs):**
- Purpose: Committed demo artifacts (batch_report.json, video files)
- Generated: No — manually curated test cases
- Committed: Yes — part of repo so demo works without external dependencies

**`.next/`:**
- Purpose: Build output (cache, types, compiled JS)
- Generated: Yes (by `npm run build`)
- Committed: No (.gitignore)

**`node_modules/`:**
- Purpose: Installed npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (.gitignore)

**`.venv/` (Python virtualenv):**
- Purpose: Isolated Python environment (if created locally)
- Generated: Yes (by `python3 -m venv .venv`)
- Committed: No (.gitignore)
- Note: verify.sh falls back to system python3 if .venv is absent

**`.impeccable/`:**
- Purpose: Component cache for @impeccable component management
- Generated: Yes (unknown tool)
- Committed: No (.gitignore except for the directory itself)

**`.claude/loop/rollbacks/`:**
- Purpose: Claude Code rollback snapshots
- Generated: Yes (by Claude Code if iteration fails)
- Committed: No (.gitignore)

---

*Structure analysis: 2026-07-28*
