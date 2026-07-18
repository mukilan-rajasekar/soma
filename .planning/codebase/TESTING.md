# Testing Patterns

**Analysis Date:** 2026-07-18

## Test Framework

**Runner:**
- **No pytest, unittest, or nose.** Custom harness using `subprocess` to invoke actual pipeline scripts
- **Script-based:** Tests are standalone Python scripts that run the real pipeline and assert outputs
- Execution: `python tests/dry_run.py` or via Makefile `make test` / `make dryrun`

**Test Files:**
- `tests/make_synthetic_data.py` — Fixture generator (creates synthetic inputs with planted signals)
- `tests/dry_run.py` — Main test harness (runs full pipeline and asserts correctness)
- `tests/synth/` — Generated fixture directory (created by make_synthetic_data.py)

**Run Commands:**
```bash
make synth        # Generate synthetic test fixtures
make dryrun       # Run full pipeline on fixtures; assert signal+null behavior
make test         # synth + dryrun (the complete smoke test)
make pipeline-demo  # Test whole analysis chain on synthetic fixtures with reporting
```

## Test File Organization

**Location:** Co-located in `tests/` directory alongside main scripts in project root

**Naming:** Descriptive, verb-form (e.g., `make_synthetic_data.py`, `dry_run.py`)

**Structure:**
```
tests/
├── make_synthetic_data.py    # Fixture generator
├── dry_run.py               # Main test harness
├── synth/                   # Generated fixtures (created at test time)
│   ├── preds_<id>.npy       # Fake TRIBE predictions
│   ├── arc_<id>.csv         # Arc features (global_mag, roi_mag)
│   ├── arc_<id>.json        # Demo-ready arcs
│   ├── human_arc_<id>.csv   # Synthetic human interest curves
│   ├── roi_dmn.npy          # ROI masks (boolean arrays, length 20484)
│   ├── roi_valence.npy
│   ├── roi_arousal.npy
│   ├── ydata-tvsum50.mat    # Synthetic TVSum data
│   ├── liris_<id>.csv       # Synthetic LIRIS valence/arousal
│   ├── synth_clip.mp4       # Tiny real video (for baseline extraction)
│   ├── MANIFEST.json        # Which videos have signal vs null control
│   ├── arcs/                # Generated arc CSVs (output of pipeline)
│   ├── human/               # Generated human arc CSVs
│   ├── baseline/            # Generated baseline features
│   ├── results.csv          # Pipeline output
│   └── ...
```

## Test Structure

**Suite Organization:**

Each test is a standalone script. `dry_run.py` is structured as a sequence of pipeline stages:

```python
def main():
    # 1. tvsum_prep on synthetic .mat
    # 2. arc extraction from preds
    # 3. honest_corr_timeseries (the real honesty test)
    # 4. affect_extract
    # 5. check_preds_space
    # 6. liris_prep
    # 7. affect_validate
```

**Patterns:**

1. **Setup:** Generate synthetic fixtures in `tests/synth/` via `make_synthetic_data.py`
   - Creates preds with **planted signals** in ROI-specific vertex blocks
   - Three test videos: `synth_sig1`, `synth_sig2` (signal present), `synth_null` (no signal)
   - Signals designed so ROI correlates with human arc; global stays ~null

2. **Run:** Call actual pipeline scripts via `subprocess.run()` with captured output
   ```python
   def run(cmd):
       r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
       if r.returncode != 0:
           print("   ! command failed:", " ".join(cmd))
           print(r.stdout[-1500:]); print(r.stderr[-1500:])
       return r
   ```

3. **Assert:** Custom `check()` function validates outputs
   ```python
   def check(name, cond, detail=""):
       print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
       if not cond:
           FAILS.append(name)
   ```

4. **Report:** Collects all failures and exits with count at end
   ```python
   if FAILS:
       sys.exit(f"{len(FAILS)} checks failed")
   ```

## Mocking

**Framework:** No mocking library; tests use **real data and real scripts**

