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

It also carries the fee_disclosure block Meta Developer Policy 10.6 requires from
2027-02-03: spend stated separately from fees, plus the fee STRUCTURE rather than only
the amount. Under bundled weekly pricing the structure is "20% of funded media", so the
basis has to be named - a bare margin figure does not say what it was a percentage of,
and that is the half 10.6 actually asks for. The block refuses to render rather than
disclose a quote whose own identity does not hold (media + margin != price): a
disclosure computed from an inconsistent quote is worse than no disclosure, because it
is the artifact a regulator or a client would rely on.
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

from tools.serve.pricing import funded_caps, margin_micros_for  # noqa: E402

DELIVERY_SOURCES = ("platform_api", "operator_fixture")

# Meta Developer Policy 10.6: on request, disclose spend separately from fees and the
# associated fee structure. Dated here so the obligation is greppable, not remembered.
POLICY_10_6_EFFECTIVE = "2027-02-03"

# Checked for presence, not truthiness: margin_pct is legitimately 0.0 on a zero-margin
# quote, and `or`-style defaulting would silently turn a missing field into a disclosed
# figure of zero.
REQUIRED_QUOTE_FIELDS = (
    "weekly_spend_micros",
    "margin_micros",
    "weekly_price_micros",
    "margin_pct",
)


def fee_disclosure(quote: dict[str, Any], *, delivered_micros: int) -> dict[str, Any]:
    """Spend and fees, separated, with the basis named. Meta Developer Policy 10.6."""
    # Absence must not default to zero. `{}` would otherwise satisfy the identity below
    # as 0 + 0 == 0 and render a complete-looking disclosure of nothing, with a null
    # rate - which is the exact artifact this function exists to refuse, produced by the
    # one input most likely to reach it by accident.
    missing = [f for f in REQUIRED_QUOTE_FIELDS if quote.get(f) is None]
    if missing:
        raise ValueError(
            f"quote is missing {missing}; refusing to render a fee disclosure from an "
            "incomplete quote"
        )

    media = int(quote["weekly_spend_micros"])
    margin = int(quote["margin_micros"])
    price = int(quote["weekly_price_micros"])

    # 0016 enforces this identity on insert; a quote that reaches us violating it came
    # from somewhere else, and disclosing its numbers would launder the inconsistency.
    if media + margin != price:
        raise ValueError(
            f"quote identity broken: media {media} + margin {margin} != price {price}; "
            "refusing to render a fee disclosure from it"
        )
    # pricing.quote refuses spend <= 0, so a real quote always has positive media. A
    # zero-media week has no basis for a percentage and nothing to disclose about.
    if media <= 0:
        raise ValueError(f"quote has non-positive media ({media}); no basis to disclose")

    # The rate and the money must be the same fact. A stale margin_pct alongside correct
    # amounts still satisfies the identity above - the quote is internally consistent and
    # the disclosure would publish a rate the client was never charged, which is the one
    # error 10.6 exists to prevent. Reconciled through pricing's own function so the
    # disclosure cannot drift from the invoice, truncation defect included: the artifact
    # must state what WAS charged, not what should have been.
    margin_pct = quote["margin_pct"]
    charged = margin_micros_for(media, float(margin_pct))
    if charged != margin:
        raise ValueError(
            f"declared margin_pct {margin_pct} implies {charged} micros on media {media}, "
            f"but the quote charges {margin}; refusing to disclose a rate that was not charged"
        )

    return {
        "policy": "meta-developer-policy-10.6",
        "effective": POLICY_10_6_EFFECTIVE,
        # The structure, not just the number. "20%" alone does not say of what.
        "fee_basis": "percentage_of_funded_media",
        "fee_pct": quote.get("margin_pct"),
        "fee_micros": margin,
        "media_funded_micros": media,
        "media_delivered_micros": delivered_micros,
        "client_paid_micros": price,
        # The one property that distinguishes this from an agency's markup: the fee is
        # computed on funded media and cannot itself be spent as media (§0.6).
        "fee_is_spendable_as_media": False,
        "note": (
            "fee is a percentage of funded media, disclosed on the quote; media and fee "
            "are stated separately above and the fee is never spendable as media"
        ),
    }


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

    delivered_total = sum(line["delivered_spend_micros"] for line in lines)

    return {
        "kind": "spend_statement",
        "period": period,
        "currency": currency,
        "weekly_price_micros": quote.get("weekly_price_micros"),
        "margin_micros": quote.get("margin_micros"),
        "media_micros": quote.get("weekly_spend_micros"),
        "delivered_spend_micros": delivered_total,
        "lines": lines,
        "fee_disclosure": fee_disclosure(quote, delivered_micros=delivered_total),
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
