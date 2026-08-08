#!/usr/bin/env python3
"""Google Ads client safety tests.

Same invariant test_serve_meta_client.py and test_serve_tiktok_client.py pin for the
other two platforms: nothing is ever created enabled, and live writes are impossible
without the SOMA_SERVE_LIVE kill switch. Google's vocabulary is ENABLED/PAUSED; the
client's outer contract stays ACTIVE/PAUSED so launch.py keeps no platform branch,
and these tests prove ENABLED never leaks inbound.

Run: .venv/bin/python -m pytest -q test_serve_google_ads_client.py
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.google_ads_client import GoogleAdsClient  # noqa: E402
from tools.serve.meta_client import DryRunRecorder  # noqa: E402


def _client(recorder: DryRunRecorder) -> GoogleAdsClient:
    return GoogleAdsClient(
        access_token="token",
        developer_token="dev",
        customer_id="123-456-7890",
        dry_run=True,
        recorder=recorder,
    )


def _creates(recorder: DryRunRecorder) -> list[dict]:
    return [call["payload"]["operations"][0].get("create", {}) for call in recorder.calls]


def test_dry_run_creates_paused_campaign_ad_group_and_ad():
    recorder = DryRunRecorder()
    client = _client(recorder)

    budget = client.create_campaign_budget(name="Budget", amount_micros=5_000_000)
    campaign = client.create_campaign(name="Campaign", budget_id=budget["id"])
    asset = client.create_video_asset(name="Ad", youtube_video_id="yt123")
    ad_group = client.create_ad_group(name="Ad group", campaign_id=campaign["id"])
    client.create_ad(
        name="Ad",
        ad_group_id=ad_group["id"],
        video_asset_id=asset["id"],
        final_url="https://example.com",
        headline="Headline",
    )

    creates = _creates(recorder)
    # campaign, ad_group, ad_group_ad all carry PAUSED; budget and asset have no status
    assert creates[1]["status"] == "PAUSED"
    assert creates[3]["status"] == "PAUSED"
    assert creates[4]["status"] == "PAUSED"
    assert all(c.get("status") != "ENABLED" for c in creates)
    # customer id is normalized (dashes stripped) into every mutate URL
    assert all("customers/1234567890/" in call["url"] for call in recorder.calls)
    assert "campaignBudgets:mutate" in recorder.calls[0]["url"]
    assert "adGroupAds:mutate" in recorder.calls[4]["url"]


def test_extra_cannot_smuggle_enabled_status():
    recorder = DryRunRecorder()
    client = _client(recorder)

    client.create_campaign(name="Campaign", budget_id="b", status="ENABLED")
    client.create_ad_group(name="Ad group", campaign_id="c", status="ENABLED")
    client.create_ad(
        name="Ad",
        ad_group_id="g",
        video_asset_id="a",
        final_url="https://example.com",
        headline="H",
        status="ENABLED",
    )

    assert all(c["status"] == "PAUSED" for c in _creates(recorder))


def test_set_ad_status_speaks_active_paused_and_translates():
    recorder = DryRunRecorder()
    client = _client(recorder)

    client.set_ad_status(external_ad_id="customers/1/adGroupAds/2~3", status="ACTIVE")
    client.set_ad_status(external_ad_id="customers/1/adGroupAds/2~3", status="PAUSED")

    ops = [call["payload"]["operations"][0] for call in recorder.calls]
    assert ops[0]["update"]["status"] == "ENABLED"
    assert ops[1]["update"]["status"] == "PAUSED"
    assert all(op["updateMask"] == "status" for op in ops)
    # Google's native vocabulary must not be accepted from callers.
    with pytest.raises(ValueError, match="ACTIVE or PAUSED"):
        client.set_ad_status(external_ad_id="x", status="ENABLED")


def test_live_writes_require_soma_serve_live(monkeypatch):
    monkeypatch.delenv("SOMA_SERVE_LIVE", raising=False)
    with pytest.raises(RuntimeError, match="SOMA_SERVE_LIVE"):
        GoogleAdsClient(
            access_token="token", developer_token="dev", customer_id="123", dry_run=False
        )


def test_cli_dry_run_chains_the_five_calls(tmp_path, monkeypatch):
    spec = {
        "budget": {"name": "Budget", "amount_micros": 5_000_000},
        "campaign": {"name": "Campaign"},
        "ad_group": {"name": "Ad group"},
        "ad": {"name": "Ad", "final_url": "https://example.com", "headline": "H"},
        "youtube_video_id": "yt123",
    }
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(spec), encoding="utf8")

    result = subprocess.run(
        [sys.executable, "tools/serve/google_ads_client.py", str(spec_path), "--dry-run"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin", "GOOGLE_ADS_CUSTOMER_ID": "123"},
    )
    recorded = []
    for line in result.stdout.splitlines():
        if not (line.startswith("{") and line.rstrip().endswith("}")):
            continue
        item = json.loads(line)
        if "payload" in item:
            recorded.append(item)
    assert len(recorded) == 5
    creates = [item["payload"]["operations"][0].get("create", {}) for item in recorded]
    assert all(c.get("status") != "ENABLED" for c in creates)
    assert sum(1 for c in creates if c.get("status") == "PAUSED") == 3


# --- launch.py integration: the platform branch stays paused and funded ------------


def test_launch_create_google_dry_run_all_paused(tmp_path):
    from tools.serve import launch

    spec = {
        "budget": {"name": "Budget", "amount_micros": 5_000_000},
        "campaign": {"name": "Campaign", "status": "ENABLED"},
        "ad_group": {"name": "Ad group"},
        "ad": {"name": "Ad", "final_url": "https://example.com", "headline": "H"},
        "youtube_video_id": "yt123",
    }
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(spec), encoding="utf8")

    result = launch.create_from_spec(spec_path, dry_run=True, platform="google")
    assert set(result) == {"budget", "campaign", "asset", "ad_group", "ad"}
    assert all(v.get("dry_run") for v in result.values())


def test_launch_activate_google_refuses_unfunded_quote(tmp_path):
    from tools.serve import launch, pricing

    quote = pricing.quote(
        {"platforms": ["meta"], "weekly_spend_micros": 700_000_000, "goal": "low_cost_testing"}
    )
    quote_path = tmp_path / "quote.json"
    quote_path.write_text(json.dumps(quote), encoding="utf8")
    guard_path = tmp_path / "guard.json"
    guard_path.write_text(
        json.dumps(
            [
                {
                    "external_ad_id": "customers/1/adGroupAds/2~3",
                    "observed_spend_micros": 0,
                    "daily_cap_micros": 1_000_000,
                }
            ]
        ),
        encoding="utf8",
    )

    with pytest.raises(RuntimeError, match="no 'google' allocation"):
        launch.activate(
            "customers/1/adGroupAds/2~3",
            fixture=guard_path,
            dry_run=True,
            platform="google",
            funded_quote=quote_path,
        )
