#!/usr/bin/env python3
"""
train_head.py — SomAI's first *trained* model: a tiny ridge READ-OUT HEAD on top of
FROZEN Meta TRIBE v2 features, mapping per-second cortical activation to the TVSum
human-interest arc. The encoder is Meta's; these weights are ours.

Read PREREGISTRATION-head.md first — it locks this spec BEFORE any result is seen.

WHAT IS HONEST HERE (and what is NOT)
-------------------------------------
- This is a LEARNED version of the step-3 hypothesis (activation -> attention), not a
  promotion of it to "validated." TVSum importance is a PUBLIC PROXY for top-down
  interest, not an ad outcome. Head output is a learned hypothesis.
- The head must beat the UNTRAINED arithmetic arc (roi_mag), which is nested as one of
  its own inputs — so any win is provably INCREMENTAL, not a re-derivation.
- Everything is judged by the identical honest yardstick as the untrained arc: features
  pooled through a-priori masks (no fitting -> no leakage), leave-one-VIDEO-out with all
  fitting inside the fold, first-differenced Spearman, circular-shift null (1/(M+1)
  floor), leave-one-annotator-out ceiling, signed Stouffer across videos, report EVERY
  video. The independent units are the ~10-20 VIDEOS, not the ~1000 shots — so the
  "beats baseline" test is underpowered and hypothesis-generating. Said loudly.
- If the head does not beat the arc out-of-sample, that is REPORTED plainly (a null v0 on
  a public proxy at ~15 videos is expected). The learned-head bet then moves to
  proprietary ad-outcome data — that is the moat, never out-training Meta's encoder.

INPUTS (per video <id>, matched on the shared stem):
  preds_<id>.npy      frozen-TRIBE output (n_seconds, 20484), z-scored SIGNED BOLD  [--preds-dir]
  arc_<id>.csv        the untrained arc (t_sec, global_mag, roi_mag)                 [--arc-dir]
  human_arc_<id>.csv  human interest (t_start, importance)                          [--human-dir]
  human_annos_<id>.npy (n_annotators, n_shots)  for the noise ceiling               [--human-dir]
  roi_*.npy           a-priori boolean masks length 20484 (build_roi_mask.py)       [--masks-dir]

USAGE:
  # smoke-test on the synthetic fixtures (no GPU, no real claim):
  python train_head.py --preds-dir tests/synth --arc-dir tests/synth/arcs \
      --human-dir tests/synth/human --masks-dir tests/synth --out tests/synth/head

  # the mandatory leakage control — held-out r MUST collapse to ~0:
  python train_head.py ... --shuffle-target

Only hard dependency is numpy (matplotlib optional, for the forest plot).
"""
import argparse
import glob
import itertools
import os
import zlib

import numpy as np

from honest_corr_timeseries import (_read_csv, spearman, circular_shift_p,
                                     resample_to_grid, leave_one_annotator_out_ceiling,
                                     stouffer, fisher, _fmt)

ALPHAS = [0.1, 1.0, 10.0, 100.0, 1000.0]   # ridge grid (pre-registered)


# -----------------------------------------------------------------------------
# feature construction (a-priori, no fitting -> leakage-impossible)
# -----------------------------------------------------------------------------
def load_masks(masks_dir):
    """Load roi_*.npy boolean masks (length 20484). Returns [(name, mask), ...]."""
    out = []
    for p in sorted(glob.glob(os.path.join(masks_dir, "roi_*.npy"))):
        name = os.path.splitext(os.path.basename(p))[0][len("roi_"):]
        m = np.load(p)
        out.append((name, np.asarray(m, bool)))
    return out


def pool_features(preds, masks):
    """(T,20484) -> (T, 2*n_masks): per second [mean|preds| , mean signed preds] per mask.

    Magnitude is the arc convention; the signed mean recovers the direction the |.| arc
    throws away. Both are a-priori pooled through fixed masks — nothing is fit on data.
    """
    ap = np.abs(preds)
    cols = []
    for _name, m in masks:
        if m.shape[0] != preds.shape[1]:
            raise ValueError(f"mask length {m.shape[0]} != n_vertices {preds.shape[1]}")
        cols.append(ap[:, m].mean(axis=1))      # magnitude
        cols.append(preds[:, m].mean(axis=1))   # signed direction
    return np.column_stack(cols)


