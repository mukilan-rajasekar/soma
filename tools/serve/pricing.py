#!/usr/bin/env python3
"""
pricing.py - one brief in, one all-inclusive weekly price out. The canonical engine.

Founder decision (Aug 2026): the client brings the creative, recommend_spend() quotes a
few weekly media tiers off their goal / reach / networks, and quote() adds a margin
(default 20%) ON THAT MEDIA - the client pays media + margin, renewing weekly until
paused. The margin is a percentage of spend, not a fee on serving cost: doubling the
recommended tier doubles what Soma earns, which is why §0.6 makes the funded week's media
a hard ceiling the margin sits outside of, and why autopilot has no path that raises a
budget. This supersedes the flat-fee stance in BUILD-PLAN §0.5 - the supersession and its
trade-offs are recorded there, not re-argued here.

Two invariants carry this module. First, integer micros everywhere: the price identity
weekly_price = weekly_spend + margin holds exactly, the platform split conserves every
micro deterministically, and migration 0016 re-checks the identity in the schema.
Second, a quote is not an invoice: nothing here bills anyone, and the renewal path
(tools/serve/renewals.py) refuses to execute while the PLAN.md licence gate is open.

src/lib/pricing.ts mirrors this math for the onboarding flow, and
scripts/check-pricing-parity.mts (wired into verify) recomputes the committed cases in
fixtures/pricing_cases.json and fixtures/recommend_cases.json through the TS mirror and
fails on any drift. Change the constants or the math in BOTH places, regenerate with
--cases / --recommend-cases, or the gate says no.
"""

from __future__ import annotations

import argparse
import json
import sys
from fractions import Fraction
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

# Onboarding recommends weekly MEDIA (not price) from intent. Bases are dollars of
# media; quote() then adds the margin. National + one platform + default 20% is the
# psychological pair: conversion push → $1,500/week all-in, testing → $600/week.
# Multipliers are integer basis points so Python and the TS mirror cannot disagree
# on a half-dollar. See BUILD-PLAN-REVENUE.md R2.
REACH = ("local", "national", "broad")
REACH_MULT_BP = {"local": 60, "national": 100, "broad": 160}
BASE_MEDIA_MICROS = {
    "aggressive_conversions": 1_250_000_000,  # $1,250 / week media
    "low_cost_testing": 500_000_000,  # $500 / week media
}
PLATFORM_EXTRA_BP = 25  # +0.25× per network after the first
SHORT_TEST_WEEKS = 2
SHORT_TEST_MULT_BP = 85  # 0.85× when duration_weeks ≤ SHORT_TEST_WEEKS


