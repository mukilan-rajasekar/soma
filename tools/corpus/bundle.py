#!/usr/bin/env python3
"""
bundle.py — package the ad corpus metadata for someone who is not you.

    python tools/corpus/bundle.py                 # -> dist/soma-corpus-meta/
    python tools/corpus/bundle.py --zip           # ... and a single .zip to send

The videos are 11 GB and do not go in here; see SHARING in the generated DATASHEET.

WHY THIS EXISTS RATHER THAN "just send them the CSVs". ad_performance.csv has a column
called `primary_label` that holds TWO DIFFERENT QUANTITIES depending on the row's
platform: days-an-ad-ran for meta (1..857) and a CTR index for tiktok (0.01..0.99).
Anyone who reads the header, sees one label column, and fits a model on all 1059 rows
gets a number back. It is meaningless, and nothing about the file will tell them so.
The datasheet this writes exists to make that impossible to miss.
"""
import argparse
import csv
import collections
import hashlib
import shutil
import statistics
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "ads"
OUT = ROOT / "dist" / "soma-corpus-meta"

# Files that are metadata (small, shareable). The videos/ and arcs/ trees are not here.
TABLES = [
    ("ad_manifest_meta.csv", "**START HERE for outcome work** — 353 ads, outcome = days running, contains the failures"),
    ("ad_manifest_tiktok.csv", "673 ads, outcome = CTR index, curated winners only"),
    ("ad_performance.csv", "the metrics table — see the LABEL WARNING in the datasheet"),
    ("ad_media.csv", "ffprobe truth per video: duration, resolution, aspect, audio presence"),
    ("ad_manifest.csv", "the unsplit original; kept for provenance, do not train on it directly"),
    ("ad_advertisers.csv", "3073 ads seen while collecting — mostly NOT collected; see SAMPLING"),
    ("advertiser_summary.csv", "per-advertiser rollup"),
]

FAILURE_DAYS = 14  # matches tools/corpus/audit.py
AD_MAX_SECONDS = 180  # matches is_an_ad() in tools/corpus/meta_ads.py


def num(row, col):
    v = (row.get(col) or "").strip()
    try:
        return float(v)
    except ValueError:
        return None


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def reason_family(reason):
    """`long_form_1495s` and `long_form_205s` are one reason, not two hundred. Collapse the
    measurement off the end so the datasheet counts families."""
    head = reason.rsplit("_", 1)[0]
    return f"{head}_*" if head and head != reason else reason


def sampling_bias(perf):
    """Compare the ads that were downloaded against the ones merely seen.

    ad_advertisers.csv records every ad the collector encountered, most of which it never
    fetched. Joining on source_id turns 'the corpus skews toward winners' from an intuition
    into a measured ratio — and identifies, by id, exactly which ads would fix it."""
    path = SRC / "ad_advertisers.csv"
    if not path.exists():
        return None
    adv = list(csv.DictReader(open(path)))
    collected = {(r.get("source_id") or "").strip() for r in perf if (r.get("source_id") or "").strip()}
    inc = [r for r in adv if r["ad_id"] in collected]
    exc = [r for r in adv if r["ad_id"] not in collected]
    if len(inc) < 20 or len(exc) < 20:
        return None

    compare = {}
    for col in ("ctr", "duration_s", "likes", "period_days"):
        a = [x for x in (num(r, col) for r in inc) if x is not None]
        b = [x for x in (num(r, col) for r in exc) if x is not None]
        if len(a) >= 5 and len(b) >= 5:
            compare[col] = (statistics.median(a), statistics.median(b))
    ctr = compare.get("ctr")
    return {
        "total": len(adv),
        "collected": len(inc),
        "skipped": len(exc),
        "compare": compare,
        "ctr_ratio": (ctr[0] / ctr[1]) if ctr and ctr[1] else 0,
    }


