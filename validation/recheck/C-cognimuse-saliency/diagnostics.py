#!/usr/bin/env python3
"""
diagnostics.py — controls + robustness for the Branch-C saliency null.

Writes two CSVs under the branch dir:
  controls.csv          -- POSITIVE CONTROLS proving the harness+alignment can see
                           real co-movement: (a) saliency layer vs layer (same film),
                           (b) ffmpeg feature vs its matched saliency layer.
  levels_robustness.csv -- exploratory: TRIBE feature vs AVS on LEVELS (not first-
                           differenced). Reported to show the ONLY non-null cell is a
                           negative, sub-0.10, whole-cortex drift artifact the pre-
                           registered first-difference removes -> NOT an attention signal.
Same first-diff + circular-shift null as the primary test (honest_corr_timeseries).
"""
import argparse, os, sys, zlib
import numpy as np, scipy.io as sio
sys.path.insert(0, os.getcwd())
from honest_corr_timeseries import circular_shift_p, first_diff, stouffer

FILMS = ["CRA", "CHI", "FNE", "BMI"]
LDIR = {"AVS": "AVS", "Visual": "Visual", "Sensory": "Sensory-AV", "Audio": "Audio", "Semantics": "Semantics"}
LTOK = {"AVS": "AVS", "Visual": "Visual", "Sensory": "Sensory", "Audio": "Audio", "Semantics": "Semantics"}


def load_sal(sal, film, layer):
    p = f"{sal}/{film}/SaliencyAnnotation/{LDIR[layer]}/Labs_{film}_{LTOK[layer]}_IF23.mat"
    m = sio.loadmat(p); k = [x for x in m if not x.startswith("__")][0]
    return np.asarray(m[k], float).ravel()


def persec(fr, n):
    e = np.round(np.linspace(0, len(fr), n + 1)).astype(int)
    return np.array([fr[e[t]:e[t + 1]].mean() for t in range(n)])


def poolk(a, k):
    a = np.asarray(a, float); n = (len(a) // k) * k
    return a[:n].reshape(-1, k).mean(1)


def read_baseline(path):
    import csv
    with open(path) as f:
        rows = list(csv.DictReader(f))
    return {c: np.array([float(r[c]) for r in rows]) for c in rows[0]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sal-root", required=True)
    ap.add_argument("--baseline-dir", required=True)
    ap.add_argument("--outdir", default="validation/recheck/C-cognimuse-saliency")
    ap.add_argument("--pool-sec", type=int, default=2)
    ap.add_argument("--n-perm", type=int, default=999)
    a = ap.parse_args()
    k, sal = a.pool_sec, a.sal_root

    # ---- controls.csv ----
    with open(os.path.join(a.outdir, "controls.csv"), "w") as f:
        f.write("kind,film,a,b,r_firstdiff,p_firstdiff,r_levels,p_levels\n")
        for film in FILMS:
            n = int(len(load_sal(sal, film, "AVS")) // 25)
            for A, B in [("Visual", "AVS"), ("Audio", "AVS"), ("Sensory", "AVS")]:
                x = poolk(persec(load_sal(sal, film, A), n), k)
                y = poolk(persec(load_sal(sal, film, B), n), k)
                p1, r1, _ = circular_shift_p(first_diff(x), first_diff(y), n_perm=a.n_perm,
                                             seed=zlib.crc32((film + A + B + "fd").encode()))
                p2, r2, _ = circular_shift_p(x, y, n_perm=a.n_perm,
                                             seed=zlib.crc32((film + A + B + "lv").encode()))
                f.write(f"layer_vs_layer,{film},{A},{B},{r1:.4f},{p1:.4f},{r2:.4f},{p2:.4f}\n")
            bc = read_baseline(os.path.join(a.baseline_dir, f"baseline_{film}.csv"))
            nb = len(bc["loudness"])
            for feat, layer in [("loudness", "Audio"), ("motion", "Visual"), ("cuts", "Visual")]:
                x = poolk(bc[feat], k); y = poolk(persec(load_sal(sal, film, layer), nb), k)
                p1, r1, _ = circular_shift_p(first_diff(x), first_diff(y), n_perm=a.n_perm,
                                             seed=zlib.crc32((film + feat + layer + "fd").encode()))
                p2, r2, _ = circular_shift_p(x, y, n_perm=a.n_perm,
                                             seed=zlib.crc32((film + feat + layer + "lv").encode()))
                f.write(f"ffmpeg_vs_saliency,{film},{feat},{layer},{r1:.4f},{p1:.4f},{r2:.4f},{p2:.4f}\n")
    print(f"[wrote] {a.outdir}/controls.csv")

    # ---- levels_robustness.csv ----
    masks = {m: np.load(f"data/roi_mask_{m}.npy").astype(bool) for m in ["dan", "dmn"]}
    with open(os.path.join(a.outdir, "levels_robustness.csv"), "w") as f:
        f.write("feature,film,r_levels,p_levels\n")
        for feat in ["dan", "dmn", "global"]:
            ps, rs = [], []
            for film in FILMS:
                preds = np.load(f"data/arcs/preds_{film}.npy").astype(np.float32); T = preds.shape[0]
                arc = np.abs(preds).mean(1) if feat == "global" else np.abs(preds)[:, masks[feat]].mean(1)
                y = persec(load_sal(sal, film, "AVS"), T)
                L = min(T, len(y))
                p, r, _ = circular_shift_p(poolk(arc[:L], k), poolk(y[:L], k), n_perm=a.n_perm,
                                           seed=zlib.crc32((film + feat + "lvl").encode()))
                f.write(f"{feat},{film},{r:.4f},{p:.4f}\n"); ps.append(p); rs.append(r)
            z, pc = stouffer(ps, rs)
            f.write(f"{feat},STOUFFER,{np.nanmedian(rs):.4f},{pc:.4f}\n")
    print(f"[wrote] {a.outdir}/levels_robustness.csv")


if __name__ == "__main__":
    main()