def margin_micros_for(media_micros: int, margin_pct: float) -> int:
    """The charged margin. One definition, so a disclosure cannot contradict an invoice.

    Rounded UP so the identity never undercharges by a micro and then fails 0016's price
    check on insert.

    CARRIES A KNOWN DEFECT ON PURPOSE. `int(margin_pct * 100)` truncates: 287 of the 5001
    two-decimal margins in [0, 50] lose a basis point, so 2.01% bills 200bp rather than
    201 (AGENTS.md; src/lib/pricing.ts does the same Math.trunc, which is why parity
    passes while both sides are wrong). Anything reconciling a rate against a charge must
    call THIS, not recompute the ideal figure - a disclosure's job is to state what was
    charged, and a "corrected" reconciliation would reject those 287 legitimate quotes.
    Fixing the truncation means both languages plus migration 0016's check, together.
    """
    return -(-int(media_micros) * int(margin_pct * 100) // 10_000)


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

    margin_micros = margin_micros_for(spend, margin_pct)

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


def recommend_spend(spec: dict[str, Any]) -> dict[str, Any]:
    """Recommended weekly MEDIA micros from goal, platforms, reach, optional duration.

    Does not quote and does not invent Google. Call quote() with weekly_spend_micros
    from this result. Rounding is nearest dollar, half-up, in integer arithmetic so
    the TS mirror can match without language round() semantics.
    """
    platforms = list(spec.get("platforms") or [])
    goal = str(spec.get("goal") or "")
    reach = str(spec.get("reach") or "")
    duration_weeks = spec.get("duration_weeks")

    if not platforms:
        raise ValueError("pick at least one platform")
    if len(set(platforms)) != len(platforms):
        raise ValueError("duplicate platform in brief")
    unknown = [p for p in platforms if p not in PLATFORMS]
    if unknown:
        raise ValueError(f"unknown platform(s) {unknown}; have {list(PLATFORMS)}")
    if goal not in PLAYBOOKS:
        raise ValueError(f"unknown goal {goal!r}; have {sorted(PLAYBOOKS)}")
    if reach not in REACH_MULT_BP:
        raise ValueError(f"unknown reach {reach!r}; have {list(REACH)}")
    if duration_weeks is not None and int(duration_weeks) < 1:
        raise ValueError("duration_weeks must be at least 1 when given")

    base = BASE_MEDIA_MICROS[goal]
    platform_bp = 100 + PLATFORM_EXTRA_BP * (len(platforms) - 1)
    reach_bp = REACH_MULT_BP[reach]
    duration_bp = (
        SHORT_TEST_MULT_BP
        if duration_weeks is not None and int(duration_weeks) <= SHORT_TEST_WEEKS
        else 100
    )

    # base is already micros. Convert to dollars, apply bp multipliers, round half-up
    # to a whole dollar, convert back. 100³ = 1_000_000.
    base_dollars = base // 1_000_000
    numerator = base_dollars * platform_bp * reach_bp * duration_bp
    dollars = (numerator + 500_000) // 1_000_000
    if dollars < 1:
        raise ValueError("recommended weekly media rounded to zero; refuse to quote")
    spend = dollars * 1_000_000

    return {
        "goal": goal,
        "platforms": list(platforms),
        "reach": reach,
        "duration_weeks": None if duration_weeks is None else int(duration_weeks),
        "weekly_spend_micros": spend,
        "base_media_micros": base,
        "platform_mult_bp": platform_bp,
        "reach_mult_bp": reach_bp,
        "duration_mult_bp": duration_bp,
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


def _ceil_micros(amount: int, factor: Fraction) -> int:
    """ceil(amount * factor) in exact integer arithmetic - no float, no bp quantisation."""
    return -((-amount * factor.numerator) // factor.denominator)


def holdout_rebate(
    q: dict[str, Any],
    *,
    holdout_fraction: float,
    gap_g: float = 0.0,
    calibration_ref: str | None = None,
) -> dict[str, Any]:
    """§4.6's rebate, in the denomination the bundled week actually uses.

        Rebate = h × F + h × S × g,  capped at F

    F is the week's margin and S the funded media, so term one is literally "we waive our
    margin on the holdout fraction" and term two is the client's share of a demonstrated
    performance gap. The cap means the worst case is a week worked for nothing; a rebate
    can zero the fee and never invert it.

    g DEFAULTS TO ZERO AND THAT IS A CLAIM. §4.6: Soma cannot demonstrate that
    score-selected arms outperform random ones, so today the holdout has no demonstrated
    cost to the client. §4.6 also names the residual conflict - Soma has a financial
    reason to under-report g - so a non-zero g must cite the dated calibration artifact
    it came from. That requirement is enforced here and again by 0018's check constraint;
    a number someone typed is not a measurement.

    Rounding is UP on both terms, toward the client, because every other rounding
    decision in this module rounds toward Soma and a rebate must not inherit that.

    The arithmetic is exact rational, not basis points. Quantising h to bp first meant
    round(h * 10_000), and Python's round() is half-to-even: h = 0.00005 became 0 bp, so
    a positive holdout earned a zero waiver - rounding DOWN, in Soma's favour, in the one
    function whose docstring promises the opposite. Fraction(str(x)) takes the decimal
    the caller actually wrote, so ceil() is applied once to an exact product and there is
    no intermediate to lose. It also matches Postgres numeric, which is what 0018's
    trigger re-derives these terms in.
    """
    margin = int(q.get("margin_micros") or 0)
    media = int(q.get("weekly_spend_micros") or 0)

    if not 0.0 <= holdout_fraction < 1.0:
        raise ValueError("holdout_fraction must be in [0, 1)")
    if gap_g < 0.0:
        # A negative gap means the random arm won. That is a finding to publish, not a
        # charge to levy: §4.6's term can only ever reduce Soma's fee.
        raise ValueError("gap_g must be >= 0; a random arm that wins is a result, not a fee")
    if gap_g > 0.0 and not (calibration_ref or "").strip():
        raise ValueError("a non-zero gap_g requires calibration_ref: g must trace to a dated artifact")
    if margin and not media:
        raise ValueError("margin on zero media has no rebate basis")

    h = Fraction(str(holdout_fraction))
    g = Fraction(str(gap_g))
    waiver = _ceil_micros(margin, h)
    gap_term = _ceil_micros(media, h * g)

    uncapped = waiver + gap_term
    rebate = min(uncapped, margin)

    return {
        "holdout_fraction_h": holdout_fraction,
        "holdout_gap_g": gap_g,
        "calibration_ref": calibration_ref,
        "margin_waiver_micros": waiver,
        "gap_term_micros": gap_term,
        "rebate_micros": rebate,
        "capped": rebate < uncapped,
        "currency": q.get("currency") or "USD",
        "rule": "STRATEGY-FULL-SERVICE §4.6: h*F + h*S*g, capped at F",
    }


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


def recommend_cases() -> list[dict[str, Any]]:
    """Parity corpus for recommend_spend + the quote it produces. Includes the
    psychological pair (national, one platform) and a half-dollar round-up
    (two platforms × conversion base = $1,562.50 → $1,563)."""
    specs = [
        {"platforms": ["meta"], "goal": "aggressive_conversions", "reach": "national"},
        {"platforms": ["meta"], "goal": "low_cost_testing", "reach": "national"},
        {"platforms": ["meta", "tiktok"], "goal": "aggressive_conversions", "reach": "national"},
        {"platforms": ["tiktok"], "goal": "low_cost_testing", "reach": "local"},
        {"platforms": ["meta", "tiktok"], "goal": "aggressive_conversions", "reach": "broad", "duration_weeks": 2},
        {"platforms": ["meta"], "goal": "aggressive_conversions", "reach": "national", "duration_weeks": 8},
        {"platforms": ["meta", "tiktok"], "goal": "low_cost_testing", "reach": "broad", "duration_weeks": 1},
    ]
    out = []
    for s in specs:
        rec = recommend_spend(s)
        q = quote({**s, "weekly_spend_micros": rec["weekly_spend_micros"]})
        out.append({"spec": s, "recommend": rec, "quote": q})
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Bundled weekly campaign pricing.")
    action = p.add_mutually_exclusive_group(required=True)
    action.add_argument("--quote", type=Path, help="JSON brief: platforms, weekly_spend_micros, goal")
    action.add_argument(
        "--recommend", type=Path, help="JSON brief: platforms, goal, reach, optional duration_weeks"
    )
    action.add_argument("--caps", type=Path, help="JSON quote: emit prepaid-week spend-guard caps")
    action.add_argument("--cases", action="store_true", help="emit the quote parity corpus")
    action.add_argument(
        "--recommend-cases", action="store_true", help="emit the recommend_spend parity corpus"
    )
    p.add_argument("--out", type=Path, help="write result JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.cases:
            result: Any = cases()
        elif args.recommend_cases:
            result = recommend_cases()
        elif args.caps:
            result = funded_caps(json.loads(args.caps.read_text(encoding="utf8")))
        elif args.recommend:
            result = recommend_spend(json.loads(args.recommend.read_text(encoding="utf8")))
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
