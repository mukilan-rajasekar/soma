#!/usr/bin/env python3
"""
retention_head.py — train a leakage-safe read-out HEAD on frozen-TRIBE preds to predict
the Mr.HiSum most-replayed arc (a RETENTION PROXY), on the well-predicted sensory/attention
cortex.

WHY THIS IS THE HIGHEST-CEILING PATH (and what keeps it honest)
---------------------------------------------------------------
train_head.py learns activation -> TVSum *interest* (a public proxy for top-down attention).
This head learns activation -> most-replayed *engagement* — the closest public label to the
retention outcome the whole company is betting on. It is still a PROXY (rewatch != not-leaving;
see mrhisum_prep.py), and the scorer is applied out-of-distribution to any new ad, so head
output is a LEARNED HYPOTHESIS, never a validated retention claim.

The bar is deliberately high, because a documented negative prior (arXiv 2607.01400) says a
GLOBAL TRIBE drive does NOT predict most-replayed. So this head must clear THREE gates:
  1. beat its own circular-shift permutation null (per video, combined across videos);
  2. beat the GLOBAL-signal baseline (global_mag is nested as the head's last input, so any
     win is provably incremental — exactly train_head's roi_mag-nesting trick);
  3. beat the dumb ffmpeg covariates (loudness/cuts/luminance/motion), reusing the
     incremental-validity partial-Spearman machinery.
And the leakage control (shuffle the training targets, REFIT the whole LOVO pipeline) must
collapse to ~0 — a fixed-prediction permutation would be INVALID and is not used here.

ANTI-OVERFIT (the load-bearing design choice)
---------------------------------------------
Regressing on the raw 20484 vertices already went to chance at n=29 — do NOT do it. The head
is restricted to an a-priori SENSORY/ATTENTION ROI (default: DAN) pooled to a FEW dims
(mean|.| + signed mean per mask = 2 dims/mask) + the nested global baseline, with strong ridge
regularization chosen by nested LOVO. Feature set is a flag (--features roi|roi+temporal|global).
The stats path is the AUDITED code from train_head / incremental_validity — nothing new invented.

INPUTS (per video <id>):
  preds_<id>.npy        frozen-TRIBE output (n_sec, 20484)          [--preds-dir; batch_extract.py]
  retention_<id>.csv    most-replayed arc (t_sec, most_replayed)    [--retention-dir; mrhisum_prep.py]
  arc_<id>.csv          (t_sec, global_mag[, roi_mag]) OPTIONAL     [--arc-dir; global falls back to
                                                                     mean|preds| if absent]
  baseline_<id>.csv     (t_sec, loudness,cuts,luminance,motion)     [--baseline-dir; baseline_extract.py]
  roi_mask_<name>.npy   a-priori boolean masks length 20484         [--masks-dir; build_roi_mask.py]

OPTIONAL temporal features (coordinates with temporal_readout.py via a generic interface):
  --features roi+temporal imports temporal_readout and appends its columns. The agreed seam is
  either  temporal_readout.pooled_features(preds, edges) -> (n_bins, k)
  or      temporal_readout.per_second_features(preds)    -> (n_sec, k)   (resampled here).

USAGE:
  # smoke on a synthetic sample (no GPU) — see tests/test_retention_head.py
  # real run (after GPU extract + mrhisum_prep):
  python retention_head.py --preds-dir data/mrhisum/preds --retention-dir data/mrhisum \
      --masks-dir data --roi dan --baseline-dir data/mrhisum/baseline \
      --out validation/retention_head.csv --save validation/head_retention.json
"""
import argparse
import glob
import json
import os
import zlib

import numpy as np

import train_head as TH
from honest_corr_timeseries import (_read_csv, resample_to_grid, stouffer, _fmt,
                                     MIN_EFFECT_R)
from incremental_validity import partial_spearman, partial_shift_p

# a-priori SENSORY/ATTENTION ROIs (the well-predicted cortex). DAN is the pre-registered
# default; DMN is available as an add-on. NOT the affect ROIs (OFC/vmPFC prediction is closed).
DEFAULT_ROI = ["dan"]
FFMPEG_COLS = ("loudness", "cuts", "luminance", "motion")


