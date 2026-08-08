#!/usr/bin/env python3
"""
autopilot.py - one command that runs a full Serve cycle: observe, decide, act.

Every organ of the loop already exists as its own tool (ab.py evaluates, guard.py
checks ceilings, brand_calibration.py fits and reranks, propose_next.py suggests the
next edit, renewals.py advances subscriptions). What was missing is the spinal cord:
"hand it off and never think about it again" is a scheduling claim, and this is the
scheduler's entry point. A cycle takes one spec, runs every stage it has inputs for,
and emits one report saying what it saw, what it decided, and what it refused.

The invariant that makes unattended operation safe to even discuss: autopilot may STOP
spend on its own (pause a losing arm, pause a cap breach) but may never START it.
There is no activation path in this file. Winners are referred to launch.py
--activate, which demands a funded quote (BUILD-PLAN §0.6) — a referral is written
into the report instead, and the tests pin that no client here is ever asked for
ACTIVE. Renewal execution honors the licence gate the same way renewals.py does,
except a blocked gate is recorded as a refusal in the report rather than raised: an
unattended cycle should complete and say what it could not do.

--execute performs the pause actions and the renewal write-back. Without
SOMA_SERVE_LIVE=1 the platform clients run in dry-run (payloads recorded, no HTTP), so
a cron on a box without the kill switch set still produces a truthful report. The spec
requires `today` (YYYY-MM-DD) rather than reading the clock, same discipline as
renewals.py: a cycle report is reproducible evidence, not a timestamped one-off.

Shape on the box, next to heartbeat.py's timer:

    # /etc/systemd/system/soma-serve-autopilot.service
    [Service]
    Type=oneshot
    WorkingDirectory=/opt/soma
    EnvironmentFile=/opt/soma/.env
    ExecStart=/opt/soma/.venv/bin/python tools/serve/autopilot.py cycles/today.json --execute

    # /etc/systemd/system/soma-serve-autopilot.timer
    [Timer]
    OnCalendar=daily
    Persistent=true
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.serve import ab, guard, propose_next, renewals  # noqa: E402
from tools.serve import brand_calibration  # noqa: E402
from tools.serve.check_licence_gate import licence_blocked  # noqa: E402
from tools.serve.google_ads_client import GoogleAdsClient  # noqa: E402
from tools.serve.meta_client import MetaClient  # noqa: E402
from tools.serve.tiktok_client import TikTokClient  # noqa: E402

PLATFORM_CLIENTS = {"meta": MetaClient, "tiktok": TikTokClient, "google": GoogleAdsClient}


def _load(value: Any, base: Path) -> Any:
    """A spec value may be inline JSON or a path string relative to the spec file."""
    if isinstance(value, str):
        return json.loads((base / value).read_text(encoding="utf8"))
    return value


def _pause_action(platform: str, external_ad_id: str, reason: str) -> dict[str, Any]:
    if platform not in PLATFORM_CLIENTS:
        raise ValueError(f"unknown platform {platform!r}; have {sorted(PLATFORM_CLIENTS)}")
    if not external_ad_id:
        raise ValueError(f"pause action needs an external_ad_id ({reason})")
    return {"action": "pause", "platform": platform, "external_ad_id": external_ad_id, "reason": reason}


def _stage_experiments(spec: dict[str, Any], base: Path) -> tuple[list[dict], list[dict], list[dict]]:
    evaluations, pauses, referrals = [], [], []
    for exp in spec.get("experiments") or []:
        fixture = _load(exp.get("fixture") or {"arms": exp.get("arms") or []}, base)
        result = ab.evaluate(fixture)
        arm_ads = exp.get("arm_ads") or {}
        entry = {"experiment_key": exp.get("experiment_key"), "result": result}
        if result["decision"] == "winner":
            winner = result["winner"]
            for arm in result["arms"]:
                mapping = arm_ads.get(arm["arm_key"]) or {}
                if arm["arm_key"] == winner:
                    # Starting spend is launch.py's job, behind the funded quote.
                    referrals.append(
                        {
                            "action": "activate",
                            "arm_key": winner,
                            "platform": mapping.get("platform"),
                            "external_ad_id": mapping.get("external_ad_id"),
                            "referred_to": "tools/serve/launch.py --activate ... --funded-quote (§0.6)",
                            "refused_by_design": "autopilot never starts spend",
                        }
                    )
                elif mapping.get("external_ad_id"):
                    pauses.append(
                        _pause_action(
                            str(mapping.get("platform") or "meta"),
                            str(mapping["external_ad_id"]),
                            f"lost to {winner} (adjusted alpha {result['adjusted_alpha']})",
                        )
                    )
        evaluations.append(entry)
    return evaluations, pauses, referrals


def _stage_guard(spec: dict[str, Any], base: Path) -> tuple[list[dict], list[dict]]:
    checks, pauses = [], []
    for entry in spec.get("guards") or []:
        fixture_path = base / str(entry["fixture"])
        external_ad_id = str(entry.get("external_ad_id") or "")
        decision = guard.decision_from_fixture(
            fixture_path, external_ad_id=external_ad_id or None, mode="would_pause"
        )
        checks.append({"external_ad_id": external_ad_id, "decision": decision.__dict__})
        if not decision.ok:
            pauses.append(
                _pause_action(
                    str(entry.get("platform") or "meta"),
                    external_ad_id,
                    f"spend {decision.observed_spend_micros} breached cap {decision.cap_micros}",
                )
            )
    return checks, pauses


def _stage_renewals(
    spec: dict[str, Any], base: Path, *, today: dt.date, execute: bool
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    ref = spec.get("subscriptions")
    if not ref:
        return None, None
    path = base / str(ref)
    subscriptions = json.loads(path.read_text(encoding="utf8"))
    plan = renewals.tick(subscriptions, today=today)
    refusal = None
    if execute and plan["renewed"]:
        if licence_blocked():
            refusal = {
                "stage": "renewals",
                "refused": "PLAN.md gate 4 is open (a renewal that executes is a bill in "
                "waiting); planned only, nothing written",
            }
        else:
            path.write_text(
                json.dumps(renewals.apply_tick(subscriptions, plan), indent=2, sort_keys=True) + "\n",
                encoding="utf8",
            )
            plan = {**plan, "written_back": str(path)}
    return plan, refusal


def run_cycle(spec: dict[str, Any], *, base: Path, execute: bool = False) -> dict[str, Any]:
    today = dt.date.fromisoformat(str(spec.get("today") or ""))

    evaluations, exp_pauses, referrals = _stage_experiments(spec, base)
    guard_checks, guard_pauses = _stage_guard(spec, base)
    pauses = exp_pauses + guard_pauses
    refusals: list[dict[str, Any]] = []

    calibration = None
    if spec.get("calibration") is not None:
        try:
            calibration = brand_calibration.fit(_load(spec["calibration"], base))
        except ValueError as exc:
            # A cross-brand fixture is a refusal the report must carry, not a crash
            # that hides the rest of the cycle.
            refusals.append({"stage": "calibration", "refused": str(exc)})

    ranking = None
    if spec.get("rerank") is not None:
        rr = _load(spec["rerank"], base)
        artifact = rr.get("artifact") or calibration
        if artifact is None:
            refusals.append({"stage": "rerank", "refused": "no artifact given and calibration stage produced none"})
        else:
            try:
                ranking = brand_calibration.rank(artifact, rr.get("served_ads") or [])
            except ValueError as exc:
                refusals.append({"stage": "rerank", "refused": str(exc)})

    proposals = None
    if spec.get("windows") is not None:
        proposals = propose_next.propose(
            _load(spec["windows"], base) or [], _load(spec.get("outcomes") or [], base) or []
        )

    renewal_plan, renewal_refusal = _stage_renewals(spec, base, today=today, execute=execute)
    if renewal_refusal:
        refusals.append(renewal_refusal)

    executed = []
    if execute:
        live = os.environ.get("SOMA_SERVE_LIVE", "").strip() == "1"
        for action in pauses:
            client = PLATFORM_CLIENTS[action["platform"]](dry_run=not live)
            result = client.set_ad_status(external_ad_id=action["external_ad_id"], status="PAUSED")
            executed.append({**action, "live": live, "result": result})

    return {
        "today": today.isoformat(),
        "executed_mode": execute,
        "experiments": evaluations,
        "guards": guard_checks,
        "calibration": calibration,
        "ranking": ranking,
        "proposals": proposals,
        "renewals": renewal_plan,
        "actions_planned": pauses,
        "activation_referrals": referrals,
        "actions_executed": executed,
        "refusals": refusals,
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Run one Serve autopilot cycle from a spec.")
    p.add_argument("spec", type=Path, help="cycle spec JSON; `today` is required inside it")
    p.add_argument(
        "--execute",
        action="store_true",
        help="perform pause actions and renewal write-back (pauses stay dry-run unless SOMA_SERVE_LIVE=1)",
    )
    p.add_argument("--out", type=Path, help="write the cycle report JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        spec = json.loads(args.spec.read_text(encoding="utf8"))
        report = run_cycle(spec, base=args.spec.parent, execute=args.execute)
    except Exception as exc:
        print(f"autopilot failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
