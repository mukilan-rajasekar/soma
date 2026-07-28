#!/usr/bin/env python3
"""
test_run_batch_worker.py — queue-claiming and lifecycle-email helpers.

These paths are the new "autonomous worker" surface of tools/concierge/run_batch.py.
They are exactly the kind of logic that can silently regress while the happy-path manual
run still works, so they are pinned separately from the publish gate tests.
"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _load_runner():
    path = ROOT / "tools" / "concierge" / "run_batch.py"
    spec = importlib.util.spec_from_file_location("soma_run_batch", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = _load_runner()


class FakeSupabase:
    def __init__(self, rows, claimed_ids=()):
        self.rows = rows
        self.claimed_ids = set(claimed_ids)
        self.patches = []

    def select(self, _table, _query):
        return list(self.rows)

    def patch(self, _table, query, row):
        self.patches.append((query, row))
        batch_id = query.split("id=eq.", 1)[1].split("&", 1)[0]
        if batch_id in self.claimed_ids:
            return []
        self.claimed_ids.add(batch_id)
        return [{"id": batch_id, "status": row["status"]}]


def test_build_processing_email_includes_live_run_url(monkeypatch):
    monkeypatch.setenv("PUBLIC_APP_URL", "https://www.usesoma.work")
    msg = runner.build_batch_email("processing", {
        "email": "team@example.com",
        "share_token": "abc123",
        "batch_name": "Q3 hook test",
    })
    assert msg["to"] == "team@example.com"
    assert "Q3 hook test" in msg["subject"]
    assert "https://www.usesoma.work/r/abc123" in msg["text"]


def test_build_failed_email_carries_reason(monkeypatch):
    monkeypatch.setenv("PUBLIC_APP_URL", "https://www.usesoma.work")
    msg = runner.build_batch_email("failed", {
        "email": "team@example.com",
        "share_token": "deadbeef",
        "batch_name": "Batch 7",
    }, reason="The scorer stopped.")
    assert "Batch 7" in msg["subject"]
    assert "The scorer stopped." in msg["text"]
    assert "/r/deadbeef" in msg["text"]


def test_build_email_returns_none_without_address():
    assert runner.build_batch_email("done", {"share_token": "abc"}) is None
    assert runner.build_batch_email("done", {"email": "x@example.com"}) is None


def test_claim_oldest_queued_skips_lost_race():
    sb = FakeSupabase(
        rows=[
            {"id": "batch-1", "status": "queued"},
            {"id": "batch-2", "status": "queued"},
        ],
        claimed_ids={"batch-1"},
    )
    claimed = runner.claim_oldest_queued(sb)
    assert claimed == {"id": "batch-2", "status": "processing"}
    assert len(sb.patches) == 2


def test_claim_oldest_queued_returns_none_when_queue_empty():
    sb = FakeSupabase(rows=[])
    assert runner.claim_oldest_queued(sb) is None
