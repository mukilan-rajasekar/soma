#!/usr/bin/env python3
"""
message_extract.py — the MESSAGE lane. Turn cached TRIBE predictions into a
per-second "semantic-integration load" arc by reading mean |activation| inside the
a-priori LANGUAGE / semantic-association ROI (build_roi_mask.py --network language:
IFG/Broca + anterior temporal + STS + pMTG + angular gyrus).

READ THIS FIRST — what this is and is NOT (the honesty line is absolute):
  This is the "message lane": predicted SEMANTIC-INTEGRATION LOAD over time — how
  hard the language/semantic system is predicted to be working second-by-second.
  It is a HYPOTHESIS, badged status="predicted-semantic-load-hypothesis"
  everywhere. It is NEVER "the viewer understood the message" / "the message
  landed" — no comprehension validation exists yet (there is no held-out human
  comprehension dataset wired in). Do NOT present these numbers as a measured
  result. Treat direction and magnitude as unproven until a comprehension read is
  validated (analogous to affect_extract.py's Rung-1 proxy discipline).

WHAT DRIVES IT — the TEXT branch matters:
  The language ROI is lit up primarily by TRIBE's TRIMODAL text branch
  (audio+video+TEXT; see TRIMODAL.md). On AV-ONLY preds (no text branch) this
  extractor still RUNS and is correctly shaped, but the language-ROI signal is
  under-driven — that run is a PLUMBING / SHAPE demo, not the intended message
  signal. The output records the caveat so nobody mistakes an AV-only arc for the
  real message lane. Re-extract with `batch_extract.py --modality trimodal` for the
  intended read.

REUSE + SPACE-AGNOSTIC:
  The per-second reduction reuses batch_extract.arc_from_preds (the same magnitude
  arithmetic the attention lane uses — |preds|, no signed threshold, so the z-BOLD
  scale bug can't resurface). It reads whatever space the preds are in and only
  requires the --mask to match that length (fsaverage5 20484 OR Schaefer-1000 1000;
  build the mask with build_roi_mask.py --network language --n-units {20484|1000}).

USAGE (CPU, local — after batch_extract.py cached the preds):
  python build_roi_mask.py --network language --out ./data/roi_mask_language.npy
  python message_extract.py --preds-glob "./data/ads/arcs/preds_*.npy" \
      --mask ./data/roi_mask_language.npy --out-dir ./data/ads/arcs
  # optionally also merge a "message" block into existing demo arc_<id>.json:
  python message_extract.py --preds-glob "./data/arcs/preds_*.npy" \
      --mask ./data/roi_mask_language.npy --out-dir ./data/arcs --arc-dir ./data/arcs
"""
import argparse
import glob
import json
import os

import numpy as np

import batch_extract  # reuse arc_from_preds (top-level import is GPU-free)

# Recognized output spaces (last-dim unit counts). See check_preds_space.py.
FSAVERAGE5_N = 20484   # cortical surface vertices
SCHAEFER1000_N = 1000  # MNI-volume parcels (Schaefer 2018)

# The badge every downstream consumer keys off. It is a HYPOTHESIS, never a result.
STATUS = "predicted-semantic-load-hypothesis"
METHOD = ("mean |activation| in the a-priori LANGUAGE/semantic ROI (IFG/Broca, "
          "anterior temporal, STS, pMTG, angular gyrus) — predicted SEMANTIC-"
          "INTEGRATION LOAD, NOT measured comprehension; no comprehension "
          "validation exists yet (see message_extract.py / ROADMAP.md)")

# Within-clip display normalization percentiles (byte-identical to
# batch_extract.write_demo_json so the message lane renders on the same footing as
# the attention lane). Display-only: touches no analysis/validation path.
DISPLAY_LO_PCT = 2
DISPLAY_HI_PCT = 98


def space_name(n_units):
    """Human label for a detected unit count (honest 'unknown' for anything else)."""
    if n_units == FSAVERAGE5_N:
        return "fsaverage5-surface"
    if n_units == SCHAEFER1000_N:
        return "schaefer1000-mni"
    return f"unknown-{n_units}"


def semantic_load_arc(preds, lang_mask):
    """
    (T, n_units) -> per-second semantic-integration-load arc (raw mean |activation|
    inside the language ROI). Reuses batch_extract.arc_from_preds and returns its
    roi_mag channel; the mask must match the preds' unit count.
    """
    p = np.asarray(preds, float)
    m = np.asarray(lang_mask, bool)
    if m.shape[0] != p.shape[1]:
        raise ValueError(
            f"language mask length {m.shape[0]} != n_units {p.shape[1]} "
            f"({space_name(p.shape[1])}). Rebuild the mask in the matching space: "
            f"build_roi_mask.py --network language --n-units {p.shape[1]}.")
    _global_mag, roi_mag = batch_extract.arc_from_preds(p, m)
    return roi_mag


def to_display(arc, lo_pct=DISPLAY_LO_PCT, hi_pct=DISPLAY_HI_PCT):
    """Within-clip normalize a raw arc to 0..1 for display (robust 2/98 percentiles).

    Display-only for an UNVALIDATED hypothesis lane. A flat arc collapses to zeros
    (no forced spread). Same transform batch_extract.write_demo_json uses.
    """
    a = np.asarray(arc, float)
    if a.size == 0:
        return a
    lo, hi = np.percentile(a, lo_pct), np.percentile(a, hi_pct)
    return np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)


