# External Integrations

**Analysis Date:** 2026-07-28

## APIs & External Services

**Supabase:**
- Database, file storage, RLS (row-level security), and administrative functions
  - SDK/Client: `@supabase/supabase-js` 2.110.8
  - Auth: `NEXT_PUBLIC_SUPABASE_URL` (public project URL), `SUPABASE_SECRET_KEY` (service_role secret, server-only)
  - Primary integration point: `src/lib/supabase/server.ts` exports `getSupabaseAdmin()` and `serviceClient()`
  - Used by: All API routes in `src/app/api/` for database queries and storage operations

**Browserbase + Stagehand:**
- Browser automation cloud service for scraping competitor ads
  - SDK/Client: `stagehand` (Python pip package)
  - Auth: `BROWSERBASE_API_KEY` (required for `ad_fetch_bb.py`, exits immediately without it)
  - Optional: `SOMA_STAGEHAND_MODEL` (defaults to `google/gemini-2.5-flash` if unset)
  - Usage: `ad_fetch_bb.py` drives a real Chrome browser in Browserbase cloud to collect ads from protected sources

**Meta Ad Library Graph API:**
- Official Meta ad collection API (free tier, political/social-issue ads only outside EU)
  - Auth: `META_ACCESS_TOKEN` (optional; skipped gracefully if unset)
  - Usage: `ad_fetch_bb.py` subcommand `metaapi` queries this API
  - Implementation: `urllib.request` (stdlib, no SDK)

**Google Ads Transparency Center:**
- Google's public ad transparency platform
  - Auth: None (public access)
  - Implementation: Browserbase + Stagehand scraping in `ad_fetch_bb.py` subcommand `google`
  - Advantages: Public, covers all advertisers, exposes "first shown"/"last shown" dates per creative

**TikTok Creative Center / Ad Library:**
- TikTok's "Top Ads" platform for ad collection
  - Auth: None (public, but bot-protected)
  - Implementation: 
    - Primary: `ad_fetch.py` (direct JSON API via `urllib`)
    - Fallback: `ad_fetch_bb.py` subcommand `tiktok` (Browserbase when API fails)
  - Note: `ad_fetch_bb.py --sweep` replays signed TikTok `/list` requests across a 28×3×2 filter grid to yield ~1000 unique ads per session

## Data Storage

