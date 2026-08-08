#!/usr/bin/env python3
"""
fatigue.py - creative decay flags from an outcomes time series.

Every competitor's fatigue feature quietly swaps creatives; this one only ever
RECOMMENDS a refresh, because a swap is a serve action and serve actions live behind
autopilot's stop-not-start invariant and the operator's approval. The test is deliberately
dumb and floor-guarded: recent-window CTR against the ad's own earlier baseline, with
minimum days and impressions before any claim - below the floors the answer is
"insufficient_history", not a guess.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

MIN_DAYS = 7
BASELINE_DAYS = 4
RECENT_DAYS = 3
MIN_IMPRESSIONS_PER_WINDOW = 1000
DECAY_THRESHOLD = 0.7  # recent CTR below 70% of baseline CTR = fatigued


def _ctr(rows: list[dict[str, Any]]) -> tuple[float | None, int]:
    imps = sum(int(r.get("impressions") or 0) for r in rows)
    clicks = sum(int(r.get("clicks") or 0) for r in rows)
    return (clicks / imps if imps > 0 else None), imps


def flags(series: list[dict[str, Any]]) -> dict[str, Any]:
    by_ad: dict[str, list[dict[str, Any]]] = {}
    for row in series:
        sid = str(row.get("served_ad_id") or "")
        if not sid or not row.get("date"):
            continue
        by_ad.setdefault(sid, []).append(row)

    fatigued, healthy, insufficient = [], [], []
    for sid, rows in sorted(by_ad.items()):
        rows.sort(key=lambda r: str(r["date"]))
        if len(rows) < MIN_DAYS:
            insufficient.append({"served_ad_id": sid, "days": len(rows), "min_days": MIN_DAYS})
            continue
        baseline_ctr, baseline_imps = _ctr(rows[:BASELINE_DAYS])
        recent_ctr, recent_imps = _ctr(rows[-RECENT_DAYS:])
        if (
            baseline_ctr is None
            or recent_ctr is None
            or baseline_imps < MIN_IMPRESSIONS_PER_WINDOW
            or recent_imps < MIN_IMPRESSIONS_PER_WINDOW
        ):
            insufficient.append(
                {"served_ad_id": sid, "days": len(rows), "reason": "impressions below window floor"}
            )
            continue
        if baseline_ctr <= 0:
            insufficient.append({"served_ad_id": sid, "days": len(rows), "reason": "zero baseline ctr"})
            continue
        decay = recent_ctr / baseline_ctr
        entry = {
            "served_ad_id": sid,
            "baseline_ctr": round(baseline_ctr, 6),
            "recent_ctr": round(recent_ctr, 6),
            "decay": round(decay, 4),
        }
        if decay < DECAY_THRESHOLD:
            fatigued.append(
                {
                    **entry,
                    "recommendation": "refresh_creative",
                    "note": "recommendation only; any pause or swap goes through the approval feed",
                }
            )
        else:
            healthy.append(entry)

    return {
        "kind": "fatigue",
        "decay_threshold": DECAY_THRESHOLD,
        "floors": {"min_days": MIN_DAYS, "min_impressions_per_window": MIN_IMPRESSIONS_PER_WINDOW},
        "fatigued": fatigued,
        "healthy": healthy,
        "insufficient_history": insufficient,
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Flag creative fatigue from a daily outcomes series.")
    p.add_argument("series", type=Path, help="JSON list: served_ad_id, date, impressions, clicks")
    p.add_argument("--out", type=Path, help="write flags JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = flags(json.loads(args.series.read_text(encoding="utf8")))
    except Exception as exc:
        print(f"fatigue failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
