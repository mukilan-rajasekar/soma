#!/usr/bin/env python3
"""
affect_validate.py — Rung-1 validation of the AFFECT (valence/arousal) arc against
LIRIS-ACCEDE continuous human annotations. Honest, within-video, autocorr-aware.

READ THIS FIRST — what a positive result here does and does NOT mean
-------------------------------------------------------------------
The affect arc our pipeline emits (affect_extract.py) is an UNVALIDATED a-priori
PROXY: z-scored mean signed activation in an OFC/vmPFC "valence" ROI and mean
|activation| in an insula/ACC "arousal" ROI. It is labeled status="proxy-
hypothesis" everywhere and badged red in the demo. This script asks ONE narrow,
pre-registered question:

    Does that proxy arc track a REAL, public, continuous human affect curve
    (LIRIS-ACCEDE) *within* a video, above an autocorrelation-preserving null —
    and, where a dumb stimulus baseline exists, OVER AND ABOVE that baseline?

A "detect" here means the proxy correlates with human self-reported affect. That
is a NECESSARY Rung-1 step. It is NOT a trained/validated emotion decoder, NOT
proof the model "reads emotion", and the SIGN of z-BOLD is not proven to be the
sign of valence (see affect_extract.py). A NULL is a fully valid, reportable
outcome — this test MAY return null, exactly like the attention arc. Report every
video; never cherry-pick.

METHOD (reuses the audited within-video harness — nothing reimplemented)
------------------------------------------------------------------------
Per video, per dimension (valence, arousal, tested SEPARATELY):
  1. model affect arc:  from arc_<id>.json's affect block (default) OR recomputed
     from preds_<id>.npy via affect_extract.valence_arousal (--recompute).
  2. human affect arc:  liris_<id>.csv (cols t_sec,valence,arousal) via liris_prep.
  3. resample both to a shared 1 s grid, FIRST-DIFFERENCE (removes shared drift),
     keep only contiguous valid bins.
  4. CIRCULAR-SHIFT permutation null (honest_corr_timeseries.circular_shift_p) ->
     the primary p. Enumerates all distinct shifts; honest p floor = 1/(M+1).
  5. IF baseline_<id>.csv exists: PARTIAL circular-shift correlation controlling
     for the dumb audiovisual features (loudness/cuts/luminance/motion), reusing
     incremental_validity.partial_shift_p — so we report BOTH the raw and the
     "over and above stimulus energy" numbers. (Arousal especially is driven by
     loudness/motion; this is the "why not ffmpeg?" check for affect.)
  6. Forest-style table per dimension + Stouffer/Fisher combined p across videos.

USAGE (CPU, local)
------------------
  python affect_validate.py \
      --liris-dir tests/synth --arc-dir tests/synth/arcs \
      --baseline-dir tests/synth/baseline --out validation/affect_results
  # recompute the model arc straight from preds instead of the cached arc JSON:
  python affect_validate.py --recompute --preds-dir tests/synth \
      --valence-mask tests/synth/roi_valence.npy \
      --arousal-mask tests/synth/roi_arousal.npy --liris-dir tests/synth ...

Only hard dependency is numpy. matplotlib is optional (forest plot).
"""
import argparse
import glob
import json
import os
import sys
import zlib

import numpy as np

# Reuse the audited stats/alignment primitives — do NOT reimplement these.
from honest_corr_timeseries import (
    _read_csv, first_diff, circular_shift_p, resample_to_grid,
    _rankdata, pearson, stouffer, fisher, _fmt,
)
from incremental_validity import partial_shift_p
from liris_prep import load_liris, liris_id

DIMS = ("valence", "arousal")
BASE_FEATURES = ("loudness", "cuts", "luminance", "motion")


# -----------------------------------------------------------------------------
# model affect arc sourcing
# -----------------------------------------------------------------------------
def model_affect_from_arc(arc_path):
    """
    Read the per-second model affect arc from arc_<id>.json's affect block.
    Returns (t_sec, valence, arousal) or None if the block is absent/unusable.
    """
    if not os.path.exists(arc_path):
        return None
    try:
        arc = json.load(open(arc_path))
    except Exception:
        return None
    af = arc.get("affect")
    if not af or af.get("valence") is None or af.get("arousal") is None:
        return None
    val = np.asarray(af["valence"], float)
    aro = np.asarray(af["arousal"], float)
    if len(val) == 0 or len(val) != len(aro):
        return None
    # Prefer the arc's own timestamps when they line up; else assume 1 Hz.
    ts = arc.get("timestamps")
    if ts is not None and len(ts) == len(val):
        t = np.asarray(ts, float)
    else:
        fps = float(arc.get("fps_arc") or 1.0) or 1.0
        t = np.arange(len(val), dtype=float) / fps
    return t, val, aro


