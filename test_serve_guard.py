#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.guard import SpendCaps, check_ok, check_spend, decision_from_fixture  # noqa: E402


def test_check_spend_allows_below_cap():
    decision = check_spend(900, SpendCaps(daily_cap_micros=1000), mode="would_pause")

    assert decision.ok is True
    assert decision.action == "ok"
    assert decision.cap_micros == 1000


def test_check_spend_would_pause_at_cap():
    decision = check_spend(1000, SpendCaps(daily_cap_micros=1000), mode="would_pause")

    assert decision.ok is False
    assert decision.action == "would_pause"
    assert decision.observed_spend_micros == 1000


def test_pause_mode_reports_pause_without_budget_edit():
    decision = check_spend(
        1500,
        SpendCaps(daily_cap_micros=1000, lifetime_cap_micros=5000),
        mode="pause",
    )

    assert decision.ok is False
    assert decision.action == "pause"
    assert decision.cap_micros == 1000


def test_fixture_caps_drive_decision(tmp_path):
    fixture = tmp_path / "spend.json"
    fixture.write_text(
        json.dumps({
            "ads": [
                {
                    "external_ad_id": "ad_1",
                    "observed_spend_micros": 1200,
                    "daily_cap_micros": 1000,
                    "currency": "USD",
                }
            ]
        }),
        encoding="utf8",
    )

    decision = decision_from_fixture(fixture, external_ad_id="ad_1")

    assert decision.action == "would_pause"


def test_check_ok_raises_when_over_cap():
    with pytest.raises(RuntimeError, match="Spend guard blocked activation"):
        check_ok(1200, SpendCaps(daily_cap_micros=1000))
