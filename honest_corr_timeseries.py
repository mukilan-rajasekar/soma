#!/usr/bin/env python3
"""
honest_corr_timeseries.py — WITHIN-VIDEO arc validation for TRIBE activation vs a
human attention curve (TVSum), done honestly.

WHY THIS EXISTS (read before trusting any number it prints)
-----------------------------------------------------------
The between-video scalar test (honest_corr.py) is statistically dead at our n
(a handful of videos). The powered, product-shaped test is WITHIN a video:
does TRIBE's predicted per-second activation arc track a multi-annotator human
attention arc, where n = TIME (tens-to-hundreds of points per video)?

Both series are smooth and autocorrelated. A naive point-wise correlation (what
honest_corr.py's i.i.d. shuffle does) treats 180 smooth points as 180
independent observations and manufactures a spuriously tiny p. That is the exact
sin we are trying NOT to commit, at higher resolution. So this tool:

  1. FIRST-DIFFERENCES both series      -> removes the shared slow drift; we test
                                           whether they move together moment-to-
                                           moment, not whether they both trend.
  2. Uses a CIRCULAR-SHIFT permutation  -> the null preserves each series'
     null                                  autocorrelation while destroying the
                                           cross-alignment. This is the honest p.
  3. Reports a LEAVE-ONE-ANNOTATOR-OUT  -> how well one annotator predicts the mean of
     noise ceiling                         the others: a REFERENCE scale for r, not a
                                           hard upper bound. The model is scored against
                                           the 20-annotator MEAN (an easier, lower-noise
                                           target), so r/ceiling CAN exceed 1 — interpret
                                           it, don't treat it as a cap the model can't beat.
  4. Reports EVERY video (forest table  -> no best-of-N. A combined p across all
     + Stouffer/Fisher combined p)         videos, not the single prettiest one.
  5. Runs BOTH pre-registered features  -> `global` (whole-cortex magnitude; the
     side by side                          documented likely-null baseline, since
                                           a global TRIBE drive is already
                                           published NOT to predict YouTube
                                           replay) and `roi` (an a-priori region;
                                           the distinct, still-open test).

Pre-register the feature/ROI/aggregation in PREREGISTRATION.md BEFORE you run
this. Do not switch features after seeing results — that turns (2) back into
cherry-picking.

INPUTS
------
Model arcs   : arc_<id>.csv from batch_extract.py, columns:
                 t_sec, global_mag, roi_mag        (roi_mag optional)
Human arcs   : from tvsum_prep.py, per video <id>:
                 human_arc_<id>.csv   -> cols: t_start, importance   (mean over annotators)
                 human_annos_<id>.npy -> array (n_annotators, n_shots) for the ceiling
IDs are matched on <id> (the shared stem).

USAGE
-----
    python honest_corr_timeseries.py \
        --model-glob "arc_*.csv" \
        --human-dir  ./data/tvsum \
        --feature both \
        --n-perm 5000 \
        --out validation/results

Only hard dependency is numpy. matplotlib is optional (forest plot); if absent,
a results table is still written.
"""
import argparse
import csv
import glob
import math
import os
import sys
import time
import zlib

import numpy as np


# pre-registered minimum non-trivial effect size (|median Spearman r|); below this a
# result is effectively null even if p<alpha
MIN_EFFECT_R = 0.10

DEFAULT_N_PERM = 5000       # max circular shifts evaluated before we sample instead of enumerate
DEFAULT_MIN_SHIFT = 3       # smallest circular shift; excludes near-identity rolls at either end


# -----------------------------------------------------------------------------
# self-contained stats (numpy + stdlib only, so this runs anywhere)
# -----------------------------------------------------------------------------
def _rankdata(a):
    """Average ranks, ties handled (matches scipy.stats.rankdata 'average')."""
    a = np.asarray(a, float)
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(len(a), float)
    sa = a[order]
    i = 0
    n = len(a)
    while i < n:
        j = i
        while j + 1 < n and sa[j + 1] == sa[i]:
            j += 1
        ranks[order[i:j + 1]] = 0.5 * (i + j) + 1.0  # 1-based average rank
        i = j + 1
    return ranks


