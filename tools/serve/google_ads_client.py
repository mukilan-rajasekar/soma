#!/usr/bin/env python3
"""
google_ads_client.py - minimal Google Ads API writer for Serve.

Same safety invariant as meta_client.py and tiktok_client.py: create may prepare
platform objects, but it must not spend. Google's enum is ENABLED/PAUSED/REMOVED, so
every create here carries PAUSED and activation lives in tools/serve/launch.py behind
the spend guard. Callers still speak ACTIVE/PAUSED — set_ad_status() translates
ACTIVE to ENABLED — so launch.py stays platform-blind.

Endpoint shapes follow the REST mutate surface (customers/{cid}/<resource>:mutate with
an operations list, resource names as ids). Unlike TikTok, Google budgets are already
micros, so the spend guard's fixtures and these payloads share a unit. No live call
has ever been made from this module — Soma has no Google Ads developer token yet — so
every shape below must be re-verified against a test account the day access lands.
Until then the dry-run recorder is the contract, and the tests pin the invariant that
actually matters: nothing is ever created enabled.

Note pricing.PLATFORMS does not include "google" yet: quotes cannot allocate funded
media here, so launch.py --activate --funded-quote refuses for this platform. That
refusal is correct until pricing (and its TS mirror) learn a google split.
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


class GoogleAdsClient:
    def __init__(
        self,
        *,
        access_token: str | None = None,
        developer_token: str | None = None,
        customer_id: str | None = None,
        login_customer_id: str | None = None,
        api_version: str | None = None,
        dry_run: bool = False,
        recorder: DryRunRecorder | None = None,
    ):
        self.access_token = access_token or os.environ.get("GOOGLE_ADS_ACCESS_TOKEN", "").strip()
        self.developer_token = developer_token or os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip()
        self.customer_id = (customer_id or os.environ.get("GOOGLE_ADS_CUSTOMER_ID", "")).strip().replace("-", "")
        self.login_customer_id = (
            login_customer_id or os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "")
        ).strip().replace("-", "")
        self.api_version = api_version or os.environ.get("GOOGLE_ADS_API_VERSION", "v20")
        self.dry_run = dry_run
        self.recorder = recorder or DryRunRecorder()
        if not self.dry_run and (not self.access_token or not self.developer_token or not self.customer_id):
            raise RuntimeError(
                "Set GOOGLE_ADS_ACCESS_TOKEN, GOOGLE_ADS_DEVELOPER_TOKEN and "
                "GOOGLE_ADS_CUSTOMER_ID, or pass dry_run=True."
            )
        # Same kill-switch as Meta and TikTok: tokens alone must not be enough to
        # write. A mis-set shell env must not create or activate ads by accident.
        if not self.dry_run and os.environ.get("SOMA_SERVE_LIVE", "").strip() != "1":
            raise RuntimeError(
                "Refusing live Google Ads writes: set SOMA_SERVE_LIVE=1 to enable, or pass dry_run=True."
            )

    def _url(self, resource: str) -> str:
        return (
            f"https://googleads.googleapis.com/{self.api_version}/"
            f"customers/{self.customer_id}/{resource}:mutate"
        )

    def _mutate(self, resource: str, operation: dict[str, Any]):
        url = self._url(resource)
        payload = {"operations": [operation]}
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}",
            "developer-token": self.developer_token,
        }
        if self.login_customer_id:
            headers["login-customer-id"] = self.login_customer_id
        if self.dry_run:
            return self.recorder.record("POST", url, payload, headers)
        if os.environ.get("SOMA_SERVE_LIVE", "").strip() != "1":
            raise RuntimeError("Refusing live Google Ads writes: SOMA_SERVE_LIVE is not 1.")

        req = urllib.request.Request(
            url, data=json.dumps(payload).encode("utf-8"), method="POST", headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            raise RuntimeError(f"Google Ads POST {url} -> {exc.code}: {detail}") from None
        return json.loads(raw) if raw else {}

    def _with_id(self, resp: dict[str, Any]) -> dict[str, Any]:
        """Normalize a mutate response to carry a top-level `id` (the resource name)."""
        if resp.get("dry_run"):
            return resp
        results = resp.get("results") or []
        name = (results[0] or {}).get("resourceName") if results else None
        if not name:
            raise RuntimeError(f"Google Ads response has no resourceName: {json.dumps(resp)[:800]}")
        return {"id": str(name), "raw": resp}

    def create_campaign_budget(self, *, name: str, amount_micros: int, **extra: Any):
        # Budgets are shared by default on Google; a Serve campaign's ceiling is its
        # own, so explicitly_shared is pinned False unless the spec says otherwise.
        budget = {
            "name": name,
            "amountMicros": str(int(amount_micros)),
            "deliveryMethod": extra.pop("delivery_method", "STANDARD"),
            "explicitlyShared": extra.pop("explicitly_shared", False),
            **extra,
        }
        return self._with_id(self._mutate("campaignBudgets", {"create": budget}))

    def create_campaign(
        self,
        *,
        name: str,
        budget_id: str,
        advertising_channel_type: str = "VIDEO",
        **extra: Any,
    ):
        campaign = {
            "name": name,
            "campaignBudget": budget_id,
            "advertisingChannelType": advertising_channel_type,
            **extra,
            # After **extra on purpose: a spec that smuggles status ENABLED into a
            # create must not override the pause-first invariant (same pin as the
            # Meta and TikTok clients).
            "status": "PAUSED",
        }
        return self._with_id(self._mutate("campaigns", {"create": campaign}))

    def create_video_asset(self, *, name: str, youtube_video_id: str, **extra: Any):
        # Google video ads reference a YouTube video, not an uploaded file: the
        # "upload" step for this platform is publishing to YouTube, which happens
        # outside this client. Assets carry no status, so nothing to pin here.
        asset = {
            "name": name,
            "youtubeVideoAsset": {"youtubeVideoId": youtube_video_id},
            **extra,
        }
        return self._with_id(self._mutate("assets", {"create": asset}))

    def create_ad_group(self, *, name: str, campaign_id: str, **extra: Any):
        ad_group = {
            "name": name,
            "campaign": campaign_id,
            "type": extra.pop("type", "VIDEO_RESPONSIVE"),
            **extra,
            "status": "PAUSED",
        }
        return self._with_id(self._mutate("adGroups", {"create": ad_group}))

    def create_ad(
        self,
        *,
        name: str,
        ad_group_id: str,
        video_asset_id: str,
        final_url: str,
        headline: str,
        **extra: Any,
    ):
        ad_group_ad = {
            "adGroup": ad_group_id,
            "ad": {
                "name": name,
                "finalUrls": [final_url],
                "videoResponsiveAd": {
                    "videos": [{"asset": video_asset_id}],
                    "headlines": [{"text": headline}],
                },
            },
            **extra,
            "status": "PAUSED",
        }
        return self._with_id(self._mutate("adGroupAds", {"create": ad_group_ad}))

    def set_ad_status(self, *, external_ad_id: str, status: str):
        # Callers speak Meta's vocabulary so launch.py needs no platform branch.
        # ENABLED never crosses this boundary inbound.
        if status != "ACTIVE" and status != "PAUSED":
            raise ValueError("status must be ACTIVE or PAUSED")
        operation = {
            "update": {
                "resourceName": external_ad_id,
                "status": "ENABLED" if status == "ACTIVE" else "PAUSED",
            },
            "updateMask": "status",
        }
        return self._mutate("adGroupAds", operation)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Create paused Google Ads objects from a JSON spec.")
    p.add_argument("spec", help="JSON file with budget, campaign, ad_group, ad and youtube_video_id")
    p.add_argument("--dry-run", action="store_true", help="print request payloads without HTTP")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    with open(args.spec, encoding="utf8") as fh:
        spec = json.load(fh)
    client = GoogleAdsClient(dry_run=args.dry_run)
    budget = client.create_campaign_budget(**spec["budget"])
    campaign = client.create_campaign(**{**spec["campaign"], "budget_id": budget["id"]})
    asset = client.create_video_asset(
        name=spec["ad"]["name"], youtube_video_id=spec["youtube_video_id"]
    )
    ad_group = client.create_ad_group(**{**spec["ad_group"], "campaign_id": campaign["id"]})
    ad = client.create_ad(**{**spec["ad"], "ad_group_id": ad_group["id"], "video_asset_id": asset["id"]})
    print(
        json.dumps(
            {"budget": budget, "campaign": campaign, "asset": asset, "ad_group": ad_group, "ad": ad},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
