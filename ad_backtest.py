#!/usr/bin/env python3
"""
ad_backtest.py — does the neural score predict which REAL ad performed best?

This is the cold-start proof for the GTM motion "we can predict which of your running
ads wins." Unlike `incremental_validity.py` / `head_incremental.py` (which correlate a
*within-video time series* against human interest), this test is CROSS-SECTIONAL: each
ad collapses to ONE neural score, and we ask whether that score ranks a set of real ads
by their REAL outcome (TikTok Top-Ads rank, Meta Ad Library longevity, or a client's own
CPA/ThruPlay), OVER AND ABOVE the dumb ffmpeg features.

WHY THE ffmpeg CONTROL IS NON-NEGOTIABLE (same red-team finding as elsewhere): "top ads"
may just be short, loud, face-first. If the neural score only re-derives duration / loudness
/ cuts / luminance / motion, we have an expensive editor, not a brain read. So the headline
is a PARTIAL Spearman: neural-vs-outcome after removing what the ffmpeg summary already
explains in both.

HONESTY (read before quoting any number):
  * PRE-REGISTERED PRIMARY score = MEAN of the per-ad neural series (head-predicted attention
    if a head is given, else the arithmetic roi_mag arc). Peak / hook / area summaries are
    EXPLORATORY and never quoted as the result.
  * The neural scorer (TVSum-trained head, or the arithmetic arc) is applied OUT-OF-DISTRIBUTION
    to ads, and the outcome labels (TikTok rank / Meta longevity) are PROXIES for real spend
    outcomes. A win here is encouraging evidence the score transfers to ad performance — it is
    NOT a validated engagement model.
  * A null is a legitimate, reported outcome. If the partial collapses to ~0, we say so, and the
    "predict your winner" cold email waits until this number exists and clears the floor.
  * Effect floor |r| >= MIN_EFFECT_R (0.10) AND perm p < 0.05 to be called a signal.

INPUTS:
  ad_manifest.csv         --manifest   cols: ad_id,outcome[,platform,note]
                                       outcome numeric, HIGHER = better performance
                                       (rank data: pass --outcome-is-rank so 1=best inverts)
  arc_<ad_id>.csv         --arc-dir    (t_sec, roi_mag[, global_mag])   [batch_extract.py]
  preds_<ad_id>.npy       --preds-dir  frozen-TRIBE output, needed only for --score head
  baseline_<ad_id>.csv    --baseline-dir (t_sec, loudness,cuts,luminance,motion) [baseline_extract.py]

USAGE:
  # arithmetic-arc score (no head needed):
  python ad_backtest.py --manifest data/ads/ad_manifest.csv --score arc \
      --arc-dir data/ads/arcs --baseline-dir data/ads/baseline

  # trained-head score (the real bet), head applied out-of-distribution to each ad:
  python ad_backtest.py --manifest data/ads/ad_manifest.csv --score head \
      --head validation/head_attn.json --preds-dir data/ads/arcs \
      --arc-dir data/ads/arcs --baseline-dir data/ads/baseline
"""
import argparse
import json
import os
import zlib

import numpy as np

from honest_corr_timeseries import _read_csv, _rankdata, pearson, MIN_EFFECT_R
from incremental_validity import partial_spearman

HOOK_SEC = 3.0                          # "the hook" = first HOOK_SEC seconds
COVARIATES = ["loudness", "cuts", "luminance", "motion", "duration"]


# -----------------------------------------------------------------------------
# per-ad neural score
# -----------------------------------------------------------------------------
def _summaries(series):
    """Collapse a per-second neural series to scalar summaries. `mean` is the PRIMARY;
    the rest are exploratory. NaNs (dropped shots) are ignored."""
    a = np.asarray(series, float)
    finite = a[np.isfinite(a)]
    if finite.size == 0:
        return None
    n_hook = max(1, int(round(HOOK_SEC)))
    hook = a[:n_hook]
    hook = hook[np.isfinite(hook)]
    return dict(
        mean=float(np.mean(finite)),                       # PRE-REGISTERED PRIMARY
        peak=float(np.percentile(finite, 90)),             # exploratory
        hook=float(np.mean(hook)) if hook.size else float(np.mean(finite)),  # exploratory
        area=float(np.sum(finite)),                        # exploratory
    )


