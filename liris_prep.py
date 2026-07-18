#!/usr/bin/env python3
"""
liris_prep.py — load LIRIS-ACCEDE *Continuous* per-second valence/arousal into
human_arc-style CSVs (cols: t_sec, valence, arousal) for the affect Rung-1 test.

WHAT THIS IS FOR
----------------
The affect (valence/arousal) arc our pipeline emits is an UNVALIDATED a-priori
PROXY (see affect_extract.py / PREREGISTRATION-affect.md). Rung 1 of validating
it is: does that proxy arc track a REAL, public, continuous human affect curve
*within* a video (n = time)? LIRIS-ACCEDE Continuous is that public curve —
continuous valence & arousal annotated over long movie excerpts. This script is
the loader/normalizer that puts those annotations onto the same per-second,
human_arc-style CSV shape the validator (affect_validate.py) consumes.

TWO INPUT FORMATS
-----------------
1. SYNTHETIC / CANONICAL (supported + smoke-tested now):
     liris_<id>.csv  with columns exactly:  t_sec, valence, arousal
   This is the format under tests/synth/ and the format this script writes.
   `load_liris()` reads it; `main()` re-exports it as human_affect_<id>.csv
   (validated, NaN-dropped, sorted by t_sec).

2. REAL LIRIS-ACCEDE CONTINUOUS (documented plug-in point — wire your download):
   The MediaEval "Emotional Impact of Movies" continuous set ships one text file
   per movie per dimension, e.g.:
       continuous-annotations/<movie>_Valence.txt
       continuous-annotations/<movie>_Arousal.txt
   each a newline/whitespace-separated list of floats sampled at `src_hz`
   (public post-processed release ~1 Hz; older raw traces are per-frame ~25 fps).
   `load_real_liris_continuous(valence_txt, arousal_txt, src_hz=...)` loads both,
   builds a t_sec axis, and resamples to `out_hz` (default 1 Hz to match the
   per-second brain arc). >>> Verify the exact filenames/scale against YOUR
   download before trusting it — layouts differ across the 2015/2016 releases.

The stats downstream are rank-based + first-differenced, so the ABSOLUTE scale of
valence/arousal does not matter (1..5, [-1,1], z-scored all give the same
Spearman). We therefore pass values through unchanged and let affect_validate.py
do the differencing.

USAGE
-----
  # normalize the synthetic LIRIS curves into canonical human_affect_<id>.csv:
  python liris_prep.py --liris-dir tests/synth --pattern "liris_*.csv" \
      --out ./data/liris
"""
import argparse
import glob
import os

import numpy as np

# Reuse the project's tiny CSV reader + grid resampler (no pandas dependency).
from honest_corr_timeseries import _read_csv, resample_to_grid

REQUIRED_COLS = ("t_sec", "valence", "arousal")


def liris_id(path):
    """Shared <id> stem from a liris_<id>.csv / human_affect_<id>.csv path."""
    base = os.path.splitext(os.path.basename(path))[0]
    for pre in ("liris_", "human_affect_", "human_arc_", "arc_"):
        if base.startswith(pre):
            return base[len(pre):]
    return base


def load_liris(path):
    """
    Read a canonical/synthetic LIRIS CSV (cols: t_sec, valence, arousal).
    Returns (t_sec, valence, arousal) as float arrays, sorted by t_sec with any
    NaN rows dropped. Raises ValueError if a required column is missing.
    """
    _, cols = _read_csv(path)
    missing = [c for c in REQUIRED_COLS if c not in cols]
    if missing:
        raise ValueError(
            f"{path}: missing column(s) {missing}; need {','.join(REQUIRED_COLS)}")
    t = np.asarray(cols["t_sec"], float)
    v = np.asarray(cols["valence"], float)
    a = np.asarray(cols["arousal"], float)
    if not (len(t) == len(v) == len(a)):
        raise ValueError(f"{path}: t_sec/valence/arousal length mismatch")
    good = ~(np.isnan(t) | np.isnan(v) | np.isnan(a))
    t, v, a = t[good], v[good], a[good]
    order = np.argsort(t, kind="mergesort")
    return t[order], v[order], a[order]


