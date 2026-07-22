#!/usr/bin/env python3
"""
test_compare_cuts.py — GPU-free, network-free tests for the "Compare Your Cuts"
within-item variant ranker (compare_cuts.py).

Pins the properties that make the PREDICTED, RELATIVE, within-item ranking honest:
  1. a cut with a strictly higher attention arc RANKS FIRST (DAN a-priori lane);
  2. a planted mid-clip attention DIP is localized as a weak-spot callout at ~its
     timestamp ("attention drops at 0:12"), with correct duration;
  3. a FLAT / null cut yields ZERO weak spots (no forced bottom quartile);
  4. the trained-head lane is NON-DEGENERATE across cuts (pooled standardization —
     a per-video z-scored head would collapse every cut's mean to ~0) and still
     ranks the higher-activation cut first, carrying the head's honest badge;
  5. the message lane is SKIPPED with a clear note when no language mask is given,
     and computed when one is; and
  6. an end-to-end CLI run on planted synthetic cuts writes the badged JSON and
     ranks them correctly.

Run:  ./.venv/bin/python -m pytest tests/test_compare_cuts.py -q
Only hard dependency is numpy.
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import compare_cuts as C  # noqa: E402
import head_io  # noqa: E402

NU = 200                         # synthetic output space (any length; masks must match)


def _dan_mask(n_true=60):
    m = np.zeros(NU, bool)
    m[:n_true] = True
    return m


def _preds_from_roi_arc(arc, mask, noise=0.0, seed=0):
    """Build preds so that mean|preds| inside `mask` == `arc` per second (arc >= 0).

    Non-ROI vertices carry only tiny noise, so the ROI magnitude arc is exactly `arc`
    (noise=0) — lets a test drive the lane deterministically."""
    arc = np.asarray(arc, float)
    T = arc.shape[0]
    rng = np.random.default_rng(seed)
    p = noise * rng.standard_normal((T, NU)) if noise else np.zeros((T, NU))
    p[:, mask] = arc[:, None]
    return p


# -----------------------------------------------------------------------------
# 1. ranking: strictly higher attention arc ranks first
# -----------------------------------------------------------------------------
def test_higher_attention_ranks_first():
    dan = _dan_mask()
    hi = {"id": "hi", "preds": _preds_from_roi_arc(np.full(30, 0.80), dan)}
    lo = {"id": "lo", "preds": _preds_from_roi_arc(np.full(30, 0.30), dan)}
    # feed in the WRONG order to prove the sort, not the input order, decides rank
    pay = C.compare([lo, hi], dan_mask=dan)
    order = [r["id"] for r in pay["ranking"]]
    assert order[0] == "hi", f"higher-attention cut should rank first, got {order}"
    holds = {r["id"]: r["attention_hold"] for r in pay["ranking"]}
    assert holds["hi"] > holds["lo"]
    assert pay["ranking"][0]["rank"] == 1 and pay["ranking"][1]["rank"] == 2


# -----------------------------------------------------------------------------
# 2. weak-spot localization of a mid-clip dip
# -----------------------------------------------------------------------------
def test_midclip_dip_localized():
    dan = _dan_mask()
    rng = np.random.default_rng(0)
    arc = 0.80 + 0.02 * rng.standard_normal(30)     # gentle baseline so MAD > 0
    arc[12:17] = 0.10                                # a 5 s dip at 0:12
    v = {"id": "dipcut", "preds": _preds_from_roi_arc(arc, dan)}
    pay = C.compare([v], dan_mask=dan)
    spots = pay["ranking"][0]["weak_spots"]
    att = [w for w in spots if w["lane"] == "attention"]
    assert att, "the planted mid-clip dip should raise an attention weak spot"
    w = min(att, key=lambda s: abs(s["at_sec"] - 12))
    assert 11 <= w["at_sec"] <= 13, f"dip localized wrong: {w['at_sec']} (want ~12)"
    assert 4 <= w["dur_sec"] <= 6, f"dip duration off: {w['dur_sec']} (want ~5)"
    assert "0:12" in w["text"] and "drops at" in w["text"]


# -----------------------------------------------------------------------------
# 3. a flat / null cut raises no false weak spots
# -----------------------------------------------------------------------------
def test_flat_cut_no_false_spots():
    dan = _dan_mask()
    flat = {"id": "flat", "preds": _preds_from_roi_arc(np.full(40, 0.5), dan)}
    pay = C.compare([flat], dan_mask=dan)
    assert pay["ranking"][0]["weak_spots"] == [], "a flat cut must flag NO weak spots"


def test_stationary_noisy_cut_no_false_spots():
    """A stationary arc with only mild noise (no sustained dip) stays quiet."""
    dan = _dan_mask()
    rng = np.random.default_rng(3)
    arc = 0.6 + 0.02 * rng.standard_normal(45)      # no planted dip
    v = {"id": "noisy", "preds": _preds_from_roi_arc(arc, dan)}
    pay = C.compare([v], dan_mask=dan)
    assert pay["ranking"][0]["weak_spots"] == [], "stationary noise must not fabricate dips"


# -----------------------------------------------------------------------------
# 4. trained-head lane: non-degenerate across cuts + honest badge
# -----------------------------------------------------------------------------
def _make_head(path, mask, w, baseline_col="roi_mag", leak="pass", n_videos=15):
    return head_io.save_head(
        path, "attention", w=w, b=0.0, alpha=0.1,
        masks=[("mask_dmn", mask)], baseline_col=baseline_col, shot_sec=2.0,
        stamp=dict(median_r=0.20, stouffer_p=0.01, paired_p=0.09, n_videos=n_videos,
                   leak_check=leak, dataset="TVSum", date="2026-07-20"))


def test_head_lane_non_degenerate_and_ranks(tmp_path):
    dmn = _dan_mask()
    hp = _make_head(os.path.join(str(tmp_path), "head.json"), dmn, w=[1.0, 0.0, 0.2])
    head = head_io.load_head(hp)
    head["_path"] = "head.json"
    hi = {"id": "hi", "preds": _preds_from_roi_arc(np.full(30, 0.80), dmn, noise=1e-3, seed=1)}
    lo = {"id": "lo", "preds": _preds_from_roi_arc(np.full(30, 0.30), dmn, noise=1e-3, seed=2)}
    pay = C.compare([lo, hi], head=head)
    holds = {r["id"]: r["attention_hold"] for r in pay["ranking"]}
    # the degeneracy guard: a per-video z-scored head would give BOTH ~0; pooled
    # standardization must separate them.
    assert abs(holds["hi"] - holds["lo"]) > 0.5, f"head holds collapsed: {holds}"
    assert pay["ranking"][0]["id"] == "hi"
    assert pay["head_badge"]["status"] == "learned-hypothesis"
    assert "trained-head" in pay["attention_source"]


def test_poisoned_head_refused(tmp_path):
    """A head whose leakage control did not pass is refused by badge_text -> the CLI
    caller must stop. Here we assert the badge is 'poisoned' so compare_cuts' main()
    refuses it (mirrors head_apply)."""
    dmn = _dan_mask()
    hp = _make_head(os.path.join(str(tmp_path), "bad.json"), dmn, w=[1.0, 0.0, 0.2],
                    leak="unknown")
    head = head_io.load_head(hp)
    status, _badge = head_io.badge_text(head)
    assert status == "poisoned"


# -----------------------------------------------------------------------------
# 5. message lane: skipped without a mask, computed with one
# -----------------------------------------------------------------------------
def test_message_lane_skipped_without_mask():
    dan = _dan_mask()
    v = {"id": "v", "preds": _preds_from_roi_arc(np.full(20, 0.5), dan)}
    pay = C.compare([v], dan_mask=dan)
    assert pay["message_source"] is None
    assert pay["message_note"] and "trimodal" in pay["message_note"].lower()
    assert pay["ranking"][0]["message_load"] is None


def test_message_lane_computed_with_mask():
    dan = _dan_mask()
    lang = np.zeros(NU, bool)
    lang[100:150] = True                            # a distinct language ROI block
    # message load = mean|preds| in the language ROI; plant a higher load in v_hi
    v_hi = {"id": "hi", "preds": _preds_from_roi_arc(np.full(20, 0.5), dan)}
    v_hi["preds"][:, lang] = 0.9
    v_lo = {"id": "lo", "preds": _preds_from_roi_arc(np.full(20, 0.5), dan)}
    v_lo["preds"][:, lang] = 0.2
    pay = C.compare([v_lo, v_hi], dan_mask=dan, language_mask=lang)
    assert pay["message_source"] is not None
    loads = {r["id"]: r["message_load"] for r in pay["ranking"]}
    assert loads["hi"] is not None and loads["hi"] > loads["lo"]
    # ranking still driven by ATTENTION (both equal here) — message is a secondary column
    assert pay["ranking_metric"].startswith("attention_hold")


# -----------------------------------------------------------------------------
# 6. end-to-end CLI on planted synthetic cuts
# -----------------------------------------------------------------------------
def test_end_to_end_cli(tmp_path):
    dan = _dan_mask()
    preds_dir = os.path.join(str(tmp_path), "arcs")
    os.makedirs(preds_dir, exist_ok=True)
    np.save(os.path.join(str(tmp_path), "dan.npy"), dan)
    levels = {"cutA": 0.9, "cutB": 0.6, "cutC": 0.3}
    for vid, lv in levels.items():
        np.save(os.path.join(preds_dir, f"preds_{vid}.npy"),
                _preds_from_roi_arc(np.full(25, lv), dan).astype(np.float32))
    out = os.path.join(str(tmp_path), "compare_cuts.json")
    r = subprocess.run(
        [sys.executable, os.path.join(ROOT, "compare_cuts.py"),
         "--preds-dir", preds_dir, "--glob", "preds_*.npy",
         "--dan-mask", os.path.join(str(tmp_path), "dan.npy"),
         "--creative-id", "synthetic_spot", "--out", out],
        capture_output=True, text=True)
    assert r.returncode == 0, f"CLI failed:\n{r.stdout}\n{r.stderr}"
    assert os.path.exists(out)
    pay = json.load(open(out))
    assert pay["n_variants"] == 3
    assert [x["id"] for x in pay["ranking"]] == ["cutA", "cutB", "cutC"]
    assert pay["creative_id"] == "synthetic_spot"
    # honesty guardrails present in the artifact
    assert "WITHIN-ITEM" in pay["badge"]
    assert pay["validation_hook"]["status"] == "not_validated"
    assert "0:00" == C.mmss(0) and "1:05" == C.mmss(65)


if __name__ == "__main__":
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-q"]))
