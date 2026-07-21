#!/usr/bin/env python3
"""
veatic_prep.py — VEATIC per-frame valence/arousal -> canonical human_affect_<id>.csv
(t_sec, valence, arousal) at 1 Hz, and (optionally) stage its shipped clips for Colab.

WHY THIS EXISTS
---------------
VEATIC is the fastest COGNIMUSE-style swap: it SHIPS the video clips AND continuous
per-frame VA, so there's zero film-sourcing. Use it as a quick second proxy run.

HONESTY (important — weaker target than COGNIMUSE/LIRIS)
-------------------------------------------------------
VEATIC labels the emotion of ONE selected TARGET CHARACTER per clip (shown circled), i.e.
inferred CHARACTER affect, NOT the viewer's own induced valence/arousal. TRIBE's head reads
the VIEWER's brain state, so this is a PERCEIVED/auxiliary signal, not viewer-induced ground
truth. Every emitted CSV is for a character-affect target — treat a correlation as a weak,
supporting check, and say so.

VERIFIED FORMAT (from the VEATIC repo: dataset.py, video_frame.py, README, paper)
---------------------------------------------------------------------------------
- 124 clips, ids 0..123, all 25 fps, valence & arousal in [-1, 1].
- rating_averaged/ holds, per clip, EITHER  <id>_valence.csv + <id>_arousal.csv  (headerless,
  the value is the last column, one row per frame)  OR a combined  <id>.csv. We probe both.
- video/<id>.mp4 shipped. Download bundle: gdown 1HZIw8RGsRwwENhJlhNJRL88YyfiE442N
  (https://github.com/AlbusPeter/VEATIC).
- Loader: t_sec = frame_index / fps (fps read from the mp4, default 25), mean-pool the 25 Hz
  per-frame values into 1-second bins -> one row/second.

USAGE
-----
  # annotations only (first 20 clips), reading from the extracted VEATIC bundle:
  python veatic_prep.py --veatic-dir ~/VEATIC --ids 0-19 --out data/veatic
  # also stage downscaled clips for Colab (named <prefix><id>.mp4):
  python veatic_prep.py --veatic-dir ~/VEATIC --ids 0-19 --out data/veatic \
      --stage-clips --clips-out data/clips_veatic
"""
import argparse
import glob
import os
import shutil
import subprocess

import numpy as np

from honest_corr_timeseries import resample_to_grid
from liris_prep import write_human_arc


def _parse_ids(spec):
    """'0,1,5-8' -> [0,1,5,6,7,8]. None/'' -> None (all)."""
    if not spec:
        return None
    out = []
    for tok in spec.split(","):
        tok = tok.strip()
        if "-" in tok:
            a, b = tok.split("-", 1)
            out.extend(range(int(a), int(b) + 1))
        elif tok:
            out.append(int(tok))
    return sorted(set(out))


def _load_perframe(path):
    """VEATIC split CSV [frame_index, value] (headerless) -> the value column."""
    arr = np.loadtxt(path, delimiter=",")
    return arr.astype(float) if arr.ndim == 1 else arr[:, -1].astype(float)


def _load_combined(path):
    """VEATIC combined <id>.csv -> (valence, arousal). Handles [val,aro] or [idx,val,aro]."""
    arr = np.loadtxt(path, delimiter=",")
    if arr.ndim == 1:
        return arr.astype(float), None
    if arr.shape[1] >= 3:
        return arr[:, -2].astype(float), arr[:, -1].astype(float)
    return arr[:, 0].astype(float), arr[:, 1].astype(float)


def load_va(rating_dir, vid):
    """Per-frame (valence, arousal) for a clip id, probing both file conventions."""
    vp = os.path.join(rating_dir, f"{vid}_valence.csv")
    ap = os.path.join(rating_dir, f"{vid}_arousal.csv")
    cp = os.path.join(rating_dir, f"{vid}.csv")
    if os.path.exists(vp) and os.path.exists(ap):
        return _load_perframe(vp), _load_perframe(ap)
    if os.path.exists(cp):
        return _load_combined(cp)
    return None, None


def clip_fps(video_path, default=25.0):
    if video_path and os.path.exists(video_path) and shutil.which("ffprobe"):
        try:
            out = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", video_path],
                capture_output=True, text=True, check=True).stdout.strip()
            num, den = (out.split("/") + ["1"])[:2] if "/" in out else (out, "1")
            f = float(num) / float(den)
            if f > 0:
                return f
        except Exception:
            pass
    return default


def to_1hz(valence, arousal, fps):
    """Mean-pool per-frame VA (at fps) into integer-second bins -> (t_sec, val, aro)."""
    n = min(len(valence), len(arousal)) if arousal is not None else len(valence)
    valence = np.asarray(valence[:n], float)
    arousal = np.asarray(arousal[:n], float) if arousal is not None else None
    t_frame = np.arange(n) / float(fps)
    dur = n / float(fps)
    edges = np.arange(0.0, np.floor(dur) + 1.0)
    if len(edges) < 2:
        edges = np.array([0.0, max(1.0, dur)])
    t_sec = edges[:-1]
    val = resample_to_grid(t_frame, valence, edges)
    aro = (resample_to_grid(t_frame, arousal, edges) if arousal is not None
           else np.zeros_like(val))
    return t_sec, val, aro


