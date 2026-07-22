#!/usr/bin/env python3
"""
test_retention_head.py — GPU-free, network-free tests for the Mr.HiSum retention head.

Pins the properties that make the "we trained a head on real engagement" claim honest,
using the repo's planted-signal-vs-null-control pattern:
  1. mrhisum_prep round-trips a most-replayed arc into [0,1] and normalizes a flat arc to 0;
  2. a PLANTED arc that depends on an ROI's predicted activation is RECOVERED by the LOVO
     head above the circular-shift permutation null AND above the GLOBAL baseline, and the
     shuffle-target REFIT leak control passes;
  3. a NULL control (retention independent of preds) stays quiet (no signal);
  4. the ffmpeg gate behaves: an independent covariate does not erase the head, but a pure
     ffmpeg CONFOUND (ROI and target both driven by loudness) COLLAPSES under the partial.

Run:  .venv/bin/python -m pytest tests/test_retention_head.py -q
Only hard dependency is numpy.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import mrhisum_prep as MP      # noqa: E402
import retention_head as RH    # noqa: E402
import temporal_readout as TR  # noqa: E402  (the temporal seam under test)

V = 1000                       # small synthetic cortex (fast); ROI is a fraction of it
ROI = slice(0, 100)            # a-priori "DAN"-like block the head is restricted to
POOL = 2.0
NPERM = 400                    # distinct shifts (~30) < NPERM, so the null is fully enumerated


def _smooth_latent(n_sec, rng):
    t = np.arange(n_sec)
    a = (0.5 + 0.35 * np.sin(2 * np.pi * t / (n_sec / (2.0 + rng.random())))
         + 0.4 * np.exp(-((t - rng.integers(5, n_sec - 5)) ** 2) / (2 * (0.08 * n_sec) ** 2)))
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


def _write_masks(dirpath):
    m = np.zeros(V, bool)
    m[ROI] = True
    np.save(os.path.join(dirpath, "roi_mask_dan.npy"), m)


def _write_baseline(dirpath, vid, n_sec, loudness, rng):
    os.makedirs(os.path.join(dirpath, "baseline"), exist_ok=True)
    with open(os.path.join(dirpath, "baseline", f"baseline_{vid}.csv"), "w") as f:
        f.write("t_sec,loudness,cuts,luminance,motion\n")
        for t in range(n_sec):
            f.write(f"{t},{loudness[t]:.4f},{rng.random():.4f},"
                    f"{rng.random():.4f},{rng.random():.4f}\n")


def _make_dataset(dirpath, n_videos, seed, coupled=True, with_baseline=False,
                  confound=False):
    """Write preds_<id>.npy + retention_<id>.csv (+ masks, optional ffmpeg baselines).

    coupled=True  -> ROI activation tracks a latent L(t); target tracks L(t)   (recoverable)
    coupled=False -> target is an INDEPENDENT latent                            (null control)
    confound=True -> a per-second loudness drives BOTH ROI activation AND target; the ffmpeg
                     baseline carries that loudness -> the partial must collapse.
    """
    preds_dir = os.path.join(dirpath, "preds")
    os.makedirs(preds_dir, exist_ok=True)
    _write_masks(dirpath)
    rng = np.random.default_rng(seed)
    for i in range(n_videos):
        n_sec = int(rng.integers(64, 86))
        vid = f"v{i:02d}"
        preds = rng.standard_normal((n_sec, V)).astype(np.float32)
        if confound:
            loud = _smooth_latent(n_sec, rng)                 # exogenous ffmpeg feature
            preds[:, ROI] += (1.8 * loud[:, None]).astype(np.float32)
            target = MP.normalize01(loud + rng.normal(0, 0.05, n_sec))
            _write_baseline(dirpath, vid, n_sec, loud, rng)
        else:
            L = _smooth_latent(n_sec, rng)
            preds[:, ROI] += (1.8 * L[:, None]).astype(np.float32)
            if coupled:
                target = MP.normalize01(L + rng.normal(0, 0.04, n_sec))
            else:
                target = MP.normalize01(_smooth_latent(n_sec, rng))   # independent of preds
            if with_baseline:
                _write_baseline(dirpath, vid, n_sec, rng.random(n_sec), rng)  # independent noise
        np.save(os.path.join(preds_dir, f"preds_{vid}.npy"), preds)
        MP.write_retention_csv(dirpath, vid, target)
    return preds_dir


# -----------------------------------------------------------------------------
# 1. parser
# -----------------------------------------------------------------------------
def test_parser_roundtrip(tmp_path):
    MP.make_synthetic_mrhisum(str(tmp_path), n_videos=3, seed=1)
    from honest_corr_timeseries import _read_csv
    _, rc = _read_csv(os.path.join(str(tmp_path), "retention_synthmrh_00.csv"))
    arc = np.asarray(rc["most_replayed"], float)
    assert arc.min() >= 0.0 and arc.max() <= 1.0
    assert np.isclose(arc.max(), 1.0) and np.isclose(arc.min(), 0.0)   # min-maxed
    # a flat arc normalizes to all-zeros (no divide-by-zero, no fabricated variation)
    assert np.allclose(MP.normalize01(np.full(20, 0.7)), 0.0)


# -----------------------------------------------------------------------------
# 2. planted signal recovered above perm null AND above global; leak control passes
# -----------------------------------------------------------------------------
def test_planted_signal_recovered_and_beats_global(tmp_path):
    preds_dir = _make_dataset(str(tmp_path), n_videos=12, seed=7, coupled=True)
    masks = RH.load_masks(str(tmp_path), ["dan"])
    videos = RH.build_videos(preds_dir, str(tmp_path), masks, POOL)
    assert len(videos) == 12
    ev = RH.evaluate(videos, n_perm=NPERM, seed=0)

    assert ev["median_r"] > RH.MIN_EFFECT_R, f"effect below floor: {ev['median_r']}"
    assert ev["stouffer_p"] < 0.05, f"perm null not beaten: p={ev['stouffer_p']}"
    assert ev["head_real"], "gate1 (beats perm null) should pass"
    assert ev["median_delta"] > 0, f"head should beat global on median: {ev['median_delta']}"
    assert ev["paired_p"] < 0.05, f"beats-global not significant: p={ev['paired_p']}"
    assert ev["beats_global"], "gate2 (beats global baseline) should pass"
    assert ev["leak_check"] == "pass", f"REFIT leak control must pass, got {ev['leak_check']}"
    assert ev["signal"] is True


# -----------------------------------------------------------------------------
# 3. null control stays quiet
# -----------------------------------------------------------------------------
def test_null_control_stays_quiet(tmp_path):
    preds_dir = _make_dataset(str(tmp_path), n_videos=12, seed=11, coupled=False)
    masks = RH.load_masks(str(tmp_path), ["dan"])
    videos = RH.build_videos(preds_dir, str(tmp_path), masks, POOL)
    ev = RH.evaluate(videos, n_perm=NPERM, seed=0)
    # a target unrelated to the preds must NOT be declared a signal
    assert ev["signal"] is False, f"null control fabricated a signal: {ev}"
    assert not (ev["head_real"] and ev["beats_global"]), \
        f"null control passed both signal gates: r={ev['median_r']} p={ev['stouffer_p']}"


# -----------------------------------------------------------------------------
# 4. ffmpeg gate: independent baseline survives, a pure confound collapses
# -----------------------------------------------------------------------------
def test_ffmpeg_confound_collapses(tmp_path):
    conf_dir = os.path.join(str(tmp_path), "confound")
    os.makedirs(conf_dir)
    preds_dir = _make_dataset(conf_dir, n_videos=10, seed=5, confound=True)
    masks = RH.load_masks(conf_dir, ["dan"])
    videos = RH.build_videos(preds_dir, conf_dir, masks, POOL)
    ev = RH.evaluate(videos, n_perm=NPERM, seed=0,
                     baseline_dir=os.path.join(conf_dir, "baseline"))
    # the head "predicts" the target only because both are loudness -> the partial must die,
    # so the ffmpeg gate fails and the overall verdict is NOT a signal.
    assert ev["ffmpeg"] is not None
    assert ev["ffmpeg"]["beats_ffmpeg"] is False, "pure loudness confound must NOT beat ffmpeg"
    assert ev["signal"] is False, "confound must not be sold as a signal"


def test_independent_baseline_does_not_erase_signal(tmp_path):
    ind_dir = os.path.join(str(tmp_path), "indep")
    os.makedirs(ind_dir)
    preds_dir = _make_dataset(ind_dir, n_videos=12, seed=7, coupled=True, with_baseline=True)
    masks = RH.load_masks(ind_dir, ["dan"])
    videos = RH.build_videos(preds_dir, ind_dir, masks, POOL)
    ev = RH.evaluate(videos, n_perm=NPERM, seed=0,
                     baseline_dir=os.path.join(ind_dir, "baseline"))
    assert ev["ffmpeg"] is not None and ev["ffmpeg"]["beats_ffmpeg"] is True
    assert ev["signal"] is True


# -----------------------------------------------------------------------------
# 5. temporal seam: --features roi+temporal runs end-to-end, recovers a signal that
#    lives in the TEMPORAL SHAPE of the preds (not the level), and stays quiet on a null.
# -----------------------------------------------------------------------------
def _make_temporal_dataset(dirpath, n_videos, seed, coupled=True):
    """Write preds_<id>.npy + retention_<id>.csv where (coupled) the target tracks a
    TEMPORAL-SHAPE descriptor of the preds — the LOCAL BURST VARIANCE — never the level.

    Trick: each second's activation SCALE alternates sign,
        sigma(t) = 0.6 + level_drift(t) + amp * A(t) * (-1)^t ,
    so the per-second neural series s = mean|activation| ~ 0.8 * sigma(t) WIGGLES with a local
    amplitude set by a smooth envelope A(t). The 2-second bin MEAN of s (== the ROI mean-level
    columns and the nested global baseline) is FLAT in A because the (-1)^t alternation cancels
    within each bin, while the LOCAL ROLLING VARIANCE of s tracks A(t)^2. Setting
    target ∝ A(t)^2 plants a signal ONLY the temporal columns can read — the ROI level and the
    global baseline structurally cannot. level_drift is an independent, uninformative level
    wiggle so the global baseline is non-degenerate but still uncorrelated with the target.

    coupled=False -> preds are pure noise carrying NO information about the target (an
    independent smooth arc) -> the null control.
    """
    preds_dir = os.path.join(dirpath, "preds")
    os.makedirs(preds_dir, exist_ok=True)
    _write_masks(dirpath)
    rng = np.random.default_rng(seed)
    for i in range(n_videos):
        n_sec = int(rng.integers(64, 86))
        vid = f"v{i:02d}"
        t = np.arange(n_sec)
        if coupled:
            A = _smooth_latent(n_sec, rng)                    # smooth burst-amplitude envelope
            level_drift = 0.15 * _smooth_latent(n_sec, rng)   # independent, uninformative LEVEL
            alt = np.where(t % 2 == 0, 1.0, -1.0)             # 2-s alternation -> cancels in bins
            sigma = np.clip(0.6 + level_drift + 0.5 * A * alt, 0.05, None)
            preds = (sigma[:, None] * rng.standard_normal((n_sec, V))).astype(np.float32)
            target = MP.normalize01(A ** 2 + rng.normal(0, 0.02, n_sec))  # tracks LOCAL burst energy
        else:
            preds = rng.standard_normal((n_sec, V)).astype(np.float32)    # no information
            target = MP.normalize01(_smooth_latent(n_sec, rng))           # independent of preds
        np.save(os.path.join(preds_dir, f"preds_{vid}.npy"), preds)
        MP.write_retention_csv(dirpath, vid, target)
    return preds_dir


def test_temporal_recovers_shape_signal_and_is_load_bearing(tmp_path):
    """'--features roi+temporal' runs end-to-end and recovers a signal planted in the
    TEMPORAL SHAPE of the preds — above the perm null AND the global baseline, with the
    REFIT leak control passing — while the pure-'roi' head on the SAME data does NOT (so the
    temporal columns are provably load-bearing, not decoration)."""
    d = os.path.join(str(tmp_path), "temporal")
    os.makedirs(d)
    preds_dir = _make_temporal_dataset(d, n_videos=12, seed=7, coupled=True)
    masks = RH.load_masks(d, ["dan"])

    vids_t = RH.build_videos(preds_dir, d, masks, POOL, temporal=True)
    assert len(vids_t) == 12
    # the temporal columns actually got appended (one per WINDOW_FEATURES entry)
    assert all(v["temporal_k"] == len(TR.WINDOW_FEATURES) for v in vids_t)
    ev_t = RH.evaluate(vids_t, n_perm=NPERM, seed=0)
    assert ev_t["median_r"] > RH.MIN_EFFECT_R, f"temporal effect below floor: {ev_t['median_r']}"
    assert ev_t["stouffer_p"] < 0.05, f"perm null not beaten: p={ev_t['stouffer_p']}"
    assert ev_t["head_real"], "gate1 (beats perm null) should pass for the temporal signal"
    assert ev_t["median_delta"] > 0 and ev_t["paired_p"] < 0.05, \
        f"temporal must beat the global baseline: delta={ev_t['median_delta']} p={ev_t['paired_p']}"
    assert ev_t["beats_global"], "gate2 (beats global baseline) should pass"
    assert ev_t["leak_check"] == "pass", f"REFIT leak control must pass, got {ev_t['leak_check']}"
    assert ev_t["signal"] is True

    # the pre-registered PRIMARY 'roi' head cannot see a purely-temporal signal
    vids_r = RH.build_videos(preds_dir, d, masks, POOL, temporal=False)
    assert all(v["temporal_k"] == 0 for v in vids_r)
    ev_r = RH.evaluate(vids_r, n_perm=NPERM, seed=0)
    assert ev_r["signal"] is False, "ROI-only must NOT recover a purely-temporal-shape signal"
    assert ev_t["median_r"] > ev_r["median_r"] + 0.3, \
        f"temporal must beat ROI-only by a wide margin: {ev_t['median_r']} vs {ev_r['median_r']}"


def test_temporal_null_control_stays_quiet(tmp_path):
    """When the preds carry NO information about the target, '--features roi+temporal'
    fabricates no signal (the extra temporal columns do not manufacture a false positive)."""
    d = os.path.join(str(tmp_path), "temporal_null")
    os.makedirs(d)
    preds_dir = _make_temporal_dataset(d, n_videos=12, seed=1, coupled=False)
    masks = RH.load_masks(d, ["dan"])
    vids = RH.build_videos(preds_dir, d, masks, POOL, temporal=True)
    ev = RH.evaluate(vids, n_perm=NPERM, seed=0)
    assert ev["signal"] is False, f"temporal null fabricated a signal: {ev}"
    assert not (ev["head_real"] and ev["beats_global"]), \
        f"null control passed both signal gates: r={ev['median_r']} delta={ev['median_delta']}"
