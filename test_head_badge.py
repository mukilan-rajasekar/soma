#!/usr/bin/env python3
"""
test_head_badge.py — the honesty gate and the display mappings in head_io.py.

test_head_io.py covers the FILE contract (pack/unpack, save/load, no NaN token).
This covers the other half, which is the half a human reads:

  * badge_text() — the fail-closed ladder head_apply keys off. It decides whether
    a lane is refused outright ('poisoned'), shown with a hedge ('smoke' /
    'unvalidated'), or allowed to say a trained head beat chance. Every rung is a
    claim about honesty, and every rung must fail CLOSED: absence of evidence
    (no leak_check key, no n_videos, a null median_r) must never be read as
    evidence of validation.
  * to_unit / to_signed — the only two functions between a head's raw z-scored
    output and the numbers written into arc_<id>.json. Both must be bounded and
    must never emit NaN: the demo JSON is parsed by strict JSON.parse, and a bare
    NaN token bails the whole render.

The four status strings asserted here are the keys of head_apply.py's STATUS_RANK
(head_apply.py:95) and the value it refuses on (head_apply.py:158) — renaming one
here silently demotes that lane to the worst rank there.

Run: .venv/bin/python -m pytest -q
"""
import numpy as np
import pytest

import head_io

# The vocabulary head_apply.py ranks. Ordered worst -> best, same as STATUS_RANK.
STATUSES = ("poisoned", "smoke", "unvalidated", "learned-hypothesis")

# train_head.leak_check() emits exactly one of these three; nothing else writes the key.
LEAK_VERDICTS = ("pass", "FAIL", "unknown")


def _head(kind="attention", **stamp):
    """A head shaped the way badge_text reads it — only `kind` and `stamp` matter."""
    return dict(kind=kind, stamp=stamp)


def _validated(**overrides):
    """A stamp that clears every rung, so each test can break exactly one."""
    st = dict(median_r=0.31, stouffer_p=0.004, n_videos=12,
              leak_check="pass", dataset="TVSum")
    st.update(overrides)
    return st


# -----------------------------------------------------------------------------
# rung 1: the poison gate — only an explicit 'pass' clears it
# -----------------------------------------------------------------------------
def test_a_stamp_with_no_leak_check_key_is_poisoned():
    # Absence of a leakage verdict is not a passing verdict. A head written by an
    # older trainer, or by hand, must not inherit trust it never earned.
    st = _validated()
    del st["leak_check"]
    status, badge = head_io.badge_text(_head(**st))
    assert status == "poisoned"
    assert "leak_check=unknown" in badge


def test_a_head_with_no_stamp_at_all_is_poisoned():
    assert head_io.badge_text(dict(kind="valence"))[0] == "poisoned"
    assert head_io.badge_text(dict(kind="valence", stamp=None))[0] == "poisoned"
    assert head_io.badge_text({})[0] == "poisoned"


def test_a_failed_leak_check_is_poisoned():
    # 'FAIL' is the literal train_head.leak_check() returns when the shuffled-target
    # control did NOT collapse — i.e. the trainer was fitting noise.
    status, badge = head_io.badge_text(_head(**_validated(leak_check="FAIL")))
    assert status == "poisoned"
    assert "DO NOT TRUST" in badge


def test_leak_check_must_be_exactly_the_lowercase_string_pass():
    # The gate is `leak != "pass"`, an exact comparison. Anything near-miss — a
    # different case, a past tense, a boolean — is refused rather than guessed at.
    for near_miss in ("PASS", "Pass", "passed", "ok", True, 1):
        assert head_io.badge_text(_head(**_validated(leak_check=near_miss)))[0] == "poisoned"


def test_the_poison_gate_outranks_a_perfect_track_record():
    # Ordering matters: a poisoned head with a spectacular stamp must still be
    # poisoned, because the stamp is exactly what leakage inflates.
    status, badge = head_io.badge_text(
        _head(**_validated(leak_check="FAIL", median_r=0.95, stouffer_p=1e-12, n_videos=100)))
    assert status == "poisoned"
    assert "0.95" not in badge  # the inflated numbers are not advertised


def test_every_leak_verdict_train_head_emits_is_handled():
    got = {v: head_io.badge_text(_head(**_validated(leak_check=v)))[0] for v in LEAK_VERDICTS}
    assert got == {"pass": "learned-hypothesis", "FAIL": "poisoned", "unknown": "poisoned"}


# -----------------------------------------------------------------------------
# rung 2: underpowered -> smoke
# -----------------------------------------------------------------------------
def test_too_few_videos_is_a_smoke_test():
    status, badge = head_io.badge_text(_head(**_validated(n_videos=5)))
    assert status == "smoke"
    assert "SMOKE TEST" in badge and "not validated" in badge


