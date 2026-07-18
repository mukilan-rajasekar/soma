#!/usr/bin/env python3
"""
tvsum_trim.py — do the CHEAP, no-GPU prep on your laptop so Colab only spends its
GPU minutes on the actual brain-math.

WHAT IT DOES (all free, all on your Mac):
  1. Reuses (or downloads) the 641 MB TVSum50 archive.
  2. Extracts it + unzips the nested video zip TVSum hides inside.
  3. For the first --n videos, uses ffmpeg to make a SMALL clip:
       - trims to the FIRST --sec seconds (from t=0 — see the honesty note),
       - downscales to --height px tall (keeps aspect; never upscales),
       - re-encodes to a compact mp4.
  4. Copies ydata-tvsum50.mat next to your data/ so tvsum_prep.py can use it
     locally — the annotations never need to travel through Colab.

Then you upload ONLY the small clips folder to Google Drive, and Colab's light
path (Cell 2B) runs the model straight off Drive — no 641 MB download, no ffmpeg,
no extraction on the GPU clock.

WHY TRIM FROM t=0 (honesty — do not change to a middle offset):
  The validator (honest_corr_timeseries.py) lines up the brain arc with the human
  interest arc by *video second*: model-second t is compared to human-second t. If
  you trim from the start, clip-second t == video-second t, so the first --sec
  seconds of both series line up exactly and the validator simply ignores the
  shots past the trim. Trim from the MIDDLE and that mapping breaks — the numbers
  would be silently wrong. So: always from the start.

USAGE:
  python tvsum_trim.py --n 3 --sec 120            # 3 clips, first 2 min each
  python tvsum_trim.py --n 10 --sec 120 --height 360
  python tvsum_trim.py --archive ~/Downloads/tvsum50_ver_1_1.tgz   # reuse a download

Needs ffmpeg:  brew install ffmpeg
"""
import argparse
import collections
import os
import shutil
import subprocess
import sys
from pathlib import Path

URL = "http://people.csail.mit.edu/yalesong/tvsum/tvsum50_ver_1_1.tgz"
VIDEO_EXTS = (".mp4", ".webm", ".mkv", ".avi", ".mov", ".m4v", ".flv", ".mpg", ".mpeg")
HERE = Path(__file__).resolve().parent


def _find_archive(explicit):
    """Reuse an already-downloaded tgz if we can find one, else return None."""
    cands = []
    if explicit:
        cands.append(Path(explicit).expanduser())
    cands += [
        HERE / "data" / "tvsum50_ver_1_1.tgz",
        HERE / "tvsum50_ver_1_1.tgz",
        Path.home() / "Downloads" / "tvsum50_ver_1_1.tgz",
    ]
    for c in cands:
        if c.exists() and c.stat().st_size > 100_000_000:  # a real 641 MB file, not a stub
            return c
    return None


def _get_archive(explicit, raw_dir):
    tgz = _find_archive(explicit)
    if tgz:
        print(f"[archive] reusing {tgz}  ({tgz.stat().st_size/1e6:.0f} MB)")
        return tgz
    raw_dir.mkdir(parents=True, exist_ok=True)
    tgz = raw_dir / "tvsum50_ver_1_1.tgz"
    print(f"[archive] downloading TVSum50 (641 MB) -> {tgz}")
    if shutil.which("wget"):
        subprocess.run(["wget", "-q", "--show-progress", "-O", str(tgz), URL], check=True)
    elif shutil.which("curl"):
        subprocess.run(["curl", "-L", "--fail", "-o", str(tgz), URL], check=True)
    else:
        sys.exit("Need wget or curl to download. Or pass --archive <path to tgz>.")
    return tgz


def _extract(tgz, raw_dir):
    raw_dir.mkdir(parents=True, exist_ok=True)
    if not any(raw_dir.rglob("*.mp4")):
        print("[extract] untarring ...")
        subprocess.run(["tar", "xzf", str(tgz), "-C", str(raw_dir)], check=True)
    # TVSum nests the real videos inside .zip files — unzip those too.
    for z in sorted(raw_dir.rglob("*.zip")):
        subprocess.run(["unzip", "-o", "-q", str(z), "-d", str(z.parent)], check=False)


