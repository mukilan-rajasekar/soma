#!/usr/bin/env python3
"""
revenue_feed.py - blended MER from the client's own revenue, plus the survey witness.

The one number a bundled-spend platform cannot game is total client revenue divided by
what the client paid us, computed from a feed the CLIENT owns (Shopify/Stripe export).
That ownership is enforced, not assumed: a feed without `client_owned: true` provenance
is refused, because a MER Soma computed from Soma's own counting is just another
self-graded dashboard. The post-purchase survey is the cheapest independent second
witness ("how did you hear about us") - tallied, never modelled.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def mer(feed: dict[str, Any], *, weekly_price_micros: int, currency: str) -> dict[str, Any]:
    if not feed.get("client_owned"):
        raise ValueError(
            "revenue feed must declare client_owned: true - a MER computed from numbers the "
            "client does not control is self-graded homework, refusing"
        )
    feed_currency = str(feed.get("currency") or "").upper()
    currency = currency.upper()
    if feed_currency != currency:
        raise ValueError(f"currency mismatch: feed is {feed_currency or 'unset'}, price is {currency}")
    if weekly_price_micros <= 0:
        raise ValueError("weekly_price_micros must be positive")

    weeks = []
    for row in feed.get("weeks") or []:
        label = str(row.get("week") or "")
        revenue = int(row.get("revenue_micros") or 0)
        if not label:
            raise ValueError("every feed row needs a week label")
        if revenue < 0:
            raise ValueError(f"week {label}: negative revenue")
        weeks.append(
            {
                "week": label,
                "revenue_micros": revenue,
                "price_micros": weekly_price_micros,
                "mer": round(revenue / weekly_price_micros, 4),
            }
        )
    if not weeks:
        raise ValueError("feed has no weeks")

    return {
        "kind": "mer",
        "currency": currency,
        "source": str(feed.get("source") or "client_feed"),
        "client_owned": True,
        "weeks": weeks,
        "note": (
            "MER = client-verified revenue / bundled weekly price, all channels blended; "
            "it is an efficiency ratio, not an attribution claim"
        ),
    }


def survey_witness(responses: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    total = 0
    for row in responses:
        channel = str(row.get("channel") or "").strip().lower()
        if not channel:
            continue
        n = int(row.get("count") or 1)
        if n < 0:
            raise ValueError(f"negative count for channel {channel!r}")
        counts[channel] = counts.get(channel, 0) + n
        total += n
    if total == 0:
        raise ValueError("no survey responses with a channel")
    return {
        "kind": "survey_witness",
        "total_responses": total,
        "channels": [
            {"channel": ch, "responses": n, "share": round(n / total, 4)}
            for ch, n in sorted(counts.items(), key=lambda kv: -kv[1])
        ],
        "note": "zero-party self-reports, tallied as answered; no attribution modelling applied",
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Client-owned MER and survey second witness.")
    action = p.add_mutually_exclusive_group(required=True)
    action.add_argument("--mer", type=Path, help="revenue feed JSON: client_owned, currency, weeks")
    action.add_argument("--survey", type=Path, help="JSON list of {channel, count} survey tallies")
    p.add_argument("--weekly-price-micros", type=int, help="bundled weekly price (required with --mer)")
    p.add_argument("--currency", default="USD", help="price currency (with --mer)")
    p.add_argument("--out", type=Path, help="write result JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.mer:
            if not args.weekly_price_micros:
                raise ValueError("--weekly-price-micros is required with --mer")
            result = mer(
                json.loads(args.mer.read_text(encoding="utf8")),
                weekly_price_micros=args.weekly_price_micros,
                currency=args.currency,
            )
        else:
            result = survey_witness(json.loads(args.survey.read_text(encoding="utf8")))
    except Exception as exc:
        print(f"revenue_feed failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
