#!/usr/bin/env python3
"""
check_preds_space.py — tell which OUTPUT SPACE a cached preds_*.npy lives in, so
the rest of the pipeline picks the right ROI-mask approach and timebase.

WHY THIS EXISTS (the ambiguity it resolves):
  TRIBE / the Algonauts-2025-winning encoder can emit predictions in TWO spaces,
  and they are NOT interchangeable:

    (A) fsaverage5 CORTICAL SURFACE  -> last dim = 20484 vertices (10242/hemi,
        [lh; rh]). This is what our pipeline (batch_extract.py, build_roi_mask.py
        Destrieux path) ASSUMED. Our arc grid treats each timestep as 1 s.

    (B) Schaefer-1000 MNI VOLUME PARCELS -> last dim = 1000 parcels. This is the
        Algonauts-2025 winner's NATIVE output, sampled at the fMRI TR = 1.49 s
        (~0.671 Hz). ROI masks here must be built from Schaefer parcel -> Yeo-7
        network membership, NOT the Destrieux surface atlas.

  Feeding a 20484-vertex mask to 1000-parcel preds (or vice-versa) silently
  mismatches, so ALWAYS run this first on a fresh batch and follow the printed
  next command.

USAGE:
  python check_preds_space.py tests/synth/preds_synth_sig1.npy
  python check_preds_space.py "./data/arcs/preds_*.npy"      # glob ok
  python check_preds_space.py ./data/arcs/preds_foo.npy --arc-dir ./data/arcs

This script only reads the .npy HEADER (mmap) — it never loads the full array and
needs nothing beyond numpy. It does not modify anything.
"""
import argparse
import glob
import sys

import numpy as np

# Known output spaces. last-dim -> (name, ROI approach, timebase hint).
FSAVERAGE5_N = 20484   # cortical surface vertices (10242 lh + 10242 rh)
SCHAEFER1000_N = 1000  # MNI-volume parcels (Schaefer 2018, 1000 rois)

# The native fMRI repetition time the Algonauts encoder predicts at.
NATIVE_TR_SEC = 1.49


def inspect_shape(path):
    """Return (shape, n_units, T) reading only the npy header (mmap, no full load)."""
    arr = np.load(path, mmap_mode="r")
    shape = tuple(arr.shape)
    if arr.ndim < 2:
        # A 1-D array is ambiguous: could be a single frame or a reduced arc.
        n_units = shape[-1]
        T = None
    else:
        n_units = shape[-1]
        T = shape[0]
    del arr  # close the mmap
    return shape, n_units, T


def classify(n_units):
    """Map the last-dim unit count to a space descriptor. Honest 'unknown' path."""
    if n_units == FSAVERAGE5_N:
        return {
            "space": "fsaverage5-surface",
            "units": "cortical surface vertices ([lh; rh], 10242/hemi)",
            "roi_approach": "Destrieux surface atlas via build_roi_mask.py "
                            "(--n-units 20484, the default)",
            "timebase": "our pipeline treats each timestep as 1 s (fps_arc=1.0). "
                        f"NOTE: native TRIBE fMRI TR is {NATIVE_TR_SEC:g} s — confirm "
                        "these preds were resampled to 1 Hz, don't assume it.",
            "n_units_flag": FSAVERAGE5_N,
            "known": True,
        }
    if n_units == SCHAEFER1000_N:
        return {
            "space": "schaefer1000-mni",
            "units": "MNI-volume parcels (Schaefer 2018, 1000 rois)",
            "roi_approach": "Schaefer-1000 Yeo-7 NETWORK membership via "
                            "build_roi_mask.py --n-units 1000 (documented "
                            "placeholder; crude cortical proxy — read its caveats)",
            "timebase": f"Algonauts-2025 winner NATIVE output: TR = {NATIVE_TR_SEC:g} s "
                        f"(~{1.0/NATIVE_TR_SEC:.3f} Hz). Build per-timestep times as "
                        f"t_sec = i * {NATIVE_TR_SEC:g}, then resample onto the human-arc "
                        "grid (honest_corr_timeseries.resample_to_grid) before "
                        "correlating.",
            "n_units_flag": SCHAEFER1000_N,
            "known": True,
        }
    return {
        "space": "UNKNOWN",
        "units": f"{n_units} units — not 20484 (fsaverage5) nor 1000 (Schaefer-1000)",
        "roi_approach": "UNKNOWN — do not guess a mask. Verify the encoder config "
                        "and atlas before building any ROI.",
        "timebase": "UNKNOWN — verify the sampling rate against the encoder config.",
        "n_units_flag": n_units,
        "known": False,
    }


