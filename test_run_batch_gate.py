#!/usr/bin/env python3
"""
test_run_batch_gate.py — the publish gate in tools/concierge/run_batch.py.

WHY THIS FUNCTION AND NOT ANOTHER. run_batch.py is mostly plumbing: fetch rows, move
bytes, shell out, PATCH a row. Plumbing fails loudly and in front of an operator.
`gate()` is the one part that fails QUIETLY and expensively — it is the only thing
standing between a run whose sanity checks did not pass and a customer reading numbers
off it as if they meant something. demo/README.md says of one of these conditions, in
capitals, that "no number in this file should be trusted."

So the properties pinned here are exactly the ones that decide publication:

  * the real committed artifact passes — the gate is not so strict it blocks good runs,
  * a failed occipital sanity check is FATAL, per demo/README.md's own "stop",
  * predictions bounded to [0,1] are FATAL — the signed-delta design assumes signed BOLD,
  * per-run z-scoring WARNS rather than blocks (process_batch.py already compensates by
    switching the chart scale, so blocking would discard a usable run),
  * a batch scored with no ASR/OCR backend warns — clarity is 25% of the score and ties
    across every ad when those are missing, which is the quietest degradation there is,
  * the artifact's own warnings survive into the operator's list rather than being
    replaced by ours.

A gate that cannot fail is decoration, so every fatal case here asserts the failure AND
that a clean artifact does not trip it.

Run: .venv/bin/python -m pytest -q test_run_batch_gate.py
"""
import copy
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
ARTIFACT = ROOT / "public" / "preflight" / "batch_report.json"


def _load_runner():
    """tools/concierge/ is not a package (the script is meant to be copied to a rented
    box and run by path), so it is loaded by path rather than imported."""
    path = ROOT / "tools" / "concierge" / "run_batch.py"
    spec = importlib.util.spec_from_file_location("soma_run_batch", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = _load_runner()


@pytest.fixture
def report():
    """The real committed batch artifact. Using the genuine file rather than a fixture
    is deliberate: it is what the gate will actually be handed, and if its shape changes
    these tests should notice before a customer does."""
    if not ARTIFACT.exists():
        pytest.skip("public/preflight/batch_report.json is absent (fresh clone)")
    return json.loads(ARTIFACT.read_text())


def run_gate(report):
    """gate() takes a logger; collect the lines instead of printing them."""
    lines = []
    fatal, warn = runner.gate(report, lines.append)
    return fatal, warn, lines


# ── the happy path ──────────────────────────────────────────────────────────────

def test_real_artifact_is_publishable(report):
    fatal, _warn, _ = run_gate(report)
    assert fatal == [], f"the committed artifact must pass the gate, got: {fatal}"


def test_clean_artifact_reports_clean(report):
    clean = copy.deepcopy(report)
    # This particular committed run was scored on a box with no ASR/OCR, which is a
    # legitimate warning. Clear it so we can assert the no-warning path renders.
    for ad in clean["ads"]:
        ad["flags"] = []
    clean["warnings"] = []
    fatal, warn, lines = run_gate(clean)
    assert fatal == []
    assert warn == []
    assert any("clean" in line for line in lines)


# ── the two fatals ──────────────────────────────────────────────────────────────

def test_failed_occipital_sanity_is_fatal(report):
    broken = copy.deepcopy(report)
    broken["sanity"]["visualPositive"] = False
    broken["sanity"]["fullVisualByAd"] = {"ad_02": -0.1, "ad_03": 0.4}
    fatal, _warn, _ = run_gate(broken)
    assert len(fatal) == 1
    assert "occipital" in fatal[0]
    # The offending ad is named: an operator should not have to open the JSON to find it.
    assert "ad_02" in fatal[0]
    assert "ad_03" not in fatal[0]


def test_missing_sanity_block_is_fatal(report):
    """Absent is not the same as passing. A run that produced no sanity block at all
    must not be published on the grounds that nothing said it was bad."""
    broken = copy.deepcopy(report)
    broken.pop("sanity", None)
    fatal, _warn, _ = run_gate(broken)
    assert any("occipital" in f for f in fatal)


def test_bounded_predictions_are_fatal(report):
    broken = copy.deepcopy(report)
    broken["ads"][0]["diagnostics"]["predsStats"]["full"]["looksBounded01"] = True
    fatal, _warn, _ = run_gate(broken)
    assert any("bounded" in f for f in fatal)
    # Names which ad and which window, because the fix depends on both.
    assert any(broken["ads"][0]["id"] in f and "full" in f for f in fatal)


def test_both_fatals_are_reported_together(report):
    """An operator should learn everything that is wrong in one run, not one thing per
    attempt on a twenty-minute loop."""
    broken = copy.deepcopy(report)
    broken["sanity"]["visualPositive"] = False
    broken["ads"][0]["diagnostics"]["predsStats"]["hook"]["looksBounded01"] = True
    fatal, _warn, _ = run_gate(broken)
    assert len(fatal) == 2


# ── the warnings ────────────────────────────────────────────────────────────────

def test_per_run_zscore_warns_but_does_not_block(report):
    """process_batch.py already switches the chart to the psc lane when this fires, so
    the run is still usable and blocking it would throw away GPU time for nothing."""
    flagged = copy.deepcopy(report)
    flagged["comparability"]["perRunZscoreVerdict"] = "per_run_zscore_likely"
    fatal, warn, _ = run_gate(flagged)
    assert fatal == []
    assert any("z-score" in w for w in warn)


def test_untrustworthy_cross_ad_levels_warn(report):
    flagged = copy.deepcopy(report)
    flagged["comparability"]["crossAdLevelsTrustworthy"] = False
    fatal, warn, _ = run_gate(flagged)
    assert fatal == []
    assert any("cross-cut levels" in w for w in warn)


def test_blind_clarity_warns_only_when_every_ad_is_blind(report):
    """One ad missing a transcript is a property of that ad. EVERY ad missing one means
    the box had no backend installed and a quarter of the score is inert — a different
    claim, and the only one worth warning about."""
    partial = copy.deepcopy(report)
    for i, ad in enumerate(partial["ads"]):
        ad["flags"] = ["no_asr_backend"] if i == 0 else []
    _fatal, warn, _ = run_gate(partial)
    assert not any("clarity is tied" in w for w in warn)

    everyone = copy.deepcopy(report)
    for ad in everyone["ads"]:
        ad["flags"] = ["no_asr_backend", "no_ocr_backend"]
    _fatal, warn, _ = run_gate(everyone)
    assert any("clarity is tied" in w for w in warn)


def test_artifact_warnings_are_carried_through(report):
    carried = copy.deepcopy(report)
    carried["warnings"] = ["the scorer said something specific"]
    for ad in carried["ads"]:
        ad["flags"] = []
    _fatal, warn, _ = run_gate(carried)
    assert "the scorer said something specific" in warn


def test_empty_report_does_not_crash():
    """The gate is the last thing between a broken run and a customer, so it must be
    the one function that cannot itself throw on malformed input."""
    fatal, warn, _ = run_gate({})
    assert any("occipital" in f for f in fatal)
    assert isinstance(warn, list)
