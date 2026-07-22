#!/usr/bin/env python3
"""
test_temporal_readout.py — GPU-free, network-free tests for the temporal-dynamics read-out.

Pins the properties that make "the SHAPE of the neural arc predicts the outcome" honest,
mirroring tests/test_ad_backtest.py (planted signal recovered AND a null control stays quiet):
  1. a PLANTED single-feature signal (outcome ~ hook_decay + noise) is recovered by that
     feature's partial Spearman AND the combined LOO ridge beats its full-refit perm null;
  2. a pure-NOISE control (random shapes, random outcome) stays NULL — the combined perm
     null is NOT significant, no feature survives Holm, nothing clears the effect floor;
  3. the six shape extractors behave (edge cases) and CLI/file round-trips write valid outputs.

Run:  ./.venv/bin/python -m pytest tests/test_temporal_readout.py -q
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

import temporal_readout as TR  # noqa: E402


# -----------------------------------------------------------------------------
# extractor unit behaviour
# -----------------------------------------------------------------------------
def test_extractors_basic():
    # front-loaded arc: high for the first 3s, low after -> hook_decay > 0, peak at start
    x = np.array([1.0, 1.0, 1.0] + [0.0] * 17)
    assert TR.hook_decay(x) > 0.5
    assert TR.rise_fall_asym(x) > 0.5          # peak at the very start -> long fall
    # a rising ramp -> positive hook_slope, peak at the end -> asym < 0
    ramp = np.linspace(0, 1, 20)
    assert TR.hook_slope(ramp) > 0
    assert TR.rise_fall_asym(ramp) < -0.5
    # a constant arc -> zero variance, zero surprises, undefined-but-safe others
    const = np.ones(20)
    assert TR.tvar(const) == 0.0
    assert TR.surprise_rate(const) == 0.0
    # too-short series -> NaN, never a crash
    assert not np.isfinite(TR.hook_decay([1.0, 2.0]))


def test_feature_set_is_locked():
    """The pre-declared set is exactly these six, in this order — guards against silent
    add/drop after seeing results."""
    assert TR.FEATURES == ["hook_decay", "hook_slope", "decay_tau",
                           "surprise_rate", "rise_fall_asym", "tvar"]
    feats = TR.extract_features(np.linspace(0, 1, 30))
    assert set(feats) == set(TR.FEATURES)


def test_holm_monotone():
    adj = TR.holm([0.001, 0.02, 0.5, 0.9])
    assert adj[0] <= adj[1] <= adj[2] <= adj[3]          # step-down monotone
    assert abs(adj[0] - 0.004) < 1e-9                    # 4 * 0.001


# -----------------------------------------------------------------------------
# synthetic-ad builders
# -----------------------------------------------------------------------------
def _planted_arc(rng, y, n_sec=20, decay_amp=1.2, noise=0.05):
    """Arc whose hook_decay is a linear function of y: bump the first 3 seconds by
    decay_amp*y over a noisy flat base. Nothing else is tied to y."""
    base = 0.5 + noise * rng.normal(size=n_sec)
    base[:3] += decay_amp * y
    return base


def _noise_arc(rng, n_sec=24):
    return 0.5 + 0.2 * rng.normal(size=n_sec)


def _feature_matrix(arcs):
    X = np.array([[TR._EXTRACTORS[f](a) for f in TR.FEATURES] for a in arcs], float)
    return X


# -----------------------------------------------------------------------------
# 1. planted signal is recovered
# -----------------------------------------------------------------------------
def test_planted_hook_decay_recovered_and_combined_beats_null():
    rng = np.random.default_rng(0)
    n = 40
    outcome = rng.normal(size=n)
    arcs = [_planted_arc(rng, y) for y in outcome]
    X = _feature_matrix(arcs)
    Z = rng.normal(size=(n, 3))                          # covariates unrelated to signal

    # the planted feature's partial survives its label-perm null
    j = TR.FEATURES.index("hook_decay")
    p_feat, r_feat = TR.label_perm_p(X[:, j], outcome, Z, n_perm=2000, seed=1)
    assert r_feat > 0.5, f"planted hook_decay partial too low: {r_feat}"
    assert p_feat < 0.05, f"planted feature not significant: p={p_feat}"

    # the combined LOO ridge beats its FULL-REFIT permutation null
    p_comb, r_comb = TR.combined_perm_p(X, outcome, n_perm=500, seed=2)
    assert r_comb >= TR.MIN_EFFECT_R, f"combined OOS r below floor: {r_comb}"
    assert p_comb < 0.05, f"combined model not significant: p={p_comb}"


# -----------------------------------------------------------------------------
# 2. null control stays quiet
# -----------------------------------------------------------------------------
def test_pure_noise_stays_null():
    rng = np.random.default_rng(3)
    n = 40
    outcome = rng.normal(size=n)
    arcs = [_noise_arc(rng) for _ in range(n)]
    X = _feature_matrix(arcs)
    Z = rng.normal(size=(n, 3))

    # combined model: permutation null must NOT be significant, must NOT be a signal
    p_comb, r_comb = TR.combined_perm_p(X, outcome, n_perm=500, seed=4)
    assert p_comb >= 0.05, f"pure noise falsely significant (combined): p={p_comb}"
    assert not (p_comb < 0.05 and abs(r_comb) >= TR.MIN_EFFECT_R)

    # no individual feature survives Holm as a signal
    perm_ps = []
    for f in TR.FEATURES:
        p, _ = TR.label_perm_p(X[:, TR.FEATURES.index(f)], outcome, Z, n_perm=2000, seed=5)
        perm_ps.append(p)
    holm_p = TR.holm(perm_ps)
    assert not np.any(np.asarray([h for h in holm_p if np.isfinite(h)]) < 0.05), \
        f"a pure-noise feature falsely survived Holm: {holm_p}"


# -----------------------------------------------------------------------------
# 3. CLI / file round-trip
# -----------------------------------------------------------------------------
def _write_ad(dirpath, ad_id, arc_vals, base_loud):
    os.makedirs(os.path.join(dirpath, "arcs"), exist_ok=True)
    os.makedirs(os.path.join(dirpath, "baseline"), exist_ok=True)
    with open(os.path.join(dirpath, "arcs", f"arc_{ad_id}.csv"), "w") as f:
        f.write("t_sec,global_mag,roi_mag\n")
        for t, v in enumerate(arc_vals):
            f.write(f"{t},{v:.5f},{v:.5f}\n")
    with open(os.path.join(dirpath, "baseline", f"baseline_{ad_id}.csv"), "w") as f:
        f.write("t_sec,loudness,cuts,luminance,motion\n")
        for t in range(len(arc_vals)):
            f.write(f"{t},{base_loud:.4f},0.5,0.5,0.5\n")


def test_end_to_end_cli_roundtrip(tmp_path):
    """Write planted-hook_decay ads, run the CLI, assert it writes valid CSV+JSON with the
    locked feature set and a combined block. (Signal is asserted via the module tests above;
    here we pin the round-trip + honest schema.)"""
    rng = np.random.default_rng(7)
    n = 30
    outcome = rng.normal(size=n)
    manifest = os.path.join(str(tmp_path), "ad_manifest.csv")
    with open(manifest, "w") as f:
        f.write("ad_id,outcome,platform\n")
        for i, y in enumerate(outcome):
            ad_id = f"ad{i:02d}"
            arc = _planted_arc(rng, y)
            _write_ad(str(tmp_path), ad_id, arc, float(rng.uniform()))
            f.write(f"{ad_id},{y:.4f},synthetic\n")

    out_csv = os.path.join(str(tmp_path), "temporal_readout.csv")
    out_json = os.path.join(str(tmp_path), "temporal_readout.json")
    r = subprocess.run(
        [sys.executable, os.path.join(ROOT, "temporal_readout.py"),
         "--manifest", manifest, "--arc-dir", os.path.join(str(tmp_path), "arcs"),
         "--baseline-dir", os.path.join(str(tmp_path), "baseline"),
         "--n-perm", "2000", "--n-perm-combined", "400",
         "--out", out_csv, "--json-out", out_json],
        capture_output=True, text=True)
    assert r.returncode == 0, f"CLI failed:\n{r.stdout}\n{r.stderr}"
    assert os.path.exists(out_csv) and os.path.exists(out_json)

    summary = json.load(open(out_json))
    assert summary["n_ads"] == n
    assert summary["features"] == TR.FEATURES
    assert set(summary["per_feature"]) == set(TR.FEATURES)
    assert "oos_r" in summary["combined"] and "perm_p" in summary["combined"]
    assert isinstance(summary["signal"], bool) and "verdict" in summary
    # CSV header carries every locked feature + the OOS prediction column
    header = open(out_csv).readline().strip().split(",")
    for f in TR.FEATURES:
        assert f in header
    assert "oos_pred" in header


# -----------------------------------------------------------------------------
# 4. windowed local descriptors — the retention_head.py seam
#    (shape, leakage-free-by-construction, aggregate-consistency, and they read what they claim)
# -----------------------------------------------------------------------------
def _fake_preds(n_sec=40, n_vtx=200, seed=0):
    return np.random.default_rng(seed).standard_normal((n_sec, n_vtx))


def test_window_features_shape_and_column_count():
    preds = _fake_preds(40, 200)
    F = TR.per_second_features(preds)
    assert F.shape == (40, len(TR.WINDOW_FEATURES))          # (n_sec, k)
    edges = np.arange(0, 42, 2, dtype=float)                 # a 2-s pooling grid over 40 s
    P = TR.pooled_features(preds, edges)
    assert P.shape == (len(edges) - 1, len(TR.WINDOW_FEATURES))   # (n_bins, k)


def test_window_features_are_label_free_and_deterministic():
    """per_second_features / pooled_features take `preds` ONLY — there is no label argument,
    so they cannot leak the target. Pin it: the output is a pure, deterministic function of
    preds, so whatever outcome one might imagine pairing with these preds, the columns are
    byte-identical (leakage-free BY CONSTRUCTION)."""
    preds = _fake_preds(50, 128, seed=3)
    F1 = TR.per_second_features(preds)
    assert np.array_equal(F1, TR.per_second_features(preds.copy()))   # deterministic
    edges = np.arange(0, 52, 2, dtype=float)
    P1 = TR.pooled_features(preds, edges)
    # imagine three different label vectors; none can change the features (they are never read)
    for lab in (np.zeros(50), np.arange(50.0),
                np.random.default_rng(9).normal(size=50)):
        _ = lab  # the features never see it
        assert np.array_equal(TR.per_second_features(preds), F1)
        assert np.allclose(TR.pooled_features(preds, edges), P1, equal_nan=True)


def test_pooled_equals_resampled_per_second():
    """pooled_features aggregates the per-second matrix into bins by MEAN — IDENTICAL to what
    retention_head computes from the per_second_features fallback (aggregate-consistency, so
    both seam signatures land on the same grid)."""
    from honest_corr_timeseries import resample_to_grid
    preds = _fake_preds(37, 64, seed=5)
    edges = np.arange(0, 38, 2, dtype=float)
    F = TR.per_second_features(preds)
    tsec = np.arange(F.shape[0], dtype=float)
    expected = np.column_stack([resample_to_grid(tsec, F[:, j], edges)
                                for j in range(F.shape[1])])
    assert np.allclose(TR.pooled_features(preds, edges), expected, equal_nan=True)


def test_pooled_empty_trailing_bin_is_nan():
    """An edge grid that runs past the clip leaves the trailing bin empty -> NaN (the head's
    `good` mask then drops it), never a silently zero-filled row."""
    preds = _fake_preds(10, 32, seed=1)
    edges = np.arange(0, 16, 2, dtype=float)                 # bins cover [0,16) but clip is 10 s
    P = TR.pooled_features(preds, edges)
    assert P.shape[0] == len(edges) - 1
    assert np.isnan(P[-1]).all()                             # the [14,16) bin has no seconds


def test_window_descriptors_track_the_shape_they_claim():
    """The descriptors read the local shape they advertise: a burst region has higher local
    variance than a flat one; a ramp has ~constant positive velocity; a lone jump is a
    'surprise'; time_pos is a normalized [0,1] clock ramp."""
    n = 60
    # build preds so the global series s = mean|activation| == a controlled positive c[t]
    c = np.full(n, 1.0)
    c[20:30] += 0.6 * np.where(np.arange(20, 30) % 2 == 0, 1.0, -1.0)   # an alternating burst
    F = TR.per_second_features(np.tile(c[:, None], (1, 50)))
    col = {f: F[:, i] for i, f in enumerate(TR.WINDOW_FEATURES)}
    assert col["roll_var"][25] > col["roll_var"][5] + 1e-6             # burst > flat
    assert col["time_pos"][0] == 0.0 and abs(col["time_pos"][-1] - 1.0) < 1e-9
    assert np.all(np.diff(col["time_pos"]) > 0)

    ramp = np.tile(np.linspace(1.0, 3.0, n)[:, None], (1, 50))         # s = a positive ramp
    vel = TR.per_second_features(ramp)[:, TR.WINDOW_FEATURES.index("velocity")]
    assert np.all(vel[1:] > 0) and np.std(vel[1:]) < 1e-6             # ~constant positive velocity

    rng = np.random.default_rng(1)
    base = 1.0 + 0.02 * rng.standard_normal(n)                        # small wiggle -> nonzero scale
    base[30] += 2.0                                                   # a lone big jump
    sur = TR.per_second_features(np.tile(base[:, None], (1, 50)))[
        :, TR.WINDOW_FEATURES.index("surprise")]
    assert sur[30] > 5.0 and sur[30] > 5.0 * float(np.median(sur))    # far bigger than a typical jump
