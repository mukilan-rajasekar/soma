#!/usr/bin/env python3
"""
publish_results.py — turn a REAL validation run into demo/results.json, so the
demo's "Does the prediction match reality?" strip auto-fills with honest numbers
instead of the "illustrative — not yet run" placeholder.

This closes the loop:  honest_corr_timeseries.py  →  results.csv  →  THIS  →
demo/results.json  →  the demo reads it on load (app.js applyResults).

WHY IT'S HONEST BY CONSTRUCTION
    - It computes the SAME combined p (signed Stouffer) the harness prints; it does
      not invent a number.
    - It stamps `null_result: true` whenever the combined p ≥ alpha (or |median r|
      is tiny). The demo then shows "null result — as pre-registered", NOT a fake
      win. A null is a valid, publishable outcome — this tool refuses to hide it.
    - `beats_baseline` is only set to true/false when you actually pass the
      incremental-validity verdict; otherwise it stays null and the demo shows "—".
      We never claim "beats ffmpeg" without the partial-correlation evidence.

DO NOT run this on synthetic/illustrative data and leave the output in demo/ — that
would make the demo show fake numbers as if real. Run it only on a real
honest_corr_timeseries.py results.csv, after the GPU extraction.

INPUT  (from honest_corr_timeseries.py --out <prefix>):
    results.csv  cols: video,feature,n,r,p,p_param,n_eff,ceiling,frac_of_ceiling,note

USAGE
    # after a real run wrote validation/results.csv:
    python publish_results.py --results validation/results.csv --feature roi \
        --out demo/results.json
    # if you also ran incremental_validity.py and the brain beat the dumb baseline:
    python publish_results.py --results validation/results.csv --beats-baseline yes
"""
import argparse
import json
import math
import os

import numpy as np

from honest_corr_timeseries import _read_csv, stouffer, fisher


def _rows_for_feature(cols, feature):
    """Pull (r, p) pairs for the requested feature from a results.csv dict-of-cols."""
    vids = cols.get("video")
    feats = cols.get("feature")
    rs = cols.get("r")
    ps = cols.get("p")
    if vids is None or feats is None or rs is None or ps is None:
        raise SystemExit("results.csv missing one of: video, feature, r, p")
    out = []
    for i in range(len(vids)):
        if str(feats[i]) != feature:
            continue
        try:
            r = float(rs[i]); p = float(ps[i])
        except (TypeError, ValueError):
            continue
        if np.isnan(r) or np.isnan(p):
            continue
        out.append((str(vids[i]), r, p))
    return out


def _beats_from_incremental(path, alpha):
    """True/False from an incremental_validity CSV: brain beats the ffmpeg baseline
    if the combined partial p < alpha AND the median partial r > 0.1. None if the
    file is unreadable/empty (demo then shows '—')."""
    if not os.path.exists(path):
        print(f"[warn] --incremental {path} not found; leaving beats_baseline unknown.")
        return None
    _, c = _read_csv(path)
    prs, pps = c.get("partial_r"), c.get("perm_p")
    if prs is None or pps is None:
        return None
    pairs = []
    for i in range(len(prs)):
        try:
            r = float(prs[i]); pp = float(pps[i])
        except (TypeError, ValueError):
            continue
        if not (np.isnan(r) or np.isnan(pp)):
            pairs.append((r, pp))
    if not pairs:
        return None
    _, p_comb = stouffer([pp for _, pp in pairs], [r for r, _ in pairs])
    med_pr = float(np.nanmedian([r for r, _ in pairs]))
    if p_comb is None or np.isnan(p_comb):
        return None
    return bool(p_comb < alpha and abs(med_pr) > 0.1)


def summarize(rows, alpha=0.05):
    """Median r + combined signed-Stouffer p (and Fisher p) across videos."""
    rs = [r for _, r, _ in rows]
    ps = [p for _, _, p in rows]
    z, p_comb = stouffer(ps, rs)
    _, p_fish = fisher(ps)
    med_r = float(np.nanmedian(rs)) if rs else float("nan")
    return dict(n_videos=len(rows), median_r=med_r,
                combined_p=(None if (p_comb is None or np.isnan(p_comb)) else float(p_comb)),
                fisher_p=(None if (p_fish is None or np.isnan(p_fish)) else float(p_fish)))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--results", default="validation/results.csv",
                    help="results.csv from honest_corr_timeseries.py")
    ap.add_argument("--feature", choices=["roi", "global"], default="roi",
                    help="which pre-registered feature to publish (the headline one)")
    ap.add_argument("--beats-baseline", choices=["yes", "no", "unknown"],
                    default="unknown",
                    help="incremental_validity verdict vs the ffmpeg baseline; stays "
                         "'unknown' (demo shows —) unless you assert it or pass "
                         "--incremental")
    ap.add_argument("--incremental", default=None,
                    help="CSV from incremental_validity.py --out; auto-derives "
                         "beats_baseline (combined partial p < alpha AND median "
                         "partial r > 0.1). Overrides --beats-baseline.")
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--out", default="demo/results.json")
    args = ap.parse_args()

    if not os.path.exists(args.results):
        raise SystemExit(f"No results at {args.results}. Run honest_corr_timeseries.py "
                         f"on REAL data first.")
    _, cols = _read_csv(args.results)
    rows = _rows_for_feature(cols, args.feature)
    if not rows:
        raise SystemExit(f"No usable {args.feature} rows in {args.results}.")

    s = summarize(rows, alpha=args.alpha)
    p = s["combined_p"]

    # beats_baseline: explicit flag, else auto-derive from the incremental CSV
    beats = {"yes": True, "no": False, "unknown": None}[args.beats_baseline]
    if args.incremental:
        beats = _beats_from_incremental(args.incremental, args.alpha)

    is_null = (p is None) or (p >= args.alpha) or (abs(s["median_r"]) < 0.05) \
        or (beats is False)

    payload = {
        "n": s["n_videos"],
        "attention_r": round(s["median_r"], 3),
        "permutation_p": (None if p is None else round(p, 4)),
        "beats_baseline": beats,
        "feature": args.feature,
        "null_result": bool(is_null),
        "tag": (f"n={s['n_videos']} · "
                + ("null result — as pre-registered" if is_null else "measured")
                + f" ({args.feature})"),
        "_provenance": {
            "source": os.path.basename(args.results),
            "combined_p_signed_stouffer": p,
            "fisher_p": s["fisher_p"],
            "median_r": s["median_r"],
            "alpha": args.alpha,
            "note": "model=TRIBE v2 (public, Algonauts-2025 winner); "
                    "null=circular-shift permutation; n=videos; "
                    "combined across videos, no best-of-N.",
        },
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=2)

    verdict = "NULL (as pre-registered)" if is_null else "SIGNAL"
    print(f"[wrote] {args.out}")
    print(f"  feature={args.feature}  n={s['n_videos']} videos  median r={s['median_r']:.3f}"
          f"  combined p={'nan' if p is None else f'{p:.4f}'}  ->  {verdict}")
    if beats is None:
        print("  beats_baseline=unknown (demo shows '—'). Run incremental_validity.py "
              "and pass --beats-baseline yes/no to fill it.")
    print("  The demo will now display these on load. Reminder: only publish this "
          "from a REAL run —\n  a null is honest and fine; a fabricated win is not.")


if __name__ == "__main__":
    main()
