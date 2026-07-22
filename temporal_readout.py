#!/usr/bin/env python3
"""
temporal_readout.py — does the SHAPE of the per-second neural series predict an ad's
outcome, over and above the dumb ffmpeg edit?

`ad_backtest.py` collapses each ad's neural arc to a single scalar (mean / peak / hook /
area) and asks whether that scalar ranks real ads by outcome. That throws away the one
thing CLAUDE.md flags as the interesting, defensible signal: the *temporal shape* — how
the activation rises, decays, and jumps second-to-second. This module reads that shape.

It is the cross-sectional twin of the within-video temporal harness: each ad -> a fixed,
PRE-DECLARED set of six shape features -> per-feature partial Spearman vs outcome
(controlling the ffmpeg covariates) with a label-permutation null, Holm-corrected across
the six features, PLUS one small leave-one-ad-out ridge that combines the six into a
single out-of-sample prediction scored against a FULL-REFIT permutation null.

HONESTY (read before quoting any number — same ethos as ad_backtest.py):
  * PRE-DECLARED FEATURE SET, locked here, never added to / dropped after seeing results:
      hook_decay, hook_slope, decay_tau, surprise_rate, rise_fall_asym, tvar.
    No best-of-six. Every feature is reported; the top one is a LEAD, not "the result".
  * A feature is a SIGNAL only if its Holm-adjusted permutation p < 0.05 AND its partial
    |r| >= MIN_EFFECT_R (0.10). The combined model is a SIGNAL only if its permutation
    p < 0.05 AND its OOS |r| >= MIN_EFFECT_R.
  * The combined model's null RE-FITS the whole leave-one-ad-out ridge inside every
    permutation (permute the labels, refit, re-score). Permuting against fixed OOS
    predictions is INVALID and is not done here.
  * A NULL is a legitimate, reported outcome. At small n (the 29 Meta ads) with a noisy
    longevity proxy this read-out is UNDERPOWERED — its value is the reusable ARCHITECTURE
    that fires when real retention labels (e.g. Mr.HiSum) arrive, not a positive result today.
  * The neural scorer is applied out-of-distribution and the outcome (days-running) is a
    PROXY for real spend outcomes. A win here is encouraging evidence, not a validated model.

GENERIC BY DESIGN: nothing here is ad-specific. Point --manifest / --arc-dir at any set of
clips with an outcome column (e.g. Mr.HiSum retention) and it runs the identical test.

INPUTS (mirror ad_backtest.py):
  ad_manifest.csv   --manifest    cols: ad_id,outcome[,platform,note]; outcome numeric,
                                  HIGHER = better (rank data: pass --outcome-is-rank)
  arc_<ad_id>.csv   --arc-dir     (t_sec, global_mag[, roi_mag])          [batch_extract.py]
  preds_<ad_id>.npy --preds-dir   frozen-TRIBE output; needed only for --source preds
  baseline_<ad_id>.csv --baseline-dir (t_sec, loudness,cuts,luminance,motion) [baseline_extract.py]

USAGE:
  python temporal_readout.py --manifest data/ads/ad_manifest.csv \
      --arc-dir data/ads/arcs --baseline-dir data/ads/baseline \
      --out validation/temporal_readout.csv --json-out validation/temporal_readout.json
"""
import argparse
import json
import os
import zlib

import numpy as np

from honest_corr_timeseries import (_read_csv, _rankdata, pearson, spearman,
                                     resample_to_grid, MIN_EFFECT_R)
from incremental_validity import partial_spearman  # noqa: F401  (reused via label_perm_p)
from ad_backtest import baseline_summary, COVARIATES, label_perm_p, load_manifest

# -----------------------------------------------------------------------------
# PRE-DECLARED feature set — LOCKED. Do not add / drop after seeing results.
# -----------------------------------------------------------------------------
FEATURES = ["hook_decay", "hook_slope", "decay_tau",
            "surprise_rate", "rise_fall_asym", "tvar"]

