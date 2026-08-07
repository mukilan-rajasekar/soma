#!/usr/bin/env python3
"""
stage1_tiktok_dryrun.py - readiness check for the TikTok CTR backtest.

This never runs the GPU path and never claims signal. It checks whether the local checkout
has the ad data, verifies the manifest outcome is `ctr_index` with higher=better, counts
missing arc files, and prints the exact commands a scorer box should run.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path


DEFAULT_COMMANDS = [
    ".venv/bin/python ad_backtest.py --manifest data/ads/ad_manifest_tiktok.csv --score arc "
    "--arc-dir data/ads/arcs --baseline-dir data/ads/baseline --n-perm 20000 "
    "--out validation/ad_backtest_tiktok_arc.csv --json-out validation/ad_backtest_tiktok_arc.json",
    ".venv/bin/python ad_backtest.py --manifest data/ads/ad_manifest_tiktok.csv --score head "
    "--head validation/head_attn.json --preds-dir data/ads/arcs --arc-dir data/ads/arcs "
    "--baseline-dir data/ads/baseline --n-perm 20000 "
    "--out validation/ad_backtest_tiktok_head.csv --json-out validation/ad_backtest_tiktok_head.json",
]


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf8") as fh:
        return list(csv.DictReader(fh))


def _id(row: dict[str, str]) -> str:
    for key in ("ad_id", "id", "creative_id"):
        value = (row.get(key) or "").strip()
        if value:
            return value
    return ""


def verify_ctr_direction(manifest: Path, performance: Path) -> int:
    manifest_rows = _rows(manifest)
    perf_by_id = {_id(row): row for row in _rows(performance) if _id(row)}
    checked = 0
    for row in manifest_rows:
        ad_id = _id(row)
        if not ad_id or ad_id not in perf_by_id:
            continue
        if "outcome" not in row or "ctr_index" not in perf_by_id[ad_id]:
            continue
        try:
            outcome = float(row["outcome"])
            ctr_index = float(perf_by_id[ad_id]["ctr_index"])
        except (TypeError, ValueError):
            continue
        if abs(outcome - ctr_index) > 1e-9:
            raise ValueError(
                f"{ad_id}: manifest outcome {outcome} does not equal ctr_index {ctr_index}; "
                "do not pass --outcome-is-rank or invert the label."
            )
        checked += 1
    return checked


def count_missing_arcs(manifest: Path, arc_dir: Path) -> tuple[int, int]:
    ids = [_id(row) for row in _rows(manifest)]
    ids = [ad_id for ad_id in ids if ad_id]
    missing = sum(1 for ad_id in ids if not (arc_dir / f"arc_{ad_id}.csv").exists())
    return missing, len(ids)


def run(root: Path) -> int:
    manifest = root / "data/ads/ad_manifest_tiktok.csv"
    performance = root / "data/ads/ad_performance.csv"
    if not manifest.exists() or not performance.exists():
        print("GPU/data not in this checkout: missing data/ads/ad_manifest_tiktok.csv or ad_performance.csv")
        return 0

    checked = verify_ctr_direction(manifest, performance)
    missing, total = count_missing_arcs(manifest, root / "data/ads/arcs")
    print(f"ctr_index direction check: {checked} joined rows, higher=better, no inversion")
    print(f"missing arcs: {missing} of {total}")
    print("No signal claimed. On the scorer box, run exactly:")
    for cmd in DEFAULT_COMMANDS:
        print(cmd)
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Dry-run readiness check for Stage 1 TikTok backtest.")
    p.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return run(args.root)
    except ValueError as exc:
        print(f"stage1 dry-run failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
