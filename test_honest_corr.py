#!/usr/bin/env python3
"""
test_honest_corr.py — the stats/alignment core in honest_corr_timeseries.py.

Why this module first: it is the only thing every other analysis module shares.
head_io, train_head, affect_head, head_apply and incremental_validity all import
from it (`_read_csv`, `resample_to_grid`, `spearman`, `circular_shift_p`,
`_rankdata`, `pearson`, `first_diff`, `stouffer`, `fisher`), so a silent change
here moves every number the pipeline reports. None of it was executed by a test.

Four properties, chosen because each one is a claim the module makes in prose and
nothing checks:

  * circular_shift_p ENUMERATES the shift set rather than sampling it whenever
    M <= n_perm, so the honest p floor is 1/(M+1) — not the 1/(n_perm+1) a reader
    would assume — and the result carries no RNG at all.
  * resample_to_grid's bins are HALF-OPEN at the top: a sample landing exactly on
    the final edge is dropped. Load-bearing (head_io._shot_edges compensates for
    it) and documented nowhere.
  * _rankdata claims to match scipy's 'average' tie handling; scipy is a declared
    dependency, so assert it against scipy instead of against hand-computed ranks.
  * pearson/spearman return NaN, never a number, for the degenerate inputs a short
    or flat arc produces — a fabricated 0.0 or 1.0 there would propagate straight
    into a reported r.

Fixtures are built inline: a fresh clone has no tests/ directory (it is gitignored
and local-only), so anything reading tests/synth/ passes here and fails elsewhere.

Run: .venv/bin/python -m pytest -q
"""
import numpy as np
import pytest
import scipy.stats as st

import honest_corr_timeseries as H


# ---------------------------------------------------------------------------
# circular_shift_p — the permutation null
# ---------------------------------------------------------------------------
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
    # The number a reader assuming "5000 permutations" would expect. The point of
    # the enumerate branch is that the module refuses to claim this precision.
    assert p > 1.0 / (H.DEFAULT_N_PERM + 1)


def test_circular_shift_p_ignores_the_seed_while_it_enumerates():
    x = np.arange(20.0)
    y = np.roll(x, 4) + 0.5 * np.arange(20.0)
    assert H.circular_shift_p(x, y, seed=0) == H.circular_shift_p(x, y, seed=987654321)


def test_circular_shift_p_samples_and_becomes_seed_dependent_above_n_perm():
    # Force the other branch: n_perm below M means the shift set is sampled WITHOUT
    # replacement, and the denominator drops to the number actually evaluated.
    rng = np.random.default_rng(1)
    x = H.first_diff(np.cumsum(rng.standard_normal(61)))
    y = H.first_diff(np.cumsum(rng.standard_normal(61)))

    p0, r0, _ = H.circular_shift_p(x, y, n_perm=5, seed=0)
    p1, r1, _ = H.circular_shift_p(x, y, n_perm=5, seed=1)
    assert r0 == r1                       # r_obs never depends on the null
    assert p0 != p1                       # ...but the sampled p does
    for p in (p0, p1):
        assert p == pytest.approx(round(p * 6) / 6)  # denominator is 5 + 1, not M + 1


def test_circular_shift_p_refuses_degenerate_input():
    # Too short to have an autocorrelation-preserving null at all.
    p, r, n = H.circular_shift_p(np.arange(7.0), np.arange(7.0))
    assert np.isnan(p) and n == 0

    # Flat series: r_obs is undefined, so no p may be reported for it.
    p, r, n = H.circular_shift_p(np.ones(20), np.arange(20.0))
    assert np.isnan(p) and np.isnan(r) and n == 0


# ---------------------------------------------------------------------------
# resample_to_grid — model arc onto the human shot grid
# ---------------------------------------------------------------------------
def test_resample_to_grid_bins_are_half_open_at_the_top():
    # Three edges -> two bins, and the sample sitting exactly on the LAST edge is
    # silently dropped (np.digitize returns len(edges)-1 for it, never a valid bin).
    # Pinned deliberately: head_io._shot_edges ceils its final edge past the arc to
    # work around this, so a change on either side would quietly resurrect it.
    out = H.resample_to_grid([0, 1, 2], [10, 20, 30], [0, 1, 2])
    np.testing.assert_array_equal(out, [10.0, 20.0])


