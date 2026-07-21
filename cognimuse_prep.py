#!/usr/bin/env python3
"""
cognimuse_prep.py — load COGNIMUSE continuous valence/arousal into canonical
human_affect_<id>.csv (cols: t_sec, valence, arousal) for the affect head / Rung-1 test.

WHY THIS EXISTS
---------------
LIRIS-ACCEDE (the ideal target) needs a slow institutional-email EULA that rejects Gmail.
COGNIMUSE is the fast, correct substitute: continuous human valence+arousal annotated ON a
naturalistic movie stimulus — the SAME quantity LIRIS gives and the same construct our
proxy/affect-head must track. This loader normalizes COGNIMUSE's per-frame .dat traces onto
the same per-second human_affect_<id>.csv shape affect_head.py / affect_validate.py consume.

VERIFIED COGNIMUSE FORMAT (checked against the real download's README + raw .dat bytes)
---------------------------------------------------------------------------------------
- Files live under `Emotion Annotation/{experienced,intended}/<name>.dat`, plain text.
- Each line is THREE whitespace-separated columns:  time  valence  arousal
  (col1 = seconds, col2 = valence, col3 = arousal). Both dims are in ONE file.
- Sampling: 25 Hz (40 ms/frame). Values in [-1, 1] for both dimensions.
- Two tracks, and the DISTINCTION MATTERS for us:
    experienced/  subj<N>_<iter>_<Movie>.dat  = viewers' FELT emotion watching the film.
                  This is VIEWER-INDUCED affect -> the correct target for a viewer-brain
                  proxy (TRIBE predicts the viewer's response). DEFAULT track.
    intended/     intended_<1..3>_<Movie>.dat = one author's read of the director's intent.
                  A different construct; available via --track intended for comparison.
- Several annotators per movie -> we AVERAGE them onto a common 1 Hz grid (the mean human
  affect curve). Movie tokens seen: BeautifulMind, Chicago, Crash, FindingNemo, Gladiator,
  LOTRReturn, TheDeparted, AmericanBeauty, MDB, NoCountry, Ratatouille, ShakespeareInLove.

HONESTY
-------
- COGNIMUSE affect is HUMAN self-report (felt emotion). A correlation between it and our
  proxy/head arc is a Rung-1 NECESSARY check within a movie (n = time), NOT proof the model
  "reads emotion". Report every movie, including a null.
- The downstream stats are rank-based + first-differenced, so the ABSOLUTE scale of
  valence/arousal is irrelevant ([-1,1] passes through unchanged). We do NOT peak-normalize
  or lag-correct here (the README flags a 2-3 s FeelTrace mouse lag) — kept honest/simple;
  those are deliberate, documented non-steps, not silent ones.
- COGNIMUSE ships ANNOTATIONS ONLY (no movie pixels), "All rights reserved", cite Zlatintsi
  et al. 2017 (DOI 10.1186/s13640-017-0194-1). You must source the films legitimately
  yourself to feed TRIBE. Not CC0 — confirm reuse terms with the authors.

USAGE
-----
  # point --cog-dir at the extracted "Emotion Annotation" folder (it has experienced/ &
  # intended/ subdirs); writes human_affect_<CODE>.csv for each movie:
  python cognimuse_prep.py --cog-dir "path/to/Emotion Annotation" --out data/cognimuse
  # director-intent track instead, keep raw movie tokens as ids:
  python cognimuse_prep.py --cog-dir ... --track intended --id-mode token --out data/cognimuse
"""
import argparse
import glob
import os

import numpy as np

# reuse the project's grid resampler + the canonical affect-CSV writer (no pandas dep)
from honest_corr_timeseries import resample_to_grid
from liris_prep import write_human_arc

# COGNIMUSE 7 "core" ~30-min clips: movie token -> the paper's 3-letter code (verified).
CODE = {
    "BeautifulMind": "BMI", "Chicago": "CHI", "Crash": "CRA", "TheDeparted": "DEP",
    "Gladiator": "GLA", "LOTRReturn": "LOR", "FindingNemo": "FNE",
}
SRC_HZ = 25.0   # 40 ms/frame (documented + verified in the raw .dat time column)


def parse_dat(path):
    """One COGNIMUSE .dat -> (t_sec, valence, arousal) float arrays. 3 whitespace cols."""
    arr = np.loadtxt(path)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    if arr.shape[1] < 3:
        raise ValueError(f"{path}: expected 3 cols (time valence arousal), got {arr.shape[1]}")
    return arr[:, 0].astype(float), arr[:, 1].astype(float), arr[:, 2].astype(float)


def movie_token(path):
    """intended_1_Gladiator.dat / subj3_2_TheDeparted.dat -> 'Gladiator' / 'TheDeparted'.
    (Movie tokens are camelCase with no underscores, so the last _-field is the movie.)"""
    return os.path.splitext(os.path.basename(path))[0].split("_")[-1]


def to_id(token, id_mode):
    """Map a movie token to the output <id> (CODE like GLA by default; raw token if asked
    or if the token isn't one of the 7 core clips)."""
    if id_mode == "token":
        return token
    return CODE.get(token, token)