def arc_series(ad_id, arc_dir):
    """Arithmetic-arc neural series = roi_mag (falls back to global_mag)."""
    p = os.path.join(arc_dir, f"arc_{ad_id}.csv")
    if not os.path.exists(p):
        return None
    _, ac = _read_csv(p)
    col = "roi_mag" if "roi_mag" in ac else ("global_mag" if "global_mag" in ac else None)
    if col is None:
        return None
    return np.asarray(ac[col], float)


def head_series(ad_id, head, preds_dir, arc_dir):
    """Head-predicted attention per second, head applied OUT-OF-DISTRIBUTION to this ad."""
    import head_apply
    import head_io
    predp = os.path.join(preds_dir, f"preds_{ad_id}.npy")
    if not os.path.exists(predp):
        return None
    preds = np.load(predp).astype(float)
    try:
        bt, bv = head_apply._baseline_series(head, ad_id, preds, arc_dir)
        res = head_io.apply_head(head, preds, bt, bv)
    except (SystemExit, Exception):     # missing baseline / degenerate clip -> skip this ad
        return None
    return res["per_sec"]


# -----------------------------------------------------------------------------
# per-ad ffmpeg covariate summary
# -----------------------------------------------------------------------------
def baseline_summary(ad_id, baseline_dir):
    """Mean loudness/cuts/luminance/motion + duration(s) for one ad. None if file absent."""
    p = os.path.join(baseline_dir, f"baseline_{ad_id}.csv")
    if not os.path.exists(p):
        return None
    _, bc = _read_csv(p)
    out = {}
    for k in ("loudness", "cuts", "luminance", "motion"):
        out[k] = float(np.nanmean(np.asarray(bc[k], float))) if k in bc else np.nan
    n = len(bc["t_sec"]) if "t_sec" in bc else (len(bc[next(iter(bc))]) if bc else 0)
    out["duration"] = float(n)          # seconds of coverage = a length proxy
    return out


# -----------------------------------------------------------------------------
# cross-sectional partial correlation + label-permutation null
# -----------------------------------------------------------------------------
def label_perm_p(neural, outcome, Z, n_perm=20000, seed=0):
    """Permute the OUTCOME labels across ads; recompute the partial each time.

    Cross-sectional analogue of the circular-shift null used within a video. Breaking the
    outcome's link to everything (neural AND Z) is slightly CONSERVATIVE for the partial —
    stated honestly. Honest p-floor = 1/(M+1). Deterministic seed -> reproducible p.
    """
    r_obs = partial_spearman(neural, outcome, Z)
    if np.isnan(r_obs):
        return np.nan, r_obs
    rng = np.random.default_rng(seed)
    idx = np.arange(len(outcome))
    cnt = 0
    for _ in range(n_perm):
        yp = outcome[rng.permutation(idx)]
        r = partial_spearman(neural, yp, Z)
        if not np.isnan(r) and abs(r) >= abs(r_obs) - 1e-12:
            cnt += 1
    return (cnt + 1) / (n_perm + 1), r_obs


def topk_precision(neural, outcome, k):
    """Fraction of the outcome's true top-k that the neural score also puts in its top-k."""
    if k <= 0 or k > len(neural):
        return np.nan
    top_pred = set(np.argsort(-neural)[:k].tolist())
    top_true = set(np.argsort(-outcome)[:k].tolist())
    return len(top_pred & top_true) / k


