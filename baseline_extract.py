#!/usr/bin/env python3
"""
baseline_extract.py — the "dumb baseline": per-second low-level audiovisual
features straight from the video file (NO brain model).

WHY THIS IS NON-NEGOTIABLE (red-team finding): a lot of predicted brain activation
is itself DRIVEN by loudness, cuts, and motion. If the brain arc doesn't predict
human interest OVER AND ABOVE these cheap features, you're selling an expensive
motion detector. This extractor produces the baseline; incremental_validity.py then
checks whether the brain adds anything. It also fills the demo's "beats baseline?"
box.

Per-second features (all CPU, laptop-friendly):
  loudness   — audio RMS per second (via ffmpeg → PCM → numpy)
  cuts       — scene-cut intensity (mean abs frame-to-frame difference)
  luminance  — mean brightness
  motion     — mean absolute optical-flow-ish frame delta magnitude

Output: baseline_<id>.csv  (t_sec, loudness, cuts, luminance, motion)

USAGE:
  pip install opencv-python-headless imageio-ffmpeg numpy
  python baseline_extract.py --video-dir ./clips --out ./data/baseline
"""
import argparse
import glob
import os
import subprocess
from concurrent.futures import ProcessPoolExecutor

import numpy as np


def _ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def audio_loudness_per_sec(video_path, duration_hint=None, sr=16000):
    """Extract mono PCM via ffmpeg and return RMS loudness per second (0..1-ish)."""
    exe = _ffmpeg_exe()
    cmd = [exe, "-v", "error", "-i", video_path, "-ac", "1", "-ar", str(sr),
           "-f", "s16le", "-"]
    try:
        raw = subprocess.run(cmd, capture_output=True).stdout
    except Exception:
        return None
    if not raw:
        return None
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    n_sec = max(1, len(x) // sr)
    x = x[: n_sec * sr].reshape(n_sec, sr)
    rms = np.sqrt((x ** 2).mean(axis=1) + 1e-9)
    return rms


def video_features_per_sec(video_path):
    """cuts, luminance, motion per second via OpenCV."""
    import cv2
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    lum, cut, mot = {}, {}, {}
    prev = None
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        sec = int(idx / fps)
        g = cv2.cvtColor(cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        lum.setdefault(sec, []).append(g.mean() / 255.0)
        if prev is not None:
            d = np.abs(g - prev)
            mot.setdefault(sec, []).append(d.mean() / 255.0)
            cut.setdefault(sec, []).append((d > 40).mean())   # fraction of changed px
        prev = g
        idx += 1
    cap.release()
    if not lum:
        return None
    n = max(lum) + 1
    agg = lambda d: np.array([np.mean(d.get(s, [0.0])) for s in range(n)])
    return agg(lum), agg(cut), agg(mot)


def extract_one(job):
    """One video -> one baseline CSV. Module-level and self-contained so it can be handed
    to a process pool.

    THE FEATURE MATH BELOW IS UNCHANGED FROM THE SERIAL VERSION ON PURPOSE. 29 baselines
    were computed with it already; altering the resize, the >40 cut threshold or the 0..1
    norm would silently make the new rows incomparable to the old ones. Parallelism is a
    scheduling change, not a numerical one.

    Returns (id, n_seconds, status). status is "" on success, else the reason.
    """
    vp, out_dir = job
    vid = os.path.splitext(os.path.basename(vp))[0]
    dest = os.path.join(out_dir, f"baseline_{vid}.csv")
    if os.path.exists(dest):
        return (vid, 0, "skip: exists")
    try:
        vf = video_features_per_sec(vp)
    except Exception as e:
        return (vid, 0, f"error: {type(e).__name__}: {e}"[:100])
    if vf is None:
        return (vid, 0, "error: no frames read")
    lum, cut, mot = vf
    loud = audio_loudness_per_sec(vp)
    n = len(lum)
    # A silent video is NOT a quiet one. Zeroing gives a constant column that survives
    # ad_backtest's exact std()==0 guard once residualized, so the run would partial out a
    # covariate carrying no information and never say so. Flag it; the caller reports it.
    silent = loud is None or len(loud) == 0
    if silent:
        loud = np.zeros(n)
    loud = np.interp(np.arange(n), np.linspace(0, n - 1, len(loud)), loud) if len(loud) != n else loud
    # normalize each feature 0..1 for comparability
    norm = lambda a: (a - a.min()) / (np.ptp(a) + 1e-9)
    L, C, U, Mo = norm(loud), norm(cut), norm(lum), norm(mot)
    tmp = dest + ".part"
    with open(tmp, "w") as f:
        f.write("t_sec,loudness,cuts,luminance,motion\n")
        for t in range(n):
            f.write(f"{t},{L[t]:.4f},{C[t]:.4f},{U[t]:.4f},{Mo[t]:.4f}\n")
    os.replace(tmp, dest)  # a killed run leaves no half-written CSV for the next one to trust
    return (vid, n, "silent" if silent else "")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video-dir", required=True)
    ap.add_argument("--out", default="./data/baseline")
    ap.add_argument("--glob", default="*.mp4")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 4) - 2),
                    help="parallel workers; decode is CPU-bound so this is ~linear")
    ap.add_argument("--quiet", action="store_true", help="only print the summary")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    vids = sorted(glob.glob(os.path.join(args.video_dir, args.glob)))
    if not vids:
        raise SystemExit(f"No videos match {os.path.join(args.video_dir, args.glob)!r}")

    jobs = [(vp, args.out) for vp in vids]
    done, skipped, silent, errors = 0, 0, [], []
    print(f"extracting {len(jobs)} baselines with {args.jobs} workers")

    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        for i, (vid, n, status) in enumerate(ex.map(extract_one, jobs), 1):
            if status.startswith("skip"):
                skipped += 1
            elif status.startswith("error"):
                errors.append((vid, status))
            else:
                done += 1
                if status == "silent":
                    silent.append(vid)
                if not args.quiet:
                    print(f"  {vid}: {n}s baseline (loudness/cuts/luminance/motion)"
                          + ("  [SILENT - loudness is a constant]" if status == "silent" else ""))
            if args.quiet and i % 100 == 0:
                print(f"  {i}/{len(jobs)}", flush=True)

    print(f"\n  extracted {done}   already present {skipped}   errors {len(errors)}")
    for vid, status in errors[:10]:
        print(f"    {vid}: {status}")
    if silent:
        print(f"  SILENT ({len(silent)}): {', '.join(silent)}")
        print("    loudness is constant 0 for these; exclude them when partialling it out.")

    print(f"\n[done] baselines in {args.out}. Next: incremental_validity.py to test whether "
          "the brain arc\npredicts human interest OVER AND ABOVE these dumb features.")


if __name__ == "__main__":
    main()
