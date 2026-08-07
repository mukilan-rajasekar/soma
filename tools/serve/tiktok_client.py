#!/usr/bin/env python3
"""
tiktok_client.py - minimal TikTok Marketing API writer for Serve.

Same safety invariant as tools/serve/meta_client.py: create may prepare platform
objects, but it must not spend. TikTok's pause flag is `operation_status: "DISABLE"`
(ENABLE/DISABLE, not Meta's ACTIVE/PAUSED), so every create here carries DISABLE and
activation lives in tools/serve/launch.py behind the same spend guard. Callers still
speak ACTIVE/PAUSED — set_ad_status() translates — so launch.py stays platform-blind.

Endpoint shapes follow Business API v1.3: JSON bodies, an Access-Token header, and a
{code, message, data} envelope where a non-zero code is an error even on HTTP 200.
No live call has ever been made from this module — Soma has no approved TikTok
developer app yet — so every shape below must be re-verified against the sandbox the
day access lands. Until then the dry-run recorder is the contract, and the tests pin
the invariant that actually matters: nothing is ever created enabled.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.serve.meta_client import DryRunRecorder  # noqa: E402


class TikTokClient:
    def __init__(
        self,
        *,
        access_token: str | None = None,
        advertiser_id: str | None = None,
        api_version: str | None = None,
        dry_run: bool = False,
        recorder: DryRunRecorder | None = None,
    ):
        self.access_token = access_token or os.environ.get("TIKTOK_ACCESS_TOKEN", "").strip()
        self.advertiser_id = (advertiser_id or os.environ.get("TIKTOK_ADVERTISER_ID", "")).strip()
        self.api_version = api_version or os.environ.get("TIKTOK_API_VERSION", "v1.3")
        self.dry_run = dry_run
        self.recorder = recorder or DryRunRecorder()
        if not self.dry_run and (not self.access_token or not self.advertiser_id):
            raise RuntimeError("Set TIKTOK_ACCESS_TOKEN and TIKTOK_ADVERTISER_ID, or pass dry_run=True.")
        # Same kill-switch as Meta: tokens alone must not be enough to write. A mis-set
        # shell env must not create or activate ads by accident.
        if not self.dry_run and os.environ.get("SOMA_SERVE_LIVE", "").strip() != "1":
            raise RuntimeError(
                "Refusing live TikTok writes: set SOMA_SERVE_LIVE=1 to enable, or pass dry_run=True."
            )

    def _url(self, path: str) -> str:
        return f"https://business-api.tiktok.com/open_api/{self.api_version}/{path.lstrip('/')}"

    def _post(self, path: str, payload: dict[str, Any]):
        url = self._url(path)
        headers = {"Content-Type": "application/json", "Access-Token": self.access_token}
        if self.dry_run:
            return self.recorder.record("POST", url, payload, headers)
        if os.environ.get("SOMA_SERVE_LIVE", "").strip() != "1":
            raise RuntimeError("Refusing live TikTok writes: SOMA_SERVE_LIVE is not 1.")

        req = urllib.request.Request(
            url, data=json.dumps(payload).encode("utf-8"), method="POST", headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            raise RuntimeError(f"TikTok POST {url} -> {exc.code}: {detail}") from None
        body = json.loads(raw) if raw else {}
        # TikTok reports failures inside a 200: {code, message, data}. Treat any
        # non-zero code as the error it is rather than returning it to a caller that
        # will chain a synthetic id into the next create.
        code = body.get("code", 0)
        if code != 0:
            message = str(body.get("message", ""))[:800]
            raise RuntimeError(f"TikTok POST {url} -> code {code}: {message}")
        return body

    def _with_id(self, resp: dict[str, Any], *keys: str) -> dict[str, Any]:
        """Normalize a create response to carry a top-level `id`, like MetaClient's."""
        if resp.get("dry_run"):
            return resp
        data = resp.get("data") or {}
        if isinstance(data, list):
            data = data[0] if data else {}
        for key in keys:
            value = data.get(key)
            if isinstance(value, list):
                value = value[0] if value else None
            if value:
                return {"id": str(value), "raw": resp}
        raise RuntimeError(f"TikTok response has none of {keys}: {json.dumps(resp)[:800]}")

    def create_campaign(
        self,
        *,
        name: str,
        objective: str = "TRAFFIC",
        budget_mode: str = "BUDGET_MODE_INFINITE",
        budget: float | None = None,
        **extra: Any,
    ):
        payload: dict[str, Any] = {
            "advertiser_id": self.advertiser_id,
            "campaign_name": name,
            "objective_type": objective,
            "budget_mode": budget_mode,
            "operation_status": "DISABLE",
            **extra,
        }
        if budget_mode != "BUDGET_MODE_INFINITE":
            if budget is None:
                raise ValueError("budget is required unless budget_mode is BUDGET_MODE_INFINITE")
            payload["budget"] = budget
        return self._with_id(self._post("campaign/create/", payload), "campaign_id")

    def create_adgroup(
        self,
        *,
        name: str,
        campaign_id: str,
        daily_budget: float,
        optimization_goal: str = "CLICK",
        billing_event: str = "CPC",
        **extra: Any,
    ):
        # TikTok budgets are units of the account currency, not micros. The spend
        # guard's fixtures stay in micros; the conversion belongs to whoever writes
        # the fixture from insights, not to this client.
        payload = {
            "advertiser_id": self.advertiser_id,
            "adgroup_name": name,
            "campaign_id": campaign_id,
            "promotion_type": extra.pop("promotion_type", "WEBSITE"),
            "placement_type": extra.pop("placement_type", "PLACEMENT_TYPE_AUTOMATIC"),
            "budget_mode": extra.pop("budget_mode", "BUDGET_MODE_DAY"),
            "budget": daily_budget,
            "schedule_type": extra.pop("schedule_type", "SCHEDULE_FROM_NOW"),
            "optimization_goal": optimization_goal,
            "billing_event": billing_event,
            "bid_type": extra.pop("bid_type", "BID_TYPE_NO_BID"),
            "pacing": extra.pop("pacing", "PACING_MODE_SMOOTH"),
            "operation_status": "DISABLE",
            **extra,
        }
        return self._with_id(self._post("adgroup/create/", payload), "adgroup_id")

    def upload_video(self, *, video_url: str, file_name: str | None = None):
        payload: dict[str, Any] = {
            "advertiser_id": self.advertiser_id,
            "upload_type": "UPLOAD_BY_URL",
            "video_url": video_url,
        }
        if file_name:
            payload["file_name"] = file_name
        return self._with_id(self._post("file/video/ad/upload/", payload), "video_id")

    def create_ad(
        self,
        *,
        name: str,
        adgroup_id: str,
        video_id: str,
        ad_text: str,
        landing_page_url: str,
        identity_id: str | None = None,
        identity_type: str | None = None,
        call_to_action: str | None = None,
        **extra: Any,
    ):
        creative: dict[str, Any] = {
            "ad_name": name,
            "ad_format": "SINGLE_VIDEO",
            "video_id": video_id,
            "ad_text": ad_text,
            "landing_page_url": landing_page_url,
        }
        if identity_id:
            creative["identity_id"] = identity_id
        if identity_type:
            creative["identity_type"] = identity_type
        if call_to_action:
            creative["call_to_action"] = call_to_action
        payload = {
            "advertiser_id": self.advertiser_id,
            "adgroup_id": adgroup_id,
            "creatives": [creative],
            "operation_status": "DISABLE",
            **extra,
        }
        return self._with_id(self._post("ad/create/", payload), "ad_ids", "ad_id")

    def set_ad_status(self, *, external_ad_id: str, status: str):
        # Callers speak Meta's vocabulary so launch.py needs no platform branch.
        # ENABLE/DISABLE never crosses this boundary inbound.
        if status != "ACTIVE" and status != "PAUSED":
            raise ValueError("status must be ACTIVE or PAUSED")
        payload = {
            "advertiser_id": self.advertiser_id,
            "ad_ids": [external_ad_id],
            "operation_status": "ENABLE" if status == "ACTIVE" else "DISABLE",
        }
        return self._post("ad/status/update/", payload)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Create disabled TikTok ad objects from a JSON spec.")
    p.add_argument("spec", help="JSON file with campaign, adgroup, ad and video_file_url")
    p.add_argument("--dry-run", action="store_true", help="print request payloads without HTTP")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    with open(args.spec, encoding="utf8") as fh:
        spec = json.load(fh)
    client = TikTokClient(dry_run=args.dry_run)
    campaign = client.create_campaign(**spec["campaign"])
    adgroup = client.create_adgroup(**{**spec["adgroup"], "campaign_id": campaign["id"]})
    video = client.upload_video(video_url=spec["video_file_url"])
    ad = client.create_ad(**{**spec["ad"], "adgroup_id": adgroup["id"], "video_id": video["id"]})
    print(json.dumps({"campaign": campaign, "adgroup": adgroup, "video": video, "ad": ad}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
