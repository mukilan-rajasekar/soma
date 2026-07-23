#!/usr/bin/env python3
"""
ad_fetch_bb.py — Browserbase-powered ad collection for ad_backtest.py.

Companion to ad_fetch.py. Same contract, same output layout, same honesty rules —
but it drives a real Chrome browser in Browserbase's cloud (via Stagehand) instead
of hitting a JSON endpoint with urllib. That matters for the sources that have no
usable public API: Meta Ad Library and Google Ads Transparency Center, both of
which were previously collected BY HAND.

Sources (subcommands):
  google    Google Ads Transparency Center. Public, covers all advertisers (not just
            political), and exposes "first shown"/"last shown" per creative — so
            days-an-ad-has-run is READ, not estimated. Works on the Browserbase Free
            plan. This is the one to start with.
  meta      Meta Ad Library. Same proxy metric (days running), but heavily
            bot-protected: needs residential proxies + a Verified browser, which are
            PAID (Developer plan and up / Scale respectively). On Free this will
            usually be blocked. Pass --paid to actually request those features.
  tiktok    TikTok Creative Center "Top Ads" via the browser. ad_fetch.py already
            hits TikTok's internal JSON API with stdlib and that is FASTER when it
            works — use this only when the API path returns nothing. Also
            bot-protected; same --paid flag applies.
  metaapi   Meta's official Ad Library Graph API. No browser, no scraping, free.
            Big caveat: outside the EU it only covers political / social-issue ads,
            so it will NOT find ordinary commercial creatives. Needs META_ACCESS_TOKEN.

HONESTY (carried over from ad_fetch.py, unchanged): every outcome here is a PROXY for
real spend performance. A longer-running or higher-CTR ad is usually winning, not
always. Say "proxy" in every claim. A design partner's own CPA/ThruPlay on their own
ads beats all of this — when you have that, skip scraping and write the manifest from
their numbers.

Output layout (--out data/ads), identical to ad_fetch.py:
  data/ads/ad_manifest.csv      ad_id,outcome,platform,note   (higher outcome = better)
  data/ads/videos/<ad_id>.mp4   creatives, for batch_extract.py + baseline_extract.py

DIFFERENCE FROM ad_fetch.py THAT MATTERS: ad_fetch.py's write_manifest() opens the CSV
with mode "w" and rewrites it from scratch. This module APPENDS — it reads the existing
manifest, skips ads already collected (matched on the source id recorded in `note`),
continues ad_id numbering from the highest existing index per platform, and only writes
a row once the video is actually on disk. Your hand-collected rows are never touched.

USAGE:
  python ad_fetch_bb.py tiktok --sweep --limit 500             # build the corpus
  python ad_fetch_bb.py tiktok --region JP --period 7          # one slice
  python ad_fetch_bb.py google --query "Nike" --metadata-only  # outcome labels only
  python ad_fetch_bb.py meta   --query "skincare" --paid       # needs paid features
  python ad_fetch_bb.py metaapi --query "climate" --limit 25
  # then: batch_extract.py + baseline_extract.py on data/ads/videos, then ad_backtest.py

GETTING VOLUME FROM TIKTOK (--sweep): any single filter slice returns at most 20 ads —
`limit` is capped at 20 by the API and `page=2` comes back EMPTY, so there is no
pagination to exploit. Breadth across filters is the only lever. --sweep therefore walks
a grid of 28 countries x 3 periods x 2 sort orders, plus 21 industry verticals over the
six largest markets, and does it INSIDE ONE browser session:

  1. load the page once so its JS fires one correctly signed /list request
  2. capture that request's `user-sign` / `timestamp` / `anonymous-user-id` headers
  3. replay /list with arbitrary filter params using those headers

Step 3 works because the signature does NOT cover the query string (verified: rewriting
country_code/page/limit on a signed request still returns code=0). One session yields
~1000 unique ads instead of 20. TikTok rate-limits with code=40100, hence --throttle-ms
and a single automatic back-off retry per combo.

Country codes, periods and industry ids are all validated against /top_ads/v2/filters —
passing anything outside those sets returns a `oneof` validation error. Sort order is a
SAMPLING knob only: the outcome label is always CTR, never the sorted-by metric, so the
column stays on one scale (see the note in collect_tiktok).

Requires: stagehand, python-dotenv, yt-dlp (all installed in .venv).
Reads BROWSERBASE_API_KEY and SOMA_STAGEHAND_MODEL from the repo-root .env.
"""
import argparse
import csv
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
MANIFEST_COLS = ["ad_id", "outcome", "platform", "note"]

# Model Gateway id. gemini-2.5-flash is the cheapest supported id, which matters
# because the Free plan ships only $5 of Model Gateway tokens.
DEFAULT_MODEL = "google/gemini-2.5-flash"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


