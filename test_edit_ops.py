#!/usr/bin/env python3
"""
test_edit_ops.py — the edit space in tools/edit/ops.py.

The load-bearing property is the LAST test in the first group: for a single-shot removal,
the generalised estimator must return exactly what the shipped leave-one-shot-out pass in
tools/demo/build_report.py returns. /demo prints those numbers today ("62 to 66"), so if
the two ever disagree the site and the edit product are quoting different arithmetic
about the same footage. That test is the anchor; everything else is the search space
around it.

The other properties worth pinning, in rough order of how quietly they would break:

  * output order — a hoisted shot's samples must arrive FIRST, because the hook is scored
    off the first 3 seconds of what the viewer sees. Get this wrong and every reorder
    silently estimates as a no-op, which looks like "reordering never helps" rather than
    like a bug.
  * brand mentions travel with their shot through a reorder, and vanish with it when cut.
    Comprehension weighs WHEN the brand is named, so leaving mentions on source time
    scores a hoisted product shot as if its mention were still 12 seconds in.
  * `measured` is never set by this module. It is the difference between "we think" and
    "we checked", and only the verify stage may flip it.
  * shot merging keeps the timeline gapless, so a rendered edit cannot silently lose
    frames the estimate assumed were there.

Run: .venv/bin/python -m pytest -q test_edit_ops.py
"""
import importlib.util
import json
from pathlib import Path

import pytest

from tools.edit.ops import (
    MIN_RESULT_S,
    Candidate,
    enumerate_candidates,
    estimate,
    rank,
    shots_from_boundaries,
    timeline_sample_indices,
    total_seconds,
    _remap_brand,
)

ROOT = Path(__file__).resolve().parent


