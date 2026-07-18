#!/usr/bin/env python3
"""publish_to_supabase.py — push precomputed arc_<id>.json files into the shared
Supabase `arcs` table so they appear LIVE in the demo (no redeploy, no commit).

This is the server-side half of the concierge MVP loop:

    Colab / batch_extract.py  →  arc_<id>.json  →  publish_to_supabase.py  →  arcs table
                                                                              │
                                            demo/app.js  ←  Soma.supabase.fetchArcs()

It writes with the **service_role** key (bypasses row-level security), so it must
run server-side only. NEVER put the service_role key in the browser or commit it.

Auth: read from the environment (nothing is hard-coded except a fallback URL):
    export SUPABASE_URL="https://<project>.supabase.co"        # optional (has a default)
    export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."           # required (dashboard → Settings → API)

Usage:
    python publish_to_supabase.py demo/arcs/hero2.json
    python publish_to_supabase.py "data/arcs/arc_*.json"                 # glob many
    python publish_to_supabase.py arc_nike.json --id nike_winter --title "Nike — Winter 30s"
    python publish_to_supabase.py "data/arcs/arc_*.json" --dataset tvsum --run-id run7
    python publish_to_supabase.py demo/arcs/*.json --dry-run             # print, don't send

Stdlib only (urllib) — no pip install, so it runs anywhere the arcs land
(including a bare Colab cell).
"""
import argparse
import glob
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://jfjztzdnoybhfgbgljjh.supabase.co"


def load_arc(path):
    with open(path, "r") as f:
        return json.load(f)


def derive_id(arc, path, override):
    if override:
        return override
    vid = (arc.get("video_id") or arc.get("id") or "").strip()
    if vid:
        return vid
    stem = os.path.splitext(os.path.basename(path))[0]
    # arc_<id>.json -> <id>; otherwise the filename stem
    return stem[4:] if stem.startswith("arc_") else stem


def derive_title(arc, ad_id, override):
    if override:
        return override
    return arc.get("title") or ad_id.replace("_", " ")


def build_meta(arc, args):
    """The `meta` jsonb — provenance + evidence tier, never fabricated numbers."""
    meta = {
        "model": "TRIBE v2 (Meta, public, Algonauts-2025 winner)",
        "feature": arc.get("feature"),
        "duration_sec": arc.get("duration_sec"),
        "precomputed": bool(arc.get("precomputed", False)),
        "source": args.source,
    }
    if args.dataset:
        meta["dataset"] = args.dataset
    if args.run_id:
        meta["run_id"] = args.run_id
    # carry the arc's own honesty ladder through so the demo can badge correctly
    if isinstance(arc.get("claim"), dict):
        meta["claim"] = arc["claim"]
    att = arc.get("attention") or {}
    if att.get("status"):
        meta["attention_status"] = att["status"]
    aff = arc.get("affect") or {}
    if aff.get("status"):
        meta["affect_status"] = aff["status"]
    return {k: v for k, v in meta.items() if v is not None}


def upsert(url, key, row, dry_run):
    """Upsert one arc row on the `ad_id` unique key. service_role can read the
    conflicting row, so merge-duplicates (a real upsert) is fine here."""
    endpoint = url.rstrip("/") + "/rest/v1/arcs?on_conflict=ad_id"
    body = json.dumps(row).encode("utf-8")
    if dry_run:
        print("  [dry-run] would POST", endpoint)
        print("  [dry-run] row:", json.dumps({**row, "arc": "<%d keys>" % len(row["arc"])}))
        return True
    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)   # service_role bearer → bypasses RLS
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
    try:
        with urllib.request.urlopen(req) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")[:400]
        except Exception:
            pass
        print("  ! HTTP %s — %s" % (e.code, detail), file=sys.stderr)
        return False
    except urllib.error.URLError as e:
        print("  ! network error — %s" % e.reason, file=sys.stderr)
        return False


def main():
    ap = argparse.ArgumentParser(description="Publish arc_<id>.json files to the Supabase `arcs` table.")
    ap.add_argument("paths", nargs="+", help="arc JSON file(s) or glob(s), e.g. 'data/arcs/arc_*.json'")
    ap.add_argument("--id", help="override ad_id (only valid with a single file)")
    ap.add_argument("--title", help="override title (only valid with a single file)")
    ap.add_argument("--dataset", help="tag meta.dataset (e.g. tvsum, hero-ads)")
    ap.add_argument("--run-id", help="tag meta.run_id for provenance")
    ap.add_argument("--source", default="pipeline", help="tag meta.source (default: pipeline)")
    ap.add_argument("--private", action="store_true", help="set is_public=false (hidden from the public demo)")
    ap.add_argument("--url", default=os.environ.get("SUPABASE_URL", DEFAULT_URL), help="Supabase project URL")
    ap.add_argument("--dry-run", action="store_true", help="print what would be sent; do not POST")
    args = ap.parse_args()

    # expand globs (shells may or may not have expanded them)
    files = []
    for pat in args.paths:
        hits = sorted(glob.glob(pat))
        files.extend(hits if hits else ([pat] if os.path.exists(pat) else []))
    files = list(dict.fromkeys(files))  # de-dup, preserve order
    if not files:
        print("No matching arc files.", file=sys.stderr)
        return 2
    if args.id and len(files) > 1:
        print("--id can only be used with a single file.", file=sys.stderr)
        return 2
    if args.title and len(files) > 1:
        print("--title can only be used with a single file.", file=sys.stderr)
        return 2

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key and not args.dry_run:
        print("SUPABASE_SERVICE_ROLE_KEY is not set.\n"
              "  Get it from Supabase → Settings → API → service_role (secret), then:\n"
              "    export SUPABASE_SERVICE_ROLE_KEY='sb_secret_...'\n"
              "  (Use --dry-run to preview without a key.)", file=sys.stderr)
        return 2

    print("Publishing %d arc(s) → %s/rest/v1/arcs%s" % (len(files), args.url, "  [DRY RUN]" if args.dry_run else ""))
    ok = 0
    for path in files:
        try:
            arc = load_arc(path)
        except Exception as e:
            print("  ✗ %s — could not read (%s)" % (path, e), file=sys.stderr)
            continue
        ad_id = derive_id(arc, path, args.id)
        title = derive_title(arc, ad_id, args.title)
        row = {
            "ad_id": ad_id,
            "title": title,
            "arc": arc,
            "meta": build_meta(arc, args),
            "is_public": not args.private,
        }
        if upsert(args.url, key, row, args.dry_run):
            print("  ✓ %s  →  ad_id=%s  \"%s\"%s" % (path, ad_id, title, "" if row["is_public"] else "  (private)"))
            ok += 1
        else:
            print("  ✗ %s  (ad_id=%s) failed" % (path, ad_id), file=sys.stderr)

    print("Done: %d/%d published." % (ok, len(files)))
    return 0 if ok == len(files) else 1


if __name__ == "__main__":
    sys.exit(main())
