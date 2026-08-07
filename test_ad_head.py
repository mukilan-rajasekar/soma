#!/usr/bin/env python3
"""
test_ad_head.py — unit + machine-honesty tests for ad_head.py.

Everything here BUILDS ITS OWN FIXTURES. Nothing reads tests/synth/ (that directory is
gitignored and its readers live on another branch, so a test that reached into it would
pass locally and fail in every other checkout), and nothing needs ffmpeg, the Schaefer
atlas, a network call or a GPU.

The end-to-end test is a MACHINE-honesty test: it proves the pooling, the feature blocks,
the grouped CV and the leakage control all work. It proves NOTHING about whether TRIBE
predicts ad performance.
"""
import csv
import datetime as dt
import math
import os

import numpy as np
import pytest

import ad_head as A


# ------------------------------------------------------------------ time features
def test_normalized_grid_is_fixed_length_and_gapless():
    """The short-ad rule: meta's p10 duration is 12.5 s, so a 12-point series into 16
    bins would leave NaN gaps if we binned it. Below n_bins we interpolate instead."""
    for n in (1, 2, 5, 12, 15, 16, 17, 40, 120):
        g = A._to_normalized_grid(np.linspace(0.0, 1.0, n))
        assert g.shape == (A.N_BASIS_BINS,)
        assert np.all(np.isfinite(g)), f"NaN gap at T={n}"


def test_normalized_grid_is_duration_invariant():
    """A ramp is the same SHAPE whether the ad is 12 s or 90 s — that is the whole point
    of putting the basis on normalized time."""
    short = A._to_normalized_grid(np.linspace(0.0, 1.0, 13))
    long = A._to_normalized_grid(np.linspace(0.0, 1.0, 90))
    assert np.corrcoef(short, long)[0, 1] > 0.99


def test_legendre_reads_trend_and_curvature():
    def coeffs(series):
        g = A._to_normalized_grid(series)
        gc = g - np.nanmean(g)
        return [float((A._LEGENDRE[:, k] @ gc) / (A._LEGENDRE[:, k] @ A._LEGENDRE[:, k]))
                for k in range(3)]

    n = 40
    rising = coeffs(np.linspace(0.0, 1.0, n))
    falling = coeffs(np.linspace(1.0, 0.0, n))
    flat = coeffs(np.ones(n))
    dip = coeffs(np.abs(np.linspace(-1.0, 1.0, n)))       # high, dip in the middle, high

    assert rising[0] > 0.3 and falling[0] < -0.3          # L1 = escalate vs decay
    assert abs(flat[0]) < 1e-6 and abs(flat[1]) < 1e-6    # a flat lane has no shape
    assert dip[1] > 0.3                                   # L2 = mid-dip, the weak spot
    assert abs(rising[1]) < 0.1                           # a pure ramp has no curvature


def test_leaky_integrator():
    s = np.array([0.0, 1.0, 2.0, 3.0, 4.0])
    # lam=0 is plain pooling — the rung the ladder starts from
    assert A._leaky(s, 0.0) == pytest.approx(s.mean())
    # more memory => the integrator lags a rising series => a lower mean
    assert A._leaky(s, 0.95) < A._leaky(s, 0.5) < A._leaky(s, 0.0)
    assert math.isnan(A._leaky(np.array([]), 0.5))


def test_lag1_autocorr():
    smooth = np.sin(np.linspace(0, 3, 60))
    alternating = np.array([1.0, -1.0] * 30)
    assert A._lag1_autocorr(smooth) > 0.9
    assert A._lag1_autocorr(alternating) < -0.9
    assert math.isnan(A._lag1_autocorr(np.ones(20)))      # constant => undefined, not 0
    assert math.isnan(A._lag1_autocorr(np.array([1.0, 2.0])))


# ------------------------------------------------------------------ stats guards
def test_pearson_refuses_a_residualized_constant():
    """Tolerance, not == 0: a flat series minus its fitted mean keeps ~1e-16 of rounding
    noise, sails past an exact check, and corrcoef manufactures a plausible r from it."""
    flat = np.full(50, 3.0)
    assert math.isnan(A.pearson(flat - flat.mean(), np.arange(50.0)))
    assert math.isnan(A.spearman(flat, np.arange(50.0)))


