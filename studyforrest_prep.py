#!/usr/bin/env python3
"""
studyforrest_prep.py — StudyForrest "portrayed emotions" annotations -> canonical
human_affect_<id>.csv (t_sec, valence, arousal) at 1 Hz over the research-cut timeline.

WHY THIS EXISTS
---------------
StudyForrest is the BRAIN-TRUTH rung above COGNIMUSE: real 7T fMRI of people watching
Forrest Gump PLUS continuous emotion annotations, independent of what TRIBE was trained on.
This builds the human affect trace; pair it with the film cut (studyforrest_film.py) so
TRIBE scores the same stimulus, then validate the affect head against it — and separately
against the real fMRI (a later build).

VERIFIED FORMAT (read from the real repo files)
-----------------------------------------------
Source: psychoinformatics-de/studyforrest-paper-emotionannotation, data/raw/<obs>.csv —
one file per OBSERVER. AV (audio-visual) variant = 9 observers (av1o01..av1o09); AO
(audio-only) = 3 (ao1o01..ao1o03). Columns (with header):
    start,end,character,arousal,valence,direction,emotion,oncue,offcue
  - start/end: seconds on the research-cut movie timeline (event-based, sparse).
  - arousal in {HIGH, LOW, ""};  valence in {POS, NEG, ""}  (POS/NEG are NON-exclusive).

AGGREGATION (matches studyforrest's own slice2segments, no threshold — the dense trace):
  for each second s and observer o: pos_o=1 if o has any active POS episode at s (else 0),
  and neg_o/high_o/low_o likewise. Then across the n observers:
    valence(s) = (Σ pos − Σ neg) / n     in [-1, 1]   (fraction POS minus fraction NEG)
    arousal(s) = (Σ high − Σ low) / n     in [-1, 1]   (SIGNED: + excited, − calm)
  Seconds nobody marked -> 0 (neutral). --arousal-activation gives Σhigh/n (0..1) instead.

HONESTY
-------
- These are PORTRAYED (depicted) emotions judged by observers, not the scanned viewers'
  felt affect — a Rung-1+ proxy, and the honest headline of StudyForrest is the *fMRI*
  (video->brain) check, not this trace alone.
- The annotation timeline is the German "research cut" (~7086 s); it aligns to the movie
  cut studyforrest_film.py produces, NOT a stock Blu-ray. Downstream stats are rank-based
  + first-differenced, so the valence/arousal scale is irrelevant.

USAGE
-----
  # from already-downloaded raw observer files:
  python studyforrest_prep.py --raw-dir data/studyforrest_raw --out data/studyforrest
  # fetch the 9 AV observer files from GitHub first:
  python studyforrest_prep.py --download --raw-dir data/studyforrest_raw --out data/studyforrest
"""
import argparse
import csv
import glob
import os
import urllib.request

import numpy as np

from liris_prep import write_human_arc

RAW_BASE = ("https://raw.githubusercontent.com/psychoinformatics-de/"
            "studyforrest-paper-emotionannotation/master/data/raw")
OBSERVERS = {"av": [f"av1o{n:02d}" for n in range(1, 10)],   # 9 audio-visual observers
             "ao": [f"ao1o{n:02d}" for n in range(1, 4)]}    # 3 audio-only observers


def download_raw(raw_dir, variant):
    os.makedirs(raw_dir, exist_ok=True)
    got = 0
    for obs in OBSERVERS[variant]:
        dst = os.path.join(raw_dir, f"{obs}.csv")
        if os.path.exists(dst):
            got += 1
            continue
        try:
            urllib.request.urlretrieve(f"{RAW_BASE}/{obs}.csv", dst)
            got += 1
        except Exception as e:                              # network/URL issues -> tell them
            print(f"  [warn] could not fetch {obs}.csv: {e}")
    print(f"[download] {got}/{len(OBSERVERS[variant])} {variant.upper()} observer files in {raw_dir}")
    return got


def load_observer(path):
    """One observer CSV -> list of (start, end, arousal, valence) with categorical labels."""
    out = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                s, e = float(r["start"]), float(r["end"])
            except (KeyError, ValueError, TypeError):
                continue
            if e <= s:
                continue
            out.append((s, e, (r.get("arousal") or "").strip().upper(),
                        (r.get("valence") or "").strip().upper()))
    return out


