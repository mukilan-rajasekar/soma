#!/usr/bin/env python3
"""
clean.py — reconcile the corpus against the video files and split it into the two
datasets it has always actually been.

    python tools/corpus/probe.py        # first: read the truth off the files
    python tools/corpus/clean.py        # then: this
    python tools/corpus/clean.py --apply   # write the files instead of dry-running

WHAT IT FIXES

1. `duration_s` was missing on 204 rows. It is present on every video file, so the file
   wins and the blanks get filled.
2. Twenty-eight tiktok entries are long-form video, not ads — up to 25 minutes. Seven of
   those were invisible until the durations were backfilled, because a row with no
   duration cannot fail a duration filter.
3. `primary_label` holds days-running for meta and a CTR index for tiktok. One column,
   two incompatible quantities. Anything that reads the corpus as a single table is
   silently wrong, so this writes ONE MANIFEST PER PLATFORM and stops relying on
   everybody remembering to filter.

WHAT IT REFUSES TO DO: delete rows. Exclusions are written as an `exclude_reason` column
and the row stays. A dropped row is an unfalsifiable claim — six months on, nobody can
tell a bad ad from one you never had. Filtering happens at read time, from a reason you
can audit.
"""
import argparse
import csv
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADS = ROOT / "data" / "ads"

AD_MAX_SECONDS = 180   # matches is_an_ad() in meta_ads.py
AD_MIN_SECONDS = 3

# Columns lifted from ad_media.csv into ad_performance.csv. Not everything — only what a
# model or an analyst would actually condition on.
MEDIA_COLS = ["width", "height", "aspect_ratio", "orientation", "fps", "has_audio", "size_mb"]

PLATFORM_LABEL = {"meta": "days_running", "tiktok": "ctr_index"}


def num(row, col):
    v = (row.get(col) or "").strip()
    try:
        return float(v)
    except ValueError:
        return None


def exclusion_for(perf_row, media_row):
    """Why this ad should not train a model. Empty string means it is fine.

    Ordered by severity: a 25-minute file is not an ad at all, which matters more than it
    also happening to be silent."""
    if not media_row:
        return "no_video"
    if media_row.get("probe_error"):
        return "unreadable"
    d = num(media_row, "duration_s")
    if d is None:
        return "no_duration"
    if d > AD_MAX_SECONDS:
        return f"long_form_{d:.0f}s"
    if d < AD_MIN_SECONDS:
        return f"too_short_{d:.1f}s"
    if media_row.get("has_audio") == "0":
        # Not fatal, but Communication Clarity is 25% of the score and unmeasurable here.
        return "silent"
    return ""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write files (default: dry run)")
    args = ap.parse_args()

    media_path = ADS / "ad_media.csv"
    if not media_path.exists():
        raise SystemExit("no ad_media.csv — run tools/corpus/probe.py first")

    media = {r["ad_id"]: r for r in csv.DictReader(open(media_path))}
    perf = list(csv.DictReader(open(ADS / "ad_performance.csv")))
    man = {r["ad_id"]: r for r in csv.DictReader(open(ADS / "ad_manifest.csv"))}

    filled, changed, excl = 0, 0, {}
    for r in perf:
        m = media.get(r["ad_id"])
        if m:
            probed = num(m, "duration_s")
            existing = num(r, "duration_s")
            if probed is not None:
                if existing is None:
                    filled += 1
                elif abs(existing - probed) > max(1.0, 0.05 * probed):
                    changed += 1
                r["duration_s"] = f"{probed:.2f}"
            for c in MEDIA_COLS:
                r[c] = m.get(c, "")
        reason = exclusion_for(r, m)
        r["exclude_reason"] = reason
        if reason:
            excl[reason.split("_")[0] if reason[0].isalpha() else reason] = \
                excl.get(reason.split("_")[0] if reason[0].isalpha() else reason, 0) + 1

    keep = [r for r in perf if not r["exclude_reason"]]

    print(f"duration backfilled from file : {filled}")
    print(f"duration corrected (>5% off)  : {changed}")
    print(f"\nexclusions ({len(perf) - len(keep)} of {len(perf)}):")
    for k, v in sorted(excl.items(), key=lambda kv: -kv[1]):
        print(f"  {k:14} {v}")

    print(f"\nclean corpus: {len(keep)} ads")
    for plat in sorted({r["platform"] for r in perf}):
        allp = [r for r in perf if r["platform"] == plat]
        kp = [r for r in keep if r["platform"] == plat]
        print(f"  {plat:8} {len(kp):5} of {len(allp):5}  (label = {PLATFORM_LABEL.get(plat,'?')})")

    if not args.apply:
        print("\ndry run — nothing written. Re-run with --apply.")
        return

    # Back up before touching anything: this rewrites a file that took two scraping
    # sweeps to build, and the probe is new code.
    bak = ADS / "ad_performance.csv.prereconcile"
    if not bak.exists():
        shutil.copy2(ADS / "ad_performance.csv", bak)
        print(f"\nbacked up -> {bak.name}")

    fields = list(perf[0].keys())
    with open(ADS / "ad_performance.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(perf)
    print(f"wrote ad_performance.csv  (+{len(MEDIA_COLS)} media cols, +exclude_reason)")

    # Per-platform manifests, in the ad_id,outcome schema ad_backtest.py expects. These
    # are the files to actually point the backtest at.
    for plat in sorted({r["platform"] for r in perf}):
        rows = [r for r in keep if r["platform"] == plat]
        out = ADS / f"ad_manifest_{plat}.csv"
        with open(out, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["ad_id", "outcome", "platform", "note"])
            for r in rows:
                src = man.get(r["ad_id"], {})
                w.writerow([r["ad_id"], r["primary_label"], plat, src.get("note", "")])
        print(f"wrote {out.name:26} {len(rows):5} ads   outcome = {PLATFORM_LABEL.get(plat,'?')}")

    print("\nnext:")
    print("  .venv/bin/python ad_backtest.py --manifest data/ads/ad_manifest_meta.csv --score arc")
    print("  (meta first: it is the half with failures in it)")


if __name__ == "__main__":
    main()
