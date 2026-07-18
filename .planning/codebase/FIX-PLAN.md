# Soma — Concern Remediation Plan

**Date:** 2026-07-18 · **Deadline anchor:** YC application Mon Jul 27, 2026, 8pm PT (9 days out)

Derived from `CONCERNS.md` after every claim was verified against the real source
(17/31 accurate, 14 needed correction) and each surviving concern was given a
concrete fix design. Priority bar: a fix is **before-yc** only if it materially
helps land the YC application — i.e. it de-risks the real-data validation run,
protects demo honesty/credibility, or closes a diligence/security risk.
Everything else is **post-yc**. Two concerns are **won't-fix** (already correct).

**Effort:** S < 1h · M a few hrs · L a day+. All designed fixes are **low risk**
except the real GPU run (med).

---

## Critical path

The one YC-critical gap is **F-REAL-RUN**: every honesty claim in the deck
currently rests on synthetic-only tests. The other 9 before-yc items exist to
lock the science *before* that run and de-risk it. Recommended sequencing:

```
Wave 0 — LOCK THE SCIENCE (must precede the GPU run; ~1–2h, pure docs+2 lines)
    F-PREREG-PRIMARY-MCC   designate roi primary, global contrast, rest exploratory
    F-EFFECT-FLOOR         pre-register one |r|>=0.10 floor, sync the 2 code sites

Wave 1 — HARDEN THE BATCH (buildable now on synthetic; ~half day)
    F-BATCH-RESUME + F-BATCH-ERRLOG   (land together — same file/loop)
    F-HEAD-PREFLIGHT                  coverage visibility (the "n of how many?" number)
    F-NEURALSET-PIN                   scaffold requirements-gpu.txt + events smoke test

Wave 2 — DEMO HONESTY (independent of the run; parallelizable; ~1–2h)
    F-WEAKSPOT-FALSIFIABLE   kill the "bottom 25% of every clip" circularity
    F-ARC-SCHEMA-VALIDATE    stop a bad live/uploaded arc rendering a wrong curve
    F-CSP-HARDEN             Vercel CSP + rotation policy + fix stale C8b note

Wave 3 — THE RUN
    F-REAL-RUN               GPU-extract >=3 TVSum clips -> honest_corr -> demo
    (fold F-FORMAT-CONTRACT in here — you're touching the demo path anyway)
```

Fill the pinned tribev2 commit SHA (F-NEURALSET-PIN) and snapshot `./cache` for
the weight mirror (F-TRIBE-MIRROR) *during* the first GPU session at ~zero cost.

---

## Before-YC (10)