def pearson(x, y):
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    # Tolerance, not == 0: a residualized constant (a flat series with its fitted mean
    # subtracted in float) keeps a std of ~1e-16 rounding noise, sails past an exact
    # check, and corrcoef manufactures a plausible-looking r out of that noise.
    if len(x) < 3 or x.std() <= 1e-10 or y.std() <= 1e-10:
        return np.nan
    return float(np.corrcoef(x, y)[0, 1])


def spearman(x, y):
    """Spearman rho = Pearson on ranks. No scipy needed."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    if len(x) < 3:
        return np.nan
    return pearson(_rankdata(x), _rankdata(y))


def _norm_cdf(z):
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _norm_ppf(p):
    """Inverse normal CDF (Acklam's rational approximation). numpy/stdlib only."""
    if p <= 0.0:
        return -np.inf
    if p >= 1.0:
        return np.inf
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / \
               ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / \
                ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q / \
           (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1)


def circular_shift_p(x, y, n_perm=DEFAULT_N_PERM, min_shift=DEFAULT_MIN_SHIFT, seed=0):
    """
    Two-sided p under a circular-shift null that preserves each series'
    autocorrelation: circularly roll y and recompute the correlation.

    x, y are the ALREADY-FIRST-DIFFERENCED series. The allowed non-identity
    shifts are s in [min_shift, n - min_shift] (excluding near-identity rolls at
    either end that barely disturb the alignment). There are only M = |that set|
    DISTINCT shifts, so the honest p floor is 1/(M+1) - NOT 1/(n_perm+1).

    We therefore ENUMERATE ALL allowed shifts when M <= n_perm (exact and
    deterministic - no RNG, fully reproducible); only if M > n_perm do we sample
    WITHOUT replacement. The reported p uses the number of shifts actually
    evaluated as the denominator, so it can never fabricate precision the null
    does not support.
    """
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    n = len(x)
    r_obs = spearman(x, y)
    if np.isnan(r_obs) or n < 8:
        return np.nan, r_obs, 0
    lo, hi = min_shift, n - min_shift
    if hi < lo:
        return np.nan, r_obs, 0
    shifts = np.arange(lo, hi + 1)                    # M distinct shifts
    if len(shifts) > n_perm:
        rng = np.random.default_rng(seed)
        shifts = rng.permutation(shifts)[:n_perm]     # sample WITHOUT replacement
    count = 0
    for s in shifts:
        if abs(spearman(x, np.roll(y, int(s)))) >= abs(r_obs) - 1e-12:
            count += 1
    p = (count + 1) / (len(shifts) + 1)               # honest floor = 1/(M+1)
    return p, r_obs, n


def effective_n(x, y):
    """
    Bartlett-style effective sample size accounting for lag-1 autocorrelation in
    each series. Reported only as a cross-check on the permutation p; the
    permutation p is primary.
    """
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    n = len(x)
    if n < 4:
        return float(n)
    rx = pearson(x[:-1], x[1:])
    ry = pearson(y[:-1], y[1:])
    if np.isnan(rx) or np.isnan(ry):
        return float(n)
    denom = 1 + rx * ry
    if denom <= 0:
        return float(n)
    # Cap at n: opposite-sign autocorrelations (rx*ry < 0) would otherwise make
    # n_eff exceed n and INFLATE significance - the opposite of this function's
    # purpose. Effective n may only shrink relative to n.
    return float(min(n, n * (1 - rx * ry) / denom))


def parametric_p_from_r(r, n_eff):
    """Two-sided p for a correlation r at effective n (t-distribution -> normal)."""
    if np.isnan(r) or n_eff < 4 or abs(r) >= 1:
        return np.nan
    t = r * math.sqrt((n_eff - 2) / (1 - r * r))
    # normal approx to the t tail is fine given n_eff is already a soft estimate
    return 2 * (1 - _norm_cdf(abs(t)))


# -----------------------------------------------------------------------------
# alignment
# -----------------------------------------------------------------------------
def resample_to_grid(t_src, v_src, t_edges):
    """
    Average v_src (sampled at times t_src) into bins defined by t_edges.
    Used to put the 1 Hz model arc onto TVSum's 2 s shot grid so the two series
    share a timebase. Returns one value per bin (NaN if a bin is empty).
    """
    t_src = np.asarray(t_src, float)
    v_src = np.asarray(v_src, float)
    out = np.full(len(t_edges) - 1, np.nan)
    idx = np.digitize(t_src, t_edges) - 1
    for b in range(len(t_edges) - 1):
        m = idx == b
        if m.any():
            out[b] = np.nanmean(v_src[m])
    return out


def first_diff(a):
    a = np.asarray(a, float)
    return np.diff(a)


# -----------------------------------------------------------------------------
# noise ceiling
# -----------------------------------------------------------------------------
def leave_one_annotator_out_ceiling(annos):
    """
    annos: (n_annotators, n_shots). For each annotator, correlate their arc with
    the mean of the OTHERS (first-differenced Spearman), then average. This is
    the human-agreement ceiling the model is measured against.
    """
    annos = np.asarray(annos, float)
    A, T = annos.shape
    if A < 2 or T < 4:
        return np.nan
    rs = []
    for i in range(A):
        others = np.delete(annos, i, axis=0).mean(axis=0)
        rs.append(spearman(first_diff(annos[i]), first_diff(others)))
    return float(np.nanmean(rs))


def split_half_ceiling(annos, seed=0, n_splits=25):
    """
    annos: (n_annotators, n_shots). A reliability-based noise ceiling, complementary
    to the leave-one-annotator-out one. For each random split of the A annotators into
    two halves, correlate the first-differenced half-means:
        r_half = spearman(first_diff(h1.mean(0)), first_diff(h2.mean(0)))
    Average r_half across splits (skipping NaN/<=0 splits), Spearman-Brown up-correct
    the half-panel reliability to the FULL panel (R_full = 2*r_half/(1+r_half)), and
    return sqrt(R_full) as the predictable-signal ceiling. Deterministic given `seed`.
    """
    annos = np.asarray(annos, float)
    A, T = annos.shape
    if A < 2 or T < 4:
        return np.nan
    rng = np.random.default_rng(seed)
    rs = []
    for _ in range(n_splits):
        perm = rng.permutation(A)
        h1, h2 = perm[: A // 2], perm[A // 2:]
        if len(h1) < 1 or len(h2) < 1:
            continue
        r_half = spearman(first_diff(annos[h1].mean(axis=0)),
                          first_diff(annos[h2].mean(axis=0)))
        if np.isnan(r_half) or r_half <= 0:
            continue
        rs.append(r_half)
    if not rs:
        return np.nan
    r_half = float(np.mean(rs))
    R_full = 2 * r_half / (1 + r_half)
    if R_full <= 0:
        return np.nan
    return float(math.sqrt(R_full))


# -----------------------------------------------------------------------------
# per-video test
# -----------------------------------------------------------------------------
def test_one_video(model_t, model_v, human_t_start, human_v, annos,
                   shot_sec=2.0, n_perm=5000, seed=0):
    """
    Align the model arc to the human shot grid, first-difference both, run the
    circular-shift test, and compute the ceiling. Returns a dict of results.
    """
    duration = float(human_t_start[-1] + shot_sec)
    edges = np.append(np.asarray(human_t_start, float), duration)
    model_binned = resample_to_grid(model_t, model_v, edges)
    human_arr = np.asarray(human_v, float)

    valid = ~np.isnan(model_binned) & ~np.isnan(human_arr)
    if int(valid.sum()) < 8:
        return dict(n=int(valid.sum()), r=np.nan, p=np.nan, p_param=np.nan,
                    n_eff=np.nan, ceiling=np.nan, note="too few aligned bins")

    # Difference BEFORE compaction, then keep only diffs whose BOTH endpoints are
    # valid bins. This prevents a dropped interior bin from making two
    # non-adjacent shots look adjacent (which would fabricate a co-movement).
    m_arr = np.where(valid, model_binned, np.nan)
    h_arr = np.where(valid, human_arr, np.nan)
    dm_full, dh_full = np.diff(m_arr), np.diff(h_arr)
    keep = valid[:-1] & valid[1:]
    dm, dh = dm_full[keep], dh_full[keep]
    if len(dm) < 8:
        return dict(n=len(dm), r=np.nan, p=np.nan, p_param=np.nan,
                    n_eff=np.nan, ceiling=np.nan, note="too few contiguous bins")

    p, r, n = circular_shift_p(dm, dh, n_perm=n_perm, seed=seed)
    n_eff = effective_n(dm, dh)
    p_param = parametric_p_from_r(r, n_eff)
    # Primary ceiling: leave-one-annotator-out human agreement.
    ceiling = leave_one_annotator_out_ceiling(annos) if annos is not None else np.nan
    frac = (r / ceiling) if (ceiling and not np.isnan(ceiling) and ceiling > 0) else np.nan
    # Secondary ceiling: split-half reliability, Spearman-Brown up-corrected (deterministic seed).
    ceiling_sh = split_half_ceiling(annos, seed=seed) if annos is not None else np.nan
    frac_sh = (r / ceiling_sh) if (ceiling_sh and not np.isnan(ceiling_sh) and ceiling_sh > 0) \
        else np.nan
    return dict(n=n, r=r, p=p, p_param=p_param, n_eff=n_eff,
                ceiling=ceiling, frac_of_ceiling=frac,
                ceiling_splithalf=ceiling_sh, frac_of_ceiling_splithalf=frac_sh, note="")


# -----------------------------------------------------------------------------
# aggregation across videos
# -----------------------------------------------------------------------------
def stouffer(ps, rs):
    """Signed Stouffer: convert each two-sided p to a signed z, average, renormalize."""
    zs = []
    for p, r in zip(ps, rs):
        if p is None or np.isnan(p) or np.isnan(r):
            continue
        p = min(max(p, 1e-12), 1 - 1e-12)
        z = _norm_ppf(1 - p / 2) * (1 if r >= 0 else -1)
        zs.append(z)
    if not zs:
        return np.nan, np.nan
    z_comb = float(np.sum(zs) / math.sqrt(len(zs)))
    p_comb = 2 * (1 - _norm_cdf(abs(z_comb)))
    return z_comb, p_comb


def fisher(ps):
    vals = [p for p in ps if p is not None and not np.isnan(p)]
    if not vals:
        return np.nan, np.nan
    stat = -2.0 * sum(math.log(min(max(p, 1e-12), 1.0)) for p in vals)
    k = len(vals)
    # chi-square(2k) survival via a simple series is overkill; report the stat
    # and dof and let the reader compare. We approximate the p with a
    # Wilson-Hilferty normal transform (good enough for reporting).
    df = 2 * k
    z = (( (stat / df) ** (1 / 3) ) - (1 - 2 / (9 * df))) / math.sqrt(2 / (9 * df))
    p = 1 - _norm_cdf(z)
    return stat, p


# -----------------------------------------------------------------------------
# io
# -----------------------------------------------------------------------------
def _read_csv(path, required=None):
    """Tiny CSV reader (stdlib `csv`, no pandas dependency). Returns (header, dict of cols).

    Uses csv.reader so quoted fields / embedded commas parse correctly (an upgrade over the
    old naive .split(",")). Blank rows are skipped, header cells are stripped, and each column
    is coerced to a float array when every value parses, else kept as an object array. If
    `required` is given, raises ValueError listing any missing columns (optional, backward-
    compatible: the ~14 existing call sites still get the same (header, cols) two-tuple).
    """
    with open(path, newline="") as f:
        rows = [r for r in csv.reader(f) if r and any(c.strip() for c in r)]
    header = [h.strip() for h in rows[0]]
    if required is not None:
        missing = [c for c in required if c not in header]
        if missing:
            raise ValueError(f"{path}: missing required column(s): {', '.join(missing)}")
    cols = {h: [] for h in header}
    for parts in rows[1:]:
        for h, v in zip(header, parts):
            cols[h].append(v)
    for h in header:
        try:
            cols[h] = np.array(cols[h], float)
        except ValueError:
            cols[h] = np.array(cols[h], object)
    return header, cols


def stem_id(path):
    base = os.path.splitext(os.path.basename(path))[0]
    for pre in ("arc_", "stats_", "human_arc_"):
        if base.startswith(pre):
            base = base[len(pre):]
    return base


def _run_bench():
    """Micro-benchmark the permutation null: time circular_shift_p on synthesized
    first-differenced pairs of increasing length. Prints a `len_points,seconds` table
    plus the number of shifts actually enumerated per length. Deterministic (fixed seed).
    """
    rng = np.random.default_rng(0)
    print("len_points,seconds,shifts_enumerated")
    for n in [30, 60, 120, 240, 480]:
        # first-difference two smooth random walks -> length-n pairs shaped like the
        # real (already-first-differenced) inputs to circular_shift_p
        x = first_diff(np.cumsum(rng.standard_normal(n + 1)))
        y = first_diff(np.cumsum(rng.standard_normal(n + 1)))
        # distinct shifts the null actually evaluates (mirrors circular_shift_p's policy)
        lo, hi = DEFAULT_MIN_SHIFT, n - DEFAULT_MIN_SHIFT
        n_shifts = min(max(0, hi - lo + 1), DEFAULT_N_PERM)
        t0 = time.perf_counter()
        circular_shift_p(x, y)
        dt = time.perf_counter() - t0
        print(f"{n},{dt:.4f},{n_shifts}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model-glob", default="arc_*.csv",
                    help="per-video model arcs from batch_extract.py")
    ap.add_argument("--human-dir", default="./data/tvsum",
                    help="dir with human_arc_<id>.csv and human_annos_<id>.npy")
    ap.add_argument("--feature", choices=["global", "roi", "both"], default="both",
                    help="which pre-registered feature(s) to test")
    ap.add_argument("--shot-sec", type=float, default=2.0,
                    help="TVSum shot length (grid step)")
    ap.add_argument("--n-perm", type=int, default=DEFAULT_N_PERM)
    ap.add_argument("--out", default="validation/results",
                    help="output prefix (writes <out>.csv and <out>_forest.png)")
    ap.add_argument("--bench", action="store_true",
                    help="skip the normal run; time circular_shift_p on synthesized "
                         "first-differenced pairs of increasing length and print a table")
    args = ap.parse_args()

    if args.bench:
        _run_bench()
        return

    model_files = sorted(glob.glob(args.model_glob))
    if not model_files:
        sys.exit(f"No model arcs match {args.model_glob!r}. Run batch_extract.py first.")

    feats = ["global", "roi"] if args.feature == "both" else [args.feature]
    print("=" * 78)
    print("WITHIN-VIDEO arc validation  (n = time; circular-shift null; "
          "first-differenced)")
    print("Pre-register the feature/ROI in PREREGISTRATION.md BEFORE reading these "
          "numbers.")
    print("Reminder: 'global' is the documented likely-NULL baseline; 'roi' is the "
          "open test.")
    print("=" * 78)

    rows = []
    for mf in model_files:
        vid = stem_id(mf)
        _, mcols = _read_csv(mf)
        if "t_sec" not in mcols:
            print(f"  [skip] {vid}: arc file missing t_sec column")
            continue
        harc = os.path.join(args.human_dir, f"human_arc_{vid}.csv")
        hann = os.path.join(args.human_dir, f"human_annos_{vid}.npy")
        if not os.path.exists(harc):
            print(f"  [skip] {vid}: no human_arc at {harc}")
            continue
        _, hcols = _read_csv(harc)
        t_start = hcols.get("t_start")
        importance = hcols.get("importance")
        if t_start is None or importance is None:
            print(f"  [skip] {vid}: human_arc missing t_start/importance")
            continue
        annos = np.load(hann) if os.path.exists(hann) else None

        for feat in feats:
            col = "global_mag" if feat == "global" else "roi_mag"
            if col not in mcols:
                if feat == "roi":
                    print(f"  [note] {vid}: no roi_mag in arc (ROI mask not built?) "
                          f"- skipping roi feature")
                continue
            # Deterministic per-video seed (zlib.crc32, NOT the salted built-in
            # hash()) so permutation p-values are byte-for-byte reproducible run to
            # run - essential for a pre-registered test. Only used in the rare
            # branch where the shift set is sampled rather than enumerated.
            res = test_one_video(mcols["t_sec"], mcols[col], t_start, importance,
                                 annos, shot_sec=args.shot_sec, n_perm=args.n_perm,
                                 seed=zlib.crc32(vid.encode()))
            res.update(video=vid, feature=feat)
            rows.append(res)

    if not rows:
        sys.exit("No videos produced a result. Check id matching between arc_* and "
                 "human_arc_*.")

    # per-feature aggregation + report
    print(f"\n{'video':<22}{'feat':<8}{'n':>4}{'r':>8}{'perm_p':>9}"
          f"{'p_param':>9}{'ceiling':>9}{'r/ceil':>8}")
    print("-" * 78)
    for feat in feats:
        fr = [r for r in rows if r["feature"] == feat]
        if not fr:
            continue
        for r in sorted(fr, key=lambda d: d["video"]):
            print(f"{r['video']:<22}{feat:<8}{r['n']:>4}"
                  f"{_fmt(r['r']):>8}{_fmt(r['p'],3):>9}{_fmt(r['p_param'],3):>9}"
                  f"{_fmt(r['ceiling']):>9}{_fmt(r.get('frac_of_ceiling')):>8}")
        z, pc = stouffer([r["p"] for r in fr], [r["r"] for r in fr])
        _, pf = fisher([r["p"] for r in fr])
        med_r = np.nanmedian([r["r"] for r in fr])
        med_ceil = np.nanmedian([r["ceiling"] for r in fr])
        print(f"  -> {feat.upper()}: {len(fr)} videos | median r = {_fmt(med_r)} | "
              f"median ceiling = {_fmt(med_ceil)} | Stouffer p = {_fmt(pc,4)} | "
              f"Fisher p (omnibus, direction-agnostic) = {_fmt(pf,4)}")
        print()

    _write_results(args.out, rows, feats)
    _maybe_forest(args.out, rows, feats)
    print("HONEST READ: report EVERY row above, not the best one. If GLOBAL is null "
          "and ROI\nsurvives the circular-shift null across videos, that is your "
          "signal - and it is a\nDISTINCT test from the published global-vs-replay "
          "null. If nothing survives, say so;\nthat is the pre-registered outcome, "
          "not a failure to hide.\n")


def _fmt(x, nd=2):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "  -  "
    return f"{x:.{nd}f}"


def _write_results(out, rows, feats):
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    path = out + ".csv"
    # NOTE: the two split-half columns are APPENDED at the END so every existing column
    # index/consumer (publish_results.py, etc.) is unaffected.
    cols = ["video", "feature", "n", "r", "p", "p_param", "n_eff",
            "ceiling", "frac_of_ceiling", "note",
            "ceiling_splithalf", "frac_of_ceiling_splithalf"]
    with open(path, "w") as f:
        f.write(",".join(cols) + "\n")
        for r in rows:
            f.write(",".join(str(r.get(c, "")) for c in cols) + "\n")
    print(f"[wrote] {path}")


def _maybe_forest(out, rows, feats):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        print("[note] matplotlib not available - skipping forest plot (CSV written).")
        return
    fig, ax = plt.subplots(figsize=(8, max(3, 0.4 * len(rows) + 1)))
    y = 0
    yticks, ylabels = [], []
    colors = {"global": "#9aa0a6", "roi": "#2e7d32"}
    for feat in feats:
        for r in sorted([x for x in rows if x["feature"] == feat],
                        key=lambda d: d["video"]):
            if np.isnan(r["r"]):
                continue
            ax.plot([r["r"]], [y], "o", color=colors.get(feat, "#333"))
            ax.text(1.02, y, f"p={_fmt(r['p'],3)}", va="center", fontsize=7,
                    transform=ax.get_yaxis_transform())
            yticks.append(y)
            ylabels.append(f"{r['video'][:16]} [{feat}]")
            y += 1
    ax.axvline(0, color="k", lw=0.8, ls="--", alpha=0.5)
    ax.set_yticks(yticks)
    ax.set_yticklabels(ylabels, fontsize=7)
    ax.set_xlabel("Spearman r (first-differenced, model arc vs human interest arc)")
    ax.set_title("Within-video arc validation - report ALL videos (no best-of-N)")
    fig.tight_layout()
    png = out + "_forest.png"
    fig.savefig(png, dpi=140)
    print(f"[wrote] {png}")


if __name__ == "__main__":
    main()