# ── env ───────────────────────────────────────────────────────────────────────

def load_env():
    """Load the repo-root .env the same way the other pipeline scripts do."""
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(REPO_ROOT, ".env"))
    except ImportError:
        pass  # fall back to whatever is already exported
    if not os.environ.get("BROWSERBASE_API_KEY"):
        sys.exit("[fatal] BROWSERBASE_API_KEY not set (expected in .env or the shell).")
    return os.environ.get("SOMA_STAGEHAND_MODEL") or DEFAULT_MODEL


# ── manifest: read / append, never clobber ────────────────────────────────────

def read_manifest(out_dir):
    """Return (rows, seen_source_ids). Missing file -> empty, not an error."""
    path = os.path.join(out_dir, "ad_manifest.csv")
    if not os.path.exists(path):
        return [], set()
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    seen = set()
    for r in rows:
        for tok in (r.get("note") or "").split(";"):
            tok = tok.strip()
            # source ids are recorded as lib<id> (meta), cr<id> (google), tt<id>
            if re.match(r"^(lib|cr|tt)\S+", tok):
                seen.add(tok)
    return rows, seen


def next_index(rows, prefix):
    """Highest existing <prefix>_NN in the manifest, + 1. Keeps numbering continuous."""
    hi = -1
    for r in rows:
        m = re.match(rf"^{re.escape(prefix)}_(\d+)$", (r.get("ad_id") or "").strip())
        if m:
            hi = max(hi, int(m.group(1)))
    return hi + 1


def append_manifest(out_dir, new_rows):
    """Append rows, creating the file with a header if needed. Never rewrites existing rows."""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "ad_manifest.csv")
    exists = os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.writer(f)
        if not exists:
            w.writerow(MANIFEST_COLS)
        for r in new_rows:
            w.writerow([r["ad_id"], r["outcome"], r["platform"], r.get("note", "")])
    print(f"[manifest] +{len(new_rows)} rows -> {path}")
    return path


# ── video download ────────────────────────────────────────────────────────────

def download_video(url, path):
    """yt-dlp for page/streaming URLs (YouTube-hosted Google ads, TikTok), plain HTTP
    for direct .mp4 links. Returns True only if a non-trivial file landed on disk."""
    if not url:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)

    direct = url.split("?")[0].lower().endswith((".mp4", ".webm", ".mov"))
    if not direct and shutil.which("yt-dlp"):
        try:
            subprocess.run(
                ["yt-dlp", "-q", "--no-warnings", "-f", "mp4/best",
                 "--merge-output-format", "mp4", "-o", path, url],
                check=True, timeout=300,
            )
            if os.path.exists(path) and os.path.getsize(path) > 1024:
                return True
        except Exception as e:  # noqa: BLE001
            print(f"  [yt-dlp failed] {os.path.basename(path)}: {e!r} — trying direct HTTP")

    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
            shutil.copyfileobj(r, f)
        return os.path.getsize(path) > 1024
    except Exception as e:  # noqa: BLE001
        print(f"  [download failed] {os.path.basename(path)}: {e!r}")
        return False


# ── dates -> "days running" outcome ───────────────────────────────────────────