def model_affect_from_preds(preds_path, val_mask, aro_mask):
    """Recompute the proxy affect arc from cached preds via affect_extract's method."""
    from affect_extract import valence_arousal  # imported lazily; CPU-only
    preds = np.load(preds_path)
    val_z, aro_z = valence_arousal(preds, val_mask, aro_mask)
    t = np.arange(len(val_z), dtype=float)
    return t, np.asarray(val_z, float), np.asarray(aro_z, float)


# -----------------------------------------------------------------------------
# alignment (shared with the baseline partial: same grid, same contiguity rule)
# -----------------------------------------------------------------------------
def align_series(model_t, model_v, human_t, human_v, base_t=None, base_cols=None,
                 grid_sec=1.0):
    """
    Resample model affect + human affect (+ optional baseline features) onto a
    shared grid, first-difference over CONTIGUOUS valid bins (mirrors
    test_one_video: a dropped interior bin must not fake adjacency), and return
    (dm, dh, dF). dF is None when no baseline features are supplied.
    Returns None if too few aligned bins.
    """
    t_hi = min(float(np.max(model_t)), float(np.max(human_t)))
    if base_t is not None and base_cols:
        t_hi = min(t_hi, float(np.max(base_t)))
    if t_hi <= 0:
        return None
    edges = np.arange(0.0, t_hi + grid_sec, grid_sec)
    if len(edges) < 3:
        return None

    m = resample_to_grid(model_t, model_v, edges)
    h = resample_to_grid(human_t, human_v, edges)
    feats = []
    if base_t is not None and base_cols:
        feats = [resample_to_grid(base_t, c, edges) for c in base_cols]

    stack = np.column_stack([m, h] + feats)
    good = ~np.isnan(stack).any(axis=1)
    if int(good.sum()) < 8:
        return None

    keep = good[:-1] & good[1:]
    if int(keep.sum()) < 8:
        return None
    dm = np.diff(np.where(good, m, np.nan))[keep]
    dh = np.diff(np.where(good, h, np.nan))[keep]
    dF = None
    if feats:
        dF = np.column_stack(
            [np.diff(np.where(good, f, np.nan))[keep] for f in feats])
    return dm, dh, dF


# -----------------------------------------------------------------------------
# per-video, per-dimension test
# -----------------------------------------------------------------------------
def test_dimension(model_t, model_v, human_t, human_v, base_t, base_cols,
                   n_perm=5000, seed=0):
    aligned = align_series(model_t, model_v, human_t, human_v,
                           base_t=base_t, base_cols=base_cols)
    if aligned is None:
        return dict(n=0, r=np.nan, p=np.nan, partial_r=np.nan, partial_p=np.nan,
                    has_baseline=bool(base_cols), note="too few aligned bins")
    dm, dh, dF = aligned
    p, r, n = circular_shift_p(dm, dh, n_perm=n_perm, seed=seed)
    partial_r, partial_p = np.nan, np.nan
    if dF is not None and dF.shape[1] > 0:
        partial_p, partial_r = partial_shift_p(dm, dh, dF, n_perm=n_perm)
    return dict(n=n, r=r, p=p, partial_r=partial_r, partial_p=partial_p,
                has_baseline=dF is not None, note="")


# -----------------------------------------------------------------------------
# reporting
# -----------------------------------------------------------------------------
def _verdict(r, p, partial_r, partial_p, has_baseline):
    """Honest, conservative verdict. If a baseline exists it must survive the
    PARTIAL null too, else it's 'baseline-only'."""
    if r is None or np.isnan(r) or p is None or np.isnan(p):
        return "no data"
    detect = (p < 0.05) and (abs(r) > 0.1)
    if not detect:
        return "null"
    if has_baseline and not np.isnan(partial_p):
        if partial_p < 0.05 and abs(partial_r) > 0.1:
            return "tracks (+baseline)"
        return "baseline-only"
    return "tracks (raw)"


