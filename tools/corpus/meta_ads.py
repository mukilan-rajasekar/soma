#!/usr/bin/env python3
"""
meta_ads.py — collect ads that FAILED, which is the one thing the corpus does not have.

WHY THIS EXISTS. tools/corpus/audit.py measured the corpus and found the binding
constraint is not size — 733 ads is enough to detect |r| >= 0.10 — it is COMPOSITION:

    "The TikTok rows come from Top Ads, which is a curated showcase of strong performers.
     Whatever their spread, none of them is a FAILED ad, so a model fit here learns 'how
     strong among strong' and cannot be asked whether an ad will work. More of the same
     source does not fix this."

Meta's Ad Library is the fix, for one structural reason: under the EU Digital Services
Act every ad delivered to an EU user is archived regardless of who ran it or how it did.
It is the whole population, not a leaderboard. The ad that was killed after five days is
in there next to the one that ran for two years, and nobody curated the difference away.

THE LABEL, AND THE TRAP UNDERNEATH IT

`days_running` = end_date - start_date. Longer is a proxy for better: advertisers keep
paying for ads that work. It is a proxy and this file says so everywhere, because the
honest version of the claim is the only one worth making.

The trap is LEFT CENSORING, and it is the reason this collector takes only INACTIVE ads.
An ad that started yesterday and is still running has a two-day "duration" — but it is
brand new, not a failure. Mixing those in would manufacture losers that never lost, which
is strictly worse than having no losers at all: a model trained on them learns to call
new ads bad. So `active_status=inactive` is not a filter for tidiness. Every ad collected
here has a COMPLETED lifetime, start to stop, and the number is a fact about its whole
run rather than a snapshot of an unfinished one.

Two more things the duration does not know, both worth saying out loud before anyone
fits anything to it:

  * a short run can be a dated promo, a flash sale, or a creative test that always had a
    stop date. Some short ads did not fail; they finished.
  * budget is invisible. A brand that runs everything for 30 days and a brand that runs
    everything for 300 tells you about the brand, not the creative.

Both point the same way: the strongest comparison this data supports is WITHIN
ADVERTISER — the same page's 5-day ad against its own 200-day ad, where budget, brand and
audience are held roughly constant and only the creative moved. `page_name` is recorded
on every row so that comparison is available later. Cross-advertiser rank is the weaker
fallback, and should be described as such.

WHERE THE DATA COMES FROM. The Ad Library server-renders its results as JSON inside the
page — the same records its own UI binds to, carrying `ad_archive_id`, `start_date`,
`end_date`, `is_active`, `page_name`, reach and spend where the DSA requires them, and
`snapshot.videos[].video_hd_url`. So this reads the page's own payload rather than asking
a model to describe what it sees: an extractor that paraphrases a date or invents a media
URL is useless here, and this way nothing is paraphrased. The browser is Browserbase (the
library is bot-protected and refuses plain HTTP with a JS challenge — verified: 403).

Videos are fetched inside the same run because fbcdn URLs are time-signed and expire.

    python tools/corpus/meta_ads.py --query "protein powder" --country DE --limit 40
    python tools/corpus/meta_ads.py --sweep --limit 300         # many verticals, one session
    python tools/corpus/meta_ads.py --sweep --dry-run           # collect, write nothing

Appends to data/ads/ad_manifest.csv and data/ads/ad_performance.csv. Resumable: ads
already carrying a `lib<id>` note are skipped, and existing rows are never modified.
"""

import argparse
import csv
import datetime as dt
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

# Loaded rather than imported: ad_fetch_bb.py sits at the repo root and is not a package,
# and its Session/env handling is the pattern every other collector in this repo uses.
_spec = importlib.util.spec_from_file_location("ad_fetch_bb", ROOT / "ad_fetch_bb.py")
afb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(afb)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# EU countries, because the DSA archive obligation is what makes commercial ads visible
# at all. Outside the EU the library is far thinner and skews political.
EU_COUNTRIES = ["DE", "FR", "IT", "ES", "NL", "PL", "SE", "IE", "BE", "AT"]

