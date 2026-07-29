# Testing Patterns

**Analysis Date:** 2026-07-28

## Test Framework

**Runner:**
- pytest (Python testing framework)
- No JavaScript/TypeScript test framework in current setup (no Jest, Vitest, or Mocha config)
- Tests are Python-only

**Run Commands:**
```bash
npm run test                    # Run all pytest tests (.venv/bin/python -m pytest -q)
.venv/bin/python -m pytest     # Manual pytest run with verbose output
.venv/bin/python -m pytest -q  # Quiet mode (used in verify gate)
```

**Configuration:**
- pytest discovered automatically via setuptools conventions
- No `pytest.ini` or `pyproject.toml` pytest section found
- Python version: 3.x (venv-based)
- Virtual environment: `.venv/` directory (local-only, gitignored)

## Test File Organization

**Location:**
- Test files are co-located at project root level (not in a separate `tests/` directory)
- Test data and fixtures are in local-only directories (gitignored): `tests/`, `data/`, `cloud/`
- Test files are importable as modules (can be run standalone with `python file.py`)

**Naming:**
- Python test files: `test_*.py` pattern (e.g., `test_honest_corr.py`, `test_head_io.py`)
- Analysis/validation scripts: `*_test.py` pattern (e.g., `head_null_test.py` — RIGOROUS leakage check)
- Shell scripts: `scripts/*.sh` for orchestration (e.g., `scripts/verify.sh`)

**File Count:**
```
test_honest_corr.py           # Stats/alignment core (5 tests)
test_head_io.py               # Head file contract (4+ tests)
test_train_head.py            # Model training logic
test_head_apply.py            # Model inference
test_head_badge.py            # Badge/score computation
test_affect_head.py           # Affect-specific training
test_meta_ads.py              # Ad metadata parsing
test_edit_ops.py              # Edit operations
test_edit_io.py               # Edit I/O serialization
test_generate.py              # Generate pipeline
test_incremental_validity.py  # Partial correlation stats
test_build_roi_mask.py        # ROI mask construction
test_run_batch_gate.py        # Batch execution gating
test_run_batch_worker.py      # Batch worker logic
```

## Test Structure

**Suite Organization:**
```python
#!/usr/bin/env python3
"""
module_test.py — what this module tests.

Context: Why this module/contract and not something else.
Detailed prose explaining what properties/claims are being checked,
why they matter, and how the test constructs verify them.

Run: .venv/bin/python -m pytest -q
"""
import numpy as np
import pytest
import scipy.stats as st

import module_under_test as M
```

**Key Properties:**
- Module docstring includes CONTEXT (why these tests exist)
- Module docstring lists PROPERTIES being tested as bullet points
- USAGE section shows how to run the test
- Each test is focused on ONE property or invariant

**Patterns:**
- Setup via helper functions (local `_helper()` pattern)
- Teardown via context managers or explicit cleanup
- Inline fixtures rather than separate `conftest.py`
- No test class structure; bare functions with `test_` prefix

## Test Structure Details

**Example test from `test_honest_corr.py`:**
```python
def test_circular_shift_p_floor_is_one_over_the_shift_count():
    # n=20 with the default min_shift=3 admits shifts 3..17 — exactly M=15 of them.
    # Every shift of a perfectly correlated pair scores |r| below |r_obs|=1, so only
    # the +1 in the numerator survives and p lands exactly on the floor.
    x = np.arange(20.0)
    p, r, n = H.circular_shift_p(x, x)

    m_shifts = len(np.arange(H.DEFAULT_MIN_SHIFT, 20 - H.DEFAULT_MIN_SHIFT + 1))
    assert m_shifts == 15
    assert r == 1.0
    assert n == 20
    assert p == pytest.approx(1.0 / (m_shifts + 1))
```

**Comments above test:**
- Explain the SCENARIO (what setup is being tested)
- Explain the EXPECTED BEHAVIOR (what should happen)
- Explain the MATH or LOGIC if non-obvious

