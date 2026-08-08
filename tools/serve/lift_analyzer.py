#!/usr/bin/env python3
"""
lift_analyzer.py - conversion-lift results with confidence intervals, nulls included.

Nobody sells independent incrementality at SMB prices (COMPETITOR-GAPS §2.4); Meta's
Conversion Lift is free above ~100 conversions/week but the platform grades itself.
This analyzer is Soma's half of the fix: the platform runs the randomization, Soma does
the arithmetic in the open. A design that wasn't written down before the test ran is
carried as unregistered: true rather than laundered, floors gate any verdict, and a CI
that spans zero prints "no_detectable_lift" - a null is a result, not a failure to hide.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

MIN_CONVERSIONS_TOTAL = 50
Z95 = 1.959964


def _arm(results: dict[str, Any], key: str) -> tuple[int, int]:
    arm = results.get(key) or {}
    conversions = int(arm.get("conversions") or 0)
    exposed = int(arm.get("exposed") or 0)
    if exposed <= 0:
        raise ValueError(f"{key} arm needs exposed > 0")
    if conversions < 0 or conversions > exposed:
        raise ValueError(f"{key} arm: conversions must be within [0, exposed]")
    return conversions, exposed


def analyze(design: dict[str, Any], results: dict[str, Any]) -> dict[str, Any]:
    registered = bool(design.get("pre_registered"))
    missing = [k for k in ("randomization_unit", "assignment", "power_note") if not design.get(k)]
    if str(design.get("assignment") or "") not in ("randomized", ""):
        raise ValueError("assignment must be 'randomized'; before/after comparisons are not lift")

    ct, et = _arm(results, "test")
    cc, ec = _arm(results, "control")

    if ct + cc < MIN_CONVERSIONS_TOTAL:
        return {
            "kind": "lift",
            "verdict": "insufficient_n",
            "conversions_total": ct + cc,
            "min_conversions_total": MIN_CONVERSIONS_TOTAL,
            "unregistered": not registered,
        }

    p_t = ct / et
    p_c = cc / ec
    diff = p_t - p_c
    se = math.sqrt(p_t * (1 - p_t) / et + p_c * (1 - p_c) / ec)
    lo, hi = diff - Z95 * se, diff + Z95 * se
    relative = (diff / p_c) if p_c > 0 else None

    verdict = "lift" if lo > 0 else ("negative_lift" if hi < 0 else "no_detectable_lift")
    out = {
        "kind": "lift",
        "design": {
            "randomization_unit": design.get("randomization_unit"),
            "assignment": design.get("assignment") or "randomized",
            "power_note": design.get("power_note"),
            "pre_registered": registered,
            "missing_fields": missing,
        },
        "unregistered": not registered,
        "test": {"conversions": ct, "exposed": et, "rate": round(p_t, 6)},
        "control": {"conversions": cc, "exposed": ec, "rate": round(p_c, 6)},
        "absolute_lift": round(diff, 6),
        "relative_lift": None if relative is None else round(relative, 4),
        "ci95": [round(lo, 6), round(hi, 6)],
        "verdict": verdict,
    }
    if not registered:
        out["note"] = (
            "design was not pre-registered; report this result as exploratory and register "
            "the next one before it runs"
        )
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Analyze a conversion-lift study, nulls included.")
    p.add_argument("fixture", type=Path, help="JSON with design{...} and results{test, control}")
    p.add_argument("--out", type=Path, help="write analysis JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        data = json.loads(args.fixture.read_text(encoding="utf8"))
        result = analyze(data.get("design") or {}, data.get("results") or {})
    except Exception as exc:
        print(f"lift_analyzer failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