**Approach:**
- **Synthetic fixtures replace real GPU outputs:** `make_synthetic_data.py` creates fake `preds_<id>.npy` with controlled signal
- **Full pipeline execution:** Each test stage runs the actual script (e.g., `honest_corr_timeseries.py`) on synthetic data
- **No unit tests:** Only integration tests; no mocked dependencies

**When Fixtures Are Used:**
- All pipeline stages consume synthetic data: `arc_*.csv`, human arcs, ROI masks, LIRIS data
- Baseline extraction runs on a tiny `synth_clip.mp4` (real video, not mocked)
- Statistics are computed using real functions, not mocked return values

**What NOT to Mock:**
- Never mock numpy arrays or pandas DataFrames; pass real objects
- Never mock file I/O; write and read actual files (I/O is critical to test)
- Never mock subprocess calls; the pipeline depends on script invocation

## Fixtures and Factories

**Synthetic Data Factory:**

`make_synthetic_data.py` creates all fixtures once at test time:

```python
def latent(T, rng, kind="interest"):
    """A smooth 0..1 latent arc over T seconds."""
    # Returns a smooth curve with bumps

def make_preds(T, L, rng, signal=True):
    """(T,V) z-scored noise; if signal, ROI magnitude tracks L(t)."""
    # Shape: (T, 20484) with signal planted in vertex slices:
    # - DMN (0:2000): interest signal
    # - VAL (2000:2500): signed valence signal (L - 0.5)
    # - ARO (2500:3000): arousal signal

def make_mat(entries):
    """Write a TVSum-shaped .mat: struct array 'tvsum50'."""

def make_video(path, T=6):
    """Tiny real mp4 with a scene cut + brightness change."""
```

**Test Videos:**
```python
videos = [
    {"id": "synth_sig1", "T": 120, "signal": True},
    {"id": "synth_sig2", "T": 90,  "signal": True},
    {"id": "synth_null", "T": 100, "signal": False},
]
```

**Manifest:**
`tests/synth/MANIFEST.json` lists which videos carry signal vs are controls:
```json
{
  "videos": [
    {"id": "synth_sig1", "T": 120, "signal": true},
    {"id": "synth_sig2", "T": 90, "signal": true},
    {"id": "synth_null", "T": 100, "signal": false}
  ]
}
```

**Location:** `tests/synth/` (created at test time, gitignored)

## Coverage

**Requirements:** **No enforced coverage target.** Tests focus on **end-to-end correctness**, not line coverage.

**What is Tested:**
1. **Fixture generation:** Synthetic preds and human arcs created correctly
2. **Pipeline stages:** Each script (tvsum_prep, batch_extract.arc_from_preds, honest_corr_timeseries, affect_extract, etc.) runs without error
3. **Correctness assertions:** Critical outputs meet expected properties:
   - Signal videos: ROI correlation r > 0.15, p < 0.1 (detects signal)
   - Null videos: p > 0.05 or |r| < 0.2 (stays quiet on null)
   - ROI beats global on signal videos (as designed)
4. **Output format:** Each stage produces well-formed CSV/JSON/numpy files
5. **Data integrity:** Shapes, ranges, and content match expectations

**View Coverage (None):**
```bash
# No coverage tool configured; to assess coverage manually:
grep -n "def " src/*.py  # List functions
# Check which are called in tests/dry_run.py
```

## Test Types

**Integration Tests (Only Type):**
- **Scope:** Entire pipeline from fixtures → final report
- **Approach:** Run real scripts on synthetic data; assert outputs
- **Example:** `dry_run.py` runs:
  1. tvsum_prep
  2. arc_from_preds
  3. honest_corr_timeseries
  4. affect_extract
  5. check_preds_space
  6. liris_prep
  7. affect_validate

**Unit Tests:** None observed (no pytest/unittest style)

**E2E Tests:** The whole dry_run is an end-to-end test:
- Input: Synthetic fixtures
- Output: Validated results.csv, forest plots, affect results, etc.
- Assertion: Signal detected in signal videos, null quiet in null video