def _print_dim_table(dim, rows):
    print(f"\n=== {dim.upper()}  (model affect proxy vs LIRIS human {dim}) ===")
    print(f"{'video':<20}{'n':>4}{'r':>8}{'perm_p':>9}"
          f"{'part_r':>9}{'part_p':>9}   verdict")
    print("-" * 78)
    for r in sorted(rows, key=lambda d: d["video"]):
        print(f"{r['video']:<20}{r['n']:>4}"
              f"{_fmt(r['r']):>8}{_fmt(r['p'], 3):>9}"
              f"{_fmt(r['partial_r']):>9}{_fmt(r['partial_p'], 3):>9}   "
              f"{r['verdict']}")
    ps = [r["p"] for r in rows]
    rs = [r["r"] for r in rows]
    z, pc = stouffer(ps, rs)
    _, pf = fisher(ps)
    med_r = np.nanmedian(rs) if rs else np.nan
    n_detect = sum(1 for r in rows if r["verdict"].startswith("tracks"))
    print(f"  -> {dim.upper()}: {len(rows)} videos | {n_detect} track | "
          f"median r = {_fmt(med_r)} | Stouffer p = {_fmt(pc, 4)} | "
          f"Fisher p = {_fmt(pf, 4)}")


def _write_results(out, all_rows):
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    path = out + ".csv"
    cols = ["video", "dimension", "n", "r", "p", "partial_r", "partial_p",
            "has_baseline", "source", "verdict", "note"]
    with open(path, "w") as f:
        f.write(",".join(cols) + "\n")
        for r in all_rows:
            f.write(",".join(str(r.get(c, "")) for c in cols) + "\n")
    print(f"\n[wrote] {path}")


def _maybe_forest(out, all_rows):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        print("[note] matplotlib not available - skipping forest plot (CSV written).")
        return
    plottable = [r for r in all_rows if not np.isnan(r["r"])]
    if not plottable:
        print("[note] nothing plottable - skipping forest plot.")
        return
    fig, ax = plt.subplots(figsize=(8, max(3, 0.42 * len(plottable) + 1)))
    colors = {"valence": "#8e24aa", "arousal": "#ef6c00"}
    y = 0
    yticks, ylabels = [], []
    for dim in DIMS:
        for r in sorted([x for x in all_rows if x["dimension"] == dim],
                        key=lambda d: d["video"]):
            if np.isnan(r["r"]):
                continue
            ax.plot([r["r"]], [y], "o", color=colors.get(dim, "#333"))
            ax.text(1.02, y, f"p={_fmt(r['p'], 3)}", va="center", fontsize=7,
                    transform=ax.get_yaxis_transform())
            yticks.append(y)
            ylabels.append(f"{r['video'][:16]} [{dim}]")
            y += 1
    ax.axvline(0, color="k", lw=0.8, ls="--", alpha=0.5)
    ax.set_yticks(yticks)
    ax.set_yticklabels(ylabels, fontsize=7)
    ax.set_xlabel("Spearman r (first-differenced, proxy affect vs LIRIS human affect)")
    ax.set_title("Affect Rung-1: proxy arc vs human continuous affect "
                 "(ALL videos; PROXY=unvalidated)")
    fig.tight_layout()
    png = out + "_forest.png"
    fig.savefig(png, dpi=140)
    print(f"[wrote] {png}")


