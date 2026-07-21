#!/usr/bin/env python3
"""
ad_fetch.py — gather a set of REAL ads + a real outcome label, for ad_backtest.py.

The backtest needs, per ad: a video file AND an outcome number where higher = better
performance. Two honest sources you can use TODAY, both free:

  * TikTok Creative Center "Top Ads"  — a public showcase already RANKED by performance
    (CTR / likes / 6s-play-rate). The list position IS an outcome proxy: #1 outperformed
    #20. This script best-effort-fetches that list + downloads the preview videos.
  * Meta Ad Library                    — no clean public performance number for commercial
    ads, but "how long an ad has run" (first_seen -> last_seen) is a decent 'it's winning'
    proxy. The API only returns dates for social/political ads, so for commercial ads you
    collect this by hand from the UI. Use `scaffold` to get a manifest template to fill.

HONESTY: these are PROXIES for real spend outcomes (a longer-running or higher-CTR ad is
usually winning, not always). Say "proxy" in every claim, exactly like the code does. The
strongest data is a design partner's OWN CPA/ThruPlay on their OWN ads — when you have that,
skip the scraping and just write the manifest from their numbers.

Output layout (--out data/ads):
  data/ads/ad_manifest.csv          ad_id,outcome,platform,note   (higher outcome = better)
  data/ads/videos/<ad_id>.mp4       downloaded creatives (feed to batch_extract + baseline_extract)

USAGE:
  python ad_fetch.py tiktok --out data/ads --limit 30 --country US --period 30 --order-by ctr
  python ad_fetch.py scaffold --out data/ads          # empty manifest to fill by hand
  # then: batch_extract.py + baseline_extract.py on data/ads/videos, then ad_backtest.py

Stdlib only (urllib). Best-effort: TikTok changes its anti-crawl headers often; if the fetch
returns nothing, the script tells you exactly how to build the manifest by hand instead.
"""
import argparse
import csv
import json
import os
import re
import urllib.parse
import urllib.request

TIKTOK_API = "https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def _safe_id(s):
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(s))[:60]


def _dig_video_url(material):
    """Find a playable mp4 URL inside a Creative Center material dict (shape varies)."""
    vi = material.get("video_info") or {}
    for key in ("video_url", "url", "play_url"):
        v = vi.get(key)
        if isinstance(v, str) and v.startswith("http"):
            return v
        if isinstance(v, dict):                       # {"720p": "...", "480p": "..."}
            for res in ("720p", "480p", "360p"):
                if isinstance(v.get(res), str) and v[res].startswith("http"):
                    return v[res]
            for cand in v.values():
                if isinstance(cand, str) and cand.startswith("http"):
                    return cand
    return None