def build_trace(observer_events, arousal_activation=False):
    """Aggregate observers -> (t_sec, valence, arousal) dense 1 Hz arrays."""
    n = len(observer_events)
    if n == 0:
        raise ValueError("no observer files")
    N = 1
    for evs in observer_events:
        for s, e, _a, _v in evs:
            N = max(N, int(np.ceil(e)))
    POS = np.zeros(N); NEG = np.zeros(N); HIGH = np.zeros(N); LOW = np.zeros(N)
    for evs in observer_events:
        p = np.zeros(N); q = np.zeros(N); h = np.zeros(N); l = np.zeros(N)
        for s, e, a, v in evs:
            sl = slice(max(0, int(np.floor(s))), min(N, int(np.ceil(e))))
            if v == "POS":
                p[sl] = 1.0
            elif v == "NEG":
                q[sl] = 1.0
            if a == "HIGH":
                h[sl] = 1.0
            elif a == "LOW":
                l[sl] = 1.0
        POS += p; NEG += q; HIGH += h; LOW += l
    valence = (POS - NEG) / n
    arousal = (HIGH / n) if arousal_activation else ((HIGH - LOW) / n)
    return np.arange(N, dtype=float), valence, arousal


def _smooth(x, win):
    if win and win > 1:
        k = np.ones(int(win)) / float(int(win))
        return np.convolve(x, k, mode="same")
    return x


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw-dir", default="data/studyforrest_raw",
                    help="dir with per-observer <obs>.csv files")
    ap.add_argument("--download", action="store_true",
                    help="fetch the observer files from GitHub into --raw-dir first")
    ap.add_argument("--variant", choices=["av", "ao"], default="av",
                    help="av = 9 audio-visual observers (default); ao = 3 audio-only")
    ap.add_argument("--out", default="data/studyforrest",
                    help="output dir for human_affect_<id>.csv")
    ap.add_argument("--id", default="forrestgump", help="output <id> stem")
    ap.add_argument("--arousal-activation", action="store_true",
                    help="arousal = fraction(HIGH) in 0..1 instead of signed (HIGH-LOW)")
    ap.add_argument("--smooth-sec", type=int, default=0,
                    help="optional rolling-mean smoothing window in seconds (default 0 = raw)")
    args = ap.parse_args()
    args.raw_dir = os.path.expanduser(args.raw_dir)
    args.out = os.path.expanduser(args.out)

    if args.download:
        download_raw(args.raw_dir, args.variant)

    files = sorted(os.path.join(args.raw_dir, f"{o}.csv") for o in OBSERVERS[args.variant]
                   if os.path.exists(os.path.join(args.raw_dir, f"{o}.csv")))
    if not files:
        files = sorted(glob.glob(os.path.join(args.raw_dir, f"{args.variant}1o*.csv")))
    if not files:
        raise SystemExit(f"No {args.variant} observer CSVs in {args.raw_dir}. Use --download, "
                         "or clone psychoinformatics-de/studyforrest-paper-emotionannotation.")

    events = [load_observer(f) for f in files]
    t, val, aro = build_trace(events, args.arousal_activation)
    val, aro = _smooth(val, args.smooth_sec), _smooth(aro, args.smooth_sec)

    os.makedirs(args.out, exist_ok=True)
    outp = os.path.join(args.out, f"human_affect_{args.id}.csv")
    write_human_arc(outp, t, val, aro)
    nz = int(np.sum((val != 0) | (aro != 0)))
    print(f"[done] {len(files)} {args.variant.upper()} observers -> {outp}")
    print(f"       {len(t)}s trace ({len(t)/60:.1f} min) | {nz} non-neutral seconds "
          f"({100*nz/len(t):.0f}%) | valence[{val.min():+.2f},{val.max():+.2f}] "
          f"arousal[{aro.min():+.2f},{aro.max():+.2f}]")
    print("Reminder: PORTRAYED emotion (observer-judged), aligned to the research-cut "
          "timeline. Pair with studyforrest_film.py so TRIBE scores the same stimulus.")


if __name__ == "__main__":
    main()