def feature_names(masks):
    names = []
    for name, _m in masks:
        names += [f"{name}|mag", f"{name}|sgn"]
    return names + ["roi_mag(nested baseline)"]


def _standardize(X, good):
    """Per-video z-score each column using ONLY this video's good shots (leakage-safe)."""
    Xs = X.astype(float).copy()
    for j in range(X.shape[1]):
        col = X[good, j]
        mu, sd = float(np.mean(col)), float(np.std(col))
        Xs[:, j] = (X[:, j] - mu) / (sd if sd > 1e-9 else 1.0)
    return Xs


def _ztarget(human, good):
    y = np.asarray(human, float)
    mu, sd = float(np.mean(y[good])), float(np.std(y[good]))
    return (y - mu) / (sd if sd > 1e-9 else 1.0)


def video_data(vid, preds_dir, arc_dir, human_dir, masks, shot_sec):
    """Assemble one video's shot-grid feature matrix + target + baseline + ceiling annos."""
    predp = os.path.join(preds_dir, f"preds_{vid}.npy")
    arcp = os.path.join(arc_dir, f"arc_{vid}.csv")
    hp = os.path.join(human_dir, f"human_arc_{vid}.csv")
    annp = os.path.join(human_dir, f"human_annos_{vid}.npy")
    if not (os.path.exists(predp) and os.path.exists(arcp) and os.path.exists(hp)):
        missing = [os.path.basename(p) for p in (predp, arcp, hp) if not os.path.exists(p)]
        print(f"[skip] {vid}: missing partner file(s) {', '.join(missing)}")
        return None
    preds = np.load(predp).astype(float)
    _, hc = _read_csv(hp)
    if "t_start" not in hc or "importance" not in hc:
        miss = [c for c in ("t_start", "importance") if c not in hc]
        print(f"[skip] {vid}: human_arc missing required column(s) {', '.join(miss)}")
        return None
    t_start = np.asarray(hc["t_start"], float)
    human = np.asarray(hc["importance"], float)
    dur = float(t_start[-1] + shot_sec)
    edges = np.append(t_start, dur)

    tsec = np.arange(preds.shape[0], dtype=float)
    feat_ps = pool_features(preds, masks)                       # (T, F)
    feat_grid = np.column_stack([resample_to_grid(tsec, feat_ps[:, j], edges)
                                 for j in range(feat_ps.shape[1])])  # (n_shots, F)

    _, ac = _read_csv(arcp)
    roi_col = "roi_mag" if "roi_mag" in ac else "global_mag"     # nested baseline arc
    roi_grid = resample_to_grid(np.asarray(ac["t_sec"], float),
                                np.asarray(ac[roi_col], float), edges)

    X = np.column_stack([feat_grid, roi_grid])                  # (n_shots, F+1)
    good = ~np.isnan(X).any(axis=1) & ~np.isnan(human)
    if int(good.sum()) < 10:
        print(f"[skip] {vid}: only {int(good.sum())} good shots (<10 required)")
        return None
    annos = np.load(annp) if os.path.exists(annp) else None
    return dict(vid=vid, X=_standardize(X, good), human=human,
                roi=roi_grid, annos=annos, good=good)


# -----------------------------------------------------------------------------
# ridge (closed form; intercept unpenalized) + leave-one-video-out
# -----------------------------------------------------------------------------
def ridge_fit(X, y, alpha):
    Xm, ym = X.mean(0), y.mean()
    Xc, yc = X - Xm, y - ym
    A = Xc.T @ Xc + alpha * np.eye(Xc.shape[1])
    w = np.linalg.solve(A, Xc.T @ yc)
    return w, float(ym - Xm @ w)