# -----------------------------------------------------------------------------
# masks + global baseline
# -----------------------------------------------------------------------------
def load_masks(masks_dir, roi_names):
    """Load the requested a-priori masks by name. Accepts both real (roi_mask_<name>.npy)
    and synthetic-fixture (roi_<name>.npy) filenames. Returns [(name, bool_mask), ...]."""
    out = []
    for name in roi_names:
        cands = [f"roi_mask_{name}.npy", f"roi_{name}.npy"]
        path = next((os.path.join(masks_dir, c) for c in cands
                     if os.path.exists(os.path.join(masks_dir, c))), None)
        if path is None:
            raise SystemExit(f"mask '{name}' not found in {masks_dir} (looked for "
                             f"{cands}). Build it with build_roi_mask.py --network {name}.")
        out.append((name, np.load(path).astype(bool)))
    return out


def _global_series(preds, vid, arc_dir):
    """The GLOBAL baseline arc = whole-cortex mean|activation| per second (== arc_*.csv
    global_mag). Prefer the extracted arc_<id>.csv if present (real data), else compute it
    straight from preds (identical quantity) so the test/laptop path needs no arc CSVs."""
    if arc_dir:
        p = os.path.join(arc_dir, f"arc_{vid}.csv")
        if os.path.exists(p):
            _, ac = _read_csv(p)
            if "global_mag" in ac:
                return np.asarray(ac["t_sec"], float), np.asarray(ac["global_mag"], float)
    return np.arange(preds.shape[0], dtype=float), np.abs(preds).mean(axis=1)


def _grid_edges(n_sec, pool_sec):
    """Pooling grid [0, pool, 2*pool, ...] covering the clip (ceil so the last second is
    never dropped) — mirrors head_io._shot_edges so fit-time and apply-time grids match."""
    n = max(1, int(np.ceil(n_sec / pool_sec)))
    return np.arange(n + 1, dtype=float) * pool_sec


def _temporal_columns(preds, edges):
    """Append temporal_readout.py features via the agreed generic interface. Optional; a
    missing/incompatible module is a hard, explicit stop (never a silent skip)."""
    try:
        import temporal_readout as TR
    except Exception as e:  # noqa: BLE001 - want the message regardless of import failure mode
        raise SystemExit("--features roi+temporal requested but temporal_readout.py is not "
                         f"importable ({e!r}). Build it or drop the +temporal flag.")
    if hasattr(TR, "pooled_features"):
        M = np.asarray(TR.pooled_features(preds, edges), float)          # (n_bins, k)
        return [M[:, j] for j in range(M.shape[1])]
    if hasattr(TR, "per_second_features"):
        F = np.asarray(TR.per_second_features(preds), float)            # (n_sec, k)
        tsec = np.arange(preds.shape[0], dtype=float)
        return [resample_to_grid(tsec, F[:, j], edges) for j in range(F.shape[1])]
    raise SystemExit("temporal_readout must expose pooled_features(preds, edges) or "
                     "per_second_features(preds) — neither found.")


