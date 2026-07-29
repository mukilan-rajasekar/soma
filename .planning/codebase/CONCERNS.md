# Codebase Concerns

**Analysis Date:** 2026-07-28

## Build & Deployment Conflicts

**Concurrent builds fail:**
- Issue: `next build` acquires a lock on `.next/lock`; a concurrent build in the same checkout fails rather than queues.
- Files: `./` (Next.js runtime behavior)
- Impact: CI/CD pipelines, development workflows, and the improvement loop cannot parallelize builds.
- Fix approach: Either serialize builds strictly, or move to a build system that queues rather than fails on lock contention.

**ESLint default ignores overridden:**
- Issue: Any `globalIgnores([...])` entry in `eslint.config.mjs` replaces eslint's defaults entirely; `node_modules` and `.git` must be manually restated or the linter walks them.
- Files: `eslint.config.mjs` (lines 11-23)
- Impact: Easy to accidentally lint massive dependency trees or git internals; linting becomes slow or exhausts system resources.
- Fix approach: Document this as a known pitfall and add a CI check that linting completes in reasonable time.

**Node version mismatch on Vercel:**
- Issue: `package.json` `engines.node` override `.vercel/project.json`'s nodeVersion on deploys, but `.vercel/project.json` does not exist in this repo (or is .gitignored). The source of truth for Node version is only in `package.json`.
- Files: `package.json` (line 6: `"node": ">=22.13.0"`)
- Impact: Vercel deployment may use the wrong Node version if `.vercel/project.json` is ever created with a conflicting value, or if the project settings UI is used to change the version.
- Fix approach: Document the constraint; add a pre-deployment check that `package.json` and Vercel settings agree.

## Environment Variable Misalignment

**Python and Next.js read .env differently:**
- Issue: Next.js reads `.env.local` first, then falls back to `.env`. Python's `python-dotenv` reads `.env` only (no `.env.local` fallback). The two halves can disagree on which values to use.
- Files: Next.js (runtime behavior); Python scripts (via `python-dotenv` calls, e.g., `ad_fetch_bb.py:103`)
- Impact: A value in `.env.local` meant to override `.env` will be seen by Next but not Python, causing configuration drift in local development.
- Fix approach: Document the asymmetry; prefer `.env` for shared variables, use `.env.local` only for truly local-only overrides (documented in `.env.example`).

## Dependency Resolution Conflicts

**GPU and CPU groups have resolver conflicts:**
- Issue: `requirements.txt` explicitly documents two separate installation groups (GROUP A: GPU/TRIBE, GROUP B: CPU/analysis) because they pull conflicting transitive deps. The GPU stack pins numpy hard to `<2.1` due to C-ABI compatibility with TRIBE v2's compiled extensions; the CPU group uses `numpy>=1.26,<3`.
- Files: `requirements.txt` (lines 1-46); GPU environment is not in this repo (documented in comments).
- Impact: Installing both groups into one venv fails with resolver conflicts. The fix requires TWO separate environments, documented in requirements.txt header. A contributor unfamiliar with the constraint may accidentally break the GPU stack.
- Fix approach: The constraint is documented; improve discovery by adding a `Makefile` or `scripts/setup-envs.sh` that automates the two-step setup.

**torch CUDA wheel installed in CPU venv:**
- Issue: `requirements.txt` lists `torch` uncommented but it is installed from GPU environment builds. If bare `.venv/bin/pip install -r requirements.txt` is run, it pulls a CUDA wheel into the CPU environment (wasting ~2 GB) even though only numpy/scipy/etc. are actually needed.
- Files: `requirements.txt` (line 31); CPU environment setup
- Impact: CPU venv bloat; longer install times; potential breakage if a CUDA wheel's runtime dependencies (CUDA itself, cuDNN) are missing.
- Fix approach: Move the `torch` line to a separate `requirements-gpu.txt`, or uncomment it as `# torch` and document that CPU venv must not install it.