def parse_date(s):
    """Parse the assorted date strings these sites emit. None if unparseable."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip().replace(",", "")
    for fmt in ("%b %d %Y", "%B %d %Y", "%Y-%m-%d", "%d %b %Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


def days_running(first_shown, last_shown=None):
    """Outcome proxy: how long the ad has been live. Higher = better, per the manifest
    contract. Unparseable start date -> None, and we skip the ad rather than guess."""
    start = parse_date(first_shown)
    if not start:
        return None, None
    end = parse_date(last_shown) or dt.date.today()
    return max(0, (end - start).days), start


# ── Stagehand session helper ──────────────────────────────────────────────────

class Session:
    """Thin wrapper so every source reads the same. Prints the full session URL up
    front — you want that link when a run misbehaves."""

    def __init__(self, model, paid=False, label="", timeout_s=None):
        from stagehand import Stagehand
        self.client = Stagehand()          # reads BROWSERBASE_API_KEY; no project id needed
        self.model = model
        self.paid = paid
        self.label = label
        self.timeout_s = timeout_s
        self.id = None
        self.cdp_url = None   # set on enter; used to attach Playwright over CDP

    def __enter__(self):
        kwargs = {"model_name": self.model}
        if self.timeout_s:
            # The project default is 300s. A --sweep grid runs well past that, and when
            # the session expires mid-grid Playwright dies with TargetClosedError, so
            # raise it explicitly for long runs.
            kwargs["browserbase_session_create_params"] = {"timeout": int(self.timeout_s)}
        if self.paid:
            # Residential proxies + Verified browser + CAPTCHA solving. These are PAID:
            # proxies are Developer-plan-and-up, verified is Scale-only. On the Free plan
            # this request is what gets rejected (or the session opens but still gets blocked).
            kwargs.setdefault("browserbase_session_create_params", {}).update({
                "proxies": True,
                "browser_settings": {
                    "advanced_stealth": True,
                    "verified": True,
                    "solve_captchas": True,
                    "block_ads": False,      # never block ads — they are the payload here
                },
            })
        r = self.client.sessions.start(**kwargs)
        self.id = r.data.session_id
        self.cdp_url = r.data.cdp_url
        print(f"[session] {self.label} https://www.browserbase.com/sessions/{self.id}")
        if self.paid:
            print("[session] requested proxies + verified (PAID features)")
        return self

    def __exit__(self, *exc):
        try:
            if self.id:
                self.client.sessions.end(self.id)
        except Exception:  # noqa: BLE001
            pass
        try:
            self.client.close()
        except Exception:  # noqa: BLE001
            pass
        return False

    def go(self, url):
        self.client.sessions.navigate(id=self.id, url=url)

    def act(self, instruction):
        try:
            return self.client.sessions.act(id=self.id, input=instruction)
        except Exception as e:  # noqa: BLE001
            print(f"  [act failed] {instruction!r}: {e!r}")
            return None

    def extract(self, instruction, schema):
        r = self.client.sessions.extract(id=self.id, instruction=instruction, schema=schema)
        return getattr(r.data, "result", None) or {}


ADS_SCHEMA = {
    "type": "object",
    "properties": {
        "ads": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_id":   {"type": "string", "description": "the ad/creative id"},
                    "advertiser":  {"type": "string"},
                    "first_shown": {"type": "string", "description": "first shown / start date"},
                    "last_shown":  {"type": "string", "description": "last shown date, if any"},
                    "detail_url":  {"type": "string", "description": "link to the ad's own page"},
                    "is_video":    {"type": "boolean"},
                },
                "required": ["source_id"],
            },
        }
    },
    "required": ["ads"],
}


# ── source: Google Ads Transparency Center ────────────────────────────────────
#
# This one does NOT need a browser or any LLM tokens. The Transparency Center is an
# Angular front-end over a public JSON-RPC backend, and the two calls we need were
# captured off a real Browserbase session (Playwright over CDP) and then verified to
# replay fine over plain HTTP:
#
#   SearchService/SearchSuggestions  {"1":<query>,"2":10,"3":10,"4":[<region>],"5":{"1":1}}
#       -> {"1":[{"1":{"1":<advertiser name>,"2":"AR<id>","3":<cc>,
#                      "4":{"2":{"1":<min ads>,"2":<max ads>}}}}, ...]}
#
#   SearchService/SearchCreatives    {"2":40,"3":{"8":[<region>],"12":{"1":"","2":true},
#                                     "13":{"1":["AR<id>"]}},"7":{"1":1,"2":0,"3":<region>}}
#       -> {"1":[<creative>...], "2":<next-page cursor>}
#       pass the cursor back as "4" to page forward.
#
# Per creative:  "1" advertiser AR id · "2" creative CR id · "3" content · "4" format
#                "6" first-shown {"1": unix seconds} · "7" last-shown · "12" advertiser name
# Format enum:   1 = image (content is <img src=...simgad...>)
#                2, 3 = HTML/display renders served via displayads-formats content.js
#
# IMPORTANT LIMIT, verified by fetching the renders: none of these formats carry a
# downloadable video. Google's video ads are YouTube-hosted and the Transparency Center
# does not expose a media file. So this source is excellent for OUTCOME METADATA
# (real first/last-shown dates -> days running) and useless for grabbing creatives.
# Run it with --metadata-only; pair the labels with video from a source that serves files.

RPC_BASE = "https://adstransparency.google.com/anji/_/rpc"


def _region_code(cc):
    """The RPC wants a numeric region. It is 2000 + the ISO-3166 numeric code
    (US = 840 -> 2840). Only the codes we actually use are mapped."""
    return {"US": 2840, "GB": 2826, "CA": 2124, "AU": 2036, "DE": 2276,
            "FR": 2250, "IN": 2356, "JP": 2392, "BR": 2076}.get(cc.upper(), 2840)


def _rpc(service, method, payload, timeout=45):
    url = f"{RPC_BASE}/{service}/{method}?authuser="
    body = urllib.parse.urlencode(
        {"f.req": json.dumps(payload, separators=(",", ":"))}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": UA,
        "referer": "https://adstransparency.google.com/",
        "x-same-domain": "1",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def google_find_advertiser(query, region):
    """Resolve a name to (advertiser_id, display_name, ad_count). Picks the candidate
    with the most ads among those whose name matches, which reliably lands on the real
    brand rather than a same-named individual."""
    d = _rpc("SearchService", "SearchSuggestions",
             {"1": query, "2": 10, "3": 10, "4": [_region_code(region)], "5": {"1": 1}})
    best = None
    for entry in (d.get("1") or []):
        a = entry.get("1") or {}
        name, aid = a.get("1") or "", a.get("2") or ""
        if not aid.startswith("AR"):
            continue
        try:
            count = int((a.get("4") or {}).get("2", {}).get("2") or 0)
        except (TypeError, ValueError):
            count = 0
        exact = query.strip().lower() in name.strip().lower()
        score = (1 if exact else 0, count)
        if best is None or score > best[0]:
            best = (score, aid, name, count)
    return (best[1], best[2], best[3]) if best else (None, None, 0)


def google_iter_creatives(advertiser_id, region, max_pages=25):
    """Page through an advertiser's creatives. Yields raw creative dicts."""
    cursor, rc = None, _region_code(region)
    for _ in range(max_pages):
        payload = {"2": 40,
                   "3": {"8": [rc], "12": {"1": "", "2": True},
                         "13": {"1": [advertiser_id]}},
                   "7": {"1": 1, "2": 0, "3": rc}}
        if cursor:
            payload["4"] = cursor
        try:
            d = _rpc("SearchService", "SearchCreatives", payload)
        except Exception as e:  # noqa: BLE001
            print(f"  [rpc failed] {e!r}")
            return
        items = d.get("1") or []
        if not items:
            return
        for it in items:
            yield it
        cursor = d.get("2")
        if not cursor:
            return


