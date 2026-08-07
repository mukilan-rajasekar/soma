#!/usr/bin/env python3
"""
run_rescore.py - claim a queued rescore_job and plan (or run) measured verification.

The site only enqueues (src/app/api/edit/rescore/route.ts). This is the box-side half:
atomic claim on status=queued, then either print a plan (--dry-run, the default) or hand
the cut list to tools.edit.search --verify. The GPU call is deliberately behind
--execute so a missing TRIBE stack cannot mark a job done with estimated scores.

Also reaps stale processing claims (BUILD-PLAN §3.2): a hard kill leaves status=processing
forever without claimed_at/attempts bookkeeping. After --stale-minutes the row returns to
queued; after --max-attempts it fails with a customer-readable error.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from publish_to_supabase import KEY_VARS, URL_VARS, env_any, load_dotenv  # noqa: E402

DEFAULT_STALE_MINUTES = 30
DEFAULT_MAX_ATTEMPTS = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat().replace("+00:00", "Z")


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


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


def list_queued(base_url: str, key: str, *, http: Callable = _default_http, limit: int = 10) -> list[dict]:
    query = (
        "select=*&status=eq.queued&order=created_at.asc"
        f"&limit={int(limit)}"
    )
    rows = http("GET", f"{base_url.rstrip('/')}/rest/v1/rescore_jobs?{query}", key)
    return rows if isinstance(rows, list) else []


def claim_oldest_queued(
    base_url: str,
    key: str,
    *,
    http: Callable = _default_http,
    now_iso: str | None = None,
) -> dict[str, Any] | None:
    """Race-safe claim: conditional PATCH on status=queued, same shape as run_batch."""
    stamp = now_iso or _now_iso()
    for row in list_queued(base_url, key, http=http):
        job_id = row["id"]
        attempts = int(row.get("attempts") or 0) + 1
        claimed = http(
            "PATCH",
            f"{base_url.rstrip('/')}/rest/v1/rescore_jobs?"
            f"id=eq.{urllib.parse.quote(str(job_id))}&status=eq.queued",
            key,
            {
                "status": "processing",
                "claimed_at": stamp,
                "started_at": stamp,
                "attempts": attempts,
                "error": None,
            },
        )
        if claimed:
            return claimed[0] if isinstance(claimed, list) else claimed
    return None


def plan_job(job: dict[str, Any]) -> dict[str, Any]:
    """What the worker would verify — no GPU, no filesystem."""
    cut_ids = job.get("cut_ids") or []
    if not isinstance(cut_ids, list):
        cut_ids = []
    return {
        "job_id": job.get("id"),
        "edit_run_id": job.get("edit_run_id"),
        "batch_id": job.get("batch_id"),
        "ad_id": job.get("ad_id"),
        "cut_ids": cut_ids,
        "attempts": job.get("attempts"),
        "action": "verify_cuts" if cut_ids else "verify_edit_run",
        "note": (
            "Hand these cut ids to tools.edit.search --verify on the scorer box. "
            "Estimates must not flip measured=true."
        ),
    }


def list_stale_processing(
    rows: list[dict[str, Any]],
    *,
    now: datetime | None = None,
    stale_minutes: int = DEFAULT_STALE_MINUTES,
) -> list[dict[str, Any]]:
    cutoff = (now or _now()) - timedelta(minutes=stale_minutes)
    stale = []
    for row in rows:
        if row.get("status") != "processing":
            continue
        claimed = _parse_ts(row.get("claimed_at") or row.get("started_at"))
        if claimed is None or claimed <= cutoff:
            stale.append(row)
    return stale


def reap(
    base_url: str,
    key: str,
    *,
    http: Callable = _default_http,
    now: datetime | None = None,
    stale_minutes: int = DEFAULT_STALE_MINUTES,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> dict[str, Any]:
    """Return stale processing jobs to queued, or fail them past max_attempts."""
    query = "select=*&status=eq.processing&order=claimed_at.asc"
    rows = http("GET", f"{base_url.rstrip('/')}/rest/v1/rescore_jobs?{query}", key)
    if not isinstance(rows, list):
        rows = []
    released, failed = [], []
    stamp = (now or _now()).isoformat().replace("+00:00", "Z")
    for row in list_stale_processing(rows, now=now, stale_minutes=stale_minutes):
        attempts = int(row.get("attempts") or 0)
        job_id = urllib.parse.quote(str(row["id"]))
        if attempts >= max_attempts:
            http(
                "PATCH",
                f"{base_url.rstrip('/')}/rest/v1/rescore_jobs?id=eq.{job_id}&status=eq.processing",
                key,
                {
                    "status": "failed",
                    "error": (
                        f"Rescore stopped after {attempts} attempts — the scorer box lost "
                        "the job mid-run. Re-enqueue from the edit page if you still want "
                        "a measured score."
                    ),
                    "completed_at": stamp,
                },
            )
            failed.append(row["id"])
        else:
            http(
                "PATCH",
                f"{base_url.rstrip('/')}/rest/v1/rescore_jobs?id=eq.{job_id}&status=eq.processing",
                key,
                {
                    "status": "queued",
                    "claimed_at": None,
                    "started_at": None,
                    "error": f"reaped stale claim at {stamp}",
                },
            )
            released.append(row["id"])
    return {"released": released, "failed": failed}


def mark_done(
    base_url: str,
    key: str,
    job_id: str,
    *,
    run_log: str = "",
    http: Callable = _default_http,
) -> None:
    http(
        "PATCH",
        f"{base_url.rstrip('/')}/rest/v1/rescore_jobs?id=eq.{urllib.parse.quote(job_id)}",
        key,
        {
            "status": "done",
            "completed_at": _now_iso(),
            "run_log": run_log[-8000:],
            "error": None,
        },
    )


def mark_failed(
    base_url: str,
    key: str,
    job_id: str,
    reason: str,
    *,
    run_log: str = "",
    http: Callable = _default_http,
) -> None:
    http(
        "PATCH",
        f"{base_url.rstrip('/')}/rest/v1/rescore_jobs?id=eq.{urllib.parse.quote(job_id)}",
        key,
        {
            "status": "failed",
            "completed_at": _now_iso(),
            "error": reason,
            "run_log": run_log[-8000:],
        },
    )


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Claim and plan (or reap) a rescore_jobs row.")
    p.add_argument("--reap-only", action="store_true", help="only reclaim stale processing rows")
    p.add_argument("--stale-minutes", type=int, default=DEFAULT_STALE_MINUTES)
    p.add_argument("--max-attempts", type=int, default=DEFAULT_MAX_ATTEMPTS)
    p.add_argument(
        "--claim",
        action="store_true",
        help="atomically claim the oldest queued job and leave it processing",
    )
    p.add_argument(
        "--execute",
        action="store_true",
        help="reserved: measured verify is not wired here yet (refuses)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    load_dotenv()
    base_url = env_any(URL_VARS)
    key = env_any(KEY_VARS)
    if not base_url or not key:
        print(
            "run_rescore failed: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
            file=sys.stderr,
        )
        return 1

    if args.execute:
        print(
            "run_rescore: --execute refuses until tools.edit.search --verify is wired "
            "into this worker. Use --claim to take a job, verify on the box, then PATCH "
            "status=done by hand — never mark measured without a GPU pass.",
            file=sys.stderr,
        )
        return 1

    reaped = reap(
        base_url,
        key,
        stale_minutes=args.stale_minutes,
        max_attempts=args.max_attempts,
    )
    if args.reap_only:
        print(json.dumps({"reaped": reaped}, indent=2, sort_keys=True))
        return 0

    if not args.claim:
        queued = list_queued(base_url, key, limit=1)
        planned = plan_job(queued[0]) if queued else None
        print(
            json.dumps(
                {"next": planned, "reaped": reaped, "claimed": False},
                indent=2,
                sort_keys=True,
            )
        )
        return 0

    job = claim_oldest_queued(base_url, key)
    if job is None:
        print(json.dumps({"claimed": None, "reaped": reaped}, indent=2, sort_keys=True))
        return 0

    planned = plan_job(job)
    planned["status"] = "processing"
    print(json.dumps({"claimed": planned, "reaped": reaped}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
