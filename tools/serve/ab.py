#!/usr/bin/env python3
"""
ab.py - plan an A/B budget split, and evaluate one from an outcomes fixture.

Planning and evaluation are the two halves of "test" in "serve and test", and both are
pure functions over fixtures: no database, no platform calls. Creating the per-arm
platform objects is launch.py's job; delivering them is the platform's; scoring them is
the outcomes table's. What this module refuses to do is call a winner it cannot defend:
below the impression and click floors the decision is "insufficient_n", and without a
p-value under alpha against the control the decision is "no_winner". A dashboard that
wants to imply more than that has to say it in its own voice, not cite this artifact.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

# Floors for the normal approximation behind the two-proportion test, not significance
# theater: below these the z statistic is noise shaped like a number.
MIN_IMPRESSIONS_PER_ARM = 1000
MIN_CLICKS_TOTAL = 10
ALPHA = 0.05


def plan_split(spec: dict[str, Any]) -> dict[str, Any]:
    arms = spec.get("arms") or []
    total = int(spec.get("daily_budget_micros") or 0)
    holdout_pct = float(spec.get("holdout_pct") or 0.0)
    currency = str(spec.get("currency") or "USD").upper()

    if len(arms) < 2:
        raise ValueError("an experiment with one arm is a launch, not a test: give at least 2 arms")
    keys = [str(a.get("arm_key") or "") for a in arms]
    if any(not k for k in keys):
        raise ValueError("every arm needs an arm_key")
    if len(set(keys)) != len(keys):
        raise ValueError("duplicate arm_key in spec")
    if sum(1 for a in arms if a.get("is_control")) > 1:
        raise ValueError("at most one arm may be the control")
    if not 0.0 <= holdout_pct < 1.0:
        raise ValueError("holdout_pct must be in [0, 1)")
    if total <= 0:
        raise ValueError("daily_budget_micros must be positive")
    weights = [float(a.get("weight", 1.0)) for a in arms]
    if any(w <= 0 for w in weights):
        raise ValueError("arm weights must be positive")

    pool = int(total * (1.0 - holdout_pct))
    weight_sum = sum(weights)
    raw = [pool * w / weight_sum for w in weights]
    micros = [int(x) for x in raw]
    # Deterministic remainder: one micro at a time in spec order. Floats never touch
    # the allocated amounts, so allocated + holdout == total is exact and testable.
    remainder = pool - sum(micros)
    for i in range(remainder):
        micros[i % len(micros)] += 1

    planned = [
        {
            "arm_key": keys[i],
            "is_control": bool(arms[i].get("is_control")),
            "budget_share": round(weights[i] / weight_sum, 6),
            "daily_budget_micros": micros[i],
        }
        for i in range(len(arms))
    ]
    return {
        "currency": currency,
        "total_daily_budget_micros": total,
        "holdout_micros": total - sum(micros),
        "allocated_micros": sum(micros),
        "arms": planned,
    }


def _two_proportion(clicks_a: int, imps_a: int, clicks_b: int, imps_b: int) -> dict[str, Any] | None:
    if imps_a <= 0 or imps_b <= 0:
        return None
    p_a = clicks_a / imps_a
    p_b = clicks_b / imps_b
    pooled = (clicks_a + clicks_b) / (imps_a + imps_b)
    if pooled <= 0.0 or pooled >= 1.0:
        return None
    se = math.sqrt(pooled * (1.0 - pooled) * (1.0 / imps_a + 1.0 / imps_b))
    if se == 0:
        return None
    z = (p_a - p_b) / se
    p_value = math.erfc(abs(z) / math.sqrt(2.0))
    return {"delta": round(p_a - p_b, 6), "z": round(z, 4), "p_value": round(p_value, 6)}


def evaluate(fixture: dict[str, Any]) -> dict[str, Any]:
    rows = fixture.get("arms") or []
    if len(rows) < 2:
        raise ValueError("evaluate needs at least 2 arms")

    arms = []
    for row in rows:
        impressions = int(row.get("impressions") or 0)
        clicks = int(row.get("clicks") or 0)
        if clicks < 0 or impressions < 0 or clicks > impressions:
            raise ValueError(f"arm {row.get('arm_key')}: clicks must be within [0, impressions]")
        arms.append(
            {
                "arm_key": str(row.get("arm_key") or ""),
                "is_control": bool(row.get("is_control")),
                "impressions": impressions,
                "clicks": clicks,
                "ctr": round(clicks / impressions, 6) if impressions > 0 else None,
            }
        )

    controls = [a for a in arms if a["is_control"]]
    control = controls[0] if controls else arms[0]
    control_note = "declared" if controls else "first arm assumed control; declare is_control"

    for arm in arms:
        arm["vs_control"] = (
            None
            if arm is control
            else _two_proportion(arm["clicks"], arm["impressions"], control["clicks"], control["impressions"])
        )

    floors_met = (
        all(a["impressions"] >= MIN_IMPRESSIONS_PER_ARM for a in arms)
        and sum(a["clicks"] for a in arms) >= MIN_CLICKS_TOTAL
    )
    # Picking the best of k variants and testing only that comparison at raw alpha is
    # the classic multiple-comparisons inflation (Greptile P1: a deterministic
    # equal-rate four-arm fixture crowned a winner at raw p=0.036). Bonferroni over the
    # k non-control arms is conservative and simple, which is the right trade for a
    # tool whose whole personality is refusing to overclaim.
    comparisons = max(1, len(arms) - 1)
    adjusted_alpha = ALPHA / comparisons
    decision = "insufficient_n"
    winner = None
    if floors_met:
        best = max(arms, key=lambda a: (a["ctr"] or 0.0))
        test = best.get("vs_control")
        if best is not control and test and test["p_value"] < adjusted_alpha and test["delta"] > 0:
            decision = "winner"
            winner = best["arm_key"]
        else:
            decision = "no_winner"

    return {
        "metric": "ctr",
        "alpha": ALPHA,
        "comparisons": comparisons,
        "adjusted_alpha": adjusted_alpha,
        "floors": {
            "min_impressions_per_arm": MIN_IMPRESSIONS_PER_ARM,
            "min_clicks_total": MIN_CLICKS_TOTAL,
            "met": floors_met,
        },
        "control": control["arm_key"],
        "control_note": control_note,
        "arms": arms,
        "decision": decision,
        "winner": winner,
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Plan or evaluate a Serve A/B split.")
    action = p.add_mutually_exclusive_group(required=True)
    action.add_argument("--plan", type=Path, help="JSON spec: daily_budget_micros, holdout_pct, arms")
    action.add_argument("--evaluate", type=Path, help="JSON fixture: arms with impressions and clicks")
    p.add_argument("--out", type=Path, help="write result JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.plan:
            result = plan_split(json.loads(args.plan.read_text(encoding="utf8")))
        else:
            result = evaluate(json.loads(args.evaluate.read_text(encoding="utf8")))
    except Exception as exc:
        print(f"ab failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
