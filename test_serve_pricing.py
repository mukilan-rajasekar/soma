#!/usr/bin/env python3
"""Pricing engine tests.

The schema (0016) re-checks the price identity on insert, so the engine's job is to
never produce a row the database would refuse: weekly_price = spend + margin exactly,
in integers, and the platform split conserves every micro. The parity corpus is pinned
here too - if cases() drifts from the committed fixture, the TS mirror gate is checking
against a corpus that no longer describes this engine.

Run: .venv/bin/python -m pytest -q test_serve_pricing.py
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.pricing import MARGIN_PCT_DEFAULT, cases, quote  # noqa: E402

FIXTURE = ROOT / "tools" / "serve" / "fixtures" / "pricing_cases.json"


def test_price_identity_and_split_conservation():
    q = quote(
        {"platforms": ["meta", "tiktok"], "weekly_spend_micros": 1_000_000_001, "goal": "low_cost_testing"}
    )
    assert q["weekly_price_micros"] == q["weekly_spend_micros"] + q["margin_micros"]
    assert sum(p["weekly_spend_micros"] for p in q["platforms"]) == 1_000_000_001
    assert q["margin_pct"] == MARGIN_PCT_DEFAULT
    assert q["renews"] == "weekly_until_paused"
    assert "not an invoice" in q["billing_note"]


def test_margin_rounds_up_never_down():
    # 7 micros at 50%: 3.5 rounds to 4, or the schema's identity check would force the
    # price to undercharge and the row to lie about its own margin.
    q = quote(
        {"platforms": ["meta"], "weekly_spend_micros": 7, "goal": "aggressive_conversions", "margin_pct": 50}
    )
    assert q["margin_micros"] == 4
    assert q["weekly_price_micros"] == 11


def test_goal_playbooks_are_attached_verbatim():
    q = quote({"platforms": ["meta"], "weekly_spend_micros": 100, "goal": "low_cost_testing"})
    assert q["playbook"]["holdout_pct"] == 0.1
    assert q["playbook"]["arms"] == 3


def test_refusals():
    good = {"platforms": ["meta"], "weekly_spend_micros": 100, "goal": "low_cost_testing"}
    with pytest.raises(ValueError, match="at least one platform"):
        quote({**good, "platforms": []})
    with pytest.raises(ValueError, match="duplicate platform"):
        quote({**good, "platforms": ["meta", "meta"]})
    with pytest.raises(ValueError, match="unknown platform"):
        quote({**good, "platforms": ["google"]})
    with pytest.raises(ValueError, match="positive"):
        quote({**good, "weekly_spend_micros": 0})
    with pytest.raises(ValueError, match="unknown goal"):
        quote({**good, "goal": "vibes"})
    with pytest.raises(ValueError, match="margin_pct"):
        quote({**good, "margin_pct": 51})
    with pytest.raises(ValueError, match="duration_weeks"):
        quote({**good, "duration_weeks": 0})


def test_committed_parity_corpus_matches_the_engine():
    assert FIXTURE.exists(), "regenerate with: tools/serve/pricing.py --cases --out " + str(
        FIXTURE.relative_to(ROOT)
    )
    committed = json.loads(FIXTURE.read_text(encoding="utf8"))
    assert committed == cases(), (
        "fixtures/pricing_cases.json drifted from pricing.cases(); regenerate it and "
        "update src/lib/pricing.ts in the same commit"
    )