HOOK_SEC = 3.0          # "the hook" = first HOOK_SEC seconds (matches ad_backtest.HOOK_SEC)
SLOPE_WIN = 5           # hook_slope is the OLS slope over the first SLOPE_WIN seconds
SURPRISE_PCT = 50       # within-clip percentile used as the surprise scale (50 = median)
SURPRISE_K = 2.0        # a "surprise" second jumps > SURPRISE_K * that within-clip scale
RIDGE_ALPHA = 1.0       # ridge penalty for the combined leave-one-ad-out model


# -----------------------------------------------------------------------------
# series prep + the six shape extractors
# -----------------------------------------------------------------------------
def _prep(x):
    """Finite, time-ordered series. Interior NaNs (dropped shots) are linearly
    interpolated and the ends held constant so ordering is preserved for the
    temporal features; returns None if there is too little signal to shape-read."""
    a = np.asarray(x, float)
    n = a.size
    if n < 4:
        return None
    finite = np.isfinite(a)
    if int(finite.sum()) < 4:
        return None
    if not finite.all():
        idx = np.arange(n)
        a = a.copy()
        a[~finite] = np.interp(idx[~finite], idx[finite], a[finite])  # np.interp clamps at ends
    return a


def hook_decay(x, hook_sec=HOOK_SEC):
    """Mean of the first `hook_sec` seconds MINUS the mean of the rest. Positive =
    front-loaded / decays after the hook; negative = builds after the opening. This is
    the single best surviving lead from the prior audits (partial r=+0.40, p=0.051, n=29)."""
    a = _prep(x)
    if a is None:
        return np.nan
    k = max(1, int(round(hook_sec)))
    if a.size <= k:
        return np.nan
    return float(np.mean(a[:k]) - np.mean(a[k:]))


def hook_slope(x, win=SLOPE_WIN):
    """OLS slope of the first `win` seconds vs time. Negative = the opening is already
    falling off; positive = the opening is still ramping. Finer than hook_decay's step."""
    a = _prep(x)
    if a is None:
        return np.nan
    k = min(int(win), a.size)
    if k < 2:
        return np.nan
    t = np.arange(k, dtype=float)
    seg = a[:k]
    tc = t - t.mean()
    denom = float(tc @ tc)
    if denom == 0:
        return np.nan
    return float((tc @ (seg - seg.mean())) / denom)


def decay_tau(x):
    """AR(1) persistence coefficient phi (lag-1 autocorrelation via OLS of x_t on x_{t-1}).
    High phi = slow habituation (activation persists); low/negative phi = fast, jumpy
    turnover. The habituation constant, read straight off the arc."""
    a = _prep(x)
    if a is None or a.size < 3:
        return np.nan
    x0, x1 = a[:-1], a[1:]
    x0c = x0 - x0.mean()
    denom = float(x0c @ x0c)
    if denom == 0:
        return np.nan
    return float((x0c @ (x1 - x1.mean())) / denom)


def surprise_rate(x, pct=SURPRISE_PCT, k=SURPRISE_K):
    """Fraction of seconds whose |first-difference| exceeds a within-clip threshold =
    `k` * the `pct`-th percentile of |first-difference| (pct=50 -> the median jump). A
    burstiness/kurtosis read: how often the arc makes an outsized jump relative to its own
    typical jump. Scale-free by construction. (A bare percentile threshold would be
    ~constant across clips and carry no signal — the multiple `k` is what makes it inform.)"""
    a = _prep(x)
    if a is None or a.size < 4:
        return np.nan
    d = np.abs(np.diff(a))
    if d.size == 0:
        return np.nan
    thr = k * float(np.percentile(d, pct))
    if not np.isfinite(thr):
        return np.nan
    if thr <= 0:            # constant (or near-constant) arc -> no surprises
        return 0.0
    return float(np.mean(d > thr))


def rise_fall_asym(x):
    """Asymmetry of the arc around its peak: (seconds after peak - seconds before peak) /
    total. +1 = peak at the very start (sharp rise, long fall); -1 = peak at the very end
    (long build to a late climax); 0 = symmetric. Captures where the arc's climax sits."""
    a = _prep(x)
    if a is None or a.size < 3:
        return np.nan
    peak = int(np.argmax(a))
    n_rise = peak
    n_fall = (a.size - 1) - peak
    tot = n_rise + n_fall
    if tot == 0:
        return np.nan
    return float((n_fall - n_rise) / tot)