### F-REAL-RUN — Execute the first real-data validation run · L · med risk
**Concern:** C9a (synthetic-only tests; nothing validated on real data).
**Why now:** THE whole-company question. Prep is already done in-repo
(`data/roi_mask_dmn.npy`, `data/ydata-tvsum50.mat`, 15 clips in
`data/clips_trimmed/`); the only missing step is GPU extraction. A null is still
a shippable, honest outcome.
**Runbook (not a code diff):**
0. Preflight fail-fast: assert mask dtype bool shape (20484,), sum>0; `tvsum_prep.py` parses the .mat; clips present.
1. GPU-extract ≥3 clips — free Colab T4 via `colab_run.ipynb` (Cell 1→restart→2B→3→4→5) or rented A100 via `batch_extract.py --video-dir data/clips_trimmed --out data/arcs --roi-mask data/roi_mask_dmn.npy`.
2. **Scale gate** (#1 de-risk): confirm preds are z-scored signed BOLD (frac<0 ~40–60%, not bounded [0,1]); run `check_preds_space.py` to confirm fsaverage5 (20484) vs Schaefer-1000.
3. CPU chain: `make ingest ZIP=...` → `tvsum_prep` + `run_pipeline` (honest_corr + incremental + affect + report).
4. Verdict by `PREREGISTRATION.md` rule: `roi` survives circular-shift null (Stouffer p<0.05, consistent sign) **while** `global` is null.
5. Demo render: `make ingest ... DEMO=1` (or publish the honest null), drop one `arc_*.json` into `demo/arcs/`, verify the real arc draws and the badge stays honest.
6. Report `global` (expected null baseline) and whatever `roi` returns — never switch the pre-registered feature after seeing r.
**Deps:** GPU (Colab free or A100). No other fix blocks it, but Waves 0–2 should land first.

### F-PREREG-PRIMARY-MCC — Primary test + multiple-comparisons clause · S
**Concern:** C6c (prereg names a primary test but no MCC across global+roi).
**Fix:** In `PREREGISTRATION.md`, add a "Confirmatory family" section: **roi**'s
combined signed-Stouffer p is the single confirmatory test (α=0.05, no correction
needed); **global** is a pre-specified *contrast* baseline (expected null, not an
independent shot); everything else (Fisher omnibus, effective-N p, affect,
incremental) is exploratory; Holm-Bonferroni only if the confirmatory family ever
grows. Formalizes the doc's existing framing. **Must precede the GPU run.**
**Deps:** bundle with F-EFFECT-FLOOR in one prereg edit.

### F-EFFECT-FLOOR — One pre-registered effect-size floor · S
**Concern:** C6d (floors inconsistent in *value*: `publish_results.py:146` uses
`abs(median_r)<0.05`; incremental + `publish_results.py:91` use `abs(r)>0.1`).
**Fix:** Lock `|median r| >= 0.10` in `PREREGISTRATION.md`; change
`publish_results.py:146` `0.05→0.10` (stricter/more honest); define
`MIN_EFFECT_R=0.10` once in `honest_corr_timeseries.py` and reference at
`publish_results.py:91,146` + `incremental_validity.py:152,158,167`. **Must
precede the GPU run.** Resolves OPTIMIZATION-BACKLOG #9.

### F-BATCH-RESUME — Checkpoint + progress log for the GPU batch · M
**Concern:** no resume/progress tracking (CONCERNS "no real-time progress").
**Fix:** `batch_extract.py` — add `extraction_checkpoint.json` (atomic
tmp+os.replace ledger of completed vids) + `extraction_progress.log`; skip
already-done vids (`--force` to override); `_mark_done` **only after**
`write_demo_json` succeeds so a preds-written-but-json-failed clip retries.
Buildable/testable now on synthetic preds. **Deps:** land with F-BATCH-ERRLOG.

### F-BATCH-ERRLOG — Traceback log + re-raise fatal errors · S
**Concern:** C2a (`except Exception` at :245 prints only `{e!r}`, swallows
MemoryError/disk-full → burns the rest of a paid A100 batch).
**Fix:** split the handler — `MemoryError`→raise, `OSError` ENOSPC→raise, else
log full `traceback.format_exc()` to `extraction_errors.log` and continue. Keeps
batch resilience, makes 2am failures debuggable. **Deps:** land with F-BATCH-RESUME.

### F-HEAD-PREFLIGHT — Coverage report for train_head · S
**Concern:** C5b (`video_data()` silently drops a video when any of
preds_/arc_/human_arc_ is missing → the headline **n** shrinks invisibly).
**Fix:** `train_head.py` — `preflight_coverage()` prints matched counts and names
every dropped id + reason; add one-line reasons to the 3 silent `return None`.
Directly serves interview-killer #1 ("n of how many?").

### F-NEURALSET-PIN — Pin the GPU stack + events smoke test · M
**Concern:** C2e (`build_events` at :49-70 uses undocumented
`neuralset.events.transforms`, pulled transitively from tribev2 `main` — a silent
upstream change kills extraction mid-batch).
**Fix:** new `requirements-gpu.txt` pinning `tribev2 @ <commit-sha>` (not main) +
resolved `neuralset` from `pip freeze` on first install; `tests/test_build_events.py`
GPU-free smoke test on a 5s silent mp4 (`pytest.importorskip('neuralset')`);
document the event df/shape contract. **Deps:** commit SHA filled from first GPU session.

### F-WEAKSPOT-FALSIFIABLE — Make weak-spot detection falsifiable · S
**Concern:** C2b (`detect_weak_spots` flags the bottom 25th percentile of *every*
clip by construction — a reviewer's one-question kill: "isn't this just the
lowest 25%?").
**Fix:** `batch_extract.py:105-133` — replace `drop_pctl=25` with a robust
deviation flag: `med=median(sm)`, `mad=1.4826*MAD`, flag `z<=-n_std` (default
~1.25); a flat/steady arc now returns **zero** dips. Keep the 3s min-run filter
and the "predicted dip (hypothesis)" label. `tests/dry_run.py:61` still passes.

### F-ARC-SCHEMA-VALIDATE — schema_version + arc shape check · S
**Concern:** C2d + C7b (arc.json has no version; `loadArc` at app.js:78-87 does no
shape check — a live/uploaded arc with `timestamps.length != activation.length`
silently renders a **wrong** curve, violating the honesty rule).
**Fix:** generator (`batch_extract.py` write_demo_json) stamps
`schema_version:"1.0"`; demo adds `validateArc()` (required keys + equal
timestamps/activation length) → graceful "invalid arc" bail instead of a garbled
or silently-wrong canvas. schema_version advisory so the 3 shipped sample arcs
keep loading. Matters because the live upload/concierge path is the one dynamic
surface a reviewer might exercise.

### F-CSP-HARDEN — Vercel security headers + rotation policy + fix C8b · S
**Concern:** C7a/C8b (public anon key — safe under RLS, but no CSP; and the
CONCERNS C8b note is stale).
**Fix:** new `demo/vercel.json` with CSP (`script-src 'self' 'unsafe-inline'`
because index.html ships inline IIFEs; pin the exact Supabase origin in
connect-src/media-src or uploads break) + `object-src 'none'`, `frame-ancestors
'none'`, nosniff, Referrer-Policy, Permissions-Policy; document anon-key rotation
cadence (rotate on team departure — Imran just left); add a `grep` guard that no
`service_role`/`sb_secret_` ships in `demo/`; rewrite the stale C8b note to the
real 4-policy posture. **Smoke-test the demo after deploy** (a mis-scoped CSP is
the one way this breaks).

---

## Post-YC backlog (14)

Grouped; all low-risk. None gate the application.

**Build / config**
- **F-MAKE-PORTABLE** (S) · C1a — derive `Makefile` ROOT from the makefile dir; `PY ?=` overridable (keep space-escaping — the path has a literal space and recipes are unquoted). Not a diligence surface; the critical GPU run happens on Colab/A100, not these targets.
- **F-NUMPY-DOC** (S) · C1b — expand the `numpy<2.1` pin comment with the exact TRIBE/neuralset trigger version + removal runway. Keep the pin (real ABI constraint, not a bug).
- **F-CONSTANTS** (M) · C4a — hoist pre-registered magic numbers into documented module-level constants (values byte-identical; `make test` guards drift). `train_head.py:55 ALPHAS` already satisfies this.

**Pipeline robustness**
- **F-CSV-STDLIB** (S) · C3b — swap `_read_csv`'s `.split(',')` (honest_corr_timeseries.py:340,343) for the stdlib `csv` module + optional column check; hardens all 7 importers at once. Near-zero impact today (all CSVs are machine-generated numeric).
- **F-DRYRUN-SEED / F-SEED-DRYRUN** (S) · C9b — *[the two designers produced the same fix; merge]* seed `tests/dry_run.py` (`np.random.seed(0)`, `PYTHONHASHSEED=0` in subprocess env, explicit `--seed 0` on train_head calls) and make it hermetic (auto-generate synth if MANIFEST absent). Pipeline is already deterministic in practice; this is belt-and-suspenders.

**Methodology / stats**
- **F-SPLITHALF-CEILING** (M) · OPT-BACKLOG #6 — add an optional split-half (Spearman-Brown) ceiling so `r/ceiling` is bounded ≤1 and reads as "fraction of achievable signal"; keep LOAO as the pre-registered primary. Only meaningful with real 20-annotator data.
- **F-CSV-ATTRIB** (S) · C6b — doc-correction: the naive `.split(',')` lives in `honest_corr_timeseries.py`, not `incremental_validity.py`; no code change warranted.

**Demo frontend**
- **F-RAF-GATE-OFFSCREEN** (M) · C7c/C7d — pause rAF loops off-screen (IntersectionObserver for the in-flow console; Page Visibility API for the fixed backgrounds). brain3d.js already IO-gated; add a hidden-tab guard. Pure battery/CPU (OPT-BACKLOG #20).
- **F-A11Y-CANVAS-ALT** (S) · a11y — `role="img"`+aria-label on the 5 data canvases, `aria-hidden` on the decorative brain SVG, scrubber `aria-valuetext`. Keyboard nav + focus rings already exist. Cheapest subset (~15 min HTML) can ride along with F-ARC-SCHEMA-VALIDATE.

**Infra / testing**
- **F-SCHEMA-CHANGELOG** (S) · C8a — formalize the idempotent paste-schema.sql flow + a README changelog. **Explicitly skip** Supabase CLI migrations (Docker/toolchain rabbit hole not worth it for one project, 3 people, 9 days).
- **F-TRIBE-MIRROR** (S) · dependencies-at-risk — mirror the tribev2 checkpoint (tar `./cache`) + fork the code to a private repo; document `HF_HUB_OFFLINE=1` fallback in PIPELINE.md. Snapshot `./cache` for free during the first GPU run.
- **F-FORMAT-CONTRACT** (S) · output-format-regression — `tests/check_formats.py` pinning arc.csv / arc.json / results.csv column contracts, wired into `make test` and `run_pipeline.py`. Fold into the F-REAL-RUN demo pass.
- **F-BENCH** (S) · perf-benchmarks — optional `--bench` on `honest_corr_timeseries.py` timing the permutation harness vs series length. No observed bottleneck at YC scale; speculative.

---

## Won't-fix (2)

- **F-PALETTE-ACCEPT** · C7f — `fireColor` (app.js) and the scrollbrain bloom are two *intentionally-different* decorative palettes in separate no-bundler IIFEs; a shared constant adds coupling for no benefit. **The CONCERNS claim they're "duplicated in styles.css" is false** — only the doc-correction is worth doing.
- **F-STATIC-DEMO-ACCEPT** · static-demo-no-build — the no-build, all-vendored demo is a deliberate honesty feature (ES modules already work via native importmap — the "modules need esbuild" premise is wrong). Adding a bundler 9 days out would be a net negative and complicate the CSP. Only action: a 4-line "why no build step" note.

---

## CONCERNS.md doc corrections (ready to apply)

The document itself needs edits so it stays trustworthy as reference material.
Exact replacement wording is captured from the audit; batch them in one pass:

- **Delete** the "Makefile help text is outdated" section (C1c / F-DELETE-C1C) — false.
- **Rewrite** the C8b RLS wording to the 4-policy posture (folded into F-CSP-HARDEN).
- **Fix** C7f — "two independent JS palettes, no CSS duplication" (F-PALETTE-ACCEPT).
- **Re-attribute** C6b — `.split(',')` is in honest_corr_timeseries.py (F-CSV-ATTRIB).
- Plus the 11 other audit corrections (wrong line numbers / fabrications / misleading
  characterizations): C2b, C3a, C3c, C3d, C3e, C4b, C5c, C6c, C6d — see the audit
  findings. Net: the doc is directionally right but ~45% of its *specifics* need a touch-up.

---

*Fix map generated 2026-07-18. 27 fixes: 10 before-yc, 14 post-yc (1 dup merged), 2 won't-fix.*
