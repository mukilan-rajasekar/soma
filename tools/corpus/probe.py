#!/usr/bin/env python3
"""
probe.py — read the technical truth off every video and write data/ads/ad_media.csv.

    python tools/corpus/probe.py
    python tools/corpus/probe.py --jobs 12

WHY THIS BEATS THE CSV WE ALREADY HAVE. `ad_performance.duration_s` came from whatever
the ad library reported, and 204 of 1059 rows simply do not have it. The file on disk
does not have that problem: it is the same file the scorer will read, so probing it
gives a duration for every ad AND settles disagreements in favour of the artefact rather
than the scrape.

The columns beyond duration earn their place unevenly, and it is worth knowing which.
`has_audio` is decisive: it says whether Communication Clarity — 25% of the score — can
be measured at all, and a silent video does not score 0 on clarity, it scores nothing.
`orientation` turned out NOT to be the placement variable it looks like: 94% of this
corpus is 9:16, so it is near-constant and cannot serve as a covariate. That is a real
finding about the corpus rather than a defect in the column, and it is the reason to
measure a variable before assuming it varies.
"""
import argparse
import csv
import json
import math
import subprocess
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VIDEOS = ROOT / "data" / "ads" / "videos"
OUT = ROOT / "data" / "ads" / "ad_media.csv"

FIELDS = [
    "ad_id", "duration_s", "width", "height", "aspect_ratio", "orientation",
    "fps", "n_frames", "video_codec", "has_audio", "audio_codec", "audio_channels",
    "sample_rate", "bitrate_kbps", "size_mb", "probe_error",
]


def orientation_of(w, h):
    """Buckets, not raw ratio, because placement is categorical. The 5% tolerance keeps
    a 1080x1088 'square' from being called portrait."""
    if not w or not h:
        return ""
    r = w / h
    if r < 0.95:
        return "portrait"
    if r > 1.05:
        return "landscape"
    return "square"


def nearest_aspect(w, h):
    """Report the aspect an ad buyer would name, not 0.5625."""
    if not w or not h:
        return ""
    known = {"9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1.0, "16:9": 16 / 9, "4:3": 4 / 3, "2:3": 2 / 3}
    r = w / h
    name, best = "", 1e9
    for k, v in known.items():
        d = abs(math.log(r / v))
        if d < best:
            name, best = k, d
    # Past ~6% off, calling it a standard ratio is a lie; give the reduced fraction.
    if best > 0.06:
        f = Fraction(w, h).limit_denominator(40)
        return f"{f.numerator}:{f.denominator}"
    return name


def probe(path):
    row = {k: "" for k in FIELDS}
    row["ad_id"] = path.stem
    try:
        row["size_mb"] = f"{path.stat().st_size / 1e6:.2f}"
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json",
             "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=60,
        )
        if out.returncode != 0:
            row["probe_error"] = (out.stderr or "ffprobe failed").strip()[:120]
            return row
        d = json.loads(out.stdout)
        fmt = d.get("format", {})
        streams = d.get("streams", [])
        v = next((s for s in streams if s.get("codec_type") == "video"), None)
        a = next((s for s in streams if s.get("codec_type") == "audio"), None)

        dur = fmt.get("duration") or (v or {}).get("duration")
        if dur:
            row["duration_s"] = f"{float(dur):.2f}"
        if fmt.get("bit_rate"):
            row["bitrate_kbps"] = f"{float(fmt['bit_rate']) / 1000:.0f}"

        if v:
            w, h = v.get("width"), v.get("height")
            row["width"], row["height"] = w or "", h or ""
            row["aspect_ratio"] = nearest_aspect(w, h)
            row["orientation"] = orientation_of(w, h)
            row["video_codec"] = v.get("codec_name", "")
            row["n_frames"] = v.get("nb_frames", "")
            rate = v.get("avg_frame_rate") or v.get("r_frame_rate") or ""
            if "/" in rate:
                n, dnm = rate.split("/")
                # avg_frame_rate is 0/0 on some streams; that is 'unknown', not zero.
                if float(dnm) > 0 and float(n) > 0:
                    row["fps"] = f"{float(n) / float(dnm):.2f}"
        else:
            row["probe_error"] = "no video stream"

        row["has_audio"] = "1" if a else "0"
        if a:
            row["audio_codec"] = a.get("codec_name", "")
            row["audio_channels"] = a.get("channels", "")
            row["sample_rate"] = a.get("sample_rate", "")
    except subprocess.TimeoutExpired:
        row["probe_error"] = "timeout"
    except Exception as e:  # a corpus-wide probe must not die on one bad file
        row["probe_error"] = f"{type(e).__name__}: {e}"[:120]
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    paths = sorted(VIDEOS.glob("*.mp4"))
    if not paths:
        raise SystemExit(f"no videos under {VIDEOS}")
    print(f"probing {len(paths)} videos with {args.jobs} workers")

    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        rows = list(ex.map(probe, paths))

    rows.sort(key=lambda r: r["ad_id"])
    with open(args.out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    bad = [r for r in rows if r["probe_error"]]
    noaud = [r for r in rows if r["has_audio"] == "0"]
    print(f"  ok       {len(rows) - len(bad)}/{len(rows)}")
    print(f"  errors   {len(bad)}")
    for r in bad[:10]:
        print(f"           {r['ad_id']}: {r['probe_error']}")
    print(f"  silent   {len(noaud)}  (clarity is unmeasurable on these)")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