**Assertions:**
- Multiple assertions per test to verify different facets of one property
- Use `pytest.approx()` for floating-point comparisons
- Use `np.testing.assert_array_equal()` for numpy array comparisons
- Use `pytest.raises()` for exception testing

## Mocking

**Framework:** numpy, scipy, and pytest built-in fixtures only

**Patterns:**
```python
# Inline fixture generators
def _mask(n_verts=N_VERTS, step=7, offset=0):
    """A deterministic scattered boolean mask — stands in for an atlas ROI."""
    m = np.zeros(n_verts, bool)
    m[offset::step] = True
    return m

# Test-specific setup
def test_name():
    mask = _mask()
    result = function_under_test(mask)
    assert result == expected
```

**What to Mock:**
- Avoid mocking internal functions (test the real behavior)
- Mock external resources only if unavailable during test (e.g., network calls)
- Use synthetic data (numpy, scipy) for reproducible tests

**What NOT to Mock:**
- Core business logic (stats functions, model operations)
- Math functions and correlations (test the real implementation)
- File I/O in unit tests (or use temporary directories)

## Fixtures and Factories

**Test Data:**
```python
# Factory functions for test data
def _head_kwargs(masks, w=None):
    """A minimal but structurally valid save_head() call."""
    n_feat = 2 * len(masks) + 1
    return dict(
        kind="attention",
        w=np.arange(n_feat, dtype=float) / 10.0 if w is None else w,
        b=-0.25,
        alpha=3.0,
        masks=masks,
        baseline_col="roi_mag",
        shot_sec=2.0,
        stamp=dict(median_r=0.31, stouffer_p=0.004, n_videos=12,
                   leak_check="pass", dataset="TVSum"),
    )

# Usage in tests
def test_save_and_load_head():
    kwargs = _head_kwargs([mask1, mask2])
    saved = head_io.save_head(**kwargs)
    loaded = head_io.load_head(saved)
```

**Location:**
- Factories are defined at module level (top of test file after imports)
- Prefix with underscore: `_mask()`, `_head_kwargs()` to indicate they're test utilities

**Data Strategy:**
- Deterministic seeds for reproducibility (never bare `np.random`)
- Small data sizes for speed (20 samples instead of millions)
- Synthetic data is easier to reason about than loaded real data

## Coverage

**Requirements:** None enforced

**View Coverage:** Not configured in this codebase

**Gaps:**
- JavaScript/TypeScript: No unit tests (only smoke/E2E via Playwright)
- Some Python modules have extensive tests, others are untested
- Focus is on correctness-critical modules (stats, model operations, I/O contracts)

## Test Types

**Unit Tests:**
- Scope: Single function or tight module (one invariant per test)
- Approach: Direct function calls with synthetic data
- Examples: `test_circular_shift_p_*`, `test_pack_unpack_mask_*`, `test_resample_to_grid_*`
- Run: `pytest test_honest_corr.py::test_circular_shift_p_floor_is_one_over_the_shift_count`

**Integration Tests:**
- Scope: Multiple modules or file I/O contracts
- Approach: Test reading/writing files, combining modules
- Examples: `test_head_io.py` tests pack/unpack with file contract; `saliency_test.py` tests correlation + baseline
- Run: `pytest test_head_io.py`

**Validation/Analysis Scripts:**
- Scope: Full pipeline end-to-end (may take minutes)
- Approach: Load real or synthetic data, run analysis, report results
- Examples: `head_null_test.py` (empirical null via shuffling), `saliency_test.py` (cross-dataset validation)
- Run: `python head_null_test.py --preds-dir ... --arc-dir ... --human-dir ... --masks-dir ... --n-shuffles 30`
- Output: Printed report + optional CSV files

