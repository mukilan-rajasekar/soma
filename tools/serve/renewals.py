#!/usr/bin/env python3
"""
renewals.py - advance weekly campaign subscriptions, and refuse to do it for real.

"Renews weekly until paused" is a scheduling statement, and this is the scheduler. The
tick walks a subscriptions fixture, finds active rows whose period has lapsed, and
advances current_period_start/end in whole weeks (catching up multiple weeks if the
tick was late), incrementing `renewals` once per week advanced.

The gate is the point of this file. A renewal that executes is a bill in waiting, and
bills are what PLAN.md gate 4 blocks: while check_licence_gate.licence_blocked() is
true, --execute refuses with the same sentence the gate check prints. Dry-run planning
is always allowed - the operator can see exactly what would renew - and --today is
required rather than defaulted so a plan is reproducible evidence, not a timestamped
one-off.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.serve.check_licence_gate import licence_blocked  # noqa: E402

WEEK = dt.timedelta(days=7)


def _date(value: str, label: str) -> dt.date:
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc


def tick(subscriptions: list[dict[str, Any]], *, today: dt.date) -> dict[str, Any]:
    renewed, untouched = [], []
    for sub in subscriptions:
        status = str(sub.get("status") or "")
        if status != "active":
            untouched.append({"id": sub.get("id"), "status": status, "reason": f"status is {status}"})
            continue
        end = _date(str(sub.get("current_period_end")), "current_period_end")
        if end > today:
            untouched.append({"id": sub.get("id"), "status": status, "reason": f"period runs to {end}"})
            continue
        start = _date(str(sub.get("current_period_start")), "current_period_start")
        weeks = 0
        while end <= today:
            start, end = end, end + WEEK
            weeks += 1
        renewed.append(
            {
                "id": sub.get("id"),
                "weeks_advanced": weeks,
                "current_period_start": start.isoformat(),
                "current_period_end": end.isoformat(),
                "renewals": int(sub.get("renewals") or 0) + weeks,
                "weekly_price_micros": sub.get("weekly_price_micros"),
            }
        )
    return {"today": today.isoformat(), "renewed": renewed, "untouched": untouched}


def apply_tick(subscriptions: list[dict[str, Any]], plan: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {r["id"]: r for r in plan["renewed"]}
    out = []
    for sub in subscriptions:
        change = by_id.get(sub.get("id"))
        if change:
            sub = {
                **sub,
                "current_period_start": change["current_period_start"],
                "current_period_end": change["current_period_end"],
                "renewals": change["renewals"],
            }
        out.append(sub)
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Advance weekly subscriptions from a fixture.")
    p.add_argument("fixture", type=Path, help="JSON list of subscription rows")
    p.add_argument("--today", required=True, help="YYYY-MM-DD; explicit so plans are reproducible")
    p.add_argument("--execute", action="store_true", help="write the advanced rows back to the fixture")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        today = _date(args.today, "--today")
        subscriptions = json.loads(args.fixture.read_text(encoding="utf8"))
        plan = tick(subscriptions, today=today)
        if args.execute:
            if licence_blocked():
                raise RuntimeError(
                    "refusing to execute renewals: PLAN.md gate 4 is open (a renewal that "
                    "executes is a bill in waiting). Resolve the gate, or plan without --execute."
                )
            args.fixture.write_text(
                json.dumps(apply_tick(subscriptions, plan), indent=2, sort_keys=True) + "\n",
                encoding="utf8",
            )
    except Exception as exc:
        print(f"renewals failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({**plan, "executed": bool(args.execute)}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
