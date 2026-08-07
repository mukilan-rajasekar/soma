#!/usr/bin/env python3
"""
calibration.py - compare frozen Serve predictions with realized CTR fixtures.

This does not train and does not touch the database. It answers one narrow question for a
fixture: do higher frozen prediction scores rank with higher realized click-through rates
better than a trivial baseline?
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def _score(prediction: dict[str, Any]) -> float | None:
    candidates = [
        prediction.get("score"),
        prediction.get("prediction_score"),
        prediction.get("preflight"),
        (prediction.get("scores") or {}).get("preflight") if isinstance(prediction.get("scores"), dict) else None,
    ]
    for value in candidates:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(parsed):
            return parsed
    return None


def _ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i + 1
        while j < len(order) and values[order[j]] == values[order[i]]:
            j += 1
        rank = (i + 1 + j) / 2.0
        for k in range(i, j):
            ranks[order[k]] = rank
        i = j
    return ranks


def spearman(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) != len(ys) or len(xs) < 2:
        return None
    rx = _ranks(xs)
    ry = _ranks(ys)
    mx = sum(rx) / len(rx)
    my = sum(ry) / len(ry)
    num = sum((x - mx) * (y - my) for x, y in zip(rx, ry))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in rx))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ry))
    if den_x == 0 or den_y == 0:
        return None
    return num / (den_x * den_y)


def _latest_outcomes(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        sid = str(row.get("served_ad_id") or row.get("servedAdId") or "")
        if not sid:
            continue
        if sid not in latest or str(row.get("pulled_at", "")) >= str(latest[sid].get("pulled_at", "")):
            latest[sid] = row
    return latest


def summarize_fixture(data: dict[str, Any]) -> dict[str, Any]:
    served_ads = data.get("served_ads") or data.get("servedAds") or []
    outcomes = _latest_outcomes(data.get("outcomes") or [])
    pairs = []
    for ad in served_ads:
        sid = str(ad.get("id") or "")
        outcome = outcomes.get(sid)
        if not sid or not outcome:
            continue
        try:
            impressions = float(outcome.get("impressions"))
            clicks = float(outcome.get("clicks"))
        except (TypeError, ValueError):
            continue
        if impressions <= 0:
            continue
        score = _score(ad.get("prediction") or {})
        if score is None:
            continue
        pairs.append({"served_ad_id": sid, "prediction_score": score, "ctr": clicks / impressions})

    model_rho = spearman([p["prediction_score"] for p in pairs], [p["ctr"] for p in pairs])
    # Trivial baseline: fixture order as the ranker. It is deliberately weak but non-constant.
    baseline_rho = spearman(list(range(len(pairs))), [p["ctr"] for p in pairs])
    model = 0.0 if model_rho is None else model_rho
    baseline = 0.0 if baseline_rho is None else baseline_rho
    return {
        "n": len(pairs),
        "metric": "ctr",
        "model_spearman": None if model_rho is None else round(model_rho, 6),
        "baseline": "fixture_order",
        "baseline_spearman": None if baseline_rho is None else round(baseline_rho, 6),
        "signal": bool(len(pairs) >= 3 and model > 0 and model > baseline),
        "pairs": pairs,
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Summarize Serve calibration fixture.")
    p.add_argument("fixture", type=Path, help="JSON with served_ads and outcomes")
    p.add_argument("--out", type=Path, help="write summary JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    summary = summarize_fixture(json.loads(args.fixture.read_text(encoding="utf8")))
    text = json.dumps(summary, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
