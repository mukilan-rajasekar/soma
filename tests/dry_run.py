#!/usr/bin/env python3
"""
dry_run.py — run the WHOLE analysis pipeline on synthetic data and assert it
behaves: detects the planted signal, stays quiet on the null control, and every
stage produces well-formed output. No GPU, no real data.

Run:  ./.venv/bin/python tests/make_synthetic_data.py && ./.venv/bin/python tests/dry_run.py

Determinism: this run is reproducible because make_synthetic_data.py builds the
fixtures with seed=42, and here we additionally pin np.random.seed(0), export
PYTHONHASHSEED=0 to every subprocess, and pass explicit --seed 0 to train_head.py.
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SYN = os.path.join(HERE, "synth")
ARCS = os.path.join(SYN, "arcs")
HUMAN = os.path.join(SYN, "human")
PY = sys.executable
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
from check_formats import check_arc_csv, check_arc_json, check_results_csv

FAILS = []
def check(name, cond, detail=""):
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILS.append(name)


def run(cmd):
    # PYTHONHASHSEED=0 pins hash-based ordering in every child process so the run
    # is bit-for-bit reproducible (see the determinism note in the module docstring).
    env = {**os.environ, "PYTHONHASHSEED": "0"}
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT, env=env)
    if r.returncode != 0:
        print("   ! command failed:", " ".join(cmd))
        print(r.stdout[-1500:]); print(r.stderr[-1500:])
    return r


def main():
    np.random.seed(0)  # determinism: pin this process's RNG (see module docstring)
    os.makedirs(ARCS, exist_ok=True)
    man = json.load(open(os.path.join(SYN, "MANIFEST.json")))
    dmn = np.load(os.path.join(SYN, "roi_dmn.npy"))

    print("\n1. tvsum_prep on synthetic .mat")
    run([PY, "tvsum_prep.py", "--mat", os.path.join(SYN, "ydata-tvsum50.mat"),
         "--out", HUMAN, "--shot-sec", "2.0"])
    for v in man["videos"]:
        hp = os.path.join(HUMAN, f"human_arc_{v['id']}.csv")
        check(f"human_arc written ({v['id']})", os.path.exists(hp))

    print("\n2. arc extraction from preds (batch_extract.arc_from_preds)")
    import batch_extract
    for v in man["videos"]:
        preds = np.load(os.path.join(SYN, f"preds_{v['id']}.npy"))
        gmag, rmag = batch_extract.arc_from_preds(preds, dmn)
        with open(os.path.join(ARCS, f"arc_{v['id']}.csv"), "w") as f:
            f.write("t_sec,global_mag,roi_mag\n")
            for t in range(len(gmag)):
                f.write(f"{t},{gmag[t]:.6f},{rmag[t]:.6f}\n")
        # also a demo arc.json so affect_extract has a target
        spots = batch_extract.detect_weak_spots(rmag, fps=1.0)
        batch_extract.write_demo_json(ARCS, v["id"], rmag, spots, "roi")
        check(f"arc shape ({v['id']})", len(gmag) == v["T"], f"T={len(gmag)}")
        # enforce the file-format contracts the demo/report depend on
        check(f"arc csv format ({v['id']})",
              check_arc_csv(os.path.join(ARCS, f"arc_{v['id']}.csv")))
        check(f"arc json format ({v['id']})",
              check_arc_json(os.path.join(ARCS, f"arc_{v['id']}.json")))

    print("\n3. honest_corr_timeseries (the real honesty test)")
    r = run([PY, "honest_corr_timeseries.py", "--model-glob", os.path.join(ARCS, "arc_*.csv"),
             "--human-dir", HUMAN, "--feature", "both", "--n-perm", "3000",
             "--out", os.path.join(SYN, "results")])
    print(r.stdout[-1200:])
    res_path = os.path.join(SYN, "results.csv")
    check("results.csv written", os.path.exists(res_path))
    if os.path.exists(res_path):
        check("results.csv format", check_results_csv(res_path))
        rows = [l.split(",") for l in open(res_path).read().splitlines()[1:]]
        hdr = "video feature n r p p_param n_eff ceiling frac note".split()
        R = [dict(zip(hdr, r)) for r in rows]
        def get(vid, feat, k):
            for x in R:
                if x["video"] == vid and x["feature"] == feat:
                    try: return float(x[k])
                    except: return float("nan")
            return float("nan")
        # signal videos: ROI detected (positive r, small p)
        for vid in ("synth_sig1", "synth_sig2"):
            rr, pp = get(vid, "roi", "r"), get(vid, "roi", "p")
            check(f"signal ROI detected ({vid})", (rr > 0.15 and pp < 0.1), f"r={rr:.2f} p={pp:.3f}")
        # null control: ROI not strongly significant
        rn, pn = get("synth_null", "roi", "r"), get("synth_null", "roi", "p")
        check("null control quiet (ROI)", pn > 0.05 or abs(rn) < 0.2, f"r={rn:.2f} p={pn:.3f}")
        # ROI beats global on signal videos (global is the null-baseline design)
        check("ROI stronger than global (sig1)",
              abs(get("synth_sig1", "roi", "r")) > abs(get("synth_sig1", "global", "r")),
              f"roi={get('synth_sig1','roi','r'):.2f} global={get('synth_sig1','global','r'):.2f}")
        check("forest plot written", os.path.exists(os.path.join(SYN, "results_forest.png")))

    print("\n4. affect_extract (crude valence/arousal proxy)")
    run([PY, "affect_extract.py", "--preds-glob", os.path.join(SYN, "preds_*.npy"),
         "--arc-dir", ARCS, "--valence-mask", os.path.join(SYN, "roi_valence.npy"),
         "--arousal-mask", os.path.join(SYN, "roi_arousal.npy")])
    aj = os.path.join(ARCS, "arc_synth_sig1.json")
    if os.path.exists(aj):
        a = json.load(open(aj))
        af = a.get("affect", {})
        check("affect block written", af.get("status") == "proxy-hypothesis")
        check("valence length matches", len(af.get("valence", [])) == 120)
        check("arousal in range", all(0 <= x <= 1 for x in af.get("arousal", [])))
        # valence proxy should track planted valence latent (VAL block = L-0.5)
        vt = np.array(af.get("valence", []))
        check("valence proxy non-degenerate", vt.std() > 0.02, f"std={vt.std():.3f}")

    print("\n5. check_preds_space (output-space detector)")
    r = run([PY, "check_preds_space.py", os.path.join(SYN, "preds_*.npy"),
             "--arc-dir", ARCS])
    check("preds space = fsaverage5 (exit 0, no unknown)", r.returncode == 0)
    check("classifies fsaverage5-surface", "fsaverage5-surface" in r.stdout)

    print("\n6. liris_prep (synthetic LIRIS -> canonical human_affect_*.csv)")
    LIRIS = os.path.join(SYN, "liris")
    run([PY, "liris_prep.py", "--liris-dir", SYN, "--pattern", "liris_*.csv",
         "--out", LIRIS])
    for v in man["videos"]:
        check(f"human_affect written ({v['id']})",
              os.path.exists(os.path.join(LIRIS, f"human_affect_{v['id']}.csv")))

    print("\n7. affect_validate (proxy affect vs LIRIS; null must NOT leak)")
    afout = os.path.join(SYN, "affect_results")
    r = run([PY, "affect_validate.py", "--liris-dir", SYN, "--arc-dir", ARCS,
             "--baseline-dir", os.path.join(SYN, "baseline"),
             "--n-perm", "3000", "--out", afout])
    print(r.stdout[-900:])
    afcsv = afout + ".csv"
    check("affect_results.csv written", os.path.exists(afcsv))
    if os.path.exists(afcsv):
        rows = [l.split(",") for l in open(afcsv).read().splitlines()[1:]]
        hdr = ("video dimension n r p partial_r partial_p has_baseline "
               "source verdict note").split()
        AR = [dict(zip(hdr, rr)) for rr in rows]
        def af_get(vid, dim, k):
            for x in AR:
                if x["video"] == vid and x["dimension"] == dim:
                    try: return float(x[k])
                    except: return x.get(k, "")
            return None
        # THE honesty check: the null-control video must not "track" on either dim
        for dim in ("valence", "arousal"):
            vd = af_get("synth_null", dim, "verdict")
            check(f"affect null control does NOT leak ({dim})", vd == "null",
                  f"verdict={vd}")
        # planted valence signal should read stronger than the null control's
        rn = af_get("synth_null", "valence", "r")
        r2 = af_get("synth_sig2", "valence", "r")
        if rn is not None and r2 is not None:
            check("affect valence signal > null (sig2)", abs(r2) > abs(rn),
                  f"sig2={r2:.2f} null={rn:.2f}")

    print("\n8. train_head (learned read-out head: recovers signal, control must collapse)")
    import re
    hdout = os.path.join(SYN, "head")
    r = run([PY, "train_head.py", "--preds-dir", SYN, "--arc-dir", ARCS,
             "--human-dir", HUMAN, "--masks-dir", SYN, "--n-perm", "2000",
             "--seed", "0", "--out", hdout])
    print(r.stdout[-700:])
    hcsv = hdout + ".csv"
    check("train_head.csv written", os.path.exists(hcsv))
    if os.path.exists(hcsv):
        # cols: video,n,alpha,r_head,perm_p,r_roi,delta_r,ceiling,frac_of_ceiling
        H = {rr.split(",")[0]: rr.split(",") for rr in open(hcsv).read().splitlines()[1:]}
        def hget(vid, idx):
            try: return float(H[vid][idx])
            except Exception: return None
        p_sig1, p_null = hget("synth_sig1", 4), hget("synth_null", 4)
        check("head RECOVERS planted signal (sig1 perm_p<0.05)",
              p_sig1 is not None and p_sig1 < 0.05, f"perm_p={p_sig1}")
        check("head QUIET on null control (null perm_p>=0.05)",
              p_null is not None and p_null >= 0.05, f"perm_p={p_null}")
    # negative control: shuffled training targets must collapse the across-video aggregate
    rc = run([PY, "train_head.py", "--preds-dir", SYN, "--arc-dir", ARCS,
              "--human-dir", HUMAN, "--masks-dir", SYN, "--n-perm", "2000",
              "--seed", "0", "--shuffle-target"])
    m = re.search(r"Stouffer p = ([0-9.]+)", rc.stdout)
    sp = float(m.group(1)) if m else None
    check("head negative control does NOT leak (shuffled Stouffer p>=0.05)",
          sp is not None and sp >= 0.05, f"Stouffer p={sp}")

    print("\n" + "=" * 60)
    if FAILS:
        print(f"DRY RUN: {len(FAILS)} FAIL(S): {FAILS}")
        sys.exit(1)
    print("DRY RUN: ALL PASS — pipeline plumbing works end-to-end on synthetic data.")


if __name__ == "__main__":
    main()
