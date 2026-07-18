# Coding Conventions

**Analysis Date:** 2026-07-18

## Naming Patterns

**Files:**
- Python: `snake_case.py` (e.g., `honest_corr.py`, `batch_extract.py`, `build_roi_mask.py`)
- JavaScript: `camelCase.js` (e.g., `app.js`, `supabase.js`, `scrollbrain.js`)
- Test files: `make_synthetic_data.py`, `dry_run.py` (descriptive, plain names)
- HTML: descriptive (e.g., `index.html`, `pitch.html`, `waitlist.html`)

**Functions (Python):**
- Snake_case throughout (e.g., `pearson()`, `perm_p()`, `arc_from_preds()`, `detect_weak_spots()`)
- Private functions prefixed with `_` (e.g., `_rankdata()`, `_residualize()`, `_align()`)
- Pattern: verbs or descriptive nouns that indicate purpose

**Variables (Python):**
- Snake_case for all: `x`, `y`, `arc_t`, `global_mag`, `roi_mag`, `weak_spots`, `preds`
- Single-letter for loop/math variables is common: `i`, `j`, `n`, `p`, `k`, `T`, `V`
- Prefix with underscore for internal/temporary: `_ffmpeg_exe()`, `_read_csv()`

**Constants (Python):**
- UPPER_SNAKE_CASE (e.g., `V = 20484`, `FPS = 30`, `HERE = os.path.dirname()`, `ROOT = os.path.dirname()`)
- Container constants like `NODES = []`, `VIDEOS = [...]`, `DMN = slice(0, 2000)`

**Types (Python):**
- No inline type hints; type information lives in docstrings and comments
- Examples: `def pearson(x, y):` with comment `"""x: array-like, y: array-like"""` instead of `def pearson(x: np.ndarray, y: np.ndarray) -> float:`

**Functions (JavaScript):**
- CamelCase: `fireColor()`, `loadArc()`, `init()`, `bail()`
- Arrow functions common for single expressions
- Pattern: verbs describing action or state

**Variables (JavaScript):**
- CamelCase: `arc`, `duration`, `playing`, `timerBase`, `hasVideo`, `hasCoarse`
- Constants in UPPER_CASE: `VIDEOS`, `LADDER`, `NODES`, `PLAY_SVG`, `PAUSE_SVG`
- Elements often prefixed with purpose: `els.video`, `els.cAtt`, `els.playBtn`

## Code Style

**Formatting:**
- **No formatter configured.** Style is implicit across the codebase.
- **Line length:** ~78–100 characters observed (not strictly enforced)
- **Indentation:** 4 spaces (Python), 2–4 spaces (JavaScript)
- **Brackets:** 
  - Python: `func(arg1, arg2)` with space after commas
  - JavaScript: `const x = { key: "value" }` (space around object literals)

**Linting:**
- **No linter config files** (no `.flake8`, `.eslintrc`, `pyproject.toml` in repo root)
- **Pragmatic style:** Code prioritizes readability and domain clarity over strict linting
- **Exception handling:** Uses `except Exception` with `# noqa: BLE001` annotations to suppress linter warnings (seen in `batch_extract.py:245`)

## Import Organization (Python)

**Order:**
1. Shebang line: `#!/usr/bin/env python3`
2. Module docstring (detailed, 50–200 lines)
3. Standard library imports: `import os, sys, glob, argparse, subprocess`
4. Third-party imports: `import numpy as np`, `import pandas as pd`
5. Local imports: relative imports from project modules (e.g., `from honest_corr_timeseries import (...)`)

**Path Aliases:**
- No aliases detected (`~` not used for source trees)
- Paths are absolute or relative to project root using `os.path.dirname(__file__)`

**Heavy/Lazy Imports:**
- GPU-dependent imports deferred: `from tribev2.demo_utils import TribeModel` appears only when needed in `batch_extract.py:187`, after `# Heavy imports deferred so --help works without a GPU env.`
- SciPy imports delayed: `from scipy.io import savemat` in `make_synthetic_data.py:63` (inside function, not at module level)

## Error Handling

**Patterns:**
- **Try-except broad:** `except Exception` used liberally (e.g., `batch_extract.py:245`)
- **Graceful degradation:** One bad item doesn't kill the batch; errors logged and loop continues
  ```python
  try:
      # process item
  except Exception as e:
      print(f"[ERROR] {vid}: {e!r} - skipping, batch continues")
  ```
