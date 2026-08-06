#!/usr/bin/env python3
"""
test_within_item_scoring.py — a single ad still gets a review.

demo/process_batch.py used to `sys.exit` on fewer than three ads, because every component
is a percentile against the others in the batch and a percentile over one item is not a
number. That was correct about percentiles and wrong about the product: a lone ad still
has an arc, still has weak spots, still has a hook that either lands or does not.

normalize_within_batch() now falls back to within_item_scores() below three, scoring each
clip against its OWN timeline. The properties worth pinning, in order of how quietly they
would break:

  * n>=3 still takes the batch path, byte for byte. This fallback must be invisible to
    every batch that was already working.
  * the scale is REPORTED, not inferred. A within-item 80 and a batch 80 are different
    quantities, and the only thing standing between a customer and that confusion is the
    `scale` field travelling with the row.
  * it discriminates. A fallback that returns 50 for everything would "work" in the sense
    of not crashing, and would be worthless.
  * a missing lane scores 50, not 0. An absent measurement is not a bad ad.

Run: .venv/bin/python -m pytest -q test_within_item_scoring.py
"""
import importlib.util

import pytest

SPEC = importlib.util.spec_from_file_location("pb_scoring", "demo/process_batch.py")
pb = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pb)


class Lane:
    """Stands in for the build_arc() result; within_item_scores only reads `.raw`."""

    def __init__(self, raw):
        self.raw = raw


def row(ad_id, clarity=0.6, **over):
    base = {"ad_id": ad_id, "hook_dorsattn": 0.1, "hook_salventattn": 0.2,
            "full_higher_order": 0.3, "full_visual": 0.1, "clarity_raw": clarity}
    base.update(over)
    return base


STRONG = {"salventattn": Lane([0.9, 0.9, 0.9] + [0.1] * 20),
          "higher_order": Lane([0.5] * 23)}
WEAK = {"salventattn": Lane([0.05, 0.05, 0.05] + [0.6] * 20),
        "higher_order": Lane([-0.2] * 23)}


# ── the fallback fires, and only when it should ─────────────────────────────────

@pytest.mark.parametrize("n", [1, 2])
def test_under_three_ads_scores_within_item_instead_of_exiting(n):
    rows = [row(f"ad_{i}") for i in range(n)]
    arcs = {r["ad_id"]: (None, STRONG, True) for r in rows}
    out = pb.compute_preflight_scores(rows, arcs)
    assert len(out) == n
    assert all(r["scale"] == "within_item" for r in out)


def test_three_or_more_still_takes_the_batch_path():
    """The whole point of the fallback is that it is invisible above the threshold."""
    rows = [row(f"ad_{i}", clarity=0.4 + 0.1 * i, hook_salventattn=0.2 * i) for i in range(3)]
    out = pb.compute_preflight_scores(rows, {})
    assert all(r["scale"] == "batch" for r in out)
    # Percentile midranks over n=3 — the batch path's signature, not the fallback's.
    assert sorted(round(r["hook_capture_score"]) for r in out) == [17, 50, 83]


def test_the_scale_travels_with_every_row():
    """A number whose meaning depends on the cohort must carry the cohort with it."""
    out = pb.compute_preflight_scores([row("a")], {"a": (None, STRONG, True)})
    assert out[0]["scale"] == "within_item"
    assert out[0]["cohort_n"] == 1


# ── it has to actually measure something ────────────────────────────────────────

def test_a_strong_open_outscores_a_weak_one_on_its_own():
    """Both are scored alone, so nothing about this comparison is batch-relative — it is
    two independent single-ad reviews that happen to disagree, which is the capability."""
    strong = pb.compute_preflight_scores([row("a")], {"a": (None, STRONG, True)})[0]
    weak = pb.compute_preflight_scores([row("a")], {"a": (None, WEAK, True)})[0]
    assert strong["preflight_score"] > weak["preflight_score"] + 20
    assert strong["hook_capture_score"] > weak["hook_capture_score"]


def test_scoring_one_ad_does_not_depend_on_what_else_was_in_the_run():
    """A within-item score must be identical alone and beside another ad. If it moved,
    it would be batch-relative wearing a different name."""
    alone = pb.compute_preflight_scores([row("a")], {"a": (None, STRONG, True)})[0]
    beside = pb.compute_preflight_scores(
        [row("a"), row("b")], {"a": (None, STRONG, True), "b": (None, WEAK, True)})
    a_beside = next(r for r in beside if r["ad_id"] == "a")
    assert a_beside["preflight_score"] == pytest.approx(alone["preflight_score"])


def test_clarity_is_carried_through_unscaled():
    """clarity_raw was never batch-relative, so the fallback must pass it straight
    through rather than re-deriving it."""
    out = pb.compute_preflight_scores([row("a", clarity=0.42)], {"a": (None, STRONG, True)})[0]
    assert out["communication_clarity_score"] == pytest.approx(42.0)


# ── absent data is not bad data ─────────────────────────────────────────────────

def test_a_missing_lane_scores_neutral_not_zero():
    """--lanes primary, or a timing failure, leaves no series to rank. Zero would print as
    a damning score for an ad nobody measured."""
    out = pb.compute_preflight_scores([row("a")], {"a": (None, {}, True)})[0]
    assert out["hook_capture_score"] == 50.0
    assert out["message_processing_score"] == 50.0


def test_no_arcs_at_all_still_produces_a_row():
    out = pb.compute_preflight_scores([row("a")], None)
    assert len(out) == 1 and out[0]["scale"] == "within_item"