# -----------------------------------------------------------------------------
# main
# -----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--liris-dir", default="tests/synth",
                    help="dir with liris_<id>.csv (cols t_sec,valence,arousal)")
    ap.add_argument("--liris-prefix", default="liris_",
                    help="filename prefix for the LIRIS curves")
    ap.add_argument("--arc-dir", default="tests/synth/arcs",
                    help="dir with arc_<id>.json (affect block source)")
    ap.add_argument("--baseline-dir", default="tests/synth/baseline",
                    help="dir with optional baseline_<id>.csv (stimulus features)")
    ap.add_argument("--recompute", action="store_true",
                    help="recompute affect from preds_<id>.npy instead of arc JSON")
    ap.add_argument("--preds-dir", default="tests/synth",
                    help="dir with preds_<id>.npy (used with --recompute / fallback)")
    ap.add_argument("--valence-mask", default="tests/synth/roi_valence.npy")
    ap.add_argument("--arousal-mask", default="tests/synth/roi_arousal.npy")
    ap.add_argument("--n-perm", type=int, default=5000)
    ap.add_argument("--out", default="validation/affect_results")
    args = ap.parse_args()

    liris_files = sorted(glob.glob(
        os.path.join(args.liris_dir, f"{args.liris_prefix}*.csv")))
    if not liris_files:
        sys.exit(f"No LIRIS curves match "
                 f"{os.path.join(args.liris_dir, args.liris_prefix + '*.csv')!r}. "
                 f"Run liris_prep.py or point --liris-dir/--liris-prefix at them.")

    # masks are needed to recompute affect from preds (via --recompute, or as a
    # fallback when an arc JSON has no usable affect block). Load them if present.
    val_mask = aro_mask = None
    if os.path.exists(args.valence_mask) and os.path.exists(args.arousal_mask):
        val_mask = np.load(args.valence_mask)
        aro_mask = np.load(args.arousal_mask)
    elif args.recompute:
        sys.exit(f"--recompute needs both masks; missing {args.valence_mask} / "
                 f"{args.arousal_mask}")

    print("=" * 78)
    print("AFFECT Rung-1 validation  (proxy valence/arousal arc vs LIRIS continuous;")
    print("first-differenced; circular-shift null; partial-out dumb baseline where "
          "present)")
    print("REMINDER: the affect arc is an UNVALIDATED a-priori PROXY. 'tracks' = a "
          "necessary")
    print("Rung-1 correlation, NOT a validated emotion decoder. NULL is a valid "
          "outcome.")
    print("=" * 78)

    all_rows = []
    dim_rows = {d: [] for d in DIMS}
    for lf in liris_files:
        vid = liris_id(lf)
        try:
            h_t, h_val, h_aro = load_liris(lf)
        except ValueError as e:
            print(f"  [skip] {vid}: {e}")
            continue
        human = {"valence": h_val, "arousal": h_aro}

        # ---- model affect arc (arc JSON by default, preds on --recompute/fallback)
        arc_path = os.path.join(args.arc_dir, f"arc_{vid}.json")
        preds_path = os.path.join(args.preds_dir, f"preds_{vid}.npy")
        m = None
        source = ""
        if not args.recompute:
            m = model_affect_from_arc(arc_path)
            source = "arc-json"
        if m is None and val_mask is not None and os.path.exists(preds_path):
            m = model_affect_from_preds(preds_path, val_mask, aro_mask)
            source = "recomputed"
        if m is None:
            print(f"  [skip] {vid}: no affect arc (no usable arc block at {arc_path} "
                  f"and no preds+masks to recompute)")
            continue
        m_t, m_val, m_aro = m
        model = {"valence": m_val, "arousal": m_aro}

        # ---- optional stimulus-only baseline
        base_path = os.path.join(args.baseline_dir, f"baseline_{vid}.csv")
        base_t, base_cols = None, None
        if os.path.exists(base_path):
            _, bc = _read_csv(base_path)
            if "t_sec" in bc:
                base_t = np.asarray(bc["t_sec"], float)
                base_cols = [bc[k] for k in BASE_FEATURES if k in bc]

        seed = zlib.crc32(vid.encode())
        for dim in DIMS:
            res = test_dimension(m_t, model[dim], h_t, human[dim],
                                 base_t, base_cols, n_perm=args.n_perm, seed=seed)
            res["verdict"] = _verdict(res["r"], res["p"], res["partial_r"],
                                      res["partial_p"], res["has_baseline"])
            res.update(video=vid, dimension=dim, source=source)
            all_rows.append(res)
            dim_rows[dim].append(res)

    if not all_rows:
        sys.exit("No videos produced a result. Check id matching between "
                 "liris_<id>.csv and arc_<id>.json / preds_<id>.npy.")

    for dim in DIMS:
        if dim_rows[dim]:
            _print_dim_table(dim, dim_rows[dim])

    _write_results(args.out, all_rows)
    _maybe_forest(args.out, all_rows)

    print("\nHONEST READ: this validates a PROXY, not a decoder. A 'tracks' row means "
          "the proxy\naffect arc co-moves with human self-reported affect above the "
          "autocorrelation null\n(and, where a baseline exists, above dumb stimulus "
          "energy). Report every row,\nincluding nulls. The synth_null control SHOULD "
          "come back null; if it 'tracks', the\nharness is leaking and the signal rows "
          "cannot be trusted.\n")


if __name__ == "__main__":
    main()
