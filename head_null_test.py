#!/usr/bin/env python3
"""
head_null_test.py — the RIGOROUS leakage/overfitting check for train_head.py.

A single shuffled-target run is noisy (one draw can look borderline-significant by chance).
This builds an EMPIRICAL null: run the real head once, then N shuffle-target runs, and report
the empirical p = (#shuffles whose combined Stouffer p <= the real p, + 1) / (N + 1). If the
real head's combined p sits in the tail of the shuffle distribution, the signal is real and
not an artifact of the fitting procedure. Use this before believing any head result.

USAGE (same dirs as `make head`):
  python head_null_test.py --preds-dir data/arcs --arc-dir data/arcs \
      --human-dir data/tvsum --masks-dir data --n-shuffles 30
"""
import argparse
import glob
import os

import numpy as np

import train_head as T
from honest_corr_timeseries import stouffer


def combined(rows):
    _z, p = stouffer([r["perm_p"] for r in rows], [r["r_head"] for r in rows])
    return p, float(np.nanmedian([r["r_head"] for r in rows]))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-dir", required=True)
    ap.add_argument("--arc-dir", required=True)
    ap.add_argument("--human-dir", required=True)
    ap.add_argument("--masks-dir", required=True)
    ap.add_argument("--shot-sec", type=float, default=2.0)
    ap.add_argument("--n-shuffles", type=int, default=30)
    ap.add_argument("--n-perm", type=int, default=1500)
    ap.add_argument("--real-n-perm", type=int, default=3000)
    args = ap.parse_args()

    masks = T.load_masks(args.masks_dir)
    if not masks:
        raise SystemExit(f"No roi_*.npy masks in {args.masks_dir}")
    vids = sorted(os.path.basename(p)[len("preds_"):-len(".npy")]
                  for p in glob.glob(os.path.join(args.preds_dir, "preds_*.npy")))
    videos = [v for v in (T.video_data(vid, args.preds_dir, args.arc_dir, args.human_dir,
                                       masks, args.shot_sec) for vid in vids) if v is not None]
    if len(videos) < 3:
        raise SystemExit(f"Only {len(videos)} usable videos.")
    print(f"loaded {len(videos)} videos; running real head + {args.n_shuffles} shuffles ...\n")

    real_p, real_med = combined(T.run(videos, args.real_n_perm, False, 0))
    print(f"REAL: combined Stouffer p = {real_p:.5f} | median r_head = {real_med:+.3f}\n")

    null_ps = []
    for s in range(1, args.n_shuffles + 1):
        p, med = combined(T.run(videos, args.n_perm, True, s))
        null_ps.append(p)
        print(f"  shuffle {s:2d}: combined p = {p:.4f}  median r = {med:+.3f}")
    null_ps = np.array(null_ps)

    beat = int(np.sum(null_ps <= real_p))
    emp = (beat + 1) / (args.n_shuffles + 1)
    print(f"\n{beat}/{args.n_shuffles} shuffles reached the real p ({real_p:.5f})")
    print(f"shuffle-null combined p: min={null_ps.min():.4f} median={np.median(null_ps):.4f}")
    print(f"EMPIRICAL p (real head vs shuffled null) = {emp:.4f}"
          f"  ->  {'SIGNAL survives the shuffle null' if emp < 0.05 else 'NOT distinguishable from shuffled null'}")
    print("Reminder: TVSum importance is a PUBLIC PROXY; a surviving head is a learned "
          "HYPOTHESIS (activation->attention), not a validated retention/engagement claim.")


if __name__ == "__main__":
    main()