def test_partial_spearman_removes_the_controlled_variable():
    rng = np.random.default_rng(0)
    z = rng.normal(size=300)
    x = z + 0.05 * rng.normal(size=300)
    y = z + 0.05 * rng.normal(size=300)          # x,y correlate ONLY through z
    assert A.spearman(x, y) > 0.9
    assert abs(A.partial_spearman(x, y, z[:, None])) < 0.3


def test_effect_floor_scales_with_n():
    # At the full-corpus n the datasheet's 0.09 is BELOW the repo-wide MIN_EFFECT_R, so
    # 0.10 binds. The scaling only starts to matter on the smaller per-platform halves.
    assert A.effect_floor(1359) == A.MIN_EFFECT_R == 0.10
    assert A.effect_floor(619) > A.effect_floor(1359)
    assert A.effect_floor(619) == pytest.approx(0.133, abs=0.005)   # the meta half
    assert A.effect_floor(673) == pytest.approx(0.128, abs=0.005)   # the tiktok half
    assert A.effect_floor(100_000) == A.MIN_EFFECT_R          # never below the repo floor


def test_rankdata_matches_average_ties():
    assert list(A._rankdata([10.0, 20.0, 20.0, 40.0])) == [1.0, 2.5, 2.5, 4.0]


# ------------------------------------------------------------------ windows / lanes
def test_window_masks_bounds_the_tail():
    """The tail baseline is BOUNDED to 5 s. tail_pad_for extends the tail on every short
    stimulus, and an unbounded window would silently change the contrast when it does."""
    onsets = np.arange(0.0, 40.0)
    content, baseline = A.window_masks(onsets, 5.0, 25.0)
    assert list(onsets[content]) == list(np.arange(5.0, 25.0))
    got = list(onsets[baseline])
    assert got == [1.0, 2.0, 3.0, 4.0] + [28.0, 29.0, 30.0, 31.0, 32.0]
    assert 25.0 not in got and 26.0 not in got      # the 3 s smear skip
    assert 33.0 not in got                          # the 5 s bound


def test_tail_pad_clears_the_chunk_minimum():
    # a 20 s ad: 5 + 20 + 8 = 33 < 35, so the tail must grow to clear min_stimulus_s
    tail = A.tail_pad_for(20.0, 35.0)
    assert A.LEAD_PAD_S + 20.0 + tail == pytest.approx(35.0)
    # a 63 s ad already clears it, so the tail stays at the default
    assert A.tail_pad_for(63.0, 35.0) == A.TAIL_PAD_S


def _tiny_masks(n_vert=40):
    a = np.zeros(n_vert, bool)
    a[:10] = True
    b = np.zeros(n_vert, bool)
    b[10:20] = True
    return [("Vis", a), ("DorsAttn", b)]


def test_preds_to_lanes_is_relative_to_the_black_screen():
    """Zero must mean 'no different from the model's response to a black screen' — that
    is what puts different ads on one ruler."""
    masks = _tiny_masks()
    onsets = np.arange(0.0, 18.0)
    preds = np.zeros((18, 40))
    content = (onsets >= 5.0) & (onsets < 10.0)
    preds[content, 10:20] = 2.0                  # DorsAttn driven during content only
    lanes, times, base, sds = A.preds_to_lanes(preds, onsets, 5.0, 10.0, masks)
    assert np.allclose(lanes["DorsAttn|sgn"], 2.0)
    assert np.allclose(lanes["Vis|sgn"], 0.0)    # untouched ROI sits at zero
    assert list(times) == [0.0, 1.0, 2.0, 3.0, 4.0]
    assert base["DorsAttn|sgn"] == 0.0


def test_preds_to_lanes_refuses_an_empty_window():
    masks = _tiny_masks()
    onsets = np.arange(0.0, 5.0)                 # no timepoint lands in the content span
    with pytest.raises(ValueError, match="empty window"):
        A.preds_to_lanes(np.zeros((5, 40)), onsets, 90.0, 95.0, masks)


# ------------------------------------------------------------------ feature row
def _fake_lane_dict(value=1.0, T=20):
    return {n: np.full(T, value) for n in A.lane_names()}


