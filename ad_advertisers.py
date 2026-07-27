#!/usr/bin/env python3
"""
ad_advertisers.py — who is actually behind the ads in data/ads/.

Companion to ad_fetch_bb.py. That script collects creatives; this one answers "whose
ads are these?". It walks the same TikTok Creative Center filter grid, but metadata
only — no video downloads — so it covers EVERY ad the grid can reach (~3k), not just
the subset whose files were pulled down.

Why it re-harvests instead of reading ad_manifest.csv: the manifest's `note` column
only carries a sanitised brand slug, and only for the ads that had one at download
time (~29% coverage, with names mangled to things like `dolce_gabbana` and `_`). The
API response has the clean `brand_name`, `ad_title`, `industry_key` and
`objective_key` per ad, so going back to the source is both more complete and more
accurate.

Outputs (--out data/ads):
  ad_advertisers.csv       one row per ad — advertiser, title, vertical, metrics,
                           which filter slice surfaced it, and whether that ad is
                           already in your corpus (in_corpus=yes/no)
  advertiser_summary.csv   one row per advertiser — ad count, reach across countries
                           and verticals, and CTR spread

USAGE:
  python ad_advertisers.py                 # full grid (~420 slices, one session)
  python ad_advertisers.py --quick         # US/GB/JP only, for a fast look
"""
import argparse
import collections
import csv
import importlib.util
import json
import os
import re
import statistics
import urllib.parse

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))

# Reuse the verified constants + session wrapper rather than duplicating them.
_spec = importlib.util.spec_from_file_location(
    "ad_fetch_bb", os.path.join(REPO_ROOT, "ad_fetch_bb.py"))
afb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(afb)

FILTERS_API = "https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/filters"
PAGE_URL = "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en"


# TikTok writes these into brand_name when the advertiser is not disclosed. They are
# placeholders, not companies — counting them as brands invents an advertiser with
# hundreds of ads and buries the real ones.
PLACEHOLDER_BRANDS = {"not mention", "not mentioned", "none", "n/a", "na", "-", "_",
                      "unknown", "null"}


def normalise_brand(raw):
    """Clean brand_name, or return '' when it carries no real advertiser."""
    name = (raw or "").strip()
    if not name or name.lower() in PLACEHOLDER_BRANDS:
        return ""
    return name


def extract_handle(title):
    """First @handle credited in the ad copy — a usable fallback attribution."""
    m = re.search(r"@([A-Za-z0-9._]{2,30})", title or "")
    return m.group(1).rstrip(".") if m else ""


