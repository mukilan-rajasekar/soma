#!/usr/bin/env python3
"""
guard.py - fixture-friendly spend guard for Serve.

The live watcher will pull platform spend, compare it with caps, and pause ads that cross
the line. This module keeps that decision pure so tests can exercise the cap math without
Meta credentials or a database.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class SpendCaps:
    daily_cap_micros: int | None = None
    lifetime_cap_micros: int | None = None
    currency: str = "USD"


@dataclass(frozen=True)
class GuardDecision:
    ok: bool
    action: str
    observed_spend_micros: int
    cap_micros: int | None
    currency: str
    reason: str


def _nonnegative(value: int | None, name: str) -> int | None:
    if value is None:
        return None
    value = int(value)
    if value < 0:
        raise ValueError(f"{name} must be non-negative")
    return value


def check_spend(observed_spend_micros: int, caps: SpendCaps, *, mode: str = "would_pause") -> GuardDecision:
    """Compare observed spend with the strictest configured cap."""
    if mode not in {"would_pause", "pause"}:
        raise ValueError("mode must be would_pause or pause")
    observed = _nonnegative(observed_spend_micros, "observed_spend_micros") or 0
    cap_values = [
        _nonnegative(caps.daily_cap_micros, "daily_cap_micros"),
        _nonnegative(caps.lifetime_cap_micros, "lifetime_cap_micros"),
    ]
    active_caps = [cap for cap in cap_values if cap is not None]
    cap = min(active_caps) if active_caps else None
    # No configured cap is NOT permission to spend. Activation without a numeric ceiling
    # is how a sandbox account becomes a live bill; refuse rather than "ok".
    if cap is None:
        return GuardDecision(False, "would_pause", observed, None, caps.currency, "no cap configured")
    if observed >= cap:
        action = "pause" if mode == "pause" else "would_pause"
        return GuardDecision(False, action, observed, cap, caps.currency, "spend cap reached")
    return GuardDecision(True, "ok", observed, cap, caps.currency, "below cap")


def check_ok(observed_spend_micros: int = 0, caps: SpendCaps | None = None, *, mode: str = "would_pause") -> GuardDecision:
    decision = check_spend(observed_spend_micros, caps or SpendCaps(), mode=mode)
    if not decision.ok:
        if decision.cap_micros is None:
            raise RuntimeError(
                "Spend guard blocked activation: no daily or lifetime cap configured. "
                "Pass a guard fixture (or spend_guards row) before flipping ACTIVE."
            )
        raise RuntimeError(
            f"Spend guard blocked activation: {decision.observed_spend_micros} >= {decision.cap_micros} "
            f"{decision.currency} micros ({decision.action})."
        )
    return decision


def decision_from_fixture(path: Path, *, external_ad_id: str | None = None, mode: str = "would_pause") -> GuardDecision:
    data = json.loads(path.read_text(encoding="utf8"))
    rows = data.get("ads") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        raise ValueError("fixture must be a list or an object with ads")
    if external_ad_id:
        rows = [row for row in rows if row.get("external_ad_id") == external_ad_id]
    if not rows:
        raise ValueError("fixture has no matching ad spend row")
    row = rows[0]
    caps = SpendCaps(
        daily_cap_micros=row.get("daily_cap_micros"),
        lifetime_cap_micros=row.get("lifetime_cap_micros"),
        currency=row.get("currency", "USD"),
    )
    return check_spend(int(row.get("observed_spend_micros", 0)), caps, mode=mode)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Check Serve spend caps.")
    p.add_argument("--fixture", type=Path, help="JSON fixture with observed spend and caps")
    p.add_argument("--external-ad-id", help="which fixture row to check")
    p.add_argument("--observed-spend-micros", type=int, default=0)
    p.add_argument("--daily-cap-micros", type=int)
    p.add_argument("--lifetime-cap-micros", type=int)
    p.add_argument("--currency", default="USD")
    p.add_argument("--mode", choices=("would_pause", "pause"), default="would_pause")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.fixture:
        decision = decision_from_fixture(args.fixture, external_ad_id=args.external_ad_id, mode=args.mode)
    else:
        # Without Meta credentials this is intentionally fixture/dry mode: callers pass the
        # observed spend explicitly. Live polling is a watcher concern, not test scaffolding.
        if not os.environ.get("META_ACCESS_TOKEN"):
            print("META_ACCESS_TOKEN absent; using fixture/dry spend input.", file=sys.stderr)
        decision = check_spend(
            args.observed_spend_micros,
            SpendCaps(args.daily_cap_micros, args.lifetime_cap_micros, args.currency),
            mode=args.mode,
        )
    print(json.dumps(asdict(decision), sort_keys=True))
    return 0 if decision.ok else 2


if __name__ == "__main__":
    sys.exit(main())