def _track_dir(cog_dir, track):
    """Accept either the parent 'Emotion Annotation' dir (has experienced/ intended/) or a
    dir already pointed at the track's files."""
    cand = os.path.join(cog_dir, track)
    return cand if os.path.isdir(cand) else cog_dir


def _track_files(tdir, track):
    """.dat files for this track (prefix-filtered so a flat mixed dir also works)."""
    prefix = "subj" if track == "experienced" else "intended"
    return sorted(f for f in glob.glob(os.path.join(tdir, "*.dat"))
                  if os.path.basename(f).startswith(prefix))


def aggregate_movie(files, out_hz=1.0):
    """Average N annotators' traces for one movie onto a common out_hz grid.
    Returns (t_out, valence, arousal, n_annotators). Uses the SHORTEST annotator length as
    the shared duration so every second is covered by every annotator (README: clip the
    extra few ms)."""
    parsed = [parse_dat(f) for f in files]
    parsed = [(t, v, a) for (t, v, a) in parsed if len(t) >= 2]
    if not parsed:
        raise ValueError("no usable annotator traces")
    dur = min(float(t[-1]) for t, _v, _a in parsed)
    step = 1.0 / float(out_hz)
    edges = np.arange(0.0, dur + step, step)
    if len(edges) < 2:
        raise ValueError(f"movie too short ({dur:.1f}s) for a {out_hz} Hz grid")
    t_out = 0.5 * (edges[:-1] + edges[1:])
    Vs = np.vstack([resample_to_grid(t, v, edges) for t, v, _a in parsed])
    As = np.vstack([resample_to_grid(t, _a, edges) for t, _v, _a in parsed])
    # nanmean across annotators (a bin any annotator missed just averages the rest)
    return t_out, np.nanmean(Vs, axis=0), np.nanmean(As, axis=0), len(parsed)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cog-dir", required=True,
                    help="extracted 'Emotion Annotation' dir (has experienced/ & intended/), "
                         "or a dir already holding the .dat files")
    ap.add_argument("--track", choices=["experienced", "intended"], default="experienced",
                    help="experienced = viewers' felt emotion (correct target; default); "
                         "intended = director's-intent track")
    ap.add_argument("--out", default="data/cognimuse",
                    help="output dir for canonical human_affect_<id>.csv files")
    ap.add_argument("--out-hz", type=float, default=1.0,
                    help="output sampling rate (default 1 Hz to match the per-second brain arc)")
    ap.add_argument("--id-mode", choices=["code", "token"], default="code",
                    help="code = map to the paper's 3-letter clip code (GLA, DEP, ...); "
                         "token = keep the raw movie token")
    ap.add_argument("--movies", default=None,
                    help="optional comma-separated filter of movie tokens or codes to keep")
    args = ap.parse_args()
    args.cog_dir = os.path.expanduser(args.cog_dir)
    args.out = os.path.expanduser(args.out)

    tdir = _track_dir(args.cog_dir, args.track)
    files = _track_files(tdir, args.track)
    if not files:
        raise SystemExit(
            f"No {args.track} .dat files under {tdir!r}. Point --cog-dir at the extracted "
            "'Emotion Annotation' folder (it contains experienced/ and intended/). See the "
            "walkthrough for downloading COGNIMUSEdatabase_v0.1.zip.")

    # group annotator files by movie
    by_movie = {}
    for f in files:
        by_movie.setdefault(movie_token(f), []).append(f)

    keep = None
    if args.movies:
        keep = {m.strip() for m in args.movies.split(",") if m.strip()}

    os.makedirs(args.out, exist_ok=True)
    print(f"COGNIMUSE {args.track} track: {len(files)} annotator file(s), "
          f"{len(by_movie)} movie(s) -> {args.out}")
    print(f"{'id':<8}{'token':<18}{'annot':>6}{'n_sec':>7}{'dur_s':>8}   "
          f"val[min,max]     aro[min,max]")
    print("-" * 78)
    n_ok = 0
    for token in sorted(by_movie):
        vid = to_id(token, args.id_mode)
        if keep is not None and token not in keep and vid not in keep:
            continue
        try:
            t, v, a, n_ann = aggregate_movie(by_movie[token], args.out_hz)
        except ValueError as e:
            print(f"{vid:<8}{token:<18}  [skip] {e}")
            continue
        outp = os.path.join(args.out, f"human_affect_{vid}.csv")
        write_human_arc(outp, t, v, a)
        print(f"{vid:<8}{token:<18}{n_ann:>6}{len(t):>7}{float(t[-1]-t[0]):>8.1f}   "
              f"[{np.nanmin(v):+.2f},{np.nanmax(v):+.2f}]   [{np.nanmin(a):+.2f},{np.nanmax(a):+.2f}]")
        n_ok += 1

    print(f"\n[done] wrote {n_ok} human_affect_<id>.csv to {args.out} (cols: t_sec,valence,"
          "arousal). Feed with: affect_head.py --target-dir " + args.out)
    print("Reminder: COGNIMUSE affect is HUMAN felt emotion (a Rung-1 proxy target), NOT proof "
          "the model 'reads emotion'. Annotations only — source the films legitimately; cite "
          "Zlatintsi et al. 2017.")


if __name__ == "__main__":
    main()
