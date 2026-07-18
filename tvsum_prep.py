#!/usr/bin/env python3
"""
tvsum_prep.py — turn TVSum into per-video human interest arcs + per-annotator
matrices, the public replacement for the (now gone) private retention curves.

TVSum (Song et al., CVPR 2015): 50 web videos, importance rated 1-5 by 20
crowdworkers. The released annotations are PER-FRAME (one score per video frame,
at the video's fps) - NOT per-shot. We block-average frames into fixed-length
shots so the human arc shares a real seconds timebase with TRIBE's ~1 Hz arc.
Getting this wrong stretches the human timeline by ~fps*shot_sec (~50x) and
silently destroys the correlation - so we read frame counts + duration from the
.mat and downsample correctly.

GET THE DATA (low friction, ~1 hour):
  git clone https://github.com/yalesong/tvsum
  # annotations: ydata-tvsum50.mat  (MIT mirror: people.csail.mit.edu/yalesong/tvsum)

The .mat holds a struct array `tvsum50` with, per video: `video` (id), `length`
(seconds), `nframes`, and `user_anno` (nframes x 20 per-frame scores).

This script writes, per video <id>:
  <out>/human_arc_<id>.csv    cols: t_start, importance   (mean over annotators, per shot)
  <out>/human_annos_<id>.npy  array (n_annotators, n_shots)   (for the LOAO ceiling)

USAGE:
  pip install scipy numpy
  python tvsum_prep.py --mat ./tvsum/ydata-tvsum50.mat --out ./data/tvsum --shot-sec 2.0
"""
import argparse
import os

import numpy as np


def load_tvsum_mat(path):
    """Yield (video_id, user_anno[nframes, n_annot], length_sec, nframes)."""
    from scipy.io import loadmat
    mat = loadmat(path, squeeze_me=True, struct_as_record=False)
    if "tvsum50" not in mat:
        raise SystemExit(f"{path!r} has no 'tvsum50' variable. Keys: "
                         f"{[k for k in mat if not k.startswith('__')]}")
    entries = np.atleast_1d(mat["tvsum50"])
    for s in entries:
        vid = str(s.video)
        anno = np.asarray(s.user_anno, float)
        nframes = int(getattr(s, "nframes", anno.shape[0]
                              if anno.ndim == 2 else len(anno)))
        length = float(getattr(s, "length", 0.0)) or None
        # Orient to (nframes, n_annotators): the frame axis is the long one.
        if anno.ndim == 1:
            anno = anno[:, None]
        if anno.shape[0] < anno.shape[1] and anno.shape[1] == nframes:
            anno = anno.T
        elif anno.shape[0] != nframes and anno.shape[1] == nframes:
            anno = anno.T
        yield vid, anno, length, nframes


def frames_to_shots(anno, fps, shot_sec):
    """anno (nframes, n_annot) -> (n_annot, n_shots) by block-averaging frames."""
    nframes, n_annot = anno.shape
    block = max(1, int(round(fps * shot_sec)))
    n_shots = nframes // block
    if n_shots < 2:
        return None, block
    trimmed = anno[: n_shots * block]                      # drop the ragged tail
    shots = trimmed.reshape(n_shots, block, n_annot).mean(axis=1)  # (n_shots, n_annot)
    return shots.T, block                                  # (n_annot, n_shots)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mat", required=True, help="ydata-tvsum50.mat")
    ap.add_argument("--out", default="./data/tvsum")
    ap.add_argument("--shot-sec", type=float, default=2.0,
                    help="shot length in seconds (grid step; must match "
                         "honest_corr_timeseries.py --shot-sec)")
    ap.add_argument("--fps", type=float, default=None,
                    help="override fps if a video's 'length' is missing in the .mat")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    n = 0
    for vid, anno, length, nframes in load_tvsum_mat(args.mat):
        fps = args.fps or (nframes / length if length else None)
        if not fps:
            print(f"  [skip] {vid}: no length/fps to convert frames->seconds "
                  f"(pass --fps)")
            continue
        annos_mat, block = frames_to_shots(anno, fps, args.shot_sec)
        if annos_mat is None:
            print(f"  [skip] {vid}: too short after downsampling")
            continue
        n_annot, n_shots = annos_mat.shape
        mean_arc = annos_mat.mean(axis=0)
        t_start = np.arange(n_shots) * args.shot_sec

        with open(os.path.join(args.out, f"human_arc_{vid}.csv"), "w") as f:
            f.write("t_start,importance\n")
            for t, v in zip(t_start, mean_arc):
                f.write(f"{t:.2f},{v:.6f}\n")
        np.save(os.path.join(args.out, f"human_annos_{vid}.npy"), annos_mat)
        n += 1
        print(f"  {vid}: fps~{fps:.1f} block={block}f -> {n_annot} annotators x "
              f"{n_shots} shots ({args.shot_sec}s each)")

    if n == 0:
        raise SystemExit("No videos written. Check the .mat path/structure.")
    print(f"\n[done] wrote {n} videos to {args.out}. shot-sec={args.shot_sec} MUST "
          f"match honest_corr_timeseries.py --shot-sec.")


if __name__ == "__main__":
    main()
