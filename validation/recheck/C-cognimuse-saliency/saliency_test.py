#!/usr/bin/env python3
"""
saliency_test.py — Branch C re-test: does the TRIBE dorsal-attention (DAN) arc
predict the COGNIMUSE per-second SALIENCY label (attention = TRIBE's STRONG zone),
above an ffmpeg loudness/cuts/luminance/motion baseline?

Construct note: the AFFECT test on these same films was NULL (reward/valence cortex
is off TRIBE's well-fit surface). This tests the RIGHT construct for a cortical
encoder: bottom-up + audiovisual SALIENCY, which the dorsal-attention network tracks.

Method mirrors honest_corr_timeseries.py exactly:
  * per-second grid (preds are 1 Hz; saliency is 25 fps binary -> averaged to 1 Hz density)
  * FIRST-DIFFERENCE both series (kills shared slow drift)
  * CIRCULAR-SHIFT permutation null (preserves autocorrelation; honest p)
  * incremental = PARTIAL spearman of DAN-vs-saliency controlling ffmpeg features,
    with the circular-shift null on the partial (incremental_validity.py machinery)
  * report EVERY film + Stouffer/Fisher combined; no best-of-N.

PRIMARY (pre-registered here): feature = DAN roi magnitude ; label = AVS (the saliency
layer the COGNIMUSE paper uses for all experiments) ; lag = 0 ; grid = 1 s.
Everything else (global/DMN features, Visual/Sensory/Audio/Semantic layers) is
SECONDARY/exploratory and labelled as such.
"""
import argparse
import glob
import os
import sys
import zlib

import numpy as np
import scipy.io as sio

# reuse the audited honest machinery
from honest_corr_timeseries import (spearman, circular_shift_p, first_diff,
                                     _rankdata, pearson, stouffer, fisher,
                                     effective_n, parametric_p_from_r, _read_csv)
from incremental_validity import partial_spearman, partial_shift_p

FILMS = ["CRA", "CHI", "FNE", "BMI"]
SAL_LAYERS = ["AVS", "Visual", "Sensory", "Audio", "Semantics"]
# folder name != file token for the sensory layer
LAYER_DIR = {"AVS": "AVS", "Visual": "Visual", "Sensory": "Sensory-AV",
             "Audio": "Audio", "Semantics": "Semantics"}
LAYER_TOKEN = {"AVS": "AVS", "Visual": "Visual", "Sensory": "Sensory",
               "Audio": "Audio", "Semantics": "Semantics"}


def load_saliency_persec(sal_root, film, layer, n_sec):
    """Load IF23 per-frame binary saliency and average to per-second density [0,1].

    Frames are mapped evenly onto n_sec buckets (nf ~= 25 * n_sec), robust to the
    routine <=1 s length mismatch between the annotation and the pred count.
    """
    d = LAYER_DIR[layer]
    tok = LAYER_TOKEN[layer]
    path = os.path.join(sal_root, film, "SaliencyAnnotation", d,
                        f"Labs_{film}_{tok}_IF23.mat")
    if not os.path.exists(path):
        return None
    m = sio.loadmat(path)
    key = [k for k in m if not k.startswith("__")][0]
    fr = np.asarray(m[key], float).ravel()
    nf = len(fr)
    edges = np.round(np.linspace(0, nf, n_sec + 1)).astype(int)
    out = np.array([fr[edges[t]:edges[t + 1]].mean() if edges[t + 1] > edges[t]
                    else np.nan for t in range(n_sec)])
    return out


def arc_from_preds(preds, mask):
    """mean over ROI vertices of |preds[t, v]| — identical to batch_extract.arc_from_preds."""
    p = np.abs(preds)
    return p[:, mask].mean(axis=1)


