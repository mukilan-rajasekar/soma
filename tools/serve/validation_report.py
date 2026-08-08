#!/usr/bin/env python3
"""
validation_report.py - the predicted-vs-actual ledger, per ad, per brand, standing.

Every pre-testing vendor publishes a one-time accuracy claim; none of them scores
yesterday's predictions against today's outcomes where the client can watch
(COMPETITOR-GAPS §1). Soma can, because predictions are frozen with provenance
(check_frozen.py) and outcomes land in their own table - this module is the join.

Honesty contract: below MIN_PAIRS the verdict is "insufficient_n", never a rho.
Per-brand blocks are the client-facing truth; the pooled block exists for the public
validation page, is labelled aggregate, and pools NOTHING into training (Policy 10.7
stays untouched - this is reporting, not learning). The permutation p is one-sided on
|rho| with a fixed seed, so the same fixture always prints the same number.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.serve.calibration import _latest_outcomes, _score, spearman  # noqa: E402

MIN_PAIRS = 8
PERMUTATIONS = 500
SEED = 0


def _pairs(served_ads: list[dict[str, Any]], outcomes: dict[str, dict[str, Any]]):
    rows = []
    for ad in served_ads:
        sid = str(ad.get("id") or "")
        outcome = outcomes.get(sid)
        if not sid or not outcome:
            continue
        score = _score(ad.get("prediction") or {})
        try:
            impressions = float(outcome.get("impressions"))
            clicks = float(outcome.get("clicks"))
        except (TypeError, ValueError):
            continue
        if score is None or impressions <= 0:
            continue
        rows.append(
            {
                "served_ad_id": sid,
                "brand_id": str(ad.get("brand_id") or ""),
                "predicted_score": round(score, 6),
                "realized_ctr": round(clicks / impressions, 6),
                "impressions": int(impressions),
            }
        )
    return rows


def _perm_p(xs: list[float], ys: list[float], observed: float) -> float:
    rng = random.Random(SEED)
    shuffled = list(ys)
    hits = 0
    for _ in range(PERMUTATIONS):
        rng.shuffle(shuffled)
        r = spearman(xs, shuffled)
        if r is not None and abs(r) >= abs(observed):
            hits += 1
    return round((hits + 1) / (PERMUTATIONS + 1), 6)


def _block(rows: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(rows)
    if n < MIN_PAIRS:
        return {"n": n, "min_pairs": MIN_PAIRS, "verdict": "insufficient_n"}
    xs = [r["predicted_score"] for r in rows]
    ys = [r["realized_ctr"] for r in rows]
    rho = spearman(xs, ys)
    if rho is None:
        return {"n": n, "min_pairs": MIN_PAIRS, "verdict": "insufficient_n"}
    return {
        "n": n,
        "min_pairs": MIN_PAIRS,
        "spearman": round(rho, 6),
        "permutation_p": _perm_p(xs, ys, rho),
        "permutations": PERMUTATIONS,
        "verdict": "tracking",
        "note": "descriptive, not pre-registered; a rho is a rank agreement, not a promise",
    }


def build(data: dict[str, Any]) -> dict[str, Any]:
    served_ads = data.get("served_ads") or []
    outcomes = _latest_outcomes(data.get("outcomes") or [])
    rows = _pairs(served_ads, outcomes)

    by_brand: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_brand.setdefault(row["brand_id"] or "(unattributed)", []).append(row)

    return {
        "kind": "validation",
        "pairs": rows,
        "brands": {brand: _block(brows) for brand, brows in sorted(by_brand.items())},
        "pooled": {
            **_block(rows),
            "scope": "aggregate view across brands; reporting only, never training (Policy 10.7)",
        },
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Predicted-vs-actual validation ledger.")
    p.add_argument("fixture", type=Path, help="JSON with served_ads (frozen predictions) and outcomes")
    p.add_argument("--out", type=Path, help="write report JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        report = build(json.loads(args.fixture.read_text(encoding="utf8")))
    except Exception as exc:
        print(f"validation_report failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