- **Silent failures with fallback:** Example in `baseline_extract.py:33–38`
  ```python
  def _ffmpeg_exe():
      try:
          import imageio_ffmpeg
          return imageio_ffmpeg.get_ffmpeg_exe()
      except Exception:
          return "ffmpeg"  # fallback to PATH
  ```
- **Exit on critical:** Use `sys.exit(message)` for user-facing errors (e.g., `honest_corr.py:69`)
- **SystemExit for pipeline failures:** `run_pipeline.py:51` raises `SystemExit` when a required stage fails

## Logging

**Framework:** `print()` statements only — no logging module

**Patterns:**
- Status messages: `print(f"[stage] description")` (e.g., `[load] TRIBE v2...`)
- Progress: `print(f"  [verb] {item}")` (e.g., `[predict] clip_id ...`, `[skip-cached] clip_id`)
- Warnings: `print(f"  ⚠  message")` (e.g., `honest_corr.py:103–104`)
- Metrics: `print(f"n = {n} videos matched.")`
- Errors: `print(f"  [ERROR] {item}: {error!r}")`
- Sections: `print(f"\n=== {label} ===")` (seen in `run_pipeline.py:42`)

**No structured logging, timestamps, or log levels** — messages are human-readable and sent to stdout.

## Comments

**When to Comment:**
- Explain **why**, not what: e.g., `# float32 halves disk/IO; z-scored BOLD needs no more precision` (seen in `batch_extract.py:223`)
- Non-obvious algorithmic choices: e.g., `# 1-based average rank` and `# 0.6 is ~0.6 SD above a vertex's session mean` (seen in `honest_corr_timeseries.py:89` and `batch_extract.py:27`)
- Design decisions and trade-offs: e.g., `# a real upsert (merge-duplicates)` in `publish_to_supabase.py:87`
- Critical guards: e.g., `# Guard the silent inner-join-to-nothing` (seen in `honest_corr.py:90`)
- Do NOT comment obvious code: `x = 5  # set x to 5` is avoided

**JSDoc/TSDoc:**
- **Minimal/none.** JavaScript functions have single-line or multi-line comments above them, not JSDoc tags
- Example from `demo/app.js`:
  ```javascript
  // ---- brain nodes (illustrative fire-blob viz tied to attention) ----
  // deterministic scatter (no Math.random needed at draw time)
  ```
- Python: Module-level docstrings are **very detailed** (100–200 lines), function-level vary:
  - Short functions: single-line docstring (e.g., `def pearson(x, y):` with 1-line description)
  - Complex functions: multi-line docstring with parameters, return, and algorithm notes

## Function Design

**Size:** ~10–60 lines typical; many are small helpers (5–15 lines)

**Parameters:** 
- Most functions: 2–5 parameters
- No keyword-only arguments or splat operators observed
- Defaults used sparingly: mostly required args with explicit paths/flags

**Return Values:** 
- Single returns common: scalar, tuple of 2–3 values, or None
- Example: `def loo_range(x, y): ... return float(...), float(...)` (two floats)
- Early returns for error conditions: `if np.isnan(r_obs): return np.nan, r_obs`

## Module Design

**Exports:**
- No explicit `__all__`; all functions at module level are public
- Private utilities use `_prefix` (e.g., `_rankdata()`, `_residualize()`)

**Barrel Files:**
- No barrel/index pattern observed; each script is self-contained
- Imports are selective: `from honest_corr_timeseries import (_read_csv, _rankdata, pearson, first_diff, ...)`

**Entry Point:**
- Scripts use `if __name__ == "__main__": main()` pattern (observed in all `.py` files)
- `main()` is always defined, processes args and orchestrates the pipeline

## Special Conventions

**Shebang & Executability:**
- All scripts start with `#!/usr/bin/env python3`
- Scripts are executable (seen in Makefile: `$(PY) $(ROOT)/batch_extract.py`)

**Argument Parsing:**
- Always use `argparse.ArgumentParser()` with `ap.add_argument()` calls
- Help text is detailed and multi-line when needed
- Choices specified for enums (e.g., `choices=["av", "trimodal", "video"]`)

**String Formatting:**
- f-strings everywhere: `f"{variable}..."` (modern Python 3.6+)
- Avoid `.format()` and `%` formatting

**Numpy/Pandas Usage:**
- Explicit type conversions: `np.asarray(x, float)`, `pd.read_csv(f)`, `np.save(path, arr)`
- Shape validation where critical: e.g., `if m.shape[0] != p.shape[1]: raise ValueError(...)`
- Broadcasting patterns common: `p[:, DMN] += (1.4 * L[:, None])`

---

*Convention analysis: 2026-07-18*
