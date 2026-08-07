#!/usr/bin/env python3
"""
test_serve_poll_status.py - map Meta effective_status and plan served_ads patches.
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.poll_status import (  # noqa: E402
    MetaStatusClient,
    execute,
    map_review_status,
    plan_updates,
)

SERVED = ROOT / "tools" / "serve" / "fixtures" / "served_ads_meta.json"
STATUS = ROOT / "tools" / "serve" / "fixtures" / "meta_ad_status.json"


def test_status_map():
    assert map_review_status("ACTIVE") == "approved"
    assert map_review_status("PAUSED") == "approved"
    assert map_review_status("PENDING_REVIEW") == "pending"
    assert map_review_status("DISAPPROVED") == "rejected"
    assert map_review_status("WITH_ISSUES") == "limited"
    with pytest.raises(ValueError, match="unknown"):
        map_review_status("MADE_UP")


def test_plan_updates_from_fixture():
    by_id = json.loads(STATUS.read_text(encoding="utf8"))
    served = json.loads(SERVED.read_text(encoding="utf8"))

    def transport(method, url):
        ad_id = url.split("?")[0].rstrip("/").rsplit("/", 1)[-1]
        return by_id[ad_id]

    client = MetaStatusClient(access_token="fixture", transport=transport)
    planned = plan_updates(served, client)

    assert len(planned["updates"]) == 2
    by_served = {u["id"]: u for u in planned["updates"]}
    assert by_served["sa-meta-1"]["review_status"] == "rejected"
    assert by_served["sa-meta-1"]["review_feedback"]["effective_status"] == "DISAPPROVED"
    assert "TEXT_OVERLAY" in by_served["sa-meta-1"]["review_feedback"]["ad_review_feedback"]["global"]
    assert by_served["sa-meta-2"]["review_status"] == "approved"
    assert planned["skipped"] == []


def test_unchanged_rows_are_not_patched():
    served = [
        {
            "id": "sa-1",
            "platform": "meta",
            "external_ad_id": "ad_9",
            "review_status": "rejected",
            "review_feedback": {"effective_status": "DISAPPROVED"},
        }
    ]

    def transport(method, url):
        return {"id": "ad_9", "effective_status": "DISAPPROVED", "configured_status": "ACTIVE"}

    planned = plan_updates(served, MetaStatusClient(access_token="t", transport=transport))
    assert planned["updates"] == []
    assert planned["unchanged"] == [{"id": "sa-1", "review_status": "rejected"}]


def test_execute_patches_each_row():
    calls = []

    def http(method, url, key, payload=None):
        calls.append({"method": method, "url": url, "payload": payload})
        return [payload]

    n = execute(
        [
            {
                "id": "sa-1",
                "review_status": "rejected",
                "review_feedback": {"effective_status": "DISAPPROVED"},
            }
        ],
        "https://x.supabase.co",
        "key",
        http=http,
    )
    assert n == 1
    assert calls[0]["method"] == "PATCH"
    assert "served_ads?id=eq.sa-1" in calls[0]["url"]
    assert calls[0]["payload"]["review_status"] == "rejected"


def test_cli_fixture(tmp_path, capsys):
    from tools.serve.poll_status import main

    rc = main(
        [
            "--served-ads",
            str(SERVED),
            "--fixture",
            str(STATUS),
        ]
    )
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["executed"] is False
    assert out["written"] == 0
    assert len(out["updates"]) == 2
