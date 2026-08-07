#!/usr/bin/env python3
"""
test_serve_outcomes_ingest.py - Serve v0 outcome CSVs are append-only evidence.

No live database is involved. The in-memory store is a test double for the one invariant
that matters before Supabase is wired: a second pull of the same window adds history
rather than overwriting the first measurement.
"""

import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.ingest_outcomes_csv import InMemoryOutcomeStore, parse_csv  # noqa: E402


HEADER = (
    "brand_id,platform,external_ad_account_id,external_ad_id,window_start,window_end,"
    "attribution,impressions,spend_micros,currency,clicks,source,pulled_at\n"
)


def write_csv(tmp_path, body: str, name: str = "outcomes.csv") -> Path:
    path = tmp_path / name
    path.write_text(HEADER + body, encoding="utf8")
    return path


def test_csv_parse_normalizes_required_columns(tmp_path):
    path = write_csv(
        tmp_path,
        "brand-1,meta,act_123,ad_9,2026-08-01,2026-08-02,7d_click,"
        "1000,12340000,usd,42,csv,2026-08-03T00:00:00Z\n",
    )

    rows = parse_csv(path)

    assert rows == [
        {
            "brand_id": "brand-1",
            "platform": "meta",
            "external_ad_account_id": "act_123",
            "external_ad_id": "ad_9",
            "window_start": "2026-08-01",
            "window_end": "2026-08-02",
            "attribution": "7d_click",
            "impressions": 1000,
            "spend_micros": 12340000,
            "currency": "USD",
            "clicks": 42,
            "source": "csv",
            "pulled_at": "2026-08-03T00:00:00Z",
            "revision": 1,
            "raw": {
                "brand_id": "brand-1",
                "platform": "meta",
                "external_ad_account_id": "act_123",
                "external_ad_id": "ad_9",
                "window_start": "2026-08-01",
                "window_end": "2026-08-02",
                "attribution": "7d_click",
                "impressions": "1000",
                "spend_micros": "12340000",
                "currency": "usd",
                "clicks": "42",
                "source": "csv",
                "pulled_at": "2026-08-03T00:00:00Z",
            },
        }
    ]


def test_repull_keeps_history_in_memory(tmp_path):
    first = write_csv(
        tmp_path,
        "brand-1,meta,act_123,ad_9,2026-08-01,2026-08-02,7d_click,"
        "1000,1000000,USD,40,csv,2026-08-03T00:00:00Z\n",
        "first.csv",
    )
    second = write_csv(
        tmp_path,
        "brand-1,meta,act_123,ad_9,2026-08-01,2026-08-02,7d_click,"
        "1200,1500000,USD,55,csv,2026-08-04T00:00:00Z\n",
        "second.csv",
    )

    store = InMemoryOutcomeStore()
    store.write(parse_csv(first))
    store.write(parse_csv(second))

    assert len(store.history) == 2
    current = store.current()
    assert len(current) == 1
    assert current[0]["impressions"] == 1200
    assert current[0]["pulled_at"] == "2026-08-04T00:00:00Z"


def test_attribution_is_required_for_api_sources(tmp_path):
    path = write_csv(
        tmp_path,
        "brand-1,meta,act_123,ad_9,2026-08-01,2026-08-02,,"
        "1000,1000000,USD,40,meta_insights_api,2026-08-03T00:00:00Z\n",
    )

    with pytest.raises(ValueError, match="attribution is required"):
        parse_csv(path)


def test_cli_help_includes_dry_run():
    proc = subprocess.run(
        [sys.executable, "tools/serve/ingest_outcomes_csv.py", "--help"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    assert "--dry-run" in proc.stdout
    assert "--fixture" in proc.stdout
