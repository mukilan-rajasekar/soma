#!/usr/bin/env python3
"""
meta_client.py - minimal Meta Marketing API writer for Serve.

The safety invariant is simple: create may prepare platform objects, but it must not spend.
Campaigns, ad sets and ads are therefore created PAUSED, and activation lives in
tools/serve/launch.py behind the spend guard.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any


def _clean_account(value: str) -> str:
    value = value.strip()
    return value if value.startswith("act_") else f"act_{value}"


@dataclass
class DryRunRecorder:
    calls: list[dict[str, Any]] = field(default_factory=list)

    def record(self, method: str, url: str, payload: dict[str, Any] | None, headers: dict[str, str] | None = None):
        item = {"method": method, "url": url, "payload": payload or {}}
        if headers:
            item["headers"] = headers
        self.calls.append(item)
        print(json.dumps(item, sort_keys=True))
        return {"dry_run": True, "id": f"dry_{len(self.calls)}", "url": url}


class MetaClient:
    def __init__(
        self,
        *,
        access_token: str | None = None,
        ad_account_id: str | None = None,
        api_version: str | None = None,
        dry_run: bool = False,
        recorder: DryRunRecorder | None = None,
    ):
        self.access_token = access_token or os.environ.get("META_ACCESS_TOKEN", "").strip()
        self.ad_account_id = _clean_account(ad_account_id or os.environ.get("META_AD_ACCOUNT_ID", ""))
        self.api_version = api_version or os.environ.get("META_API_VERSION", "v21.0")
        self.dry_run = dry_run
        self.recorder = recorder or DryRunRecorder()
        if not self.dry_run and (not self.access_token or not self.ad_account_id.strip("act_")):
            raise RuntimeError("Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID, or pass dry_run=True.")
        # Live Graph writes require an explicit kill-switch. Tokens alone are not enough:
        # a mis-set shell env must not create or activate ads by accident.
        if not self.dry_run and os.environ.get("SOMA_SERVE_LIVE", "").strip() != "1":
            raise RuntimeError(
                "Refusing live Meta writes: set SOMA_SERVE_LIVE=1 to enable, or pass dry_run=True."
            )

    def _url(self, path: str) -> str:
        return f"https://graph.facebook.com/{self.api_version}/{path.lstrip('/')}"

    def _post(self, path_or_url: str, payload: dict[str, Any], *, absolute: bool = False, headers: dict[str, str] | None = None):
        url = path_or_url if absolute else self._url(path_or_url)
        h = {"Content-Type": "application/x-www-form-urlencoded"}
        if headers:
            h.update(headers)
        if self.dry_run:
            return self.recorder.record("POST", url, payload, h)
        if os.environ.get("SOMA_SERVE_LIVE", "").strip() != "1":
            raise RuntimeError("Refusing live Meta writes: SOMA_SERVE_LIVE is not 1.")

        body = dict(payload)
        body["access_token"] = self.access_token
        data = urllib.parse.urlencode({k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in body.items()})
        req = urllib.request.Request(url, data=data.encode("utf-8"), method="POST", headers=h)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            raise RuntimeError(f"Meta POST {url} -> {exc.code}: {detail}") from None
        return json.loads(raw) if raw else {}

    def create_campaign(self, *, name: str, objective: str, buying_type: str = "AUCTION", **extra: Any):
        # status is forced after **extra so a launch spec cannot create ACTIVE objects
        # and bypass launch.py's spend-cap activation guard.
        payload = {
            "name": name,
            "objective": objective,
            "buying_type": buying_type,
            "special_ad_categories": extra.pop("special_ad_categories", []),
            **extra,
            "status": "PAUSED",
        }
        return self._post(f"{self.ad_account_id}/campaigns", payload)

    def create_adset(
        self,
        *,
        name: str,
        campaign_id: str,
        daily_budget: int,
        billing_event: str,
        optimization_goal: str,
        targeting: dict[str, Any],
        **extra: Any,
    ):
        payload = {
            "name": name,
            "campaign_id": campaign_id,
            "daily_budget": daily_budget,
            "billing_event": billing_event,
            "optimization_goal": optimization_goal,
            "targeting": targeting,
            **extra,
            "status": "PAUSED",
        }
        return self._post(f"{self.ad_account_id}/adsets", payload)

    def start_video_upload(self):
        return self._post(f"{self.ad_account_id}/video_ads", {"upload_phase": "start"})

    def finish_video_upload(self, *, video_id: str, upload_url: str, file_url: str):
        headers = {"Authorization": f"OAuth {self.access_token}", "file_url": file_url}
        payload = {"upload_phase": "finish", "video_id": video_id, "file_url": file_url}
        if self.dry_run:
            return self.recorder.record("POST", upload_url, payload, headers)
        return self._post(upload_url, payload, absolute=True, headers=headers)

    def create_adcreative(
        self,
        *,
        name: str,
        page_id: str,
        video_id: str,
        message: str,
        link: str | None = None,
        call_to_action: dict[str, Any] | None = None,
        **extra: Any,
    ):
        video_data: dict[str, Any] = {"video_id": video_id, "message": message}
        if link:
            video_data["link"] = link
        if call_to_action:
            video_data["call_to_action"] = call_to_action
        payload = {
            "name": name,
            "object_story_spec": {"page_id": page_id, "video_data": video_data},
            **extra,
        }
        return self._post(f"{self.ad_account_id}/adcreatives", payload)

    def create_ad(self, *, name: str, adset_id: str, creative_id: str, **extra: Any):
        payload = {
            "name": name,
            "adset_id": adset_id,
            "creative": {"creative_id": creative_id},
            **extra,
            "status": "PAUSED",
        }
        return self._post(f"{self.ad_account_id}/ads", payload)

    def set_ad_status(self, *, external_ad_id: str, status: str):
        if status != "ACTIVE" and status != "PAUSED":
            raise ValueError("status must be ACTIVE or PAUSED")
        return self._post(external_ad_id, {"status": status})


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Create paused Meta ad objects from a JSON spec.")
    p.add_argument("spec", help="JSON file with campaign, adset, creative, ad and video_file_url")
    p.add_argument("--dry-run", action="store_true", help="print request payloads without HTTP")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    with open(args.spec, encoding="utf8") as fh:
        spec = json.load(fh)
    client = MetaClient(dry_run=args.dry_run)
    campaign = client.create_campaign(**spec["campaign"])
    adset_spec = {**spec["adset"], "campaign_id": campaign["id"]}
    adset = client.create_adset(**adset_spec)
    started = client.start_video_upload()
    video = client.finish_video_upload(
        video_id=started["id"],
        upload_url=started.get("upload_url") or started["url"],
        file_url=spec["video_file_url"],
    )
    creative = client.create_adcreative(**{**spec["creative"], "video_id": video.get("id", started["id"])})
    ad = client.create_ad(**{**spec["ad"], "adset_id": adset["id"], "creative_id": creative["id"]})
    print(json.dumps({"campaign": campaign, "adset": adset, "video": video, "creative": creative, "ad": ad}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
