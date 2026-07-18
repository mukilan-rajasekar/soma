#!/usr/bin/env python3
"""
affect_extract.py — turn cached TRIBE predictions into a CRUDE valence + arousal
arc, and write it into the demo's arc_<id>.json.

READ THIS FIRST — what this is and is NOT:
  This is a Rung-1 PLACEHOLDER, an a-priori PROXY, NOT a trained/validated decoder.
  It reads mean activation in cortical affect-proxy regions:
    valence(t) = z-scored mean SIGNED activation in OFC/vmPFC (Chikazoe 2014 valence code)
    arousal(t) = z-scored mean |activation| in anterior insula + ACC (cortical arousal proxy)
  It is honest ONLY because it is labeled status="proxy-hypothesis" everywhere and the
  demo shows it with a red "hypothesis - not validated" badge. Do NOT present these
  numbers as a result. The real Rung-1 read is a trained decoder validated against
  LIRIS-ACCEDE (see ROADMAP.md / PREREGISTRATION-affect.md).

WHY IT'S USEFUL NOW: it upgrades the demo's affect lanes from hand-drawn illustrative
curves to numbers actually derived from the real brain prediction — same honesty
badge, more real provenance. And it runs on CPU (your laptop) off the cached
preds_<id>.npy — no GPU needed.

SIGN CAVEAT: the sign of z-BOLD is NOT proven to be the sign of valence. Until the
trained decoder validates it, treat direction as unproven. This proxy assumes
higher OFC/vmPFC activation ~ more pleasant, which is a hypothesis, not a fact.

TWO OUTPUT SPACES: this reads whatever space the preds are in (fsaverage5 surface,
n_units=20484, OR Schaefer-1000 parcels, n_units=1000) — it auto-detects the unit
count from the preds and only requires the masks to match that same length. Build
the masks in the matching space with build_roi_mask.py --n-units {20484|1000}. Run
check_preds_space.py first if unsure. Pass --n-units to hard-assert the space.

USAGE (CPU, local — after batch_extract.py cached the preds):
  python build_roi_mask.py --network valence --out ./data/roi_valence.npy
  python build_roi_mask.py --network arousal --out ./data/roi_arousal.npy
  python affect_extract.py --preds-glob "./data/arcs/preds_*.npy" \
      --arc-dir ./data/arcs --valence-mask ./data/roi_valence.npy \
      --arousal-mask ./data/roi_arousal.npy
"""
import argparse
import glob
import json
import os

import numpy as np

# Recognized output spaces (last-dim unit counts). See check_preds_space.py.
FSAVERAGE5_N = 20484   # cortical surface vertices
SCHAEFER1000_N = 1000  # MNI-volume parcels (Schaefer 2018)


def space_name(n_units):
    """Human label for a detected unit count (honest 'unknown' for anything else)."""
    if n_units == FSAVERAGE5_N:
        return "fsaverage5-surface"
    if n_units == SCHAEFER1000_N:
        return "schaefer1000-mni"
    return f"unknown-{n_units}"


def zscore(a):
    a = np.asarray(a, float)
    s = a.std()
    return (a - a.mean()) / s if s > 0 else a * 0.0


def valence_arousal(preds, val_mask, aro_mask):
    """
    (T, n_units) -> per-timestep valence (signed) + arousal (magnitude), z-scored.
    n_units auto-detected from preds; masks must match it (fsaverage5 20484 OR
    Schaefer-1000 1000). Space-agnostic: the reduction is the same either way.
    """
    p = np.asarray(preds, float)
    n_units = p.shape[1]
    vm, am = np.asarray(val_mask, bool), np.asarray(aro_mask, bool)
    if vm.shape[0] != n_units or am.shape[0] != n_units:
        raise ValueError(
            f"mask length != n_units: preds have {n_units} units "
            f"({space_name(n_units)}), but valence-mask={vm.shape[0]}, "
            f"arousal-mask={am.shape[0]}. Rebuild masks in the matching space "
            f"(build_roi_mask.py --n-units {n_units}); run check_preds_space.py first.")
    valence = zscore(p[:, vm].mean(axis=1))          # signed mean in OFC/vmPFC
    arousal_raw = np.abs(p)[:, am].mean(axis=1)       # magnitude in insula/ACC
    # map arousal to 0..1 for display (calm..intense); valence stays ~[-1,1] via z/clip
    arousal = zscore(arousal_raw)
    return valence, arousal