def _train_rows(train, shuffle, rng):
    """Stack good shots from training videos: X standardized per-video, y z-scored per-video."""
    Xs, ys = [], []
    for vd in train:
        g = vd["good"]
        yv = _ztarget(vd["human"], g)[g]
        if shuffle:                       # negative control: destroy target alignment
            n = len(yv)
            sh = int(rng.integers(3, n - 3)) if n > 8 else 1
            yv = np.roll(yv, sh)
        Xs.append(vd["X"][g])
        ys.append(yv)
    return np.vstack(Xs), np.concatenate(ys)


def fit_predict(train, test_vd, alpha, shuffle=False, rng=None):
    X, y = _train_rows(train, shuffle, rng)
    w, b = ridge_fit(X, y, alpha)
    return test_vd["X"] @ w + b            # predicted level arc on the shot grid (NaN where X NaN)


def _diff_pair(pred, human, good):
    """First-diff pred & human with the harness contiguity rule (both endpoints valid)."""
    keep = good[:-1] & good[1:]
    if int(keep.sum()) < 8:
        return None, None
    d_pred = np.diff(np.where(good, np.asarray(pred, float), np.nan))[keep]
    d_hum = np.diff(np.where(good, np.asarray(human, float), np.nan))[keep]
    return d_pred, d_hum


def score_r(pred, human, good):
    d_pred, d_hum = _diff_pair(pred, human, good)
    return np.nan if d_pred is None else spearman(d_pred, d_hum)


def pick_alpha(train, alphas):
    """Nested leave-one-video-out over TRAINING videos only (never touches held-out)."""
    best_a, best_s = alphas[0], -np.inf
    for a in alphas:
        rs = []
        for i, held in enumerate(train):
            others = train[:i] + train[i + 1:]
            if not others:
                continue
            r = score_r(fit_predict(others, held, a), held["human"], held["good"])
            if not np.isnan(r):
                rs.append(r)
        s = float(np.mean(rs)) if rs else -np.inf
        if s > best_s:
            best_s, best_a = s, a
    return best_a


def paired_sign_perm(deltas, seed=0):
    """Exact (n<=18) / sampled paired sign-flip permutation test on per-video delta_r."""
    d = np.asarray([x for x in deltas if not np.isnan(x)], float)
    n = len(d)
    if n < 3:
        return np.nan, (float(np.median(d)) if n else np.nan)
    obs = abs(d.mean())
    if n <= 18:
        tot = cnt = 0
        for signs in itertools.product((1, -1), repeat=n):
            tot += 1
            if abs((d * np.array(signs)).mean()) >= obs - 1e-12:
                cnt += 1
        p = cnt / tot
    else:
        rng = np.random.default_rng(seed)
        N, cnt = 20000, 0
        for _ in range(N):
            if abs((d * rng.choice((1, -1), size=n)).mean()) >= obs - 1e-12:
                cnt += 1
        p = (cnt + 1) / (N + 1)
    return float(p), float(np.median(d))


# -----------------------------------------------------------------------------
# driver
# -----------------------------------------------------------------------------
def run(videos, n_perm, shuffle, seed):
    rng = np.random.default_rng(seed) if shuffle else None
    rows = []
    for i, test_vd in enumerate(videos):
        train = videos[:i] + videos[i + 1:]
        if not train:
            continue
        alpha = pick_alpha(train, ALPHAS)
        pred = fit_predict(train, test_vd, alpha, shuffle, rng)
        d_pred, d_hum = _diff_pair(pred, test_vd["human"], test_vd["good"])
        if d_pred is None:
            continue
        vseed = zlib.crc32(test_vd["vid"].encode())
        p_head, r_head, n = circular_shift_p(d_pred, d_hum, n_perm=n_perm, seed=vseed)
        d_roi, _ = _diff_pair(test_vd["roi"], test_vd["human"], test_vd["good"])
        r_roi = spearman(d_roi, d_hum)
        ceiling = (leave_one_annotator_out_ceiling(test_vd["annos"])
                   if test_vd["annos"] is not None else np.nan)
        frac = (r_head / ceiling) if (ceiling and not np.isnan(ceiling) and ceiling > 0) else np.nan
        rows.append(dict(video=test_vd["vid"], n=n, alpha=alpha, r_head=r_head,
                         perm_p=p_head, r_roi=r_roi, delta_r=r_head - r_roi,
                         ceiling=ceiling, frac_of_ceiling=frac))
    return rows