# Consumer verticals that actually run video ads. Breadth here is what stops the corpus
# becoming "supplements, and also some supplements".
SWEEP_QUERIES = [
    "protein powder", "skincare serum", "running shoes", "meal kit", "mattress",
    "electric toothbrush", "language app", "car insurance", "meal replacement",
    "hair growth", "pet food", "sunglasses", "fitness app", "coffee subscription",
    "credit card", "online course", "vitamins", "razor subscription",
    # Second tier, added once the first pass had been through 14 of the terms above.
    # A search term is a sampling frame, not a keyword: whatever it matches becomes the
    # population the model is fit on. The first tier is heavily DTC-physical-product, so
    # these deliberately add services, apps, finance and durables — categories with
    # different ad grammar (talking head, screen recording, price overlay) rather than
    # more of the same unboxing shot.
    "robot vacuum", "air fryer", "smart watch", "noise cancelling headphones",
    "dating app", "mobile game", "budgeting app", "vpn subscription",
    "solar panels", "hearing aid", "teeth whitening", "perfume",
    "travel booking", "gym membership", "streaming service", "web hosting",
]

# An ad shorter than this is more likely a dated promo than a judgement about creative.
# Not dropped — recorded, and flagged so downstream can choose.
PROMO_FLOOR_DAYS = 2

# A keyword search matches whatever the advertiser put in the ad, and plenty of pages run
# long-form video through the ad system: the first sweep pulled a 15-minute video, a
# 25-minute one, and one that was SIX HOURS long. Those are not ads, and they are
# expensive to be wrong about — every one is a TRIBE forward pass over its whole length,
# and process_batch.py buckets a batch by duration so they could never be compared against
# a 15-second cut anyway. The length is only knowable after the download, so the file is
# fetched, measured, and deleted if it is not an ad.
MIN_AD_SECONDS = 3
MAX_AD_SECONDS = 180


# ==============================================================================
# parsing the page's own payload
# ==============================================================================

def scan_records(text, needle='"ad_archive_id"'):
    """Every ad record in the page, brace-matched and parsed as real JSON.

    Brace matching rather than a regex: these records nest several levels deep and carry
    free text with braces in it, so a pattern would silently truncate. Anything that does
    not parse is dropped rather than guessed at.
    """
    out = []
    for m in re.finditer(re.escape(needle), text):
        i = m.start()
        while i > 0 and text[i] != "{":
            i -= 1
        depth, j, instr, esc = 0, i, False, False
        while j < len(text):
            c = text[j]
            if instr:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    instr = False
            elif c == '"':
                instr = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        out.append(json.loads(text[i:j + 1]))
                    except json.JSONDecodeError:
                        pass
                    break
            j += 1
    return out


def video_url(snapshot):
    """Best available media URL, HD first. Also looks in extra_videos and cards, because
    carousel and multi-asset ads put the real creative there and skipping them would bias
    the corpus toward single-video ads."""
    pools = [snapshot.get("videos") or []]
    pools.append(snapshot.get("extra_videos") or [])
    for card in (snapshot.get("cards") or []):
        if isinstance(card, dict):
            pools.append([card])
    for pool in pools:
        for v in pool:
            if not isinstance(v, dict):
                continue
            for key in ("video_hd_url", "video_sd_url"):
                u = v.get(key)
                if isinstance(u, str) and u.startswith("http"):
                    return u
    return None