FORMAT_NAMES = {1: "image", 2: "display", 3: "display_rich"}


def collect_google(args, _model):
    """Metadata collector. No browser, no LLM tokens, no Browserbase session needed —
    the RPC replays over plain HTTP. Gives real first/last-shown dates, so the
    days-running outcome is READ rather than estimated."""
    if not args.query:
        sys.exit("[google] --query is required (an advertiser name, e.g. --query 'Nike')")

    aid, name, count = google_find_advertiser(args.query, args.region)
    if not aid:
        print(f"[google] no advertiser matched {args.query!r} in {args.region}")
        return []
    print(f"[google] advertiser: {name}  {aid}  (~{count} ads)")

    rows, seen = read_manifest(args.out)
    idx = next_index(rows, "goog")
    collected, scanned, fmt_counts = [], 0, {}

    for it in google_iter_creatives(aid, args.region):
        if len(collected) >= args.limit:
            break
        scanned += 1
        fmt = it.get("4")
        fmt_counts[fmt] = fmt_counts.get(fmt, 0) + 1

        cr = it.get("2") or ""
        key = f"cr{cr}"
        if not cr or key in seen:
            continue

        try:
            first = int((it.get("6") or {}).get("1") or 0)
            last = int((it.get("7") or {}).get("1") or 0)
        except (TypeError, ValueError):
            continue
        if not first:
            continue
        start = dt.date.fromtimestamp(first)
        end = dt.date.fromtimestamp(last) if last else dt.date.today()
        outcome = max(0, (end - start).days)

        ad_id = f"goog_{idx:02d}"
        if not args.metadata_only:
            # Verified: no Google ad format here exposes a downloadable media file.
            print(f"  [skip] {key}: Google exposes no downloadable video "
                  "(use --metadata-only to keep the outcome label)")
            continue

        note = (f"{key};start_{start:%b_%d_%Y};adv_"
                f"{re.sub(r'[^A-Za-z0-9]+', '_', name)[:40]};"
                f"fmt_{FORMAT_NAMES.get(fmt, fmt)};NO_VIDEO")
        collected.append(dict(ad_id=ad_id, outcome=outcome, platform="google", note=note))
        seen.add(key)
        idx += 1

    print(f"[google] scanned {scanned} creatives; formats seen: "
          + ", ".join(f"{FORMAT_NAMES.get(k, k)}={v}" for k, v in sorted(
              fmt_counts.items(), key=lambda x: str(x[0]))))
    if not args.metadata_only:
        print("[google] 0 rows written: this source has outcome labels but no media. "
              "Re-run with --metadata-only to capture the labels, and source the video "
              "elsewhere.")
    return collected


# ── source: Meta Ad Library ───────────────────────────────────────────────────

