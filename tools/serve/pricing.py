#!/usr/bin/env python3
"""
pricing.py - one brief in, one all-inclusive weekly price out. The canonical engine.

Founder decision (Aug 2026): a campaign is priced as bundled media spend across the
chosen networks plus a margin (default 20%) on serving costs, renewing weekly until
paused. This supersedes the flat-fee stance in BUILD-PLAN §0.5 - the supersession and
its trade-offs are recorded there, not re-argued here.

Two invariants carry this module. First, integer micros everywhere: the price identity
weekly_price = weekly_spend + margin holds exactly, the platform split conserves every
micro deterministically, and migration 0016 re-checks the identity in the schema.
Second, a quote is not an invoice: nothing here bills anyone, and the renewal path
(tools/serve/renewals.py) refuses to execute while the PLAN.md licence gate is open.

src/lib/pricing.ts mirrors this math for the onboarding flow, and
scripts/check-pricing-parity.mts (wired into verify) recomputes the committed cases in
fixtures/pricing_cases.json through the TS mirror and fails on any drift. Change the
constants or the math in BOTH places, regenerate the fixture with --cases, or the gate
says no.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

MARGIN_PCT_DEFAULT = 20.0
MARGIN_PCT_MAX = 50.0
PLATFORMS = ("meta", "tiktok")

# What a goal means operationally. Stored verbatim on the quote so the campaign that
# gets built can be audited against what was sold, even after these constants move.
PLAYBOOKS: dict[str, dict[str, Any]] = {
    "aggressive_conversions": {
        "optimization_goal": "CONVERSIONS",
        "billing_event": "IMPRESSIONS",
        "holdout_pct": 0.0,
        "arms": 2,
    },
    "low_cost_testing": {
        "optimization_goal": "CLICK",
        "billing_event": "CPC",
        "holdout_pct": 0.1,
        "arms": 3,
    },
}

BILLING_NOTE = (
    "quote, not an invoice: activation of billing is gated on PLAN.md gate 4 "
    "(tools/serve/check_licence_gate.py)"
)


def quote(spec: dict[str, Any]) -> dict[str, Any]:
    platforms = list(spec.get("platforms") or [])
    spend = int(spec.get("weekly_spend_micros") or 0)
    goal = str(spec.get("goal") or "")
    margin_pct = float(spec.get("margin_pct", MARGIN_PCT_DEFAULT))
    currency = str(spec.get("currency") or "USD").upper()
    duration_weeks = spec.get("duration_weeks")

    if not platforms:
        raise ValueError("pick at least one platform")
    if len(set(platforms)) != len(platforms):
        raise ValueError("duplicate platform in brief")
    unknown = [p for p in platforms if p not in PLATFORMS]
    if unknown:
        raise ValueError(f"unknown platform(s) {unknown}; have {list(PLATFORMS)}")
    if spend <= 0:
        raise ValueError("weekly_spend_micros must be positive")
    if goal not in PLAYBOOKS:
        raise ValueError(f"unknown goal {goal!r}; have {sorted(PLAYBOOKS)}")
    if not 0.0 <= margin_pct <= MARGIN_PCT_MAX:
        raise ValueError(f"margin_pct must be in [0, {MARGIN_PCT_MAX:g}]")
    if duration_weeks is not None and int(duration_weeks) < 1:
        raise ValueError("duration_weeks must be at least 1 when given")

    # Even split in platform order, remainder one micro at a time - same discipline as
    # ab.plan_split: floats never touch an allocated amount.
    base = spend // len(platforms)
    split = [base] * len(platforms)
    for i in range(spend - base * len(platforms)):
        split[i] += 1

    # Margin in integer micros, rounded UP so the identity never undercharges by a
    # micro and then fails 0016's price check on insert.
    margin_micros = -(-spend * int(margin_pct * 100) // 10_000)

    return {
        "currency": currency,
        "goal": goal,
        "playbook": PLAYBOOKS[goal],
        "platforms": [
            {"platform": p, "weekly_spend_micros": split[i]} for i, p in enumerate(platforms)
        ],
        "weekly_spend_micros": spend,
        "margin_pct": margin_pct,
        "margin_micros": margin_micros,
        "weekly_price_micros": spend + margin_micros,
        "duration_weeks": None if duration_weeks is None else int(duration_weeks),
        "renews": "weekly_until_paused",
        "billing_note": BILLING_NOTE,
    }


def funded_caps(q: dict[str, Any]) -> list[dict[str, Any]]:
    """Spend-guard caps derived from a quote's MEDIA component - the prepaid-week rule.

    §0.6: a funded week's media is the ceiling, and the margin is never spendable. Per
    platform: lifetime cap = that platform's weekly media allocation, daily cap =
    ceil(weekly / 7). The rows are shaped for the spend_guards table (0014) and for
    guard.decision_from_fixture's cap fields, so the same numbers gate both the ledger
    and the activation path. Deliberately NOT in the TS mirror or the parity corpus:
    caps belong to the serve box, not the browser.
    """
    platforms = q.get("platforms") or []
    if not platforms:
        raise ValueError("quote has no platform split; refuse to derive caps from nothing")
    caps = []
    for row in platforms:
        weekly = int(row["weekly_spend_micros"])
        if weekly <= 0:
            raise ValueError(f"platform {row.get('platform')!r} has non-positive media; no cap derivable")
        caps.append(
            {
                "platform": row["platform"],
                "lifetime_cap_micros": weekly,
                "daily_cap_micros": -(-weekly // 7),
                "currency": q.get("currency") or "USD",
                "source": "funded_week_media",
            }
        )
    assert sum(c["lifetime_cap_micros"] for c in caps) == int(q["weekly_spend_micros"])
    return caps


def cases() -> list[dict[str, Any]]:
    """Deterministic parity corpus for the TS mirror. Edge-heavy on purpose: odd spends
    that do not split evenly, margin 0, the max margin, and a fractional margin whose
    integer rounding is exactly the kind of thing two implementations disagree on."""
    specs = [
        {"platforms": ["meta"], "weekly_spend_micros": 500_000_000, "goal": "aggressive_conversions"},
        {"platforms": ["meta", "tiktok"], "weekly_spend_micros": 1_000_000_001, "goal": "low_cost_testing"},
        {"platforms": ["tiktok"], "weekly_spend_micros": 333_333_333, "goal": "low_cost_testing", "margin_pct": 0},
        {"platforms": ["meta", "tiktok"], "weekly_spend_micros": 7, "goal": "aggressive_conversions", "margin_pct": 50},
        {"platforms": ["meta", "tiktok"], "weekly_spend_micros": 999_999_999, "goal": "low_cost_testing", "margin_pct": 12.5, "duration_weeks": 4},
    ]
    return [{"spec": s, "quote": quote(s)} for s in specs]


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Bundled weekly campaign pricing.")
    action = p.add_mutually_exclusive_group(required=True)
    action.add_argument("--quote", type=Path, help="JSON brief: platforms, weekly_spend_micros, goal")
    action.add_argument("--caps", type=Path, help="JSON quote: emit prepaid-week spend-guard caps")
    action.add_argument("--cases", action="store_true", help="emit the parity corpus")
    p.add_argument("--out", type=Path, help="write result JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.cases:
            result: Any = cases()
        elif args.caps:
            result = funded_caps(json.loads(args.caps.read_text(encoding="utf8")))
        else:
            result = quote(json.loads(args.quote.read_text(encoding="utf8")))
    except Exception as exc:
        print(f"pricing failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