def test_feature_row_names_align_and_cover_the_ladder():
    lanes, times = _fake_lane_dict(), np.arange(20.0)
    cov = {"duration_s": 20.0, "n_sec": 20.0, "log_age": 4.0}
    cov.update({k: 0.5 for k in A.CONTROL_SUMMARY_NAMES})
    sizes = {}
    for blocks in (("mean",), ("mean", "shape"), ("mean", "shape", "leaky")):
        vals, names = A.feature_row(lanes, times, cov, blocks, 0.5, True)
        assert len(vals) == len(names) == len(set(names))
        sizes[blocks] = len(vals)
    n_lanes, n_cov = len(A.lane_names()), 3 + len(A.CONTROL_SUMMARY_NAMES)
    assert sizes[("mean",)] == 2 * n_lanes + n_cov
    assert sizes[("mean", "shape")] == 5 * n_lanes + n_cov
    assert sizes[("mean", "shape", "leaky")] == 7 * n_lanes + n_cov


def test_feature_row_covariates_only_when_no_blocks():
    """The --controls-only path: no lanes at all, so it must not touch them."""
    vals, names = A.feature_row({}, [], {"duration_s": 3.0, "n_sec": 3.0}, (), 0.0, False)
    assert all(n.startswith("cov.") for n in names)
    assert "cov.log_age" not in names            # tiktok has no start dates
    assert len(vals) == 2 + len(A.CONTROL_SUMMARY_NAMES)


def test_hook_window_is_absolute_not_relative():
    """3 s is 3 s whether the ad is 12 s or 90 s. Making the hook relative would turn it
    into a duration proxy — the exact confound that sank cuts_mean on tiktok."""
    lanes = {n: np.arange(90.0) for n in A.lane_names()}
    cov = {"duration_s": 90.0, "n_sec": 90.0}
    vals, names = A.feature_row(lanes, np.arange(90.0), cov, ("mean",), 0.0, False)
    hook = vals[names.index("Vis|mag.hook")]
    assert hook == pytest.approx(np.mean([0.0, 1.0, 2.0]))


def test_drop_and_impute_drops_all_nan_columns():
    X = np.array([[1.0, np.nan, 3.0], [2.0, np.nan, 4.0], [3.0, np.nan, 5.0]])
    Xk, names, dropped = A.drop_and_impute(X, ["a", "b", "c"])
    assert names == ["a", "c"] and dropped == ["b"] and Xk.shape == (3, 2)


# ------------------------------------------------------------------ labels
def test_parse_note():
    adv, start = A.parse_note("lib1622831325605716;page_Hismile;start_Apr_20_2026")
    assert adv == "Hismile" and start == dt.date(2026, 4, 20)
    assert A.parse_note("lib123") == (None, None)
    assert A.parse_note("")[0] is None
    assert A.parse_note("page_A_B;start_Xxx_99_2026") == ("A_B", None)   # bad month/day


def _write_manifest(path, rows):
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ad_id", "outcome", "platform", "note"])
        w.writerows(rows)


def test_load_labels_meta_uses_log1p_and_age(tmp_path):
    _write_manifest(tmp_path / "ad_manifest_meta.csv",
                    [["meta_00", "91.0", "meta", "lib1;page_Acme;start_Apr_20_2026"]])
    rows = A.load_labels(str(tmp_path), "meta", dt.date(2026, 7, 30))
    r = rows[0]
    assert r["y"] == pytest.approx(math.log1p(91.0))
    assert r["advertiser"] == "Acme" and r["days"] == 91.0
    assert r["age_days"] == (dt.date(2026, 7, 30) - dt.date(2026, 4, 20)).days
    assert r["log_age"] == pytest.approx(math.log(r["age_days"]))


def test_load_labels_tiktok_uses_the_sign_corrected_outcome(tmp_path):
    """ad_manifest_tiktok.csv carries 1 - percentile so higher is better. Reading
    ad_performance.ctr_index instead would flip the sign of every correlation."""
    _write_manifest(tmp_path / "ad_manifest_tiktok.csv",
                    [["tt_00", "0.99", "tiktok", "tt123;ctr_0.01;ctrpct_0.01"]])
    r = A.load_labels(str(tmp_path), "tiktok", dt.date(2026, 7, 30))[0]
    assert r["y"] == 0.99 and math.isnan(r["log_age"]) and r["days"] is None


def test_load_labels_refuses_to_pool_platforms(tmp_path):
    """primary_label holds two different quantities depending on platform. Pooling them
    gives a number, and the number means nothing."""
    _write_manifest(tmp_path / "ad_manifest_meta.csv",
                    [["meta_00", "91", "meta", "n"], ["tt_00", "0.9", "tiktok", "n"]])
    with pytest.raises(SystemExit, match="Refusing to pool platforms"):
        A.load_labels(str(tmp_path), "meta", dt.date(2026, 7, 30))


