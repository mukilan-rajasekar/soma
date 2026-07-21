#!/usr/bin/env python3
"""
test_ad_backtest.py — GPU-free, network-free tests for the cross-sectional ad backtest.

Pins the three properties that make the "we predicted your winning ad" claim honest:
  1. a PLANTED neural->outcome signal is recovered (partial r high, perm p small);
  2. a pure ffmpeg CONFOUND (neural == outcome == loudness) COLLAPSES under the partial
     control — the whole point of `incremental_validity`-style partialling; and
  3. the file readers (arc_series / baseline_summary) round-trip real CSV layouts;
  4. an end-to-end CLI run on planted synthetic ads writes the CSV/JSON and reports SIGNAL.

Run:  ./.venv/bin/python -m pytest tests/test_ad_backtest.py -s
Only hard dependency is numpy.
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import ad_backtest as AB  # noqa: E402


def test_summaries_ignores_nan():
    s = AB._summaries([1.0, np.nan, 3.0, 5.0])
    assert s is not None
    assert abs(s["mean"] - 3.0) < 1e-9          # (1+3+5)/3
    assert AB._summaries([np.nan, np.nan]) is None


def test_planted_signal_recovered():
    """neural = outcome (+ small noise), covariates independent -> partial survives."""
    rng = np.random.default_rng(0)
    n = 20
    outcome = rng.normal(size=n)
    neural = outcome + 0.15 * rng.normal(size=n)          # strong true signal
    Z = rng.normal(size=(n, 3))                            # covariates unrelated to signal
    p, r = AB.label_perm_p(neural, outcome, Z, n_perm=4000, seed=1)
    assert r > 0.5, f"planted partial r too low: {r}"
    assert p < 0.05, f"planted signal not significant: p={p}"


def test_ffmpeg_confound_collapses_under_partial():
    """neural and outcome are BOTH just loudness -> raw corr ~1 but PARTIAL ~0.

    This is the control that stops us selling an expensive loudness detector: if the only
    reason the neural score 'predicts' the winner is that loud ads win and loud ads light
    up the arc, partialling loudness out must kill it.
    """
    rng = np.random.default_rng(2)
    n = 24
    loudness = rng.uniform(size=n)
    neural = loudness + 0.02 * rng.normal(size=n)
    outcome = loudness + 0.02 * rng.normal(size=n)
    Z = loudness.reshape(-1, 1)                            # control = loudness itself
    raw = AB.pearson(AB._rankdata(neural), AB._rankdata(outcome))
    p, partial = AB.label_perm_p(neural, outcome, Z, n_perm=4000, seed=3)
    # correlation is scale-free, so shrinking the noise can't shrink the partial of two
    # independent residuals (SD ~0.2 at this n). The honest, robust property: removing
    # loudness cuts the apparent association by well over half, and it is not significant.
    assert raw > 0.8, f"confound should show a big RAW corr, got {raw}"
    assert abs(partial) < 0.5 * raw, f"control should more than halve the confound: raw={raw} partial={partial}"
    assert p >= 0.05, f"a pure loudness confound must NOT survive the partial as significant: p={p}"


def test_topk_precision():
    neural = np.array([0.1, 0.9, 0.8, 0.2, 0.7])
    outcome = np.array([0.0, 1.0, 0.9, 0.1, 0.5])         # same top-2 ordering
    assert AB.topk_precision(neural, outcome, 2) == 1.0


def _write_ad(dirpath, ad_id, arc_vals, base_loud):
    os.makedirs(os.path.join(dirpath, "arcs"), exist_ok=True)
    os.makedirs(os.path.join(dirpath, "baseline"), exist_ok=True)
    with open(os.path.join(dirpath, "arcs", f"arc_{ad_id}.csv"), "w") as f:
        f.write("t_sec,global_mag,roi_mag\n")
        for t, v in enumerate(arc_vals):
            f.write(f"{t},{v:.4f},{v:.4f}\n")
    with open(os.path.join(dirpath, "baseline", f"baseline_{ad_id}.csv"), "w") as f:
        f.write("t_sec,loudness,cuts,luminance,motion\n")
        for t in range(len(arc_vals)):
            f.write(f"{t},{base_loud:.4f},0.5,0.5,0.5\n")


def test_file_readers_roundtrip(tmp_path):
    _write_ad(str(tmp_path), "x1", [0.2, 0.4, 0.6], 0.3)
    s = AB.arc_series("x1", os.path.join(str(tmp_path), "arcs"))
    assert s is not None and len(s) == 3 and abs(s[-1] - 0.6) < 1e-9
    b = AB.baseline_summary("x1", os.path.join(str(tmp_path), "baseline"))
    assert b is not None and abs(b["loudness"] - 0.3) < 1e-9 and b["duration"] == 3.0


def test_end_to_end_cli_planted(tmp_path):
    """Write N ads whose arc MEAN is monotone in outcome but with loudness independent,
    run the CLI with --score arc, and assert it reports SIGNAL and writes both outputs."""
    rng = np.random.default_rng(7)
    n = 18
    outcome = np.linspace(0, 1, n)
    rng.shuffle(outcome)
    manifest = os.path.join(str(tmp_path), "ad_manifest.csv")
    with open(manifest, "w") as f:
        f.write("ad_id,outcome,platform\n")
        for i, y in enumerate(outcome):
            ad_id = f"ad{i:02d}"
            level = 0.3 + 0.5 * y                         # arc mean tracks outcome
            arc = level + 0.02 * rng.normal(size=12)
            loud = float(rng.uniform())                   # loudness independent of outcome
            _write_ad(str(tmp_path), ad_id, arc, loud)
            f.write(f"{ad_id},{y:.4f},synthetic\n")

    out_csv = os.path.join(str(tmp_path), "ad_backtest.csv")
    out_json = os.path.join(str(tmp_path), "ad_backtest.json")
    r = subprocess.run(
        [sys.executable, os.path.join(ROOT, "ad_backtest.py"),
         "--manifest", manifest, "--score", "arc",
         "--arc-dir", os.path.join(str(tmp_path), "arcs"),
         "--baseline-dir", os.path.join(str(tmp_path), "baseline"),
         "--n-perm", "4000", "--out", out_csv, "--json-out", out_json],
        capture_output=True, text=True)
    assert r.returncode == 0, f"CLI failed:\n{r.stdout}\n{r.stderr}"
    assert os.path.exists(out_csv) and os.path.exists(out_json)
    summary = json.load(open(out_json))
    assert summary["n_ads"] == n
    assert summary["signal"] is True, f"planted signal not detected: {summary['verdict']}"
    assert summary["primary"]["perm_p"] < 0.05