def pool(a, k):
    """Average non-overlapping windows of length k (drop the ragged tail)."""
    a = np.asarray(a, float)
    n = (len(a) // k) * k
    if n == 0:
        return a.copy()
    return a[:n].reshape(-1, k).mean(axis=1)


def run_one(x_arc, sal, base=None, seed=0, n_perm=5000):
    """First-diff + circular-shift raw test; if base given, also partial vs ffmpeg."""
    valid = ~np.isnan(x_arc) & ~np.isnan(sal)
    if base is not None:
        valid &= ~np.isnan(base).any(axis=1)
    x = x_arc[valid]
    y = sal[valid]
    dx, dy = first_diff(x), first_diff(y)
    out = {}
    p, r, n = circular_shift_p(dx, dy, n_perm=n_perm, seed=seed)
    out.update(n=n, raw_r=r, raw_p=p,
               n_eff=effective_n(dx, dy))
    if base is not None:
        B = base[valid]
        dB = np.column_stack([first_diff(B[:, j]) for j in range(B.shape[1])])
        pr, prr = partial_shift_p(dx, dy, dB, n_perm=n_perm, seed=seed)
        out.update(partial_r=prr, partial_p=pr)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preds-dir", default="data/arcs")
    ap.add_argument("--sal-root", required=True,
                    help="…/SaliencyAnnotation/SaliencyAnnotation (film subdirs inside)")
    ap.add_argument("--masks-dir", default="data")
    ap.add_argument("--baseline-dir", default=None,
                    help="dir with baseline_<FILM>.csv (ffmpeg). If absent, raw-only.")
    ap.add_argument("--n-perm", type=int, default=999)
    ap.add_argument("--pool-sec", type=int, default=2,
                    help="pool this many seconds per bin (1 = native 1 Hz)")
    ap.add_argument("--out", default="validation/recheck/C-cognimuse-saliency/saliency_results.csv")
    args = ap.parse_args()

    feat_masks = {
        "dan": np.load(os.path.join(args.masks_dir, "roi_mask_dan.npy")).astype(bool),
        "dmn": np.load(os.path.join(args.masks_dir, "roi_mask_dmn.npy")).astype(bool),
    }

    rows = []
    for film in FILMS:
        pp = os.path.join(args.preds_dir, f"preds_{film}.npy")
        if not os.path.exists(pp):
            print(f"[skip] {film}: no preds at {pp}"); continue
        preds = np.load(pp).astype(np.float32)
        T = preds.shape[0]
        gmask = np.ones(preds.shape[1], bool)  # global = all vertices

        arcs = {
            "dan": arc_from_preds(preds, feat_masks["dan"]),
            "dmn": arc_from_preds(preds, feat_masks["dmn"]),
            "global": arc_from_preds(preds, gmask),
        }

        # ffmpeg baseline for this film (per-second), aligned by truncation
        base = None
        if args.baseline_dir:
            bp = os.path.join(args.baseline_dir, f"baseline_{film}.csv")
            if os.path.exists(bp):
                _, bc = _read_csv(bp)
                cols = [bc[k] for k in ("loudness", "cuts", "luminance", "motion") if k in bc]
                base_full = np.column_stack(cols)
            else:
                base_full = None
                print(f"[note] {film}: no baseline at {bp}")
        else:
            base_full = None

        for layer in SAL_LAYERS:
            sal = load_saliency_persec(args.sal_root, film, layer, T)
            if sal is None:
                print(f"[note] {film}/{layer}: no saliency file"); continue
            L = min(T, len(sal))
            if base_full is not None:
                L = min(L, len(base_full))
            k = max(1, args.pool_sec)
            sal_L = pool(sal[:L], k)
            base_L = (np.column_stack([pool(base_full[:L, j], k)
                                       for j in range(base_full.shape[1])])
                      if base_full is not None else None)
            for feat, arc in arcs.items():
                res = run_one(pool(arc[:L], k), sal_L, base=base_L,
                              seed=zlib.crc32(f"{film}{layer}{feat}".encode()),
                              n_perm=args.n_perm)
                res.update(film=film, layer=layer, feature=feat, T=L,
                           sal_density=float(np.nanmean(sal_L)))
                rows.append(res)

    # write
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    cols = ["film", "layer", "feature", "T", "n", "sal_density",
            "raw_r", "raw_p", "n_eff", "partial_r", "partial_p"]
    with open(args.out, "w") as f:
        f.write(",".join(cols) + "\n")
        for r in rows:
            f.write(",".join(str(r.get(c, "")) for c in cols) + "\n")
    print(f"[wrote] {args.out}\n")

    # ---- report: PRIMARY first, then aggregates per (feature, layer) ----
    def agg(feature, layer, key_r="raw_r", key_p="raw_p"):
        fr = [r for r in rows if r["feature"] == feature and r["layer"] == layer]
        ps = [r[key_p] for r in fr]
        rs = [r[key_r] for r in fr]
        z, pc = stouffer(ps, rs)
        _, pf = fisher(ps)
        return fr, np.nanmedian(rs), pc, pf

    def show(feature, layer, tag):
        print(f"=== {tag}: feature={feature}  saliency-layer={layer} ===")
        print(f"{'film':<6}{'n':>6}{'raw_r':>9}{'raw_p':>9}{'part_r':>9}{'part_p':>9}")
        fr = [r for r in rows if r["feature"] == feature and r["layer"] == layer]
        for r in sorted(fr, key=lambda d: d["film"]):
            def fmt(x, nd=3):
                return f"{x:.{nd}f}" if isinstance(x, float) and not np.isnan(x) else "  -  "
            print(f"{r['film']:<6}{r['n']:>6}{fmt(r['raw_r']):>9}{fmt(r['raw_p']):>9}"
                  f"{fmt(r.get('partial_r', np.nan)):>9}{fmt(r.get('partial_p', np.nan)):>9}")
        _, medr, pc, pf = agg(feature, layer)
        print(f"  RAW    -> {len(fr)} films | median r={medr:.3f} | Stouffer p={pc:.4f} | Fisher p={pf:.4f}")
        if any("partial_r" in r for r in fr):
            _, medpr, pcp, pfp = agg(feature, layer, "partial_r", "partial_p")
            print(f"  PARTIAL-> median partial_r={medpr:.3f} | Stouffer p={pcp:.4f} | Fisher p={pfp:.4f}")
        print()

    print("#" * 70)
    show("dan", "AVS", "PRIMARY (pre-registered)")
    print("#" * 70)
    print("SECONDARY / exploratory (report ALL, no cherry-pick):\n")
    for feat in ["global", "dmn"]:
        show(feat, "AVS", "secondary-feature")
    for layer in ["Visual", "Sensory", "Audio", "Semantics"]:
        show("dan", layer, "secondary-layer")


if __name__ == "__main__":
    main()
