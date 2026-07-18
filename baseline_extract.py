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


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video-dir", required=True)
    ap.add_argument("--out", default="./data/baseline")
    ap.add_argument("--glob", default="*.mp4")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    vids = sorted(glob.glob(os.path.join(args.video_dir, args.glob)))
    if not vids:
        raise SystemExit(f"No videos match {os.path.join(args.video_dir, args.glob)!r}")

    for vp in vids:
        vid = os.path.splitext(os.path.basename(vp))[0]
        vf = video_features_per_sec(vp)
        if vf is None:
            print(f"  [skip] {vid}: no frames read"); continue
        lum, cut, mot = vf
        loud = audio_loudness_per_sec(vp)
        n = len(lum)
        if loud is None or len(loud) == 0:
            loud = np.zeros(n)
        loud = np.interp(np.arange(n), np.linspace(0, n - 1, len(loud)), loud) if len(loud) != n else loud
        # normalize each feature 0..1 for comparability
        norm = lambda a: (a - a.min()) / (np.ptp(a) + 1e-9)
        L, C, U, Mo = norm(loud), norm(cut), norm(lum), norm(mot)
        with open(os.path.join(args.out, f"baseline_{vid}.csv"), "w") as f:
            f.write("t_sec,loudness,cuts,luminance,motion\n")
            for t in range(n):
                f.write(f"{t},{L[t]:.4f},{C[t]:.4f},{U[t]:.4f},{Mo[t]:.4f}\n")
        print(f"  {vid}: {n}s baseline (loudness/cuts/luminance/motion)")

    print(f"\n[done] baselines in {args.out}. Next: incremental_validity.py to test whether "
          "the brain arc\npredicts human interest OVER AND ABOVE these dumb features.")


if __name__ == "__main__":
    main()