def build_combos(quick):
    countries = ["US", "GB", "JP"] if quick else afb.TIKTOK_COUNTRIES
    combos = []
    for cc in countries:
        for period in afb.TIKTOK_PERIODS:
            for sort in afb.TIKTOK_SORTS:
                combos.append({"country": cc, "period": period,
                               "order_by": sort, "industry": None})
    for cc in (["US"] if quick else ["US", "GB", "DE", "JP", "BR", "ID"]):
        for ind in afb.TIKTOK_INDUSTRIES:
            for period in ([30] if quick else [30, 180]):
                combos.append({"country": cc, "period": period,
                               "order_by": "ctr", "industry": ind})
    return combos


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=os.path.join(REPO_ROOT, "data", "ads"))
    ap.add_argument("--quick", action="store_true", help="small grid, fast run")
    ap.add_argument("--throttle-ms", type=int, default=600, dest="throttle_ms")
    ap.add_argument("--session-timeout", type=int, default=3000, dest="session_timeout")
    args = ap.parse_args()

    model = afb.load_env()
    combos = build_combos(args.quick)
    print(f"[model] {model}   [slices] {len(combos)}")

    # Which ads are already in the corpus, so the CSV can flag them.
    rows, seen_ids = afb.read_manifest(args.out)
    in_corpus = {t[2:] for t in seen_ids if t.startswith("tt")}
    print(f"[manifest] {len(rows)} rows, {len(in_corpus)} tiktok ids already collected")

    from playwright.sync_api import sync_playwright

    ads, industry_names = {}, {}
    with afb.Session(model, label="advertisers",
                     timeout_s=args.session_timeout) as s:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(s.cdp_url)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            headers = {}

            def on_request(req):
                if "/top_ads/v2/list" in req.url and not headers:
                    headers.update(dict(req.headers))

            page.on("request", on_request)
            page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=90000)
            page.wait_for_timeout(10000)
            if not headers:
                print("[fatal] never saw a signed /list request — page likely blocked.")
                return
            print("[ok] captured signing headers")

            # Industry id -> human name, so the CSV says "Games" not 25000000000.
            try:
                f = page.request.get(FILTERS_API, headers=headers).json()
                for i in (f.get("data") or {}).get("industry") or []:
                    industry_names[str(i.get("id"))] = i.get("value")
                print(f"[ok] {len(industry_names)} industry labels")
            except Exception as e:  # noqa: BLE001
                print(f"[warn] industry labels unavailable: {e!r}")

            ok = bad = 0
            for n, combo in enumerate(combos, 1):
                try:
                    q = {"period": combo["period"], "page": 1,
                         "limit": afb.TIKTOK_MAX_LIMIT,
                         "order_by": combo["order_by"],
                         "country_code": combo["country"]}
                    if combo.get("industry"):
                        q["industry"] = combo["industry"]
                    url = f"{afb.TIKTOK_API}?{urllib.parse.urlencode(q)}"

                    body = page.request.get(url, headers=headers).json()
                    if body.get("code") == 40100:
                        page.wait_for_timeout(args.throttle_ms * 6)
                        body = page.request.get(url, headers=headers).json()
                    page.wait_for_timeout(args.throttle_ms)

                    if body.get("code") != 0:
                        bad += 1
                        continue
                    ok += 1
                    for m in (body.get("data") or {}).get("materials") or []:
                        mid = str(m.get("id") or "")
                        if not mid or mid in ads:
                            continue
                        vi = m.get("video_info") or {}
                        title = (m.get("ad_title") or "").strip()
                        brand = normalise_brand(m.get("brand_name"))
                        handle = extract_handle(title)
                        ads[mid] = {
                            "ad_id": mid,
                            "advertiser": brand or "(unattributed)",
                            # Best available attribution: the declared brand, else an
                            # @handle credited in the ad copy. TikTok leaves brand_name
                            # blank or literally "Not Mention" on ~2/3 of Top Ads, so
                            # without this fallback most rows would say nothing at all.
                            "attribution": brand or (f"@{handle}" if handle else "(unattributed)"),
                            "attribution_source": ("brand_name" if brand
                                                   else "ad_title_handle" if handle
                                                   else "none"),
                            "ad_title": title,
                            "industry": industry_names.get(
                                str(m.get("industry_key") or "").replace("label_", ""),
                                m.get("industry_key") or ""),
                            "objective": m.get("objective_key") or "",
                            "country": combo["country"],
                            "period_days": combo["period"],
                            "surfaced_by": combo["order_by"],
                            "ctr": m.get("ctr"),
                            "likes": m.get("like"),
                            "cost": m.get("cost"),
                            "duration_s": vi.get("duration"),
                            "in_corpus": "yes" if mid in in_corpus else "no",
                        }
                    if n % 50 == 0:
                        print(f"  [{n}/{len(combos)}] {len(ads)} ads, "
                              f"{len({a['advertiser'] for a in ads.values()})} advertisers")
                except Exception as e:  # noqa: BLE001
                    if "closed" in str(e).lower():
                        print(f"  [slice {n}] session ended early — keeping {len(ads)} ads")
                        break
                    bad += 1

            print(f"[grid] {ok} slices OK, {bad} rejected")

    if not ads:
        print("[result] nothing captured.")
        return

    os.makedirs(args.out, exist_ok=True)
    per_ad = os.path.join(args.out, "ad_advertisers.csv")
    cols = ["ad_id", "attribution", "attribution_source", "advertiser", "ad_title",
            "industry", "objective", "country", "period_days", "surfaced_by",
            "ctr", "likes", "cost", "duration_s", "in_corpus"]
    with open(per_ad, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for a in sorted(ads.values(), key=lambda x: (x["attribution"].lower(), x["ad_id"])):
            w.writerow(a)
    print(f"[wrote] {per_ad}  ({len(ads)} ads)")

    # Aggregate per advertiser.
    by = collections.defaultdict(list)
    for a in ads.values():
        by[a["attribution"]].append(a)

    summary = os.path.join(args.out, "advertiser_summary.csv")
    with open(summary, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["attribution", "n_ads", "n_in_corpus", "countries", "industries",
                    "mean_ctr", "max_ctr", "total_likes", "median_duration_s"])
        def ctr_of(x):
            try:
                return float(x["ctr"])
            except (TypeError, ValueError):
                return None
        for name, group in sorted(by.items(), key=lambda kv: (-len(kv[1]), kv[0].lower())):
            ctrs = [c for c in (ctr_of(g) for g in group) if c is not None]
            durs = []
            likes = 0
            for g in group:
                try:
                    durs.append(float(g["duration_s"]))
                except (TypeError, ValueError):
                    pass
                try:
                    likes += int(float(g["likes"]))
                except (TypeError, ValueError):
                    pass
            w.writerow([
                name, len(group), sum(1 for g in group if g["in_corpus"] == "yes"),
                "|".join(sorted({g["country"] for g in group})),
                "|".join(sorted({g["industry"] for g in group if g["industry"]}))[:120],
                round(statistics.mean(ctrs), 4) if ctrs else "",
                max(ctrs) if ctrs else "",
                likes,
                round(statistics.median(durs), 1) if durs else "",
            ])
    print(f"[wrote] {summary}  ({len(by)} advertisers)")

    named = {k: v for k, v in by.items() if k != "(unattributed)"}
    print(f"\n[result] {len(ads)} ads from {len(named)} named advertisers "
          f"(+{len(by.get('(unattributed)', []))} unattributed)")
    print("\ntop advertisers by ad count:")
    for name, group in sorted(named.items(), key=lambda kv: -len(kv[1]))[:15]:
        ccs = sorted({g['country'] for g in group})
        print(f"  {name[:34]:<34} {len(group):>4} ads  {len(ccs):>2} countries")


if __name__ == "__main__":
    main()
