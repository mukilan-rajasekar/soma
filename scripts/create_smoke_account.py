#!/usr/bin/env python3
"""
create_smoke_account.py — mint a throwaway SOMA_SMOKE_* account against live Auth.

Two modes:

  1. Service role (preferred). Needs SUPABASE_SECRET_KEY in .env. Creates a
     pre-confirmed user via /auth/v1/admin/users — no inbox, no rate limit on the
     built-in mailer. Same path scripts/seed_review_data.py already uses.

  2. Public signup + disposable inbox. Uses the publishable anon key and mail.tm.
     Waits out over_email_send_rate_limit (built-in mailer is ~2/hour), then
     follows the confirmation link. Use when the secret key is not available.

Writes /tmp/smoke-creds-ready.json and prints export lines for SOMA_SMOKE_EMAIL /
SOMA_SMOKE_PASSWORD. Does not commit credentials anywhere.

Usage:
    ./.venv/bin/python scripts/create_smoke_account.py
    ./.venv/bin/python scripts/create_smoke_account.py --public   # force inbox path
"""

from __future__ import annotations

import argparse
import html as htmllib
import json
import os
import re
import secrets
import string
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.ingest_partner_ad import env_any, load_dotenv  # noqa: E402

OUT = Path("/tmp/smoke-creds-ready.json")
CONFIRM_URL_FILE = Path("/tmp/smoke-confirm-url.txt")


def http_json(url: str, *, data=None, headers=None, method: str | None = None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"raw": raw[:400]}
        return e.code, body


def strong_password(prefix: str = "SomaSmoke") -> str:
    alphabet = string.ascii_letters + string.digits
    return f"{prefix}-{''.join(secrets.choice(alphabet) for _ in range(16))}!"


