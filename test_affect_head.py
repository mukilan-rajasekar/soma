#!/usr/bin/env python3
"""
test_affect_head.py — the RAW affect proxy, the nested baseline the head is judged against.

`_proxy_arc` is the whole affect claim's yardstick. affect_head.build_videos feeds it in
as the LAST feature column and report() prints `delta_r` = r_head - r_proxy, so every
"the trained head beats the arithmetic proxy" number in the affect table is measured
against this six-line function. head_apply then recomputes it at inference time
(`_baseline_series`, baseline_col == "proxy") so a scored ad is compared to the same
baseline training used. None of it was executed by a test until this file.

What is pinned here:

  * The two conventions are OPPOSITE and must not be swapped: valence is the SIGNED mean
    over its mask (so a suppressed ROI reads negative) and arousal is the |activation|
    mean (which cannot go negative). A transposition would invert every valence lane in
    the demo while leaving shapes, lengths and dtypes intact — nothing downstream can
    tell. The fixtures are built so the two disagree in sign and in value, including one
    ROI that cancels exactly under the signed mean while reading strongly under |.|, so
    no single fixture can pass both branches by accident.
  * The proxy for a dim is bit-identical to one of pool_features' own columns
    (valence -> `valence|sgn`, arousal -> `arousal|mag`). That is what makes it a NESTED
    baseline rather than a separate quantity, and it is the coupling that breaks first if
    either convention drifts.
  * A dim with no matching mask returns None — never a fabricated zero arc.
    head_apply._baseline_series branches on exactly that None and raises rather than
    scoring an ad against a baseline it did not fit; both sides are executed here.
  * load_affect_masks' two contracts, because they are what actually builds the
    (name, mask) list `_proxy_arc` looks up: valence always precedes arousal (that is the
    feature-column order save_head serializes), and masks are cast to bool (numpy
    fancy-indexes an integer array BY POSITION, so an uncast 0/1 mask silently pools a
    different, shorter set of vertices).

Fixtures are built inline: a fresh clone has no tests/ directory (it is gitignored and
local-only), so anything reading tests/synth/ passes here and fails everywhere else.

Run: .venv/bin/python -m pytest -q
"""
import os
import warnings

import numpy as np
import pytest

import affect_head as A
import head_apply
import head_io
import train_head as T


# preds rows are seconds, columns are vertices. Vertex 2 is left OUT of both masks and
# carries a huge value, so any test that accidentally pools it is loudly wrong.
PREDS = np.array([[-1.0, -3.0, 5.0],
                  [-2.0, -4.0, -9.0],
                  [0.0, -1.0, 100.0]])
VAL_MASK = np.array([True, True, False])
ARO_MASK = np.array([True, True, False])
MASKS = [("valence", VAL_MASK), ("arousal", ARO_MASK)]


# -----------------------------------------------------------------------------
# the two conventions — signed for valence, |.| for arousal
# -----------------------------------------------------------------------------
def test_valence_is_the_signed_mean_and_goes_negative():
    """An all-negative ROI must produce a NEGATIVE valence arc, not a magnitude."""
    v = A._proxy_arc(PREDS, MASKS, "valence")
    assert np.allclose(v, [-2.0, -3.0, -0.5])
    assert (v < 0).all()


def test_arousal_is_the_absolute_mean_and_stays_positive():
    """The SAME all-negative ROI must produce a positive arousal arc."""
    a = A._proxy_arc(PREDS, MASKS, "arousal")
    assert np.allclose(a, [2.0, 3.0, 0.5])
    assert (a > 0).all()


def test_a_cancelling_roi_separates_the_two_conventions():
    """The discriminating case: signed mean cancels to 0 where |.| mean does not.

    Equal-and-opposite vertices make valence exactly 0 while arousal is the common
    magnitude, so a fixture cannot satisfy both branches by coincidence.
    """
    preds = np.array([[3.0, -3.0, 0.0],
                      [5.0, -5.0, 0.0]])
    masks = [("valence", VAL_MASK), ("arousal", ARO_MASK)]
    assert np.allclose(A._proxy_arc(preds, masks, "valence"), [0.0, 0.0])
    assert np.allclose(A._proxy_arc(preds, masks, "arousal"), [3.0, 5.0])