def build_payload(vid, raw_arc, n_units, fps=1.0):
    """Assemble the badged, demo-ready message-lane json payload for one clip."""
    raw = np.asarray(raw_arc, float)
    norm = to_display(raw)
    return {
        "schema_version": "1.0",
        "video_id": vid,
        "lane": "message",
        "status": STATUS,                    # HYPOTHESIS badge — NOT a result
        "method": METHOD,
        "requires": ("TRIMODAL preds (audio+video+TEXT) for the intended signal; on "
                     "AV-only preds this is a plumbing/shape demo, not the message "
                     "lane — re-extract with batch_extract.py --modality trimodal"),
        "space": space_name(n_units),
        "fps_arc": fps,
        "duration_sec": round(len(raw) / fps, 2),
        "timestamps": [round(i / fps, 2) for i in range(len(raw))],
        "semantic_load_raw": [round(float(x), 6) for x in raw],
        "semantic_load": [round(float(x), 4) for x in norm],   # within-clip 0..1
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-glob", default="./data/ads/arcs/preds_*.npy")
    ap.add_argument("--mask", default="./data/roi_mask_language.npy",
                    help="boolean .npy language ROI from build_roi_mask.py "
                         "--network language (length must match the preds space)")
    ap.add_argument("--out-dir", default="./data/ads/arcs",
                    help="where to write message_<id>.json")
    ap.add_argument("--arc-dir", default=None,
                    help="optional: also merge a 'message' block into an existing "
                         "arc_<id>.json here (skips ids with no arc json)")
    ap.add_argument("--n-units", type=int, choices=[FSAVERAGE5_N, SCHAEFER1000_N],
                    default=None,
                    help="optional: hard-assert every preds/mask is in this space "
                         "(default: auto-detect per file, no assert)")
    args = ap.parse_args()

    if not os.path.exists(args.mask):
        raise SystemExit(
            f"language mask {args.mask!r} not found. Build it first:\n"
            f"  python build_roi_mask.py --network language --out {args.mask}\n"
            f"(or the ready-to-paste Colab cell in the message-lane docs if nilearn "
            f"is unavailable locally).")
    mask = np.load(args.mask)
    if args.n_units is not None and mask.shape[0] != args.n_units:
        raise SystemExit(
            f"--n-units {args.n_units} but mask is length {mask.shape[0]} "
            f"({space_name(mask.shape[0])}). Rebuild with "
            f"build_roi_mask.py --network language --n-units {args.n_units}.")
    print(f"[mask] language ROI length {mask.shape[0]} -> {space_name(mask.shape[0])} "
          f"({int(mask.sum())} units, {mask.mean():.1%} of cortex)")

    files = sorted(glob.glob(args.preds_glob))
    if not files:
        raise SystemExit(f"No preds match {args.preds_glob!r}. Run batch_extract.py first.")
    os.makedirs(args.out_dir, exist_ok=True)

    n_ok = 0
    for pf in files:
        base = os.path.basename(pf)
        vid = base[len("preds_"):-len(".npy")] if base.startswith("preds_") \
            else os.path.splitext(base)[0]
        preds = np.load(pf)
        n_units = preds.shape[1]
        if args.n_units is not None and n_units != args.n_units:
            print(f"  [skip] {vid}: preds are {n_units} units "
                  f"({space_name(n_units)}) != --n-units {args.n_units}")
            continue
        if mask.shape[0] != n_units:
            print(f"  [skip] {vid}: mask length {mask.shape[0]} != preds units "
                  f"{n_units} ({space_name(n_units)})")
            continue

        raw = semantic_load_arc(preds, mask)
        payload = build_payload(vid, raw, n_units)
        out_path = os.path.join(args.out_dir, f"message_{vid}.json")
        with open(out_path, "w") as f:
            json.dump(payload, f, indent=2)

        merged = ""
        if args.arc_dir:
            arc_path = os.path.join(args.arc_dir, f"arc_{vid}.json")
            if os.path.exists(arc_path):
                arc = json.load(open(arc_path))
                # The site's Arc type (src/lib/types/arc.ts) and every shipped arc
                # (e.g. public/arcs/real_meta12.json) expect `message` to be a FLAT
                # number[] — arc-draw.ts reads `const seq = arc.message`. Writing an
                # object here silently rendered an empty message lane. Keep the flat
                # display array on `message`; park the honesty metadata on a sibling.
                arc["message"] = payload["semantic_load"]          # flat 0..1 number[]
                arc["message_meta"] = {k: payload[k] for k in
                                       ("status", "method", "requires", "space",
                                        "semantic_load_raw")}
                json.dump(arc, open(arc_path, "w"), indent=2)
                merged = f" + merged into arc_{vid}.json"
            else:
                merged = f" (no arc_{vid}.json to merge)"
        print(f"  {vid}: message lane {len(raw)} steps ({space_name(n_units)}) "
              f"-> {out_path}{merged}")
        n_ok += 1

    print(f"\n[done] {n_ok} message-lane arc(s). status={STATUS!r} — a HYPOTHESIS "
          f"(predicted semantic-integration LOAD), NOT measured comprehension. "
          f"Badge it; never claim the viewer understood the message.")


if __name__ == "__main__":
    main()
