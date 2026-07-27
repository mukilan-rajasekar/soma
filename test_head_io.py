#!/usr/bin/env python3
"""
test_head_io.py — the saved-head file contract in head_io.py.

Why this contract and not something else: head_io's whole point is that a head
file is self-contained — the a-priori masks are packed INSIDE it, so the feature
definition travels with the weights and cannot drift between fit and apply. Every
guarantee that claim rests on is pure, dependency-free, and checkable here:

  * pack/unpack is lossless for a real fsaverage5-shaped mask (20484 vertices),
  * a tampered mask is rejected instead of silently redefining the features,
  * the feature layout written into the file matches what train_head.pool_features
    actually emits (2 columns per mask + the nested baseline, in that order),
  * the file never contains a literal NaN token, which strict JSON.parse in the
    browser would reject — bailing the whole demo render.

Run: .venv/bin/python -m pytest -q
"""
import json
from pathlib import Path

import numpy as np
import pytest

import head_io
import train_head as T

N_VERTS = 20484  # fsaverage5 surface: [lh; rh], 10242 per hemisphere


def _mask(n_verts=N_VERTS, step=7, offset=0):
    """A deterministic scattered boolean mask — stands in for an atlas ROI."""
    m = np.zeros(n_verts, bool)
    m[offset::step] = True
    return m


def _head_kwargs(masks, w=None):
    """A minimal but structurally valid save_head() call."""
    n_feat = 2 * len(masks) + 1
    return dict(
        kind="attention",
        w=np.arange(n_feat, dtype=float) / 10.0 if w is None else w,
        b=-0.25,
        alpha=3.0,
        masks=masks,
        baseline_col="roi_mag",
        shot_sec=2.0,
        stamp=dict(median_r=0.31, stouffer_p=0.004, n_videos=12,
                   leak_check="pass", dataset="TVSum"),
    )


def test_pack_unpack_mask_is_lossless():
    m = _mask()
    spec = head_io._pack_mask(m)
    assert spec["length"] == N_VERTS
    assert spec["n_true"] == int(m.sum())
    np.testing.assert_array_equal(head_io._unpack_mask(spec), m)


def test_pack_unpack_survives_a_length_not_divisible_by_eight():
    # packbits zero-pads to a byte boundary; unpack must slice the padding back
    # off rather than hand back a longer mask with phantom trailing vertices.
    n = 20481  # 20481 % 8 == 1
    m = _mask(n_verts=n, step=3)
    m[-1] = True
    out = head_io._unpack_mask(head_io._pack_mask(m))
    assert out.shape == (n,)
    np.testing.assert_array_equal(out, m)


def test_unpack_mask_rejects_a_tampered_count():
    spec = head_io._pack_mask(_mask())
    spec["name"] = "dmn"
    spec["n_true"] += 1
    with pytest.raises(ValueError, match="corrupt head file"):
        head_io._unpack_mask(spec)


def test_save_load_roundtrip_preserves_the_head(tmp_path):
    masks = [("dmn", _mask()), ("dan", _mask(offset=3, step=11))]
    kw = _head_kwargs(masks)
    path = head_io.save_head(str(tmp_path / "head.json"), **kw)

    head = head_io.load_head(path)
    assert head["schema_version"] == head_io.SCHEMA_VERSION
    assert head["kind"] == "attention"
    assert head["baseline_col"] == "roi_mag"
    assert head["shot_sec"] == 2.0
    assert head["alpha"] == 3.0
    assert head["_b"] == -0.25
    np.testing.assert_allclose(head["_w"], kw["w"])
    assert [name for name, _m in head["_masks"]] == ["dmn", "dan"]
    for (_name, loaded), (_orig_name, orig) in zip(head["_masks"], masks):
        np.testing.assert_array_equal(loaded, orig)


def test_saved_feature_layout_matches_pool_features(tmp_path):
    masks = [("dmn", _mask()), ("dan", _mask(offset=3, step=11))]
    path = head_io.save_head(str(tmp_path / "head.json"), **_head_kwargs(masks))
    feat_names = json.loads(Path(path).read_text())["feature_names"]

    # 2 pooled columns per mask (|mag|, signed) + the nested baseline, last.
    pooled = T.pool_features(np.zeros((4, N_VERTS)), masks)
    assert len(feat_names) == pooled.shape[1] + 1
    assert feat_names[:-1] == ["dmn|mag", "dmn|sgn", "dan|mag", "dan|sgn"]
    assert feat_names[-1] == "roi_mag(nested baseline)"


def test_save_head_rejects_weights_that_do_not_match_the_masks(tmp_path):
    masks = [("dmn", _mask())]
    kw = _head_kwargs(masks, w=np.zeros(2))  # needs 2*1 + 1 = 3
    with pytest.raises(ValueError, match="do not match the fitted weights"):
        head_io.save_head(str(tmp_path / "head.json"), **kw)


def test_clean_stamp_replaces_non_finite_with_none():
    out = head_io.clean_stamp(dict(median_r=float("nan"), stouffer_p=float("inf"),
                                   paired_p=-float("inf"), n_videos=3, dataset="TVSum"))
    assert out["median_r"] is None
    assert out["stouffer_p"] is None
    assert out["paired_p"] is None
    assert out["n_videos"] == 3
    assert out["dataset"] == "TVSum"
    assert head_io.clean_stamp(None) == {}


def test_saved_head_contains_no_literal_nan_token(tmp_path):
    # A null head's median_r/stouffer_p come back NaN. json.dump would write a bare
    # NaN, which strict JSON.parse rejects — so the file must never carry one.
    masks = [("dmn", _mask())]
    kw = _head_kwargs(masks)
    kw["stamp"] = dict(median_r=float("nan"), stouffer_p=float("nan"),
                       n_videos=12, leak_check="pass", dataset="TVSum")
    path = head_io.save_head(str(tmp_path / "null_head.json"), **kw)

    raw = Path(path).read_text()
    # The token check is the real guard: Python's json.loads accepts bare NaN, so
    # only inspecting the text catches what the browser would choke on.
    assert "NaN" not in raw and "Infinity" not in raw
    stamp = json.loads(raw)["stamp"]
    assert stamp["median_r"] is None and stamp["stouffer_p"] is None