def fit_all(videos, alphas=ALPHAS):
    """Fit the ridge on ALL videos (no held-out) for the SAVED inference head.

    This is the ONLY place a final all-data model is fit — the leave-one-video-out
    driver in run() is validation. alpha is chosen by the same nested-LOVO selector used
    inside each fold, so the saved head's regularization matches how it was scored.
    Returns (w, b, alpha).
    """
    alpha = pick_alpha(videos, alphas)
    X, y = _train_rows(videos, shuffle=False, rng=None)
    w, b = ridge_fit(X, y, alpha)
    return w, b, alpha


def leak_check(videos, n_perm, seed):
    """Run the shuffle-target negative control and return 'pass' iff the across-video
    aggregate collapses (no leakage). Stamped into the saved head so a head that secretly
    fits noise can never be badged as validated downstream."""
    rows = run(videos, n_perm, True, seed)
    if not rows:
        return "unknown"
    _, pc = stouffer([r["perm_p"] for r in rows], [r["r_head"] for r in rows])
    med = float(np.nanmedian([r["r_head"] for r in rows]))
    leaked = (not np.isnan(pc)) and pc < 0.05 and med > 0
    return "FAIL" if leaked else "pass"


def report(rows, feats, shuffle, out):
    print("=" * 82)
    print("TRAINED READ-OUT HEAD  (ridge on frozen-TRIBE a-priori ROI features, "
          "leave-one-VIDEO-out)")
    if shuffle:
        print("*** NEGATIVE CONTROL (--shuffle-target): held-out r MUST collapse to ~0; "
              "Stouffer p MUST be non-significant. If not, the trainer is LEAKING. ***")
    print(f"features ({len(feats)}): " + ", ".join(feats))
    print("=" * 82)
    print(f"{'video':<20}{'n':>4}{'alpha':>8}{'r_head':>8}{'perm_p':>8}"
          f"{'r_roi':>8}{'delta':>8}{'ceil':>7}{'r/ceil':>8}")
    print("-" * 82)
    for r in sorted(rows, key=lambda d: d["video"]):
        print(f"{r['video']:<20}{r['n']:>4}{r['alpha']:>8g}{_fmt(r['r_head']):>8}"
              f"{_fmt(r['perm_p'], 3):>8}{_fmt(r['r_roi']):>8}{_fmt(r['delta_r']):>8}"
              f"{_fmt(r['ceiling']):>7}{_fmt(r['frac_of_ceiling']):>8}")

    z, pc = stouffer([r["perm_p"] for r in rows], [r["r_head"] for r in rows])
    _, pf = fisher([r["perm_p"] for r in rows])
    med_head = float(np.nanmedian([r["r_head"] for r in rows])) if rows else np.nan
    med_delta = float(np.nanmedian([r["delta_r"] for r in rows])) if rows else np.nan
    p_paired, med_d2 = paired_sign_perm([r["delta_r"] for r in rows])
    print("-" * 82)
    print(f"  HEAD: {len(rows)} videos | median r_head = {_fmt(med_head)} | "
          f"Stouffer p = {_fmt(pc, 4)} | Fisher p (omnibus, direction-agnostic) = {_fmt(pf, 4)}")
    print(f"  BEATS UNTRAINED ARC: median delta_r = {_fmt(med_delta)} | "
          f"paired sign-flip p = {_fmt(p_paired, 4)}   (delta_r = r_head - r_roi_mag)")

    # honest verdict (never overclaim; nulls stated plainly)
    alpha_lvl = 0.05
    head_real = (not np.isnan(pc)) and pc < alpha_lvl and not np.isnan(med_head) and med_head > 0
    beats = (not np.isnan(p_paired)) and p_paired < alpha_lvl and not np.isnan(med_delta) and med_delta > 0
    print("-" * 82)
    if shuffle:
        leaked = head_real
        print("  CONTROL VERDICT: " + ("!! LEAK — head found signal on shuffled targets; "
              "do NOT trust real results" if leaked else
              "OK — head collapses to ~0 on shuffled targets (no leakage)"))
    elif not head_real:
        print("  VERDICT: NULL — the trained head does not track human interest "
              "out-of-sample beyond the circular-shift null. Reported as the pre-registered "
              "outcome; the learned-head bet moves to proprietary ad-outcome data.")
    elif not beats:
        if not np.isnan(med_delta) and med_delta > 0.05:
            # tracks AND numerically exceeds the arc, but the paired test is underpowered:
            # report the real delta and paired p rather than the false "delta ~ 0".
            print(f"  VERDICT: head tracks human interest AND numerically beats the untrained "
                  f"arc (median delta_r={_fmt(med_delta)}), but the paired test is "
                  f"p={_fmt(p_paired, 3)} — TRENDING, not significant at n={len(rows)} videos "
                  "(underpowered). More videos needed to confirm the incremental win.")
        else:
            print("  VERDICT: head tracks human interest, but does NOT beat the untrained arc "
                  "(delta_r ~ 0). The arithmetic arc is sufficient at this n; no incremental win.")
    else:
        print(f"  VERDICT: head tracks AND beats the untrained arc (median delta_r="
              f"{_fmt(med_delta)}, paired p={_fmt(p_paired, 3)}). NOTE: only {len(rows)} "
              "videos = independent units -> UNDERPOWERED, hypothesis-generating, not validation.")
    print("  Reminder: TVSum importance is a PUBLIC PROXY; head output is a learned "
          "HYPOTHESIS (activation -> attention), never a validated retention/engagement claim.")

    if out:
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        cols = ["video", "n", "alpha", "r_head", "perm_p", "r_roi", "delta_r",
                "ceiling", "frac_of_ceiling"]
        with open(out + ".csv", "w") as f:
            f.write(",".join(cols) + "\n")
            for r in sorted(rows, key=lambda d: d["video"]):
                f.write(",".join(str(r.get(c, "")) for c in cols) + "\n")
        print(f"\n[wrote] {out}.csv")
    return dict(stouffer_p=pc, fisher_p=pf, median_r_head=med_head,
                median_delta_r=med_delta, paired_p=p_paired,
                head_real=bool(head_real), beats=bool(beats))