def fetch_tiktok(period, country, industry, limit, order_by):
    """Best-effort pull of the ranked Top-Ads list. Returns list of row dicts (may be empty)."""
    params = {
        "period": str(period), "page": "1", "limit": str(min(limit, 100)),
        "order_by": order_by, "country_code": country, "ad_language": "",
        "ad_format": "", "objective": "", "like": "0",
    }
    if industry:
        params["industry"] = industry
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{TIKTOK_API}?{qs}",
        headers={"User-Agent": UA,
                 "Referer": "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en",
                 "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = json.load(r)
    except Exception as e:  # noqa: BLE001
        print(f"[tiktok] fetch failed ({e!r}).")
        return []
    materials = (payload.get("data") or {}).get("materials") or []
    rows = []
    n = len(materials)
    for i, m in enumerate(materials):
        ad_id = "tt_" + _safe_id(m.get("id") or m.get("ad_id") or f"rank{i:03d}")
        # outcome proxy: prefer the numeric metric we sorted by; else inverse rank in [0,1]
        metric = m.get(order_by)
        try:
            outcome = float(metric)
        except (TypeError, ValueError):
            outcome = round(1.0 - i / max(1, n - 1), 4)     # rank #1 -> 1.0, last -> 0.0
        rows.append(dict(ad_id=ad_id, outcome=outcome, platform="tiktok",
                         note=f"rank{i+1};order_by={order_by}",
                         video_url=_dig_video_url(m)))
    return rows


def download_video(url, path):
    if not url:
        return False
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
        return os.path.getsize(path) > 1024
    except Exception as e:  # noqa: BLE001
        print(f"  [download failed] {os.path.basename(path)}: {e!r}")
        return False


def write_manifest(rows, out_dir, download=True):
    os.makedirs(out_dir, exist_ok=True)
    vid_dir = os.path.join(out_dir, "videos")
    os.makedirs(vid_dir, exist_ok=True)
    kept = []
    for row in rows:
        if download and row.get("video_url"):
            ok = download_video(row["video_url"], os.path.join(vid_dir, f"{row['ad_id']}.mp4"))
            if not ok:
                continue
        kept.append(row)
    mpath = os.path.join(out_dir, "ad_manifest.csv")
    with open(mpath, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ad_id", "outcome", "platform", "note"])
        for row in kept:
            w.writerow([row["ad_id"], row["outcome"], row["platform"], row.get("note", "")])
    print(f"[wrote] {mpath}  ({len(kept)} ads)  videos -> {vid_dir}")
    return mpath, len(kept)


# kept OUT of the CSV on purpose: ad_backtest's _read_csv treats row 1 as the header, so a
# leading '#' comment would be mis-parsed. The note lives in a sibling README instead.
SCAFFOLD_NOTE = """ad_manifest.csv — fill one row per ad. HIGHER outcome = better performance.
outcome can be: CTR, ThruPlay rate, days-an-ad-has-run, or a rank where 1=best (then pass
--outcome-is-rank to ad_backtest.py, which inverts it). Put each video at videos/<ad_id>.mp4,
then run batch_extract.py + baseline_extract.py on them before ad_backtest.py.
"""


def scaffold(out_dir):
    os.makedirs(os.path.join(out_dir, "videos"), exist_ok=True)
    mpath = os.path.join(out_dir, "ad_manifest.csv")
    with open(os.path.join(out_dir, "ad_manifest.README.txt"), "w") as f:
        f.write(SCAFFOLD_NOTE)
    if os.path.exists(mpath):
        print(f"[exists] {mpath} — not overwriting (wrote/refreshed the README next to it).")
        return mpath
    with open(mpath, "w", newline="") as f:      # CLEAN csv: header on row 1, no comments
        w = csv.writer(f)
        w.writerow(["ad_id", "outcome", "platform", "note"])
        w.writerow(["example_ad_01", "0.9", "manual", "replace me"])
        w.writerow(["example_ad_02", "0.4", "manual", "replace me"])
    print(f"[wrote] {mpath}  (template) + ad_manifest.README.txt. "
          f"Put creatives in {os.path.join(out_dir,'videos')}/<ad_id>.mp4")
    return mpath


def _manual_help():
    print("\nBuild the manifest BY HAND (works even when scraping is blocked):")
    print("  1. Open ads.tiktok.com/business/creativecenter/inspiration/topads (or Meta Ad Library).")
    print("  2. For ~15-30 ads: download the video to data/ads/videos/<ad_id>.mp4 and note its rank.")
    print("  3. `python ad_fetch.py scaffold --out data/ads`, then fill ad_manifest.csv")
    print("     (outcome = higher-is-better; a rank list -> outcome=1.0 for #1 down to 0.0 for last).")
    print("  4. batch_extract.py + baseline_extract.py on the videos, then ad_backtest.py.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("tiktok", help="best-effort fetch of ranked Top Ads + download videos")
    t.add_argument("--out", default="data/ads")
    t.add_argument("--limit", type=int, default=30)
    t.add_argument("--country", default="US")
    t.add_argument("--period", type=int, default=30, choices=[7, 30, 180])
    t.add_argument("--industry", default="")
    t.add_argument("--order-by", default="ctr",
                   help="ctr | like | play_six_rate | ... (defines the outcome ranking)")
    t.add_argument("--no-download", action="store_true", help="write manifest only, skip videos")

    s = sub.add_parser("scaffold", help="write an empty manifest template to fill by hand")
    s.add_argument("--out", default="data/ads")

    args = ap.parse_args()
    if args.cmd == "scaffold":
        scaffold(args.out)
        _manual_help()
        return

    rows = fetch_tiktok(args.period, args.country, args.industry, args.limit, args.order_by)
    if not rows:
        print("[tiktok] no ads returned (TikTok often requires a signed session header).")
        _manual_help()
        return
    _, n = write_manifest(rows, args.out, download=not args.no_download)
    if n < 6:
        print(f"[warn] only {n} ads downloaded — ad_backtest needs >=6 (>=15-30 for a real "
              "claim). Retry, widen --country/--industry, or fill the manifest by hand.")
    else:
        print(f"\nNext: batch_extract.py --video-dir {os.path.join(args.out,'videos')} ...  then "
              f"baseline_extract.py, then ad_backtest.py --manifest {os.path.join(args.out,'ad_manifest.csv')}")


if __name__ == "__main__":
    main()
