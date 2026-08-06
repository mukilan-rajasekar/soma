#!/usr/bin/env python3
"""
check_preds_space.py — read preds_*.npy headers and say which output space they
are in, so a mask is never built against the wrong one.

WHY THIS EXISTS:
  The encoder can emit predictions in either of two spaces, and an ROI mask built
  for one is silent garbage against the other — same code path, same array
  arithmetic, plausible-looking numbers, wrong answer. Six call sites across
  build_roi_mask.py, head_apply.py, affect_extract.py and message_extract.py tell
  you to run this before building or applying a mask. This is that script.

  It reads only the .npy HEADER (mmap, no full load), so it is instant on a
  directory of multi-hundred-MB prediction files.

WHAT IT CHECKS:
  1. The last-dim unit count -> which space (20484 fsaverage5 surface, or 1000
     Schaefer-1000 MNI parcels).
  2. Whether every file agrees. A mixed directory is the dangerous case: it means
     two extraction runs used different configs, and any analysis pooling them is
     comparing different spaces. That exits non-zero.
  3. Whether values look like signed z-scored BOLD (expected) or [0,1]-bounded
     (which means something normalized them and the sign information is gone —
     the same condition demo/process_batch.py gates on as `looksBounded01`).

USAGE:
  .venv/bin/python check_preds_space.py data/ads/arcs/preds_*.npy
  .venv/bin/python check_preds_space.py data/arcs/            # a directory works too

EXIT CODES:
  0  all files agree and the space is recognized
  1  mixed spaces, an unrecognized unit count, or no readable files
"""
import argparse
import glob
import os
import sys

import numpy as np

# Recognized output spaces (last-dim unit counts). Mirrors build_roi_mask.py.
FSAVERAGE5_N = 20484   # cortical surface vertices ([lh; rh], 10242/hemi)
SCHAEFER1000_N = 1000  # MNI-volume parcels (Schaefer 2018, 1000 rois)

SPACE_NAMES = {
    FSAVERAGE5_N: "fsaverage5-surface",
    SCHAEFER1000_N: "schaefer1000-mni",
}


def detect_n_units(preds_path):
    """Read a preds_*.npy header (mmap, no full load) -> last-dim unit count."""
    arr = np.load(preds_path, mmap_mode="r")
    n = int(arr.shape[-1])
    del arr
    return n


def probe(preds_path, sample_rows=8):
    """Header + a small value sample. Returns a dict, or None if unreadable."""
    try:
        arr = np.load(preds_path, mmap_mode="r")
    except Exception as exc:  # noqa: BLE001 - report and keep going
        return {"path": preds_path, "error": str(exc)}

    shape = tuple(int(x) for x in arr.shape)
    n_units = shape[-1]

    # Sample a few rows rather than loading the whole array.
    rows = min(sample_rows, shape[0]) if arr.ndim == 2 else 0
    if rows:
        sample = np.asarray(arr[:rows], dtype=np.float64)
        lo, hi = float(np.nanmin(sample)), float(np.nanmax(sample))
        frac_neg = float(np.mean(sample < 0))
    else:
        lo = hi = frac_neg = float("nan")
    del arr

    return {
        "path": preds_path,
        "shape": shape,
        "n_units": n_units,
        "space": SPACE_NAMES.get(n_units),
        "min": lo,
        "max": hi,
        "frac_neg": frac_neg,
        # Same heuristic demo/process_batch.py records as predsStats.looksBounded01.
        "looks_bounded01": bool(lo >= -1e-6 and hi <= 1.0 + 1e-6) if rows else False,
    }


def expand(paths):
    """Accept files, directories, and unexpanded globs alike."""
    out = []
    for p in paths:
        if os.path.isdir(p):
            out.extend(sorted(glob.glob(os.path.join(p, "*.npy"))))
        elif any(ch in p for ch in "*?["):
            out.extend(sorted(glob.glob(p)))
        else:
            out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("preds", nargs="+",
                    help="preds_*.npy files, globs, or a directory of them")
    ap.add_argument("--quiet", action="store_true",
                    help="only print the verdict line, not per-file rows")
    args = ap.parse_args()

    paths = expand(args.preds)
    if not paths:
        sys.exit("no .npy files matched — check the path")

    results = [probe(p) for p in paths]
    bad = [r for r in results if "error" in r]
    good = [r for r in results if "error" not in r]

    for r in bad:
        print(f"[unreadable] {r['path']}: {r['error']}")
    if not good:
        sys.exit("no readable .npy files")

    if not args.quiet:
        for r in good:
            space = r["space"] or f"UNRECOGNIZED({r['n_units']})"
            flag = "  <-- [0,1]-BOUNDED, sign information is gone" if r["looks_bounded01"] else ""
            print(f"{os.path.basename(r['path']):<44} shape={str(r['shape']):<16} "
                  f"{space:<20} range=[{r['min']:+.3f}, {r['max']:+.3f}] "
                  f"neg={r['frac_neg']:.1%}{flag}")

    counts = sorted({r["n_units"] for r in good})

    if len(counts) > 1:
        print()
        print(f"MIXED SPACES: {counts}. These files came from different extraction "
              f"configs and must NOT be pooled in one analysis.")
        for n in counts:
            members = [os.path.basename(r["path"]) for r in good if r["n_units"] == n]
            label = SPACE_NAMES.get(n, f"UNRECOGNIZED({n})")
            head = ", ".join(members[:4]) + (" ..." if len(members) > 4 else "")
            print(f"  {n:>6} ({label}): {len(members)} file(s) — {head}")
        return 1

    n_units = counts[0]
    space = SPACE_NAMES.get(n_units)
    print()

    if space is None:
        print(f"UNRECOGNIZED SPACE: last dim is {n_units}, expected {FSAVERAGE5_N} "
              f"(fsaverage5 surface) or {SCHAEFER1000_N} (Schaefer-1000).")
        print("Do not build a mask against this until you know what produced it.")
        return 1

    bounded = [r for r in good if r["looks_bounded01"]]
    print(f"SPACE: {space} ({n_units} units) — all {len(good)} file(s) agree.")
    if bounded:
        print(f"WARNING: {len(bounded)} file(s) look [0,1]-bounded. TRIBE emits SIGNED "
              f"z-scored BOLD; bounded values mean something normalized them "
              f"upstream and the sign is gone. Check before trusting any score.")
    print()
    print("Next command — build a mask in this space:")
    print(f"  .venv/bin/python build_roi_mask.py --network dmn \\")
    print(f"      --from-preds {good[0]['path']} \\")
    print(f"      --out ./data/roi_mask_dmn.npy")
    return 0


if __name__ == "__main__":
    sys.exit(main())