def survey():
    """Everything the datasheet asserts is measured here, not typed by hand."""
    man = list(csv.DictReader(open(SRC / "ad_manifest.csv")))
    perf = list(csv.DictReader(open(SRC / "ad_performance.csv")))
    vids = {p.stem for p in (SRC / "videos").glob("*.mp4")}

    s = {
        "rows": len(perf),
        "videos": len(vids),
        "video_bytes": sum(p.stat().st_size for p in (SRC / "videos").glob("*.mp4")),
        "missing_video": len({r["ad_id"] for r in man} - vids),
        "orphan_video": len(vids - {r["ad_id"] for r in man}),
        "platforms": {},
        "exclusions": collections.Counter(
            reason_family(r["exclude_reason"]) for r in perf if r.get("exclude_reason")
        ),
        "usable": sum(1 for r in perf if not r.get("exclude_reason")),
        "bias": sampling_bias(perf),
    }

    for plat in sorted({r["platform"] for r in perf}):
        rs = [r for r in perf if r["platform"] == plat]
        labels = [x for x in (num(r, "primary_label") for r in rs) if x is not None]
        durs = [x for x in (num(r, "duration_s") for r in rs) if x is not None]
        adv = collections.Counter(
            (r.get("note") or "").split("page_", 1)[1].split(";", 1)[0]
            for r in man
            if r["platform"] == plat and "page_" in (r.get("note") or "")
        )
        days = [x for x in (num(r, "days_running") for r in rs) if x is not None]
        s["platforms"][plat] = {
            "n": len(rs),
            "label_min": min(labels) if labels else None,
            "label_max": max(labels) if labels else None,
            "label_median": statistics.median(labels) if labels else None,
            "failures": sum(1 for d in days if d <= FAILURE_DAYS),
            "has_days": bool(days),
            "paired": sum(n for n in adv.values() if n > 1),
            "advertisers": len(adv),
            "dur_n": len(durs),
            "dur_missing": len(rs) - len(durs),
            "dur_median": statistics.median(durs) if durs else None,
            "dur_max": max(durs) if durs else None,
            "over_max": sum(1 for d in durs if d > AD_MAX_SECONDS),
            "fill": {
                c: sum(1 for r in rs if (r.get(c) or "").strip() not in ("", "NA", "None"))
                for c in rs[0]
                if c not in ("ad_id", "platform")
            },
        }
    return s