def usable(rec):
    """The record is a completed, video-carrying ad we can label honestly.

    `is_active` false AND a real `end_date` is the left-censoring guard described at the
    top of this file — without both, a short duration might just mean 'started recently'.
    """
    if rec.get("is_active"):
        return None
    start, end = rec.get("start_date"), rec.get("end_date")
    if not isinstance(start, int) or not isinstance(end, int) or end <= 0 or start <= 0:
        return None
    if end < start:
        return None
    snap = rec.get("snapshot") or {}
    url = video_url(snap)
    if not url:
        return None
    started = dt.date.fromtimestamp(start)
    ended = dt.date.fromtimestamp(end)
    return {
        "lib_id": str(rec.get("ad_archive_id") or ""),
        "page_name": (snap.get("page_name") or rec.get("page_name") or "").strip(),
        "page_id": str(rec.get("page_id") or ""),
        "start": started,
        "end": ended,
        "days": max(0, (ended - started).days),
        "video": url,
        "platforms": ",".join(rec.get("publisher_platform") or []),
        "countries": ",".join(rec.get("targeted_or_reached_countries") or []),
        "cta": snap.get("cta_type") or "",
        "collation": rec.get("collation_count") or 1,
    }


# ==============================================================================
# collection
# ==============================================================================

def library_url(query, country):
    return ("https://www.facebook.com/ads/library/"
            "?active_status=inactive&ad_type=all&media_type=video"
            f"&country={urllib.parse.quote(country)}"
            f"&q={urllib.parse.quote(query)}"
            "&search_type=keyword_unordered")


