#!/usr/bin/env python3
"""
test_edit_run_rescore.py - claim races, plan shape, and stale-claim reaping.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.edit.run_rescore import (  # noqa: E402
    claim_oldest_queued,
    list_stale_processing,
    plan_job,
    reap,
)


class FakeHttp:
    """Minimal PostgREST stand-in keyed by table path."""

    def __init__(self, jobs: list[dict]):
        self.jobs = {j["id"]: dict(j) for j in jobs}
        self.calls = []

    def __call__(self, method, url, key, payload=None):
        self.calls.append({"method": method, "url": url, "payload": payload})
        if method == "GET":
            if "status=eq.queued" in url:
                rows = [j for j in self.jobs.values() if j["status"] == "queued"]
                rows.sort(key=lambda j: j.get("created_at") or "")
                return rows
            if "status=eq.processing" in url:
                return [j for j in self.jobs.values() if j["status"] == "processing"]
            return list(self.jobs.values())

        # PATCH with optional status=eq.* filter
        job_id = None
        require_status = None
        for part in url.split("?")[-1].split("&"):
            if part.startswith("id=eq."):
                job_id = part.split("=", 1)[1].split(".", 1)[-1] if "eq." in part else None
                job_id = part.replace("id=eq.", "", 1)
            if part.startswith("status=eq."):
                require_status = part.replace("status=eq.", "", 1)
        row = self.jobs.get(job_id)
        if row is None:
            return []
        if require_status and row.get("status") != require_status:
            return []
        row.update(payload or {})
        return [row]


def test_claim_oldest_queued_is_conditional():
    http = FakeHttp(
        [
            {
                "id": "j2",
                "status": "queued",
                "created_at": "2026-08-02T00:00:00Z",
                "attempts": 0,
                "edit_run_id": "er-2",
                "cut_ids": [],
            },
            {
                "id": "j1",
                "status": "queued",
                "created_at": "2026-08-01T00:00:00Z",
                "attempts": 0,
                "edit_run_id": "er-1",
                "cut_ids": ["c1"],
            },
        ]
    )
    claimed = claim_oldest_queued("https://x.supabase.co", "key", http=http, now_iso="2026-08-07T00:00:00Z")
    assert claimed["id"] == "j1"
    assert claimed["status"] == "processing"
    assert claimed["attempts"] == 1
    assert claimed["claimed_at"] == "2026-08-07T00:00:00Z"
    assert "status=eq.queued" in http.calls[1]["url"]


def test_claim_returns_none_when_empty():
    assert claim_oldest_queued("https://x.supabase.co", "key", http=FakeHttp([])) is None


def test_plan_job_distinguishes_cut_list():
    with_cuts = plan_job(
        {"id": "j1", "edit_run_id": "er", "batch_id": "b", "ad_id": "ad", "cut_ids": ["c1", "c2"], "attempts": 1}
    )
    assert with_cuts["action"] == "verify_cuts"
    assert with_cuts["cut_ids"] == ["c1", "c2"]
    whole = plan_job({"id": "j2", "edit_run_id": "er", "cut_ids": [], "attempts": 1})
    assert whole["action"] == "verify_edit_run"


def test_stale_detection():
    now = datetime(2026, 8, 7, tzinfo=timezone.utc)
    rows = [
        {
            "id": "fresh",
            "status": "processing",
            "claimed_at": (now - timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
            "attempts": 1,
        },
        {
            "id": "stale",
            "status": "processing",
            "claimed_at": (now - timedelta(minutes=45)).isoformat().replace("+00:00", "Z"),
            "attempts": 1,
        },
        {"id": "queued", "status": "queued", "claimed_at": None, "attempts": 0},
    ]
    stale = list_stale_processing(rows, now=now, stale_minutes=30)
    assert [r["id"] for r in stale] == ["stale"]


def test_reap_releases_then_fails_past_max_attempts():
    now = datetime(2026, 8, 7, tzinfo=timezone.utc)
    old = (now - timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    http = FakeHttp(
        [
            {
                "id": "retry",
                "status": "processing",
                "claimed_at": old,
                "attempts": 1,
                "edit_run_id": "er",
                "cut_ids": [],
            },
            {
                "id": "dead",
                "status": "processing",
                "claimed_at": old,
                "attempts": 3,
                "edit_run_id": "er",
                "cut_ids": [],
            },
        ]
    )
    result = reap(
        "https://x.supabase.co",
        "key",
        http=http,
        now=now,
        stale_minutes=30,
        max_attempts=3,
    )
    assert result["released"] == ["retry"]
    assert result["failed"] == ["dead"]
    assert http.jobs["retry"]["status"] == "queued"
    assert http.jobs["retry"]["claimed_at"] is None
    assert http.jobs["dead"]["status"] == "failed"
    assert "lost the job" in http.jobs["dead"]["error"]