def test_resample_to_grid_averages_within_a_bin_and_nans_an_empty_one():
    out = H.resample_to_grid([0.0, 0.5, 1.2], [10.0, 20.0, 7.0], [0, 1, 2])
    np.testing.assert_allclose(out, [15.0, 7.0])

    # An empty bin must come back NaN, not 0.0 — test_one_video drops NaN bins from
    # the alignment, but a 0.0 would be treated as a real measured dip.
    out = H.resample_to_grid([0.1], [5.0], [0, 1, 2, 3])
    assert out[0] == 5.0
    assert np.isnan(out[1]) and np.isnan(out[2])


def test_resample_to_grid_drops_samples_outside_the_grid():
    out = H.resample_to_grid([-1.0, 0.5, 9.0], [1.0, 2.0, 3.0], [0, 1, 2])
    np.testing.assert_array_equal(out[0], 2.0)   # only the in-range sample counted
    assert np.isnan(out[1])


# ---------------------------------------------------------------------------
# _rankdata — the tie handling spearman() rests on
# ---------------------------------------------------------------------------
def test_rankdata_matches_scipy_average_ranks():
    # Ties at three different multiplicities (1.0 x2, 3.0 x2, 5.0 x2), plus a run of
    # four identical values, which is where a naive ordinal rank diverges most.
    a = np.array([3.0, 1.0, 4.0, 1.0, 5.0, 9.0, 2.0, 6.0, 5.0, 3.0])
    np.testing.assert_allclose(H._rankdata(a), st.rankdata(a, method="average"))

    b = np.array([2.0, 2.0, 2.0, 2.0, 1.0])
    np.testing.assert_allclose(H._rankdata(b), st.rankdata(b, method="average"))


def test_spearman_is_pearson_on_scipy_ranks():
    x = np.array([1.0, 5.0, 3.0, 3.0, 9.0, 2.0, 7.0, 4.0])
    y = np.array([2.0, 4.0, 4.0, 1.0, 8.0, 3.0, 6.0, 5.0])
    assert H.spearman(x, y) == pytest.approx(st.spearmanr(x, y).statistic)


# ---------------------------------------------------------------------------
# pearson / spearman — NaN rather than a fabricated number
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("x, y", [
    ([1.0, 2.0], [1.0, 2.0]),              # len < 3
    ([1.0], [1.0]),
    ([1.0, 1.0, 1.0], [1.0, 2.0, 3.0]),    # x has no variance
    ([1.0, 2.0, 3.0], [4.0, 4.0, 4.0]),    # y has no variance
])
def test_pearson_returns_nan_for_degenerate_input(x, y):
    assert np.isnan(H.pearson(x, y))


def test_spearman_returns_nan_below_three_points():
    assert np.isnan(H.spearman([1.0, 2.0], [3.0, 4.0]))


def test_pearson_rejects_a_residualized_constant():
    """Subtracting a fitted mean from a constant series in float leaves ~1e-16 rounding
    noise, not exact zeros. An exact std()==0 guard passes it through and corrcoef
    manufactures an r out of that noise; the tolerance guard must return NaN instead."""
    t = np.arange(32, dtype=float)
    x = np.full(32, 1.0)
    x[::2] += 3e-16                      # what float subtraction leaves of a constant
    assert x.std() > 0                   # an exact check would have let this through
    assert np.isnan(H.pearson(x, np.sin(t / 5.0)))
    assert np.isnan(H.pearson(np.sin(t / 5.0), x))


def test_pearson_is_a_real_number_once_the_guards_pass():
    # The guards must not be so eager that the smallest legitimate input is refused.
    assert H.pearson([1.0, 2.0, 3.0], [2.0, 4.0, 7.0]) == pytest.approx(0.99339926, abs=1e-6)
