#!/usr/bin/env python3
"""
client_report.py - the weekly report a client actually reads, composed from artifacts.

Agencies spend 8-12 hours a week turning dashboards into narrative because the
narrative is what retains (COMPETITOR-GAPS §2.3). Soma's version is composed, not
written: every section is rendered from a machine artifact that already exists (cycle
report, validation ledger, spend statement, MER, survey witness, lift analysis,
fatigue flags), so the report can never say more than the artifacts know. Sections
whose artifact is absent are omitted, not faked; refusals are printed, because "here
is what we declined to do and why" is the sentence no competitor's report contains.

Output is markdown with a `kind: client_report` JSON wrapper so the dashboard can
store and render it (serve_reports, migration 0017).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def _load(value: Any, base: Path) -> Any:
    if isinstance(value, str):
        return json.loads((base / value).read_text(encoding="utf8"))
    return value


def _dollars(micros: Any) -> str:
    try:
        return f"${int(micros) / 1_000_000:,.2f}"
    except (TypeError, ValueError):
        return "—"


def _section_actions(cycle: dict[str, Any]) -> list[str]:
    out = ["## What ran, what changed"]
    executed = cycle.get("actions_executed") or []
    planned = cycle.get("actions_planned") or []
    referrals = cycle.get("activation_referrals") or []
    if not executed and not planned and not referrals:
        out.append("No actions this period; delivery continued unchanged.")
    for a in executed:
        out.append(f"- Paused `{a.get('external_ad_id')}` on {a.get('platform')}: {a.get('reason')}")
    for a in planned:
        if a not in executed:
            out.append(
                f"- Planned pause of `{a.get('external_ad_id')}` on {a.get('platform')}: {a.get('reason')}"
            )
    for r in referrals:
        out.append(
            f"- Test winner `{r.get('arm_key')}`: activation goes through the funded-week check, "
            "never automatically"
        )
    refusals = cycle.get("refusals") or []
    if refusals:
        out.append("")
        out.append("**What we declined to do, and why:**")
        for r in refusals:
            out.append(f"- {r.get('refused')}")
    return out


def _section_validation(validation: dict[str, Any], brand_id: str | None) -> list[str]:
    out = ["## Predicted vs. actual"]
    block = None
    if brand_id:
        block = (validation.get("brands") or {}).get(brand_id)
    block = block or validation.get("pooled") or {}
    if block.get("verdict") == "tracking":
        out.append(
            f"Across {block['n']} ads with outcomes, our pre-flight score ranks realized CTR at "
            f"Spearman {block['spearman']} (permutation p = {block['permutation_p']}). "
            "A rank agreement, not a promise — and it updates every week whether it flatters us or not."
        )
    else:
        out.append(
            f"Not enough prediction-outcome pairs yet ({block.get('n', 0)} of "
            f"{block.get('min_pairs', '—')} needed). We publish this section only when the data can "
            "carry it."
        )
    pairs = [p for p in validation.get("pairs") or [] if not brand_id or p.get("brand_id") == brand_id]
    if pairs:
        out.append("")
        out.append("| ad | predicted score | realized CTR |")
        out.append("|---|---|---|")
        for p in sorted(pairs, key=lambda r: -r["predicted_score"])[:10]:
            out.append(f"| `{p['served_ad_id']}` | {p['predicted_score']} | {p['realized_ctr']} |")
    return out


def _section_spend(stmt: dict[str, Any]) -> list[str]:
    out = ["## Spend statement (billed vs. delivered)"]
    out.append(
        f"Weekly price {_dollars(stmt.get('weekly_price_micros'))} = media "
        f"{_dollars(stmt.get('media_micros'))} + disclosed margin {_dollars(stmt.get('margin_micros'))}."
    )
    out.append("")
    out.append("| platform | funded media | delivered | evidence |")
    out.append("|---|---|---|---|")
    for line in stmt.get("lines") or []:
        out.append(
            f"| {line['platform']} | {_dollars(line['funded_media_micros'])} | "
            f"{_dollars(line['delivered_spend_micros'])} | {line['evidence']} |"
        )
    return out


def _section_mer(mer: dict[str, Any]) -> list[str]:
    out = ["## Blended MER (from your revenue feed)"]
    out.append("| week | your revenue | weekly price | MER |")
    out.append("|---|---|---|---|")
    for w in mer.get("weeks") or []:
        out.append(
            f"| {w['week']} | {_dollars(w['revenue_micros'])} | {_dollars(w['price_micros'])} | {w['mer']} |"
        )
    out.append("")
    out.append(f"_{mer.get('note')}_")
    return out


def _section_survey(sv: dict[str, Any]) -> list[str]:
    out = ["## Second witness: post-purchase survey"]
    out.append("| channel | responses | share |")
    out.append("|---|---|---|")
    for c in sv.get("channels") or []:
        out.append(f"| {c['channel']} | {c['responses']} | {c['share']:.0%} |")
    return out


def _section_lift(lift: dict[str, Any]) -> list[str]:
    out = ["## Incrementality"]
    v = lift.get("verdict")
    if v == "insufficient_n":
        out.append("The last lift study did not reach its conversion floor; no claim is made.")
    else:
        ci = lift.get("ci95") or ["—", "—"]
        out.append(
            f"Verdict: **{v}** — absolute lift {lift.get('absolute_lift')} "
            f"(95% CI [{ci[0]}, {ci[1]}]). We report nulls too; that is the point."
        )
        if lift.get("unregistered"):
            out.append("_This study was not pre-registered; treat it as exploratory._")
    return out


def _section_fatigue(f: dict[str, Any]) -> list[str]:
    out = ["## Creative freshness"]
    fatigued = f.get("fatigued") or []
    if not fatigued:
        out.append("No creative crossed the fatigue threshold this period.")
    for row in fatigued:
        out.append(
            f"- `{row['served_ad_id']}` recent CTR is {row['decay']:.0%} of its baseline — "
            "refresh recommended (queued in your approval feed, nothing swapped automatically)."
        )
    return out


def compose(spec: dict[str, Any], *, base: Path) -> dict[str, Any]:
    period = str(spec.get("period") or "")
    if not period:
        raise ValueError("period label is required")
    cycle = _load(spec.get("cycle_report"), base) if spec.get("cycle_report") else None
    if cycle is None:
        raise ValueError("a client report without a cycle report has nothing true to say")

    brand_id = str(spec.get("brand_id") or "") or None
    parts: list[str] = [f"# {spec.get('brand_name') or 'Soma'} — weekly report, {period}", ""]
    parts += _section_actions(cycle)

    for key, renderer in (
        ("validation", lambda d: _section_validation(d, brand_id)),
        ("spend_statement", _section_spend),
        ("mer", _section_mer),
        ("survey", _section_survey),
        ("lift", _section_lift),
        ("fatigue", _section_fatigue),
    ):
        if spec.get(key) is not None:
            parts.append("")
            parts += renderer(_load(spec[key], base))

    parts += [
        "",
        "---",
        "_Every number above is rendered from a stored artifact; sections without an artifact are "
        "omitted rather than estimated. Approvals live in your dashboard's action feed; execution "
        "only ever happens behind the spend guard._",
    ]
    return {
        "kind": "client_report",
        "period_label": period,
        "brand_id": brand_id,
        "markdown": "\n".join(parts) + "\n",
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Compose the weekly client report from artifacts.")
    p.add_argument("spec", type=Path, help="JSON naming period, brand, and artifact paths/inline objects")
    p.add_argument("--out", type=Path, help="write report JSON (markdown inside)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        report = compose(json.loads(args.spec.read_text(encoding="utf8")), base=args.spec.parent)
    except Exception as exc:
        print(f"client_report failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(report["markdown"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