# -----------------------------------------------------------------------------
# per-video assembly (train_head-shaped dict, so we reuse its AUDITED LOVO driver)
# -----------------------------------------------------------------------------
def video_data(vid, preds_dir, retention_dir, masks, pool_sec=2.0, arc_dir=None,
               temporal=False):
    """Assemble one video's grid feature matrix + most-replayed target + global baseline.

    Returns a dict shaped exactly like train_head.video_data (keys vid/X/human/roi/annos/
    good, plus edges/n_masks/temporal_k) so train_head.run / fit_predict / leak_check can be
    reused unchanged. X columns = [pooled ROI feats..., (temporal feats...), global_baseline];
    the global baseline is the LAST column == train_head nesting roi_mag, giving the
    beats-global delta for free. human = most-replayed on the grid; annos=None (no ceiling)."""
    predp = os.path.join(preds_dir, f"preds_{vid}.npy")
    retp = os.path.join(retention_dir, f"retention_{vid}.csv")
    if not (os.path.exists(predp) and os.path.exists(retp)):
        miss = [os.path.basename(p) for p in (predp, retp) if not os.path.exists(p)]
        print(f"[skip] {vid}: missing {', '.join(miss)}")
        return None
    preds = np.load(predp).astype(float)
    n_sec = preds.shape[0]
    _, rc = _read_csv(retp)
    if "t_sec" not in rc or "most_replayed" not in rc:
        print(f"[skip] {vid}: retention_{vid}.csv needs t_sec,most_replayed columns")
        return None
    edges = _grid_edges(n_sec, pool_sec)
    tsec = np.arange(n_sec, dtype=float)

    feat_ps = TH.pool_features(preds, masks)                            # (n_sec, 2*n_masks)
    cols = [resample_to_grid(tsec, feat_ps[:, j], edges) for j in range(feat_ps.shape[1])]
    temporal_k = 0
    if temporal:
        tcols = _temporal_columns(preds, edges)
        temporal_k = len(tcols)
        cols += tcols

    gt, gv = _global_series(preds, vid, arc_dir)
    global_grid = resample_to_grid(gt, gv, edges)
    target = resample_to_grid(np.asarray(rc["t_sec"], float),
                              np.asarray(rc["most_replayed"], float), edges)

    X = np.column_stack(cols + [global_grid])                          # baseline LAST
    good = ~np.isnan(X).any(axis=1) & ~np.isnan(target)
    if int(good.sum()) < 10:
        print(f"[skip] {vid}: only {int(good.sum())} good bins (<10 required)")
        return None
    return dict(vid=vid, X=TH._standardize(X, good), human=target, roi=global_grid,
                annos=None, good=good, edges=edges, n_masks=len(masks),
                temporal_k=temporal_k)


def build_videos(preds_dir, retention_dir, masks, pool_sec=2.0, arc_dir=None,
                 temporal=False):
    vids = sorted({os.path.basename(p)[len("preds_"):-len(".npy")]
                   for p in glob.glob(os.path.join(preds_dir, "preds_*.npy"))})
    return [v for v in (video_data(x, preds_dir, retention_dir, masks, pool_sec, arc_dir,
                                   temporal) for x in vids) if v is not None]


# -----------------------------------------------------------------------------
# gate 3: beat the ffmpeg covariates (reuse incremental-validity, refit LOVO per video)
# -----------------------------------------------------------------------------
def incremental_over_ffmpeg(videos, baseline_dir, n_perm=2000):
    """Does the head's LOVO prediction still track most-replayed AFTER partialling out
    loudness/cuts/luminance/motion? Mirrors head_incremental.py: honest LOVO prediction ->
    first-differenced partial Spearman + circular-shift null, combined via signed Stouffer."""
    if not baseline_dir:
        return None
    rows = []
    for i, tvd in enumerate(videos):
        vid = tvd["vid"]
        bp = os.path.join(baseline_dir, f"baseline_{vid}.csv")
        if not os.path.exists(bp):
            continue
        train = videos[:i] + videos[i + 1:]
        alpha = TH.pick_alpha(train, TH.ALPHAS)
        pred = TH.fit_predict(train, tvd, alpha)                       # honest LOVO prediction
        _, bc = _read_csv(bp)
        base_t = np.asarray(bc["t_sec"], float) if "t_sec" in bc else \
            np.arange(len(next(iter(bc.values()))), dtype=float)
        Fcols = [resample_to_grid(base_t, np.asarray(bc[k], float), tvd["edges"])
                 for k in FFMPEG_COLS if k in bc]
        if not Fcols:
            continue
        g = tvd["good"] & ~np.isnan(np.column_stack([pred] + Fcols)).any(axis=1)
        keep = g[:-1] & g[1:]
        if int(keep.sum()) < 8:
            continue

        def _d(x):
            return np.diff(np.where(g, np.asarray(x, float), np.nan))[keep]

        db, dh = _d(pred), _d(tvd["human"])
        dF = np.column_stack([_d(f) for f in Fcols])
        pr = partial_spearman(db, dh, dF)
        p, _ = partial_shift_p(db, dh, dF, n_perm=n_perm, seed=zlib.crc32(vid.encode()))
        adds = int((not np.isnan(p)) and p < 0.05 and abs(pr) > MIN_EFFECT_R)
        rows.append((vid, pr, p, adds))
    if not rows:
        return None
    prs = [r[1] for r in rows]
    _, pc = stouffer([r[2] for r in rows], prs)
    med = float(np.nanmedian(prs))
    beats = (not np.isnan(pc)) and pc < 0.05 and med > 0 and abs(med) >= MIN_EFFECT_R
    return dict(rows=rows, n=len(rows), adds=sum(r[3] for r in rows),
                median_partial=med, stouffer_p=pc, beats_ffmpeg=bool(beats))