**Smoke Tests:**
- Scope: Build + Next.js server + browser
- Approach: Run `npx next start` and curl/Playwright basic pages
- Script: `scripts/smoke.mjs` (JavaScript Playwright tests)
- Run: `SMOKE_URL=http://localhost:3099 node scripts/smoke.mjs`
- Trigger: Part of `./scripts/verify.sh` (gate before commit)

## Common Patterns

**Async Testing:**
- No async tests in current pytest suite (all synchronous)
- If needed: use `pytest.mark.asyncio` or pytest-asyncio plugin

**Error/Exception Testing:**
```python
def test_unpack_mask_rejects_a_tampered_count():
    spec = head_io._pack_mask(_mask())
    spec["name"] = "dmn"
    spec["n_true"] += 1
    with pytest.raises(ValueError, match="corrupt head file"):
        head_io._unpack_mask(spec)
```

**Parametrized Testing:**
- Not heavily used in current tests (could be added for multiple scenarios)
- If used: `@pytest.mark.parametrize("input,expected", [...])`

**Floating-Point Assertions:**
```python
assert p == pytest.approx(1.0 / (m_shifts + 1))  # relative tolerance
assert p == pytest.approx(0.05, abs=1e-6)         # absolute tolerance
```

**Array Assertions:**
```python
np.testing.assert_array_equal(out, expected)
np.testing.assert_array_almost_equal(out, expected, decimal=5)
np.testing.assert_allclose(out, expected, rtol=1e-5)
```

## Verification Gate

**Script:** `./scripts/verify.sh`

**Steps (in order):**
1. **Build:** `npm run build` (with lock retry logic)
2. **Lint:** `npx eslint src` (scope to `src/` only)
3. **Python Tests:** `pytest -q` (if `test_*.py` files exist; skipped if none found)
4. **Demo Artifact Coherence:** `python tools/demo/check_coherence.py` (verify demo chart data is in sync)
5. **Smoke Tests:** `node scripts/smoke.mjs` (E2E via Playwright, optional if build failed)

**Exit Behavior:**
- Exit 0 = all gates pass (safe to commit)
- Exit 1 = any gate fails (reject the change)
- Smoke tests skip if build fails (no point testing against a broken server)
- Smoke tests skip with `SKIP_SMOKE=1` (build + lint + pytest only)

**Environment:**
- Runs in project root (via `git rev-parse --show-toplevel`)
- Port: default 3099 (configurable via `VERIFY_PORT`)
- Lock retry: waits 45s if `.next/lock` is held by another build

## Python Test Examples

**Property-based testing from `test_honest_corr.py`:**
```python
def test_circular_shift_p_ignores_the_seed_while_it_enumerates():
    x = np.arange(20.0)
    y = np.roll(x, 4) + 0.5 * np.arange(20.0)
    assert H.circular_shift_p(x, y, seed=0) == H.circular_shift_p(x, y, seed=987654321)
```
- Tests that deterministic enumeration doesn't depend on random seed
- Seeds should only affect the sampling branch

**Degenerate input handling from `test_honest_corr.py`:**
```python
def test_circular_shift_p_refuses_degenerate_input():
    # Too short to have an autocorrelation-preserving null at all.
    p, r, n = H.circular_shift_p(np.arange(7.0), np.arange(7.0))
    assert np.isnan(p) and n == 0

    # Flat series: r_obs is undefined, so no p may be reported for it.
    p, r, n = H.circular_shift_p(np.ones(20), np.arange(20.0))
    assert np.isnan(p) and np.isnan(r) and n == 0
```
- Test multiple degenerate cases in one function
- Return NaN (not 0) to signal the result is undefined

**Contract testing from `test_head_io.py`:**
```python
def test_pack_unpack_mask_is_lossless():
    m = _mask()
    spec = head_io._pack_mask(m)
    assert spec["length"] == N_VERTS
    assert spec["n_true"] == int(m.sum())
    np.testing.assert_array_equal(head_io._unpack_mask(spec), m)
```
- Test the round-trip contract: pack + unpack = original
- Verify metadata is correct

---

*Testing analysis: 2026-07-28*
