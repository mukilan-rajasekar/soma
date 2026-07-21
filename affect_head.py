#!/usr/bin/env python3
"""
affect_head.py — the EMOTION analogue of train_head.py.

We proved on real TVSum that the RAW arithmetic attention arc is null but a small TRAINED
head over a-priori ROI features tracks human interest. Emotion is today exactly where
attention was before the head: affect_extract.py emits only a RAW fixed-weight proxy
(z signed OFC/vmPFC = valence, z |insula/ACC| = arousal) — the direct twin of the null
roi_mag arc. This trains the head version: a ridge over a-priori affect-ROI features that
predicts human VALENCE and AROUSAL (LIRIS-ACCEDE), validated leave-one-VIDEO-out, with the
RAW proxy nested as the baseline it must beat.

It reuses train_head.py's machinery unchanged (pool_features, ridge_fit, pick_alpha,
_standardize, the circular-shift null, the shuffle-target control, signed Stouffer, the
paired delta-vs-baseline test), so affect is judged by the identical honest yardstick.

HONESTY (read PREREGISTRATION-head.md; the affect prereg mirrors it):
- Two SEPARATE ridge read-outs (valence, arousal) — never one "emotion" scalar.
- Target = LIRIS per-second human valence/arousal (a PUBLIC PROXY, not an ad outcome).
- On the SYNTHETIC fixtures this only proves the MACHINE is honest (detects planted signal;
  null + shuffle collapse). It CANNOT show the head beating the proxy, because the synthetic
  proxy's sign is correct by construction (delta_r ~ 0 is expected). Real incremental value
  needs the LIRIS movies, where the a-priori proxy sign/weights are not handed to us.
- Head output is a LEARNED HYPOTHESIS (activation -> affect), never "reads felt emotion" and
  never a named emotion (fear/joy/...) — those are later, fMRI/subcortex-earned rungs.

INPUTS (per video <id>):
  preds_<id>.npy        frozen-TRIBE (n_seconds, 20484)                  [--preds-dir]
  human_affect_<id>.csv OR liris_<id>.csv  (cols t_sec,valence,arousal)  [--target-dir]
  roi_*valence*.npy / roi_*arousal*.npy    a-priori affect masks         [--masks-dir]

USAGE:
  # synthetic machine-honesty test (no new data):
  python affect_head.py --preds-dir tests/synth --target-dir tests/synth/liris \
      --masks-dir tests/synth --out tests/synth/affect_head
  # leakage control (held-out r MUST collapse):
  python affect_head.py ... --shuffle-target
"""
import argparse
import glob
import os

import numpy as np

import train_head as T
from honest_corr_timeseries import (_read_csv, resample_to_grid, stouffer, fisher, _fmt)

DIMS = ("valence", "arousal")


def load_affect_masks(masks_dir):
    """a-priori valence + arousal ROI masks (roi_*valence*.npy / roi_*arousal*.npy)."""
    out = []
    for key in ("valence", "arousal"):
        hits = sorted(glob.glob(os.path.join(masks_dir, f"roi_*{key}*.npy")))
        if hits:
            out.append((key, np.asarray(np.load(hits[0]), bool)))
    return out


def _proxy_arc(preds, masks, dim):
    """The RAW affect proxy (affect_extract convention): signed mean for valence,
    |activation| mean for arousal, over that dim's a-priori mask. The nested baseline."""
    m = dict(masks).get(dim)
    if m is None:
        return None
    col = preds[:, m]
    return col.mean(axis=1) if dim == "valence" else np.abs(col).mean(axis=1)


def build_videos(dim, preds_dir, target_dir, masks, shot_sec):
    """One (dim) video list in train_head's dict format so train_head.run() can score it."""
    vids = sorted(os.path.basename(p)[len("preds_"):-len(".npy")]
                  for p in glob.glob(os.path.join(preds_dir, "preds_*.npy")))
    videos = []
    for vid in vids:
        predp = os.path.join(preds_dir, f"preds_{vid}.npy")
        tgt = None
        for cand in (f"human_affect_{vid}.csv", f"liris_{vid}.csv"):
            p = os.path.join(target_dir, cand)
            if os.path.exists(p):
                tgt = p
                break
        if tgt is None:
            continue
        preds = np.load(predp).astype(float)
        _, tc = _read_csv(tgt)
        if "t_sec" not in tc or dim not in tc:
            continue
        t_sec = np.asarray(tc["t_sec"], float)
        target = np.asarray(tc[dim], float)
        t0, t1 = float(t_sec[0]), float(t_sec[-1])
        edges = np.arange(t0, t1 + shot_sec + 1e-9, shot_sec)
        if len(edges) < 6:
            continue

        tp = np.arange(preds.shape[0], dtype=float)
        feat_ps = T.pool_features(preds, masks)                       # (T, 2*n_masks)
        feat_grid = np.column_stack([resample_to_grid(tp, feat_ps[:, j], edges)
                                     for j in range(feat_ps.shape[1])])
        proxy_ps = _proxy_arc(preds, masks, dim)                      # nested baseline
        proxy_grid = resample_to_grid(tp, proxy_ps, edges)
        target_grid = resample_to_grid(t_sec, target, edges)

        X = np.column_stack([feat_grid, proxy_grid])
        good = ~np.isnan(X).any(axis=1) & ~np.isnan(target_grid)
        if int(good.sum()) < 10:
            continue
        videos.append(dict(vid=vid, X=T._standardize(X, good), human=target_grid,
                           roi=proxy_grid, annos=None, good=good))
    return videos


