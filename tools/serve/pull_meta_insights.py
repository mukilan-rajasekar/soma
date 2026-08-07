#!/usr/bin/env python3
"""
pull_meta_insights.py - account-level async Meta Insights → outcome-shaped rows.

BUILD-PLAN §4.4: do not GET /{ad-id}/insights once per served ad. One async report on
the ad account, poll the run id, then normalize. Exponential backoff prefers Meta's
X-Business-Use-Case-Usage estimated_time_to_regain_access over a fixed sleep.

Dry-run / fixture by default. Live Graph reads need META_ACCESS_TOKEN +
META_AD_ACCOUNT_ID; they do not need SOMA_SERVE_LIVE (this is ads_read, not a write).
Writing into outcomes still goes through ingest_outcomes_db with --execute.

    .venv/bin/python tools/serve/pull_meta_insights.py \\
        --served-ads tools/serve/fixtures/served_ads_meta.json \\
        --since 2026-08-01 --until 2026-08-02 \\
        --attribution 7d_click \\
        --fixture tools/serve/fixtures/meta_insights_async.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SOURCE = "meta_insights_api"

# Fields Meta returns as currency strings / action lists; everything else stays in raw.
DEFAULT_FIELDS = (
    "ad_id,ad_name,impressions,reach,frequency,spend,clicks,"
    "actions,action_values,"
    "video_p25_watched_actions,video_p50_watched_actions,"
    "video_p75_watched_actions,video_p100_watched_actions,"
    "video_thruplay_watched_actions"
)


def _clean_account(value: str) -> str:
    value = (value or "").strip()
    return value if value.startswith("act_") else f"act_{value}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_usage_header(header: str | None) -> dict[str, Any]:
    """Pick the worst estimated_time_to_regain_access from X-Business-Use-Case-Usage."""
    if not header:
        return {}
    try:
        payload = json.loads(header)
    except json.JSONDecodeError:
        return {}
    worst = 0
    call_count = 0
    if isinstance(payload, dict):
        for entries in payload.values():
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                call_count = max(call_count, int(entry.get("call_count") or 0))
                worst = max(worst, int(entry.get("estimated_time_to_regain_access") or 0))
    return {"estimated_time_to_regain_access": worst, "call_count": call_count}


def next_backoff_s(usage: dict[str, Any], attempt: int, *, base: float = 1.0, cap: float = 60.0) -> float:
    regain = float(usage.get("estimated_time_to_regain_access") or 0)
    if regain > 0:
        return regain
    return min(base * (2 ** attempt), cap)


def _action_value(actions: Any, action_types: tuple[str, ...]) -> int | None:
    total = _action_float(actions, action_types)
    return int(total) if total is not None else None


def _action_float(actions: Any, action_types: tuple[str, ...]) -> float | None:
    if not isinstance(actions, list):
        return None
    total = 0.0
    found = False
    for item in actions:
        if not isinstance(item, dict):
            continue
        if item.get("action_type") in action_types:
            try:
                total += float(item.get("value") or 0)
                found = True
            except (TypeError, ValueError):
                continue
    return total if found else None


def spend_to_micros(spend: Any) -> int | None:
    if spend is None or spend == "":
        return None
    try:
        return int(round(float(spend) * 1_000_000))
    except (TypeError, ValueError):
        return None


def normalize_insight_row(
    row: dict[str, Any],
    *,
    brand_id: str,
    external_ad_account_id: str,
    window_start: str,
    window_end: str,
    attribution: str,
    currency: str,
    pulled_at: str | None = None,
) -> dict[str, Any]:
    """Map one Meta ad-level insights row into the CSV/DB outcome shape."""
    if not attribution:
        raise ValueError("attribution is required for meta_insights_api")
    ad_id = str(row.get("ad_id") or "").strip()
    if not ad_id:
        raise ValueError("insights row is missing ad_id")

    impressions = row.get("impressions")
    clicks = row.get("clicks")
    reach = row.get("reach")
    frequency = row.get("frequency")

    conversions = _action_value(
        row.get("actions"),
        ("offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"),
    )
    conversion_value = _action_float(
        row.get("action_values"),
        ("offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"),
    )
    conversion_value_micros = (
        int(round(conversion_value * 1_000_000)) if conversion_value is not None else None
    )

    normalized: dict[str, Any] = {
        "brand_id": brand_id,
        "platform": "meta",
        "external_ad_account_id": _clean_account(external_ad_account_id),
        "external_ad_id": ad_id,
        "window_start": window_start,
        "window_end": window_end,
        "attribution": attribution,
        "impressions": int(impressions) if impressions not in (None, "") else None,
        "reach": int(reach) if reach not in (None, "") else None,
        "frequency": float(frequency) if frequency not in (None, "") else None,
        "spend_micros": spend_to_micros(row.get("spend")),
        "currency": currency.upper(),
        "clicks": int(clicks) if clicks not in (None, "") else None,
        "video_p25": _action_value(row.get("video_p25_watched_actions"), ("video_view",)),
        "video_p50": _action_value(row.get("video_p50_watched_actions"), ("video_view",)),
        "video_p75": _action_value(row.get("video_p75_watched_actions"), ("video_view",)),
        "video_p100": _action_value(row.get("video_p100_watched_actions"), ("video_view",)),
        "thruplays": _action_value(row.get("video_thruplay_watched_actions"), ("video_view",)),
        "conversions": conversions,
        "conversion_value_micros": conversion_value_micros,
        "source": SOURCE,
        "pulled_at": pulled_at or _now_iso(),
        "revision": 1,
        "raw": row,
    }
    # Required by ingest_outcomes_csv for any write path that reuses that validator.
    for required in ("impressions", "spend_micros", "clicks"):
        if normalized[required] is None:
            raise ValueError(f"insights row {ad_id} is missing {required}")
    return normalized


class MetaInsightsClient:
    """Async Insights job client. Injectable transport for tests; dry_run records posts."""

    def __init__(
        self,
        *,
        access_token: str | None = None,
        ad_account_id: str | None = None,
        api_version: str | None = None,
        dry_run: bool = False,
        sleep: Callable[[float], None] = time.sleep,
        transport: Callable[..., tuple[dict[str, Any], dict[str, str]]] | None = None,
    ):
        self.access_token = access_token or os.environ.get("META_ACCESS_TOKEN", "").strip()
        self.ad_account_id = _clean_account(
            ad_account_id or os.environ.get("META_AD_ACCOUNT_ID", "")
        )
        self.api_version = (
            api_version
            or os.environ.get("META_API_VERSION")
            or os.environ.get("META_GRAPH_VERSION")
            or "v21.0"
        )
        self.dry_run = dry_run
        self.sleep = sleep
        self.transport = transport or self._default_transport
        self.calls: list[dict[str, Any]] = []
        if not self.dry_run and (not self.access_token or not self.ad_account_id.strip("act_")):
            raise RuntimeError("Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID, or pass dry_run=True.")

    def _url(self, path: str) -> str:
        return f"https://graph.facebook.com/{self.api_version}/{path.lstrip('/')}"

    def _default_transport(
        self, method: str, url: str, payload: dict[str, Any] | None = None
    ) -> tuple[dict[str, Any], dict[str, str]]:
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        body = dict(payload or {})
        body["access_token"] = self.access_token
        data = urllib.parse.urlencode(
            {k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in body.items()}
        ).encode("utf-8")
        if method == "GET":
            sep = "&" if "?" in url else "?"
            req = urllib.request.Request(
                f"{url}{sep}{urllib.parse.urlencode({'access_token': self.access_token})}",
                method="GET",
            )
        else:
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
                hdrs = {k: v for k, v in resp.headers.items()}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            raise RuntimeError(f"Meta {method} {url} -> {exc.code}: {detail}") from None
        return (json.loads(raw) if raw else {}), hdrs

    def request(
        self, method: str, path_or_url: str, payload: dict[str, Any] | None = None, *, absolute: bool = False
    ) -> tuple[dict[str, Any], dict[str, str]]:
        url = path_or_url if absolute else self._url(path_or_url)
        self.calls.append({"method": method, "url": url, "payload": payload or {}})
        if self.dry_run and self.transport is self._default_transport:
            # Pure dry-run without an injected transport: invent a completed empty job.
            if method == "POST":
                return {"report_run_id": f"dry_{len(self.calls)}"}, {}
            if method == "GET" and url.rstrip("/").endswith("/insights"):
                return {"data": []}, {}
            return {
                "id": url.rsplit("/", 1)[-1],
                "async_status": "Job Completed",
                "async_percent_completion": 100,
            }, {}
        return self.transport(method, url, payload)

    def start_async_report(
        self,
        *,
        since: str,
        until: str,
        fields: str = DEFAULT_FIELDS,
        level: str = "ad",
        filtering: list[dict[str, Any]] | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "level": level,
            "fields": fields,
            "time_range": {"since": since, "until": until},
            "time_increment": 1,
            "async": "true",
        }
        if filtering:
            payload["filtering"] = filtering
        body, headers = self.request("POST", f"{self.ad_account_id}/insights", payload)
        usage = parse_usage_header(headers.get("X-Business-Use-Case-Usage") or headers.get("x-business-use-case-usage"))
        if usage.get("estimated_time_to_regain_access"):
            self.sleep(next_backoff_s(usage, 0))
        run_id = body.get("report_run_id") or body.get("id")
        if not run_id:
            raise RuntimeError(f"async insights start returned no report_run_id: {body!r}")
        return str(run_id)

    def poll_report(
        self,
        run_id: str,
        *,
        max_attempts: int = 12,
    ) -> dict[str, Any]:
        for attempt in range(max_attempts):
            body, headers = self.request("GET", run_id)
            usage = parse_usage_header(
                headers.get("X-Business-Use-Case-Usage") or headers.get("x-business-use-case-usage")
            )
            status = str(body.get("async_status") or body.get("async_percent_completion") or "")
            if status == "Job Completed" or body.get("async_percent_completion") == 100:
                return body
            if status in {"Job Failed", "Job Skipped"}:
                raise RuntimeError(f"async insights job {run_id} failed: {body!r}")
            self.sleep(next_backoff_s(usage, attempt))
        raise RuntimeError(f"async insights job {run_id} did not complete in {max_attempts} polls")

    def fetch_report_rows(self, run_id: str) -> list[dict[str, Any]]:
        body, _headers = self.request("GET", f"{run_id}/insights")
        data = body.get("data")
        if not isinstance(data, list):
            raise RuntimeError(f"insights result for {run_id} has no data list: {body!r}")
        return [row for row in data if isinstance(row, dict)]

    def pull_ad_insights(
        self,
        *,
        since: str,
        until: str,
        ad_ids: list[str] | None = None,
        fields: str = DEFAULT_FIELDS,
    ) -> list[dict[str, Any]]:
        filtering = None
        if ad_ids:
            filtering = [{"field": "ad.id", "operator": "IN", "value": ad_ids}]
        run_id = self.start_async_report(since=since, until=until, fields=fields, filtering=filtering)
        self.poll_report(run_id)
        return self.fetch_report_rows(run_id)


def load_served_ads(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf8"))
    if isinstance(data, dict):
        data = data.get("served_ads") or data.get("rows") or []
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected a list of served ads")
    return [row for row in data if isinstance(row, dict)]


def fixture_transport(sequence: list[dict[str, Any]]) -> Callable[..., tuple[dict[str, Any], dict[str, str]]]:
    """Return a transport that walks a canned response list (body + optional headers)."""
    state = {"i": 0}

    def _transport(method: str, url: str, payload: dict[str, Any] | None = None):
        if state["i"] >= len(sequence):
            raise RuntimeError(f"fixture exhausted at {method} {url}")
        step = sequence[state["i"]]
        state["i"] += 1
        expected = step.get("expect")
        if expected:
            if expected.get("method") and expected["method"] != method:
                raise RuntimeError(f"fixture expected {expected['method']}, got {method}")
            if expected.get("url_contains") and expected["url_contains"] not in url:
                raise RuntimeError(f"fixture expected url containing {expected['url_contains']!r}, got {url}")
        return step.get("body") or {}, step.get("headers") or {}

    return _transport


def rows_for_served_ads(
    insights: list[dict[str, Any]],
    served_ads: list[dict[str, Any]],
    *,
    window_start: str,
    window_end: str,
    attribution: str,
    currency: str,
    pulled_at: str | None = None,
) -> list[dict[str, Any]]:
    """Join Meta rows to served_ads on external_ad_id; skip unmatched with no raise."""
    by_external = {
        str(row["external_ad_id"]): row
        for row in served_ads
        if row.get("external_ad_id") and row.get("platform", "meta") == "meta"
    }
    out: list[dict[str, Any]] = []
    for raw in insights:
        ad_id = str(raw.get("ad_id") or "").strip()
        served = by_external.get(ad_id)
        if not served:
            continue
        out.append(
            normalize_insight_row(
                raw,
                brand_id=str(served["brand_id"]),
                external_ad_account_id=str(
                    served.get("external_ad_account_id") or served.get("ad_account_id") or ""
                ),
                window_start=window_start,
                window_end=window_end,
                attribution=attribution,
                currency=currency,
                pulled_at=pulled_at,
            )
        )
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Pull Meta async Insights into outcome-shaped JSON.")
    p.add_argument("--served-ads", type=Path, required=True, help="JSON list of served_ads rows")
    p.add_argument("--since", required=True, help="YYYY-MM-DD inclusive")
    p.add_argument("--until", required=True, help="YYYY-MM-DD inclusive")
    p.add_argument("--attribution", required=True, help="e.g. 7d_click — required for API source")
    p.add_argument("--currency", default="USD")
    p.add_argument("--pulled-at", default=None, help="override pulled_at ISO timestamp")
    p.add_argument("--fixture", type=Path, help="canned async response sequence (implies dry-run transport)")
    p.add_argument("--dry-run", action="store_true", help="do not hit Meta; empty result unless --fixture")
    p.add_argument("--out", type=Path, help="write normalized outcome rows as JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    served = load_served_ads(args.served_ads)
    ad_ids = [
        str(row["external_ad_id"])
        for row in served
        if row.get("external_ad_id") and row.get("platform", "meta") == "meta"
    ]
    if not ad_ids:
        print("no meta served ads with external_ad_id", file=sys.stderr)
        return 1

    transport = None
    if args.fixture:
        sequence = json.loads(args.fixture.read_text(encoding="utf8"))
        if not isinstance(sequence, list):
            raise SystemExit(f"{args.fixture}: fixture must be a JSON list of steps")
        transport = fixture_transport(sequence)

    account = next(
        (
            str(row.get("external_ad_account_id") or "")
            for row in served
            if row.get("external_ad_account_id")
        ),
        os.environ.get("META_AD_ACCOUNT_ID", ""),
    )
    if transport is not None:
        client = MetaInsightsClient(
            access_token="fixture",
            ad_account_id=account or "act_0",
            dry_run=False,
            transport=transport,
        )
    else:
        client = MetaInsightsClient(
            ad_account_id=account or None,
            dry_run=True if args.dry_run else False,
        )

    raw_rows = client.pull_ad_insights(since=args.since, until=args.until, ad_ids=ad_ids)
    normalized = rows_for_served_ads(
        raw_rows,
        served,
        window_start=args.since,
        window_end=args.until,
        attribution=args.attribution,
        currency=args.currency,
        pulled_at=args.pulled_at,
    )
    payload = {"rows": normalized, "raw_count": len(raw_rows), "matched": len(normalized)}
    text = json.dumps(payload, indent=2, sort_keys=True)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
