#!/usr/bin/env python3
"""
Meta Marketing API heartbeat for Full-tier access farming.

This is deliberately a tiny read-only call, not an ad-serving worker. It exists so a
systemd timer can make low-risk Marketing API traffic while Soma waits on the access
gates named in docs/strategy/BUILD-PLAN-FULL-SERVICE.md.

Shape on the box:

    # /etc/systemd/system/soma-serve-heartbeat.service
    [Service]
    Type=oneshot
    WorkingDirectory=/opt/soma
    EnvironmentFile=/opt/soma/.env
    ExecStart=/opt/soma/.venv/bin/python tools/serve/heartbeat.py

    # /etc/systemd/system/soma-serve-heartbeat.timer
    [Timer]
    OnBootSec=5m
    OnUnitActiveSec=30m
    Persistent=true

    [Install]
    WantedBy=timers.target

Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID is a skip, not a failure, so the repo
gate can run on machines that have no Meta credentials.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main() -> int:
    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    account = os.environ.get("META_AD_ACCOUNT_ID", "").strip()
    if not token or not account:
        print("✓ serve heartbeat skipped: META_ACCESS_TOKEN and META_AD_ACCOUNT_ID are not set")
        return 0

    graph_version = os.environ.get("META_GRAPH_VERSION", "v24.0").strip() or "v24.0"
    account_id = account if account.startswith("act_") else f"act_{account}"
    params = urllib.parse.urlencode(
        {
            "access_token": token,
            "fields": "impressions,spend",
            "date_preset": "yesterday",
            "limit": "1",
        }
    )
    url = f"https://graph.facebook.com/{graph_version}/{account_id}/insights?{params}"

    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            payload = json.loads(response.read().decode("utf8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf8", errors="replace")[:500]
        print(f"✗ serve heartbeat failed: HTTP {exc.code}\n  {body}")
        return 1
    except (OSError, json.JSONDecodeError) as exc:
        print(f"✗ serve heartbeat failed: {exc}")
        return 1

    rows = len(payload.get("data", [])) if isinstance(payload, dict) else 0
    print(f"✓ serve heartbeat ok: {account_id} insights returned {rows} row(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
