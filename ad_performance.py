#!/usr/bin/env python3
"""
ad_performance.py — per-ad performance labels for testing a model against data/ads/.

Companion to ad_fetch_bb.py (which downloads creatives) and ad_advertisers.py (who ran
them). This one answers "how well did each ad do?" and writes a labels table you join to
the manifest on ad_id — the y-values for a model that predicts ad performance from video.

By default it labels the ads that actually have a downloaded video (the manifest), since
those are the ones a model can be tested on. Pass --all to also label every ad catalogued
in ad_advertisers.csv (most of those have no video, but the labels are still collected).

WHERE THE NUMBERS COME FROM (all verified):
  TikTok  /v1/top_ads/v2/detail?material_id=<id>
            ctr            performance index in [0,1] (NOT a raw click rate). VARIES
                           across ads (~100 distinct values, median ~0.29) -> this is
                           the primary_label.
            like/comment/share   engagement counts (span 0 .. millions)
            favorite       boolean flag — constant false in this data, so unusable
            cost           relative cost index (coarse: 0/1/2)
            objectives     the campaign objectives the ad optimised for
            landing_page   destination URL
          /v1/top_ads/percentile?metric=ctr_percentile&material_id=<id>&period_type=<7|30|180>
            ctr_percentile normalised rank in [0,1]. VERIFIED DEGENERATE for this corpus:
                           it is a constant 0.99 for every ad, because Top Ads are already
                           a top-percentile showcase, so it has zero discriminative power.
                           Collected and stored for transparency, but NOT the label.
  Meta    no live API on the free plan; the manifest already stores days-an-ad-has-run as
          its outcome, so that is carried through unchanged as the meta performance label.

Both TikTok endpoints replay over plain HTTP once the page's signing headers are captured
(same trick as ad_fetch_bb --sweep), so all ~700 ads are labelled inside ONE session.

HONESTY: every number here is a PROXY for real spend performance (same rule as the rest of
the pipeline). Crucially, this whole corpus is TikTok's *Top Ads* showcase — an
already-curated set of strong performers. So a label here means "how strong AMONG strong
ads", not "winner vs loser". Absolute-percentile signal (ctr_percentile) is therefore
saturated and useless; only the relative indices (ctr_index, engagement) carry variance.
For a real winner/loser test you want ads that failed too, which this source does not
expose — a design partner's own CPA on their own ads remains the gold standard.

Output (--out data/ads):
  ad_performance.csv   one row per ad — ad_id, platform, the raw metrics above, a derived
                       engagement_total, and primary_label (ctr_index for tiktok,
                       days_running for meta). Resumable: existing rows are kept, only
                       missing ads are fetched.

USAGE:
  python ad_performance.py                 # label the ~733 ads that have videos
  python ad_performance.py --all           # also label everything in ad_advertisers.csv
"""
import argparse
import collections
import csv
import importlib.util
import json
import os
import re
import urllib.parse

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))

_spec = importlib.util.spec_from_file_location(
    "ad_fetch_bb", os.path.join(REPO_ROOT, "ad_fetch_bb.py"))
afb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(afb)

API = "https://ads.tiktok.com/creative_radar_api"
LANDING = "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en"

PERF_COLS = [
    "ad_id", "platform", "source_id", "primary_label", "ctr_percentile", "ctr_index",
    "likes", "comments", "shares", "favorites", "engagement_total", "cost_index",
    "duration_s", "country", "industry_key", "objective", "landing_page",
    "period_type", "days_running",
]


def read_perf(path):
    """Existing performance rows, for resumability. Returns dict keyed by ad_id."""
    if not os.path.exists(path):
        return {}
    with open(path, newline="") as f:
        return {r["ad_id"]: r for r in csv.DictReader(f)}


