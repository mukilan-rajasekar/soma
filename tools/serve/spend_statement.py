#!/usr/bin/env python3
"""
spend_statement.py - "spend billed = spend delivered", stated per platform, per week.

Under the prepaid week the client funds media they never see delivered in a dashboard,
which makes this statement the first thing a CFO asks for - and COMPETITOR-GAPS §2.4
found no bundled platform at any price that publishes one. The statement compares the
quote's funded media allocation (pricing.funded_caps) against delivered spend rows, and
it grades its own evidence: a row sourced from a platform API pull says so, a row from
an operator fixture is labelled operator-attested, and the statement never uses the
word "verified" for either - third-party attestation is a later, named step.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.serve.pricing import funded_caps  # noqa: E402

DELIVERY_SOURCES = ("platform_api", "operator_fixture")


def statement(quote: dict[str, Any], delivered: list[dict[str, Any]], *, period: str) -> dict[str, Any]:
    if not period:
        raise ValueError("period label is required; a statement without a period is not evidence")
    caps = {c["platform"]: c for c in funded_caps(quote)}
    currency = str(quote.get("currency") or "USD").upper()

    rows_by_platform: dict[str, dict[str, Any]] = {}
    for row in delivered:
        platform = str(row.get("platform") or "")
        if platform not in caps:
            raise ValueError(f"delivered row names {platform!r}, which the funded quote does not allocate")
        row_currency = str(row.get("currency") or "").upper()
        if row_currency != currency:
            raise ValueError(
                f"currency mismatch: quote is {currency}, delivered row for {platform} is "
                f"{row_currency or 'unset'}; refusing to compare"
            )
        source = str(row.get("source") or "")
        if source not in DELIVERY_SOURCES:
            raise ValueError(f"delivered row for {platform} needs source in {DELIVERY_SOURCES}")
        agg = rows_by_platform.setdefault(
            platform, {"delivered_spend_micros": 0, "sources": set()}
        )
        agg["delivered_spend_micros"] += int(row.get("spend_micros") or 0)
        agg["sources"].add(source)

    lines = []
    for platform, cap in sorted(caps.items()):
        agg = rows_by_platform.get(platform, {"delivered_spend_micros": 0, "sources": set()})
        delivered_micros = agg["delivered_spend_micros"]
        funded = int(cap["lifetime_cap_micros"])
        sources = sorted(agg["sources"])
        lines.append(
            {
                "platform": platform,
                "funded_media_micros": funded,
                "delivered_spend_micros": delivered_micros,
                "undelivered_micros": funded - delivered_micros,
                "overdelivered": delivered_micros > funded,
                "evidence": (
                    "platform-api" if sources == ["platform_api"] else
                    "operator-attested" if sources else "no delivery rows this period"
                ),
            }
        )

    return {
        "kind": "spend_statement",
        "period": period,
        "currency": currency,
        "weekly_price_micros": quote.get("weekly_price_micros"),
        "margin_micros": quote.get("margin_micros"),
        "media_micros": quote.get("weekly_spend_micros"),
        "lines": lines,
        "note": (
            "margin is disclosed and never spendable (BUILD-PLAN §0.6); delivered figures are "
            "graded by their evidence source and are not third-party attested"
        ),
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Weekly billed-vs-delivered spend statement.")
    p.add_argument("quote", type=Path, help="campaign quote JSON (pricing.quote output)")
    p.add_argument("delivered", type=Path, help="JSON list: platform, spend_micros, currency, source")
    p.add_argument("--period", required=True, help="statement period label, e.g. 2026-W32")
    p.add_argument("--out", type=Path, help="write statement JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = statement(
            json.loads(args.quote.read_text(encoding="utf8")),
            json.loads(args.delivered.read_text(encoding="utf8")),
            period=args.period,
        )
    except Exception as exc:
        print(f"spend_statement failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
