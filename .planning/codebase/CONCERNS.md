# Codebase Concerns

**Analysis Date:** 2026-07-18

## Tech Debt

### Hardcoded machine-specific paths in Makefile

**Issue:** `Makefile` lines 6–7 contain absolute paths specific to Mukilan's machine (`/Users/mukilan/projects/Brain\ Project`).

**Files:** `Makefile`

**Impact:** 
- Makefile is unusable on any other machine without manual editing.
- Team members or CI/CD systems cannot run `make` targets without modification.
- Makes the repo non-portable.

**Fix approach:** 
Replace hardcoded paths with relative paths or environment variables. Example:
```makefile
ROOT := $(shell pwd)
PY := $(shell which python3)
```
Then validate that `.venv/bin/python` exists, or use a venv activation pattern.

---

### Bare exception catching in batch_extract.py

**Issue:** Line 245 in `batch_extract.py` catches all exceptions with `except Exception:` (marked `# noqa: BLE001`).

**Files:** `batch_extract.py:245`

**Impact:** 
- Silently swallows unexpected errors (e.g., out-of-memory, disk full, keyboard interrupt).
- Makes debugging difficult when a GPU job fails mysteriously.
- The print statement only shows the exception, not a stack trace, so root cause is hidden.

**Fix approach:** 
- Catch specific exceptions (`IOError`, `ValueError`, `RuntimeError`) instead of broad `Exception`.
- Log or re-raise critical failures (memory, disk).
- Consider writing a structured error log instead of relying on stdout.

---

### Numpy version pinning to <2.1

**Issue:** `requirements.txt` line 16 pins `numpy>=1.26,<2.1` because the TRIBE / neuralset compiled stack breaks on newer numpy.

**Files:** `requirements.txt:16`

**Impact:** 
- Security fixes in numpy 2.1+ cannot be applied.
- Project is locked to an aging ecosystem.
- Future maintenance burden if numpy 2.1+ becomes the standard.

**Fix approach:** 
- Coordinate with Meta/neuralset to support numpy 2.1+.
- Document the TRIBE version and breaking changes that trigger the cap.
- Set a runway for removing the cap (e.g., "by Q4 2026 if neuralset updates").

---

### Magic numbers scattered across the codebase

**Issue:** Hardcoded thresholds and parameters appear without justification:
- `detect_weak_spots` in `batch_extract.py:105` uses `drop_pctl=25` (25th percentile for "weak").
- `affect_extract.py:89–94` uses hardcoded clipping ranges (`-0.9, 0.9` for valence; `0.05, 0.98` for arousal) and band widths (`0.28`, `0.25`).
- `circular_shift_p` in `honest_corr_timeseries.py:144` uses `min_shift=3` (minimum shift to avoid near-identity rolls).
- Ridge alphas in `train_head.py:55` are `[0.1, 1.0, 10.0, 100.0, 1000.0]`.

**Files:** `batch_extract.py:105`, `affect_extract.py:87–94`, `honest_corr_timeseries.py:144`, `train_head.py:55`

**Impact:** 
- Makes the codebase hard to reason about ("why 25? why 0.28?").
- Changes require editing multiple places; easy to miss one.
- Weak-spot detection is ad-hoc (a within-clip percentile flag; coverage is ≤25% and varies, and a falsifiable MAD-baseline redesign is in progress — see Known Bugs).

**Fix approach:** 
- Move all magic numbers to a top-level `CONFIG` dict or a `config.py` file with comments explaining each choice.
- Document the statistical or domain justification for each value.
- For weak spots, cite the OPTIMIZATION-BACKLOG.md #19 decision and make the falsifiability explicit.

---

## Known Bugs

### Weak-spot detection is circular (OPTIMIZATION-BACKLOG #19)

**Issue:** `detect_weak_spots` in `batch_extract.py:105–133` identifies runs where the smoothed arc sits in the bottom 25th percentile. The 25th-percentile threshold marks ~25% of *timepoints*, but the min-run filter (≥3s) then drops short low-runs, so actual weak-spot **coverage is ≤25% and varies by video** — it is not a fixed ~25% of every clip.

