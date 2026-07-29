<!-- refreshed: 2026-07-28 -->
# Architecture

**Analysis Date:** 2026-07-28

## System Overview

Soma is a hybrid Next.js/Python system that scores video advertising content using neuroscience (brain imaging) signals and generates AI-powered edits. The architecture separates client-side request handling from long-running GPU-based processing.

```text
┌────────────────────────────────────────────────────────────────┐
│                    Browser / Client                             │
│  Upload Dialog  Upload Batch  Edit Form  Generate Form          │
│                 `src/components/upload/*`                       │
└─────────┬────────────────────────────────────────────┬──────────┘
          │                                            │
          ▼                                            ▼
┌────────────────────────────────────────────────────────────────┐
│              Next.js API Routes (Server)                        │
│  POST /api/uploads/sign         Sign storage URLs              │
│  POST /api/batches/create       Queue batch for processing      │
│  POST /api/edit/create          Queue edit job                 │
│  POST /api/generate/create      Queue generation job           │
│  GET  /api/batches/[token]/status      Poll status             │
│  `src/app/api/*`                                               │
└────────┬───────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│              Supabase Database & Storage                        │
│  Tables: batches, uploads, generation_runs, edits              │
│  Storage bucket: uploads (video files, results)                │
│  RLS-protected with service_role override for server ops       │
└─────────┬──────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────┐
│          Python Backend (Long-running Workers)                  │
│  tools/concierge/run_batch.py   Process batch scoring          │
│  tools/edit/search.py            Generate edit candidates      │
│  tools/generate/pipeline.py      Generate new videos (AI)      │
│  *.py (root)                     Analysis & feature extraction  │
└────────┬─────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│        Results Display Pages                                    │
│  /r/<token>  Batch results with arcs, scores, rankings         │
│  /e/<token>  Edit run results                                  │
│  /g/<token>  Generation run results                            │
│  `src/app/r/[token]/page.tsx`                                  │
└────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Upload Flow** | Manage file upload to storage, collect batch metadata | `src/components/upload/BatchUpload.tsx`, `src/lib/batch.ts` |
| **Edit Flow** | Collect edit parameters, invoke search via API | `src/components/edit/EditBeta.tsx`, `src/lib/edit-runner.ts` |
| **Generate Flow** | Collect video generation parameters | `src/components/generate/GenerateBeta.tsx`, `src/lib/generate-runner.ts` |
| **API Layer** | Queue jobs, manage state, interface with database | `src/app/api/*` |
| **Result Display** | Show scoring results, render arcs, display rankings | `src/components/result/*`, `src/app/r/[token]/page.tsx` |
| **Demo Pages** | Public showcase (preflight, demo, brain lab) | `src/app/demo/*`, `src/app/brain-lab/*` |
| **Python Pipeline** | Score videos, extract neuroscience features, AI edits | `tools/*`, root-level `*.py` files |

## Pattern Overview

**Overall:** Async job queue with capability-based access (share tokens) and signed URLs

**Key Characteristics:**
- No user authentication — access is token-based (16-byte random hex share_token)
- Server-initiated but client-polled — jobs run asynchronously, browser polls for status
- Shared validation — identical rules on client and server prevent round-trips
- Separated concerns — frontend cannot touch database directly, all access through API
- Signed temporary URLs — private storage objects get short-lived URLs on-demand

## Layers

**Browser Layer:**
- Purpose: Upload videos, set parameters, poll for results
- Location: `src/components/*`, client-side React
- Contains: Form components, dialogs, result displays
- Depends on: API routes, local validation (batch.ts, upload.ts)
- Used by: End users visiting www.usesoma.work

**API Layer:**
- Purpose: Validate inputs, queue jobs, manage database state, sign storage URLs
- Location: `src/app/api/*`
- Contains: Next.js route handlers (POST/GET)
- Depends on: Supabase, Python subprocess execution, local lib modules
- Used by: Browser requests, Python workers reading/writing status

**Business Logic Layer:**
- Purpose: Shared validation, manifest generation, arc mathematics
- Location: `src/lib/*`
- Contains: Pure TypeScript functions, type definitions, helpers
- Depends on: Nothing (environment-agnostic)
- Used by: API routes, browser forms

**Python Execution Layer:**
- Purpose: Long-running GPU/ML jobs (scoring, feature extraction, AI generation)
- Location: `tools/*`, root-level `*.py` files
- Contains: CLI modules, feature extractors, runners
- Depends on: numpy, scipy, librosa, pytorch, model files
- Used by: API route handlers via child_process.execFile()

**Database/Storage Layer:**
- Purpose: Persist batch state, store video files, serve signed URLs
- Location: Supabase (hosted PostgreSQL + Supabase Storage)
- Contains: batches, uploads, generation_runs, edits tables; uploads bucket
- Depends on: service_role auth for API layer
- Used by: All layers

## Data Flow

### Primary Request Path: Batch Scoring

1. **Upload Phase** (`/upload` page, `src/components/upload/BatchUpload.tsx`)
   - User selects videos and fills brief form
   - Each file triggers `/api/uploads/sign` to get signed PUT URL
   - Browser uploads directly to Supabase Storage (bypasses server)

2. **Batch Creation** (`/api/batches/create`, `src/app/api/batches/create/route.ts`)
   - Form submitted with brief + array of storage paths
   - Route validates brief and ads using `batch.ts` rules
   - Manifest built (buildManifest) — mirrors Python's process_batch.py schema exactly
   - Batch row inserted with status="queued"
   - Upload rows linked with ad_ids (adIdFor(i) ensures deterministic ordering)

3. **Result Page Navigation** (`/r/<share_token>`)
   - Customer navigates to result page using share_token
   - Page is force-dynamic (never cached) so status is always fresh
   - Polls `/api/batches/<token>/status` to watch state transition
   - BatchStatus component handles queued → processing → done/failed states

4. **Python Processing** (triggered externally by concierge runner)
   - Runner reads batch manifest from database
   - Calls `tools/concierge/run_batch.py --manifest-id <id>`
   - Pipeline processes each ad, computes arcs, extracts features
   - Writes report as PreflightReport (public/preflight/batch_report.json schema)
   - Updates batch.status → "done", batch.report with results

5. **Results Display** (`src/app/r/[token]/page.tsx`)
   - Page loads batch + report from database
   - Signs media URLs on-the-fly (SIGNED_URL_TTL_S = 1 hour)
   - ResultReport component renders arcs, scores, rankings
   - Charts use arc-draw.ts for visualization

### Edit Search Flow

1. **Edit Form** (`/edit` page, `src/components/edit/EditBeta.tsx`)
   - User specifies how many edits to generate ("top 3")
   - Specifies the source video (from preflight or batch)

2. **API Request** (`/api/edit/create`)
   - Route collects ad data (arc, lanes, features, transcript)
   - Checks beta-gate (limited concurrent runs)
   - Calls `runEditSearch()` which spawns Python subprocess

3. **Python Execution** (`src/lib/edit-runner.ts`)
   - Creates temp directory, downloads video
   - Invokes `python -m tools.edit.search --ad-json ... --video ...`
   - Subprocess runs for up to 3 minutes
   - Outputs edits.json with candidate cuts + timings
   - Returns result to browser

4. **Results Display** (`/e/<token>`)
   - Shows original + generated edits side-by-side
   - Each edit is a timecode range + title

### Generate Flow

1. **Generation Form** (`/generate` page)
   - User specifies prompt, aspect ratio, provider (Flux/Runway/etc)
   - Brief pulled from edit context or entered fresh

2. **Queue Run** (`/api/generate/create`)
   - Route inserts generation_runs row with status="processing"
   - Acquires a "run slot" (single concurrent job gate via beta-gate.ts)
   - Calls `runGeneratePipeline(input)` to invoke Python

3. **Python** (`src/lib/generate-runner.ts` → `tools/generate/pipeline.py`)
   - Connects to AI provider (Flux API, etc.)
   - Generates video frames/clips
   - Saves to storage
   - Returns result metadata

4. **Async Polling** (`/g/<token>`)
   - Shows status and links to generated video when complete

### State Management

- **Optimistic**: Client assumes upload succeeded until proven otherwise
- **Database as source of truth**: Supabase records state; Python workers poll it
- **Eventual consistency**: Multiple readers (browser, Python, API) but one writer per job
- **No real-time**: All communication is HTTP polling, not WebSockets

## Key Abstractions

**Arc** (`src/lib/types/arc.ts`)
- Purpose: Represents brain activation over time for one video
- Structure: timestamps + activation (core), plus optional affect, message, readout lanes
- Used by: Demo player, result charts, validation
- Pattern: Type guard `validArc()` gates all uses — unvalidated data never renders

**Manifest** (`src/lib/batch.ts`)
- Purpose: Configuration passed verbatim to Python pipeline
- Structure: MESSAGE_FIELDS (brand, product, problem, benefit, offer, cta) + COMPARABILITY_KEYS (platform, placement, objective, product, audience) + list of ads
- Invariant: Built once by buildManifest(), never accepted from user input
- Mirror: Identical to demo/process_batch.py:Manifest — no mapping layer between forms and pipeline

**Brief** (`src/lib/batch.ts`)
- Purpose: Form input shape — message fields only (not ads or comparability)
- Used by: Upload form, batch creation API
- Validation: validateBrief() catches missing MESSAGE_FIELDS before submission

**PreflightReport** (`src/components/preflight/types.ts`)
- Purpose: Complete batch scoring output (arcs, scores, rankings, diagnostics)
- Structure: List of PreflightAd with arcs in baseline-subtracted raw TRIBE units
- Invariant: Precomputed by Python — pages do math-free rendering only
- Schema: Mirrors demo/process_batch.py output exactly

**PreflightAd** (`src/components/preflight/types.ts`)
- Purpose: One scored video within a batch report
- Contains: Arc (raw + psc scales), scores (preflight, hook, processing, clarity), weak spots, ROI profile
- Ranking: Percentile within batch (0–100)
- Validity gate: arc is null if timing check failed; scores still present so ad still renders

**EditRunInput** / **BatchEditRunInput** (`src/lib/edit-runner.ts`)
- Purpose: Parameters for edit search subprocess
- Shapes: demo (simple — just ad path) vs batch (full ad metadata + download URL + transcript)
- Output: Array of { start, end, title } time ranges

## Entry Points

**Public Pages:**
- `/` — Landing page (`src/app/page.tsx` → `src/components/Landing.tsx`)
- `/upload` — Batch upload flow (`src/app/(site)/upload/page.tsx`)
- `/edit` — Edit form (beta) (`src/app/(site)/edit/page.tsx`)
- `/generate` — Generation form (beta) (`src/app/(site)/generate/page.tsx`)
- `/demo` — Public demo with committed preflight artifact (`src/app/demo/page.tsx`)
- `/preflight` — Same demo, different route (`src/app/preflight/page.tsx`)
- `/brain-lab` — Interactive arc visualization (`src/app/brain-lab/page.tsx`)

**Result Pages (Capability URLs):**
- `/r/<share_token>` — Batch result (`src/app/r/[token]/page.tsx`)
- `/e/<share_token>` — Edit result (`src/app/e/[token]/page.tsx`)
- `/g/<share_token>` — Generation result (`src/app/g/[token]/page.tsx`)

**API Routes:**
- `POST /api/uploads/sign` — Get signed URL for video upload
- `POST /api/batches/create` — Queue a batch for scoring
- `GET /api/batches/<token>/status` — Poll batch status
- `POST /api/edit/create` — Queue edit search
- `GET /api/edit/<token>/status` — Poll edit status
- `POST /api/generate/create` — Queue generation
- `GET /api/generate/<token>/status` — Poll generation status

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js/Next.js). Python execution is subprocess (separate process), gated by acquire/release RunSlot to prevent concurrent GPU jobs.
- **Global state:** RunSlot (single int counter in memory) gates concurrent Python execution. Races possible in dev; mitigated in prod by single Vercel instance.
- **Circular imports:** None enforced by module boundaries (API → lib, lib → no dependencies, components → lib/types).
- **Manifest as contract:** Python is source of truth for validation rules (MESSAGE_FIELDS, DURATION_BUCKETS, HOOK_WINDOW_S). TypeScript mirror must be updated in lockstep.
- **Storage access:** Private bucket (uploads) requires signed URLs. Public assets in /public use direct paths. Result page mints URLs on-render; validity is ~1 hour.
- **Supabase schema as schema:** Table structure (batches, uploads, generation_runs) is the API contract. RLS set to permissive for service_role; service_role is never exposed to browser.

## Anti-Patterns

### Sending Manifests from Client

**What happens:** Client builds a Manifest and POSTs it to /api/batches/create.

**Why it's wrong:** The manifest is executed by the Python pipeline. If the client constructs it, an attacker could inject arbitrary keys that the pipeline's JSON parser would read, leading to parameter injection or unexpected behavior.

**Do this instead:** Accept only Brief + array of BatchAd. Server calls buildManifest() which restricts keys to MESSAGE_FIELDS. Brief is validated against exact schema.
- File: `src/lib/batch.ts:buildManifest()` — one place, one way
- API: `src/app/api/batches/create/route.ts` — never accepts manifest

### Directly POSTing User Filenames to Manifest

**What happens:** Client sends `{ filename: "final_FINAL_v2.mp4" }` and it becomes `manifest.ads[i].filename`.

**Why it's wrong:** Two ads with the same customer-supplied filename would collide when the runner downloads. Also, filenames can be mutated by sanitizeName() and disagreement between the form and the pipeline would cause files not to be found.

**Do this instead:** Server mints ad IDs (ad_01, ad_02, etc). buildManifest() sets `filename: "${adIdFor(i)}.mp4"`. Runner always downloads to that exact name.
- File: `src/lib/batch.ts:adIdFor()` — deterministic from index
- Guarantee: `manifest.ads[i].id === uploads.ad_id` for row i

### Trusting Unvalidated Arc Data in Charts

**What happens:** Page loads arc from Supabase or API and passes it directly to chart render.

**Why it's wrong:** If a field is malformed (timestamps.length !== activation.length), the chart would silently draw wrong data or crash.

**Do this instead:** Gate arc use with `validArc(d)` type guard before rendering. If invalid, return null and show nothing rather than a wrong curve.
- File: `src/lib/arc.ts:validArc()`
- Usage: `arc-draw.ts:drawArc()` starts with validArc guard

### Exposing Private Storage Object Keys as Public URLs

**What happens:** Result page writes `manifest.ads[i].video = "results/123/ad_01.mp4"` and page naively links it as `<video src="results/123/ad_01.mp4">`.

**Why it's wrong:** The results bucket is private. An object key is not a URL and cannot be loaded by the browser without auth. The URL would 404.

**Do this instead:** Object keys are exchanged for signed URLs at render time. Each signed URL is short-lived (1 hour). Key is never exposed.
- File: `src/app/r/[token]/page.tsx:mediaUrls()`
- Flow: Load batch → for each object key → sign → return URL → pass to ResultReport

## Error Handling

**Strategy:** Fail fast on input validation, fail gracefully on service errors

**Patterns:**
- **Brief validation:** validateBrief() collects all problems and returns array. Form shows all errors at once, not one by one.
- **Ad validation:** validateAds() checks count, duration buckets, length consistency, title uniqueness. All problems returned; user fixes all before resubmit.
- **Supabase errors:** API catches `{ error, data }` and responds with 500 + readable message if error. Batch is rolled back (cascade delete via RLS).
- **Python subprocess:** execFileAsync times out at 3 minutes. If hung, child process is reaped and error is returned to browser.
- **Missing env:** serviceClient() returns null if env missing; routes check and respond with "not configured" 500 rather than throwing.
- **Not found:** isShareToken() validates format before querying; bad format is 404 from edge, not a database round-trip.

## Cross-Cutting Concerns

**Logging:** Console.error() on unexpected failures (email send, batch write, Python runner). No structured logging framework. Errors visible in server logs only.

**Validation:** Shared modules (batch.ts, upload.ts) ensure client and server never disagree. Validator functions are pure; no side effects.

**Authentication:** No login system. Access is capability-based (share token). Tokens are 16 random bytes (128 bits), making enumeration infeasible. Every lookup by token is identical to "not found" lookup.

**Rate Limiting:** Beta gate (acquire/release RunSlot) limits concurrent Python jobs to 1. No per-user rate limit; concierge runner orchestrates queue externally.

**CORS:** Not applicable — all requests are same-origin (Next.js API is part of the same app).

---

*Architecture analysis: 2026-07-28*
