#!/usr/bin/env python3
"""
test_serve_outcomes_db.py - the DB sink resolves, refuses, and writes what it planned.

No live database. The http callable is injected, so these tests pin the three behaviors
that matter before anyone points this at production: resolution goes through
(platform, external_ad_id), a brand mismatch is a raise for the whole file rather than a
quiet skip, and the insert payload carries only 0012 columns plus the resolved
served_ad_id.
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.ingest_outcomes_csv import parse_csv  # noqa: E402
from tools.serve.ingest_outcomes_db import OUTCOME_COLUMNS, execute, plan  # noqa: E402

HEADER = (
    "brand_id,platform,external_ad_account_id,external_ad_id,window_start,window_end,"
    "attribution,impressions,spend_micros,currency,clicks,source,pulled_at\n"
)
ROW = (
    "brand-1,meta,act_123,ad_9,2026-08-01,2026-08-02,7d_click,"
    "1000,12340000,usd,42,csv,2026-08-03T00:00:00Z\n"
)


def _rows(tmp_path, body: str = ROW):
    path = tmp_path / "outcomes.csv"
    path.write_text(HEADER + body, encoding="utf8")
    return parse_csv(path)


class FakeHttp:
    def __init__(self, served=None):
        self.served = served if served is not None else [{"id": "sa_1", "brand_id": "brand-1"}]
        self.calls = []

    def __call__(self, method, url, key, payload=None):
        self.calls.append({"method": method, "url": url, "payload": payload})
        if method == "GET":
            return self.served
        return payload or []


def test_plan_resolves_and_builds_a_0012_shaped_insert(tmp_path):
    http = FakeHttp()
    planned = plan(_rows(tmp_path), "https://x.supabase.co", "key", http=http)

    assert len(planned["inserts"]) == 1
    insert = planned["inserts"][0]
    assert insert["served_ad_id"] == "sa_1"
    assert insert["impressions"] == 1000
    # Routing fields stay out of the row: they live inside raw only.
    assert "brand_id" not in insert
    assert "platform" not in insert
    assert "external_ad_id" not in insert
    assert set(insert) <= set(OUTCOME_COLUMNS) | {"served_ad_id"}
    assert "platform=eq.meta" in http.calls[0]["url"]
    assert "external_ad_id=eq.ad_9" in http.calls[0]["url"]


def test_plan_skips_unresolvable_rows_with_reasons(tmp_path):
    no_ad_id = (
        "brand-1,meta,act_123,,2026-08-01,2026-08-02,7d_click,"
        "1000,12340000,usd,42,csv,2026-08-03T00:00:00Z\n"
    )
    planned = plan(_rows(tmp_path, ROW + no_ad_id), "https://x.supabase.co", "key", http=FakeHttp())
    assert len(planned["inserts"]) == 1
    assert len(planned["skipped"]) == 1
    assert "external_ad_id" in planned["skipped"][0]["reason"]

    unresolved = plan(_rows(tmp_path), "https://x.supabase.co", "key", http=FakeHttp(served=[]))
    assert unresolved["inserts"] == []
    assert "no served_ad" in unresolved["skipped"][0]["reason"]


def test_brand_mismatch_is_a_raise_not_a_skip(tmp_path):
    http = FakeHttp(served=[{"id": "sa_1", "brand_id": "someone-else"}])
    with pytest.raises(RuntimeError, match="brand mismatch"):
        plan(_rows(tmp_path), "https://x.supabase.co", "key", http=http)


def test_execute_posts_with_the_0012_conflict_key(tmp_path):
    http = FakeHttp()
    planned = plan(_rows(tmp_path), "https://x.supabase.co", "key", http=http)
    written = execute(planned["inserts"], "https://x.supabase.co", "key", http=http)

    assert written == 1
    post = http.calls[-1]
    assert post["method"] == "POST"
    assert "/rest/v1/outcomes" in post["url"]
    assert "on_conflict=" in post["url"]
    assert "served_ad_id" in post["url"]
    assert post["payload"][0]["served_ad_id"] == "sa_1"


def test_execute_with_nothing_planned_writes_nothing():
    http = FakeHttp()
    assert execute([], "https://x.supabase.co", "key", http=http) == 0
    assert http.calls == []