def tvar(x):
    """Temporal variance of the arc — overall dynamic range / pacing. CLAUDE.md's flagged
    'interesting, defensible' single-number shape signal."""
    a = _prep(x)
    if a is None:
        return np.nan
    return float(np.var(a))


_EXTRACTORS = {
    "hook_decay": hook_decay, "hook_slope": hook_slope, "decay_tau": decay_tau,
    "surprise_rate": surprise_rate, "rise_fall_asym": rise_fall_asym, "tvar": tvar,
}


def extract_features(series):
    """The six PRE-DECLARED shape scalars for one per-second series."""
    return {f: _EXTRACTORS[f](series) for f in FEATURES}


# -----------------------------------------------------------------------------
# WINDOWED local temporal-shape descriptors — the retention_head.py seam
# -----------------------------------------------------------------------------
# The six extractors above collapse a whole clip to CROSS-SECTIONAL scalars (one number per
# ad). retention_head.py needs the twin quantity: a per-second / per-bin LOCAL read of the
# same temporal shape, so it can nest temporal columns beside its ROI columns and validate
# them leave-one-VIDEO-out. It appends them via a generic seam (retention_head._temporal_
# columns) that calls EITHER:
#     pooled_features(preds, edges) -> (n_bins, k)   (preferred; already on the head's grid)
#     per_second_features(preds)    -> (n_sec,  k)   (retention_head resamples it to the grid)
# Both read `preds` ONLY (never the label) => leakage-free BY CONSTRUCTION: no target value
# enters the computation, so appending them cannot inflate a fit. They expose LOCAL shape
# (velocity / acceleration / burst variance / surprise / clock position) that the ROI mean-
# level columns and the nested whole-cortex global baseline structurally cannot see.

WINDOW_FEATURES = ["velocity", "acceleration", "roll_var", "surprise", "time_pos"]
ROLL_HALFWIN = 2        # rolling-variance window is +/- ROLL_HALFWIN seconds (a 5-second span)


def base_series(preds):
    """The per-second base series the windowed descriptors read = whole-cortex mean
    |activation| per second (identical quantity to preds_series() and to arc_<id>.csv's
    global_mag). Deriving it the same way the module's scalar path already does keeps the
    temporal columns on the head's timebase. A 1-D input is returned unchanged (already a
    series). Label-free: a function of preds alone."""
    a = np.asarray(preds, float)
    return a if a.ndim == 1 else np.abs(a).mean(axis=1)


def per_second_features(preds):
    """(n_sec, 20484) preds  ->  (n_sec, k) matrix of LOCAL temporal-shape descriptors of the
    per-second neural series s = mean|activation|. One column per WINDOW_FEATURES entry:

      velocity      first difference  s[t] - s[t-1]        local rate of change (0 at t=0)
      acceleration  second difference s[t] - 2 s[t-1] + s[t-2]   local curvature (0 for t<2)
      roll_var      variance of s in the +/-ROLL_HALFWIN-second window centred on t — LOCAL
                    burstiness / dynamic range: high where the arc is agitated, low where it
                    is smooth. This is what the ROI mean-LEVEL and the global baseline miss.
      surprise      |velocity[t]| / (median|first-diff| + eps): a within-clip, scale-free
                    robust-threshold surprise — how outsized THIS second's jump is versus the
                    clip's own typical jump (>1 = a bigger-than-usual move).
      time_pos      normalized clock position t/(n-1) in [0,1]; the only purely-positional
                    column, letting the head read a monotone drift/trend over the clip.

    Every column is a function of preds ONLY — the label is never referenced — so nesting
    these beside the ROI columns cannot leak the target. Output shape is always (n_sec, k)."""
    s = base_series(preds)
    n = int(s.shape[0])
    k = len(WINDOW_FEATURES)
    F = np.zeros((n, k), float)
    if n == 0:
        return F

    vel = np.zeros(n)                                   # first difference (front-padded)
    if n >= 2:
        vel[1:] = np.diff(s)
    acc = np.zeros(n)                                   # second difference (front-padded)
    if n >= 3:
        acc[2:] = np.diff(s, n=2)

    rv = np.zeros(n)                                    # local rolling variance
    for t in range(n):
        lo, hi = max(0, t - ROLL_HALFWIN), min(n, t + ROLL_HALFWIN + 1)
        rv[t] = float(np.var(s[lo:hi])) if hi - lo >= 2 else 0.0

    scale = float(np.median(np.abs(np.diff(s)))) if n >= 2 else 0.0   # within-clip robust jump
    sur = np.abs(vel) / (scale + 1e-9) if scale > 0 else np.zeros(n)

    tpos = (np.arange(n, dtype=float) / (n - 1)) if n > 1 else np.zeros(n)

    F[:, 0], F[:, 1], F[:, 2], F[:, 3], F[:, 4] = vel, acc, rv, sur, tpos
    return F