**External binary dependencies not in pip:**
- Issue: The Python pipeline requires `ffmpeg`, `tesseract`, `yt-dlp`, and (on macOS) Vision framework access, but none are declared in `requirements.txt` because they are not pip packages.
- Files: `requirements.txt` (lines 76-91); `tools/concierge/README.md`; `tools/demo/media_text.py`; `ad_fetch_bb.py:166`; `demo/process_batch.py`
- Impact: Fresh checkout has no way to discover these dependencies; scripts fail cryptically on missing binaries.
- Fix approach: Add a `scripts/check-deps.sh` that verifies all binaries are on PATH before running pipeline scripts; document required system packages in `SETUP.md`.

## Type Safety Gaps

**Widespread use of `any` in TypeScript:**
- Issue: 20+ files use `any` type annotations, defeating static type checking.
- Files: `src/lib/arc.ts`, `src/lib/batch.ts`, `src/components/Landing.tsx`, `src/components/BrainField.tsx`, `src/components/demo/DemoConsole.tsx`, `src/components/preflight/DeltaChart.tsx`, and others
- Impact: Refactoring is unsafe; bugs slip through type checking; the type system cannot catch data shape mismatches.
- Fix approach: Audit each `any` use; replace with proper types or `unknown` + type guards. Run `tsc --strict --noEmit` in CI.

**Loose validation of arc data structures:**
- Issue: Arc data from Supabase or external sources is validated only lightly. `validArc()` in `src/lib/arc.ts` checks presence and length parity but not actual value bounds or NaN/Infinity.
- Files: `src/lib/arc.ts:19-27`; `src/lib/arc-draw.ts`; data loading in `src/components/demo/live.ts`
- Impact: Malformed or corrupted arc data can pass validation and render garbage or crash the canvas.
- Fix approach: Add strict validation: check value ranges [0,1], reject NaN/Infinity, validate all required lanes are present.

## Monolithic Components

**Giant React components:**
- Issue: `DemoScrollPage.tsx` is 1287 lines; `TwoRegionBrain3D.tsx` is 734; `DemoConsole.tsx` is 724; `BrainField.tsx` is 673. These are beyond what humans can reason about in one sitting.
- Files: `src/components/demo2/DemoScrollPage.tsx`; `src/components/demo2/TwoRegionBrain3D.tsx`; `src/components/demo/DemoConsole.tsx`; `src/components/BrainField.tsx`
- Impact: Code review is painful; refactoring is risky; bugs are hard to isolate.
- Fix approach: Break each into 3–5 smaller focused sub-components per feature or screen region.

**Giant Python modules:**
- Issue: `demo/process_batch.py` is 1677 lines; `ad_fetch_bb.py` is 938; `tools/concierge/run_batch.py` is 765; `tools/demo/build_report.py` is 667.
- Files: `demo/process_batch.py`; `ad_fetch_bb.py`; `tools/concierge/run_batch.py`; `tools/demo/build_report.py`
- Impact: Same as React: hard to understand, hard to test, hard to refactor.
- Fix approach: Extract helper modules; use shared constants modules; break CLI scripts into orchestrator + specialized worker functions.

## Test Coverage Gaps

**12 critical Python modules untested:**
- Issue: No dedicated test files for: `ad_advertisers.py`, `ad_backtest.py`, `ad_fetch_bb.py`, `ad_performance.py`, `affect_extract.py`, `batch_extract.py`, `coarse_states.py`, `honest_corr_timeseries.py`, `message_extract.py`, `publish_to_supabase.py`, `readout_extract.py`, and `head_null_test.py`.
- Files: Root-level and `tools/` modules
- Impact: Core pipeline logic has no regression protection; a one-line typo in a widely-used module breaks silently.
- Fix approach: Prioritize tests for `batch_extract.py`, `train_head.py` (already tested), and `publish_to_supabase.py` (Supabase writes); use fixtures instead of real data.

**npm run lint lints more files than CI:**
- Issue: `npm run lint` runs bare eslint on 83 files; the CI gate (verify.sh) lints only `src/`. A passing local lint can fail the gate.
- Files: `eslint.config.mjs`; `scripts/verify.sh`
- Impact: Contributor confusion; gate failures appear random.
- Fix approach: Make both lint the same scope. Prefer linting all TypeScript, not just `src/`.

