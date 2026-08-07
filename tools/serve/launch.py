#!/usr/bin/env python3
"""
launch.py - create paused Meta ads or activate an existing paused ad.

Creation and activation are intentionally separate commands. `--create` never spends,
because every object is created PAUSED. `--activate` checks the spend guard first and only
then flips one external ad id to ACTIVE.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.serve import guard
from tools.serve.meta_client import MetaClient
from tools.serve.tiktok_client import TikTokClient


def _client(platform: str, *, dry_run: bool):
    if platform == "tiktok":
        return TikTokClient(dry_run=dry_run)
    return MetaClient(dry_run=dry_run)


def create_from_spec(path: Path, *, dry_run: bool, platform: str = "meta") -> dict[str, object]:
    spec = json.loads(path.read_text(encoding="utf8"))

    if platform == "tiktok":
        # TikTok has no start/finish upload handshake and no separate creative object:
        # the creative rides inside ad/create. Four calls, all DISABLE.
        client = TikTokClient(dry_run=dry_run)
        campaign = client.create_campaign(**spec["campaign"])
        adgroup = client.create_adgroup(**{**spec["adgroup"], "campaign_id": campaign["id"]})
        video = client.upload_video(video_url=spec["video_file_url"])
        ad = client.create_ad(**{**spec["ad"], "adgroup_id": adgroup["id"], "video_id": video["id"]})
        return {"campaign": campaign, "adgroup": adgroup, "video": video, "ad": ad}

    client = MetaClient(dry_run=dry_run)

    campaign = client.create_campaign(**spec["campaign"])
    adset = client.create_adset(**{**spec["adset"], "campaign_id": campaign["id"]})
    started = client.start_video_upload()
    video = client.finish_video_upload(
        video_id=started["id"],
        upload_url=started.get("upload_url") or started["url"],
        file_url=spec["video_file_url"],
    )
    creative = client.create_adcreative(**{**spec["creative"], "video_id": video.get("id", started["id"])})
    ad = client.create_ad(**{**spec["ad"], "adset_id": adset["id"], "creative_id": creative["id"]})
    return {"campaign": campaign, "adset": adset, "video": video, "creative": creative, "ad": ad}


def activate(
    external_ad_id: str, *, fixture: Path | None, dry_run: bool, platform: str = "meta"
) -> dict[str, object]:
    # Activation without an explicit cap check is a spend hole: guard.check_ok() used to
    # return ok when no caps were configured. Refuse that path entirely.
    if fixture is None:
        raise RuntimeError(
            "--activate requires --guard-fixture with observed spend and a daily/lifetime "
            "cap. Refusing to flip ACTIVE with no ceiling."
        )
    decision = guard.decision_from_fixture(fixture, external_ad_id=external_ad_id, mode="would_pause")
    if not decision.ok:
        if decision.cap_micros is None:
            raise RuntimeError("Spend guard blocked activation: fixture has no cap configured")
        raise RuntimeError(
            f"Spend guard blocked activation: {decision.observed_spend_micros} >= {decision.cap_micros}"
        )

    client = _client(platform, dry_run=dry_run)
    result = client.set_ad_status(external_ad_id=external_ad_id, status="ACTIVE")
    return {"guard": decision.__dict__, "activation": result}


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Serve Meta launch helper.")
    action = p.add_mutually_exclusive_group(required=True)
    action.add_argument("--create", type=Path, help="JSON spec for paused create flow")
    action.add_argument("--activate", help="external Meta ad id to activate after guard check")
    p.add_argument("--guard-fixture", type=Path, help="offline spend/cap fixture for --activate")
    p.add_argument(
        "--platform",
        choices=("meta", "tiktok"),
        default="meta",
        help="ad network to write against (creates stay PAUSED/DISABLE either way)",
    )
    p.add_argument("--dry-run", action="store_true", help="print platform payloads without HTTP")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.create:
            result = create_from_spec(args.create, dry_run=args.dry_run, platform=args.platform)
        else:
            result = activate(
                args.activate, fixture=args.guard_fixture, dry_run=args.dry_run, platform=args.platform
            )
    except Exception as exc:
        print(f"launch failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