def test_valence_flips_with_the_activation_but_arousal_does_not():
    """Characterisation: valence is antisymmetric in preds, arousal is symmetric.

    This holds for every input, so it pins the conventions independently of the
    hand-computed values above.
    """
    rng = np.random.default_rng(3)
    preds = rng.normal(size=(7, 9))
    masks = [("valence", rng.random(9) < 0.5), ("arousal", rng.random(9) < 0.5)]
    assert np.array_equal(A._proxy_arc(-preds, masks, "valence"),
                          -A._proxy_arc(preds, masks, "valence"))
    assert np.array_equal(A._proxy_arc(-preds, masks, "arousal"),
                          A._proxy_arc(preds, masks, "arousal"))


def test_proxy_is_bit_identical_to_the_pooled_feature_it_duplicates():
    """Why it is a NESTED baseline: the proxy IS one of the head's own feature columns.

    pool_features emits [mag, sgn] per mask, so valence's proxy must equal `valence|sgn`
    and arousal's must equal `arousal|mag`. If either convention drifts from
    pool_features, delta_r stops meaning "beats its own input" and the nesting claim in
    the affect report is no longer true.
    """
    rng = np.random.default_rng(11)
    preds = rng.normal(size=(9, 12))
    masks = [("valence", rng.random(12) < 0.5), ("arousal", rng.random(12) < 0.5)]
    feats = T.pool_features(preds, masks)
    names = T.feature_names(masks)
    assert np.array_equal(A._proxy_arc(preds, masks, "valence"),
                          feats[:, names.index("valence|sgn")])
    assert np.array_equal(A._proxy_arc(preds, masks, "arousal"),
                          feats[:, names.index("arousal|mag")])


def test_arc_is_one_value_per_second():
    """head_apply pairs the arc with arange(preds.shape[0]); a length change misaligns time."""
    preds = np.random.default_rng(0).normal(size=(23, 6))
    masks = [("valence", np.ones(6, bool))]
    assert A._proxy_arc(preds, masks, "valence").shape == (23,)


def test_vertices_outside_the_mask_cannot_move_the_arc():
    """The a-priori mask is the whole point: unmasked cortex must not leak in."""
    before = A._proxy_arc(PREDS, MASKS, "valence")
    poisoned = PREDS.copy()
    poisoned[:, 2] = 1e9                      # vertex 2 is in neither mask
    assert np.array_equal(A._proxy_arc(poisoned, MASKS, "valence"), before)


# -----------------------------------------------------------------------------
# mask lookup — None, never a fabricated arc
# -----------------------------------------------------------------------------
def test_missing_dim_returns_none_not_a_zero_arc():
    """No mask for this dim -> None. A zeros arc would look like a real flat reading."""
    only_valence = [("valence", VAL_MASK)]
    assert A._proxy_arc(PREDS, only_valence, "arousal") is None
    assert A._proxy_arc(PREDS, [], "valence") is None


def test_lookup_is_by_name_not_by_position():
    """masks is an ordered list but the dim is resolved by name, so order is irrelevant."""
    assert np.array_equal(A._proxy_arc(PREDS, MASKS[::-1], "valence"),
                          A._proxy_arc(PREDS, MASKS, "valence"))


def test_only_valence_takes_the_signed_branch():
    """The branch is `if dim == "valence"`, so every other named dim gets |.|.

    Pinned because the fall-through is silent: a third lane added later inherits the
    arousal convention without anyone choosing it.
    """
    other = A._proxy_arc(PREDS, [("attention", VAL_MASK)], "attention")
    assert np.allclose(other, [2.0, 3.0, 0.5])          # magnitudes, not [-2, -3, -0.5]