def test_the_smoke_boundary_is_eight_videos():
    assert head_io.badge_text(_head(**_validated(n_videos=7)))[0] == "smoke"
    assert head_io.badge_text(_head(**_validated(n_videos=8)))[0] == "learned-hypothesis"


def test_a_missing_or_unreadable_n_videos_is_smoke_not_validated():
    # int(None) raises -> n_int = 0 -> smoke. Fail closed: an unknown sample size
    # is treated as the smallest one, never as enough.
    for bad_n in (None, "", "many", float("nan")):
        assert head_io.badge_text(_head(**_validated(n_videos=bad_n)))[0] == "smoke"
    # ...but a number that merely arrived as a string still counts.
    assert head_io.badge_text(_head(**_validated(n_videos="12")))[0] == "learned-hypothesis"


# -----------------------------------------------------------------------------
# rung 3: didn't beat chance -> unvalidated
# -----------------------------------------------------------------------------
@pytest.mark.parametrize("overrides", [
    dict(median_r=-0.10),      # negative held-out correlation
    dict(median_r=0.0),        # exactly zero: the test is r > 0, not r >= 0
    dict(stouffer_p=0.05),     # exactly at the threshold: the test is p < 0.05
    dict(stouffer_p=0.40),
])
def test_a_head_that_did_not_beat_chance_is_unvalidated(overrides):
    status, badge = head_io.badge_text(_head(**_validated(**overrides)))
    assert status == "unvalidated"
    assert "did NOT beat chance" in badge and "hypothesis only" in badge


@pytest.mark.parametrize("bad_r", [None, "n/a", float("nan"), "", [0.3]])
def test_a_non_numeric_median_r_is_unvalidated_never_learned_hypothesis(bad_r):
    # float(None) / float("n/a") raise, and nan > 0 is False — every route through
    # an unreadable stamp field must land on the hedged badge.
    assert head_io.badge_text(_head(**_validated(median_r=bad_r)))[0] == "unvalidated"


def test_a_non_numeric_stouffer_p_is_unvalidated():
    for bad_p in (None, "n/a", float("nan")):
        assert head_io.badge_text(_head(**_validated(stouffer_p=bad_p)))[0] == "unvalidated"


def test_an_unreadable_number_prints_as_a_question_mark_not_none():
    # _num()'s fallback: the badge is user-facing copy, so a null stamp field must
    # not render as the word 'None' in the demo.
    _status, badge = head_io.badge_text(_head(**_validated(median_r=None, stouffer_p=None)))
    assert "r≈?" in badge and "p≈?" in badge
    assert "None" not in badge


# -----------------------------------------------------------------------------
# rung 4: the only badge allowed to claim a track record
# -----------------------------------------------------------------------------
def test_a_validated_head_is_a_learned_hypothesis_and_still_hedges():
    status, badge = head_io.badge_text(_head(kind="valence", **_validated()))
    assert status == "learned-hypothesis"
    assert "valence" in badge
    assert "TVSum" in badge and "leave-one-video-out" in badge
    # The core honesty claim: even a validated head is out-of-distribution on an ad.
    assert "out-of-distribution" in badge
    assert "not a validated result" in badge


def test_the_dataset_falls_back_to_a_generic_name_rather_than_none():
    st = _validated()
    del st["dataset"]
    _status, badge = head_io.badge_text(_head(**st))
    assert "the training proxy" in badge and "None" not in badge


# -----------------------------------------------------------------------------
# the status vocabulary head_apply ranks
# -----------------------------------------------------------------------------
def test_the_status_vocabulary_is_exactly_the_four_head_apply_ranks():
    # head_apply's STATUS_RANK.get(s, 0) sends an unknown status to the WORST rank,
    # so renaming a status here would silently demote that lane instead of erroring.
    reached = {
        head_io.badge_text(_head(**_validated(leak_check="FAIL")))[0],
        head_io.badge_text(_head(**_validated(n_videos=5)))[0],
        head_io.badge_text(_head(**_validated(median_r=-0.1)))[0],
        head_io.badge_text(_head(**_validated()))[0],
    }
    assert reached == set(STATUSES)


def test_a_null_head_round_trips_without_earning_a_validated_badge(tmp_path):
    # The composition that matters: a null head's median_r/stouffer_p are NaN,
    # clean_stamp() rewrites them to None so the file carries no NaN token, and
    # badge_text must then read None as "not validated" rather than tripping on it.
    mask = np.zeros(64, bool)
    mask[::4] = True
    path = head_io.save_head(
        str(tmp_path / "null_head.json"), kind="attention", w=np.zeros(3), b=0.0,
        alpha=1.0, masks=[("dmn", mask)], baseline_col="roi_mag", shot_sec=2.0,
        stamp=dict(median_r=float("nan"), stouffer_p=float("nan"), n_videos=12,
                   leak_check="pass", dataset="TVSum"))
    status, badge = head_io.badge_text(head_io.load_head(path))
    assert status == "unvalidated"
    assert "did NOT beat chance" in badge


