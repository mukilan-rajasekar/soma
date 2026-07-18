#!/usr/bin/env python3
"""
incremental_validity.py — does the brain arc predict human interest OVER AND ABOVE
the dumb audiovisual baseline?

This is the answer to "why not just use ffmpeg?" and killer #2 ("why won't Realeyes
build it"). It computes a PARTIAL correlation: brain-vs-human after removing whatever
the baseline features (loudness/cuts/luminance/motion) already explain in BOTH. If
the partial correlation survives a circular-shift null, the brain adds real signal;
if it collapses to ~0, the "neural" read is just re-deriving the edit.

Inputs (per video <id>, aligned by seconds):
  arc_<id>.csv        brain arc (t_sec, global_mag, roi_mag)   [batch_extract.py]
  human_arc_<id>.csv  human interest (t_start, importance)     [tvsum_prep.py]
  baseline_<id>.csv   dumb features (t_sec, loudness, cuts, luminance, motion)
                                                               [baseline_extract.py]
Everything is first-differenced (like the main harness), then partialled.

USAGE:
  python incremental_validity.py --arc-dir ./data/arcs --human-dir ./data/tvsum \
      --baseline-dir ./data/baseline --feature roi
"""
import argparse
import glob
import os

import numpy as np

from honest_corr_timeseries import (_read_csv, _rankdata, pearson, first_diff,
                                     circular_shift_p, resample_to_grid, stem_id)


def _residualize(y, Z):
    """Return residuals of y after regressing out columns of Z (+ intercept)."""
    Z1 = np.column_stack([np.ones(len(y)), Z]) if Z.size else np.ones((len(y), 1))
    beta, *_ = np.linalg.lstsq(Z1, y, rcond=None)
    return y - Z1 @ beta


def partial_spearman(x, y, Z):
    """Rank-based partial correlation of x,y controlling for columns of Z."""
    xr, yr = _rankdata(x), _rankdata(y)
    Zr = np.column_stack([_rankdata(Z[:, j]) for j in range(Z.shape[1])]) if Z.size \
        else np.zeros((len(x), 0))
    return pearson(_residualize(xr, Zr), _residualize(yr, Zr))


def partial_shift_p(x, y, Z, n_perm=5000, min_shift=3):
    """Circular-shift null for the PARTIAL correlation (shift y, keep x,Z fixed)."""
    n = len(x)
    r_obs = partial_spearman(x, y, Z)
    if np.isnan(r_obs) or n < 8:
        return np.nan, r_obs
    lo, hi = min_shift, n - min_shift
    shifts = np.arange(lo, hi + 1)
    if len(shifts) > n_perm:
        shifts = shifts[:: max(1, len(shifts) // n_perm)]
    count = sum(1 for s in shifts
                if abs(partial_spearman(x, np.roll(y, int(s)), Z)) >= abs(r_obs) - 1e-12)
    return (count + 1) / (len(shifts) + 1), r_obs


def _align(arc_t, arc_v, base_cols, human_t, human_v, shot_sec=2.0):
    """Put brain arc + baseline features + human onto the human shot grid, diff, mask."""
    dur = float(human_t[-1] + shot_sec)
    edges = np.append(np.asarray(human_t, float), dur)
    brain = resample_to_grid(arc_t, arc_v, edges)
    feats = [resample_to_grid(arc_t, c, edges) for c in base_cols]  # baseline on same t
    H = np.asarray(human_v, float)
    stack = np.column_stack([brain, H] + feats)
    good = ~np.isnan(stack).any(axis=1)
    if good.sum() < 10:
        return None
    b, h = brain[good], H[good]
    F = np.column_stack([f[good] for f in feats])
    # first-difference all
    db, dh = first_diff(b), first_diff(h)
    dF = np.column_stack([first_diff(F[:, j]) for j in range(F.shape[1])])
    return db, dh, dF


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arc-dir", default="./data/arcs")
    ap.add_argument("--human-dir", default="./data/tvsum")
    ap.add_argument("--baseline-dir", default="./data/baseline")
    ap.add_argument("--feature", choices=["roi", "global"], default="roi")
    ap.add_argument("--shot-sec", type=float, default=2.0)
    ap.add_argument("--n-perm", type=int, default=5000)
    ap.add_argument("--out", default=None,
                    help="optional CSV path (cols: video,raw_r,partial_r,perm_p,"
                         "adds_signal) so publish_results.py --incremental can auto-fill "
                         "the demo's 'beats ffmpeg baseline?' box")
    args = ap.parse_args()

    arcs = sorted(glob.glob(os.path.join(args.arc_dir, "arc_*.csv")))
    if not arcs:
        raise SystemExit(f"No arcs in {args.arc_dir}")
    col = "roi_mag" if args.feature == "roi" else "global_mag"
    print(f"{'video':<20}{'raw r':>8}{'partial r':>11}{'perm_p':>9}   verdict")
    print("-" * 62)
    rows = []
    for af in arcs:
        vid = stem_id(af)
        _, ac = _read_csv(af)
        hp = os.path.join(args.human_dir, f"human_arc_{vid}.csv")
        bp = os.path.join(args.baseline_dir, f"baseline_{vid}.csv")
        if col not in ac or not os.path.exists(hp) or not os.path.exists(bp):
            print(f"{vid:<20}  (missing arc col / human / baseline)"); continue
        _, hc = _read_csv(hp)
        _, bc = _read_csv(bp)
        base_cols = [bc[k] for k in ("loudness", "cuts", "luminance", "motion") if k in bc]
        al = _align(ac["t_sec"], ac[col], base_cols, hc["t_start"], hc["importance"],
                    args.shot_sec)
        if al is None:
            print(f"{vid:<20}  (too few aligned bins)"); continue
        db, dh, dF = al
        raw = pearson(_rankdata(db), _rankdata(dh))
        p, pr = partial_shift_p(db, dh, dF, n_perm=args.n_perm)
        verdict = ("adds signal" if (not np.isnan(p) and p < 0.05 and abs(pr) > 0.1)
                   else "no lift over baseline")
        print(f"{vid:<20}{raw:>8.2f}{pr:>11.2f}{p:>9.3f}   {verdict}")
        rows.append((vid, raw, pr, p))

    if rows:
        good = [r for r in rows if not np.isnan(r[3]) and r[3] < 0.05 and abs(r[2]) > 0.1]
        print(f"\n{len(good)}/{len(rows)} videos: brain arc adds signal OVER the dumb "
              "baseline.\nIf that number is 0, the neural read is just re-deriving the "
              "edit — say so honestly.")
        if args.out:
            os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
            with open(args.out, "w") as f:
                f.write("video,raw_r,partial_r,perm_p,adds_signal\n")
                for vid, raw, pr, p in rows:
                    adds = int(not np.isnan(p) and p < 0.05 and abs(pr) > 0.1)
                    f.write(f"{vid},{raw:.4f},{pr:.4f},{p:.4f},{adds}\n")
            print(f"[wrote] {args.out}  (feed to publish_results.py --incremental)")


if __name__ == "__main__":
    main()