# -----------------------------------------------------------------------------
# evaluate — the three honesty gates, combined
# -----------------------------------------------------------------------------
def evaluate(videos, n_perm=2000, seed=0, baseline_dir=None):
    """Run LOVO validation + all three gates. Returns a dict of the honest verdict pieces.

    Reuses train_head.run (per-video circular-shift perm null, r_head, r_roi==r_global,
    delta_r), train_head.paired_sign_perm (beats-global paired test), and train_head.leak_check
    (shuffle-target REFIT null — the whole pipeline is re-fit each permutation)."""
    rows = TH.run(videos, n_perm, shuffle=False, seed=seed)
    if not rows:
        raise SystemExit("No videos produced a result (too few aligned bins).")
    rh = [r["r_head"] for r in rows]
    _, pc = stouffer([r["perm_p"] for r in rows], rh)
    median_r = float(np.nanmedian(rh))
    deltas = [r["delta_r"] for r in rows]
    median_delta = float(np.nanmedian(deltas))
    paired_p, _ = TH.paired_sign_perm(deltas)
    leak = TH.leak_check(videos, n_perm, seed)

    head_real = ((not np.isnan(pc)) and pc < 0.05 and median_r > 0
                 and median_r >= MIN_EFFECT_R)
    beats_global = ((not np.isnan(paired_p)) and paired_p < 0.05 and median_delta > 0)
    ffmpeg = incremental_over_ffmpeg(videos, baseline_dir, n_perm)
    beats_ffmpeg = (ffmpeg["beats_ffmpeg"] if ffmpeg is not None else None)

    signal = bool(head_real and beats_global and leak == "pass"
                  and (beats_ffmpeg is not False))     # None (no baselines) doesn't block; False does
    return dict(rows=rows, n_videos=len(rows), stouffer_p=pc, median_r=median_r,
                median_delta=median_delta, paired_p=paired_p, leak_check=leak,
                head_real=bool(head_real), beats_global=bool(beats_global),
                ffmpeg=ffmpeg, beats_ffmpeg=beats_ffmpeg, signal=signal)