def collect_meta(args, model):
    """Keeps your existing meta_NN / lib<id>;start_<date> convention exactly.
    Bot-protected: expect blocks without --paid (and possibly even with it)."""
    if not args.paid:
        print("[meta] WARNING: Meta Ad Library is heavily bot-protected. Without "
              "--paid (residential proxies + Verified browser) this will very likely "
              "be blocked or return an empty page. Those are paid Browserbase features.")

    rows, seen = read_manifest(args.out)
    idx = next_index(rows, "meta")
    collected = []

    url = ("https://www.facebook.com/ads/library/?active_status=all&ad_type=all"
           f"&country={urllib.parse.quote(args.region)}&media_type=video"
           f"&q={urllib.parse.quote(args.query or '')}&search_type=keyword_unordered")

    with Session(model, paid=args.paid, label="meta") as s:
        s.go(url)
        for _ in range(max(0, args.scrolls)):
            s.act("scroll to the bottom of the page to load more ad results")

        data = s.extract(
            "List the video ads in these results. For each: its Library ID number, the "
            "advertiser/page name, the 'Started running on' date, and a link to the ad. "
            "Return an empty list if the page shows a login wall, a CAPTCHA, or no results.",
            ADS_SCHEMA,
        )
        ads = (data or {}).get("ads") or []
        print(f"[meta] extracted {len(ads)} ads")
        if not ads:
            print("[meta] nothing returned — the usual cause is a login wall or bot "
                  "check. Check the session replay link above to see what the browser "
                  "actually saw.")

        for ad in ads:
            if len(collected) >= args.limit:
                break
            sid = re.sub(r"\D", "", str(ad.get("source_id") or ""))
            if not sid:
                continue
            key = f"lib{sid}"
            if key in seen:
                print(f"  [skip] {key} already in manifest")
                continue

            outcome, start = days_running(ad.get("first_shown"), ad.get("last_shown"))
            if outcome is None:
                print(f"  [skip] {key}: no parseable start date ({ad.get('first_shown')!r})")
                continue

            ad_id = f"meta_{idx:02d}"
            dest = os.path.join(args.out, "videos", f"{ad_id}.mp4")
            if args.no_download:
                ok = True
            else:
                ok = download_video(ad.get("detail_url"), dest)
            if not ok:
                print(f"  [skip] {key}: video not retrievable")
                continue

            collected.append(dict(ad_id=ad_id, outcome=outcome, platform="meta",
                                  note=f"{key};start_{start:%b_%d_%Y}"))
            seen.add(key)
            idx += 1

    return collected


# ── source: TikTok Creative Center (browser) ──────────────────────────────────

TIKTOK_API = "https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list"
TIKTOK_MAX_LIMIT = 20        # verified: limit=21 fails the API's 'max' validation

# Verified against /top_ads/v2/filters — passing anything else returns a oneof error.
TIKTOK_COUNTRIES = ["AE", "AR", "AU", "BR", "CA", "CO", "DE", "ES", "FR", "GB", "ID",
                    "IT", "JP", "KR", "MX", "MY", "NL", "PH", "PK", "RO", "SA", "SE",
                    "SG", "TH", "TR", "US", "VN", "ZA"]
TIKTOK_PERIODS = [7, 30, 180]
TIKTOK_SORTS = ["ctr", "like"]          # 'cost' is rejected by the API
TIKTOK_INDUSTRIES = [                   # 21 top-level verticals
    10000000000, 11000000000, 12000000000, 13000000000, 14000000000, 15000000000,
    16000000000, 17000000000, 18000000000, 19000000000, 20000000000, 21000000000,
    22000000000, 23000000000, 24000000000, 25000000000, 26000000000, 27000000000,
    28000000000, 29000000000, 30000000000,
]


def _tiktok_combos(args):
    """Build the filter grid. Each slice returns at most 20 ads (pagination is capped —
    page=2 comes back empty), so breadth across filters is the ONLY way to get volume."""
    if not args.sweep:
        return [{"country": args.region, "period": args.period,
                 "order_by": args.order_by, "industry": args.industry or None}]

    combos = []
    # Geography x time x sort — the widest net.
    for cc in TIKTOK_COUNTRIES:
        for period in TIKTOK_PERIODS:
            for sort in TIKTOK_SORTS:
                combos.append({"country": cc, "period": period,
                               "order_by": sort, "industry": None})
    # Industry verticals, over the largest ad markets, for creative-type diversity.
    for cc in ("US", "GB", "DE", "JP", "BR", "ID"):
        for ind in TIKTOK_INDUSTRIES:
            for period in (30, 180):
                combos.append({"country": cc, "period": period,
                               "order_by": "ctr", "industry": ind})
    return combos


