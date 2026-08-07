#!/usr/bin/env python3
"""
subset.py — carve a small, self-contained training bundle out of the corpus.

    python tools/corpus/subset.py --corpus ~/soma-corpus-meta --out ~/train-videos -n 50

The meta half is 4.1 GB of video and ~77 hours of TRIBE time. Before spending that you
want a run that proves the pipeline end to end on something you can carry to the GPU box.
This writes exactly what `demo/train.py train` needs and nothing else:

    <out>/ad_manifest_meta.csv          the filtered manifest, same schema
    <out>/videos/<ad_id>.mp4            find_video() resolves ad_id -> videos/<ad_id>.mp4
    <out>/baseline/baseline_<ad_id>.csv the four per-second control series

THE MANIFEST FILENAME IS LOAD-BEARING. load_labels() hardcodes "ad_manifest_meta.csv"
for --target meta. Rename it and the run dies before the first video.

BASELINE IS NOT OPTIONAL, despite being 4 KB per ad. Without it control_series() falls
through to decoding the video with opencv; in `train` that RuntimeError is caught PER-AD,
so every ad skips silently and the run ends on a bare "No ads have both extracted
features and labels" with nothing pointing at the cause. Shipping it costs 220 KB.

WHY WHOLE ADVERTISERS, AND NOT THE FIRST N ROWS
    82% of the variance in log1p(days_running) is BETWEEN advertiser, which is why
    advertiser is the CV grouping key. Take the first 50 rows of the manifest and you get
    50 distinct advertisers and ZERO same-advertiser pairs: the grouping does nothing, and
    you lose the comparison the datasheet says to trust first (same brand, similar budget
    and audience, so creative is close to the only thing moving).

    So selection works in whole advertisers, drawn from a band of ads-per-brand. The band
    matters in both directions. Too small and there are no within-advertiser pairs; too
    large and a handful of brands eat the whole subset, leaving fewer groups than folds —
    group_kfold() silently clamps n_splits to the number of advertisers, so asking for 5
    folds across 3 brands gives you 3 folds of one-brand-each and a very noisy rho.

SPANNING THE OUTCOME RANGE
    Advertisers are ordered by their median outcome and walked with an even stride, so the
    subset reaches from the failure end (ads that ran <= 14 days) to the long runs rather
    than clustering wherever the manifest happened to be sorted. Deterministic: a sorted
    ordering and a fixed stride, no sampling, so the same corpus yields the same subset.

WHAT A SUBSET THIS SIZE CAN AND CANNOT ANSWER
    At n=50 the detectable effect is about |rho| 0.39; the dumb-ffmpeg floor to beat is
    0.115. This CANNOT tell you whether the encoder works, and a rho either way is not
    evidence about it. It tells you the plumbing is sound: lanes populated, no all-NaN
    feature columns, onsets real rather than the arange fallback, alpha selection sane.
"""
import argparse
import collections
import csv
import re
import shutil
import statistics
import sys
from pathlib import Path

MANIFEST = {"meta": "ad_manifest_meta.csv", "tiktok": "ad_manifest_tiktok.csv"}
VIDEO_EXTENSIONS = (".mp4", ".mov", ".webm", ".m4v", ".mkv")

# Ads-per-advertiser band. Both ends are load-bearing; see the module docstring.
DEFAULT_MIN_ADS = 2
DEFAULT_MAX_ADS = 6


def advertiser_of(row):
    """The advertiser, parsed out of the note string exactly as train.py does.

    Rows with no page_ token are dropped rather than given a __solo__ id: a singleton
    group contributes nothing to grouped CV and would only dilute the subset.
    """
    match = re.search(r"page_([^;]+)", row.get("note", "") or "")
    return match.group(1).strip() if match else None


def group_by_advertiser(rows, min_ads, max_ads):
    groups = collections.defaultdict(list)
    for row in rows:
        name = advertiser_of(row)
        if name:
            groups[name].append(row)
    return {
        name: ads for name, ads in groups.items()
        if min_ads <= len(ads) <= max_ads
    }