# ------------------------------------------------------------------ CV plumbing
def test_group_kfold_never_splits_a_group():
    """82% of the meta label's variance is between advertiser, so an advertiser landing in
    both train and test would let the model memorise the brand and call it creative."""
    groups = np.array([f"adv_{i % 17}" for i in range(200)])
    splits = A.group_kfold(groups, 5)
    assert len(splits) == 5
    seen = set()
    for train, test in splits:
        assert set(groups[train]).isdisjoint(set(groups[test]))
        assert len(train) + len(test) == 200
        seen.update(test.tolist())
    assert seen == set(range(200))          # every ad is held out exactly once


def test_group_kfold_is_deterministic():
    groups = np.array([f"a{i % 9}" for i in range(60)])
    a = [t.tolist() for _, t in A.group_kfold(groups, 4)]
    b = [t.tolist() for _, t in A.group_kfold(groups, 4)]
    assert a == b


def test_standardize_fits_on_train_only_and_imputes_to_the_train_mean():
    X_tr = np.array([[0.0], [10.0]])
    X_te = np.array([[np.nan], [10.0]])
    tr, te, mu, sd = A._standardize(X_tr, X_te)
    assert mu[0] == pytest.approx(5.0)
    assert te[0, 0] == pytest.approx(0.0)      # NaN -> train mean -> z of 0
    assert te[1, 0] == pytest.approx(1.0)


# ------------------------------------------------------------------ machine honesty
def _synthetic_corpus(n_ads=120, noise=0.35, seed=0):
    """Ads whose DorsAttn|mag lane carries a planted latent, with the label built from
    that same latent. Advertisers are assigned so the grouped CV has something to group.
    """
    rng = np.random.default_rng(seed)
    feats, labels = {}, []
    for i in range(n_ads):
        ad_id = f"syn_{i:03d}"
        latent = rng.uniform(0.0, 1.0)
        T = int(rng.integers(10, 45))
        lanes = {n: rng.normal(0.0, noise, T) for n in A.lane_names()}
        lanes["DorsAttn|mag"] = lanes["DorsAttn|mag"] + latent
        cov = {k: float(rng.normal()) for k in A.CONTROL_SUMMARY_NAMES}
        cov["duration_s"] = float(T)
        cov["n_sec"] = float(T)
        feats[ad_id] = {"lanes": {k: v.tolist() for k, v in lanes.items()},
                        "times": np.arange(float(T)).tolist(), "covariates": cov}
        labels.append({"ad_id": ad_id, "y": 5.0 * latent,
                       "advertiser": f"brand_{i % 20}",
                       "log_age": float(rng.normal(5.0, 1.0)),   # pure noise covariate
                       "start": dt.date(2026, 1, 1), "days": None, "age_days": None})
    return feats, labels


def test_planted_signal_is_recovered_out_of_fold():
    feats, labels = _synthetic_corpus()
    X, y, groups, names, _ = A.build_design(feats, labels, ("mean", "shape"), 0.0, True)
    X, names, _ = A.drop_and_impute(X, names)
    oof, folds = A.cross_validate(X, y, groups, A.group_kfold(groups, 5))
    ok = ~np.isnan(oof)
    assert len(folds) == 5
    assert A.spearman(oof[ok], y[ok]) > 0.8


def test_shuffled_labels_collapse():
    """The mandatory leakage control. If this does NOT collapse, the split or the
    features leak and no other number in the run means anything."""
    feats, labels = _synthetic_corpus()
    X, y, groups, names, _ = A.build_design(feats, labels, ("mean", "shape"), 0.0, True)
    X, names, _ = A.drop_and_impute(X, names)
    y_sh = np.random.default_rng(7).permutation(y)
    oof, _ = A.cross_validate(X, y_sh, groups, A.group_kfold(groups, 5))
    ok = ~np.isnan(oof)
    assert abs(A.spearman(oof[ok], y_sh[ok])) < 0.25


