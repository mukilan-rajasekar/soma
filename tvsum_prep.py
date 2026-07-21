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


def _orient(anno, nframes):
    """Orient a 2-D annotation block to (nframes, n_annotators): frame axis is the long one."""
    anno = np.asarray(anno, float)
    if anno.ndim == 1:
        anno = anno[:, None]
    if anno.shape[0] < anno.shape[1] and anno.shape[1] == nframes:
        anno = anno.T
    elif anno.shape[0] != nframes and anno.shape[1] == nframes:
        anno = anno.T
    return anno


def _load_tvsum_scipy(path):
    """v5 / v7 .mat via scipy (the synthetic test fixtures use this format)."""
    from scipy.io import loadmat
    mat = loadmat(path, squeeze_me=True, struct_as_record=False)
    if "tvsum50" not in mat:
        raise SystemExit(f"{path!r} has no 'tvsum50' variable. Keys: "
                         f"{[k for k in mat if not k.startswith('__')]}")
    for s in np.atleast_1d(mat["tvsum50"]):
        anno = np.asarray(s.user_anno, float)
        nframes = int(getattr(s, "nframes", anno.shape[0] if anno.ndim == 2 else len(anno)))
        length = float(getattr(s, "length", 0.0)) or None
        yield str(s.video), _orient(anno, nframes), length, nframes


def _load_tvsum_h5(path):
    """v7.3 .mat (HDF5) via h5py — the REAL TVSum release ships in THIS format.

    Struct-array fields are stored as (50,1) arrays of HDF5 object references; each
    entry must be dereferenced through the file. user_anno comes back as
    (n_annotators, nframes) here (transposed vs the scipy path), which _orient fixes.
    """
    import h5py
    with h5py.File(path, "r") as f:
        if "tvsum50" not in f:
            raise SystemExit(f"{path!r} has no 'tvsum50' group. Keys: {list(f.keys())}")
        g = f["tvsum50"]
        for i in range(g["video"].shape[0]):
            vid = "".join(chr(int(c)) for c in np.asarray(f[g["video"][i, 0]]).flatten())
            anno = np.asarray(f[g["user_anno"][i, 0]], float)
            nframes = int(np.asarray(f[g["nframes"][i, 0]]).flatten()[0])
            length = float(np.asarray(f[g["length"][i, 0]]).flatten()[0]) or None
            yield vid, _orient(anno, nframes), length, nframes


def load_tvsum_mat(path):
    """Yield (video_id, user_anno[nframes, n_annot], length_sec, nframes).

    Dispatches on format: the REAL TVSum release is MATLAB v7.3 (HDF5, needs h5py); the
    synthetic fixtures are v7 (scipy). This is the fix for the real-data 'Please use HDF
    reader for matlab v7.3 files' crash that the synthetic v7 .mat had masked.
    """
    with open(path, "rb") as fh:
        head = fh.read(128)
    # v7.3 = HDF5. Real MATLAB writes a "MATLAB 7.3 MAT-file" userblock ahead of the HDF5
    # payload; a raw HDF5 file starts with the HDF5 signature. Either -> h5py. v5/v7 -> scipy.
    if head[:19] == b"MATLAB 7.3 MAT-file" or head[:8] == b"\x89HDF\r\n\x1a\n":
        yield from _load_tvsum_h5(path)
    else:
        yield from _load_tvsum_scipy(path)


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


def pick_fps(nframes, length, fallback_fps):
    """Real per-video fps = nframes/length when a usable length is present; else the
    --fps fallback. A video's OWN length must win (do not let a global --fps override a
    video that reports its length, or the human timebase is silently stretched)."""
    return (nframes / length) if (length and length > 0) else fallback_fps


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mat", required=True, help="ydata-tvsum50.mat")
    ap.add_argument("--out", default="./data/tvsum")
    ap.add_argument("--shot-sec", type=float, default=2.0,
                    help="shot length in seconds (grid step; must match "
                         "honest_corr_timeseries.py --shot-sec)")
    ap.add_argument("--fps", type=float, default=None,
                    help="fallback fps, used ONLY when a video's 'length' is missing in "
                         "the .mat (the real per-video fps = nframes/length is always "
                         "preferred when length is present)")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    n = 0
    for vid, anno, length, nframes in load_tvsum_mat(args.mat):
        fps = pick_fps(nframes, length, args.fps)
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