def _downscale(src, dst, height):
    vf = f"scale=-2:'min({height},ih)'" if height else None
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src)]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(dst)]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--veatic-dir", required=True,
                    help="extracted VEATIC bundle (has video/ and rating_averaged/)")
    ap.add_argument("--out", default="data/veatic", help="output dir for human_affect_<id>.csv")
    ap.add_argument("--ids", default=None, help="subset, e.g. '0-19' or '0,5,10' (default: all)")
    ap.add_argument("--prefix", default="veatic",
                    help="id prefix so files/clips are unambiguous (default 'veatic' -> veatic0)")
    ap.add_argument("--fps", type=float, default=None, help="override fps (default: read per clip, 25)")
    ap.add_argument("--stage-clips", action="store_true",
                    help="also downscale + copy the matching clips for Colab")
    ap.add_argument("--clips-out", default="data/clips_veatic")
    ap.add_argument("--height", type=int, default=360, help="downscale px tall (0 = original)")
    args = ap.parse_args()

    # expand ~ ourselves — a quoted "~/VEATIC" reaches us literally (no shell expansion)
    args.veatic_dir = os.path.expanduser(args.veatic_dir)
    args.out = os.path.expanduser(args.out)
    args.clips_out = os.path.expanduser(args.clips_out)

    rating_dir = os.path.join(args.veatic_dir, "rating_averaged")
    # the shipped bundle uses videos/ (plural); older docs say video/ — probe both.
    video_dir = next((os.path.join(args.veatic_dir, d) for d in ("videos", "video")
                      if os.path.isdir(os.path.join(args.veatic_dir, d))),
                     os.path.join(args.veatic_dir, "videos"))
    if not os.path.isdir(rating_dir):
        rating_dir = args.veatic_dir                       # allow pointing straight at ratings
    # discover clip ids from the rating files
    found = set()
    for p in glob.glob(os.path.join(rating_dir, "*.csv")):
        stem = os.path.splitext(os.path.basename(p))[0]
        stem = stem.replace("_valence", "").replace("_arousal", "")
        if stem.isdigit():
            found.add(int(stem))
    want = _parse_ids(args.ids)
    ids = sorted(found & set(want)) if want is not None else sorted(found)
    if not ids:
        raise SystemExit(f"No VEATIC rating CSVs found in {rating_dir!r} "
                         f"(matching ids {args.ids or 'all'}). Point --veatic-dir at the bundle.")

    os.makedirs(args.out, exist_ok=True)
    if args.stage_clips:
        os.makedirs(args.clips_out, exist_ok=True)
        if not shutil.which("ffmpeg"):
            raise SystemExit("--stage-clips needs ffmpeg (brew install ffmpeg).")

    print(f"VEATIC: {len(ids)} clip(s) -> {args.out}"
          + (f" + clips -> {args.clips_out}" if args.stage_clips else ""))
    print(f"{'id':<10}{'fps':>5}{'n_sec':>7}   val[min,max]     aro[min,max]")
    print("-" * 60)
    n_ok = 0
    for vid in ids:
        valence, arousal = load_va(rating_dir, vid)
        if valence is None:
            print(f"{args.prefix}{vid:<10} [skip] no rating CSV")
            continue
        video = os.path.join(video_dir, f"{vid}.mp4")
        fps = args.fps or clip_fps(video)
        t, val, aro = to_1hz(valence, arousal, fps)
        if len(t) < 2:
            print(f"{args.prefix}{vid:<10} [skip] too short")
            continue
        oid = f"{args.prefix}{vid}"
        write_human_arc(os.path.join(args.out, f"human_affect_{oid}.csv"), t, val, aro)
        print(f"{oid:<10}{fps:>5.0f}{len(t):>7}   [{val.min():+.2f},{val.max():+.2f}]   "
              f"[{aro.min():+.2f},{aro.max():+.2f}]")
        if args.stage_clips and os.path.exists(video):
            dst = os.path.join(args.clips_out, f"{oid}.mp4")
            if not os.path.exists(dst):
                try:
                    _downscale(video, dst, args.height)
                except subprocess.CalledProcessError as e:
                    print(f"    [warn] clip {oid}: ffmpeg failed ({e})")
        n_ok += 1

    print(f"\n[done] wrote {n_ok} human_affect_<id>.csv to {args.out}. Feed with: "
          f"affect_head.py --target-dir {args.out}")
    print("Reminder: VEATIC is CHARACTER affect (target person), NOT viewer-induced — a weak "
          "auxiliary target, not ground truth for a viewer-brain head.")


if __name__ == "__main__":
    main()