def pooled_features(preds, edges):
    """(n_sec, 20484) preds + the retention_head pooling grid `edges` -> (n_bins, k):
    per_second_features aggregated into each bin by MEAN, using resample_to_grid — the SAME
    binning retention_head applies to its ROI columns, so fit-time/apply-time grids match and
    the temporal columns line up with the ROI columns row-for-row (n_bins == len(edges)-1).

    Consistent with per_second_features BY CONSTRUCTION: this is exactly the column-wise
    resample_to_grid of per_second_features(preds), i.e. identical to what retention_head
    would compute itself from the per_second_features fallback. An empty bin is NaN (the
    head's `good` mask then drops it), never silently zero-filled."""
    F = per_second_features(preds)
    tsec = np.arange(F.shape[0], dtype=float)
    return np.column_stack([resample_to_grid(tsec, F[:, j], edges)
                            for j in range(F.shape[1])])


# -----------------------------------------------------------------------------
# per-ad series derivation
# -----------------------------------------------------------------------------
def arc_series(ad_id, arc_dir, series_col="global_mag"):
    """Per-second arc from arc_<ad_id>.csv. Defaults to global_mag (the prior audits'
    hook_decay lead was on global |activation|); falls back to whichever column exists."""
    p = os.path.join(arc_dir, f"arc_{ad_id}.csv")
    if not os.path.exists(p):
        return None
    _, ac = _read_csv(p)
    col = series_col if series_col in ac else (
        "global_mag" if "global_mag" in ac else ("roi_mag" if "roi_mag" in ac else None))
    if col is None:
        return None
    return np.asarray(ac[col], float)


def preds_series(ad_id, preds_dir):
    """Per-second mean |activation| straight from preds_<ad_id>.npy (n_sec, 20484)."""
    p = os.path.join(preds_dir, f"preds_{ad_id}.npy")
    if not os.path.exists(p):
        return None
    preds = np.load(p).astype(float)
    if preds.ndim != 2:
        return None
    return np.abs(preds).mean(axis=1)


# -----------------------------------------------------------------------------
# combined leave-one-ad-out ridge + FULL-REFIT permutation null
# -----------------------------------------------------------------------------
def ridge_loo_oos(X, y, alpha=RIDGE_ALPHA):
    """Leave-one-ad-out ridge OOS predictions. Standardization (mean/std) is fit on the
    TRAINING fold only and applied to the held-out ad -> no leakage of the held-out row
    into its own scaler. y is centered on the training fold; the intercept is unpenalized."""
    X = np.asarray(X, float)
    y = np.asarray(y, float)
    n, p = X.shape
    oos = np.empty(n)
    eye = np.eye(p)
    for i in range(n):
        tr = np.ones(n, bool)
        tr[i] = False
        Xtr, ytr = X[tr], y[tr]
        mu = Xtr.mean(axis=0)
        sd = Xtr.std(axis=0)
        sd = np.where(sd == 0, 1.0, sd)
        Xs = (Xtr - mu) / sd
        ybar = float(ytr.mean())
        beta = np.linalg.solve(Xs.T @ Xs + alpha * eye, Xs.T @ (ytr - ybar))
        oos[i] = float(((X[i] - mu) / sd) @ beta + ybar)
    return oos


