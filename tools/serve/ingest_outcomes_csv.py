#!/usr/bin/env python3
"""
ingest_outcomes_csv.py - validate partner outcome CSVs for Serve v0.

Stage 4 v0 is intentionally human-operated: a partner exports a CSV, this script turns
it into normalized JSON rows, and tests exercise the path without a live database.

Examples:

    .venv/bin/python tools/serve/ingest_outcomes_csv.py outcomes.csv --dry-run
    .venv/bin/python tools/serve/ingest_outcomes_csv.py outcomes.csv --fixture tools/serve/fixtures/outcomes.json

The rows include the served-ad lookup fields (brand/platform/account/ad id) because a
database writer would resolve those to served_ads.id before inserting into outcomes.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REQUIRED_COLUMNS = {
    "brand_id",
    "platform",
    "external_ad_account_id",
    "window_start",
    "window_end",
    "attribution",
    "impressions",
    "spend_micros",
    "currency",
    "clicks",
    "source",
}

INTEGER_COLUMNS = {
    "impressions",
    "reach",
    "spend_micros",
    "clicks",
    "video_p25",
    "video_p50",
    "video_p75",
    "video_p100",
    "thruplays",
    "conversions",
    "conversion_value_micros",
    "revision",
}

NUMERIC_COLUMNS = {"frequency"}

OPTIONAL_COLUMNS = {
    "external_ad_id",
    "reach",
    "frequency",
    "video_p25",
    "video_p50",
    "video_p75",
    "video_p100",
    "thruplays",
    "conversions",
    "conversion_value_micros",
    "pulled_at",
}

API_SOURCES = {"meta_insights_api", "tiktok_api"}


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _required(row: dict[str, str], name: str, line: int) -> str:
    value = _clean(row.get(name))
    if not value:
        raise ValueError(f"line {line}: {name} is required")
    return value


def _int_or_none(value: str, name: str, line: int, *, required: bool) -> int | None:
    value = _clean(value)
    if not value:
        if required:
            raise ValueError(f"line {line}: {name} is required")
        return None
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValueError(f"line {line}: {name} must be an integer") from exc
    if parsed < 0:
        raise ValueError(f"line {line}: {name} must be non-negative")
    return parsed


def _float_or_none(value: str, name: str, line: int) -> float | None:
    value = _clean(value)
    if not value:
        return None
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ValueError(f"line {line}: {name} must be numeric") from exc
    if parsed < 0:
        raise ValueError(f"line {line}: {name} must be non-negative")
    return parsed


def _date(value: str, name: str, line: int) -> str:
    value = _required({name: value}, name, line)
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"line {line}: {name} must be YYYY-MM-DD") from exc
    return value


def _pulled_at(row: dict[str, str]) -> str:
    value = _clean(row.get("pulled_at"))
    if value:
        return value
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_row(row: dict[str, str], *, line: int) -> dict[str, object]:
    source = _required(row, "source", line)
    attribution = _clean(row.get("attribution"))
    if source in API_SOURCES and not attribution:
        raise ValueError(f"line {line}: attribution is required for {source}")

    normalized: dict[str, object] = {
        "brand_id": _required(row, "brand_id", line),
        "platform": _required(row, "platform", line),
        "external_ad_account_id": _required(row, "external_ad_account_id", line),
        "external_ad_id": _clean(row.get("external_ad_id")) or None,
        "window_start": _date(row.get("window_start", ""), "window_start", line),
        "window_end": _date(row.get("window_end", ""), "window_end", line),
        "attribution": attribution or None,
        "currency": _required(row, "currency", line).upper(),
        "source": source,
        "pulled_at": _pulled_at(row),
        "raw": dict(row),
    }

    for name in INTEGER_COLUMNS:
        required = name in {"impressions", "spend_micros", "clicks"}
        value = _int_or_none(row.get(name, ""), name, line, required=required)
        if value is not None or name == "revision":
            normalized[name] = value if value is not None else 1

    for name in NUMERIC_COLUMNS:
        value = _float_or_none(row.get(name, ""), name, line)
        if value is not None:
            normalized[name] = value

    return normalized


def parse_csv(path: Path) -> list[dict[str, object]]:
    with path.open(newline="", encoding="utf8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            raise ValueError("CSV has no header")
        missing = sorted(REQUIRED_COLUMNS - set(reader.fieldnames))
        if missing:
            raise ValueError(f"CSV is missing required column(s): {', '.join(missing)}")

        rows = [normalize_row(row, line=i) for i, row in enumerate(reader, start=2)]
    return rows


@dataclass
class InMemoryOutcomeStore:
    """Append-only test double for the outcomes table."""

    history: list[dict[str, object]] = field(default_factory=list)

    def write(self, rows: Iterable[dict[str, object]]) -> None:
        for row in rows:
            self.history.append(dict(row))

    def current(self) -> list[dict[str, object]]:
        latest: dict[tuple[object, ...], dict[str, object]] = {}
        for row in self.history:
            key = (
                row.get("brand_id"),
                row.get("platform"),
                row.get("external_ad_account_id"),
                row.get("external_ad_id"),
                row.get("window_start"),
                row.get("window_end"),
                row.get("attribution"),
                row.get("source"),
            )
            if key not in latest or str(row.get("pulled_at")) >= str(latest[key].get("pulled_at")):
                latest[key] = row
        return list(latest.values())


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Validate Serve outcome CSVs and emit JSON rows.")
    p.add_argument("csv_path", type=Path, help="CSV exported by a partner or ad platform")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="validate and print normalized JSON rows to stdout without touching a database",
    )
    p.add_argument("--fixture", type=Path, help="write normalized rows as a JSON array fixture")
    p.add_argument(
        "--memory",
        action="store_true",
        help="write rows to the in-memory store and print the stored history as JSON",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        rows = parse_csv(args.csv_path)
    except ValueError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1

    if args.fixture:
        args.fixture.parent.mkdir(parents=True, exist_ok=True)
        args.fixture.write_text(json.dumps(rows, indent=2, sort_keys=True) + "\n", encoding="utf8")

    if args.memory:
        store = InMemoryOutcomeStore()
        store.write(rows)
        print(json.dumps(store.history, sort_keys=True))
    else:
        for row in rows:
            print(json.dumps(row, sort_keys=True))

    return 0


if __name__ == "__main__":
    sys.exit(main())