**Symptoms:** 
- Most demo arcs surface at least one weak spot, and a purely percentile-based flag does not, on its own, separate a genuinely low-engagement stretch from random variance.
- As long as the flag is defined only by a within-clip percentile it is hard to falsify — the redesign below addresses this.

**Files:** `batch_extract.py:105–133`

**Workaround:** 
- The demo correctly labels weak spots as "predicted dip — model hypothesis, to A/B test" (an explicit caveat).
- This is not a silent bug, but a known design decision awaiting validation.

**Fix approach (in progress):** 
- The detector is being redesigned into a falsifiable *deviation-below-baseline* flag: a robust MAD z-score against a smooth baseline, which can return **zero** weak spots for a steady arc (rather than always marking a fixed fraction).
- Alternative considered: remove weak spots entirely until a real validation signal exists.

---

## Security Considerations

### Public Supabase publishable key in demo configuration

**Risk:** `demo/supabase-config.js:14–17` exposes the Supabase URL and publishable (anon) key.

**Files:** `demo/supabase-config.js:14–17`

**Current mitigation:** 
- The key is deliberately public; it is the anon/publishable key, not the service_role secret.
- **(Updated posture)** RLS is enabled on `waitlist`, `arcs`, and `uploads`. Under the current 4-policy setup the anon role can: INSERT `waitlist` rows (write-only), SELECT `arcs` where `is_public = true`, INSERT `uploads` rows (write-only), and INSERT objects into the **private** `uploads` storage bucket only. It can never read the waitlist, read the uploads queue, or read other users' videos; all writes to `arcs` and all reads of the waitlist/uploads require the server-side `service_role` key.
- Service_role secrets are kept in `.env` (git-ignored) for server-side operations.

**Recommendations:** 
- Confirm the RLS policies in `supabase/schema.sql` are correctly restrictive (prevent anon from updating/deleting).
- Add a Content Security Policy (CSP) header on Vercel to prevent cross-origin script injection.
- Rotate the anon key at least annually.

---

### CSV parsing without sanitization

**Issue:** The naive `.split(",")` CSV parser lives in `honest_corr_timeseries.py` (`_read_csv`, lines ~340/343); it parses CSV files without escaping or quote handling. `incremental_validity.py` has no parser of its own — it imports this shared helper, so the concern is not there. (It is being switched to the stdlib `csv` module.)

**Files:** `honest_corr_timeseries.py` (`_read_csv`, ~340/343)

**Current mitigation:** 
- The CSV files are internally generated by trusted scripts (`batch_extract.py`, `tvsum_prep.py`).
- The tool is not exposed to untrusted user input.

**Risks (if user-supplied CSVs ever become possible):** 
- Malformed CSVs with embedded commas/quotes in values could crash parsing or inject values into wrong columns.
- A video ID containing commas could silently corrupt the results.

**Fix approach:** 
- Use the `csv` module from stdlib: `csv.DictReader()` handles quoting and escaping correctly.
- Add a validation pass after parsing: check expected columns, data types, and ranges.

---

### No validation of arc.json structure in demo

**Issue:** `demo/app.js:79–87` loads arc.json with minimal error handling. If the file is malformed, the error is caught but only a generic message is shown.

**Files:** `demo/app.js:79–87`

**Current mitigation:** 
- The demo displays "Could not load X — error message" on load failure.
- Arc.json files are generated by trusted scripts.

**Risks (if user upload is enabled):** 
- A malformed or attacker-provided JSON could cause the demo to crash or render unexpectedly.
- No validation of required fields (`duration_sec`, `timestamps`, `activation`, etc.).

**Fix approach:** 
- Add schema validation (e.g., a simple shape check) before rendering.
- Log validation errors to the browser console for debugging.

---

## Performance Bottlenecks

### Circular-shift permutation test is O(M × n_perm)

**Issue:** `circular_shift_p` in `honest_corr_timeseries.py:144–178` evaluates up to `n_perm` shifts, each requiring a full `spearman()` call. For a 180-point video, this is ~5000 rank computations.

