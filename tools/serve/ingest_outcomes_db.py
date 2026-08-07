#!/usr/bin/env python3
"""
ingest_outcomes_db.py - write validated outcome rows into the live outcomes table.

ingest_outcomes_csv.py validates and normalizes; this module is the missing sink. It
resolves each row's (platform, external_ad_id) to a served_ads id, refuses rows whose
resolved brand disagrees with the CSV's claimed brand, and POSTs to PostgREST with the
service key - the same stdlib-urllib approach and env names publish_to_supabase.py uses
(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, with the Next runtime's names as fallbacks).

Dry-run by default. Without --execute nothing leaves the machine: the plan is printed
with per-row dispositions (insert / skip and why) so an operator can read exactly what a
re-run with --execute will do. Duplicate rows (the 0012 unique key) are ignored by the
database, not detected here - append-only tables make re-ingest idempotent by design.
"""

from __future__ import annotations

import argparse
import json
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
from tools.serve.ingest_outcomes_csv import parse_csv  # noqa: E402

# Columns 0012 actually has, in migration order. Anything else the normalizer carries
# (brand_id, platform, external_ad_account_id, external_ad_id) is routing, not data,
# and travels only inside `raw`.
OUTCOME_COLUMNS = (
    "window_start", "window_end", "attribution",
    "impressions", "reach", "frequency", "spend_micros", "currency", "clicks",
    "video_p25", "video_p50", "video_p75", "video_p100", "thruplays",
    "conversions", "conversion_value_micros",
    "source", "pulled_at", "revision", "raw",
)


def _default_http(method: str, url: str, key: str, payload: Any | None = None) -> Any:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        # Idempotent re-ingest: the 0012 unique key decides, not client-side bookkeeping.
        "Prefer": "resolution=ignore-duplicates,return=representation",
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


def resolve_served_ad(
    base_url: str, key: str, *, platform: str, external_ad_id: str,
    http: Callable = _default_http,
) -> dict[str, Any] | None:
    query = urllib.parse.urlencode(
        {
            "select": "id,brand_id",
            "platform": f"eq.{platform}",
            "external_ad_id": f"eq.{external_ad_id}",
        }
    )
    rows = http("GET", f"{base_url.rstrip('/')}/rest/v1/served_ads?{query}", key)
    return rows[0] if rows else None


def plan(rows: list[dict[str, Any]], base_url: str, key: str, *, http: Callable = _default_http) -> dict[str, Any]:
    inserts, skipped = [], []
    for row in rows:
        external_ad_id = str(row.get("external_ad_id") or "")
        if not external_ad_id:
            skipped.append({"row": row, "reason": "no external_ad_id; cannot resolve a served_ad"})
            continue
        served = resolve_served_ad(
            base_url, key, platform=str(row["platform"]), external_ad_id=external_ad_id, http=http
        )
        if served is None:
            skipped.append({"row": row, "reason": f"no served_ad for ({row['platform']}, {external_ad_id})"})
            continue
        if str(served.get("brand_id") or "") != str(row.get("brand_id") or ""):
            # A CSV claiming another brand's ad is an integrity failure, not a skip: the
            # whole file is suspect and an operator has to look at it.
            raise RuntimeError(
                f"brand mismatch for ({row['platform']}, {external_ad_id}): "
                f"csv says {row.get('brand_id')}, served_ads says {served.get('brand_id')}"
            )
        record = {k: row[k] for k in OUTCOME_COLUMNS if k in row and row[k] is not None}
        record["served_ad_id"] = served["id"]
        inserts.append(record)
    return {"inserts": inserts, "skipped": skipped}


def execute(inserts: list[dict[str, Any]], base_url: str, key: str, *, http: Callable = _default_http) -> int:
    if not inserts:
        return 0
    on_conflict = "served_ad_id,window_start,window_end,attribution,source,pulled_at"
    written = http(
        "POST",
        f"{base_url.rstrip('/')}/rest/v1/outcomes?on_conflict={urllib.parse.quote(on_conflict)}",
        key,
        inserts,
    )
    return len(written) if isinstance(written, list) else 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Ingest a validated outcomes CSV into the live database.")
    p.add_argument("csv", type=Path, help="outcomes CSV (see ingest_outcomes_csv.py for columns)")
    p.add_argument("--execute", action="store_true", help="actually write; default is a printed plan")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    load_dotenv()
    base_url = env_any(URL_VARS)
    key = env_any(KEY_VARS)
    if not base_url or not key:
        print(
            "ingest failed: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env "
            "(the Next runtime's NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY also work)",
            file=sys.stderr,
        )
        return 1
    try:
        rows = parse_csv(args.csv)
        planned = plan(rows, base_url, key)
        if args.execute:
            written = execute(planned["inserts"], base_url, key)
        else:
            written = 0
    except Exception as exc:
        print(f"ingest failed: {exc}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "rows": len(rows),
                "planned_inserts": len(planned["inserts"]),
                "skipped": [s["reason"] for s in planned["skipped"]],
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
