#!/usr/bin/env python3
"""
poll_status.py - reconcile Meta effective_status into served_ads.review_status.

BUILD-PLAN §4.4: Meta can disapprove at create time and again after an ad is live.
Customers should learn that from Soma, and the corpus should treat disapproval as
censoring rather than as a bad outcome row.

Reads only. Maps platform status → review_status (pending|approved|rejected|limited)
and keeps the raw effective_status + any ad_review_feedback inside review_feedback.
Dry-run prints the PATCH plan; --execute writes through PostgREST with the service key.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from publish_to_supabase import KEY_VARS, URL_VARS, env_any, load_dotenv  # noqa: E402

# Platform → Soma review_status. Operational pause is not a rejection; disapproval is.
STATUS_MAP = {
    "ACTIVE": "approved",
    "PAUSED": "approved",
    "CAMPAIGN_PAUSED": "approved",
    "ADSET_PAUSED": "approved",
    "PENDING_REVIEW": "pending",
    "PREAPPROVED": "pending",
    "IN_PROCESS": "pending",
    "PENDING_BILLING_INFO": "pending",
    "DISAPPROVED": "rejected",
    "WITH_ISSUES": "limited",
    "DELETED": "limited",
    "ARCHIVED": "limited",
}


def map_review_status(effective_status: str) -> str:
    key = (effective_status or "").strip().upper()
    if key not in STATUS_MAP:
        raise ValueError(f"unknown Meta effective_status: {effective_status!r}")
    return STATUS_MAP[key]


def build_feedback(platform_row: dict[str, Any]) -> dict[str, Any]:
    feedback = {
        "effective_status": platform_row.get("effective_status"),
        "configured_status": platform_row.get("configured_status"),
    }
    if "ad_review_feedback" in platform_row:
        feedback["ad_review_feedback"] = platform_row["ad_review_feedback"]
    if "issues_info" in platform_row:
        feedback["issues_info"] = platform_row["issues_info"]
    return feedback


class MetaStatusClient:
    def __init__(
        self,
        *,
        access_token: str | None = None,
        api_version: str | None = None,
        dry_run: bool = False,
        transport: Callable[..., dict[str, Any]] | None = None,
    ):
        self.access_token = access_token or os.environ.get("META_ACCESS_TOKEN", "").strip()
        self.api_version = (
            api_version
            or os.environ.get("META_API_VERSION")
            or os.environ.get("META_GRAPH_VERSION")
            or "v21.0"
        )
        self.dry_run = dry_run
        self.transport = transport
        self.calls: list[dict[str, Any]] = []
        if not self.dry_run and not self.access_token and transport is None:
            raise RuntimeError("Set META_ACCESS_TOKEN, or pass dry_run=True / a transport.")

    def _url(self, path: str) -> str:
        return f"https://graph.facebook.com/{self.api_version}/{path.lstrip('/')}"

    def get_ad(self, external_ad_id: str) -> dict[str, Any]:
        fields = "id,effective_status,configured_status,ad_review_feedback,issues_info"
        url = self._url(f"{external_ad_id}?fields={fields}")
        self.calls.append({"method": "GET", "url": url})
        if self.transport:
            return self.transport("GET", url)
        if self.dry_run:
            return {
                "id": external_ad_id,
                "effective_status": "PAUSED",
                "configured_status": "PAUSED",
            }
        req_url = f"{url}&access_token={urllib.parse.quote(self.access_token)}"
        req = urllib.request.Request(req_url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            raise RuntimeError(f"Meta GET {url} -> {exc.code}: {detail}") from None
        return json.loads(raw) if raw else {}


def plan_updates(
    served_ads: list[dict[str, Any]],
    client: MetaStatusClient,
) -> dict[str, Any]:
    """Build PATCH rows for served_ads whose review_status would change."""
    updates, skipped, unchanged = [], [], []
    for row in served_ads:
        external_ad_id = str(row.get("external_ad_id") or "").strip()
        if not external_ad_id:
            skipped.append({"id": row.get("id"), "reason": "no external_ad_id"})
            continue
        if row.get("platform", "meta") != "meta":
            skipped.append({"id": row.get("id"), "reason": f"platform {row.get('platform')} not meta"})
            continue
        platform_row = client.get_ad(external_ad_id)
        effective = str(platform_row.get("effective_status") or "")
        try:
            review_status = map_review_status(effective)
        except ValueError as exc:
            skipped.append({"id": row.get("id"), "reason": str(exc)})
            continue
        feedback = build_feedback(platform_row)
        current = row.get("review_status")
        current_fb = row.get("review_feedback") or {}
        if current == review_status and current_fb.get("effective_status") == effective:
            unchanged.append({"id": row.get("id"), "review_status": review_status})
            continue
        updates.append(
            {
                "id": row["id"],
                "review_status": review_status,
                "review_feedback": feedback,
            }
        )
    return {"updates": updates, "skipped": skipped, "unchanged": unchanged}


def _default_http(method: str, url: str, key: str, payload: Any | None = None) -> Any:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:800]
        raise RuntimeError(f"Supabase {method} {url} -> {exc.code}: {detail}") from None
    return json.loads(raw) if raw else []


def execute(
    updates: list[dict[str, Any]],
    base_url: str,
    key: str,
    *,
    http: Callable = _default_http,
) -> int:
    written = 0
    for row in updates:
        sid = urllib.parse.quote(str(row["id"]))
        http(
            "PATCH",
            f"{base_url.rstrip('/')}/rest/v1/served_ads?id=eq.{sid}",
            key,
            {"review_status": row["review_status"], "review_feedback": row["review_feedback"]},
        )
        written += 1
    return written


def load_served_ads(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf8"))
    if isinstance(data, dict):
        data = data.get("served_ads") or data.get("rows") or []
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected a list of served ads")
    return [row for row in data if isinstance(row, dict)]


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Reconcile Meta ad effective_status into served_ads.")
    p.add_argument("--served-ads", type=Path, required=True, help="JSON list of served_ads rows")
    p.add_argument("--fixture", type=Path, help="JSON map of external_ad_id → platform ad payload")
    p.add_argument("--dry-run", action="store_true", help="print plan only (default without --execute)")
    p.add_argument("--execute", action="store_true", help="PATCH served_ads via PostgREST")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    served = load_served_ads(args.served_ads)

    transport = None
    if args.fixture:
        by_id = json.loads(args.fixture.read_text(encoding="utf8"))
        if not isinstance(by_id, dict):
            raise SystemExit(f"{args.fixture}: fixture must be an object keyed by ad id")

        def transport(method: str, url: str) -> dict[str, Any]:
            ad_id = url.split("?")[0].rstrip("/").rsplit("/", 1)[-1]
            if ad_id not in by_id:
                raise RuntimeError(f"fixture has no row for {ad_id}")
            return by_id[ad_id]

    client = MetaStatusClient(
        dry_run=args.fixture is None and not args.execute,
        transport=transport,
        access_token="fixture" if transport else None,
    )
    planned = plan_updates(served, client)

    written = 0
    if args.execute:
        load_dotenv()
        base_url = env_any(URL_VARS)
        key = env_any(KEY_VARS)
        if not base_url or not key:
            print(
                "poll_status failed: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
                file=sys.stderr,
            )
            return 1
        written = execute(planned["updates"], base_url, key)

    print(
        json.dumps(
            {
                "updates": planned["updates"],
                "skipped": planned["skipped"],
                "unchanged": planned["unchanged"],
                "written": written,
                "executed": bool(args.execute),
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