def report(dim, rows, masks, shuffle):
    feats = [f"{n}|{s}" for n, _m in masks for s in ("mag", "sgn")] + ["raw proxy (baseline)"]
    print("=" * 82)
    print(f"AFFECT HEAD · {dim.upper()}  (ridge on frozen-TRIBE a-priori affect ROIs, "
          "leave-one-VIDEO-out)")
    if shuffle:
        print("*** NEGATIVE CONTROL (--shuffle-target): held-out r MUST collapse to ~0. ***")
    print(f"features ({len(feats)}): " + ", ".join(feats))
    print("-" * 82)
    print(f"{'video':<20}{'n':>4}{'alpha':>8}{'r_head':>8}{'perm_p':>8}{'r_proxy':>9}{'delta':>8}")
    for r in sorted(rows, key=lambda d: d["video"]):
        print(f"{r['video']:<20}{r['n']:>4}{r['alpha']:>8g}{_fmt(r['r_head']):>8}"
              f"{_fmt(r['perm_p'], 3):>8}{_fmt(r['r_roi']):>9}{_fmt(r['delta_r']):>8}")
    z, pc = stouffer([r["perm_p"] for r in rows], [r["r_head"] for r in rows])
    _, pf = fisher([r["perm_p"] for r in rows])
    med = float(np.nanmedian([r["r_head"] for r in rows])) if rows else np.nan
    p_pair, med_d = T.paired_sign_perm([r["delta_r"] for r in rows])
    print("-" * 82)
    print(f"  {dim.upper()}: {len(rows)} videos | median r_head = {_fmt(med)} | "
          f"Stouffer p = {_fmt(pc, 4)} | Fisher p (omnibus) = {_fmt(pf, 4)}")
    print(f"  vs RAW PROXY: median delta_r = {_fmt(med_d)} | paired p = {_fmt(p_pair, 3)}")
    return dict(dim=dim, stouffer_p=pc, median_r=med, paired_p=p_pair, median_delta=med_d)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-dir", required=True)
    ap.add_argument("--target-dir", required=True, help="dir with human_affect_/liris_ csv")
    ap.add_argument("--masks-dir", required=True)
    ap.add_argument("--dims", default="valence,arousal")
    ap.add_argument("--shot-sec", type=float, default=2.0)
    ap.add_argument("--n-perm", type=int, default=5000)
    ap.add_argument("--shuffle-target", action="store_true")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None)
    ap.add_argument("--save-dir", dest="save_dir", default=None,
                    help="dir to write head_<dim>.json reusable inference heads")
    ap.add_argument("--dataset", default="LIRIS",
                    help="training-proxy name stamped into each saved head's honest badge")
    args = ap.parse_args()

    masks = load_affect_masks(args.masks_dir)
    if not masks:
        raise SystemExit(f"No affect masks (roi_*valence*.npy / roi_*arousal*.npy) in "
                         f"{args.masks_dir} — build with build_roi_mask.py --network valence/arousal.")
    out = {}
    for dim in [d.strip() for d in args.dims.split(",") if d.strip() in DIMS]:
        videos = build_videos(dim, args.preds_dir, args.target_dir, masks, args.shot_sec)
        if len(videos) < 3:
            print(f"[{dim}] only {len(videos)} usable videos (need >=3) — skipping\n")
            continue
        if len(videos) < 8:
            print(f"[{dim}] warn: only {len(videos)} videos -> very low power (smoke test).")
        rows = T.run(videos, args.n_perm, args.shuffle_target, args.seed)
        out[dim] = report(dim, rows, masks, args.shuffle_target)

        # save a reusable inference head for this dim (the "score a NEW ad" path)
        if args.save_dir and args.shuffle_target:
            print(f"[{dim}] --save-dir ignored under --shuffle-target (negative control; "
                  "no head saved).")
        if args.save_dir and not args.shuffle_target:
            import datetime
            import head_io
            leak = T.leak_check(videos, args.n_perm, args.seed)
            w, b, alpha = T.fit_all(videos)
            summ = out[dim]
            stamp = dict(median_r=summ["median_r"], stouffer_p=summ["stouffer_p"],
                         paired_p=summ["paired_p"], n_videos=len(videos), leak_check=leak,
                         dataset=args.dataset, date=datetime.date.today().isoformat())
            hp = os.path.join(args.save_dir, f"head_{dim}.json")
            head_io.save_head(hp, dim, w, b, alpha, masks, "proxy", args.shot_sec, stamp)
            print(f"[saved] {dim} head -> {hp}  (n={len(videos)}, leak_check={leak})")
            if leak != "pass":
                print(f"  !! {dim} head stamped POISONED (leak_check={leak}); "
                      "head_apply will refuse it.")
        if args.out:
            os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
            cols = ["video", "n", "alpha", "r_head", "perm_p", "r_roi", "delta_r"]
            with open(f"{args.out}_{dim}.csv", "w") as f:
                f.write(",".join(cols) + "\n")
                for r in sorted(rows, key=lambda d: d["video"]):
                    f.write(",".join(str(r.get(c, "")) for c in cols) + "\n")
        print()
    print("Reminder: LIRIS valence/arousal is a PUBLIC PROXY; head output is a learned "
          "HYPOTHESIS (activation->affect), NOT felt emotion and NOT a named emotion.")


if __name__ == "__main__":
    main()