def test_shuffle_control_runs_negative_not_positive():
    """A shuffled target reliably produces a NEGATIVE partial (out-of-fold shrinkage),
    which is why the poisoned gate in _run_cv is ONE-SIDED. Leakage means the shuffled
    model still scores POSITIVELY."""
    rng = np.random.default_rng(0)
    n, p = 400, 8
    Z = rng.normal(size=(n, p))
    y = rng.permutation(Z @ rng.normal(size=p) + rng.normal(size=n))
    groups = np.array([f"g{i % 40}" for i in range(n)])
    oof, _ = A.cross_validate(Z, y, groups, A.group_kfold(groups, 5))
    ok = ~np.isnan(oof)
    assert A.partial_spearman(oof[ok], y[ok], Z[ok]) < A.effect_floor(n)


def test_build_design_gives_unparsed_advertisers_their_own_group():
    """An ad with no page_ in its note must not be pooled with the other unparsed ones —
    that would silently leak across brands inside a fold."""
    feats, labels = _synthetic_corpus(n_ads=20)
    for lab in labels[:5]:
        lab["advertiser"] = None
    _, _, groups, _, ids = A.build_design(feats, labels, ("mean",), 0.0, True)
    solos = [g for g in groups if g.startswith("__solo__")]
    assert len(set(solos)) == 5


def test_fake_latent_is_stable_and_spread():
    """--fake-preds plants a per-ad latent; a test must be able to derive the SAME value
    to build labels from, so it has to be deterministic across processes."""
    assert A._fake_latent("meta_05") == A._fake_latent("meta_05")
    assert A._fake_latent("meta_05") != A._fake_latent("meta_06")
    vals = [A._fake_latent(f"ad_{i}") for i in range(300)]
    assert 0.0 <= min(vals) and max(vals) <= 1.0
    assert 0.35 < float(np.mean(vals)) < 0.65


# ------------------------------------------------------------------ controls-only
def test_controls_only_reads_the_corpus_tables(tmp_path):
    """The floor must be measurable with NO preds, NO atlas and NO video present."""
    base = tmp_path / "baseline"
    base.mkdir()
    with open(base / "baseline_a1.csv", "w") as fh:
        fh.write("t_sec,loudness,cuts,luminance,motion\n")
        for t in range(10):
            fh.write(f"{t},{t / 10:.2f},0.5,0.4,0.3\n")
    with open(tmp_path / "ad_media.csv", "w") as fh:
        fh.write("ad_id,duration_s\na1,10.0\n")
    labels = [{"ad_id": "a1"}, {"ad_id": "missing"}]
    feats = A.controls_only_feats(str(tmp_path), labels, str(base))
    assert set(feats) == {"a1"}
    cov = feats["a1"]["covariates"]
    assert cov["duration_s"] == 10.0 and cov["n_sec"] == 10.0
    assert cov["loudness_trend"] > 0          # the series rises, so late > early
    assert cov["cuts_trend"] == pytest.approx(0.0)
    assert feats["a1"]["lanes"] == {}


def test_control_summaries_are_nan_not_zero_when_unmeasurable():
    """A silent video is NOT a quiet one — a zero would be a real measurement."""
    out = A.control_summaries({f: np.array([0.1, 0.2]) for f in A.CONTROL_FEATURES})
    assert all(math.isnan(v) for v in out.values())      # < 4 seconds: unmeasurable


# ------------------------------------------------------------------ model contract
def test_lane_names_cover_every_yeo_network_twice():
    names = A.lane_names()
    assert len(names) == 2 * len(A.YEO_TAGS) == 14
    for tag in A.YEO_TAGS:
        assert f"{tag}|mag" in names and f"{tag}|sgn" in names


def test_pad_constants_match_process_batch():
    """Stimulus parity is the whole point: training features and inference features have
    to come from the same padded stimulus. If demo/process_batch.py moves, this fails."""
    assert (A.LEAD_PAD_S, A.TAIL_PAD_S) == (5.0, 8.0)
    assert (A.BASELINE_LEAD_SKIP_S, A.BASELINE_TAIL_SKIP_S) == (1.0, 3.0)
    assert A.BASELINE_TAIL_SPAN_S == 5.0
    assert A.HOOK_WINDOW_S == 3.0
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "demo", "process_batch.py")
    if os.path.exists(src):
        text = open(src).read()
        for line in ("LEAD_PAD_S = 5.0", "TAIL_PAD_S = 8.0",
                     "BASELINE_LEAD_SKIP_S = 1.0", "BASELINE_TAIL_SKIP_S = 3.0"):
            assert line in text, f"process_batch.py no longer says `{line}`"
