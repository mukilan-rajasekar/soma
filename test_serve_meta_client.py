#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.meta_client import DryRunRecorder, MetaClient  # noqa: E402


def test_dry_run_creates_paused_campaign_adset_and_ad():
    recorder = DryRunRecorder()
    client = MetaClient(
        access_token="token",
        ad_account_id="act_123",
        dry_run=True,
        recorder=recorder,
    )

    campaign = client.create_campaign(name="Campaign", objective="OUTCOME_TRAFFIC")
    adset = client.create_adset(
        name="Ad set",
        campaign_id=campaign["id"],
        daily_budget=1000,
        billing_event="IMPRESSIONS",
        optimization_goal="LINK_CLICKS",
        targeting={"geo_locations": {"countries": ["US"]}},
    )
    started = client.start_video_upload()
    video = client.finish_video_upload(
        video_id=started["id"],
        upload_url="https://rupload.facebook.com/video",
        file_url="https://signed.example/ad.mp4",
    )
    creative = client.create_adcreative(
        name="Creative",
        page_id="page_1",
        video_id=video["id"],
        message="Message",
    )
    client.create_ad(name="Ad", adset_id=adset["id"], creative_id=creative["id"])

    payloads = [call["payload"] for call in recorder.calls]
    assert payloads[0]["status"] == "PAUSED"
    assert payloads[1]["status"] == "PAUSED"
    assert payloads[-1]["status"] == "PAUSED"
    assert all(payload.get("status") != "ACTIVE" for payload in payloads)
    assert payloads[3]["file_url"] == "https://signed.example/ad.mp4"
    assert recorder.calls[3]["headers"]["file_url"] == "https://signed.example/ad.mp4"


def test_ad_account_id_is_normalized_for_dry_run_url():
    recorder = DryRunRecorder()
    client = MetaClient(access_token="token", ad_account_id="123", dry_run=True, recorder=recorder)

    client.create_campaign(name="Campaign", objective="OUTCOME_TRAFFIC")

    assert "/act_123/campaigns" in recorder.calls[0]["url"]