## Common Patterns

**Subprocess Invocation:**

Each pipeline stage is invoked via `subprocess.run()` with captured output:

```python
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        print("   ! command failed:", " ".join(cmd))
        print(r.stdout[-1500:]); print(r.stderr[-1500:])
    return r

# Example call
r = run([PY, "tvsum_prep.py", "--mat", ..., "--out", HUMAN, ...])
```

**File Assertions:**

Check that expected files were created with correct content:

```python
check(f"human_arc written ({v['id']})", os.path.exists(hp))

if os.path.exists(res_path):
    rows = [l.split(",") for l in open(res_path).read().splitlines()[1:]]
    hdr = "video feature n r p p_param n_eff ceiling frac note".split()
    R = [dict(zip(hdr, r)) for r in rows]
    def get(vid, feat, k):
        for x in R:
            if x["video"] == vid and x["feature"] == feat:
                try: return float(x[k])
                except: return float("nan")
        return float("nan")
```

**Statistical Assertions:**

Signal videos must meet thresholds; null control must not:

```python
# Signal videos: ROI detected (positive r, small p)
for vid in ("synth_sig1", "synth_sig2"):
    rr, pp = get(vid, "roi", "r"), get(vid, "roi", "p")
    check(f"signal ROI detected ({vid})", (rr > 0.15 and pp < 0.1), f"r={rr:.2f} p={pp:.3f}")

# Null control: ROI not strongly significant
rn, pn = get("synth_null", "roi", "r"), get("synth_null", "roi", "p")
check("null control quiet (ROI)", pn > 0.05 or abs(rn) < 0.2, f"r={rn:.2f} p={pn:.3f}")
```

**Array/Shape Validation:**

```python
preds = np.load(os.path.join(SYN, f"preds_{v['id']}.npy"))
gmag, rmag = batch_extract.arc_from_preds(preds, dmn)
check(f"arc shape ({v['id']})", len(gmag) == v["T"], f"T={len(gmag)}")
```

## Test Execution

**Via Makefile:**

```bash
make synth          # make_synthetic_data.py
make dryrun         # tests/dry_run.py
make test           # synth + dryrun
```

**Direct Invocation:**

```bash
./.venv/bin/python tests/make_synthetic_data.py
./.venv/bin/python tests/dry_run.py
```

**Exit Codes:**
- `0`: All checks pass
- `1`: One or more checks failed; FAILS list printed at end

## Synthetic Data Design

**Signal Planting Strategy:**

The synthetic preds have three independent vertex blocks:

1. **DMN** (0:2000): ROI block with planted signal
   - Added signal: `p[:, DMN] += (1.4 * L[:, None])`  where L is latent interest
   - Effect: ROI magnitude tracks the human interest curve

2. **Global (all 20484 vertices):** No net signal added
   - Global magnitude is pure z-scored noise + small DMN contribution (diluted over 20484)
   - Designed to fail the test (honest baseline — should NOT predict)

3. **Valence block** (2000:2500): Signed signal
   - Added signal: `p[:, VAL] += (1.1 * (L - 0.5)[:, None])`
   - Effect: Tracks (interest - baseline)

4. **Arousal block** (2500:3000): Arousal signal
   - Added signal: `p[:, ARO] += (1.2 * L[:, None])`

**Null Control (synth_null):**
- `signal=False` in make_preds: no artificial signal added
- Entire preds array is pure z-scored noise
- Expected outcome: all tests return p > 0.05 (noise)

**Expected Test Outcomes:**

| Video | Feature | Expected Behavior |
|-------|---------|-------------------|
| synth_sig1, synth_sig2 | roi | r > 0.15, p < 0.1 (detects signal) |
| synth_sig1, synth_sig2 | global | r ≈ 0, p > 0.05 (noise, as designed) |
| synth_null | roi, global | p > 0.05 (null control; no signal) |

---

*Testing analysis: 2026-07-18*
