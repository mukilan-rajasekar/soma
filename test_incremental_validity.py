#!/usr/bin/env python3
"""
test_incremental_validity.py — the "why not just use ffmpeg?" module.

incremental_validity.py answers killer question #2: does the brain arc predict
human interest OVER AND ABOVE a dumb audiovisual baseline (loudness/cuts/
luminance/motion)? Its whole verdict rests on a partial correlation collapsing
to ~0 when the "neural" read is only re-deriving the edit. Nothing executed that
claim until this file.

What is pinned here:

  * partial_spearman really does partial. Feed it a brain arc and a human arc
    that are BOTH the baseline plus 1% noise and the raw rank r is ~1.00 while
    the partial drops to ~0 — that is the "no lift over baseline" verdict, in
    one assertion. The mirror case matters just as much: a shared signal the
    baseline does NOT contain must SURVIVE partialling, or the module would
    report "no lift" for everything and look conservative while being broken.
  * _residualize leaves residuals orthogonal to every covariate and to the
    intercept — the property that makes the above a partial correlation rather
    than a subtraction.
  * _align puts each source on ITS OWN timebase. Its docstring describes a bug
    that used to crash on the routine ~1s arc/baseline length mismatch; this
    pins the fix with a 39-sample baseline against a 42-sample arc.
  * _align's both-endpoints-valid contiguity rule. A dropped interior bin must
    not let two non-adjacent shots be differenced against each other and
    fabricate a co-movement.
  * partial_shift_p's shift policy, which its docstring says "mirrors
    circular_shift_p exactly": enumerate when the shift set fits inside n_perm,
    so the honest p-floor is 1/(M+1) and the result carries no RNG.

Fixtures are built inline: a fresh clone has no tests/ directory (it is
gitignored and local-only), so anything reading tests/synth/ passes here and
fails everywhere else.

Run: .venv/bin/python -m pytest -q
"""
import numpy as np
import pytest

import honest_corr_timeseries as H
import incremental_validity as IV


def _baseline_and_two_echoes(n=60, seed=0):
    """A baseline z, plus two series that are z + 1% noise and nothing else.

    This is the shape of the failure the module exists to detect: the brain arc
    and the human arc agree almost perfectly, but only because both are the edit.
    """
    rng = np.random.default_rng(seed)
    z = rng.normal(size=n)
    jitter = 0.01 * np.std(z)
    x = z + jitter * rng.normal(size=n)
    y = z + jitter * rng.normal(size=n)
    return x, y, z.reshape(-1, 1)


# ---------------------------------------------------------------------------
# partial_spearman — the verdict
# ---------------------------------------------------------------------------
def test_partial_collapses_when_the_brain_arc_only_redraws_the_baseline():
    x, y, Z = _baseline_and_two_echoes()

    raw = H.pearson(H._rankdata(x), H._rankdata(y))
    partial = IV.partial_spearman(x, y, Z)

    # Raw agreement is essentially total -- and worth nothing.
    assert raw > 0.9
    # Once the baseline is removed from both, there is nothing left.
    assert abs(partial) < 0.3


def test_partial_survives_a_signal_the_baseline_does_not_contain():
    """The mirror of the test above: partialling must not erase real lift.

    A module that reported "no lift over baseline" unconditionally would pass
    the collapse test and be useless. Give the brain arc and the human arc a
    shared component ORTHOGONAL to the baseline and the partial has to hold up.
    """
    rng = np.random.default_rng(11)
    n = 60
    z = rng.normal(size=n)
    shared = rng.normal(size=n)
    shared -= z * (shared @ z) / (z @ z)          # orthogonal to the baseline
    x = z + shared
    y = z + shared + 0.1 * rng.normal(size=n)
    Z = z.reshape(-1, 1)

    assert H.pearson(H._rankdata(x), H._rankdata(y)) > 0.9
    assert IV.partial_spearman(x, y, Z) > 0.9


def test_partial_with_no_covariates_is_the_plain_rank_correlation():
    """Z with zero columns takes the Z.size fallback: intercept-only residuals.

    Mean-centring cannot change a Pearson r, so the "partial" degenerates to the
    plain Spearman -- which is the only sane reading of "controlling for
    nothing", and is what happens for a video whose baseline CSV has none of the
    four feature columns.
    """
    rng = np.random.default_rng(7)
    n = 30
    x = rng.normal(size=n)
    y = x + 0.5 * rng.normal(size=n)

    assert IV.partial_spearman(x, y, np.zeros((n, 0))) == pytest.approx(H.spearman(x, y))


# ---------------------------------------------------------------------------
# _residualize
# ---------------------------------------------------------------------------
def test_residualize_leaves_nothing_the_covariates_can_explain():
    rng = np.random.default_rng(4)
    n = 50
    Z = rng.normal(size=(n, 3))
    y = 2.0 * Z[:, 0] - Z[:, 2] + 0.3 * rng.normal(size=n)

    res = IV._residualize(y, Z)

    for j in range(Z.shape[1]):
        assert abs(res @ Z[:, j]) < 1e-8
    assert abs(res.sum()) < 1e-8          # orthogonal to the intercept column too


def test_residualize_without_covariates_is_mean_centring():
    y = np.array([1.0, 4.0, 10.0, 5.0])

    res = IV._residualize(y, np.zeros((4, 0)))

    assert res == pytest.approx(y - y.mean())


# ---------------------------------------------------------------------------
# _align — three timebases, one grid
# ---------------------------------------------------------------------------
def _shot_grid(n_shots=20, shot_sec=2.0):
    t = np.arange(n_shots) * shot_sec
    # Every adjacent shot differs by exactly 1, so any first-difference that
    # bridges a dropped bin shows up as a 2.
    return t, np.arange(n_shots, dtype=float)