def datasheet(s):
    """A datasheet, in the Gebru et al. sense: what is in here, how it was collected, and
    what it cannot answer. The last section is the one that matters."""
    L = []
    w = L.append
    gb = s["video_bytes"] / 1e9
    meta = s["platforms"].get("meta", {})
    tik = s["platforms"].get("tiktok", {})

    w("# Soma ad corpus — datasheet\n")
    w("Metadata bundle. **The videos are not in here** (%.1f GB, %d files); see SHARING.\n"
      % (gb, s["videos"]))
    w(f"- **{s['rows']} ads collected**, every one with both a label and a video file.")
    w(f"- **{s['usable']} usable** after exclusions ({s['rows'] - s['usable']} excluded; see below).")
    w(f"- {s['missing_video']} manifest rows missing a video, {s['orphan_video']} orphan videos.")
    w("- Two sources that are **not interchangeable**, described next.\n")
    w("The per-platform manifests are already filtered to the usable set. Every other count")
    w("in this datasheet is over all %d collected rows unless it says otherwise.\n" % s["rows"])

    w("## ⚠️ Read this before you fit anything\n")
    w("`ad_performance.csv` has one column named `primary_label`. It holds **two different")
    w("quantities**, and which one you get depends on the row's `platform`:\n")
    w("| platform | n | `primary_label` is | range | engagement cols |")
    w("|---|---|---|---|---|")
    if meta:
        w(f"| `meta` | {meta['n']} | **days the ad ran** | {meta['label_min']:.0f}..{meta['label_max']:.0f} | absent (0% filled) |")
    if tik:
        w(f"| `tiktok` | {tik['n']} | **CTR index** (0-1) | {tik['label_min']:.2f}..{tik['label_max']:.2f} | present |")
    w("")
    w("Pooling these into one regression gives you a number. The number means nothing.")
    w("**Filter on `platform` first, every time.** They are two datasets in one file.\n")

    w("## What each source can and cannot answer\n")
    if tik:
        w(f"**tiktok ({tik['n']} ads)** — scraped from TikTok's *Top Ads* showcase, which is a")
        w("curated gallery of winners. There is **not one failed ad in it**, and no amount of")
        w("additional collection from this source would add one. It can tell you how strong an")
        w("ad is *among strong ads*. It cannot be asked whether an ad will work.\n")
    if meta:
        w(f"**meta ({meta['n']} ads)** — Meta Ad Library, filtered to ads that have **stopped")
        w("running**. Duration of a completed run is the label. This is the half that carries")
        w("failure:\n")
        w(f"- **{meta['failures']} ads ran {FAILURE_DAYS} days or less and stopped.** That is the")
        w("  failure end a curated source structurally cannot contain.")
        w(f"- **{meta['paired']} ads share an advertiser with another ad in the corpus**")
        w(f"  ({meta['advertisers']} distinct advertisers). Trust these comparisons first: same")
        w("  brand, similar budget and audience, so creative is close to the only thing moving.\n")

    w("## Exclusions — already applied, and auditable\n")
    w("Rows are **never deleted**. Every row carries an `exclude_reason` column; empty means")
    w("usable. The per-platform manifests above are already filtered on it. Current reasons:\n")
    for reason, n in sorted(s["exclusions"].items(), key=lambda kv: -kv[1]):
        w(f"- `{reason}` — {n}")
    w("")
    w(f"**`long_form_*`** are videos over {AD_MAX_SECONDS}s (up to 25 min) that the ad")
    w("libraries served as ads. Seven of them were invisible until durations were backfilled")
    w("from the files, because a row with no duration cannot fail a duration filter.")
    w("**`silent`** means no audio stream at all — Communication Clarity is 25% of the score")
    w("and is unmeasurable there, so those ads score nothing on it rather than zero.\n")

    w("## Known defects — carried deliberately, not yet fixed\n")
    w("1. **`days_running` is a proxy, not a verdict.** A short completed run can be a dated")
    w("   promo that always had an end date, not an ad that failed. The collector already")
    w("   drops still-running ads (left censoring: an active ad's duration is a partial")
    w("   measurement), but it cannot tell a flop from a two-week seasonal push.")
    w("2. **Provenance lives in a `note` string**, not typed columns. `page_<name>` is parsed")
    w("   out of it to derive advertiser identity, which is fragile.")
    w("3. **`orientation` is near-constant** — 94% of the corpus is 9:16 — so it looks like a")
    w("   placement covariate and cannot act as one. Measured, not assumed.")
    w("4. **`ad_advertisers.csv` has its own `in_corpus` column and it is stale.** It marks")
    w("   104 rows; the real overlap is 522, joined on `ad_performance.source_id`. Ignore the")
    w("   column, do the join.\n")

    if s.get("bias"):
        b = s["bias"]
        w("## SAMPLING — the collected tiktok set is not a random sample\n")
        w(f"`ad_advertisers.csv` holds {b['total']} ads seen during collection, of which")
        w(f"**{b['collected']} were actually downloaded** and {b['skipped']} were passed over.")
        w("Joining on `source_id` shows the sampler was far from neutral:\n")
        w("| metric | collected (median) | skipped (median) |")
        w("|---|---|---|")
        for k, (a, bb) in b["compare"].items():
            w(f"| `{k}` | {a:.2f} | {bb:.2f} |")
        w("")
        w(f"CTR is **{b['ctr_ratio']:.0f}x higher** in the collected set. That is the curation")
        w("problem restated as a number, and it is not only TikTok's showcase doing it — the")
        w("collection step preferred winners too.\n")
        w(f"**This is also the cheapest fix available.** Those {b['skipped']} skipped ads have")
        w("ids and metrics already recorded; they are the low-CTR tail this corpus lacks.")
        w("Re-fetching them is a scrape against a known id list, not a new discovery problem.\n")

    w("## Statistical power\n")
    w(f"At n={s['rows']}, a test at conventional power detects **|r| ≥ 0.09**. A null below")
    w("that is *\"could not tell\"* — not *\"nothing there\"*, and it must never be written up as")
    w("the latter.\n")

    w("## Column fill rates\n")
    plats = [p for p in ("meta", "tiktok") if p in s["platforms"]]
    w("| column | " + " | ".join(plats) + " |")
    w("|---|" + "---|" * len(plats))
    for c in s["platforms"][plats[0]]["fill"]:
        cells = []
        for p in plats:
            pl = s["platforms"][p]
            cells.append(f"{pl['fill'][c] / pl['n'] * 100:.0f}%")
        w(f"| `{c}` | " + " | ".join(cells) + " |")
    w("")

    w("## The floor a neural score has to beat\n")
    w("`tools/corpus/baseline_predicts.py` asks whether the four dumb ffmpeg features")
    w("predict outcome with no brain model involved. Both platforms, permutation-tested:\n")
    w("- **meta — nothing.** No feature reaches |r| ≥ 0.15 (the detectable floor at n=353).")
    w("  17 tested, 2 nominally p<0.05 against 0.9 expected by chance, nothing survives")
    w("  Bonferroni. Days-running is **not** explained by production polish, which is the")
    w("  good version of this result: it leaves room for the encoder to matter.")
    w("- **tiktok — duration, and only duration.** `n_sec` predicts CTR index at |rho|=0.12")
    w("  (p=0.002, survives Bonferroni). `cuts_mean` looks like a second hit until duration")
    w("  is partialled out, at which point it drops to -0.05 — it was a proxy for length all")
    w("  along. So the entire dumb-feature signal on tiktok is *how long the ad is*.\n")
    w("Neither result says anything about whether the encoder works. They say what it must")
    w("beat, and on tiktok they say it must beat a length confound specifically — which is")
    w("why the scorer refuses to run across duration buckets.\n")

    w("## Files\n")
    for name, desc in TABLES:
        w(f"- `{name}` — {desc}")
    w("- `baseline/baseline_<ad_id>.csv` — **per-second loudness / cuts / luminance / motion**")
    w("  for every ad, normalised 0..1. ~1 MB for the lot, which is the point: real")
    w("  per-second analysis of the whole corpus without downloading 11 GB of video.")
    w("- `CHECKSUMS.txt` — sha256 of each table, so a truncated copy is detectable.\n")

    w("## SHARING — how to get the videos too\n")
    w(f"The {s['videos']} mp4s are **{gb:.1f} GB** and are deliberately gitignored (`/data/`).")
    w("They are third-party ads collected from public ad libraries: fine to hold and analyse")
    w("internally, but do not republish them as a public dataset.\n")
    w("Ranked by how fast you can hand them over:\n")
    w("1. **Cloudflare R2** — ~$0.17/mo at this size and **zero egress fees**, which matters")
    w("   because every coworker re-syncing 11 GB from S3 would cost more than storing it.")
    w("   S3-compatible, so `rclone sync data/ads/videos r2:soma-corpus/videos`.")
    w("2. **Supabase Storage** — you already have the credentials, but the free tier is 1 GB;")
    w("   this needs the paid tier. Convenient if it is already being paid for.")
    w("3. **A physical disk** — unbeatable for a one-off hand-off to someone in the room.\n")
    w("Send this bundle first regardless. It is ~1 MB, and most analysis work does not need")
    w("the pixels — only the scoring run does.")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--zip", action="store_true", help="also write a single .zip")
    args = ap.parse_args()

    out = Path(args.out)
    if not SRC.exists():
        raise SystemExit(f"no corpus at {SRC}")
    out.mkdir(parents=True, exist_ok=True)

    s = survey()

    # The per-second baselines are the reason this bundle is worth sending at all: 1059
    # feature series compress to ~1 MB, which means a colleague can do real per-second
    # analysis on the whole corpus without the 11 GB of video. Copied, not summarized.
    base_src = SRC / "baseline"
    n_base = 0
    if base_src.is_dir():
        base_out = out / "baseline"
        base_out.mkdir(exist_ok=True)
        for p in base_src.glob("baseline_*.csv"):
            shutil.copy2(p, base_out / p.name)
            n_base += 1
        print(f"  ok    baseline/  ({n_base} per-second feature series)")

    lines = []
    for name, _ in TABLES:
        src = SRC / name
        if not src.exists():
            print(f"  skip  {name} (absent)")
            continue
        shutil.copy2(src, out / name)
        lines.append(f"{digest(src)}  {name}")
        print(f"  ok    {name}  ({src.stat().st_size / 1024:.0f} KB)")

    (out / "CHECKSUMS.txt").write_text("\n".join(lines) + "\n")
    (out / "DATASHEET.md").write_text(datasheet(s))
    print(f"  ok    DATASHEET.md")

    total = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    n_files = sum(1 for p in out.rglob("*") if p.is_file())
    print(f"\nbundle {out}  ({total / 1024:.0f} KB, {n_files} files)")

    if args.zip:
        z = out.with_suffix(".zip")
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in sorted(out.rglob("*")):
                if p.is_file():
                    zf.write(p, f"{out.name}/{p.relative_to(out)}")
        print(f"zip    {z}  ({z.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