def next_commands(info, example_preds, arc_dir):
    """The exact next commands to run for this space (surface vs schaefer vs unknown)."""
    n = info["n_units_flag"]
    glob_arg = f'"{arc_dir}/preds_*.npy"'
    if info["space"] == "fsaverage5-surface":
        return [
            f"python build_roi_mask.py --network valence --n-units {n} "
            f"--out ./data/roi_valence.npy",
            f"python build_roi_mask.py --network arousal --n-units {n} "
            f"--out ./data/roi_arousal.npy",
            f"python affect_extract.py --preds-glob {glob_arg} --arc-dir {arc_dir} "
            f"--valence-mask ./data/roi_valence.npy --arousal-mask ./data/roi_arousal.npy",
            "# ROI/attention test: build_roi_mask.py --network dmn --n-units "
            f"{n} --out ./data/roi_mask_dmn.npy  then  honest_corr_timeseries.py",
        ]
    if info["space"] == "schaefer1000-mni":
        return [
            f"python build_roi_mask.py --network valence --n-units {n} "
            f"--out ./data/roi_valence_schaefer.npy   # Yeo-7 Limbic proxy (crude)",
            f"python build_roi_mask.py --network arousal --n-units {n} "
            f"--out ./data/roi_arousal_schaefer.npy   # Yeo-7 SalVentAttn proxy (crude)",
            f"python affect_extract.py --preds-glob {glob_arg} --arc-dir {arc_dir} "
            f"--valence-mask ./data/roi_valence_schaefer.npy "
            f"--arousal-mask ./data/roi_arousal_schaefer.npy --n-units {n}",
            f"# REMEMBER: build the arc timebase as t_sec = i * {NATIVE_TR_SEC:g} "
            "(TR), not i*1s, before honest_corr_timeseries.py.",
        ]
    return [
        "# UNKNOWN space — no safe next command. Verify the encoder output atlas "
        "and re-run this checker once the unit count is one we recognize.",
    ]


def report_one(path, arc_dir):
    try:
        shape, n_units, T = inspect_shape(path)
    except Exception as e:  # noqa: BLE001
        print(f"[{path}] ERROR reading header: {e!r}")
        return False, None
    info = classify(n_units)
    marker = "OK" if info["known"] else "WARN"
    print(f"\n[{marker}] {path}")
    print(f"  shape           : {shape}  (T={T if T is not None else '?'}, "
          f"n_units={n_units})")
    print(f"  output space    : {info['space']}")
    print(f"  units           : {info['units']}")
    print(f"  sampling hint   : {info['timebase']}")
    print(f"  ROI-mask approach: {info['roi_approach']}")
    if not info["known"]:
        print("  >>> Last dim is neither 20484 (fsaverage5 surface) nor 1000 "
              "(Schaefer-1000). Do NOT build a mask until this is resolved.")
    return info["known"], info


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("preds", nargs="+",
                    help="one or more preds_*.npy paths (globs ok, quote them)")
    ap.add_argument("--arc-dir", default="./data/arcs",
                    help="dir used only to compose the printed next command")
    args = ap.parse_args()

    # Expand any globs the shell didn't.
    files = []
    for pat in args.preds:
        matched = sorted(glob.glob(pat))
        files.extend(matched if matched else [pat])
    if not files:
        sys.exit("No preds files given.")

    spaces_seen = {}
    first_info = None
    all_known = True
    for f in files:
        known, info = report_one(f, args.arc_dir)
        if info is not None:
            spaces_seen[info["space"]] = spaces_seen.get(info["space"], 0) + 1
            if first_info is None:
                first_info = info
        all_known = all_known and known

    if len(spaces_seen) > 1:
        print("\n[WARN] MIXED output spaces in this batch: "
              + ", ".join(f"{k}×{v}" for k, v in spaces_seen.items())
              + ". Do NOT mix them in one honest_corr run — split by space first.")

    if first_info is not None and first_info["known"]:
        print("\nNext command(s) for space "
              f"'{first_info['space']}':")
        for cmd in next_commands(first_info, files[0], args.arc_dir):
            print("  " + cmd)

    if not all_known:
        sys.exit(2)  # non-zero so a batch script can catch an unrecognized space


if __name__ == "__main__":
    main()