def _dig_video_url(material):
    """Pull the best playable mp4 out of a Creative Center material. Shape (verified):
    video_info.video_url = {"720p": url, "480p": url, ...}. Kept compatible with
    ad_fetch.py's helper of the same name so rows from either script are mixable."""
    vi = material.get("video_info") or {}
    for key in ("video_url", "url", "play_url"):
        v = vi.get(key)
        if isinstance(v, str) and v.startswith("http"):
            return v
        if isinstance(v, dict):
            for res in ("1080p", "720p", "480p", "360p"):
                if isinstance(v.get(res), str) and v[res].startswith("http"):
                    return v[res]
            for cand in v.values():
                if isinstance(cand, str) and cand.startswith("http"):
                    return cand
    return None


def collect_tiktok(args, model):
    """TikTok Creative Center "Top Ads" — the one source that actually serves
    downloadable creatives, WITH a real performance metric (CTR) attached.

    Why this needs a browser at all: /creative_radar_api/v1/top_ads/v2/list rejects
    unsigned callers with {"code":40101,"msg":"no permission"} — it wants `user-sign`,
    `timestamp` and `anonymous-user-id` headers that the site's JS computes per request.
    That is why ad_fetch.py's stdlib path stopped working. Rather than reimplement the
    signing (it rotates), we let the real page issue its own signed request from a
    Browserbase session and simply read the response off the wire via CDP. Verified:
    the page's own call returns code=0 with 20 materials, each carrying
    video_info.video_url — while an in-page unsigned fetch of the same endpoint on the
    same page still returns 40101.
    """
    from playwright.sync_api import sync_playwright

    rows, seen = read_manifest(args.out)
    idx = next_index(rows, "tt")
    collected = []

    page_url = "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en"
    combos = _tiktok_combos(args)
    print(f"[tiktok] {len(combos)} filter combinations to harvest")

    materials, origin = {}, {}
    with Session(model, paid=args.paid, label="tiktok",
                 timeout_s=args.session_timeout) as s:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(s.cdp_url)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            # Step 1: load the page once so its JS issues one properly signed /list call,
            # and grab those headers. Verified: the signature does NOT cover the query
            # string, so the same headers authenticate arbitrary filter/page params.
            headers = {}

            def on_request(req):
                if "/top_ads/v2/list" in req.url and not headers:
                    headers.update(dict(req.headers))

            page.on("request", on_request)
            page.goto(page_url, wait_until="domcontentloaded", timeout=90000)
            page.wait_for_timeout(10000)

            if not headers:
                print("[tiktok] never saw a signed /list request — the page may be "
                      "blocked. Check the session replay above.")
                return []
            print(f"[tiktok] captured signing headers "
                  f"({', '.join(k for k in ('user-sign', 'timestamp', 'anonymous-user-id') if k in headers)})")

            # Step 2: replay /list across the whole filter grid inside this one session.
            # Cheap (plain HTTP through the browser context) — no page interaction, so a
            # few hundred combinations cost one browser session instead of hundreds.
            ok = bad = 0
            for n, combo in enumerate(combos, 1):
                # A session that dies mid-grid (expiry, network drop) must not throw away
                # the ads already harvested — stop the grid and let the download stage run
                # on what we have. Everything downstream is append-only, so a partial grid
                # is just a smaller batch and the next run resumes via de-duplication.
                try:
                    q = {"period": combo["period"], "page": 1, "limit": TIKTOK_MAX_LIMIT,
                         "order_by": combo["order_by"], "country_code": combo["country"]}
                    if combo.get("industry"):
                        q["industry"] = combo["industry"]
                    url = f"{TIKTOK_API}?{urllib.parse.urlencode(q)}"

                    body = page.request.get(url, headers=headers).json()
                    if body.get("code") == 40100:
                        # Rate limited. Back off and retry once — without this roughly
                        # 80% of a 400-combo grid is lost to 'too many requests'.
                        page.wait_for_timeout(args.throttle_ms * 6)
                        body = page.request.get(url, headers=headers).json()

                    page.wait_for_timeout(args.throttle_ms)

                    if body.get("code") != 0:
                        bad += 1
                        if bad <= 3:
                            print(f"  [combo {n}] rejected: code={body.get('code')} "
                                  f"{str(body.get('msg'))[:80]}")
                        continue

                    ok += 1
                    for m in (body.get("data") or {}).get("materials") or []:
                        mid = str(m.get("id") or "")
                        if mid and mid not in materials:
                            materials[mid] = m
                            origin[mid] = combo
                    if n % 25 == 0:
                        print(f"  [{n}/{len(combos)}] {len(materials)} unique ads so far")

                except Exception as e:  # noqa: BLE001
                    if "closed" in str(e).lower() or "TargetClosed" in type(e).__name__:
                        print(f"  [combo {n}] session ended early ({type(e).__name__}) — "
                              f"keeping the {len(materials)} ads already harvested")
                        break
                    bad += 1

            print(f"[tiktok] grid done: {ok} combos OK, {bad} rejected")

    materials = list(materials.values())
    print(f"[tiktok] {len(materials)} unique ads captured off the wire")
    if not materials:
        print("[tiktok] nothing captured. Either the page was blocked (check the session "
              "replay above) or the endpoint moved. --paid adds proxies + Verified.")
        return []

    for i, m in enumerate(materials):
        if len(collected) >= args.limit:
            break
        mid = re.sub(r"[^A-Za-z0-9]", "", str(m.get("id") or f"rank{i:03d}"))[:40]
        key = f"tt{mid}"
        if key in seen:
            print(f"  [skip] {key} already in manifest")
            continue

        # Outcome is ALWAYS ctr, never args.order_by. Every material carries all of
        # ctr/like/cost, and --order-by only changes WHICH ads come back — so keying the
        # outcome off it would put a rate (0.01) and a raw like-count (347148) in the
        # same column and quietly wreck ad_backtest.py's correlation. Sort order is a
        # sampling knob; the label stays on one scale. The other metrics go in `note`
        # so they are still recoverable.
        try:
            outcome = round(float(m.get("ctr")), 4)
            note = f"{key};ctr_{outcome}"
        except (TypeError, ValueError):
            outcome = round(1.0 - i / max(1, len(materials) - 1), 4)
            note = f"{key};rank{i + 1}_of_{len(materials)}"
        # Provenance: in sweep mode every ad comes from a different slice, so record
        # the combo that surfaced it rather than the CLI defaults.
        src = origin.get(str(m.get("id")), {})
        note += f";cc_{src.get('country', args.region)}"
        note += f";p{src.get('period', args.period)}"
        note += f";sortedby_{src.get('order_by', args.order_by)}"
        if src.get("industry"):
            note += f";ind_{src['industry']}"

        for extra in ("like", "cost"):
            try:
                note += f";{extra}_{float(m.get(extra)):g}"
            except (TypeError, ValueError):
                pass

        brand = re.sub(r"[^A-Za-z0-9]+", "_", str(m.get("brand_name") or ""))[:40]
        if brand:
            note += f";brand_{brand}"
        dur = (m.get("video_info") or {}).get("duration")
        if dur:
            note += f";dur_{float(dur):.1f}s"

        ad_id = f"tt_{idx:02d}"
        dest = os.path.join(args.out, "videos", f"{ad_id}.mp4")
        if args.no_download:
            ok = True
        else:
            vurl = _dig_video_url(m)
            print(f"  [get] {ad_id} <- {(vurl or '(no video url)')[:80]}")
            ok = download_video(vurl, dest)
        if not ok:
            print(f"  [skip] {key}: video not retrievable")
            continue

        collected.append(dict(ad_id=ad_id, outcome=outcome, platform="tiktok", note=note))
        seen.add(key)
        idx += 1

    return collected