def _find_videos(raw_dir):
    vids = sorted(p for p in raw_dir.rglob("*")
                  if p.is_file() and p.suffix.lower() in VIDEO_EXTS)
    if not vids:
        print("[!] No video files found. What actually extracted:")
        for r, _, f in os.walk(raw_dir):
            d = r.replace(str(raw_dir), "").count(os.sep)
            if d <= 2:
                print("  " * d + os.path.basename(r) + f"/  ({len(f)} files)")
        exts = collections.Counter(os.path.splitext(f)[1].lower()
                                   for r, _, fs in os.walk(raw_dir) for f in fs)
        print("file extensions present:", exts.most_common(20))
        sys.exit("No videos in the archive — check the layout above.")
    return vids


def _trim_one(src, dst, sec, height):
    """ffmpeg: first `sec` seconds from the START, downscaled to `height` px tall."""
    vf = f"scale=-2:'min({height},ih)'" if height else None  # never upscales
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-t", str(sec), "-i", str(src)]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(dst)]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n", type=int, default=3, help="how many videos to prep (start small)")
    ap.add_argument("--sec", type=int, default=120,
                    help="seconds to keep from the START of each video (honesty: from t=0)")
    ap.add_argument("--height", type=int, default=360,
                    help="downscale to this many px tall (0 = keep original resolution)")
    ap.add_argument("--out", default=str(HERE / "data" / "clips_trimmed"),
                    help="where the small clips are written (upload THIS folder to Drive)")
    ap.add_argument("--archive", default=None, help="path to an existing tvsum50_ver_1_1.tgz")
    ap.add_argument("--raw", default=str(HERE / "data" / "tvsum_raw"),
                    help="scratch dir for the extracted archive")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found. Install it first:  brew install ffmpeg")

    raw_dir = Path(args.raw)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    tgz = _get_archive(args.archive, raw_dir)
    _extract(tgz, raw_dir)
    vids = _find_videos(raw_dir)

    # stash the annotations locally so tvsum_prep.py / `make ingest` never need Colab
    mats = sorted(raw_dir.rglob("ydata-tvsum50.mat"))
    if mats:
        dest_mat = HERE / "data" / "ydata-tvsum50.mat"
        dest_mat.parent.mkdir(parents=True, exist_ok=True)
        if not dest_mat.exists():
            shutil.copy(mats[0], dest_mat)
        print(f"[mat] annotations ready at {dest_mat}")
    else:
        print("[mat] WARNING: ydata-tvsum50.mat not found — you'll need it for tvsum_prep.py")

    picked = vids[:args.n]
    print(f"\n[trim] {len(vids)} videos in archive; prepping {len(picked)} "
          f"(first {args.sec}s, {args.height or 'orig'}px tall) -> {out_dir}\n")
    made = 0
    for v in picked:
        dst = out_dir / (v.stem + ".mp4")
        if dst.exists():
            print(f"  [skip-exists] {dst.name}")
            made += 1
            continue
        try:
            _trim_one(v, dst, args.sec, args.height)
            mb = dst.stat().st_size / 1e6
            print(f"  [ok] {dst.name}  ({mb:.1f} MB)")
            made += 1
        except subprocess.CalledProcessError as e:
            print(f"  [ERROR] {v.name}: ffmpeg failed ({e}) — skipping")

    total_mb = sum(p.stat().st_size for p in out_dir.glob("*.mp4")) / 1e6
    print(f"\n[done] {made} clip(s) in {out_dir}  (~{total_mb:.0f} MB total)")
    print("\nNext:")
    print(f"  1. Upload the folder  {out_dir}  to Google Drive at  MyDrive/soma/clips")
    print("  2. In Colab run: Cell 1 -> restart -> Cell 2B (Drive) -> Cell 3 -> Cell 4 -> Cell 5")
    print("  3. Back here, after you download the results:  make ingest ZIP=~/Downloads/soma_arcs.zip")


if __name__ == "__main__":
    main()
