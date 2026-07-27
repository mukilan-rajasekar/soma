#!/usr/bin/env python3
"""
test_train_head.py — the leakage-safety of the fit machinery.

train_head.py is the fit half of the pipeline, and affect_head.py reuses it
wholesale (pool_features, _standardize, ridge_fit, paired_sign_perm), so a leak
here is a leak in both. None of it was executed by a test until this file.

What is pinned here:

  * _standardize is PER-VIDEO and uses ONLY that video's good shots. Its
    docstring calls this leakage-safe; the test executes it — set a masked-out
    row to 1e6 and every good row must come back bit-identical, because mu/sd
    never saw the bad row. _ztarget is the same claim on the target side, and a
    leak in y is exactly as bad as a leak in X.
  * pool_features' column contract: exactly 2 columns per mask, in
    [mean|preds| , mean signed preds] order. Swapping the two would silently
    replace every magnitude feature with a signed one and nothing downstream
    would notice, so the fixture is built so the pair differ in sign. It also
    raises rather than broadcasting when a mask length disagrees with the
    vertex count.
  * paired_sign_perm is EXACT for n <= 18. Five equal positive deltas admit
    exactly two sign vectors (all-+ and all--) that reach the observed mean, so
    p is exactly 2/32 = 0.0625 — an identity, not a sampled approximation, and
    therefore carrying no RNG at all.
  * ridge_fit leaves the intercept unpenalized: alpha -> infinity drives every
    weight to 0 but the intercept stays at mean(y), so an over-regularized head
    predicts the mean rather than zero.
  * _diff_pair's both-endpoints-valid contiguity rule, and the >= 8 usable
    diffs floor below which score_r returns NaN instead of a correlation over
    almost nothing.

Fixtures are built inline: a fresh clone has no tests/ directory (it is
gitignored and local-only), so anything reading tests/synth/ passes here and
fails everywhere else.

Run: .venv/bin/python -m pytest -q
"""
import numpy as np
import pytest

import train_head as T


# -----------------------------------------------------------------------------
# _standardize / _ztarget — the leakage claim, executed
# -----------------------------------------------------------------------------
def _masked_matrix(n=12, p=3, seed=0):
    """(X, good) with two shots masked out, as video_data's NaN filter would."""
    X = np.random.default_rng(seed).normal(size=(n, p))
    good = np.ones(n, bool)
    good[4] = False
    good[9] = False
    return X, good


def test_standardize_ignores_masked_out_rows():
    """The leakage claim: a bad row cannot move the scaling of the good rows."""
    X, good = _masked_matrix()
    before = T._standardize(X, good)

    poisoned = X.copy()
    poisoned[4, :] = 1e6          # a wild value in a shot the mask already drops
    after = T._standardize(poisoned, good)

    # bit-identical, not merely close: mu/sd are computed from X[good] alone.
    assert np.array_equal(before[good], after[good])
    # ...and the poisoned row itself DID move, so the test is not passing by
    # accident on a function that ignores its input.
    assert not np.isclose(before[4, 0], after[4, 0])


def test_standardize_is_zscore_over_good_rows_only():
    X, good = _masked_matrix()
    Xs = T._standardize(X, good)
    for j in range(X.shape[1]):
        assert abs(float(Xs[good, j].mean())) < 1e-12
        assert abs(float(Xs[good, j].std()) - 1.0) < 1e-12
    # bad rows are still scaled by the good-row constants (not dropped, not NaN)
    assert np.all(np.isfinite(Xs))


def test_standardize_constant_column_does_not_divide_by_zero():
    """sd <= 1e-9 falls back to 1.0, so a dead feature centres to 0 rather than inf."""
    X, good = _masked_matrix()
    X = np.column_stack([np.ones(X.shape[0]), X])
    Xs = T._standardize(X, good)
    assert np.all(Xs[:, 0] == 0.0)