**Files:** `honest_corr_timeseries.py:144–178`

**Cause:** 
- The honest p-floor = 1/(M+1) requires enumerating or sampling from **all** valid shifts (not just a strided subset).
- Spearman rank correlation is O(n log n) per shift.

**Improvement path:** 
- Cache rank computations across shifts (compute ranks once, then correlate).
- Parallelize shifts across CPU cores (currently single-threaded).
- For large n (>500), consider a parametric null approximation validated on smaller data.

**Current performance:** ~1–2 seconds per video on a modern laptop; 10 videos = 10–20 seconds total. Acceptable for a validation pipeline run once per experiment.

---

### Demo has three unthrottled requestAnimationFrame loops

**Issue:** `demo/app.js`, `demo/brain3d.js`, and `demo/scrollbrain.js` each call `requestAnimationFrame` without checking if the element is visible.

**Files:** `demo/app.js:117`, `demo/brain3d.js`, `demo/scrollbrain.js`

**Cause:** 
- Originally a non-issue on a single hero demo with one arc.
- If multiple videos are loaded or the page is in a background tab, all three loops continue rendering.

**Improvement path:** 
- Use the Intersection Observer API to pause loops when elements are off-screen.
- This is listed in OPTIMIZATION-BACKLOG.md #20 as a real perf win but deferred.

**Current impact:** Minimal on modern devices; noticeable on older phones or when many tabs are open.

---

## Fragile Areas

### Training and validation in train_head.py relies on matching file stems

**Files:** `train_head.py:110–143`

**Why fragile:** 
- The script matches videos by assuming `preds_<id>.npy`, `arc_<id>.csv`, and `human_arc_<id>.csv` all share the same `<id>` stem.
- If a file is renamed or missing, the video is silently skipped with no error.
- The matching is implicit (filenames) rather than explicit (a metadata table).

**Safe modification:** 
- Add a pre-flight check: glob each pattern, extract stems, find the intersection, and warn if any videos are missing files.
- Example:
  ```python
  pred_ids = {stem_id(p) for p in glob.glob(...)}
  arc_ids = {stem_id(a) for a in glob.glob(...)}
  missing = pred_ids - arc_ids
  if missing:
      print(f"Warning: preds exist but arcs missing for {missing}")
  ```
- Log the matched count to stdout so users verify coverage.

**Test coverage:** Only synthetic data (3 videos); needs a real run with >10 videos to stress-test matching.

---

### Noise ceiling generalizes across annotator counts

**Issue:** `leave_one_annotator_out_ceiling` in `honest_corr_timeseries.py:242–256` is shape-agnostic: it derives the annotator count `A` from `annos.shape` and loops `range(A)`. It does **not** hardcode or assume 20 annotators — 20 is only TVSum's typical count. (An earlier draft of this doc claimed a hardcoded 20; that was wrong.)

**Files:** `honest_corr_timeseries.py:242–256`

**Why still worth watching:** 
- The mechanics generalize to any `A ≥ 2`, but the *interpretation* of the ceiling (inter-annotator agreement) shifts with `A`, so ceilings from datasets with very different annotator counts aren't directly comparable.
- The loop handles any matrix shape, but there is no explicit `A ≥ 2` guard.

**Safe modification:** 
- Assert `annos.shape[0] >= 2` before the loop, and note in the docstring that the ceiling's meaning depends on `A`.

**Test coverage:** Synthetic data uses the same 20-annotator format; real LIRIS data not yet tested.

---

### affect_extract.py masks must match preds space exactly

**Issue:** `valence_arousal` in `affect_extract.py:65–84` guards the mask/preds space match with an explicit `if ...: raise ValueError(...)` (not a bare `assert`). The error already reports the **detected** space via `space_name(n_units)` and gives the exact `--n-units` rebuild command.

**Files:** `affect_extract.py:65–84`

**Why fragile:** 
- If a user builds masks for fsaverage5 (20484) but runs preds in Schaefer-1000 (1000), the function refuses to run — but it fails **loudly and helpfully**, naming the detected space and the rebuild command, so this is a guarded edge case, not a silent trap.
- The residual constraint is only that masks and preds must be built in the same space; there is no cross-space auto-conversion.