def test_all_false_mask_gives_nan_not_zeros():
    """A mask that matched nothing must read as missing, not as a flat zero arc.

    NaN is what build_videos' `good` filter and resample_to_grid both understand;
    zeros would be indistinguishable from a genuinely silent ROI.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)   # numpy: mean of empty slice
        out = A._proxy_arc(PREDS, [("valence", np.zeros(3, bool))], "valence")
    assert np.isnan(out).all()


# -----------------------------------------------------------------------------
# head_apply._baseline_series — the consumer of that None
# -----------------------------------------------------------------------------
def _saved_head(tmp_path, kind, masks):
    """A minimal saved+reloaded affect head (baseline_col='proxy'), as apply would see it."""
    n_w = 2 * len(masks) + 1                              # pool_features cols + baseline
    path = os.path.join(tmp_path, f"head_{kind}.json")
    head_io.save_head(path, kind, np.zeros(n_w), 0.0, 1.0, masks, "proxy", 2.0,
                      dict(median_r=0.3, stouffer_p=0.001, paired_p=0.01, n_videos=12,
                           leak_check="pass", dataset="LIRIS", date="2026-07-27"))
    return head_io.load_head(path)


def test_baseline_series_recomputes_the_proxy_from_preds(tmp_path):
    """baseline_col 'proxy' reads no csv — it recomputes on the per-second grid."""
    head = _saved_head(str(tmp_path), "valence", [("valence", VAL_MASK)])
    t, v = head_apply._baseline_series(head, "vid", PREDS, str(tmp_path))
    assert np.array_equal(t, np.arange(3, dtype=float))
    assert np.array_equal(v, A._proxy_arc(PREDS, head["_masks"], "valence"))


def test_baseline_series_refuses_when_the_dim_has_no_mask(tmp_path):
    """The None branch: stop, rather than score an ad against a fabricated baseline."""
    head = _saved_head(str(tmp_path), "arousal", [("valence", VAL_MASK)])
    with pytest.raises(SystemExit, match="no matching affect mask"):
        head_apply._baseline_series(head, "vid", PREDS, str(tmp_path))


# -----------------------------------------------------------------------------
# load_affect_masks — what actually builds the list _proxy_arc looks up
# -----------------------------------------------------------------------------
def test_valence_always_precedes_arousal(tmp_path):
    """Feature-column order, and it must not depend on how the files happen to sort.

    save_head serializes masks in this order and asserts len(w) matches, so a flip here
    would silently swap every valence weight with an arousal one.
    """
    np.save(tmp_path / "roi_aaa_arousal.npy", np.array([False, False, True]))
    np.save(tmp_path / "roi_zzz_valence.npy", VAL_MASK)      # sorts LAST by filename
    assert [n for n, _m in A.load_affect_masks(str(tmp_path))] == ["valence", "arousal"]


def test_masks_are_cast_to_bool(tmp_path):
    """The bool cast is load-bearing: numpy indexes an INT array by position, not by flag.

    A saved 0/1 int mask left uncast selects columns [0, 1, 1] rather than vertices 1 and
    2 — a different, differently-sized ROI that still returns a plausible arc.
    """
    np.save(tmp_path / "roi_valence_ofc.npy", np.array([0, 1, 1], dtype=np.int8))
    (_name, mask), = A.load_affect_masks(str(tmp_path))
    assert mask.dtype == np.dtype(bool)
    assert np.array_equal(A._proxy_arc(PREDS, [("valence", mask)], "valence"),
                          PREDS[:, np.array([False, True, True])].mean(axis=1))
    # the uncast form is not merely unequal, it pools a different number of vertices
    assert PREDS[:, np.array([0, 1, 1], dtype=np.int8)].shape[1] == 3


def test_only_valence_and_arousal_files_are_picked_up(tmp_path):
    """A dir full of other roi_*.npy masks must not become affect dims."""
    np.save(tmp_path / "roi_dmn.npy", np.ones(3, bool))
    np.save(tmp_path / "roi_visual.npy", np.ones(3, bool))
    assert A.load_affect_masks(str(tmp_path)) == []


def test_first_match_wins_when_several_files_name_a_dim(tmp_path):
    """Two valence masks in one dir: sorted glob, first hit — deterministic, not arbitrary."""
    np.save(tmp_path / "roi_aaa_valence.npy", np.array([True, False, False]))
    np.save(tmp_path / "roi_bbb_valence.npy", np.array([False, False, True]))
    (_name, mask), = A.load_affect_masks(str(tmp_path))
    assert mask.tolist() == [True, False, False]


def test_a_dim_with_no_mask_file_reaches_proxy_arc_as_none(tmp_path):
    """The production path to that None: --masks-dir simply has no roi_*valence*.npy."""
    np.save(tmp_path / "roi_arousal_insula.npy", ARO_MASK)
    masks = A.load_affect_masks(str(tmp_path))
    assert A._proxy_arc(PREDS, masks, "valence") is None
    assert A._proxy_arc(PREDS, masks, "arousal") is not None