def harvest(page, query, country, scrolls, seen, log):
    """One search, scrolled, de-duplicated. Returns usable records only."""
    page.goto(library_url(query, country), wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(7000)

    found = {}
    for n in range(max(1, scrolls)):
        for rec in scan_records(page.content()):
            got = usable(rec)
            if got and got["lib_id"] and got["lib_id"] not in seen and got["lib_id"] not in found:
                found[got["lib_id"]] = got
        if n < scrolls - 1:
            page.mouse.wheel(0, 14000)
            page.wait_for_timeout(3500)

    log(f"  {query!r}/{country}: {len(found)} completed video ads")
    return list(found.values())


def download(url, dest):
    """fbcdn serves progressive mp4 over plain HTTP. Signed and expiring, which is why
    this happens inside the collection run rather than as a later pass."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
    except Exception as e:                                          # noqa: BLE001
        print(f"    [download failed] {dest.name}: {e!r}")
        dest.unlink(missing_ok=True)
        return False
    if dest.stat().st_size < 20_000:
        dest.unlink(missing_ok=True)
        return False
    return True


def probe_seconds(path):
    """Length in seconds, or None if ffprobe cannot read it (or is not installed)."""
    if not shutil.which("ffprobe"):
        return None
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return None


def is_an_ad(path):
    """(ok, seconds, why). See MAX_AD_SECONDS — a keyword search matches long-form video
    too, and a six-hour file is not a creative."""
    secs = probe_seconds(path)
    if secs is None:
        # Never silently accept everything: without ffprobe this filter is not running,
        # and the operator needs to know that rather than discover it in the corpus.
        return True, None, "unmeasured (no ffprobe)"
    if secs < MIN_AD_SECONDS:
        return False, secs, f"{secs:.0f}s is too short to be an ad"
    if secs > MAX_AD_SECONDS:
        return False, secs, f"{secs:.0f}s is long-form video, not an ad"
    return True, secs, ""


# ==============================================================================
# the corpus files
# ==============================================================================

def existing_lib_ids(data_dir):
    """Which library ids are already collected, read from the manifest's own note field
    so a re-run never re-downloads and never renumbers."""
    ids, max_idx = set(), -1
    path = data_dir / "ad_manifest.csv"
    if not path.exists():
        return ids, 0
    with path.open(newline="") as fh:
        for row in csv.DictReader(fh):
            note = row.get("note") or ""
            m = re.search(r"lib(\d+)", note)
            if m:
                ids.add(m.group(1))
            m2 = re.match(r"meta_(\d+)$", row.get("ad_id") or "")
            if m2:
                max_idx = max(max_idx, int(m2.group(1)))
    return ids, max_idx + 1


def append_rows(data_dir, rows, dry_run):
    """Append-only, both files, in the shapes they already have. Existing rows are never
    rewritten — hand-collected history stays exactly as it is."""
    if dry_run or not rows:
        return
    man = data_dir / "ad_manifest.csv"
    with man.open("a", newline="") as fh:
        w = csv.writer(fh)
        for r in rows:
            w.writerow([r["ad_id"], r["days"], "meta", r["note"]])

    perf = data_dir / "ad_performance.csv"
    with perf.open(newline="") as fh:
        header = next(csv.reader(fh))
    with perf.open("a", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        for r in rows:
            w.writerow({
                "ad_id": r["ad_id"],
                "platform": "meta",
                "source_id": r["lib_id"],
                "primary_label": r["days"],
                "days_running": r["days"],
                "country": r["country"],
                "duration_s": ("" if r.get("seconds") is None else round(r["seconds"], 2)),
            })


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--query", default="", help="a single search term")
    ap.add_argument("--country", default="DE", help="two-letter EU country code")
    ap.add_argument("--queries", default="",
                    help="comma-separated terms to sweep instead of all of SWEEP_QUERIES")
    ap.add_argument("--sweep", action="store_true",
                    help="harvest the built-in vertical list across EU markets in ONE session")
    ap.add_argument("--limit", type=int, default=40, help="max NEW ads this run")
    ap.add_argument("--per-search", type=int, default=12, dest="per_search",
                    help="max ads taken from any one search. Without this a sweep fills "
                         "its whole limit from the first two verticals and the corpus "
                         "ends up being one product category wearing a disguise.")
    ap.add_argument("--countries", type=int, default=3,
                    help="how many EU markets from EU_COUNTRIES to sweep")
    ap.add_argument("--scrolls", type=int, default=4)
    ap.add_argument("--data-dir", default="data/ads")
    ap.add_argument("--no-download", action="store_true",
                    help="labels only, no media (rows are tagged NO_VIDEO)")
    ap.add_argument("--dry-run", action="store_true", help="collect and print, write nothing")
    ap.add_argument("--session-timeout", type=int, default=1800)
    args = ap.parse_args()

    if args.dry_run:
        args.no_download = True
    if not args.sweep and not args.query:
        ap.error("pass --query, or --sweep for the built-in vertical list")

    data_dir = Path(args.data_dir)
    if not data_dir.is_absolute():
        data_dir = ROOT / data_dir
    if not (data_dir / "ad_manifest.csv").exists():
        sys.exit(f"No ad_manifest.csv under {data_dir}.")

    seen, next_idx = existing_lib_ids(data_dir)
    print(f"corpus    {len(seen)} library ids already collected; next id meta_{next_idx:02d}")

    # Country-major, so a run that is cut short still spans verticals rather than
    # finishing one market and never reaching the others.
    # --queries narrows the sweep to named terms. This matters more than it looks: the
    # sweep walks SWEEP_QUERIES in order, and a term that has already been swept is nearly
    # all duplicates — 'protein powder' has 43 ads in the corpus and returned 2 new ones
    # after thirteen minutes of browser time. Grinding the used terms first spends the
    # session budget on ads that get deduplicated away before it ever reaches a fresh
    # vertical. Naming the fresh ones is the difference between a useful run and a slow one.
    if args.queries:
        wanted = [q.strip() for q in args.queries.split(",") if q.strip()]
        unknown = [q for q in wanted if q not in SWEEP_QUERIES]
        if unknown:
            print(f"note      {len(unknown)} term(s) not in SWEEP_QUERIES, using anyway: "
                  f"{', '.join(unknown)}")
        pool = wanted
    else:
        pool = SWEEP_QUERIES

    combos = ([(q, c) for q in pool for c in EU_COUNTRIES[:max(1, args.countries)]]
              if args.sweep else [(args.query, args.country)])
    print(f"plan      {len(combos)} search(es), up to {args.limit} new ads\n")

    from playwright.sync_api import sync_playwright

    model = afb.load_env()
    collected, rows = [], []

    with afb.Session(model, paid=False, label="meta-ads",
                     timeout_s=args.session_timeout) as s:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(s.cdp_url)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            for query, country in combos:
                if len(collected) >= args.limit:
                    break
                try:
                    got = harvest(page, query, country, args.scrolls, seen, print)
                except Exception as e:                              # noqa: BLE001
                    # A dead session must not throw away what is already downloaded —
                    # everything here is append-only, so a partial run is just a smaller
                    # batch and the next run resumes by de-duplication.
                    print(f"  [search failed] {query!r}/{country}: {e!r}")
                    break

                taken = 0
                for rec in got:
                    if len(collected) >= args.limit or taken >= args.per_search:
                        break
                    ad_id = f"meta_{next_idx:02d}"
                    rec["seconds"] = None
                    if not args.no_download:
                        dest = data_dir / "videos" / f"{ad_id}.mp4"
                        if not download(rec["video"], dest):
                            continue
                        keep, secs, why = is_an_ad(dest)
                        rec["seconds"] = secs
                        if not keep:
                            print(f"    [drop] {rec['page_name'][:24]}: {why}")
                            dest.unlink(missing_ok=True)
                            continue
                        if why:
                            print(f"    [warn] {why}")
                    seen.add(rec["lib_id"])
                    tag = "NO_VIDEO;" if args.no_download else ""
                    short = ";SHORT_RUN" if rec["days"] <= PROMO_FLOOR_DAYS else ""
                    rec.update({
                        "ad_id": ad_id,
                        "country": country,
                        "query": query,
                        "note": (f"lib{rec['lib_id']};start_{rec['start']:%b_%d_%Y};"
                                 f"end_{rec['end']:%b_%d_%Y};{tag}"
                                 f"page_{re.sub(r'[^A-Za-z0-9]+', '_', rec['page_name'])[:32]};"
                                 f"q_{re.sub(r'[^A-Za-z0-9]+', '_', query)}{short}"),
                    })
                    collected.append(rec)
                    rows.append(rec)
                    next_idx += 1
                    taken += 1
                    print(f"    {ad_id}  {rec['days']:>4}d  {rec['page_name'][:28]:<28} "
                          f"{rec['start']:%Y-%m-%d} -> {rec['end']:%Y-%m-%d}")

                # Persist after every search rather than once at the end. A sweep is a
                # multi-hour browser session against a bot-protected site, so it gets
                # interrupted — by a challenge page, a timeout, or an operator. Holding
                # every row in memory until the last combo means an interruption leaves
                # the DOWNLOADED VIDEOS ON DISK WITH NO MANIFEST ROWS: bytes paid for,
                # metadata gone, and orphans that collide with the next run's id
                # numbering. append_rows is already append-only, so calling it per search
                # is free and makes the run resumable at search granularity.
                if rows:
                    append_rows(data_dir, rows, args.dry_run)
                    rows = []

    if not collected:
        print("\nNothing collected. If the browser hit a challenge page, the session "
              "replay link above shows exactly what it saw.")
        return 1

    days = sorted(r["days"] for r in collected)
    n = len(days)
    print(f"\ncollected {n} completed ads")
    print(f"duration  min {days[0]}d  median {days[n // 2]}d  max {days[-1]}d")
    print(f"under 14d {sum(d <= 14 for d in days)}   "
          f"under 30d {sum(d <= 30 for d in days)}   "
          f"over 180d {sum(d >= 180 for d in days)}")
    pages = {}
    for r in collected:
        pages.setdefault(r["page_name"], []).append(r["days"])
    multi = {k: v for k, v in pages.items() if len(v) > 1}
    print(f"advertisers {len(pages)} distinct, {len(multi)} with >1 ad "
          f"(these are the within-advertiser comparisons)")

    append_rows(data_dir, rows, args.dry_run)
    if args.dry_run:
        print("\ndry run: nothing written.")
    else:
        print(f"\nappended {len(rows)} rows to ad_manifest.csv and ad_performance.csv")
        print("next: python tools/corpus/audit.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