**smoke.mjs 404 media false positives:**
- Issue: smoke.mjs listens for `requestfailed` events and marks them as failures. Media preload cancellations are benign (normal browser behaviour), but the test regex only exempts them if the error text contains `ERR_ABORTED`. A 404 is NOT `ERR_ABORTED`; it's a different error code. Preloaded video/audio that 404 will fail the smoke test even though the page is fine.
- Files: `scripts/smoke.mjs:43-44`, `scripts/smoke.mjs:68-70`
- Impact: Flaky smoke tests; gate failure on asset hosting issues that do not affect functionality.
- Fix approach: Also exempt 404 responses on media files; update the regex to `/ERR_ABORTED|^404/` or check `r.status() === 404`.

## Fragile Pipeline Logic

**Multiple sources of truth for scoring constants:**
- Issue: Scoring weights are defined identically in three places: `tools/demo/build_report.py:69-96`, `demo/process_batch.py:77-88`, and `src/components/demo2/studio.ts` (LATTICE, EDIT_OPTIONS, PASS_MARK). A change in one must be mirrored in all three.
- Files: `tools/demo/build_report.py`; `demo/process_batch.py`; `src/components/demo2/studio.ts`
- Impact: Easy to drift; the site and the pipeline can disagree on what a score means.
- Fix approach: Export weights as a shared JSON file; load it in Python and embed it at build time in TypeScript. Single source of truth.

**numpy compatibility cliff:**
- Issue: `requirements.txt` pins `numpy>=1.26,<3` for the CPU venv. The GPU venv is pinned to `<2.1` for C-ABI compatibility with TRIBE v2 wheels. All code is tested against numpy 2.5.1. However, numpy 3.0 (a major version change) has breaking API changes: `arr.ptp()` (peak-to-peak) was removed and only `np.ptp(arr)` works.
- Files: `requirements.txt` (lines 41-47); Python scripts (no known uses of `ptp()` in current code, but the pattern exists elsewhere)
- Impact: When numpy 3.0 is released and a contributor updates the ceiling, the code silently breaks. No existing test catches the removal.
- Fix approach: Use `np.ptp()` (function form) instead of `.ptp()` (method form) everywhere. Add a CI test that checks numpy 3.0-compat locally (or at least runs the test suite against numpy 2.9 as a forward-compatibility check).

**Pearson coefficient zero-variance guard is exact:**
- Issue: The code checks `std() == 0` (exact equality) to detect zero-variance inputs before computing Pearson correlation. Residualized constants (e.g., a regression residual with exactly zero slope) can slip through this check and produce NaN or Inf.
- Files: Likely in `train_head.py`, `honest_corr_timeseries.py`, or a shared stats module
- Impact: Silent NaN propagation in correlation tables; validation results become untrustworthy.
- Fix approach: Use `std() <= 1e-10` (tolerance-based) instead of exact zero; add a test that catches residualized constants.

**Constant first-differenced data breaks score_r:**
- Issue: If the first difference of a signal is constant (e.g., linearly increasing ramp), the `score_r` (Pearson r) becomes NaN because the variance of a constant sequence is zero.
- Files: `train_head.py`, validation scripts
- Impact: A perfectly-valid linear test signal will crash the head training.
- Fix approach: Document that test arcs must have curvature (non-zero second derivative); add a check in `train_head.py` that rejects constant-slope inputs with a clear error.

**SystemExit vs ValueError error handling inconsistency:**
- Issue: Pipeline guard functions raise `SystemExit`; `head_io.py` raises `ValueError`. Code that wraps these must check both, or only catch one.
- Files: `head_io.py`; `train_head.py`; `batch_extract.py`; test files using `pytest.raises()`
- Impact: `pytest.raises(ValueError)` will not catch a guard that raised `SystemExit`, leading to false-positive test passes.
- Fix approach: Standardize on one exception type. Prefer `ValueError` with a clear message; reserve `SystemExit` for CLI-only errors (missing config at startup).