# -----------------------------------------------------------------------------
# to_unit — the 0..1 lane
# -----------------------------------------------------------------------------
def test_to_unit_is_bounded_and_order_preserving():
    out = head_io.to_unit(np.arange(20.))
    assert out.min() == 0.0 and out.max() == 1.0
    assert np.all(np.diff(out) > 0)


def test_to_unit_maps_every_non_finite_entry_to_zero():
    # Not to NaN: arc_<id>.json is read by strict JSON.parse, which rejects a bare
    # NaN token and bails the whole demo render.
    out = head_io.to_unit(np.array([1.0, np.nan, 3.0, np.inf, -np.inf, 5.0]))
    assert np.all(np.isfinite(out))
    assert out[1] == 0.0 and out[3] == 0.0 and out[4] == 0.0
    assert np.all((out >= 0.0) & (out <= 1.0))


def test_to_unit_on_an_all_nan_series_returns_zeros_of_the_same_shape():
    out = head_io.to_unit(np.full(7, np.nan))
    assert out.shape == (7,)
    assert np.all(out == 0.0)


def test_to_unit_on_a_flat_series_stays_flat_and_finite():
    # The +1e-9 in the denominator is a divide-by-zero guard, not a scale: a
    # constant prediction must come back constant and finite (it lands on the
    # floor of the lane today), never NaN or inf.
    out = head_io.to_unit(np.full(5, 7.0))
    assert np.all(np.isfinite(out))
    assert np.all(out == out[0])
    assert 0.0 <= out[0] <= 1.0


def test_to_unit_clips_an_outlier_instead_of_crushing_the_rest():
    # This is why the window is the 2nd..98th percentile and not min..max: one
    # spike must not flatten the whole lane. Under min-max the bulk would occupy
    # the bottom 0.01% of the range.
    x = np.concatenate([np.arange(100.), [1e6]])
    out = head_io.to_unit(x)
    assert out[-1] == 1.0                      # the spike clips
    assert out[:-1].max() - out[:-1].min() == 1.0   # the bulk still uses the lane
    assert out[50] == pytest.approx(0.5, abs=1e-6)


def test_to_unit_does_not_mutate_its_input():
    x = np.array([1.0, np.nan, 3.0])
    head_io.to_unit(x)
    assert np.isnan(x[1]) and x[0] == 1.0 and x[2] == 3.0


# -----------------------------------------------------------------------------
# to_signed — the valence lane
# -----------------------------------------------------------------------------
def test_to_signed_is_bounded_and_centred_on_the_median():
    out = head_io.to_signed(np.array([-3.0, -1.0, 0.0, 1.0, 3.0]))
    assert out[2] == 0.0                        # the median maps exactly to neutral
    assert np.all(out[:2] < 0) and np.all(out[3:] > 0)
    assert np.all(np.abs(out) <= 1.0)
    assert np.all(np.diff(out) > 0)             # monotone: ordering survives


def test_to_signed_saturates_at_one_rather_than_exceeding_it():
    # A series whose MAD is 0 falls back to a scale of 1.0, so a far-out sample
    # saturates tanh. Bounded is the contract; float tanh reaches exactly 1.0, so
    # the bound is closed, not open.
    out = head_io.to_signed(np.array([5.0, 5.0, 5.0, 5.0, 5.0, 100.0]))
    assert out.max() == 1.0
    assert np.all(np.abs(out) <= 1.0)
    assert np.all(np.abs(head_io.to_signed(np.array([0.0, 0.0, 0.0, 1e300]))) <= 1.0)


def test_to_signed_on_a_flat_series_is_all_zero_not_nan():
    # `mad or 1.0` is the divide-by-zero guard: an all-identical series has MAD 0,
    # and must render as neutral rather than 0/0.
    out = head_io.to_signed(np.full(6, -2.5))
    assert np.all(np.isfinite(out))
    assert np.all(out == 0.0)


def test_to_signed_maps_every_non_finite_entry_to_zero():
    out = head_io.to_signed(np.array([1.0, np.nan, 3.0, np.inf, -np.inf, 5.0]))
    assert np.all(np.isfinite(out))
    assert out[1] == 0.0 and out[3] == 0.0 and out[4] == 0.0
    assert np.all(head_io.to_signed(np.full(4, np.nan)) == 0.0)


def test_to_signed_is_scale_invariant():
    # 'Robust tanh' means the lane is set by the series' own spread: multiplying a
    # head's weights by a billion must not peg the whole lane at +-1.
    a = np.array([-2.0, -1.0, 0.0, 1.0, 2.0, 7.0])
    np.testing.assert_allclose(head_io.to_signed(a), head_io.to_signed(a * 1e9))


def test_the_display_mappings_accept_an_empty_series():
    assert head_io.to_unit(np.array([])).shape == (0,)
    assert head_io.to_signed(np.array([])).shape == (0,)