def load_real_liris_continuous(valence_path, arousal_path, src_hz=1.0, out_hz=1.0):
    """
    PLUG-IN POINT for the real LIRIS-ACCEDE Continuous annotations.

    Loads two plain-text traces (one float per sample at `src_hz`), aligns them to
    a common length, builds t_sec, and resamples to `out_hz` (default 1 Hz to
    match the per-second brain arc). Returns (t_sec, valence, arousal).

    See the module docstring for the expected file layout. This is intentionally
    conservative: whitespace/newline-delimited floats, truncated to the shorter of
    the two dimensions. Adapt the two np.loadtxt calls to your download's exact
    filenames/columns; everything downstream is unchanged.
    """
    v = np.loadtxt(valence_path).ravel().astype(float)
    a = np.loadtxt(arousal_path).ravel().astype(float)
    n = min(len(v), len(a))
    if n == 0:
        raise ValueError("real LIRIS trace is empty")
    v, a = v[:n], a[:n]
    t_src = np.arange(n) / float(src_hz)
    if out_hz == src_hz:
        return t_src, v, a
    dur = float(t_src[-1])
    step = 1.0 / float(out_hz)
    edges = np.arange(0.0, dur + step, step)
    if len(edges) < 2:
        return t_src, v, a
    vv = resample_to_grid(t_src, v, edges)
    aa = resample_to_grid(t_src, a, edges)
    t_out = 0.5 * (edges[:-1] + edges[1:])
    return t_out, vv, aa


def write_human_arc(out_path, t, v, a):
    """Write a canonical human_arc-style affect CSV (cols: t_sec, valence, arousal)."""
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w") as f:
        f.write("t_sec,valence,arousal\n")
        for ti, vi, ai in zip(t, v, a):
            f.write(f"{ti:.3f},{vi:.6f},{ai:.6f}\n")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--liris-dir", default="tests/synth",
                    help="dir containing liris_<id>.csv annotation curves")
    ap.add_argument("--pattern", default="liris_*.csv",
                    help="glob (within --liris-dir) for the LIRIS curves")
    ap.add_argument("--out", default="./data/liris",
                    help="output dir for canonical human_affect_<id>.csv files")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.liris_dir, args.pattern)))
    if not files:
        raise SystemExit(
            f"No LIRIS curves match {os.path.join(args.liris_dir, args.pattern)!r}. "
            f"Point --liris-dir at the folder with liris_<id>.csv (cols t_sec,"
            f"valence,arousal), or wire load_real_liris_continuous() to your "
            f"LIRIS-ACCEDE Continuous download.")

    os.makedirs(args.out, exist_ok=True)
    print(f"{'id':<20}{'n_sec':>7}{'dur_s':>8}   valence[min,max]   arousal[min,max]")
    print("-" * 74)
    n_ok = 0
    for path in files:
        vid = liris_id(path)
        try:
            t, v, a = load_liris(path)
        except ValueError as e:
            print(f"{vid:<20}  [skip] {e}")
            continue
        if len(t) < 2:
            print(f"{vid:<20}  [skip] fewer than 2 valid samples")
            continue
        outp = os.path.join(args.out, f"human_affect_{vid}.csv")
        write_human_arc(outp, t, v, a)
        dur = float(t[-1] - t[0])
        print(f"{vid:<20}{len(t):>7}{dur:>8.1f}   "
              f"[{v.min():+.2f},{v.max():+.2f}]   [{a.min():+.2f},{a.max():+.2f}]")
        n_ok += 1

    print(f"\n[done] wrote {n_ok} canonical affect CSV(s) to {args.out} "
          f"(cols: t_sec,valence,arousal).")
    print("These feed affect_validate.py. NOTE: LIRIS affect is HUMAN self-report; a "
          "correlation\nwith our proxy arc is a Rung-1 necessary check, NOT proof the "
          "model 'reads emotion'.")


if __name__ == "__main__":
    main()