def select(pool, target_n):
    """Pick whole advertisers spanning the outcome range until target_n ads."""
    if not pool:
        sys.exit("No advertisers in the requested ads-per-advertiser band.")

    ordered = sorted(
        pool.items(),
        key=lambda item: (
            statistics.median(float(row["outcome"]) for row in item[1]),
            item[0],          # name breaks ties, so the ordering is total
        ),
    )

    mean_size = sum(len(ads) for ads in pool.values()) / len(pool)
    stride = len(ordered) / max(target_n / mean_size, 1.0)

    picked = []
    taken = set()
    cursor = 0.0
    count = 0
    while count < target_n and len(taken) < len(ordered):
        index = int(cursor) % len(ordered)
        while index in taken:
            index = (index + 1) % len(ordered)
        taken.add(index)
        picked.append(ordered[index])
        count += len(ordered[index][1])
        cursor += stride
    return picked


def find_video(videos_dir, ad_id):
    for extension in VIDEO_EXTENSIONS:
        path = videos_dir / f"{ad_id}{extension}"
        if path.exists():
            return path
    return None


def summarize(picked, rows):
    outcomes = sorted(float(row["outcome"]) for row in rows)
    n = len(outcomes)
    pairs = sum(len(ads) * (len(ads) - 1) // 2 for _, ads in picked)
    print(f"selected {n} ads from {len(picked)} advertisers")
    print(f"  advertiser sizes       : {sorted((len(a) for _, a in picked), reverse=True)}")
    print(f"  within-advertiser pairs: {pairs}")
    print(f"  outcome                : min {outcomes[0]:.0f}  median "
          f"{outcomes[n // 2]:.0f}  max {outcomes[-1]:.0f}")
    print(f"  ran <= 14 days         : {sum(1 for v in outcomes if v <= 14)} "
          f"of {n}  (the failure end)")
    print(f"  advertisers            : "
          f"{', '.join(f'{name}({len(ads)})' for name, ads in sorted(picked))}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", required=True, help="the soma-corpus-meta bundle")
    parser.add_argument("--out", required=True, help="directory to write (must not exist)")
    parser.add_argument("-n", "--n-ads", type=int, default=50)
    parser.add_argument("--target", choices=("meta", "tiktok"), default="meta")
    parser.add_argument("--min-ads", type=int, default=DEFAULT_MIN_ADS)
    parser.add_argument("--max-ads", type=int, default=DEFAULT_MAX_ADS)
    parser.add_argument("--force", action="store_true", help="overwrite --out if it exists")
    args = parser.parse_args()

    corpus = Path(args.corpus).expanduser()
    out = Path(args.out).expanduser()
    manifest = corpus / MANIFEST[args.target]
    videos_dir = corpus / "videos"
    baseline_dir = corpus / "baseline"

    for path in (manifest, videos_dir, baseline_dir):
        if not path.exists():
            sys.exit(f"missing from the corpus: {path}")
    if out.exists():
        if not args.force:
            sys.exit(f"{out} exists; pass --force to overwrite")
        shutil.rmtree(out)

    with manifest.open() as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames
        rows = list(reader)

    picked = select(group_by_advertiser(rows, args.min_ads, args.max_ads), args.n_ads)
    selected = sorted((row for _, ads in picked for row in ads),
                      key=lambda row: row["ad_id"])

    # Refuse to write a bundle that would train on fewer ads than it claims. A video that
    # find_video() cannot resolve is skipped by train.py with no message at all.
    missing = [
        row["ad_id"] for row in selected
        if find_video(videos_dir, row["ad_id"]) is None
        or not (baseline_dir / f"baseline_{row['ad_id']}.csv").exists()
    ]
    if missing:
        sys.exit(f"{len(missing)} selected ads lack a video or baseline: {missing[:5]}")

    (out / "videos").mkdir(parents=True)
    (out / "baseline").mkdir(parents=True)
    with (out / MANIFEST[args.target]).open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(selected)

    total_bytes = 0
    for row in selected:
        ad_id = row["ad_id"]
        video = find_video(videos_dir, ad_id)
        shutil.copy2(video, out / "videos" / video.name)
        shutil.copy2(baseline_dir / f"baseline_{ad_id}.csv",
                     out / "baseline" / f"baseline_{ad_id}.csv")
        total_bytes += video.stat().st_size

    summarize(picked, selected)
    print()
    print(f"wrote {out}  ({total_bytes / 1e6:.0f} MB of video)")
    print()
    print("on the GPU box:")
    print(f"  ./scripts/warm_arcs.sh {out} {args.target}")
    print(f"  .venv/bin/python demo/train.py train --corpus {out} --target {args.target} \\")
    print(f"    --temporal shape --folds 5 --baseline-dir {out}/baseline \\")
    print(f"    --cache-dir data/ad_head --out data/ad_head/ad_head_{args.target}.json")


if __name__ == "__main__":
    main()