# ── source: Meta Ad Library Graph API (no browser) ────────────────────────────

def collect_meta_api(args, _model):
    """Official, free, no scraping — but outside the EU it only indexes political and
    social-issue ads. It will not find ordinary commercial creatives. Included for
    completeness; `google` is the better free path for commercial ads."""
    token = os.environ.get("META_ACCESS_TOKEN")
    if not token:
        print("[metaapi] META_ACCESS_TOKEN not set. Create a Meta app, get a user token "
              "with ads_read, and add META_ACCESS_TOKEN=... to .env.")
        print("[metaapi] Reminder: outside the EU this API only covers political / "
              "social-issue ads — it will not return commercial creatives.")
        return []

    rows, seen = read_manifest(args.out)
    idx = next_index(rows, "meta")
    collected = []

    params = {
        "access_token": token,
        "search_terms": args.query or "",
        "ad_reached_countries": f'["{args.region}"]',
        "ad_type": "POLITICAL_AND_ISSUE_ADS",
        "ad_active_status": "ALL",
        "media_type": "VIDEO",
        "limit": str(min(args.limit * 3, 100)),
        "fields": "id,ad_delivery_start_time,ad_delivery_stop_time,page_name,ad_snapshot_url",
    }
    api = "https://graph.facebook.com/v21.0/ads_archive?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(api, timeout=60) as r:
            payload = json.load(r)
    except Exception as e:  # noqa: BLE001
        print(f"[metaapi] request failed: {e!r}")
        return []

    if "error" in payload:
        print(f"[metaapi] API error: {payload['error'].get('message')}")
        return []

    entries = payload.get("data") or []
    print(f"[metaapi] {len(entries)} ads returned")

    for ad in entries:
        if len(collected) >= args.limit:
            break
        key = f"lib{ad.get('id')}"
        if key in seen:
            continue
        outcome, start = days_running(ad.get("ad_delivery_start_time"),
                                      ad.get("ad_delivery_stop_time"))
        if outcome is None:
            continue

        ad_id = f"meta_{idx:02d}"
        dest = os.path.join(args.out, "videos", f"{ad_id}.mp4")
        if args.no_download:
            ok = True
        else:
            ok = download_video(ad.get("ad_snapshot_url"), dest)
        if not ok:
            continue

        collected.append(dict(ad_id=ad_id, outcome=outcome, platform="meta",
                              note=f"{key};start_{start:%b_%d_%Y};src_api"))
        seen.add(key)
        idx += 1

    return collected