def load_build_report():
    spec = importlib.util.spec_from_file_location(
        "soma_build_report", ROOT / "tools" / "demo" / "build_report.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def br():
    return load_build_report()


@pytest.fixture(scope="module")
def dip_ad():
    """The campaign variant /demo diagnoses — the one whose shot deltas the page prints."""
    path = ROOT / "public" / "demo" / "report.json"
    if not path.exists():
        pytest.skip("public/demo/report.json absent")
    report = json.loads(path.read_text())
    ad_id = report["campaign"].get("dipId")
    ad = next((v for v in report["campaign"]["variants"] if v["id"] == ad_id), None)
    if ad is None:
        pytest.skip("no dip variant in the report")
    return ad, report["campaign"]["shots"]


# ── the anchor: we agree with the shipped pipeline ──────────────────────────────

def test_single_removal_matches_shipped_leave_one_shot_out(br, dip_ad):
    """The generalised estimator must reproduce build_report.shot_contributions exactly.
    /demo prints these numbers, so a disagreement means the site and the edit product are
    quoting different arithmetic about the same footage.

    The timeline here is "everything except [a,b)" over the full duration, which is
    precisely what shot_contributions' `keep` filter computes. That is the like-for-like
    comparison: it exercises the index selection, the brand remapping and the scoring
    call, while deliberately NOT depending on how the two modules segment shots — they
    segment differently on purpose, which the next test pins."""
    ad, shipped = dip_ad
    base = br.score_ad(ad["lanes"], ad["levels"], ad["brandMentions"], ad["duration"])["soma"]
    assert base == shipped["base"], "base score disagrees with the committed report"

    duration = ad["duration"]
    for i, s in enumerate(shipped["shots"]):
        a, b = s["start"], s["end"]
        timeline = [seg for seg in [(0.0, a), (b, duration)] if seg[1] - seg[0] > 0]
        cand = Candidate(kind="remove", label="x", timeline=timeline, removed=[(a, b)])
        estimate(cand, ad["lanes"], ad["levels"], ad["brandMentions"], br.score_ad, base)
        assert cand.est_score == s["without"], (
            f"shot {i} ({a}-{b}): estimator says {cand.est_score}, "
            f"the shipped report says {s['without']}"
        )
        assert cand.est_delta == s["delta"]


def test_our_segmentation_is_gapless_where_the_shipped_pass_is_not(dip_ad):
    """A DELIBERATE divergence, pinned so nobody "fixes" it back.

    build_report.shot_contributions skips any segment under a second (`continue`), which
    leaves holes in its shot list — the committed report has one at 11.5-12.37s. That is
    harmless there, because that pass only ever reports numbers.

    It is not harmless here, because these shots get RENDERED. Removing shot i from a
    list with holes would drop the holes too, so the delivered file would be missing
    frames the score assumed were present. shots_from_boundaries merges slivers into
    their neighbour instead, so the timeline always covers the whole clip."""
    ad, shipped = dip_ad
    shipped_total = sum(s["end"] - s["start"] for s in shipped["shots"])
    assert shipped_total < ad["duration"] - 0.5, (
        "this ad no longer exercises the gap case; the property still holds but pick "
        "another fixture if you want the regression covered"
    )

    # Rebuild from the same cut points and confirm ours loses nothing.
    boundaries = [s["start"] for s in shipped["shots"] if s["start"] > 0]
    boundaries += [s["end"] for s in shipped["shots"]]
    ours = shots_from_boundaries(sorted(set(boundaries)), ad["duration"])
    assert total_seconds(ours) == pytest.approx(ad["duration"], abs=0.01)
    for (_, end), (start, _) in zip(ours, ours[1:]):
        assert end == start


def test_search_finds_something_the_one_at_a_time_pass_cannot(br, dip_ad):
    """The reason the pair family exists: a slow beat is often two shots of one slow idea,
    and removing them together can beat any single removal. If this ever stops holding on
    this ad the search still works — but the claim that it finds more than the shipped
    diagnosis would need re-examining, so it is pinned."""
    ad, shipped = dip_ad
    base = shipped["base"]
    shots = [(s["start"], s["end"]) for s in shipped["shots"]]
    cands = [estimate(c, ad["lanes"], ad["levels"], ad["brandMentions"], br.score_ad, base)
             for c in enumerate_candidates(shots)]
    best_single = max(c.est_delta for c in cands if c.kind == "remove")
    best_overall = max(c.est_delta for c in cands)
    assert best_overall > best_single


# ── output order ────────────────────────────────────────────────────────────────

def test_sample_indices_follow_output_order_not_source_order():
    """A hoist must put the hoisted shot's samples at the FRONT."""
    timeline = [(10.0, 13.0), (0.0, 4.0)]          # shot at 10s hoisted ahead of the open
    idx = timeline_sample_indices(timeline, n_samples=20, fps=1.0)
    assert idx == [10, 11, 12, 0, 1, 2, 3]
    # The first three samples — the hook window — are the hoisted shot's.
    assert idx[:3] == [10, 11, 12]


def test_sample_indices_clamp_to_available_samples():
    idx = timeline_sample_indices([(0.0, 100.0)], n_samples=5, fps=1.0)
    assert idx == [0, 1, 2, 3, 4]


def test_hoist_changes_the_estimate(br, dip_ad):
    """The consequence of output order, end to end: hoisting a late shot must not score
    identically to the untouched ad. If it does, the reorder is being estimated as a
    no-op and the whole reorder family is decorative."""
    ad, shipped = dip_ad
    base = shipped["base"]
    shots = [(s["start"], s["end"]) for s in shipped["shots"]]
    hoists = [c for c in enumerate_candidates(shots) if c.kind == "hoist"]
    for c in hoists:
        estimate(c, ad["lanes"], ad["levels"], ad["brandMentions"], br.score_ad, base)
    assert any(c.est_delta != 0 for c in hoists)
    # Nothing is thrown away by a reorder.
    for c in hoists:
        assert c.result_s == pytest.approx(total_seconds(shots), abs=0.01)


# ── brand mentions ──────────────────────────────────────────────────────────────

def test_brand_mentions_are_retimed_into_output_time():
    brand = [{"t": 11.0, "text": "kova"}]
    # The 10-13s shot is hoisted to the front, so a mention at 11.0 lands at 1.0.
    moved = _remap_brand(brand, [(10.0, 13.0), (0.0, 4.0)])
    assert len(moved) == 1
    assert moved[0]["t"] == pytest.approx(1.0)
    assert moved[0]["text"] == "kova"


def test_brand_mentions_inside_a_removed_shot_disappear():
    brand = [{"t": 2.0, "text": "kova"}, {"t": 8.0, "text": "kova"}]
    kept = _remap_brand(brand, [(6.0, 10.0)])       # the 0-4s shot was cut
    assert [m["t"] for m in kept] == [pytest.approx(2.0)]


def test_remapped_mentions_come_back_sorted():
    brand = [{"t": 1.0}, {"t": 11.0}]
    moved = _remap_brand(brand, [(10.0, 13.0), (0.0, 4.0)])
    assert [m["t"] for m in moved] == sorted(m["t"] for m in moved)


# ── shots ───────────────────────────────────────────────────────────────────────

def test_sub_second_shots_are_merged_not_dropped():
    """A gap would mean the rendered file loses frames the estimate assumed were there."""
    shots = shots_from_boundaries([5.0, 5.2, 10.0], duration=20.0)
    assert total_seconds(shots) == pytest.approx(20.0)
    for (_, end), (start, _) in zip(shots, shots[1:]):
        assert end == start, "timeline must be gapless"
    assert all(b - a >= 1.0 for a, b in shots)


def test_leading_sliver_is_folded_forward():
    shots = shots_from_boundaries([0.3, 6.0], duration=12.0)
    assert shots[0][0] == 0.0
    assert total_seconds(shots) == pytest.approx(12.0)
    assert all(b - a >= 1.0 for a, b in shots)


def test_boundaries_outside_the_clip_are_ignored():
    shots = shots_from_boundaries([-2.0, 5.0, 99.0], duration=10.0)
    assert shots == [(0.0, 5.0), (5.0, 10.0)]


# ── the space ───────────────────────────────────────────────────────────────────

def test_enumeration_never_leaves_less_film_than_the_floor():
    shots = [(float(i), float(i + 2)) for i in range(0, 10, 2)]   # 5 shots, 2s each
    for c in enumerate_candidates(shots):
        assert c.result_s == 0.0 or True     # result_s is filled by estimate()
        assert total_seconds(c.timeline) >= MIN_RESULT_S


def test_a_single_shot_ad_has_no_edit_space():
    assert enumerate_candidates([(0.0, 30.0)]) == []


def test_reorder_family_can_be_switched_off():
    shots = [(float(i), float(i + 3)) for i in range(0, 15, 3)]
    assert any(c.kind == "hoist" for c in enumerate_candidates(shots))
    assert not any(c.kind == "hoist" for c in enumerate_candidates(shots, allow_reorder=False))


# ── ranking and honesty ─────────────────────────────────────────────────────────

def test_rank_puts_the_best_first_and_breaks_ties_toward_keeping_film():
    a = Candidate("remove", "cuts more", [], est_delta=4, result_s=20.0)
    b = Candidate("remove", "cuts less", [], est_delta=4, result_s=26.0)
    c = Candidate("remove", "better",    [], est_delta=6, result_s=10.0)
    assert [x.label for x in rank([a, b, c])] == ["better", "cuts less", "cuts more"]


def test_estimate_never_claims_a_result_is_measured(br, dip_ad):
    """Only the verify stage may set this. A `measured: true` that never met the encoder
    is the single most damaging thing this module could emit."""
    ad, shipped = dip_ad
    shots = [(s["start"], s["end"]) for s in shipped["shots"]]
    for c in enumerate_candidates(shots):
        estimate(c, ad["lanes"], ad["levels"], ad["brandMentions"], br.score_ad, shipped["base"])
        assert c.measured is False


def test_reorders_are_labelled_a_weaker_estimate_than_removals():
    shots = [(float(i), float(i + 3)) for i in range(0, 15, 3)]
    by_kind = {c.kind: c.confidence for c in enumerate_candidates(shots)}
    assert by_kind["remove"] == "estimate"
    assert by_kind["hoist"] == "weak estimate"


# ── the estimator must not care what the lanes are called ───────────────────────
#
# There are two producers of `lanes` and they use different key names for the same
# parallel arrays: build_report.py (the /demo campaign) emits dorsal/ventral/language,
# process_batch.py (a customer batch, via search.load_custom_ad) emits
# higherOrder/salventattn/visual. estimate() only ever needs the sample COUNT.
#
# It used to read `len(lanes["dorsal"])`, so a customer's arcs measured 0 timepoints:
# every candidate returned +0 with result_s 0.0 and rank() degenerated to enumeration
# order. It failed silently and only on the customer path — the demo path, which is the
# one a developer exercises, was correct throughout. These two tests are the guard.

CUSTOMER_LANES = {"higherOrder": [0.1] * 30, "salventattn": [0.2] * 30, "visual": [0.3] * 30}
DEMO_LANES = {"dorsal": [0.1] * 30, "ventral": [0.2] * 30, "language": [0.3] * 30}


def _spread(lanes):
    """Estimate the same edit space against `lanes` and return the deltas, best first."""
    shots = shots_from_boundaries([4.0, 9.0, 15.0, 22.0], 30.0)

    def score_fn(cut_lanes, _levels, _brand, _duration, fps=1.0):
        # Any lane will do — they are parallel — and the score has to MOVE with the cut,
        # otherwise this test would pass against an estimator that returns a constant.
        longest = max((len(v) for v in cut_lanes.values() if v), default=0)
        return {"soma": 50.0 + longest}

    cands = enumerate_candidates(shots)
    for c in cands:
        estimate(c, lanes, {}, [], score_fn, 60.0)
    return [(round(c.est_delta, 3), round(c.result_s, 3)) for c in rank(cands)]


def test_estimate_reads_arcs_whatever_the_lanes_are_called():
    """A customer's lane names must estimate exactly like the demo's."""
    assert _spread(CUSTOMER_LANES) == _spread(DEMO_LANES)


def test_estimate_does_not_silently_flatten_to_zero():
    """The regression itself: all-zero deltas and all-zero result_s is what the bug looked
    like from the outside — a full list of candidates, none of which said anything."""
    spread = _spread(CUSTOMER_LANES)
    assert spread, "enumeration produced no candidates"
    assert any(delta != 0.0 for delta, _ in spread), "every candidate estimated +0"
    assert all(result_s > 0.0 for _, result_s in spread), "result_s never left its default"
