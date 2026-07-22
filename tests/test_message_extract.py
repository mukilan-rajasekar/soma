#!/usr/bin/env python3
"""
test_message_extract.py — prove the MESSAGE lane (message_extract.py) computes the
semantic-integration-load arc correctly, is shaped right, stays badged as a
HYPOTHESIS, and its display normalization behaves. Runs on synthetic preds + a
synthetic language mask — no nilearn, no atlas fetch, no GPU. Also checks the REAL
data/roi_mask_language.npy IF it has been built (skips cleanly if not).
"""
import json
import os
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import batch_extract as BE
import message_extract as M

FAILS = []
def check(name, cond, detail=""):
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILS.append(name)


def _synth_preds(T=40, n_units=M.FSAVERAGE5_N, roi_slice=slice(0, 500), seed=0):
    """(T, n_units) signed pseudo-BOLD with a planted magnitude BUMP in the ROI band
    at t in [15,25). Returns (preds, mask)."""
    rng = np.random.default_rng(seed)
    preds = rng.normal(0, 0.2, size=(T, n_units)).astype(np.float32)
    preds[15:25, roi_slice] += 3.0            # a strong load bump inside the ROI
    mask = np.zeros(n_units, bool)
    mask[roi_slice] = True
    return preds, mask


def test_arc_shape_and_reuse():
    print("\nsemantic_load_arc: shape + reuses batch_extract.arc_from_preds")
    preds, mask = _synth_preds()
    arc = M.semantic_load_arc(preds, mask)
    check("arc is 1-D length T", arc.shape == (preds.shape[0],), f"{arc.shape}")
    # must be byte-identical to arc_from_preds' roi_mag channel (reuse, not reimplement)
    _g, roi_mag = BE.arc_from_preds(preds, mask)
    check("matches arc_from_preds roi_mag exactly", np.allclose(arc, roi_mag))
    # planted bump must dominate: the ROI-band mean|activation| peaks inside [15,25)
    peak_t = int(np.argmax(arc))
    check("planted load bump is detected as the peak", 15 <= peak_t < 25, f"peak_t={peak_t}")


def test_mask_mismatch_raises():
    print("\nsemantic_load_arc: mask/space mismatch fails loudly")
    preds = np.zeros((5, M.FSAVERAGE5_N), np.float32)
    bad = np.zeros(M.SCHAEFER1000_N, bool)
    try:
        M.semantic_load_arc(preds, bad)
        check("raises on length mismatch", False, "no error raised")
    except ValueError as e:
        check("raises ValueError on length mismatch", "!= n_units" in str(e))


def test_to_display():
    print("\nto_display: within-clip 0..1 normalization")
    preds, mask = _synth_preds()
    arc = M.semantic_load_arc(preds, mask)
    norm = M.to_display(arc)
    check("norm same length", norm.shape == arc.shape, f"{norm.shape}")
    check("norm within [0,1]", float(norm.min()) >= 0.0 and float(norm.max()) <= 1.0,
          f"[{norm.min():.3f},{norm.max():.3f}]")
    check("norm preserves the peak location", int(np.argmax(norm)) == int(np.argmax(arc)))
    # a FLAT arc must collapse to zeros (no forced spread — honest display)
    flat = M.to_display(np.ones(30))
    check("flat arc -> all zeros (no invented dynamics)", np.allclose(flat, 0.0))


def test_payload_badged():
    print("\nbuild_payload: shape doc + HYPOTHESIS badge")
    preds, mask = _synth_preds(T=30)
    arc = M.semantic_load_arc(preds, mask)
    p = M.build_payload("clip_x", arc, M.FSAVERAGE5_N)
    check("status is the hypothesis badge",
          p["status"] == "predicted-semantic-load-hypothesis", p["status"])
    check("lane labeled 'message'", p["lane"] == "message")
    check("method never claims comprehension",
          "NOT measured comprehension" in p["method"])
    check("requires-note flags trimodal dependency", "TRIMODAL" in p["requires"])
    check("space resolved to fsaverage5", p["space"] == "fsaverage5-surface", p["space"])
    check("semantic_load length == T", len(p["semantic_load"]) == 30, str(len(p["semantic_load"])))
    check("raw + display channels both present",
          len(p["semantic_load_raw"]) == 30 and len(p["timestamps"]) == 30)


def test_main_writes_json():
    print("\nmain(): end-to-end write of message_<id>.json off cached preds")
    preds, mask = _synth_preds(T=20)
    with tempfile.TemporaryDirectory() as tmp:
        np.save(os.path.join(tmp, "preds_demo.npy"), preds)
        mask_path = os.path.join(tmp, "mask.npy")
        np.save(mask_path, mask)
        argv = sys.argv
        sys.argv = ["message_extract.py",
                    "--preds-glob", os.path.join(tmp, "preds_*.npy"),
                    "--mask", mask_path, "--out-dir", tmp]
        try:
            M.main()
        finally:
            sys.argv = argv
        out = os.path.join(tmp, "message_demo.json")
        check("message_demo.json written", os.path.exists(out))
        payload = json.load(open(out))
        check("id stripped from preds_<id>.npy", payload["video_id"] == "demo",
              payload["video_id"])
        check("written arc is length T", len(payload["semantic_load"]) == 20)


def test_real_mask_if_present():
    print("\nreal data/roi_mask_language.npy (optional — skips if not built)")
    mask_path = os.path.join(ROOT, "data", "roi_mask_language.npy")
    if not os.path.exists(mask_path):
        print("  [skip] roi_mask_language.npy not built yet (build it with "
              "build_roi_mask.py --network language)")
        return
    m = np.load(mask_path)
    check("real mask is fsaverage5 length", m.shape == (M.FSAVERAGE5_N,), f"{m.shape}")
    check("real mask is boolean", m.dtype == bool, str(m.dtype))
    check("real mask selects a nonempty, non-whole-cortex ROI",
          0 < int(m.sum()) < M.FSAVERAGE5_N, f"{int(m.sum())}/{m.shape[0]}")
    # end-to-end on a real-length synthetic preds so the plumbing is exercised
    preds = np.random.default_rng(1).normal(0, 0.3, size=(12, M.FSAVERAGE5_N)).astype(np.float32)
    arc = M.semantic_load_arc(preds, m)
    check("real-mask arc is length T", arc.shape == (12,), f"{arc.shape}")


def main():
    test_arc_shape_and_reuse()
    test_mask_mismatch_raises()
    test_to_display()
    test_payload_badged()
    test_main_writes_json()
    test_real_mask_if_present()
    if FAILS:
        print(f"\n[test_message_extract] {len(FAILS)} FAIL(S): {FAILS}")
        sys.exit(1)
    print("\n[test_message_extract] PASS — message lane computes semantic-load arc "
          "(reuses arc_from_preds), normalizes for display, stays HYPOTHESIS-badged.")


if __name__ == "__main__":
    main()