**Current implementation (already does this):** 
- The guard reports the detected space and the rebuild command:
  ```python
  if vm.shape[0] != n_units or am.shape[0] != n_units:
      detected_space = space_name(n_units)  # e.g., "fsaverage5-surface"
      raise ValueError(
          f"mask length != n_units: preds are in {detected_space} "
          f"({n_units} units), but masks are {vm.shape[0]} and {am.shape[0]}. "
          f"Rebuild with: build_roi_mask.py --n-units {n_units}"
      )
  ```

**Test coverage:** Synthetic data uses one space (fsaverage5); no cross-space testing.

---

## Scaling Limits

### Circular-shift permutation p-value computation is stateless and O(M)

**Current capacity:** 
- 1000 shifts enumerated / 5000 sampled → ~1–2 seconds per video.
- 20 videos → ~20–40 seconds total for the full test.

**Limit:** 
- If validation is on 100+ videos, total runtime approaches minutes.
- The Stouffer aggregation is O(n_videos), not a bottleneck.

**Scaling path:** 
- Parallelize across videos (each video's test is independent).
- Cache computations if the same video is tested multiple times.
- Switch to parametric null (normal approx) for >500-point videos after validating equivalence.

---

### Demo JSON schema is rigid; no versioning

**Issue:** `arc.json` generated by `batch_extract.py:136–159` has no version field.

**Files:** `batch_extract.py:136–159`, `demo/app.js:79–87`

**Current capacity:** 
- One schema version in production.
- Adding a new field (e.g., `model_version`) requires changing both generator and consumer.

**Limit:** 
- If the schema changes (e.g., new `coarse_states` format), old arc.json files break in the demo.
- No backward compatibility strategy.

**Scaling path:** 
- Add a `schema_version: "1.0"` field to arc.json.
- In the demo, add a migration layer that upgrades old schemas to the current version.
- Document the schema in a `.schema.json` file.

---

## Dependencies at Risk

### Meta TRIBE weights are public but pinned to facebook/tribev2

**Risk:** 
- The model checkpoint is public, not proprietary.
- If Meta deprecates or removes the checkpoint, the project cannot run new extractions.

**Impact:** 
- No competitive moat from the encoder (documented in `CLAUDE.md` and `STRATEGY-PROPRIETARY-MODEL.md`).
- Moat is validation + product + customer data, not the model.

**Migration plan:** 
- Monitor the Hugging Face model hub for deprecation notices.
- If removed, maintain a mirror copy of the weights in a private S3 bucket.
- Document the fallback path in `PIPELINE.md`.

---

### Neuralset + tribev2 events API is undocumented

**Risk:** 
- `batch_extract.py:49–70` uses `neuralset.events.transforms` to build event dataframes.
- If the API changes, the GPU extraction breaks.

**Current mitigation:** 
- The working Colab notebook (`colab_run.ipynb`) has a working example; refer to it.

**Migration plan:** 
- Add unit tests for event-building on a small clip.
- Document the exact API surface (input df shape, output event types).
- Pin neuralset version in a separate GPU requirements file.

---

## Missing Critical Features

### No real-time progress tracking for GPU batch_extract

**Problem:** 
- `batch_extract.py` is run on a rented A100 box with a long-running loop over 10–20 videos.
- If the SSH session drops, there's no way to resume from the last video or check progress.
- Users must re-run from scratch or manually inspect the output folder.

**Blocks:** 
- Large-scale validation (50+ videos).

**Improvement path:** 
- Add a checkpoint file (`extraction_checkpoint.json`) that tracks completed video IDs.
- On startup, load the checkpoint and skip already-extracted videos.
- Write progress to a log file, not just stdout.

---

### No live upload + analysis pipeline

**Problem:** 
- The demo renders **precomputed** arc.json files; an uploaded video is now captured but not yet analyzed, so there is still no automated "upload video → run pipeline → get result" path.
- **(Outdated — corrected)** The upload *capture* flow is fully implemented: `initUpload` validates the file (≤150 MB) + email, then `uploadVideo()` uploads to the private Supabase `uploads` bucket and records an intake row. The old "incomplete handler / future hook" concern no longer holds; what remains missing is the **server-side analysis** that turns an uploaded video into a result arc.

**Blocks:** 
- Product MVP (upload a video, get instant analysis).

**Improvement path:** 
- Implement a server-side pipeline (e.g., Python backend on Vercel Functions or AWS Lambda).
- Queue uploads to a job runner (e.g., Celery + Redis, or AWS SQS).
- Call `batch_extract.py` → `run_pipeline.py` asynchronously.
- Notify the user via email or Supabase real-time subscription when results are ready.

---

### No A/B testing or comparison UI

**Problem:** 
- The demo has a "compare cuts" panel (visible in `demo/index.html`) but no actual implementation.
- Users cannot load two arcs and see a side-by-side diff.

**Blocks:** 
- Advanced product feature.

---

## Test Coverage Gaps

### Only synthetic tests; no validation on real data

**What's not tested:** 
- GPU inference (`batch_extract.py`) — only runs on rented hardware.
- Real TVSum data pipeline — tested only on synthetic fixtures (3 videos).
- Live Supabase integration — no e2e test of waitlist/upload flow.

**Files:** Tests concentrated in `tests/dry_run.py` and `tests/make_synthetic_data.py`

**Risk:** 
- Real GPU run could fail silently (e.g., preds are NaN, arc.json schema mismatch).
- The synthetic test detects planted signals but not real-world edge cases (e.g., very short clips, silent videos, no foreground motion).

**Priority:** **High**. Before the YC demo, run the pipeline on ≥3 real TVSum clips and verify:
- `batch_extract.py` completes without errors.
- `honest_corr_timeseries.py` produces valid results.
- The demo renders the arc correctly.

---

### No regression tests for output format changes

**What's not tested:** 
- Changes to arc.csv, arc.json, or results.csv format.
- If a script accidentally swaps column order or renames a field, the downstream pipeline silently breaks.

**Files:** No integration tests linking output format to downstream consumers.

**Improvement path:** 
- Add a format-validation script that checks:
  - arc.csv has exactly columns: `t_sec, global_mag, [roi_mag]`.
  - arc.json has required keys: `video_id, duration_sec, timestamps, activation`.
  - results.csv has required keys: `video, feature, n, r, p, p_param`.
- Run this validator in the pipeline after each generator script.

---

### No accessibility (a11y) testing

**What's not tested:** 
- Keyboard navigation in the demo (play/pause/seek).
- Screen reader compatibility (the brain SVG is decorative; the console must be navigable).
- Color contrast on the three lanes + badges.

**Files:** `demo/index.html`, `demo/app.js`, `demo/styles.css`

**Improvement path:** 
- Add aria-labels to buttons and scrubber.
- Test with NVDA (Windows) or VoiceOver (Mac).
- Run a contrast checker on the color palette.
- This is OPTIMIZATION-BACKLOG.md #21 (deferred).

---

### No performance benchmarks

**What's not tested:** 
- Demo rendering time on a 30-second video (3 lanes, 30 points each).
- Circular-shift permutation time as a function of video length.
- Memory usage of `batch_extract.py` on a 60-second clip.

**Improvement path:** 
- Add a `--bench` mode to pipeline scripts that prints timing summaries.
- Track performance over time (e.g., a CI job that runs on every commit).

---

## Statistical / Methodological Concerns

### Multiple comparisons without family-wise correction (OPTIMIZATION-BACKLOG #10)

**Issue:** 
The pipeline runs ~5 independent tests:
1. Attention (primary): `roi` feature.
2. Attention (baseline): `global` feature.
3. Incremental validity: brain beats ffmpeg.
4. Affect valence: proxy vs LIRIS.
5. Affect arousal: proxy vs LIRIS.

With α = 0.05 per test, the family-wise Type I error is ~23% (probability that at least one returns false positive). `PREREGISTRATION.md` **does** define a primary test (the circular-shift null on the TVSum-mean arc, aggregated by signed Stouffer); what it currently lacks is an explicit multiple-comparisons correction across the secondary tests. (The prereg is being updated to designate `roi` as the single confirmatory test, with `global` as a contrast baseline rather than a co-equal test.)

**Files:** `honest_corr_timeseries.py`, `incremental_validity.py`, `affect_validate.py`, `PREREGISTRATION.md`

**Current mitigation:** 
- The demo and reports correctly label each test's p-value.
- No "wins" are claimed without explicit p < α on each test.
- OPTIMIZATION-BACKLOG.md #10 flags this as a pre-registration decision.

**Fix approach:** 
- Update `PREREGISTRATION.md` to designate the `roi` attention test as primary.
- Apply Holm-Bonferroni correction (sequential α levels) to the secondary tests.
- Or, declare all tests exploratory and adjust interpretation accordingly.

---

### Effect-size floor inconsistency (OPTIMIZATION-BACKLOG #9)

**Issue:** The floor exists, but its *value* is inconsistent across tools:
- `publish_results.py:146` null-stamps at `abs(median_r) < 0.05`.
- `incremental_validity.py` **does** apply an effect-size floor (`abs(partial_r) > 0.1`) — it is not p-value-only.
- `train_head.py` uses no hard floor, only the p-value.

So the real problem is a threshold **mismatch** (the 0.05 null-stamp in `publish_results` vs. the 0.1 floor used elsewhere), not a missing floor. (It is being unified at 0.10.)

**Files:** `publish_results.py:146`, `train_head.py`, `incremental_validity.py`

**Impact:** 
- A result could have p < 0.05 but r = 0.03 and still be called "signal" in some tools but "null" in others.
- Inconsistency makes results hard to interpret.

**Fix approach:** 
- Unify on a single effect-size floor of **r > 0.10** in `PREREGISTRATION.md` (the value `incremental_validity.py` already uses) and apply it in `publish_results.py` too.
- Apply it consistently across all test outputs.
- Or, report effect size as a fraction of the noise ceiling (OPTIMIZATION-BACKLOG.md #6).

---

### Noise ceiling mismatch between model and human (OPTIMIZATION-BACKLOG #6)

**Issue:** 
- The model is scored against the **20-annotator mean** (lower noise, easier target) in `test_one_video` / `circular_shift_p` (~`honest_corr_timeseries.py:290`). (Line 255 is a *different* step: it computes the leave-one-annotator-out noise ceiling — each annotator vs. the mean of the others.)
- The noise ceiling (`leave_one_annotator_out_ceiling`) measures inter-annotator agreement, not the ceiling relative to the mean.
- As a result, r / ceiling can exceed 1.0, which is counterintuitive.

**Files:** `honest_corr_timeseries.py:242–256` (LOAO ceiling); model-vs-mean scoring at `~290`

**Current mitigation:** 
- The CLAUDE.md docstring clarifies this: "r/ceiling CAN exceed 1 — interpret it, don't treat it as a cap the model can't beat."
- The false "cannot beat ceiling" claim was removed from docstrings.

**Fix approach:** 
- Redesign the ceiling as split-half (odd vs even annotators), which measures the noise floor for predicting the mean.
- Or, score the model against the **individual annotators**, not the mean, which makes the ceiling interpretation tighter.
- This is a pre-registration decision noted in OPTIMIZATION-BACKLOG.md #6.

---

## Documentation Gaps

### No API documentation for internal modules

**Issue:** 
- `honest_corr_timeseries.py` is actually well documented: it has a detailed module docstring **and** function-level docstrings on `circular_shift_p`, `effective_n`, `leave_one_annotator_out_ceiling`, etc. Only the tiny helpers `pearson` and `_norm_cdf` lack them. (An earlier draft claimed the main functions had no docstrings — that was wrong.)
- `batch_extract.py` functions, however, still lack parameter documentation (no NumPy/SciPy style docstrings).

**Files:** `honest_corr_timeseries.py`, `batch_extract.py`, `train_head.py`

**Impact:** 
- Onboarding new contributors is slow; they must read the whole file to understand data shapes.
- Refactoring is risky because the contract is implicit.

**Fix approach:** 
- Bring the few remaining undocumented items (`pearson`, `_norm_cdf`, and `batch_extract.py`'s functions) up to the NumPy-style docstring already used by `circular_shift_p`:
  ```python
  def circular_shift_p(x, y, n_perm=5000, min_shift=3, seed=0):
      """
      Compute two-sided p under a circular-shift null.
      
      Parameters
      ----------
      x, y : array_like
          1-D arrays, already first-differenced.
      n_perm : int, optional
          Number of shifts to sample.
      
      Returns
      -------
      p : float
          Two-sided p-value.
      r_obs : float
          Observed Spearman correlation.
      n : int
          Number of samples used.
      """
  ```

---

## Configuration and Reproducibility

### Seed handling is inconsistent

**Issue:** 
- `circular_shift_p` defines `seed=0` as a default in its signature (`honest_corr_timeseries.py:144`); line 171 only *consumes* it via `np.random.default_rng(seed)`. The seed is explicit and overridable, so this path is reproducible.
- `tests/dry_run.py` does not set a seed for matplotlib or numpy, so forest plots may differ across runs.

**Files:** `honest_corr_timeseries.py:144`, `tests/dry_run.py`

**Impact:** 
- Results are reproducible only if all calls use the same seed.
- Different machines or numpy versions may produce slightly different results.

**Fix approach:** 
- Accept `--seed` argument in all scripts and pass it through to RNG calls.
- Document the seeding strategy in `PREREGISTRATION.md`.
- In tests, set `np.random.seed()` and `matplotlib.seed()` at startup.

---

## Platform / Deployment Concerns

### Supabase schema not version-controlled

**Issue:** 
The Supabase schema and RLS policies are documented in `supabase/schema.sql` but are not enforced by a migration system. Deploying changes requires manual SQL execution.

**Files:** `supabase/schema.sql` (assumed to exist; not fully read)

**Impact:** 
- Difficult to replicate the schema in a dev/staging environment.
- No audit trail of schema changes.
- High risk of human error (typo in RLS policy).

**Fix approach:** 
- Use Supabase's migration system (e.g., `supabase migration new <name>`) to track schema changes.
- Document the setup process in `supabase/README.md`.

---

### Demo is static HTML; no build step limits extensibility

**Issue:** 
The demo is intentionally a static site (no build, no CDN). This is a feature for honesty (all code is vendored and visible) but limits extensibility.

**Files:** `demo/index.html`, `demo/app.js`, `demo/supabase.js`

**Impact:** 
- Cannot use modern JavaScript features (async/await, modules, bundling) without adding a build step.
- Some near-duplicate logic across the vendored files (e.g., `fireColor` is defined **only** in `demo/app.js`; `demo/scrollbrain.js` carries an independent, similar-but-not-identical bloom-color routine — not a true copy). `fireColor` is **not** duplicated into `styles.css`.

**Fix approach:** 
- Keep the static HTML approach but:
  - Use `<script type="module">` for ES6 imports.
  - Add a simple esbuild or Parcel build step (single-line command) if modules become necessary.
- Or, document the trade-off explicitly: "No build step = all code visible; accept code duplication as the cost."

---

## Summary by Priority

**High Priority (blocks YC milestone or user trust):**
1. Hardcoded Makefile paths — breaks team portability.
2. Weak-spot detector needs its falsifiable redesign — the current within-clip percentile flag covers ≤25% (varies by video) and isn't self-falsifiable; a MAD-baseline deviation flag is in progress.
3. No real data validation yet — synthetic tests pass, but GPU run untested.

**Medium Priority (technical debt, not urgent):**
1. Bare exception handling in batch_extract.py.
2. Numpy version cap on <2.1 — future-proofs against library updates.
3. Magic numbers scattered across code — maintainability issue.
4. Multiple comparisons without family-wise correction — statistical honesty.

**Low Priority (polish, deferred):**
1. Demo RAF loop throttling.
2. Accessibility testing.
3. Performance benchmarking.
4. Schema versioning for arc.json.

---

*Concerns audit: 2026-07-18*