# -----------------------------------------------------------------------------
# report + save
# -----------------------------------------------------------------------------
def report(ev, feature_set, roi_names, dataset, out=None, json_out=None,
           n_perm=2000):
    rows = ev["rows"]
    print("=" * 86)
    print("RETENTION READ-OUT HEAD  (ridge on frozen-TRIBE a-priori ROI features, "
          "leave-one-VIDEO-out)")
    print(f"PRE-REGISTERED PRIMARY feature set = 'roi' (ROIs={roi_names}); this run = "
          f"{feature_set!r}. Multiple feature sets -> Holm-correct; never quote best-of-N.")
    print(f"target = Mr.HiSum most-replayed (a RETENTION PROXY: rewatch != not-leaving) | "
          f"dataset={dataset}")
    print("=" * 86)
    print(f"{'video':<16}{'n':>4}{'alpha':>8}{'r_head':>8}{'perm_p':>8}"
          f"{'r_global':>10}{'delta':>8}")
    print("-" * 86)
    for r in sorted(rows, key=lambda d: d["video"]):
        print(f"{r['video']:<16}{r['n']:>4}{r['alpha']:>8g}{_fmt(r['r_head']):>8}"
              f"{_fmt(r['perm_p'], 3):>8}{_fmt(r['r_roi']):>10}{_fmt(r['delta_r']):>8}")
    print("-" * 86)
    print(f"  gate1 HEAD vs perm null : {len(rows)} videos | median r_head = "
          f"{_fmt(ev['median_r'])} | combined Stouffer p = {_fmt(ev['stouffer_p'], 4)}"
          f"  -> {'PASS' if ev['head_real'] else 'no'}")
    print(f"  gate2 BEATS GLOBAL      : median delta_r (head - global_mag) = "
          f"{_fmt(ev['median_delta'])} | paired sign-flip p = {_fmt(ev['paired_p'], 4)}"
          f"  -> {'PASS' if ev['beats_global'] else 'no'}")
    if ev["ffmpeg"] is not None:
        fm = ev["ffmpeg"]
        print(f"  gate3 BEATS ffmpeg      : median partial_r = {_fmt(fm['median_partial'])} | "
              f"Stouffer p = {_fmt(fm['stouffer_p'], 4)} | adds {fm['adds']}/{fm['n']}"
              f"  -> {'PASS' if fm['beats_ffmpeg'] else 'no'}")
    else:
        print("  gate3 BEATS ffmpeg      : (no baseline_*.csv supplied -> not tested; run "
              "baseline_extract.py to close this gate)")
    print(f"  leak control (REFIT)    : shuffle-target LOVO collapses? leak_check="
          f"{ev['leak_check']}  -> {'OK' if ev['leak_check'] == 'pass' else 'INVESTIGATE'}")
    print("-" * 86)
    if ev["leak_check"] != "pass":
        print("  VERDICT: !! leak control did NOT pass — the head found signal on shuffled "
              "targets. DO NOT TRUST any positive number until leakage is fixed.")
    elif ev["signal"]:
        print(f"  VERDICT: SIGNAL — the head predicts most-replayed over the perm null, the "
              f"GLOBAL baseline, and ffmpeg. Encouraging, but most-replayed is a PROXY, the "
              f"scorer is out-of-distribution on new ads, and n={len(rows)} videos is small "
              "-> a learned HYPOTHESIS, not a validated retention model.")
    else:
        missed = [g for g, ok in [("perm null", ev["head_real"]),
                                  ("global baseline", ev["beats_global"]),
                                  ("ffmpeg", ev["beats_ffmpeg"] is not False)] if not ok]
        print(f"  VERDICT: NULL — the head does NOT clear every gate (missed: "
              f"{', '.join(missed) or 'effect floor'}). Reported plainly as the "
              "pre-registered outcome; the negative prior (global TRIBE ~/> most-replayed) "
              "stands until real Mr.HiSum data + more videos move it.")
    print("  Reminder: Mr.HiSum most-replayed is a PUBLIC RETENTION PROXY; n = videos, not "
          "seconds; head output is a learned hypothesis.")

    if out:
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        with open(out, "w") as f:
            f.write("video,n,alpha,r_head,perm_p,r_global,delta_r\n")
            for r in sorted(rows, key=lambda d: d["video"]):
                f.write(f"{r['video']},{r['n']},{r['alpha']},{r['r_head']:.4f},"
                        f"{r['perm_p']:.4f},{r['r_roi']:.4f},{r['delta_r']:.4f}\n")
        print(f"[wrote] {out}")
    if json_out:
        os.makedirs(os.path.dirname(json_out) or ".", exist_ok=True)
        def _clean(v):
            return None if isinstance(v, float) and not np.isfinite(v) else v
        payload = dict(
            dataset=dataset, feature_set=feature_set, roi=roi_names, n_videos=ev["n_videos"],
            min_effect_r=MIN_EFFECT_R, n_perm=n_perm,
            median_r=_clean(ev["median_r"]), stouffer_p=_clean(ev["stouffer_p"]),
            median_delta_r=_clean(ev["median_delta"]), paired_p=_clean(ev["paired_p"]),
            leak_check=ev["leak_check"], head_real=ev["head_real"],
            beats_global=ev["beats_global"], beats_ffmpeg=ev["beats_ffmpeg"],
            signal=ev["signal"],
            proxy_note="most-replayed is a RETENTION PROXY (rewatch != not-leaving)")
        with open(json_out, "w") as f:
            json.dump(payload, f, indent=2, allow_nan=False)
        print(f"[wrote] {json_out}")