# ── CLI ───────────────────────────────────────────────────────────────────────

SOURCES = {
    "google": collect_google,
    "meta": collect_meta,
    "tiktok": collect_tiktok,
    "metaapi": collect_meta_api,
}


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", choices=sorted(SOURCES), help="which ad source to collect from")
    ap.add_argument("--out", default=os.path.join(REPO_ROOT, "data", "ads"))
    ap.add_argument("--query", default="", help="advertiser or keyword to search for")
    ap.add_argument("--limit", type=int, default=10, help="max NEW ads to add this run")
    ap.add_argument("--region", default="US", help="two-letter country code")
    ap.add_argument("--period", type=int, default=30, choices=[7, 30, 180],
                    help="tiktok only: lookback window in days")
    ap.add_argument("--order-by", default="ctr", dest="order_by",
                    help="tiktok only: ctr | like (verified valid; 'cost' is rejected by "
                         "the API with a oneof validation error) — also the outcome value")
    ap.add_argument("--industry", default="",
                    help="tiktok only: industry id from /top_ads/v2/filters, e.g. "
                         "27000000000 (Food & Beverage). Best axis for corpus diversity.")
    ap.add_argument("--session-timeout", type=int, default=1800, dest="session_timeout",
                    help="Browserbase session lifetime in seconds. The project default "
                         "is 300, which a --sweep grid outlives.")
    ap.add_argument("--throttle-ms", type=int, default=700, dest="throttle_ms",
                    help="tiktok only: pause between grid requests. TikTok returns "
                         "40100 'too many requests' when hit too fast; 0 disables.")
    ap.add_argument("--sweep", action="store_true",
                    help="tiktok only: harvest the whole filter grid (28 countries x 3 "
                         "periods x 2 sorts, plus 21 industries over the biggest markets) "
                         "inside ONE browser session. The way to build a corpus.")
    ap.add_argument("--scrolls", type=int, default=3,
                    help="how many times to scroll/expand before extracting")
    ap.add_argument("--paid", action="store_true",
                    help="request residential proxies + Verified browser (PAID: proxies "
                         "need Developer plan and up, verified is Scale-only)")
    ap.add_argument("--no-download", action="store_true",
                    help="write manifest rows only, skip fetching the videos")
    ap.add_argument("--metadata-only", action="store_true",
                    help="google only: write outcome-labelled rows even though no video "
                         "file is available (rows are tagged NO_VIDEO in `note`)")
    ap.add_argument("--dry-run", action="store_true",
                    help="collect and print, but write nothing to disk")
    args = ap.parse_args()

    if args.dry_run:
        args.no_download = True

    model = load_env()
    print(f"[model] {model}   [out] {args.out}   [source] {args.source}")

    existing, _ = read_manifest(args.out)
    print(f"[manifest] {len(existing)} existing rows — these are never modified")

    new_rows = SOURCES[args.source](args, model)

    if not new_rows:
        print("\n[result] 0 new ads collected. Open the session link above to see what "
              "the browser saw. If the page was a login wall or bot check, that source "
              "needs the paid proxies/Verified path.")
        return

    print(f"\n[result] {len(new_rows)} new ads:")
    for r in new_rows:
        print(f"  {r['ad_id']:<10} outcome={r['outcome']:<8} {r['platform']:<8} {r['note']}")

    if args.dry_run:
        print("\n[dry-run] nothing written.")
        return

    append_manifest(args.out, new_rows)
    total = len(existing) + len(new_rows)
    if total < 15:
        print(f"[warn] {total} ads total — ad_backtest.py needs >=6, and >=15-30 for a "
              "claim you'd actually stand behind. Run again with a different --query.")
    vid_dir = os.path.join(args.out, "videos")
    print(f"\nNext: batch_extract.py --video-dir {vid_dir} ...  then baseline_extract.py, "
          f"then ad_backtest.py --manifest {os.path.join(args.out, 'ad_manifest.csv')}")


if __name__ == "__main__":
    main()
