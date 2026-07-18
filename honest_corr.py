#!/usr/bin/env python3
"""
honest_corr.py — small-n-safe correlation check for TRIBE brain metrics vs engagement.

Replaces the "compute 12 correlations, report the two biggest" step with an
honest procedure: permutation p-values, leave-one-out stability, collinearity
flags, and multiple-comparison context.

Usage:
    python honest_corr.py                          # uses defaults below
    python honest_corr.py --stats-glob "stats_*.csv" --engagement engagement.csv
    python honest_corr.py --outcomes retention_pct avg_view_duration

Inputs:
    - stats CSVs: one row each, produced by your notebook's metrics cell.
      Must contain a 'filename_id' column + the metric columns.
    - engagement.csv: YOUR REAL NUMBERS, decoupled from filenames. Columns:
          id,<outcome1>,<outcome2>,...
      where 'id' matches filename_id. If it doesn't exist, a template is written.
"""
import argparse, glob, os, sys
import numpy as np
import pandas as pd

def pearson(x, y):
    x = np.asarray(x, float); y = np.asarray(y, float)
    if x.std() == 0 or y.std() == 0:
        return np.nan
    return float(np.corrcoef(x, y)[0, 1])

def perm_p(x, y, n_perm=20000, seed=0):
    """Two-sided permutation p-value: how often does shuffled data beat |r_obs|?"""
    r_obs = pearson(x, y)
    if np.isnan(r_obs):
        return np.nan, r_obs
    rng = np.random.default_rng(seed)
    y = np.asarray(y, float)
    count = 0
    for _ in range(n_perm):
        if abs(pearson(x, rng.permutation(y))) >= abs(r_obs) - 1e-12:
            count += 1
    return (count + 1) / (n_perm + 1), r_obs

def loo_range(x, y):
    """Min/max r when each single point is dropped. Wide range = fragile."""
    x = np.asarray(x, float); y = np.asarray(y, float)
    rs = []
    for i in range(len(x)):
        m = np.arange(len(x)) != i
        rs.append(pearson(x[m], y[m]))
    return float(np.nanmin(rs)), float(np.nanmax(rs))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stats-glob", default="stats_*.csv")
    ap.add_argument("--engagement", default="engagement.csv")
    # RETENTION (avg % viewed), never views/likes: views are driven by
    # thumbnail/title/algorithm, not the content the model can see. This tool is
    # the DOCUMENTED SECONDARY test (between-video, n=videos) - it is expected to
    # be underpowered at small n. The PRIMARY test is honest_corr_timeseries.py
    # (within-video, n=time).
    ap.add_argument("--outcomes", nargs="+", default=["retention_pct"])
    ap.add_argument("--n-perm", type=int, default=20000)
    ap.add_argument("--id-col", default="filename_id")
    args = ap.parse_args()

    files = sorted(glob.glob(args.stats_glob))
    if not files:
        sys.exit(f"No files match {args.stats_glob!r}. Run the metrics cell first.")
    rows = []
    for f in files:
        d = pd.read_csv(f)
        if args.id_col not in d.columns:
            d[args.id_col] = os.path.splitext(os.path.basename(f))[0]
        rows.append(d)
    stats = pd.concat(rows, ignore_index=True)

    if not os.path.exists(args.engagement):
        tmpl = stats[[args.id_col]].copy().rename(columns={args.id_col: "id"})
        for o in args.outcomes:
            tmpl[o] = ""
        tmpl.to_csv(args.engagement, index=False)
        sys.exit(f"Wrote template {args.engagement!r} with {len(tmpl)} ids. "
                 f"Fill in REAL {args.outcomes} and rerun.")

    eng = pd.read_csv(args.engagement)
    df = stats.merge(eng, left_on=args.id_col, right_on="id", how="inner")
    n = len(df)

    # Guard the silent inner-join-to-nothing: a single stem/id typo drops rows to
    # zero (or drops some), and the run that decides the company would then report
    # on the wrong set without warning.
    if n == 0:
        s_ids = sorted(stats[args.id_col].astype(str))
        e_ids = sorted(eng["id"].astype(str))
        sys.exit(f"\n0 rows matched between stats and {args.engagement!r}.\n"
                 f"  stats ids     : {s_ids}\n"
                 f"  engagement ids: {e_ids}\n"
                 f"Fix the id spellings so they match, then rerun.")
    if n < len(stats):
        matched = set(df[args.id_col].astype(str))
        missing = sorted(set(stats[args.id_col].astype(str)) - matched)
        print(f"  ⚠  only {n}/{len(stats)} stats rows matched an engagement id. "
              f"Unmatched: {missing}")
    metric_cols = [c for c in stats.columns
                   if c != args.id_col and pd.api.types.is_numeric_dtype(stats[c])]

    print(f"\nn = {n} videos matched.")
    if n < 12:
        print(f"  ⚠  n={n} is very small. Treat everything below as directional at best.")
    n_tests = len(metric_cols) * len(args.outcomes)
    bonf = 0.05 / n_tests
    print(f"  {len(metric_cols)} metrics × {len(args.outcomes)} outcomes = {n_tests} tests.")
    print(f"  Bonferroni-corrected significance threshold: p < {bonf:.4f}\n")

    # collinearity among metrics
    print("Collinearity (|r| > 0.9 means these are the SAME signal, not independent evidence):")
    cm = df[metric_cols].corr()
    redundant = set()
    for i in range(len(metric_cols)):
        for j in range(i + 1, len(metric_cols)):
            if abs(cm.iloc[i, j]) > 0.9:
                print(f"    {metric_cols[i]} ↔ {metric_cols[j]}: r = {cm.iloc[i,j]:.2f}")
                redundant.add(metric_cols[j])
    if not redundant:
        print("    (none — metrics are reasonably independent)")
    print()

    # outcome collinearity
    if len(args.outcomes) >= 2:
        ro = pearson(df[args.outcomes[0]], df[args.outcomes[1]])
        print(f"Outcome collinearity: {args.outcomes[0]} ↔ {args.outcomes[1]}: r = {ro:.2f}")
        if abs(ro) > 0.8:
            print("    ⚠  These outcomes move together, so a metric that predicts one")
            print("       'also' predicting the other is NOT independent confirmation.\n")
        else:
            print()

    # the actual tests
    results = []
    for o in args.outcomes:
        for m in metric_cols:
            p, r = perm_p(df[m], df[o], n_perm=args.n_perm)
            lo, hi = loo_range(df[m], df[o])
            flips = lo * hi < 0  # sign changes when a point is dropped
            results.append((o, m, r, p, lo, hi, flips))

    results.sort(key=lambda t: (t[0], t[3]))  # by outcome, then p
    print("Results (permutation p, and leave-one-out r range):")
    print(f"{'outcome':<10}{'metric':<24}{'r':>7}{'perm_p':>9}   LOO r range   verdict")
    print("-" * 78)
    for o, m, r, p, lo, hi, flips in results:
        if np.isnan(r):
            verdict = "degenerate"
        elif p < bonf and not flips:
            verdict = "SURVIVES"
        elif p < 0.05 and not flips:
            verdict = "weak (fails MC)"
        elif flips:
            verdict = "fragile (LOO flips)"
        else:
            verdict = "noise"
        tag = " †" if m in redundant else "  "
        print(f"{o:<10}{m+tag:<24}{r:>7.2f}{p:>9.3f}   [{lo:+.2f},{hi:+.2f}]  {verdict}")
    print("\n† = redundant with an earlier metric (same underlying signal).")
    print("SURVIVES = beats the multiple-comparison threshold AND isn't driven by one point.\n")

if __name__ == "__main__":
    main()
