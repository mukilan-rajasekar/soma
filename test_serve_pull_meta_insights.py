#!/usr/bin/env python3
"""
test_serve_pull_meta_insights.py - async Insights pull, usage backoff, normalize.
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.pull_meta_insights import (  # noqa: E402
    MetaInsightsClient,
    fixture_transport,
    load_served_ads,
    next_backoff_s,
    normalize_insight_row,
    parse_usage_header,
    rows_for_served_ads,
    spend_to_micros,
)

FIXTURE = ROOT / "tools" / "serve" / "fixtures" / "meta_insights_async.json"
SERVED = ROOT / "tools" / "serve" / "fixtures" / "served_ads_meta.json"


def test_parse_usage_header_takes_worst_regain():
    header = json.dumps(
        {
            "111": [{"type": "ads_insights", "call_count": 10, "estimated_time_to_regain_access": 0}],
            "222": [{"type": "ads_insights", "call_count": 90, "estimated_time_to_regain_access": 7}],
        }
    )
    usage = parse_usage_header(header)
    assert usage["estimated_time_to_regain_access"] == 7
    assert usage["call_count"] == 90
    assert parse_usage_header(None) == {}
    assert parse_usage_header("not-json") == {}


def test_backoff_prefers_usage_regain_over_exponential():
    assert next_backoff_s({"estimated_time_to_regain_access": 5}, 0) == 5
    assert next_backoff_s({}, 0) == 1
    assert next_backoff_s({}, 3) == 8
    assert next_backoff_s({}, 10) == 60


def test_spend_to_micros_and_normalize_required_fields():
    assert spend_to_micros("12.34") == 12_340_000
    row = normalize_insight_row(
        {
            "ad_id": "ad_9",
            "impressions": "1000",
            "spend": "12.34",
            "clicks": "42",
            "actions": [{"action_type": "purchase", "value": "3"}],
            "action_values": [{"action_type": "purchase", "value": "45.50"}],
        },
        brand_id="brand-1",
        external_ad_account_id="123",
        window_start="2026-08-01",
        window_end="2026-08-02",
        attribution="7d_click",
        currency="usd",
        pulled_at="2026-08-03T00:00:00Z",
    )
    assert row["external_ad_account_id"] == "act_123"
    assert row["source"] == "meta_insights_api"
    assert row["spend_micros"] == 12_340_000
    assert row["conversions"] == 3
    assert row["conversion_value_micros"] == 45_500_000
    assert row["raw"]["ad_id"] == "ad_9"

    with pytest.raises(ValueError, match="attribution"):
        normalize_insight_row(
            {"ad_id": "ad_9", "impressions": "1", "spend": "0.01", "clicks": "0"},
            brand_id="b",
            external_ad_account_id="act_1",
            window_start="2026-08-01",
            window_end="2026-08-02",
            attribution="",
            currency="USD",
        )


def test_fixture_async_pull_joins_served_ads_and_skips_unlinked():
    sleeps: list[float] = []
    sequence = json.loads(FIXTURE.read_text(encoding="utf8"))
    client = MetaInsightsClient(
        access_token="token",
        ad_account_id="act_123",
        dry_run=False,
        sleep=sleeps.append,
        transport=fixture_transport(sequence),
    )
    raw = client.pull_ad_insights(since="2026-08-01", until="2026-08-02", ad_ids=["ad_9", "ad_10"])
    assert len(raw) == 2
    assert sleeps == [2.0]  # usage header on the running poll, not the start (regain=0)

    served = load_served_ads(SERVED)
    rows = rows_for_served_ads(
        raw,
        served,
        window_start="2026-08-01",
        window_end="2026-08-02",
        attribution="7d_click",
        currency="USD",
        pulled_at="2026-08-03T00:00:00Z",
    )
    assert len(rows) == 1
    assert rows[0]["external_ad_id"] == "ad_9"
    assert rows[0]["thruplays"] == 120
    assert rows[0]["video_p25"] == 500
    assert client.calls[0]["payload"]["async"] == "true"
    assert client.calls[0]["payload"]["level"] == "ad"
    assert "filtering" in client.calls[0]["payload"]


def test_failed_job_raises():
    sequence = [
        {"body": {"report_run_id": "run_x"}, "headers": {}},
        {"body": {"async_status": "Job Failed"}, "headers": {}},
    ]
    client = MetaInsightsClient(
        access_token="token",
        ad_account_id="act_1",
        transport=fixture_transport(sequence),
        sleep=lambda _s: None,
    )
    with pytest.raises(RuntimeError, match="failed"):
        client.pull_ad_insights(since="2026-08-01", until="2026-08-02")


def test_cli_fixture_path(tmp_path):
    from tools.serve.pull_meta_insights import main

    out = tmp_path / "out.json"
    rc = main(
        [
            "--served-ads",
            str(SERVED),
            "--since",
            "2026-08-01",
            "--until",
            "2026-08-02",
            "--attribution",
            "7d_click",
            "--fixture",
            str(FIXTURE),
            "--pulled-at",
            "2026-08-03T00:00:00Z",
            "--out",
            str(out),
        ]
    )
    assert rc == 0
    payload = json.loads(out.read_text(encoding="utf8"))
    assert payload["matched"] == 1
    assert payload["raw_count"] == 2
    assert payload["rows"][0]["source"] == "meta_insights_api"