def test_ztarget_ignores_masked_out_rows():
    """Same leakage rule on the target side."""
    human = np.arange(1.0, 10.0)
    human = np.append(human, 1e6)          # last shot is masked out
    good = np.ones(human.shape[0], bool)
    good[-1] = False

    z = T._ztarget(human, good)
    assert abs(float(z[good].mean())) < 1e-12
    assert abs(float(z[good].std()) - 1.0) < 1e-12

    other = human.copy()
    other[-1] = -1e9
    assert np.array_equal(T._ztarget(other, good)[good], z[good])


def test_ztarget_flat_target_does_not_divide_by_zero():
    good = np.ones(10, bool)
    assert np.all(T._ztarget(np.ones(10), good) == 0.0)


# -----------------------------------------------------------------------------
# pool_features — the column contract affect_head also depends on
# -----------------------------------------------------------------------------
def _two_mask_fixture():
    """Two masks whose magnitude and signed means differ, and differ in SIGN.

    mask a over cols (0,1): row0 = [1, -3] -> mag 2, sgn -1
    mask b over cols (2,3): row0 = [2, -2] -> mag 2, sgn  0
    A mag/sgn swap therefore changes the numbers, not just their labels.
    """
    preds = np.array([[1.0, -3.0, 2.0, -2.0],
                      [5.0, -1.0, -4.0, 4.0]])
    masks = [("a", np.array([True, True, False, False])),
             ("b", np.array([False, False, True, True]))]
    return preds, masks


def test_pool_features_two_columns_per_mask_in_mag_then_sign_order():
    preds, masks = _two_mask_fixture()
    F = T.pool_features(preds, masks)
    assert F.shape == (2, 4)                       # 2 seconds, 2 cols x 2 masks
    expected = np.array([[2.0, -1.0, 2.0, 0.0],
                         [3.0, 2.0, 4.0, 0.0]])
    assert np.allclose(F, expected)
    # the discriminating pair: mask a's magnitude is positive while its signed
    # mean is negative, so the two columns cannot be silently transposed.
    assert F[0, 0] > 0 and F[0, 1] < 0


def test_pool_features_magnitude_column_is_never_negative():
    """Column 2k is mean|preds|; an all-negative ROI must still pool positive."""
    preds = np.full((3, 4), -2.0)
    masks = [("a", np.array([True, True, False, False]))]
    F = T.pool_features(preds, masks)
    assert np.all(F[:, 0] == 2.0)      # magnitude
    assert np.all(F[:, 1] == -2.0)     # signed direction


def test_pool_features_rejects_mask_of_wrong_length():
    preds, _ = _two_mask_fixture()
    with pytest.raises(ValueError):
        T.pool_features(preds, [("bad", np.array([True, False]))])


def test_feature_names_matches_pool_features_layout_plus_baseline():
    """The serialized names must describe the columns pool_features emits."""
    preds, masks = _two_mask_fixture()
    names = T.feature_names(masks)
    assert names == ["a|mag", "a|sgn", "b|mag", "b|sgn",
                     "roi_mag(nested baseline)"]
    # F pooled columns + 1 baseline column, which is what video_data stacks.
    assert len(names) == T.pool_features(preds, masks).shape[1] + 1


# -----------------------------------------------------------------------------
# paired_sign_perm — exact, not sampled, for the video counts we actually have
# -----------------------------------------------------------------------------
def test_paired_sign_perm_is_exact_for_five_equal_deltas():
    """Only the all-+ and all-- sign vectors reach |mean| >= obs, so p == 2/32."""
    p, med = T.paired_sign_perm([0.2] * 5)
    assert p == pytest.approx(2.0 / 32.0)
    assert p == pytest.approx(0.0625)
    assert med == pytest.approx(0.2)


def test_paired_sign_perm_enumerate_branch_ignores_seed():
    """n <= 18 enumerates all 2^n sign vectors, so there is no RNG to seed."""
    a = T.paired_sign_perm([0.2] * 5, seed=0)
    b = T.paired_sign_perm([0.2] * 5, seed=12345)
    assert a == b