def create_via_admin(url: str, secret: str, email: str, password: str) -> dict:
    status, body = http_json(
        f"{url.rstrip('/')}/auth/v1/admin/users",
        data=json.dumps(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"smoke": True, "full_name": "Smoke Gate"},
            }
        ).encode(),
        headers={
            "apikey": secret,
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    if status not in (200, 201) or not body or not body.get("id"):
        raise RuntimeError(f"admin create failed {status}: {body}")
    return body


def create_via_public(url: str, anon: str) -> tuple[str, str, dict]:
    print("creating mail.tm inbox…", flush=True)
    st, domains = http_json("https://api.mail.tm/domains")
    if st != 200:
        raise RuntimeError(f"mail.tm domains failed: {st} {domains}")
    domain = domains["hydra:member"][0]["domain"]
    # mail.tm rejects dots in the local part on some domains; keep it alnum-only.
    local = "somasmoke" + "".join(
        secrets.choice(string.ascii_lowercase + string.digits) for _ in range(10)
    )
    email = f"{local}@{domain}"
    mail_pass = strong_password("Mail")
    st, created = http_json(
        "https://api.mail.tm/accounts",
        data=json.dumps({"address": email, "password": mail_pass}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    if st not in (200, 201):
        raise RuntimeError(f"mail.tm account failed: {st} {created}")
    st, token_body = http_json(
        "https://api.mail.tm/token",
        data=json.dumps({"address": email, "password": mail_pass}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    if st != 200 or not token_body or "token" not in token_body:
        raise RuntimeError(f"mail.tm token failed: {st} {token_body}")
    mail_token = token_body["token"]
    print(f"inbox {email}", flush=True)

    password = strong_password()
    print("polling /auth/v1/signup (waits out email rate limit)…", flush=True)
    signup_body = None
    for _ in range(50):
        st, body = http_json(
            f"{url.rstrip('/')}/auth/v1/signup",
            data=json.dumps({"email": email, "password": password}).encode(),
            headers={
                "apikey": anon,
                "Authorization": f"Bearer {anon}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        code = (body or {}).get("error_code") or (body or {}).get("msg")
        print(time.strftime("%H:%M:%S"), "signup", st, code or "ok", flush=True)
        if st in (200, 201) and body and body.get("user"):
            signup_body = body
            break
        if st == 429 or (body or {}).get("error_code") == "over_email_send_rate_limit":
            time.sleep(300)
            continue
        raise RuntimeError(f"signup failed {st}: {body}")
    else:
        raise RuntimeError("gave up waiting for email rate limit")

    session = signup_body.get("session") or {}
    if signup_body.get("access_token") or session.get("access_token"):
        print("session returned — email confirmation is OFF", flush=True)
        return email, password, {"signup": signup_body, "confirmed": True}

    print("waiting for confirmation email…", flush=True)
    confirm_url = None
    for _ in range(60):
        st, msgs = http_json(
            "https://api.mail.tm/messages",
            headers={"Authorization": f"Bearer {mail_token}"},
        )
        members = (msgs or {}).get("hydra:member") or []
        print(time.strftime("%H:%M:%S"), f"inbox={len(members)}", flush=True)
        for m in members:
            st, full = http_json(
                f"https://api.mail.tm/messages/{m['id']}",
                headers={"Authorization": f"Bearer {mail_token}"},
            )
            text = f"{full.get('text') or ''}\n{full.get('html') or ''}"
            for link in re.findall(r"https?://[^\s\"'<>]+", text):
                link = htmllib.unescape(link).rstrip(").,]\"'")
                if any(
                    s in link
                    for s in (
                        "usesoma.work",
                        "supabase.co",
                        "auth/v1/verify",
                        "callback",
                        "token=",
                        "type=signup",
                    )
                ):
                    confirm_url = link
                    break
            if confirm_url:
                break
        if confirm_url:
            break
        time.sleep(10)
    else:
        raise RuntimeError("confirmation email never arrived")

    CONFIRM_URL_FILE.write_text(confirm_url)
    print(f"confirm link: {confirm_url[:140]}…", flush=True)
    return email, password, {
        "signup": {"user": signup_body.get("user")},
        "confirm_url": confirm_url,
        "confirmed": "pending",
    }


def confirm_with_playwright(confirm_url: str) -> None:
    """Follow the emailed link in a real browser so PKCE / cookies work."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(confirm_url, wait_until="networkidle", timeout=60000)
        # Land on /dashboard or /sign-in after callback.
        page.wait_for_timeout(2000)
        final = page.url
        print(f"confirm landed on {final}", flush=True)
        browser.close()
        if "/sign-in?error=" in final:
            raise RuntimeError(f"confirmation failed: {final}")


def verify_password_login(url: str, anon: str, email: str, password: str) -> dict:
    st, body = http_json(
        f"{url.rstrip('/')}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={
            "apikey": anon,
            "Authorization": f"Bearer {anon}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    if st != 200 or not body or not body.get("access_token"):
        raise RuntimeError(f"password login failed {st}: {body}")
    return body


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--public", action="store_true", help="force disposable-inbox path")
    ap.add_argument(
        "--email",
        default=None,
        help="admin-path email (default: soma.smoke.<stamp>@usesoma.work)",
    )
    ap.add_argument("--password", default=None, help="admin-path password")
    ap.add_argument("--skip-confirm-browse", action="store_true")
    args = ap.parse_args()

    load_dotenv()
    url = env_any(("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"))
    anon = env_any(("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"))
    secret = env_any(("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"))
    if not url:
        # Fall back to the public project captured from production.
        pub = Path("/tmp/supabase-public.json")
        if pub.exists():
            cfg = json.loads(pub.read_text())
            url = cfg["url"]
            anon = anon or cfg["anon"]
    if not url or not anon:
        sys.exit("Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or /tmp/supabase-public.json).")

    if secret and not args.public:
        email = args.email or f"soma.smoke.{int(time.time())}@usesoma.work"
        password = args.password or strong_password()
        print(f"creating confirmed user via admin API: {email}", flush=True)
        user = create_via_admin(url, secret, email, password)
        payload = {"email": email, "password": password, "user": user, "confirmed": True, "via": "admin"}
    else:
        if not secret:
            print("no SUPABASE_SECRET_KEY — using public signup + mail.tm", flush=True)
        email, password, meta = create_via_public(url, anon)
        payload = {"email": email, "password": password, **meta, "via": "public"}
        if payload.get("confirmed") == "pending" and not args.skip_confirm_browse:
            confirm_with_playwright(payload["confirm_url"])
            payload["confirmed"] = True

    print("verifying password grant…", flush=True)
    token = verify_password_login(url, anon, email, password)
    payload["login_ok"] = True
    payload["user_id"] = (token.get("user") or {}).get("id")
    OUT.write_text(json.dumps(payload, indent=2))
    # Append to local gitignored env for this agent session only.
    env_path = ROOT / ".env"
    lines = []
    if env_path.exists():
        lines = [
            ln
            for ln in env_path.read_text().splitlines()
            if not ln.startswith("SOMA_SMOKE_")
        ]
    lines.append(f"SOMA_SMOKE_EMAIL={email}")
    lines.append(f"SOMA_SMOKE_PASSWORD={password}")
    env_path.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT}", flush=True)
    print(f"appended SOMA_SMOKE_* to {env_path}", flush=True)
    print()
    print(f"export SOMA_SMOKE_EMAIL={email}")
    print(f"export SOMA_SMOKE_PASSWORD={password}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