def save_head(save_path, videos, masks, ev, pool_sec, dataset):
    """Fit the ridge on ALL videos and serialize a reusable inference head via head_io
    (kind='retention', baseline_col='global_mag'). ONLY for the pure-ROI feature set —
    a temporal-augmented head's column layout doesn't fit head_io's mask packing."""
    if any(v["temporal_k"] for v in videos):
        print("[note] --save skipped: the saved-head format packs ROI masks only; a "
              "roi+temporal head has extra columns. Validate temporal here, ship the ROI head.")
        return None
    import datetime
    import head_io
    w, b, alpha = TH.fit_all(videos)
    stamp = dict(median_r=ev["median_r"], stouffer_p=ev["stouffer_p"],
                 paired_p=ev["paired_p"], n_videos=ev["n_videos"],
                 leak_check=ev["leak_check"], dataset=dataset,
                 date=datetime.date.today().isoformat())
    head_io.save_head(save_path, "retention", w, b, alpha, masks, "global_mag",
                      pool_sec, stamp)
    print(f"[saved] retention head -> {save_path} (kind=retention, n={ev['n_videos']}, "
          f"leak_check={ev['leak_check']}, alpha={alpha:g})")
    if ev["leak_check"] != "pass":
        print("  !! stamped POISONED (leak_check != pass) — head_apply will refuse it.")
    return save_path


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-dir", default="data/mrhisum/preds", help="dir with preds_<id>.npy")
    ap.add_argument("--retention-dir", default="data/mrhisum",
                    help="dir with retention_<id>.csv (mrhisum_prep.py)")
    ap.add_argument("--arc-dir", default=None,
                    help="optional dir with arc_<id>.csv for global_mag (else computed from preds)")
    ap.add_argument("--baseline-dir", default=None,
                    help="dir with baseline_<id>.csv (ffmpeg gate; omit to skip that gate)")
    ap.add_argument("--masks-dir", default="data", help="dir with roi_mask_<name>.npy")
    ap.add_argument("--roi", default=",".join(DEFAULT_ROI),
                    help="comma-separated a-priori sensory/attention ROIs (default: dan)")
    ap.add_argument("--features", choices=["roi", "roi+temporal", "global"], default="roi",
                    help="PRIMARY='roi'. roi+temporal appends temporal_readout features; "
                         "global is the baseline-only control.")
    ap.add_argument("--pool-sec", type=float, default=2.0, help="pooling grid resolution")
    ap.add_argument("--n-perm", type=int, default=5000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--dataset", default="Mr.HiSum")
    ap.add_argument("--out", default="validation/retention_head.csv")
    ap.add_argument("--json-out", default="validation/retention_head.json")
    ap.add_argument("--save", default=None, help="write a reusable inference head JSON (ROI feature set only)")
    args = ap.parse_args()

    roi_names = ["dan"] if args.features == "global" else \
        [r.strip() for r in args.roi.split(",") if r.strip()]
    masks = load_masks(args.masks_dir, roi_names)
    temporal = args.features == "roi+temporal"
    videos = build_videos(args.preds_dir, args.retention_dir, masks, args.pool_sec,
                          args.arc_dir, temporal)
    if len(videos) < 3:
        raise SystemExit(f"only {len(videos)} usable videos (need >=3 for LOVO; >=15-30 for "
                         "any real claim). Extract more Mr.HiSum videos + run mrhisum_prep.")
    if len(videos) < 8:
        print(f"[warn] only {len(videos)} videos -> LOVO is very low power. Smoke test, not "
              "a real result.\n")

    ev = evaluate(videos, n_perm=args.n_perm, seed=args.seed, baseline_dir=args.baseline_dir)
    report(ev, args.features, roi_names, args.dataset, args.out, args.json_out, args.n_perm)
    if args.save and not temporal:
        save_head(args.save, videos, masks, ev, args.pool_sec, args.dataset)
    elif args.save:
        save_head(args.save, videos, masks, ev, args.pool_sec, args.dataset)  # prints the skip note


if __name__ == "__main__":
    main()