## Performance & Scaling

**Beta gate is single-process only:**
- Issue: `src/lib/beta-gate.ts` implements request rate limiting with in-memory counters (`seenToday` Map, `inFlight` integer). These are process-local; they reset on restart and do not coordinate across multiple Node processes.
- Files: `src/lib/beta-gate.ts:54`, `src/lib/beta-gate.ts:120-168`
- Impact: On serverless platforms (where each request might get a fresh process), the quota is meaningless. The cap is loose by a factor of the number of concurrent processes.
- Resolution (verified 2026-07-28): the deployment IS Vercel serverless (STACK.md is right; `vercel.json`, `.vercel/project.json`, live site deploying on push), so "the current deployment is single-process" was wrong as written. The gate is nevertheless fine, for the reason `beta-gate.ts:31-36` documents: all four gated routes do their work by spawning `python3 -m tools.generate.pipeline` (or the edit equivalent) in-request, and a Vercel function bundle has no Python modules, no venv, no ffmpeg — the spawn fails in milliseconds, so there is no CPU-minutes asymmetry on Vercel for the quota to protect. Real runs only ever execute on a single long-lived box with one Node process, where the in-memory counters are the whole truth. Residual (minor): with `SOMA_BETA_TOKEN` set on Vercel, `/api/{generate,edit}/create` insert a Supabase row before the spawn fails, so a secret-holder could accumulate junk `failed` rows unmetered there. Counters move to Supabase only if the routes ever run behind more than one process doing real work.

**Max concurrency is hardcoded to 1:**
- Issue: `src/lib/beta-gate.ts:45` sets `MAX_CONCURRENT = 1`, enforcing serial execution. This is deliberate (video renders are expensive), but it is a tight bottleneck if the machine can handle more or if the box ever scales.
- Files: `src/lib/beta-gate.ts:45`
- Impact: A box with 8 cores can only run one inference at a time; utilization is low.
- Fix approach: Measure actual box capacity; increase MAX_CONCURRENT proportionally if memory/CPU allows. Monitor actual queue depth to ensure a single run doesn't thrash.

**No caching for atlas downloads:**
- Issue: `nilearn` is used to fetch the Destrieux atlas (`build_roi_mask.py`); the `fetch_atlas_*` functions download from the internet on first use. In tests, these are monkeypatched to avoid network calls.
- Files: `requirements.txt:60`; `build_roi_mask.py`; test files monkeypatch (documented in `AGENTS.md`)
- Impact: First run after a fresh venv downloads ~100 MB; no caching means repeated runs re-download.
- Fix approach: Add a `--cache-dir` option or use `nilearn.datasets.set_data_home()`; document the cache location in `README.md`.

## Known Validation Gaps

**Pre-registered study is null; exploratory head is unvalidated:**
- Issue: Per `README.md:129-140`, the primary pre-registered test (brain arc vs. TVSum attention on n=15) came back null. The exploratory read-out head shows weak aggregate signal but is NOT a validated win (only 2/15 clips beat the ffmpeg baseline).
- Files: `README.md:124-143`; `validation/head_incremental.csv`; `PREREGISTRATION.md`
- Impact: Any marketing or documentation claiming the head is "validated" is false. The badge system in `src/components/result/ResultReport.tsx` marks exploratory results as hypotheses, but this is easy to misquote.
- Fix approach: Maintain the badges; audit all public-facing docs to ensure they never claim validation. Add a pre-deployment check in verify.sh that scans for the word "validated" in non-preregistered claims.

## Security Considerations

**Beta gate caller ID is spoofable:**
- Issue: `src/lib/beta-gate.ts:82-86` uses X-Forwarded-For and X-Real-IP headers to identify callers for daily quota tracking. These are spoofable via proxy headers.
- Files: `src/lib/beta-gate.ts:82-86`
- Impact: A determined attacker can bypass the daily quota (20 runs/day) by rotating caller IDs.
- Workaround in place: The secret is what keeps strangers out; this only stops one honest caller from looping. Documented in code comments.
- Fix approach: This is a known trade-off. If tighter enforcement is needed, switch to IP-based geolocation (less spoofable) or add a Supabase table for caller reputation.