def test_paired_sign_perm_drops_nan_deltas_before_counting():
    """A skipped video must not change the denominator (2^5, not 2^6)."""
    p, med = T.paired_sign_perm([0.2, 0.2, 0.2, 0.2, 0.2, np.nan])
    assert p == pytest.approx(0.0625)
    assert med == pytest.approx(0.2)


def test_paired_sign_perm_needs_three_videos():
    """Fewer than 3 deltas returns NaN rather than a p-value, but keeps a median."""
    p, med = T.paired_sign_perm([0.2, 0.3])
    assert np.isnan(p)
    assert med == pytest.approx(0.25)

    p0, med0 = T.paired_sign_perm([])
    assert np.isnan(p0) and np.isnan(med0)


def test_paired_sign_perm_mixed_signs_are_not_significant():
    """A null-looking delta set must not come back at the p-floor."""
    p, _ = T.paired_sign_perm([0.2, -0.2, 0.2, -0.2, 0.05])
    assert p > 0.5


# -----------------------------------------------------------------------------
# ridge_fit — the intercept is unpenalized
# -----------------------------------------------------------------------------
def _linear_fixture(n=30, seed=1):
    X = np.random.default_rng(seed).normal(size=(n, 3))
    w = np.array([1.0, -2.0, 0.5])
    return X, X @ w + 7.0, w


def test_ridge_fit_recovers_ols_at_negligible_alpha():
    X, y, w_true = _linear_fixture()
    w, b = T.ridge_fit(X, y, 1e-12)
    assert np.allclose(w, w_true, atol=1e-6)
    assert b == pytest.approx(7.0, abs=1e-6)


def test_ridge_fit_intercept_is_unpenalized():
    """alpha -> infinity shrinks the weights to 0 but leaves the intercept at
    mean(y): an over-regularized head predicts the mean, not zero."""
    X, y, _ = _linear_fixture()
    w, b = T.ridge_fit(X, y, 1e9)
    assert np.allclose(w, 0.0, atol=1e-6)
    assert b == pytest.approx(float(y.mean()), abs=1e-6)


# -----------------------------------------------------------------------------
# _diff_pair / score_r — contiguity and the usable-diff floor
# -----------------------------------------------------------------------------
def test_diff_pair_never_bridges_a_dropped_shot():
    """A masked-out interior shot removes BOTH diffs that touch it, so two
    non-adjacent shots are never differenced into a fabricated co-movement."""
    pred = np.arange(12.0)
    human = 2.0 * np.arange(12.0)
    good = np.ones(12, bool)

    d_pred, d_hum = T._diff_pair(pred, human, good)
    assert d_pred.shape == (11,)
    assert np.all(d_pred == 1.0) and np.all(d_hum == 2.0)

    punched = good.copy()
    punched[5] = False
    d_pred2, d_hum2 = T._diff_pair(pred, human, punched)
    assert d_pred2.shape == (9,)          # 11 - 2, not 11 - 1
    assert np.all(d_pred2 == 1.0)         # no step of 2 bridging the gap
    assert np.all(np.isfinite(d_pred2)) and np.all(np.isfinite(d_hum2))


def test_diff_pair_floor_is_eight_usable_diffs():
    pred = np.arange(12.0)
    human = 2.0 * np.arange(12.0)

    seven = np.zeros(12, bool)
    seven[:8] = True                      # 8 good shots -> 7 diffs
    assert T._diff_pair(pred, human, seven) == (None, None)
    assert np.isnan(T.score_r(pred, human, seven))

    eight = np.zeros(12, bool)
    eight[:9] = True                      # 9 good shots -> 8 diffs
    d_pred, _ = T._diff_pair(pred, human, eight)
    assert d_pred.shape == (8,)


def test_score_r_is_rank_correlation_of_the_first_differences():
    human = np.random.default_rng(3).normal(size=14).cumsum()
    good = np.ones(14, bool)
    assert T.score_r(human, human, good) == pytest.approx(1.0)
    assert T.score_r(-human, human, good) == pytest.approx(-1.0)
    # and it survives a punched-out shot rather than going NaN
    punched = good.copy()
    punched[6] = False
    assert T.score_r(human, human, punched) == pytest.approx(1.0)