def preflight_coverage(preds_dir, arc_dir, human_dir):
    """Trace input coverage BEFORE video_data() silently drops anything, so the
    headline validation n can never shrink without a printed reason.

    Globs the four input families, strips each prefix/suffix to bare video ids,
    reports how many are complete (preds & arc & human_arc), then names every id
    that lacks a partner (-> DROPPED) or lacks human_annos (-> ceiling NaN).
    """
    def _ids(directory, prefix, suffix):
        return {os.path.basename(p)[len(prefix):-len(suffix)]
                for p in glob.glob(os.path.join(directory, prefix + "*" + suffix))}

    preds = _ids(preds_dir, "preds_", ".npy")
    arcs = _ids(arc_dir, "arc_", ".csv")
    human = _ids(human_dir, "human_arc_", ".csv")
    annos = _ids(human_dir, "human_annos_", ".npy")
    complete = preds & arcs & human
    print(f"[preflight] preds={len(preds)} arc={len(arcs)} human_arc={len(human)} "
          f"annos={len(annos)} -> {len(complete)} complete")
    for vid in sorted(preds - complete):
        lacks = []
        if vid not in arcs:
            lacks.append(f"arc_{vid}.csv")
        if vid not in human:
            lacks.append(f"human_arc_{vid}.csv")
        print(f"[preflight]   {vid}: lacks {', '.join(lacks)} -> DROPPED")
    for vid in sorted(complete - annos):
        print(f"[preflight]   {vid}: no human_annos -> ceiling will be NaN")
    return complete


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-dir", required=True, help="dir with preds_<id>.npy")
    ap.add_argument("--arc-dir", required=True, help="dir with arc_<id>.csv (nested baseline)")
    ap.add_argument("--human-dir", required=True, help="dir with human_arc_/human_annos_")
    ap.add_argument("--masks-dir", required=True, help="dir with a-priori roi_*.npy masks")
    ap.add_argument("--shot-sec", type=float, default=2.0)
    ap.add_argument("--n-perm", type=int, default=5000)
    ap.add_argument("--shuffle-target", action="store_true",
                    help="NEGATIVE CONTROL: circularly shift each training video's target; "
                         "held-out r must collapse to ~0")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None, help="output prefix (writes <out>.csv)")
    ap.add_argument("--fit-all", dest="fit_all", action="store_true",
                    help="after LOVO validation, fit the ridge on ALL videos and save a "
                         "reusable inference head (requires --save)")
    ap.add_argument("--save", default=None,
                    help="path to write the saved inference head JSON (implies --fit-all)")
    ap.add_argument("--dataset", default="TVSum",
                    help="training-proxy name stamped into the saved head's honest badge")
    args = ap.parse_args()

    masks = load_masks(args.masks_dir)
    if not masks:
        raise SystemExit(f"No roi_*.npy masks in {args.masks_dir} — build them with "
                         "build_roi_mask.py (--network dmn/dan/valence/arousal).")
    preflight_coverage(args.preds_dir, args.arc_dir, args.human_dir)
    # ids from preds_<id>.npy (stem_id doesn't strip the 'preds_' prefix, so do it here)
    vids = sorted({os.path.basename(p)[len("preds_"):-len(".npy")]
                   for p in glob.glob(os.path.join(args.preds_dir, "preds_*.npy"))})
    videos = [v for v in (video_data(vid, args.preds_dir, args.arc_dir, args.human_dir,
                                     masks, args.shot_sec) for vid in vids) if v is not None]
    if len(videos) < 3:
        raise SystemExit(f"Only {len(videos)} usable videos (need >=3 for leave-one-video-out; "
                         ">=10-20 for any real claim). Extract more TVSum clips first.")
    if len(videos) < 8:
        print(f"[warn] only {len(videos)} videos -> leave-one-video-out is very low power. "
              "This is a smoke test, not a real result.\n")

    rows = run(videos, args.n_perm, args.shuffle_target, args.seed)
    if not rows:
        raise SystemExit("No videos produced a result (too few aligned shots).")
    summ = report(rows, feature_names(masks), args.shuffle_target, args.out)

    # --- save a reusable inference head (the "score a NEW ad" path) ---------------
    if (args.save or args.fit_all) and args.shuffle_target:
        print("\n[note] --save/--fit-all ignored under --shuffle-target: this is the negative "
              "control run, which deliberately fits no reusable head.")
    if (args.save or args.fit_all) and not args.shuffle_target:
        import datetime
        import head_io
        if not args.save:
            raise SystemExit("--fit-all needs --save PATH to write the head to.")
        leak = leak_check(videos, args.n_perm, args.seed)
        w, b, alpha = fit_all(videos)
        # record which baseline column video_data actually used (roi_mag preferred; the
        # arithmetic global_mag is the documented fallback) so apply reads the same one.
        sample_arc = next(iter(glob.glob(os.path.join(args.arc_dir, "arc_*.csv"))), None)
        baseline_col = "global_mag"
        if sample_arc:
            with open(sample_arc) as fh:
                if "roi_mag" in fh.readline():
                    baseline_col = "roi_mag"
        stamp = dict(median_r=summ["median_r_head"], stouffer_p=summ["stouffer_p"],
                     paired_p=summ["paired_p"], n_videos=len(videos), leak_check=leak,
                     dataset=args.dataset, date=datetime.date.today().isoformat())
        head_io.save_head(args.save, "attention", w, b, alpha, masks, baseline_col,
                          args.shot_sec, stamp)
        print(f"\n[saved] inference head -> {args.save}  (kind=attention, "
              f"n={len(videos)}, median r={_fmt(summ['median_r_head'])}, "
              f"leak_check={leak}, alpha={alpha:g})")
        if leak != "pass":
            print("  !! leak_check != 'pass' — head is stamped POISONED; head_apply will "
                  "refuse to apply it. Investigate leakage before trusting any result.")


if __name__ == "__main__":
    main()
