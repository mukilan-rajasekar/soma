#!/usr/bin/env python3
"""Adversarial exploratory lag sweep: DAN vs AVS saliency across hemodynamic lags.
TRIBE predicts (delayed) BOLD; saliency is stimulus-time. lag=0 (the primary) could
miss real signal if BOLD lags the stimulus by ~4-6 s. Sweep lag; report ALL, note MC."""
import os, sys, zlib
import numpy as np, scipy.io as sio
sys.path.insert(0, os.getcwd())
from honest_corr_timeseries import circular_shift_p, first_diff, stouffer

FILMS = ["CRA", "CHI", "FNE", "BMI"]
SAL = sys.argv[1]

def load_sal(film, layer="AVS"):
    p = f"{SAL}/{film}/SaliencyAnnotation/{layer}/Labs_{film}_{layer}_IF23.mat"
    m = sio.loadmat(p); k = [x for x in m if not x.startswith("__")][0]
    return np.asarray(m[k], float).ravel()

def persec(fr, n):
    e = np.round(np.linspace(0, len(fr), n + 1)).astype(int)
    return np.array([fr[e[t]:e[t+1]].mean() for t in range(n)])

masks = {"dan": np.load("data/roi_mask_dan.npy").astype(bool)}
LAGS = list(range(-2, 9))  # seconds; positive = DAN(t) aligned to saliency(t-lag)
print(f"{'lag':>4} " + " ".join(f"{f:>8}" for f in FILMS) + "  medR  Stouffer_p")
best = {}
for lag in LAGS:
    rs, ps = [], []
    for film in FILMS:
        preds = np.load(f"data/arcs/preds_{film}.npy").astype(np.float32); T = preds.shape[0]
        dan = np.abs(preds)[:, masks["dan"]].mean(1)
        sal = persec(load_sal(film), T)
        L = min(T, len(sal))
        dan, sal = dan[:L], sal[:L]
        if lag >= 0:
            x, y = dan[lag:], sal[:L-lag] if lag > 0 else sal
        else:
            x, y = dan[:L+lag], sal[-lag:]
        p, r, _ = circular_shift_p(first_diff(x), first_diff(y), n_perm=999,
                                   seed=zlib.crc32(f"{film}{lag}".encode()))
        rs.append(r); ps.append(p)
    z, pc = stouffer(ps, rs)
    print(f"{lag:>4} " + " ".join(f"{r:>8.3f}" for r in rs) + f"  {np.nanmedian(rs):>5.3f}  {pc:.4f}")
