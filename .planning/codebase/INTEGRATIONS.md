# External Integrations

**Analysis Date:** 2026-07-18

## APIs & External Services

**Facebook TRIBE v2 (Meta):**
- What it's used for: Video-to-brain-activation encoder. Predicts per-second cortical activation (~20k surface vertices) from audio+video input.
- SDK/Client: HuggingFace Hub (transformers library on GPU box; `model.from_pretrained("facebook/tribev2")`)
- Auth: HuggingFace API token (gated model access; user must accept terms at https://huggingface.co/facebook/tribev2)
- Implementation: `batch_extract.py` loads model once, then loops over clips in a folder
- Model weights: ~1 GB, cached to `./cache/` after first download
- Inference target: Video file → `preds` array `(n_timesteps, 20484)` (fsaverage5 surface vertices)
- Run location: Google Colab (free T4) or rented A100; CPU analysis runs offline with cached `preds_<id>.npy`

**HuggingFace Hub:**
- What it's used for: Gated weight hosting for TRIBE v2 model
- SDK: `huggingface_hub` Python package (on GPU boxes only)
- Auth: HuggingFace personal API token (read from user environment during Colab setup)
- Endpoint: https://huggingface.co/facebook/tribev2
- Connection: Internet (Colab → HF Hub) during model download only

## Data Storage

**Supabase (PostgreSQL + Cloud Storage):**
- **Database:**
  - Provider: Supabase (managed PostgreSQL)
  - Project ID: `jfjztzdnoybhfgbgljjh`
  - Tables:
    - `public.waitlist` - Early-access signups (email, company, user_agent, created_at)
    - `public.arcs` - Analysis results (ad_id, title, arc JSON, meta JSON, is_public flag, created_at)
    - `public.uploads` - Video upload queue (email, filename, size, storage_path, status, created_at)
  - Connection: Via Supabase REST API (PostgREST)
  - Auth: Two keys
    - `anonKey` (sb_publishable_...) - Browser use, gated by RLS (read public arcs, insert waitlist/uploads only)
    - `serviceRoleKey` (sb_secret_...) - Server-side only, bypasses RLS (for publishing results; stored in env var `SUPABASE_SERVICE_ROLE_KEY`)
  - Location: `supabase/schema.sql` defines all tables + row-level security policies
  - URL: `https://jfjztzdnoybhfgbgljjh.supabase.co`

- **File Storage:**
  - Bucket: `uploads` (private, not publicly listable)
  - Size limit: 150 MB per file
  - Allowed MIME types: video/mp4, video/quicktime, video/webm, video/x-msvideo, video/x-matroska
  - Access: Browser uploads via anon key (INSERT only, no LIST/READ for user's own files), pipeline reads with serviceRoleKey
  - Use case: Temporary staging for user-uploaded ad videos before processing

- **Client Library (Frontend):**
  - No official SDK; custom fetch-based REST client at `demo/supabase.js`
  - Implements: `joinWaitlist()`, `fetchArcs()`, `uploadVideo()` (PostgREST + Storage endpoints)
  - Headers: `apikey` (anon key for browser), `Authorization: Bearer <key>` (for Storage)
  - Fallback: If Supabase unconfigured, waitlist writes to `localStorage` (browser-only)

- **Client Library (Backend/Pipeline):**
  - File: `publish_to_supabase.py`
  - No library dependency; uses Python `urllib` (stdlib)
  - Endpoint: POST `/rest/v1/arcs?on_conflict=ad_id` (upsert on ad_id unique key)
  - Auth: `SUPABASE_SERVICE_ROLE_KEY` env var
  - Payload: `{ ad_id, title, arc (full JSON), meta (JSON), is_public }`

## Authentication & Identity

**Auth Provider:**
- Custom: No user login system
- Waitlist signup: Anonymous (email only, write-only, no login required)
- Video uploads: Anonymous (no auth, just a queue)
- Admin/pipeline publishing: Environment variable (`SUPABASE_SERVICE_ROLE_KEY`), server-side only

**Keys & Secrets:**
- Supabase anon key: Hardcoded in `demo/supabase-config.js` (safe: RLS prevents misuse)
- Supabase service role key: **NEVER in code**; read from env var `SUPABASE_SERVICE_ROLE_KEY` in `publish_to_supabase.py`
- HuggingFace token: User provides in Colab setup (read-only; gated model access)

## Monitoring & Observability

**Error Tracking:**
- None (logs go to console / stdout)
- Pipeline failures print to stderr and exit with non-zero code

**Logs:**
- Browser demo: console.log (dev tools only)
- Python CLI: Print to stdout/stderr (no structured logging framework)
- Supabase errors: Caught in `publish_to_supabase.py`, HTTP error codes + response body logged to stderr

**Health Checks:**
- None (static site + CLI tools)
- Supabase connectivity: Implicit check when publishing (raises on network error)

## CI/CD & Deployment

**Hosting:**
- Demo: Vercel (static hosting, auto-deploys on push to main)
- Backend/analysis: Self-hosted (runs on user's laptop or rented GPU box)
- Database: Supabase managed service

**CI Pipeline:**
- None explicitly defined
- GitHub Actions: Not configured in this repo
- Vercel: Auto-deploys `demo/` folder on main branch (zero-config static hosting)

**Deployment Process:**
1. **Demo:** Push to main → Vercel auto-redeploys (~5 sec)
2. **Results:** `python publish_to_supabase.py <arc_files>` → arcs appear live in demo (no redeploy)
3. **Analysis:** `make pipeline` or `make test` → CPU-only, no deployment step

## Environment Configuration

**Required env vars (Pipeline):**
- `SUPABASE_URL` (optional; default: `https://jfjztzdnoybhfgbgljjh.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` (required to publish; from Supabase dashboard → Settings → API → service_role key)

**Optional env vars (GPU Colab):**
- `HUGGINGFACE_TOKEN` (gated model access; user creates at https://huggingface.co/settings/tokens)

**Secrets Location:**
- Not committed (see `.gitignore`)
- Vercel: Environment set via Vercel CLI (stored in `.vercel/.env.production.local` — do NOT commit)
- Local: Developers export env vars in shell before running `publish_to_supabase.py`

## Webhooks & Callbacks

**Incoming:**
- None (demo doesn't expose endpoints)

**Outgoing:**
- None (analysis pipeline is unidirectional: write results to Supabase, done)

## Data Flow Diagram

```
GPU Box (Colab T4 / A100)
├─ Download clip from Drive
├─ Download TRIBE v2 weights from HuggingFace Hub
├─ Predict: clip → preds_<id>.npy (cached)
├─ Derive arcs: preds → arc_<id>.csv + arc_<id>.json
└─ Output to Google Drive
    │
    ▼
Local Laptop (CPU / analysis)
├─ Download arcs from Drive
├─ Load TVSum human-interest data (public GitHub)
├─ Run validation: predicted arc vs human arc
└─ Publish results: python publish_to_supabase.py
    │
    ▼
Supabase arcs table
    │
    ▼
Demo (Vercel, static site)
├─ Fetch public arcs via Supabase REST API
├─ Render per-second attention/valence/arousal lanes
└─ Show weak-spot callouts + evidence badges

User (Browser)
├─ Fill waitlist form → insert to Supabase.waitlist (anon)
├─ Upload video → write to Supabase.uploads + storage/uploads/ (anon)
└─ (Future: async pipeline processes upload, publishes arc live)
```

## External Dataset Sources

**TVSum (public, GitHub):**
- Repository: https://github.com/yalesong/tvsum
- What it's used for: Human-attention validation curve (20 annotators, per-frame importance annotations)
- Download: Automatic in `tvsum_trim.py` (downloads `tvsum50_ver_1_1.tgz`)
- Format: `.mat` file (MATLAB binary) → parsed in `tvsum_prep.py`
- License: Academic use
- Size: ~1.5 GB (full dataset)

**LIRIS-ACCEDE (public):**
- What it's used for: Continuous human valence/arousal labels (affect validation)
- Fetch: Documented stub in `liris_prep.py` (`load_real_liris_continuous()` function; not yet implemented)
- Format: CSV or video-aligned annotations (TBD)
- Status: Unvalidated proxy; affects validation is a pre-registered secondary test

## Model & Weights Management

**TRIBE v2 (Meta):**
- Location: HuggingFace Hub (gated)
- Cached after first download to: `./cache/`
- Size: ~1 GB
- Format: Transformers checkpoint (PyTorch)
- Training: NOT done locally; inference only
- Version: Public, Algonauts-2025-winning checkpoint (fixed, no fine-tuning)

**Soma Readout Heads:**
- Valence/arousal masks: Pre-built from Destrieux atlas via nilearn in `build_roi_mask.py`
- Trained attention head: `train_head.py` (ridge regression on frozen TRIBE features)
  - Weights saved to `validation/head/` directory
  - Not validated until real GPU run completes
  - Treated as hypothesis/experimental

---

*Integration audit: 2026-07-18*