def combined_perm_p(X, y, alpha=RIDGE_ALPHA, n_perm=2000, seed=0):
    """Spearman(OOS ridge prediction, outcome) with a FULL-REFIT label-permutation null:
    every permutation shuffles the labels and RE-FITS the entire leave-one-ad-out ridge
    before re-scoring. (A fixed-prediction permutation would be invalid — this bug was
    caught before.) Honest p-floor = 1/(n_perm+1). Deterministic seed -> reproducible p."""
    r_obs = spearman(ridge_loo_oos(X, y, alpha), y)
    if np.isnan(r_obs):
        return np.nan, r_obs
    rng = np.random.default_rng(seed)
    idx = np.arange(len(y))
    cnt = 0
    for _ in range(n_perm):
        yp = y[rng.permutation(idx)]
        rp = spearman(ridge_loo_oos(X, yp, alpha), yp)   # REFIT inside the permutation
        if not np.isnan(rp) and abs(rp) >= abs(r_obs) - 1e-12:
            cnt += 1
    return (cnt + 1) / (n_perm + 1), r_obs


# -----------------------------------------------------------------------------
# Holm-Bonferroni across the pre-declared features
# -----------------------------------------------------------------------------
def holm(pvals):
    """Holm-Bonferroni step-down adjusted p-values, aligned to input order. NaN p-values
    pass through as NaN and never borrow significance."""
    ps = np.asarray(pvals, float)
    m = len(ps)
    order = np.argsort(ps, kind="mergesort")   # NaNs sort last
    adj = np.full(m, np.nan)
    run = 0.0
    for rank, i in enumerate(order):
        if np.isnan(ps[i]):
            continue
        run = max(run, min((m - rank) * ps[i], 1.0))
        adj[i] = run
    return adj


# -----------------------------------------------------------------------------
# driver
# -----------------------------------------------------------------------------
def run(ids, outcome_all, series_fn, baseline_dir, covs,
        n_perm=20000, n_perm_combined=2000, alpha=RIDGE_ALPHA):
    """Assemble per-ad features, run the per-feature Holm table + the combined model.
    Returns (rows, per_feature, combined, oos, meta). Pure — writes nothing."""
    rows = []
    for ad_id, y in zip(ids, outcome_all):
        series = series_fn(ad_id)
        if series is None:
            print(f"[skip] {ad_id}: no neural series")
            continue
        feats = extract_features(series)
        if any(not np.isfinite(v) for v in feats.values()):
            print(f"[skip] {ad_id}: degenerate/too-short series (a shape feature is undefined)")
            continue
        rows.append(dict(ad_id=ad_id, outcome=float(y),
                         base=baseline_summary(ad_id, baseline_dir), feats=feats))

    if len(rows) < 6:
        raise SystemExit(f"only {len(rows)} scorable ads — need >=6 (>=15-30 for any real "
                         "claim). Gather more ads / check extraction.")

    outcome = np.array([r["outcome"] for r in rows], float)
    with_base = [r for r in rows if r["base"] is not None]
    controlled = bool(covs and with_base)
    n_missing_base = len(rows) - len(with_base)
    if covs and n_missing_base:
        print(f"[warn] {n_missing_base} ad(s) lack baseline_*.csv -> excluded from the "
              "confound-controlled PARTIAL test.")

    # per-feature partial Spearman + label-perm null (on the covariate-controlled subset;
    # if no covariates are supplied the same null runs as a raw Spearman, Z empty) --------
    subset = with_base if controlled else rows
    out_s = np.array([r["outcome"] for r in subset], float)
    Z = (np.column_stack([[r["base"][c] for r in subset] for c in covs])
         if controlled else np.zeros((len(subset), 0)))
    seed = zlib.crc32(("|".join(r["ad_id"] for r in rows)).encode())

    per_feature = {}
    for f in FEATURES:
        fv_all = np.array([r["feats"][f] for r in rows], float)
        raw_r = pearson(_rankdata(fv_all), _rankdata(outcome))     # raw Spearman, all ads
        fv_s = np.array([r["feats"][f] for r in subset], float)
        p, pr = label_perm_p(fv_s, out_s, Z, n_perm=n_perm, seed=seed)
        per_feature[f] = dict(raw_r=raw_r, partial_r=pr, perm_p=p)

    holm_p = holm([per_feature[f]["perm_p"] for f in FEATURES])
    for f, hp in zip(FEATURES, holm_p):
        per_feature[f]["holm_p"] = float(hp) if np.isfinite(hp) else None
        per_feature[f]["signal"] = bool(np.isfinite(hp) and hp < 0.05
                                        and abs(per_feature[f]["partial_r"]) >= MIN_EFFECT_R)

    # combined leave-one-ad-out ridge on the six standardized features (full n) -----------
    X = np.column_stack([[r["feats"][f] for r in rows] for f in FEATURES])
    cp, cr = combined_perm_p(X, outcome, alpha=alpha, n_perm=n_perm_combined, seed=seed)
    oos = ridge_loo_oos(X, outcome, alpha)
    combined = dict(oos_r=cr, perm_p=cp,
                    signal=bool(np.isfinite(cp) and cp < 0.05 and abs(cr) >= MIN_EFFECT_R))

    meta = dict(n_ads=len(rows), n_with_baseline=len(with_base), controlled=controlled,
                covariates=covs, n_perm=n_perm, n_perm_combined=n_perm_combined, alpha=alpha)
    return rows, per_feature, combined, oos, meta


