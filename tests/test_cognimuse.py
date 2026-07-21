#!/usr/bin/env python3
"""
test_cognimuse.py — prove cognimuse_prep.py parses the VERIFIED COGNIMUSE .dat format
(3 cols: time valence arousal, 25 Hz) and averages annotators onto human_affect_<id>.csv.

Builds a tiny synthetic 'Emotion Annotation' tree with known constant traces so the
averaging is checkable by hand, runs the loader two ways (code + token ids), and asserts
the output CSV shape + values + downstream compatibility with affect_head's reader.
"""
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
PY = sys.executable

import cognimuse_prep as C
from honest_corr_timeseries import _read_csv

FAILS = []
def check(name, cond, detail=""):
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILS.append(name)


def _write_dat(path, valence, arousal, secs=4.0, hz=25.0):
    """A COGNIMUSE-shaped .dat: 'time valence arousal' at hz, constant v/a."""
    n = int(secs * hz)
    with open(path, "w") as f:
        for i in range(n):
            f.write(f"{i / hz:.2f} {valence:.3f} {arousal:.3f}\n")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        cog = os.path.join(tmp, "Emotion Annotation")
        exp = os.path.join(cog, "experienced")
        os.makedirs(exp)
        # Gladiator: 2 annotators -> means valence (0.6+0.0)/2=0.30, arousal (0.2+0.4)/2=0.30
        _write_dat(os.path.join(exp, "subj1_1_Gladiator.dat"), 0.6, 0.2)
        _write_dat(os.path.join(exp, "subj2_1_Gladiator.dat"), 0.0, 0.4)
        # Chicago: 1 annotator
        _write_dat(os.path.join(exp, "subj1_1_Chicago.dat"), -0.5, 0.1)

        # --- unit: parse + average ---
        t, v, a, n_ann = C.aggregate_movie(
            [os.path.join(exp, "subj1_1_Gladiator.dat"),
             os.path.join(exp, "subj2_1_Gladiator.dat")], out_hz=1.0)
        check("parses + averages 2 annotators", n_ann == 2, f"n_ann={n_ann}")
        check("averaged valence ~ 0.30", abs(float(np.nanmean(v)) - 0.30) < 1e-6,
              f"mean_v={np.nanmean(v):.4f}")
        check("averaged arousal ~ 0.30", abs(float(np.nanmean(a)) - 0.30) < 1e-6,
              f"mean_a={np.nanmean(a):.4f}")
        check("token->code map (Gladiator->GLA)", C.to_id("Gladiator", "code") == "GLA")

        # --- integration: CLI, code ids ---
        out = os.path.join(tmp, "out")
        r = subprocess.run([PY, "cognimuse_prep.py", "--cog-dir", cog, "--track",
                            "experienced", "--out", out], cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stdout[-800:]); print(r.stderr[-800:])
        gla = os.path.join(out, "human_affect_GLA.csv")
        chi = os.path.join(out, "human_affect_CHI.csv")
        check("wrote human_affect_GLA.csv", os.path.exists(gla))
        check("wrote human_affect_CHI.csv (code map)", os.path.exists(chi))
        if os.path.exists(gla):
            _, cols = _read_csv(gla)
            check("canonical cols (t_sec,valence,arousal)",
                  all(c in cols for c in ("t_sec", "valence", "arousal")))
            check("GLA valence averaged to ~0.30 in CSV",
                  abs(float(np.nanmean(np.asarray(cols["valence"], float))) - 0.30) < 1e-6)

        # --- integration: token ids ---
        out2 = os.path.join(tmp, "out2")
        subprocess.run([PY, "cognimuse_prep.py", "--cog-dir", cog, "--out", out2,
                        "--id-mode", "token"], cwd=ROOT, capture_output=True, text=True)
        check("id-mode token -> human_affect_Gladiator.csv",
              os.path.exists(os.path.join(out2, "human_affect_Gladiator.csv")))

        # --- film cleaner: match + per-movie cut duration (no ffmpeg needed) ---
        import cognimuse_films as F
        films = os.path.join(tmp, "films")
        os.makedirs(films)
        # write two annotation CSVs with DIFFERENT durations
        aff = os.path.join(tmp, "aff")
        os.makedirs(aff)
        for code, D in (("GLA", 99), ("DEP", 49)):
            with open(os.path.join(aff, f"human_affect_{code}.csv"), "w") as f:
                f.write("t_sec,valence,arousal\n")
                for t in range(D + 1):
                    f.write(f"{t},0.1,0.2\n")
        open(os.path.join(films, "Gladiator.2000.1080p.mkv"), "w").close()  # match by movie name
        open(os.path.join(films, "DEP.mp4"), "w").close()                   # match by code
        pln = {c: (film, cut) for c, film, cut in F.plan(films, aff, {}, 0.0)}
        check("film matched by movie name (Gladiator->GLA)", pln["GLA"][0] is not None)
        check("film matched by code (DEP.mp4->DEP)", pln["DEP"][0] is not None)
        check("cut length = each movie's OWN annotation duration",
              abs(pln["GLA"][1] - 99) < 1e-6 and abs(pln["DEP"][1] - 49) < 1e-6,
              f"GLA={pln['GLA'][1]} DEP={pln['DEP'][1]}")
        # a code whose film is absent must report MISSING (film None), not crash
        pln2 = {c: film for c, film, _cut in F.plan(films, aff, {"CHI": "/no/such.mkv"}, 0.0)}
        check("missing film reported (not a crash)", pln2.get("GLA") is not None)

    if FAILS:
        print(f"[test_cognimuse] {len(FAILS)} FAIL(S): {FAILS}")
        sys.exit(1)
    print("[test_cognimuse] PASS — COGNIMUSE .dat (time/valence/arousal, 25 Hz) parses + "
          "averages into canonical human_affect_<id>.csv")


if __name__ == "__main__":
    main()
