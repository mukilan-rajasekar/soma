#!/usr/bin/env python3
"""TikTok client safety tests.

The invariant these pin is the same one test_serve_meta_client.py pins for Meta:
nothing is ever created enabled, and live writes are impossible without the
SOMA_SERVE_LIVE kill switch. TikTok's pause vocabulary is ENABLE/DISABLE, and the
client's outer contract deliberately stays ACTIVE/PAUSED so launch.py has no
platform branch — the translation happens inside set_ad_status and these tests
prove it never leaks.

Run: .venv/bin/python -m pytest -q test_serve_tiktok_client.py
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.meta_client import DryRunRecorder  # noqa: E402
from tools.serve.tiktok_client import TikTokClient  # noqa: E402


def _client(recorder: DryRunRecorder) -> TikTokClient:
    return TikTokClient(
        access_token="token",
        advertiser_id="adv_123",
        dry_run=True,
        recorder=recorder,
    )


def test_dry_run_creates_disabled_campaign_adgroup_and_ad():
    recorder = DryRunRecorder()
    client = _client(recorder)

    campaign = client.create_campaign(name="Campaign")
    adgroup = client.create_adgroup(
        name="Ad group",
        campaign_id=campaign["id"],
        daily_budget=50.0,
    )
    video = client.upload_video(video_url="https://signed.example/ad.mp4")
    client.create_ad(
        name="Ad",
        adgroup_id=adgroup["id"],
        video_id=video["id"],
        ad_text="Text",
        landing_page_url="https://example.com",
    )

    payloads = [call["payload"] for call in recorder.calls]
    creates = [payloads[0], payloads[1], payloads[3]]
    assert all(payload["operation_status"] == "DISABLE" for payload in creates)
    assert all(payload.get("operation_status") != "ENABLE" for payload in payloads)
    assert all(payload["advertiser_id"] == "adv_123" for payload in payloads)
    assert "/campaign/create/" in recorder.calls[0]["url"]
    assert "/file/video/ad/upload/" in recorder.calls[2]["url"]
    assert payloads[2]["upload_type"] == "UPLOAD_BY_URL"


def test_set_ad_status_speaks_active_paused_and_translates():
    recorder = DryRunRecorder()
    client = _client(recorder)

    client.set_ad_status(external_ad_id="ad_1", status="ACTIVE")
    client.set_ad_status(external_ad_id="ad_1", status="PAUSED")

    assert recorder.calls[0]["payload"]["operation_status"] == "ENABLE"
    assert recorder.calls[1]["payload"]["operation_status"] == "DISABLE"
    # TikTok's native vocabulary must not be accepted from callers: a caller that
    # passes ENABLE has bypassed the launch/guard path in its head, and the client
    # should refuse rather than guess.
    with pytest.raises(ValueError, match="ACTIVE or PAUSED"):
        client.set_ad_status(external_ad_id="ad_1", status="ENABLE")


def test_campaign_budget_required_outside_infinite_mode():
    client = _client(DryRunRecorder())
    with pytest.raises(ValueError, match="budget"):
        client.create_campaign(name="Campaign", budget_mode="BUDGET_MODE_DAY")


def test_live_writes_require_soma_serve_live(monkeypatch):
    monkeypatch.delenv("SOMA_SERVE_LIVE", raising=False)
    with pytest.raises(RuntimeError, match="SOMA_SERVE_LIVE"):
        TikTokClient(access_token="token", advertiser_id="adv_123", dry_run=False)


def test_with_id_normalizes_live_create_responses():
    # _with_id short-circuits on `dry_run`, so every other test in this file returns at
    # its first line and the live-response branch has never executed. Its output is
    # chained straight into the next create (campaign id -> adgroup id -> video id), so a
    # mis-parse here builds a real TikTok object against the wrong id.
    client = _client(DryRunRecorder())

    # Dry-run responses pass through untouched — the id is the recorder's synthetic one.
    passthrough = {"dry_run": True, "id": "dry_1"}
    assert client._with_id(passthrough, "ad_ids") is passthrough

    # data as an object, id arriving as a single-element list (TikTok's ad/create shape).
    assert client._with_id({"data": {"ad_ids": ["123"]}}, "ad_ids", "ad_id")["id"] == "123"

    # data as a list — the first element carries the id.
    assert client._with_id({"data": [{"campaign_id": "c1"}]}, "campaign_id")["id"] == "c1"

    # Key order is precedence, not a set: ad_ids wins over ad_id when both are present.
    both = {"data": {"ad_ids": ["from_list"], "ad_id": "from_scalar"}}
    assert client._with_id(both, "ad_ids", "ad_id")["id"] == "from_list"

    # Ids are stringified so downstream chaining never depends on TikTok's JSON typing.
    assert client._with_id({"data": {"video_id": 456}}, "video_id")["id"] == "456"

    # The raw response is preserved for the caller that needs the rest of the envelope.
    assert client._with_id({"data": {"video_id": "v1"}}, "video_id")["raw"] == {
        "data": {"video_id": "v1"}
    }

    # No usable id must raise rather than return something a caller will chain.
    with pytest.raises(RuntimeError, match="has none of"):
        client._with_id({"data": {}}, "ad_ids", "ad_id")
    with pytest.raises(RuntimeError, match="has none of"):
        client._with_id({"data": {"ad_ids": []}}, "ad_ids")


def test_cli_dry_run_chains_the_four_calls(tmp_path):
    spec = {
        "campaign": {"name": "Campaign"},
        "adgroup": {"name": "Ad group", "daily_budget": 50.0},
        "ad": {
            "name": "Ad",
            "ad_text": "Text",
            "landing_page_url": "https://example.com",
        },
        "video_file_url": "https://signed.example/ad.mp4",
    }
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(spec), encoding="utf8")

    result = subprocess.run(
        [sys.executable, "tools/serve/tiktok_client.py", str(spec_path), "--dry-run"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    recorded = []
    for line in result.stdout.splitlines():
        # Recorder lines are compact single-line JSON; the closing summary is
        # indented across many lines and must not be parsed line-by-line.
        if not (line.startswith("{") and line.rstrip().endswith("}")):
            continue
        item = json.loads(line)
        if "payload" in item:
            recorded.append(item)
    assert len(recorded) == 4
    assert all(
        item["payload"].get("operation_status") != "ENABLE" for item in recorded
    )
