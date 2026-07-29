#!/usr/bin/env python3
"""
baseline_predicts.py — can dumb ffmpeg features predict ad outcome, with no brain model?

    .venv/bin/python tools/corpus/baseline_predicts.py
    .venv/bin/python tools/corpus/baseline_predicts.py --platform meta --n-perm 20000

WHY THIS RUNS BEFORE THE GPU DOES. ad_backtest.py asks whether the TRIBE arc predicts ad
outcome. That question is only interesting relative to a floor: if loudness, cuts,
luminance and motion already predict it, a neural score that ties them has demonstrated
nothing, and one that beats them has to beat them by a stated margin. This computes the
floor on CPU, from files already on disk, while the scorer box does not exist yet.

It is deliberately the SAME features ad_backtest.py partials out as covariates
(loudness/cuts/luminance/motion/duration), so the number here is directly the thing the
neural score will later be asked to exceed.

A NEGATIVE RESULT HERE IS GOOD NEWS and must be reported as such: if dumb features do
NOT predict outcome, the outcome label is not trivially explained by production polish,
and there is room for the encoder to matter. It is not evidence the encoder works.
"""
import argparse
import csv
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from honest_corr_timeseries import spearman, _rankdata, MIN_EFFECT_R  # noqa: E402

ADS = ROOT / "data" / "ads"
FEATURES = ["loudness", "cuts", "luminance", "motion"]


def summarize(path):
    """Per-second series -> a handful of per-ad numbers.

    `_open5` is the hook window. Soma weights hook at 40% precisely because the opening
    seconds are claimed to decide the ad, so if that claim is true of low-level features
    too, it should show up here first."""
    try:
        rows = list(csv.DictReader(open(path)))
    except OSError:
        return None
    if len(rows) < 4:  # nothing meaningful to summarize from 3 seconds
        return None
    out = {"n_sec": float(len(rows))}
    for f in FEATURES:
        try:
            v = np.array([float(r[f]) for r in rows], float)
        except (KeyError, ValueError):
            return None
        if not np.all(np.isfinite(v)):
            return None
        out[f"{f}_mean"] = float(v.mean())
        out[f"{f}_std"] = float(v.std())
        out[f"{f}_open5"] = float(v[:5].mean())
        # Late-minus-early: does the ad escalate or decay on this feature?
        h = len(v) // 2
        out[f"{f}_trend"] = float(v[h:].mean() - v[:h].mean())
    return out


def perm_p(x, y, n_perm, seed=0):
    """Permutation p for a rank correlation. Ads are independent samples, so a plain label
    shuffle is the right null here — unlike the within-video timeseries case, which needs
    circular shifts to respect autocorrelation."""
    rng = np.random.default_rng(seed)
    obs = abs(spearman(x, y))
    if not np.isfinite(obs):
        return float("nan"), float("nan")
    y = np.asarray(y, float)
    count = 0
    for _ in range(n_perm):
        if abs(spearman(x, rng.permutation(y))) >= obs:
            count += 1
    return obs, (count + 1) / (n_perm + 1)