def to_display(valence_z, arousal_z):
    """Clip z-scores to plottable ranges + crude uncertainty bands (wide, honest)."""
    val = np.clip(valence_z / 2.5, -0.9, 0.9)               # ~[-1,1]
    aro = np.clip((arousal_z / 2.5) * 0.5 + 0.5, 0.05, 0.98)  # ~[0,1], centered
    band_v = 0.28   # wide bands: this is an unvalidated proxy
    band_a = 0.25
    return (val, np.clip(val - band_v, -1, 1), np.clip(val + band_v, -1, 1),
            aro, np.clip(aro - band_a, 0, 1), np.clip(aro + band_a, 0, 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-glob", default="./data/arcs/preds_*.npy")
    ap.add_argument("--arc-dir", default="./data/arcs")
    ap.add_argument("--valence-mask", required=True)
    ap.add_argument("--arousal-mask", required=True)
    ap.add_argument("--n-units", type=int, choices=[FSAVERAGE5_N, SCHAEFER1000_N],
                    default=None,
                    help="optional: hard-assert every preds/mask is in this space "
                         f"({FSAVERAGE5_N}=fsaverage5 surface, {SCHAEFER1000_N}="
                         "Schaefer-1000). Default: auto-detect per file, no assert.")
    args = ap.parse_args()

    vm = np.load(args.valence_mask)
    am = np.load(args.arousal_mask)
    if vm.shape[0] != am.shape[0]:
        raise SystemExit(
            f"valence-mask ({vm.shape[0]}) and arousal-mask ({am.shape[0]}) differ in "
            f"length - they must be the same output space. Rebuild both with the same "
            f"build_roi_mask.py --n-units.")
    if args.n_units is not None and vm.shape[0] != args.n_units:
        raise SystemExit(
            f"--n-units {args.n_units} but masks are length {vm.shape[0]} "
            f"({space_name(vm.shape[0])}). Rebuild masks with --n-units {args.n_units}.")
    print(f"[masks] length {vm.shape[0]} -> space {space_name(vm.shape[0])}")

    files = sorted(glob.glob(args.preds_glob))
    if not files:
        raise SystemExit(f"No preds match {args.preds_glob!r}. Run batch_extract.py first.")

    for pf in files:
        vid = os.path.basename(pf)[len("preds_"):-len(".npy")]
        arc_path = os.path.join(args.arc_dir, f"arc_{vid}.json")
        if not os.path.exists(arc_path):
            print(f"  [skip] {vid}: no arc_{vid}.json (run batch_extract.py)")
            continue
        preds = np.load(pf)
        n_units = preds.shape[1]
        if args.n_units is not None and n_units != args.n_units:
            print(f"  [skip] {vid}: preds are {n_units} units "
                  f"({space_name(n_units)}) != --n-units {args.n_units}")
            continue
        val_z, aro_z = valence_arousal(preds, vm, am)
        val, vlo, vhi, aro, alo, ahi = to_display(val_z, aro_z)

        arc = json.load(open(arc_path))
        arc["affect"] = {
            "status": "proxy-hypothesis",   # NOT validated; demo shows red badge
            "method": "a-priori cortical ROI proxy (OFC/vmPFC valence, insula/ACC "
                      "arousal) - NOT a trained/validated decoder; see ROADMAP.md",
            "valence": [round(float(x), 4) for x in val],
            "valence_lo": [round(float(x), 4) for x in vlo],
            "valence_hi": [round(float(x), 4) for x in vhi],
            "arousal": [round(float(x), 4) for x in aro],
            "arousal_lo": [round(float(x), 4) for x in alo],
            "arousal_hi": [round(float(x), 4) for x in ahi],
            "validation": {"dataset": "LIRIS-ACCEDE continuous (planned)",
                           "null": "circular-shift >=5000",
                           "n": None, "r_valence": None, "p_valence": None,
                           "r_arousal": None, "p_arousal": None},
            "coarse_states": None,
        }
        json.dump(arc, open(arc_path, "w"), indent=2)
        print(f"  {vid}: wrote proxy affect ({len(val)} steps, {space_name(n_units)}) "
              f"-> {arc_path}")

    print("\n[done] Affect arcs are an UNVALIDATED a-priori proxy (status=proxy-hypothesis). "
          "The demo already badges them red. Do NOT present as a result.")


if __name__ == "__main__":
    main()
