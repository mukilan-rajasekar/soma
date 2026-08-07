#!/usr/bin/env python3
"""Renewal scheduler tests.

Two protected properties: the catch-up arithmetic (a late tick advances in whole weeks
until the period covers today, counting every week it crossed) and the licence gate on
--execute (while PLAN.md gate 4 stands, executing renewals is refused with a loud
sentence; planning is always allowed).

Run: .venv/bin/python -m pytest -q test_serve_renewals.py
"""

import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.check_licence_gate import licence_blocked  # noqa: E402
from tools.serve.renewals import apply_tick, tick  # noqa: E402


def _sub(**over):
    base = {
        "id": "sub_1",
        "status": "active",
        "weekly_price_micros": 600_000_000,
        "current_period_start": "2026-08-01",
        "current_period_end": "2026-08-08",
        "renewals": 0,
    }
    return {**base, **over}


def test_due_subscription_advances_one_week():
    plan = tick([_sub()], today=dt.date(2026, 8, 8))
    assert len(plan["renewed"]) == 1
    r = plan["renewed"][0]
    assert r["weeks_advanced"] == 1
    assert r["current_period_start"] == "2026-08-08"
    assert r["current_period_end"] == "2026-08-15"
    assert r["renewals"] == 1


def test_late_tick_catches_up_whole_weeks():
    plan = tick([_sub()], today=dt.date(2026, 8, 24))
    r = plan["renewed"][0]
    assert r["weeks_advanced"] == 3
    assert r["current_period_end"] == "2026-08-29"
    assert r["renewals"] == 3


def test_paused_and_future_rows_are_untouched():
    plan = tick(
        [_sub(id="p", status="paused"), _sub(id="f", current_period_end="2026-09-01")],
        today=dt.date(2026, 8, 8),
    )
    assert plan["renewed"] == []
    reasons = {u["id"]: u["reason"] for u in plan["untouched"]}
    assert "paused" in reasons["p"]
    assert "2026-09-01" in reasons["f"]


def test_apply_tick_rewrites_only_renewed_rows():
    subs = [_sub(), _sub(id="sub_2", status="paused")]
    plan = tick(subs, today=dt.date(2026, 8, 8))
    out = apply_tick(subs, plan)
    assert out[0]["current_period_end"] == "2026-08-15"
    assert out[1]["current_period_end"] == "2026-08-08"


def test_execute_is_refused_while_licence_gate_is_open(tmp_path):
    # The repo's PLAN.md still carries the gate line today; if that ever resolves,
    # this test flips to asserting execution works — deliberately, in a reviewed diff.
    assert licence_blocked() is True

    fixture = tmp_path / "subs.json"
    fixture.write_text(json.dumps([_sub()]), encoding="utf8")
    result = subprocess.run(
        [sys.executable, "tools/serve/renewals.py", str(fixture), "--today", "2026-08-08", "--execute"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "gate 4" in result.stderr
    # And the fixture was not touched.
    assert json.loads(fixture.read_text(encoding="utf8"))[0]["renewals"] == 0

    # Planning without --execute succeeds against the same fixture.
    ok = subprocess.run(
        [sys.executable, "tools/serve/renewals.py", str(fixture), "--today", "2026-08-08"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert ok.returncode == 0
    assert json.loads(ok.stdout)["renewed"][0]["renewals"] == 1