def targets_from_manifest(out_dir):
    """(ad_id, platform, source_id, period_type) for every manifest row."""
    rows, _ = afb.read_manifest(out_dir)
    out = []
    for r in rows:
        note = r.get("note", "")
        if r["platform"] == "tiktok":
            m = re.search(r"tt(\d+)", note)
            per = re.search(r";p(\d+)", note)
            out.append((r["ad_id"], "tiktok", m.group(1) if m else None,
                        int(per.group(1)) if per else 180, r))
        else:
            out.append((r["ad_id"], r["platform"], None, None, r))
    return out


def targets_from_catalogue(out_dir):
    """Every ad in ad_advertisers.csv (superset — most have no video)."""
    path = os.path.join(out_dir, "ad_advertisers.csv")
    if not os.path.exists(path):
        return []
    out = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            per = int(r["period_days"]) if str(r.get("period_days", "")).isdigit() else 180
            out.append((f"ttcat_{r['ad_id']}", "tiktok", r["ad_id"], per, r))
    return out


def _num(x):
    try:
        f = float(x)
        return int(f) if f == int(f) else f
    except (TypeError, ValueError):
        return ""


def fetch_perf(page, headers, source_id, period_type):
    """detail + ctr_percentile for one TikTok material. Returns a metrics dict or None."""
    try:
        d = page.request.get(f"{API}/v1/top_ads/v2/detail?material_id={source_id}",
                             headers=headers).json()
    except Exception:  # noqa: BLE001
        return None
    if d.get("code") != 0:
        return None
    data = d.get("data") or {}

    pct = ""
    try:
        pr = page.request.get(
            f"{API}/v1/top_ads/percentile?metric=ctr_percentile"
            f"&material_id={source_id}&period_type={period_type}",
            headers=headers).json()
        if pr.get("code") == 0:
            pct = (pr.get("data") or {}).get("ctr_percentile", "")
    except Exception:  # noqa: BLE001
        pass

    likes, comments = _num(data.get("like")), _num(data.get("comment"))
    shares, favs = _num(data.get("share")), _num(1 if data.get("favorite") else 0)
    eng = sum(v for v in (likes, comments, shares) if isinstance(v, (int, float)))
    vi = data.get("video_info") or {}
    obj = data.get("objective_key") or ""
    cc = data.get("country_code")
    return {
        "ctr_percentile": pct,
        "ctr_index": _num(data.get("ctr")),
        "likes": likes, "comments": comments, "shares": shares, "favorites": favs,
        "engagement_total": eng,
        "cost_index": _num(data.get("cost")),
        "duration_s": _num(vi.get("duration")),
        "country": (cc[0] if isinstance(cc, list) and cc else cc) or "",
        "industry_key": (data.get("industry_key") or "").replace("label_", ""),
        "objective": obj.replace("campaign_objective_", ""),
        "landing_page": (data.get("landing_page") or "")[:300],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=os.path.join(REPO_ROOT, "data", "ads"))
    ap.add_argument("--all", action="store_true",
                    help="also label every ad in ad_advertisers.csv, not just the "
                         "manifest ads that have videos")
    ap.add_argument("--throttle-ms", type=int, default=500, dest="throttle_ms")
    ap.add_argument("--session-timeout", type=int, default=3000, dest="session_timeout")
    args = ap.parse_args()

    model = afb.load_env()
    perf_path = os.path.join(args.out, "ad_performance.csv")
    existing = read_perf(perf_path)
    print(f"[model] {model}   [existing perf rows] {len(existing)}")

    targets = targets_from_manifest(args.out)
    if args.all:
        have = {t[0] for t in targets}
        targets += [t for t in targets_from_catalogue(args.out) if t[0] not in have]
    print(f"[targets] {len(targets)} ads")

    # Meta rows: carry days-running straight through as the label — no fetch needed.
    results = {}
    tiktok_todo = []
    for ad_id, plat, sid, per, row in targets:
        if ad_id in existing:
            results[ad_id] = existing[ad_id]
            continue
        if plat == "tiktok" and sid:
            tiktok_todo.append((ad_id, sid, per, row))
        elif plat == "meta":
            results[ad_id] = {
                **{c: "" for c in PERF_COLS},
                "ad_id": ad_id, "platform": "meta", "source_id": "",
                "primary_label": row.get("outcome", ""),
                "days_running": row.get("outcome", ""),
            }
    print(f"[plan] {len(tiktok_todo)} tiktok ads to fetch, "
          f"{len(results)} already labelled/meta")

    if tiktok_todo:
        from playwright.sync_api import sync_playwright
        ok = miss = 0
        with afb.Session(model, label="performance",
                         timeout_s=args.session_timeout) as s:
            with sync_playwright() as p:
                browser = p.chromium.connect_over_cdp(s.cdp_url)
                ctx = browser.contexts[0] if browser.contexts else browser.new_context()
                page = ctx.pages[0] if ctx.pages else ctx.new_page()

                headers = {}
                page.on("request", lambda req: headers.update(dict(req.headers))
                        if ("/top_ads/v2/list" in req.url and not headers) else None)
                page.goto(LANDING, wait_until="domcontentloaded", timeout=90000)
                page.wait_for_timeout(9000)
                if not headers:
                    print("[fatal] no signed request seen — page likely blocked.")
                    return
                print("[ok] captured signing headers\n")

                for i, (ad_id, sid, per, row) in enumerate(tiktok_todo, 1):
                    try:
                        m = fetch_perf(page, headers, sid, per)
                        page.wait_for_timeout(args.throttle_ms)
                        if not m:
                            miss += 1
                            continue
                        ok += 1
                        results[ad_id] = {
                            **{c: "" for c in PERF_COLS},
                            "ad_id": ad_id, "platform": "tiktok", "source_id": sid,
                            # primary_label = ctr_index, NOT ctr_percentile. Verified on
                            # this corpus: ctr_percentile is a constant 0.99 for every ad
                            # because Top Ads are already a top-percentile showcase, so it
                            # has zero discriminative power. ctr_index varies (0.01-0.99,
                            # ~100 distinct values) and is the usable normalised label.
                            "primary_label": m["ctr_index"],
                            "period_type": per, **m,
                        }
                        if i % 50 == 0:
                            print(f"  [{i}/{len(tiktok_todo)}] {ok} labelled, {miss} missing")
                    except Exception as e:  # noqa: BLE001
                        if "closed" in str(e).lower():
                            print(f"  [{i}] session ended early — saving {ok} labelled")
                            break
                        miss += 1
        print(f"\n[fetch] {ok} labelled, {miss} not found on the endpoint")

    if not results:
        print("[result] nothing to write.")
        return

    # merge onto disk (resumable) and write
    merged = dict(existing)
    merged.update(results)
    with open(perf_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PERF_COLS)
        w.writeheader()
        for ad_id in sorted(merged):
            w.writerow({c: merged[ad_id].get(c, "") for c in PERF_COLS})
    print(f"[wrote] {perf_path}  ({len(merged)} ads)")

    # quick label distribution
    tt = [r for r in merged.values() if r.get("platform") == "tiktok"
          and r.get("ctr_index") not in ("", None)]
    if tt:
        vals = sorted(float(r["ctr_index"]) for r in tt)
        n = len(vals)
        print(f"\nctr_index label spread (n={n}): "
              f"min={vals[0]:.2f}  p25={vals[n//4]:.2f}  median={vals[n//2]:.2f}  "
              f"p75={vals[3*n//4]:.2f}  max={vals[-1]:.2f}")
        buckets = collections.Counter(min(int(v * 10), 9) for v in vals)
        print("histogram (decile -> count):")
        for b in range(10):
            print(f"  {b/10:.1f}-{(b+1)/10:.1f}: {'#' * (buckets.get(b,0)*40//max(1,max(buckets.values())))} {buckets.get(b,0)}")


if __name__ == "__main__":
    main()
