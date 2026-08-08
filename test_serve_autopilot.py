#!/usr/bin/env python3
"""Autopilot cycle tests.

The one invariant worth a file of its own: autopilot may stop spend, never start it.
A winning arm produces a referral to launch.py's funded-quote path, not an ACTIVE
call; losing arms and cap breaches produce PAUSED calls and nothing else. The
renewals stage honors the licence gate as a recorded refusal instead of a crash, so
an unattended cycle always completes with a truthful report.

Run: .venv/bin/python -m pytest -q test_serve_autopilot.py
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve import autopilot  # noqa: E402


class SpyClient:
    """Stands in for every platform client; records what autopilot asks for."""

    statuses: list[tuple[str, str]] = []

    def __init__(self, *, dry_run: bool):
        self.dry_run = dry_run

    def set_ad_status(self, *, external_ad_id: str, status: str):
        SpyClient.statuses.append((external_ad_id, status))
        return {"spy": True, "status": status}


@pytest.fixture
def spy_clients(monkeypatch):
    SpyClient.statuses = []
    monkeypatch.setattr(
        autopilot, "PLATFORM_CLIENTS", {"meta": SpyClient, "tiktok": SpyClient, "google": SpyClient}
    )
    return SpyClient


def _winner_spec():
    return {
        "today": "2026-08-07",
        "experiments": [
            {
                "experiment_key": "exp1",
                "fixture": {
                    "arms": [
                        {"arm_key": "control", "is_control": True, "impressions": 10000, "clicks": 100},
                        {"arm_key": "variant", "impressions": 10000, "clicks": 220},
                    ]
                },
                "arm_ads": {
                    "control": {"platform": "meta", "external_ad_id": "ad_control"},
                    "variant": {"platform": "meta", "external_ad_id": "ad_variant"},
                },
            }
        ],
    }


def test_winner_pauses_losers_and_only_refers_activation(tmp_path):
    report = autopilot.run_cycle(_winner_spec(), base=tmp_path)

    assert report["experiments"][0]["result"]["decision"] == "winner"
    planned = report["actions_planned"]
    assert [a["external_ad_id"] for a in planned] == ["ad_control"]
    assert all(a["action"] == "pause" for a in planned)
    referrals = report["activation_referrals"]
    assert len(referrals) == 1 and referrals[0]["arm_key"] == "variant"
    assert "launch.py" in referrals[0]["referred_to"]
    # plan-only mode executes nothing
    assert report["actions_executed"] == []


def test_execute_sends_only_paused_never_active(tmp_path, spy_clients, monkeypatch):
    monkeypatch.delenv("SOMA_SERVE_LIVE", raising=False)
    report = autopilot.run_cycle(_winner_spec(), base=tmp_path, execute=True)

    assert spy_clients.statuses == [("ad_control", "PAUSED")]
    assert all(status == "PAUSED" for _, status in spy_clients.statuses)
    assert report["actions_executed"][0]["live"] is False


def test_insufficient_n_plans_nothing(tmp_path):
    spec = {
        "today": "2026-08-07",
        "experiments": [
            {
                "experiment_key": "tiny",
                "fixture": {
                    "arms": [
                        {"arm_key": "a", "is_control": True, "impressions": 100, "clicks": 3},
                        {"arm_key": "b", "impressions": 100, "clicks": 5},
                    ]
                },
                "arm_ads": {"b": {"platform": "meta", "external_ad_id": "ad_b"}},
            }
        ],
    }
    report = autopilot.run_cycle(spec, base=tmp_path)
    assert report["experiments"][0]["result"]["decision"] == "insufficient_n"
    assert report["actions_planned"] == []
    assert report["activation_referrals"] == []


def test_guard_breach_becomes_pause_action(tmp_path):
    fixture = [
        {
            "external_ad_id": "ad_hot",
            "observed_spend_micros": 9_000_000,
            "daily_cap_micros": 5_000_000,
        }
    ]
    (tmp_path / "guard.json").write_text(json.dumps(fixture), encoding="utf8")
    spec = {
        "today": "2026-08-07",
        "guards": [{"fixture": "guard.json", "external_ad_id": "ad_hot", "platform": "tiktok"}],
    }
    report = autopilot.run_cycle(spec, base=tmp_path)
    assert report["guards"][0]["decision"]["ok"] is False
    assert report["actions_planned"][0]["external_ad_id"] == "ad_hot"
    assert report["actions_planned"][0]["platform"] == "tiktok"


def _subs_fixture(tmp_path):
    subs = [
        {
            "id": "sub1",
            "status": "active",
            "current_period_start": "2026-07-27",
            "current_period_end": "2026-08-03",
            "renewals": 0,
            "weekly_price_micros": 1_800_000_000,
        }
    ]
    path = tmp_path / "subs.json"
    path.write_text(json.dumps(subs), encoding="utf8")
    return path, subs


def test_renewals_gate_open_records_refusal_and_writes_nothing(tmp_path, monkeypatch):
    path, subs = _subs_fixture(tmp_path)
    monkeypatch.setattr(autopilot, "licence_blocked", lambda: True)

    report = autopilot.run_cycle(
        {"today": "2026-08-07", "subscriptions": "subs.json"}, base=tmp_path, execute=True
    )

    assert report["renewals"]["renewed"][0]["id"] == "sub1"
    assert any("gate 4" in r["refused"] for r in report["refusals"])
    assert json.loads(path.read_text(encoding="utf8")) == subs  # untouched


def test_renewals_gate_closed_writes_back(tmp_path, monkeypatch):
    path, _ = _subs_fixture(tmp_path)
    monkeypatch.setattr(autopilot, "licence_blocked", lambda: False)

    report = autopilot.run_cycle(
        {"today": "2026-08-07", "subscriptions": "subs.json"}, base=tmp_path, execute=True
    )

    assert report["refusals"] == []
    written = json.loads(path.read_text(encoding="utf8"))
    assert written[0]["current_period_end"] == "2026-08-10"
    assert written[0]["renewals"] == 1


def test_cross_brand_calibration_is_a_refusal_not_a_crash(tmp_path):
    spec = {
        "today": "2026-08-07",
        "calibration": {
            "brand_id": "brand_a",
            "served_ads": [
                {"id": "s1", "brand_id": "brand_b", "prediction": {"score": 0.5}},
            ],
            "outcomes": [{"served_ad_id": "s1", "impressions": 100, "clicks": 5}],
        },
        "experiments": [],
    }
    report = autopilot.run_cycle(spec, base=tmp_path)
    assert any(r["stage"] == "calibration" for r in report["refusals"])
    assert report["calibration"] is None


def test_today_is_required_and_explicit(tmp_path):
    spec_path = tmp_path / "cycle.json"
    spec_path.write_text(json.dumps({"experiments": []}), encoding="utf8")
    assert autopilot.main([str(spec_path)]) == 1