# -----------------------------------------------------------------------------
# driver
# -----------------------------------------------------------------------------
def load_manifest(path, outcome_is_rank):
    _, m = _read_csv(path)
    if "ad_id" not in m or "outcome" not in m:
        raise SystemExit(f"{path}: manifest needs at least 'ad_id' and 'outcome' columns")
    ids = [str(x) for x in m["ad_id"]]
    outcome = np.asarray(m["outcome"], float)
    if outcome_is_rank:                 # 1 = best -> invert so HIGHER = better
        outcome = -outcome
    return ids, outcome


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--score", choices=["arc", "head"], default="arc")
    ap.add_argument("--head", help="saved head JSON (required for --score head)")
    ap.add_argument("--preds-dir", default="data/ads/arcs")
    ap.add_argument("--arc-dir", default="data/ads/arcs")
    ap.add_argument("--baseline-dir", default="data/ads/baseline")
    ap.add_argument("--covariates", default=",".join(COVARIATES),
                    help="comma-separated ffmpeg covariates to partial out")
    ap.add_argument("--outcome-is-rank", action="store_true",
                    help="manifest 'outcome' is a rank (1=best); invert so higher=better")
    ap.add_argument("--n-perm", type=int, default=20000)
    ap.add_argument("--out", default="validation/ad_backtest.csv")
    ap.add_argument("--json-out", default="validation/ad_backtest.json")
    args = ap.parse_args()

    covs = [c.strip() for c in args.covariates.split(",") if c.strip()]
    ids, outcome_all = load_manifest(args.manifest, args.outcome_is_rank)

    head = None
    if args.score == "head":
        if not args.head:
            raise SystemExit("--score head needs --head PATH")
        import head_io
        head = head_io.load_head(args.head)
        status, badge = head_io.badge_text(head)
        print(f"[head] status={status}  {badge}")
        if status == "poisoned":
            raise SystemExit("refusing to score with a poisoned head — fix leakage first.")

    # assemble per-ad rows -------------------------------------------------------
    rows = []
    for ad_id, y in zip(ids, outcome_all):
        series = (head_series(ad_id, head, args.preds_dir, args.arc_dir) if args.score == "head"
                  else arc_series(ad_id, args.arc_dir))
        summ = _summaries(series) if series is not None else None
        base = baseline_summary(ad_id, args.baseline_dir)
        if summ is None:
            print(f"[skip] {ad_id}: no neural series ({'preds' if args.score=='head' else 'arc'} missing/degenerate)")
            continue
        rows.append(dict(ad_id=ad_id, outcome=float(y), base=base, **summ))

    if len(rows) < 6:
        raise SystemExit(f"only {len(rows)} scorable ads — need >=6 (>=15-30 for any real "
                         "claim). Gather more ads / check extraction.")

    outcome = np.array([r["outcome"] for r in rows], float)
    with_base = [r for r in rows if r["base"] is not None]
    n_missing_base = len(rows) - len(with_base)
    if n_missing_base:
        print(f"[warn] {n_missing_base} ad(s) lack baseline_*.csv -> excluded from the PARTIAL "
              "test (raw metrics still use all ads). Run baseline_extract.py on every ad.")

    # covariate matrix (only ads that have a baseline) --------------------------
    def _cov_matrix(subset):
        return np.column_stack([[r["base"][c] for r in subset] for c in covs]) if covs else \
            np.zeros((len(subset), 0))

    # PRIMARY = mean summary; others exploratory --------------------------------
    SUMMARIES = ["mean", "peak", "hook", "area"]
    results = {}
    seed = zlib.crc32(("|".join(r["ad_id"] for r in rows)).encode())
    for s in SUMMARIES:
        neural_all = np.array([r[s] for r in rows], float)
        raw_r = pearson(_rankdata(neural_all), _rankdata(outcome))     # raw Spearman, all ads
        top1 = float(np.argmax(neural_all) == np.argmax(outcome))
        k = max(1, len(rows) // 3)
        prec = topk_precision(neural_all, outcome, k)
        # partial (confound-controlled) on the ads that have a baseline
        if with_base and covs:
            neural_b = np.array([r[s] for r in with_base], float)
            out_b = np.array([r["outcome"] for r in with_base], float)
            Z = _cov_matrix(with_base)
            p, pr = label_perm_p(neural_b, out_b, Z, n_perm=args.n_perm, seed=seed)
        else:
            pr, p = raw_r, np.nan
        results[s] = dict(raw_r=raw_r, partial_r=pr, perm_p=p, top1_hit=top1,
                          topk_prec=prec, k=k)

    # report --------------------------------------------------------------------
    prim = results["mean"]
    print("\n" + "=" * 74)
    print(f"AD-OUTCOME BACKTEST   n_ads={len(rows)}  score={args.score}"
          f"{'/'+os.path.basename(args.head) if head else ''}  covariates={covs}")
    print("=" * 74)
    print(f"{'summary':<8}{'raw r':>8}{'partial r':>11}{'perm p':>9}{'top1':>7}{'top-k prec':>12}")
    print("-" * 74)
    for s in SUMMARIES:
        r = results[s]
        tag = "  <- PRIMARY" if s == "mean" else "  (exploratory)"
        print(f"{s:<8}{r['raw_r']:>8.2f}{r['partial_r']:>11.2f}"
              f"{(r['perm_p'] if not np.isnan(r['perm_p']) else float('nan')):>9.3f}"
              f"{r['top1_hit']:>7.0f}{r['topk_prec']:>12.2f}{tag}")
    print("-" * 74)

    signal = (with_base and covs and not np.isnan(prim["perm_p"])
              and prim["perm_p"] < 0.05 and abs(prim["partial_r"]) >= MIN_EFFECT_R)
    if not (with_base and covs):
        verdict = ("NO CONTROL — no ffmpeg baselines supplied, so this is a RAW correlation only "
                   "(cannot rule out that top ads are just short/loud/face-first). Run "
                   "baseline_extract.py before quoting anything.")
    elif signal:
        verdict = (f"SIGNAL — the {args.score} neural score predicts real ad rank OVER the ffmpeg "
                   f"baseline (partial r={prim['partial_r']:.2f}, perm p={prim['perm_p']:.3f}, "
                   f"n={len(with_base)}). Encouraging; still a PROXY outcome, out-of-distribution "
                   "scorer, small n — a hypothesis, not a validated engagement model.")
    else:
        verdict = (f"NULL — the {args.score} neural score does NOT beat the ffmpeg baseline at "
                   f"predicting ad rank (partial r={prim['partial_r']:.2f}, perm p="
                   f"{prim['perm_p'] if not np.isnan(prim['perm_p']) else float('nan'):.3f}). "
                   "Reported plainly. The 'predict your winner' claim waits until this clears the "
                   "floor; the learned-head bet then moves to the proprietary ad-outcome flywheel.")
    print("VERDICT:", verdict)
    print("\nReminder: outcome labels (TikTok rank / Meta longevity) are PROXIES for real spend "
          "outcomes; the scorer is applied out-of-distribution. n_ads is the sample size, not "
          "n_seconds.")

    # write per-ad CSV + machine-readable summary --------------------------------
    if args.out:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w") as f:
            f.write("ad_id,outcome,neural_mean,neural_peak,neural_hook,neural_area,"
                    + ",".join(covs) + "\n")
            for r in rows:
                cov = ",".join(f"{(r['base'][c] if r['base'] else float('nan')):.4f}" for c in covs)
                f.write(f"{r['ad_id']},{r['outcome']:.4f},{r['mean']:.4f},{r['peak']:.4f},"
                        f"{r['hook']:.4f},{r['area']:.4f},{cov}\n")
        print(f"[wrote] {args.out}")
    if args.json_out:
        os.makedirs(os.path.dirname(args.json_out) or ".", exist_ok=True)
        payload = dict(
            n_ads=len(rows), n_with_baseline=len(with_base), score=args.score,
            head=os.path.basename(args.head) if head else None, covariates=covs,
            min_effect_r=MIN_EFFECT_R, n_perm=args.n_perm, signal=bool(signal),
            primary=dict(summary="mean", **{k: (None if isinstance(v, float) and np.isnan(v)
                                                else v) for k, v in prim.items()}),
            exploratory={s: {k: (None if isinstance(v, float) and np.isnan(v) else v)
                             for k, v in results[s].items()} for s in SUMMARIES if s != "mean"},
            verdict=verdict)
        with open(args.json_out, "w") as f:
            json.dump(payload, f, indent=2, allow_nan=False)
        print(f"[wrote] {args.json_out}")


if __name__ == "__main__":
    main()