**Databases:**
- Supabase PostgreSQL (primary)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`
  - Client: `@supabase/supabase-js` (ORM-light; uses SQL-like query builder)
  - Schema: `supabase/migrations/` (7 idempotent migrations, version 0001–0007)
  - Key tables: `waitlist`, `arcs`, `batches`, `generation_runs`, `edit_runs`, `edit_run_sources`, `result_posters`
  - RLS: Enabled on public tables; site writes only via security-definer functions (e.g., `join_waitlist()`)

**File Storage:**
- Supabase Storage (private `uploads` bucket)
  - Flow: Browser mints signed upload URLs via `POST /api/uploads/sign` → PUT raw MP4 bytes directly to Storage (bypassing 4.5 MB Vercel serverless limit)
  - Validation: File type (MP4 only), size (max 150 MB), email address
  - Signed URL generation: `src/app/api/uploads/sign/route.ts` (service_role client)

**Local Filesystem (Development/Analysis):**
- `public/arcs/*.json` - Bundled sample arcs shown when Supabase is unconfigured
- `public/preflight/` - Preflight demo assets (media_text.py OCR output on macOS, or fallback)
- `data/ads/` - Local ad corpus (hand-collected or `ad_fetch_bb.py` output)
- `data/arcs/` - Precomputed neural arc files from batch processing
- `.cache/` - Media cache for processing (ad videos, etc.)

**Caching:**
- None configured in application (no Redis, no memcached)
- Local file-based caching in Python pipeline (e.g., HuggingFace model cache via `huggingface_hub`, nilearn atlas cache)

## Authentication & Identity

**Auth Provider:**
- Custom (no third-party auth service like Auth0, Clerk, or Firebase Auth)
- Supabase **Row-Level Security (RLS) only** — site does not implement user login/sessions

**Authorization Model:**
- **Public read** (via anon key, policy enforced): Waitlist form can submit email, arcs can be fetched
- **Privileged write** (via service_role secret key, server-only): Admin operations (batch creation, arc publishing, result uploads)
- **Signed URLs** (time-limited, scoped): Unsigned browser can upload video files to Storage without holding the secret key

**Supabase Security Functions:**
- `join_waitlist()` - Deduplicates silently (on conflict, returns void); prevents email enumeration
- All RLS policies in `supabase/migrations/0001_init.sql`

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, DataDog, Rollbar, or similar)

**Logs:**
- Vercel production logs (implicit; app runs on Vercel)
- Development: console output from `npm run dev` and pytest runner
- Bash gate: `scripts/verify.sh` writes build output to `/tmp/soma-verify-build.log`

**Metrics:**
- Not detected (no built-in analytics, PostHog, Segment, or Mixpanel integration)

## CI/CD & Deployment

**Hosting:**
- Vercel (specified in `vercel.json` and `package.json` engines field)
- Production URL: `https://www.usesoma.work` (with `www` prefix — canonical origin)
- Deployment: `next build` → serverless functions + static assets

**Build Pipeline:**
- `npm run build` - Next.js production build (creates `.next/` artifact)
- `npm run start` - Local production server (used by `scripts/verify.sh` on port 3099 for smoke tests)

**Verification Gate (scripts/verify.sh):**
1. Next.js build (`npm run build`, with lock retry)
2. ESLint linting (`npx eslint src`)
3. pytest (`python -m pytest -q`, conditional on `test_*.py` existence)
4. Demo artifact coherence check (hand-transcribed TS literals from report.json)
5. Smoke tests (`scripts/smoke.mjs` via Playwright, optional if `SKIP_SMOKE=1`)

**Deployment Exclusions:**
- `.gitignore` excludes: `.env*`, `.venv/`, `node_modules/`, `.next/`, `tests/`, `data/`, `cloud/`, `.impeccable/hook.cache.json`

## Environment Configuration

**Required env vars (for unconfigured degrades):**
- None — site is designed to degrade gracefully with empty `.env`

**Conditional env vars:**
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` - Enables waitlist, uploads, and arc persistence
- `BROWSERBASE_API_KEY` - Enables ad fetching (`ad_fetch_bb.py` exits without it)
- `SOMA_STAGEHAND_MODEL` - Optional Stagehand model selection
- `META_ACCESS_TOKEN` - Optional Meta Ad Library API access
- `SMOKE_URL` - Optional smoke test target (auto-set by `scripts/verify.sh` to localhost:3099)

**Secrets Location:**
- Development: `.env` or `.env.local` (both `.gitignore`d)
- Production (Vercel): Project environment settings (dashboard → Settings → Environment Variables)
- Note: Next.js reads `.env.local` first, then `.env` (local wins); Python pipeline reads `.env` only

**Graceful Degradation:**
- Supabase unconfigured:
  - `GET /api/arcs` → 200 with `[]` (returns bundled samples from `public/arcs/*.json`)
  - `POST /api/waitlist` → 500 `{"error":"Waitlist is not configured."}`
  - `POST /api/uploads/sign` → 500 `{"error":"Uploads are not configured."}`
  - `publish_to_supabase.py` → Refuses to run before any network request
- Browserbase unconfigured: `ad_fetch_bb.py` exits with `[fatal] BROWSERBASE_API_KEY not set`
- Meta API unconfigured: `ad_fetch_bb.py metaapi` prints usage hint, returns no rows; other sources still work

## Webhooks & Callbacks

**Incoming:**
- None detected (no webhook receivers in `src/app/api/`)

**Outgoing:**
- None detected (no outbound webhook calls in source code)

**Async Job Polling:**
- `src/components/result/BatchStatus.tsx` - Client-side polling of batch status via `src/app/api/batches/[token]/status/route.ts`
- `src/app/api/generate/[token]/status/route.ts` - Polls Supabase for generation run completion
- `src/app/api/edit/[token]/status/route.ts` - Polls Supabase for edit run completion

## External Tools (Non-SDK)

**Video/Media Processing:**
- `ffmpeg` - Video frame extraction, transcoding, muxing (called by Python pipeline)
- `ffprobe` - Media introspection (duration, codecs, etc.)
- `tesseract` - OCR for on-screen text extraction (optional; Communication Clarity skips if absent)
- `yt-dlp` - Video URL resolution and download (ad_fetch_bb.py shells out via subprocess for non-direct URLs)

## API Route Structure

**Data Endpoints:**
- `GET /api/arcs` - Fetch arc list (Supabase or bundled fallback)
- `POST /api/waitlist` - Join early-access list (security-definer RPC call)

**Upload Endpoints:**
- `POST /api/uploads/sign` - Mint signed upload URL for browser PUT
- `POST /api/uploads/complete` - Finalize upload and update database

**Batch Operations:**
- `POST /api/batches/create` - Create new batch job
- `GET /api/batches/[token]/status` - Poll batch status
- `GET /api/batches/[token]/edit-preview` - Preview edit results

**Generation/Edit Flows:**
- `POST /api/generate/create` - Trigger arc generation
- `GET /api/generate/[token]/status` - Poll generation completion
- `POST /api/edit/create` - Trigger edit operation
- `GET /api/edit/[token]/status` - Poll edit completion
- `POST /api/edit/run/route.ts` - Execute edit logic (internal)
- `POST /api/generate/run/route.ts` - Execute generation logic (internal)

---

*Integration audit: 2026-07-28*
