#!/usr/bin/env python3
"""
test_datasets.py — prove the VEATIC + StudyForrest loaders parse their VERIFIED formats
and aggregate correctly, on hand-built fixtures with known answers. No network, no ffmpeg.
"""
import os
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import veatic_prep as V
import studyforrest_prep as S
import studyforrest_film as F

FAILS = []
def check(name, cond, detail=""):
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILS.append(name)


def test_veatic():
    print("\nVEATIC loader")
    check("_parse_ids ranges", V._parse_ids("0,5-8,10") == [0, 5, 6, 7, 8, 10])
    with tempfile.TemporaryDirectory() as tmp:
        rd = os.path.join(tmp, "rating_averaged")
        os.makedirs(rd)
        # split files: [frame_index, value], 50 frames @ 25fps = 2.0s, constant
        with open(os.path.join(rd, "5_valence.csv"), "w") as f:
            for i in range(50):
                f.write(f"{i},0.40\n")
        with open(os.path.join(rd, "5_arousal.csv"), "w") as f:
            for i in range(50):
                f.write(f"{i},-0.20\n")
        val, aro = V.load_va(rd, 5)
        check("split _valence/_arousal parsed", val is not None and len(val) == 50)
        t, v1, a1 = V.to_1hz(val, aro, fps=25.0)
        check("25Hz -> 1Hz mean-pool (2s clip -> 2 rows)", len(t) == 2, f"n={len(t)}")
        check("valence preserved through pooling", abs(float(np.mean(v1)) - 0.40) < 1e-6,
              f"mean={np.mean(v1):.3f}")
        check("arousal preserved", abs(float(np.mean(a1)) + 0.20) < 1e-6)


def test_studyforrest():
    print("\nStudyForrest loader")
    # obs1: POS+HIGH over [0,5); obs2: NEG over [2,7)
    obs1 = [(0.0, 5.0, "HIGH", "POS")]
    obs2 = [(2.0, 7.0, "", "NEG")]
    t, val, aro = S.build_trace([obs1, obs2])
    check("trace length = ceil(max end)", len(t) == 7, f"N={len(t)}")
    # valence(s) = (fracPOS - fracNEG); arousal(s) = (fracHIGH - fracLOW)
    check("valence at s=0 (POS only, 1/2)", abs(val[0] - 0.5) < 1e-9, f"{val[0]}")
    check("valence at s=3 (POS & NEG cancel)", abs(val[3] - 0.0) < 1e-9, f"{val[3]}")
    check("valence at s=5 (NEG only, -1/2)", abs(val[5] + 0.5) < 1e-9, f"{val[5]}")
    check("arousal at s=3 (1 of 2 HIGH)", abs(aro[3] - 0.5) < 1e-9, f"{aro[3]}")
    # arousal-activation mode = fraction(HIGH)
    _, _, aro2 = S.build_trace([obs1, obs2], arousal_activation=True)
    check("arousal-activation = frac(HIGH)", abs(aro2[3] - 0.5) < 1e-9)
    # loader parses the real column layout from a written CSV
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, "av1o01.csv")
        with open(p, "w") as f:
            f.write("start,end,character,arousal,valence,direction,emotion,oncue,offcue\n")
            f.write("192.0,260.0,FORREST,LOW,POS,SELF,,VERBAL,EMOFADED\n")
        rows = S.load_observer(p)
        check("observer CSV parsed (start,end,arousal,valence)",
              rows == [(192.0, 260.0, "LOW", "POS")], f"{rows}")


def test_film_plan():
    print("\nStudyForrest film plan (frame-span math)")
    rows, total = F.plan(src_fps=25.0)
    check("7 spans", len(rows) == 7, f"{len(rows)}")
    check("total ~ 7085.24s (matches annotation grid)", abs(total - 7085.24) < 0.5,
          f"total={total:.2f}")
    check("first span starts at 35/25 = 1.40s", abs(rows[0][1] - 1.40) < 1e-6)
    check("first span dur = (32348-35)/25", abs(rows[0][2] - (32348 - 35) / 25.0) < 1e-6)


def main():
    test_veatic()
    test_studyforrest()
    test_film_plan()
    if FAILS:
        print(f"\n[test_datasets] {len(FAILS)} FAIL(S): {FAILS}")
        sys.exit(1)
    print("\n[test_datasets] PASS — VEATIC + StudyForrest loaders parse + aggregate correctly")


if __name__ == "__main__":
    main()
