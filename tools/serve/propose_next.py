#!/usr/bin/env python3
"""
propose_next.py - propose the next edit operation from windows and outcomes fixtures.

This is a proposal layer only. It does not train, does not update weights, and does not
claim the proposal is validated against outcomes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def _ctr(row: dict[str, Any]) -> float | None:
    try:
        impressions = float(row.get("impressions"))
        clicks = float(row.get("clicks"))
    except (TypeError, ValueError):
        return None
    if impressions <= 0:
        return None
    return clicks / impressions


def _worst_served_ad(outcomes: list[dict[str, Any]]) -> str | None:
    scored = []
    for row in outcomes:
        ctr = _ctr(row)
        sid = row.get("served_ad_id") or row.get("servedAdId")
        if ctr is not None and sid:
            scored.append((ctr, str(sid)))
    if not scored:
        return None
    scored.sort()
    return scored[0][1]


def propose(windows: list[dict[str, Any]], outcomes: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    if not windows:
        return []
    outcomes = outcomes or []
    worst_id = _worst_served_ad(outcomes)
    candidates = [
        w for w in windows
        if not worst_id or str(w.get("served_ad_id") or w.get("servedAdId") or "") == worst_id
    ] or windows
    candidates.sort(key=lambda w: float(w.get("depth") or 0), reverse=True)
    w = candidates[0]
    shot_index = w.get("shot_index") or w.get("shotIndex")
    if shot_index:
        op = {"op": "remove_shot", "shot_index": int(shot_index)}
    else:
        op = {"op": "remove_interval", "start_s": w.get("start_s") or w.get("startS"), "end_s": w.get("end_s") or w.get("endS")}
    return [{
        **op,
        "served_ad_id": w.get("served_ad_id") or w.get("servedAdId") or worst_id,
        "lane": w.get("lane"),
        "reason": "overlaps worst predicted weak window; proposal only, no training",
        "window": w,
    }]


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Propose next Serve edit ops from fixtures.")
    p.add_argument("--windows", type=Path, required=True, help="JSON list of readout windows")
    p.add_argument("--outcomes", type=Path, help="optional JSON list/object of outcome rows")
    return p


def _load_rows(path: Path | None, key: str) -> list[dict[str, Any]]:
    if not path:
        return []
    data = json.loads(path.read_text(encoding="utf8"))
    if isinstance(data, dict):
        data = data.get(key, data.get("rows", []))
    return data if isinstance(data, list) else []


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    proposals = propose(_load_rows(args.windows, "windows"), _load_rows(args.outcomes, "outcomes"))
    print(json.dumps({"proposals": proposals}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
