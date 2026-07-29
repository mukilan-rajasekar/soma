# Technology Stack

**Analysis Date:** 2026-07-28

## Languages

**Primary:**
- TypeScript (ES2017 target) - Frontend and backend API routes (`src/**/*.ts`, `src/**/*.tsx`)
- Python 3 - Data pipeline and analysis (`*.py` scripts at repo root)

**Secondary:**
- JavaScript/JSX - Next.js runtime and build tooling
- SQL - Supabase database operations (`supabase/migrations/*.sql`)

## Runtime

**Environment:**
- Node.js ≥22.13.0 (specified in `package.json` engines field and `.nvmrc`)
- Python 3.x with virtual environment (`.venv/`)

**Package Managers:**
- npm (primary JS dependency manager)
- pip (Python dependency manager via `requirements.txt`)
- Lockfile: `package-lock.json` present

## Frameworks

**Core Frontend:**
- Next.js 16.2.11 - Full-stack React framework with API routes and file-based routing (`src/app/`)
- React 19.2.4 - UI library for components
- React DOM 19.2.4 - React rendering target for browser
- Three.js 0.185.1 - 3D graphics for brain visualization components (`src/components/brainlab/`, `src/components/demo2/`)

**Testing:**
- pytest - Python test runner (configured in `scripts/verify.sh`)
- Playwright 1.61.1 - End-to-end testing and browser automation (`scripts/smoke.mjs`, ad fetching fallback)

**Build & Dev:**
- TypeScript 5.x - Type checking and compilation (`tsconfig.json` with incremental mode)
- ESLint 9.x - JavaScript/TypeScript linting (`eslint.config.mjs` extends Next.js core and TypeScript configs)
- Tailwind CSS 4.x - Utility-first CSS framework (`@tailwindcss/postcss`)
- PostCSS 4.x - CSS transformation pipeline
- Next.js TypeScript plugin (`tsconfig.json` plugins section)

## Key Dependencies

**Critical Frontend:**
- `@supabase/supabase-js` 2.110.8 - Database and storage client (`src/lib/supabase/server.ts`, multiple API routes)
- `@types/three` 0.185.1 - TypeScript definitions for Three.js
- `@types/react` 19.x, `@types/react-dom` 19.x - React TypeScript types
- `@types/node` 20.x - Node.js TypeScript types

**Critical Python (CPU/Analysis Group):**
- `numpy` >=1.26, <3 - Numerical computing core dependency
- `scipy` - Statistical functions and matrix operations
- `pandas` - Data frame manipulation for arc/annotation tables
- `matplotlib` - Forest plot visualization
- `nilearn` - fMRI atlas handling (Destrieux fsaverage5 for ROI masks)
- `opencv-python-headless` - Video frame analysis (luminance, cuts, motion in baseline extraction)
- `imageio-ffmpeg` - Audio loudness analysis and synthetic MP4 muxing
- `h5py` >=3.0 - HDF5 file reading (TVSum v7.3)
- `nibabel` - Neuroimaging file formats (Schaefer-400 annotations, Yeo-7 network masks)
- `pytest` - Test framework
- `faster-whisper` - ASR (Automatic Speech Recognition) for Communication Clarity component
- `python-dotenv` - Environment variable loading
- `stagehand` - Browserbase browser agent client (ad fetching)

**Optional Python (Ad Ingestion Group):**
- `playwright` - Browser automation sync fallback for ad fetching
- External binaries (not pip): `ffmpeg`, `ffprobe`, `tesseract` (OCR), `yt-dlp` (video downloads)

## Configuration

**Environment:**
- Primary: `.env.local` (Next.js — local development overrides `.env`)
- Fallback: `.env` (read by both Next.js and Python pipeline)
- All values defined in `.env.example` (copy template, fill in secrets)
- Note: File contents never committed; all are `.gitignore`d

**Key Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (e.g., `https://<project-ref>.supabase.co`)
- `SUPABASE_SECRET_KEY` - Service role secret key (server-only, never in browser)
- `BROWSERBASE_API_KEY` - Browserbase API credentials (ad fetching only)
- `SOMA_STAGEHAND_MODEL` - Optional: Stagehand model ID (defaults to `google/gemini-2.5-flash`)
- `META_ACCESS_TOKEN` - Meta Ad Library Graph API token (optional, political/social-issue ads only outside EU)
- `SMOKE_URL` - Test server URL (auto-set by `scripts/verify.sh` to localhost:3099)

**Build:**
- `next.config.ts` - Minimal Next.js config (currently empty defaults)
- `tsconfig.json` - TypeScript compiler options with Next.js plugin, path aliases (`@/*` → `./src/*`)
- `vercel.json` - Vercel deployment framework hint (`{ "framework": "nextjs" }`)

## Platform Requirements

**Development:**
- Node.js 22.13.0 or later
- Python 3.x (for pipeline and tests)
- `.venv/` virtual environment with `requirements.txt` installed
- `ffmpeg`, `ffprobe`, `tesseract`, `yt-dlp` binaries on PATH (for full ad pipeline)
- Supabase project credentials in `.env` or `.env.local` (optional for dev; site degrades gracefully without)

**Production:**
- Deployment target: Vercel (specified in `vercel.json`)
- Canonical production origin: `https://www.usesoma.work` (with `www`)
- Next.js serverless functions capped at ~4.5 MB request body (affects direct file uploads; architecture uses signed Supabase Storage URLs to bypass this)
- Environment secrets configured in Vercel project settings (next-env vars override `.env` local values)

**Testing Gate:**
- `scripts/verify.sh` executes the full gate: Next.js build, ESLint, pytest, smoke tests
- Locks: `next build` acquires an exclusive `.next/lock` and fails (doesn't queue) if concurrent builds are attempted
- Pytest conditional: skipped if no `test_*.py` files exist; enforced automatically once first test added

---

*Stack analysis: 2026-07-28*