def partial_out(y, Z):
    """Residualize y on covariates Z (with intercept), so 'predicts outcome' cannot be
    'is simply longer'. Duration is the covariate that matters most: it drives both the
    features and, plausibly, the label."""
    Z = np.column_stack([np.ones(len(y))] + [np.asarray(z, float) for z in Z])
    beta, *_ = np.linalg.lstsq(Z, y, rcond=None)
    return y - Z @ beta


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--platform", default="meta", choices=["meta", "tiktok"])
    ap.add_argument("--baseline-dir", default=str(ADS / "baseline"))
    ap.add_argument("--n-perm", type=int, default=5000)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    manifest = ADS / f"ad_manifest_{args.platform}.csv"
    if not manifest.exists():
        raise SystemExit(f"{manifest} missing — run tools/corpus/clean.py --apply first")

    perf = {r["ad_id"]: r for r in csv.DictReader(open(ADS / "ad_performance.csv"))}
    rows, missing = [], 0
    for r in csv.DictReader(open(manifest)):
        s = summarize(Path(args.baseline_dir) / f"baseline_{r['ad_id']}.csv")
        if s is None:
            missing += 1
            continue
        try:
            y = float(r["outcome"])
        except ValueError:
            continue
        p = perf.get(r["ad_id"], {})
        try:
            dur = float(p.get("duration_s") or "nan")
        except ValueError:
            dur = float("nan")
        if not np.isfinite(dur):
            continue
        s.update(_id=r["ad_id"], _y=y, _dur=dur)
        rows.append(s)

    if len(rows) < 30:
        raise SystemExit(f"only {len(rows)} ads with baselines — extract more first")

    y = np.array([r["_y"] for r in rows], float)
    dur = np.array([r["_dur"] for r in rows], float)
    n = len(rows)
    # Detectable effect at 80% power, alpha .05 — the honest floor for reading a null.
    detectable = 2.8 / np.sqrt(n - 3)

    print(f"platform          {args.platform}")
    print(f"ads with baseline {n}   (skipped {missing} with no baseline csv)")
    print(f"outcome           {'days_running' if args.platform == 'meta' else 'ctr_index'}"
          f"   range {y.min():.2f}..{y.max():.2f}")
    print(f"detectable |r|    {detectable:.3f} at 80% power; a null below this is "
          f"'could not tell'\n")

    feats = [k for k in rows[0] if not k.startswith("_")]
    results = []
    for f in feats:
        x = np.array([r[f] for r in rows], float)
        if np.std(x) == 0:
            results.append((f, float("nan"), float("nan"), float("nan"), "constant"))
            continue
        r_raw, p_raw = perm_p(x, y, args.n_perm)
        # Partial out duration unless the feature IS duration.
        if f == "n_sec":
            r_par = float("nan")
        else:
            r_par = spearman(_rankdata(partial_out(np.asarray(x, float), [dur])),
                             _rankdata(partial_out(y, [dur])))
        results.append((f, r_raw, p_raw, r_par, ""))

    results.sort(key=lambda t: -(abs(t[1]) if np.isfinite(t[1]) else -1))
    print(f"{'feature':22} {'|rho|':>7} {'perm p':>9} {'rho|dur':>9}   verdict")
    print("-" * 68)
    hits = 0
    for f, r_raw, p, r_par, note in results:
        if note:
            print(f"{f:22} {'—':>7} {'—':>9} {'—':>9}   {note}")
            continue
        sig = np.isfinite(p) and p < 0.05
        big = abs(r_raw) >= max(MIN_EFFECT_R, detectable)
        verdict = "PREDICTS" if (sig and big) else ("underpowered" if sig else "no")
        hits += sig and big
        print(f"{f:22} {abs(r_raw):7.3f} {p:9.4f} {r_par:9.3f}   {verdict}")

    # Seventeen features against one label is seventeen chances to be unlucky. Without this
    # line, a reader sees "p=0.0185" and believes it; the expected count makes it obvious
    # when the nominal hits are just the tests doing what tests do.
    tested = [t for t in results if not t[4]]
    nominal = sum(1 for _, _, p, _, _ in tested if np.isfinite(p) and p < 0.05)
    expected = 0.05 * len(tested)
    bonf = 0.05 / max(1, len(tested))
    survivors = [t[0] for t in tested if np.isfinite(t[2]) and t[2] < bonf]
    print("\n" + "-" * 68)
    print(f"multiple comparisons: {len(tested)} features tested, {nominal} nominally p<0.05, "
          f"{expected:.1f} expected by chance")
    print(f"  Bonferroni threshold p<{bonf:.4f} -> "
          f"{('survivors: ' + ', '.join(survivors)) if survivors else 'nothing survives'}")

    print("\n" + "=" * 68)
    if hits:
        print(f"{hits} dumb feature(s) predict {args.platform} outcome above |r|>={max(MIN_EFFECT_R, detectable):.2f}.")
        print("This is the FLOOR the neural score must beat. Report the neural result as an")
        print("increment over this, never on its own.")
    else:
        print(f"No ffmpeg feature predicts {args.platform} outcome at |r| >= "
              f"{max(MIN_EFFECT_R, detectable):.2f}.")
        print("Read this as 'the label is not explained by production polish', which leaves")
        print("room for the encoder — NOT as evidence the encoder works. Only ad_backtest.py")
        print("can speak to that, and it needs the box.")
    print(f"\nNote: {n} ads, so anything under |r|={detectable:.3f} is indistinguishable from")
    print("zero at this sample size. Do not write those rows up as null results.")

    if args.out:
        with open(args.out, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["feature", "abs_rho", "perm_p", "rho_partial_duration"])
            for f, r_raw, p, r_par, _ in results:
                w.writerow([f, f"{r_raw:.4f}", f"{p:.5f}", f"{r_par:.4f}"])
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