def test_align_survives_a_baseline_on_a_different_timebase():
    """The regression the _align docstring describes.

    42 arc samples, 39 baseline samples, 20 human shots. Resampling the baseline
    on arc_t used to crash here (an arc-length mask indexing a baseline column)
    and, when the lengths happened to agree, silently paired the wrong seconds.
    """
    human_t, human_v = _shot_grid()
    arc_t = np.arange(42, dtype=float)
    base_t = np.arange(39, dtype=float)                    # NOT the arc's length
    base_cols = [np.cos(base_t / 5.0), base_t % 3.0]

    db, dh, dF = IV._align(arc_t, np.sin(arc_t / 3.0), base_t, base_cols,
                           human_t, human_v)

    assert db.shape == (19,)                               # 20 bins -> 19 diffs
    assert dh.shape == (19,)
    assert dF.shape == (19, 2)                             # one column per feature
    assert dh == pytest.approx(np.ones(19))


def test_align_never_differences_across_a_dropped_bin():
    """Contiguity: an empty bin must remove BOTH diffs that touch it.

    Punch a hole in the arc's coverage so bin 10 resamples to NaN. The naive
    thing -- drop the bin, then diff what is left -- would splice shots 9 and 11
    together and report a jump of 2 as if it were a one-shot co-movement.
    """
    human_t, human_v = _shot_grid()
    arc_t = np.arange(42, dtype=float)
    arc_t = arc_t[(arc_t < 20) | (arc_t >= 22)]            # bin 10 spans [20, 22)
    base_t = np.arange(39, dtype=float)

    db, dh, dF = IV._align(arc_t, np.sin(arc_t / 3.0), base_t, [np.cos(base_t / 5.0)],
                           human_t, human_v)

    # 19 diffs minus the two that touched bin 10.
    assert db.shape == dh.shape == (17,)
    assert dF.shape == (17, 1)
    # No diff of 2 anywhere: nothing was spliced across the hole.
    assert dh == pytest.approx(np.ones(17))


def test_align_returns_none_rather_than_a_thin_answer():
    """Both guards, so a near-empty overlap can never reach the permutation test."""
    human_t, human_v = _shot_grid(n_shots=9)               # 9 bins < the 10 required
    arc_t = np.arange(18, dtype=float)
    assert IV._align(arc_t, np.sin(arc_t), arc_t, [np.cos(arc_t)], human_t, human_v) is None

    # 20 bins, but every other human value is NaN: 10 good bins clears the first
    # guard and leaves zero adjacent pairs, which the second one catches.
    human_t, human_v = _shot_grid(n_shots=20)
    human_v[1::2] = np.nan
    arc_t = np.arange(42, dtype=float)
    base_t = np.arange(39, dtype=float)
    assert IV._align(arc_t, np.sin(arc_t), base_t, [np.cos(base_t)], human_t, human_v) is None


# ---------------------------------------------------------------------------
# partial_shift_p — the null
# ---------------------------------------------------------------------------
def test_partial_shift_p_floor_is_one_over_the_shift_count():
    """n=20 with min_shift=3 admits exactly 15 shifts, so the honest floor is 1/16.

    Not 1/(n_perm+1). The enumerate branch is what stops the module claiming a
    precision it never bought.
    """
    rng = np.random.default_rng(1)
    n = 20
    z = rng.normal(size=n)
    shared = rng.normal(size=n)
    x = z + shared

    p, r = IV.partial_shift_p(x, x, z.reshape(-1, 1))

    assert r == pytest.approx(1.0)
    assert p == pytest.approx(1.0 / 16.0)
    assert p > 1.0 / (5000 + 1)


def test_partial_shift_p_ignores_the_seed_while_it_enumerates():
    rng = np.random.default_rng(1)
    n = 20
    z = rng.normal(size=n)
    x = z + rng.normal(size=n)
    Z = z.reshape(-1, 1)

    assert IV.partial_shift_p(x, x, Z, seed=0) == IV.partial_shift_p(x, x, Z, seed=99)


def test_partial_shift_p_denominator_follows_the_sampled_shifts():
    """Force the sampling branch: 40 points give 35 shifts, n_perm=5 keeps five."""
    rng = np.random.default_rng(3)
    n = 40
    z = rng.normal(size=n)
    shared = rng.normal(size=n)
    x = z + shared
    y = x + 0.3 * rng.normal(size=n)

    p, _ = IV.partial_shift_p(x, y, z.reshape(-1, 1), n_perm=5)

    assert p == pytest.approx(1.0 / 6.0)


def test_partial_shift_p_refuses_series_it_cannot_shift():
    # The covariate must not fully explain x or y: residualizing a series against
    # itself leaves only float noise, which pearson's variance guard (correctly)
    # calls NaN — and the refusal under test here is the shift policy, not that guard.
    x = np.arange(6.0)
    y = np.array([0.0, 2.0, 1.0, 4.0, 3.0, 5.0])           # co-moves with x, imperfectly
    Z = np.array([1.0, -1.0, 1.0, -1.0, 1.0, -1.0]).reshape(-1, 1)
    p, r = IV.partial_shift_p(x, y, Z)                     # n < 8
    assert np.isnan(p)
    assert not np.isnan(r)                                 # the r is still reported

    x = np.arange(10.0)
    y = np.array([0.0, 2.0, 1.0, 4.0, 3.0, 6.0, 5.0, 8.0, 7.0, 9.0])
    Z = np.tile([1.0, -1.0], 5).reshape(-1, 1)
    p, _ = IV.partial_shift_p(x, y, Z, min_shift=6)        # hi < lo
    assert np.isnan(p)