def _lead(per_feature):
    """Top LEAD = smallest perm p (tie-break: largest |partial r|). A lead, not a result."""
    def key(f):
        p = per_feature[f]["perm_p"]
        return (p if (p is not None and np.isfinite(p)) else 1.0,
                -abs(per_feature[f]["partial_r"]))
    return min(FEATURES, key=key)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--source", choices=["arc", "preds"], default="arc",
                    help="derive the per-second series from arc_<id>.csv (default) or "
                         "preds_<id>.npy (mean |activation|)")
    ap.add_argument("--series-col", default="global_mag",
                    help="arc column to shape-read when --source arc (global_mag|roi_mag)")
    ap.add_argument("--arc-dir", default="data/ads/arcs")
    ap.add_argument("--preds-dir", default="data/ads/arcs")
    ap.add_argument("--baseline-dir", default="data/ads/baseline")
    ap.add_argument("--covariates", default=",".join(COVARIATES),
                    help="comma-separated ffmpeg covariates to partial out (empty = none)")
    ap.add_argument("--outcome-is-rank", action="store_true",
                    help="manifest 'outcome' is a rank (1=best); invert so higher=better")
    ap.add_argument("--n-perm", type=int, default=20000, help="per-feature label perms")
    ap.add_argument("--n-perm-combined", type=int, default=2000,
                    help="combined-model full-refit perms (each refits the whole LOO ridge)")
    ap.add_argument("--alpha", type=float, default=RIDGE_ALPHA, help="ridge penalty")
    ap.add_argument("--out", default="validation/temporal_readout.csv")
    ap.add_argument("--json-out", default="validation/temporal_readout.json")
    args = ap.parse_args()

    covs = [c.strip() for c in args.covariates.split(",") if c.strip()]
    ids, outcome_all = load_manifest(args.manifest, args.outcome_is_rank)

    if args.source == "preds":
        def series_fn(ad_id):
            return preds_series(ad_id, args.preds_dir)
    else:
        def series_fn(ad_id):
            return arc_series(ad_id, args.arc_dir, args.series_col)

    rows, per_feature, combined, oos, meta = run(
        ids, outcome_all, series_fn, args.baseline_dir, covs,
        n_perm=args.n_perm, n_perm_combined=args.n_perm_combined, alpha=args.alpha)

    lead = _lead(per_feature)
    any_feature_signal = any(per_feature[f]["signal"] for f in FEATURES)
    signal = bool(combined["signal"] or any_feature_signal)

    # report --------------------------------------------------------------------
    src = f"{args.source}/{args.series_col}" if args.source == "arc" else "preds:mean|act|"
    print("\n" + "=" * 78)
    print(f"TEMPORAL-DYNAMICS READ-OUT   n_ads={meta['n_ads']}  source={src}  "
          f"{'controlled' if meta['controlled'] else 'RAW (no covariates)'}  cov={covs}")
    print("=" * 78)
    print(f"{'feature':<15}{'raw r':>8}{'partial r':>11}{'perm p':>9}{'holm p':>9}{'':>6}")
    print("-" * 78)
    for f in FEATURES:
        d = per_feature[f]
        tag = "  SIGNAL" if d["signal"] else ("  <-lead" if f == lead else "")
        hp = d["holm_p"]
        print(f"{f:<15}{d['raw_r']:>8.2f}{d['partial_r']:>11.2f}"
              f"{(d['perm_p'] if d['perm_p'] is not None else float('nan')):>9.3f}"
              f"{(hp if hp is not None else float('nan')):>9.3f}{tag}")
    print("-" * 78)
    cr, cp = combined["oos_r"], combined["perm_p"]
    print(f"{'COMBINED ridge':<15}{'':>8}{cr:>11.2f}{(cp if cp is not None else float('nan')):>9.3f}"
          f"{'':>9}{'  SIGNAL' if combined['signal'] else ''}   (LOO OOS, full-refit null)")
    print("-" * 78)

    # honest verdict ------------------------------------------------------------
    if signal:
        parts = []
        if combined["signal"]:
            # the combined ridge is NOT ffmpeg-controlled (only the per-feature Holm table
            # is) — say so, so a combined-only signal never implies confound control it lacks.
            parts.append(f"combined LOO ridge OOS r={cr:.2f}, perm p={cp:.3f} "
                         "(NOT ffmpeg-controlled)")
        survivors = [f for f in FEATURES if per_feature[f]["signal"]]
        if survivors:
            ctl = ("controlling " + ", ".join(covs)) if meta["controlled"] else \
                "NO covariate control"
            parts.append(f"features surviving Holm ({ctl}): " + ", ".join(
                f"{f} (partial r={per_feature[f]['partial_r']:.2f}, holm p={per_feature[f]['holm_p']:.3f})"
                for f in survivors))
        verdict = ("SIGNAL — temporal shape predicts the outcome ("
                   + "; ".join(parts) + "). Encouraging; still a PROXY outcome, out-of-"
                   "distribution scorer, small n — a hypothesis, not a validated model.")
    else:
        ld = per_feature[lead]
        verdict = (f"NULL — no temporal shape feature survives Holm and the combined model does "
                   f"not clear the floor. Top LEAD is {lead} (partial r={ld['partial_r']:.2f}, "
                   f"raw perm p={ld['perm_p'] if ld['perm_p'] is not None else float('nan'):.3f}, "
                   f"Holm p={ld['holm_p'] if ld['holm_p'] is not None else float('nan'):.3f}); "
                   f"combined OOS r={cr:.2f}, perm p={cp if cp is not None else float('nan'):.3f}. "
                   "Reported plainly as an UNDERPOWERED baseline — the read-out's value is the "
                   "reusable architecture that fires when real retention labels arrive, NOT a "
                   "positive result today. Do not quote the lead as a finding.")
    print("VERDICT:", verdict)
    print("\nReminder: outcome (days-running) is a PROXY for real spend; the scorer is applied "
          "out-of-distribution; n_ads is the sample size, not n_seconds.")

    # write per-ad CSV ----------------------------------------------------------
    if args.out:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w") as f:
            f.write("ad_id,outcome," + ",".join(FEATURES) + ","
                    + ",".join(covs) + ",oos_pred\n")
            for r, op in zip(rows, oos):
                fv = ",".join(f"{r['feats'][ft]:.5f}" for ft in FEATURES)
                cv = ",".join(f"{(r['base'][c] if r['base'] else float('nan')):.4f}" for c in covs)
                f.write(f"{r['ad_id']},{r['outcome']:.4f},{fv},{cv},{op:.5f}\n")
        print(f"[wrote] {args.out}")

    # write machine-readable summary --------------------------------------------
    if args.json_out:
        os.makedirs(os.path.dirname(args.json_out) or ".", exist_ok=True)

        def _clean(d):
            return {k: (None if isinstance(v, float) and not np.isfinite(v) else v)
                    for k, v in d.items()}
        payload = dict(
            source=args.source, series_col=(args.series_col if args.source == "arc" else None),
            features=FEATURES, min_effect_r=MIN_EFFECT_R, signal=signal, lead=lead,
            **meta,
            per_feature={f: _clean(per_feature[f]) for f in FEATURES},
            combined=_clean(combined),
            verdict=verdict)
        with open(args.json_out, "w") as f:
            json.dump(payload, f, indent=2, allow_nan=False)
        print(f"[wrote] {args.json_out}")


if __name__ == "__main__":
    main()