**Capability URLs rely on 128-bit tokens:**
- Issue: Result pages (`/r/<token>`, `/g/<token>`, `/e/<token>`) use 128-bit share tokens as the sole authorization. No login, no signatures.
- Files: `src/app/(site)/result/[token]/page.tsx` (implied); `src/lib/beta-gate.ts:29-30`
- Impact: A leaked token gives permanent access to a customer's result.
- Workaround: The smoke test asserts that a well-formed token that does not exist returns 404, not 200. This keeps the model honest.
- Fix approach: Tokens are one-time-use or expire after N days; implement in Supabase with a `created_at` and `expires_at`.

## Known Quirks

**loop.sh runs git add -A:**
- Issue: `scripts/loop.sh` runs `git add -A` as part of each iteration, sweeping up any untracked file in the repo into the commit.
- Files: `scripts/loop.sh`
- Impact: A loop run can accidentally commit temporary files (e.g., `_debug.mjs` scratch scripts, test data).
- Mitigation: Scratch scripts are anchored to `/_*.mjs` in `.gitignore`; local-only directories (`data/`, `tests/`, `cloud/`) are ignored. Still, untracked Python or JS files at the repo root WILL be committed.
- Fix approach: Replace `git add -A` with explicit `git add src/ tools/ package.json` lists; reject any untracked file with an error.

**.impeccable/hook.cache.json pollutes repo-wide greps:**
- Issue: Untracked `.impeccable/hook.cache.json` contains names of old components and is not in `.gitignore`. Repo-wide greps for component names hit this cache file.
- Files: `.impeccable/hook.cache.json` (untracked)
- Impact: Search results are noisy; false positives confuse refactoring.
- Fix approach: Add `.impeccable/` to `.gitignore`.

**Token imports in demo2/ and preflight/ resolve differently:**
- Issue: Identical `./tokens` import lines in `src/components/demo2/tokens.ts` and `src/components/preflight/tokens.ts` resolve to different modules depending on directory context.
- Files: `src/components/demo2/tokens.ts`; `src/components/preflight/tokens.ts`
- Impact: A change to one tokens file may not affect all uses; maintainers can easily make a mistake.
- Fix approach: Unify into a single `src/components/tokens.ts` or use a path alias `@/tokens`.

**report.ts path.join reads inflate Next.js bundle:**
- Issue: If `tools/demo/build_report.py` uses `path.join()` to read from disk, Next.js's build-time tracing will include the entire `public/preflight/` directory in the server bundle.
- Files: `tools/demo/build_report.py` (Python, not TS, so not actually affected); but the principle applies if any Next route uses `path.join()` to read public assets.
- Impact: Server bundle bloat; larger deployment artifacts.
- Fix approach: Use `readFileSync()` inside a route handler or use Next's `import` for static assets instead of runtime `path.join()`.

**pytest fallback to system python3 when .venv is absent:**
- Issue: `scripts/verify.sh` falls back to system python3 if `.venv/bin/python` is not found. The system python3 likely lacks required packages.
- Files: `scripts/verify.sh` (bash script)
- Impact: A fresh checkout runs `npm test` and gets a cryptic ImportError instead of "install .venv first."
- Fix approach: Remove the fallback; error loudly if .venv does not exist, with a pointer to the setup instructions in `README.md`.

**scripts/loop.sh commits can name backlog items without doing them:**
- Issue: A loop commit message can reference a backlog item (e.g., `[item 3]`) without actually implementing it. The diff check does not verify the intent is satisfied.
- Files: `scripts/loop.sh` (commit naming)
- Impact: Backlog cruft; confusion about what is actually done.
- Fix approach: Add a comment in `.gsd/backlog.md` after a loop run clarifying that a commit name does not guarantee the item is complete; verify by reading the diff.

---

*Concerns audit: 2026-07-28*
