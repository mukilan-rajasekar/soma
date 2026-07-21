#!/usr/bin/env python3
"""
studyforrest_film.py — cut a sourced Forrest Gump into the StudyForrest "research cut" so
its timeline matches human_affect_forrestgump.csv (and the fMRI), then downscale for Colab.

VERIFIED RECIPE (from studyforrest-data-phase2 code/stimulus/movie/mk_movie_stimulus.sh):
the research cut is the concatenation of these 7 frame spans (25 fps, in..out inclusive of
in) of the Blu-ray master, which drops ~4 short sections. Concatenating them IS the
annotation time axis (t=0 at the first span), total = 177131 frames / 25 = 7085.24 s.

  35-32348, 36385-57835, 58507-86036, 89332-117391, 120656-141496, 145908-152304, 154288-194832

CRITICAL ALIGNMENT CAVEAT (read before trusting the output)
-----------------------------------------------------------
The frame numbers are valid ONLY for the same 25 fps Blu-ray master studyforrest used. If
your copy is a different edition or framerate (e.g. NTSC 23.976 fps, extra studio-logo
lead-in, a regional cut), the spans WON'T line up and the emotion/fMRI alignment breaks.
So: source a 25 fps PAL Blu-ray rip, run this, then EYEBALL one segment boundary against
the annotation before trusting it. For a mismatched copy, shot-cut warping (PySceneDetect +
studyforrest's cuts_wholemovie.csv) is the fallback — not built here; ask if you need it.

AUDIO: the annotation reference is the GERMAN cut, but the VIDEO is what's annotated
(portrayed emotion) and is identical across audio tracks. Feed TRIBE VIDEO-ONLY for
Forrest Gump (its audio branch is English-trained; German would mismatch), or run both and
report — this tool keeps whatever audio your source has; choose the modality in Colab.

USAGE:
  python studyforrest_film.py --film ~/ForrestGump_1994_BluRay_25fps.mkv --out data/clips_studyforrest
  python studyforrest_film.py --film ... --dry-run     # print the plan, cut nothing
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

SRC_FPS_DEFAULT = 25.0
# (in_frame, out_frame) spans of the Blu-ray master, 25 fps — VERIFIED from mk_movie_stimulus.sh
SPANS = [(35, 32348), (36385, 57835), (58507, 86036), (89332, 117391),
         (120656, 141496), (145908, 152304), (154288, 194832)]


def plan(src_fps=SRC_FPS_DEFAULT):
    """[(idx, in_sec, dur_sec)] for each span + total seconds."""
    rows, total = [], 0.0
    for i, (a, b) in enumerate(SPANS):
        in_s, dur = a / src_fps, (b - a) / src_fps
        rows.append((i, in_s, dur))
        total += dur
    return rows, total


def _cut_span(film, in_s, dur, dst, height):
    vf = f"scale=-2:'min({height},ih)'" if height else None
    # -ss before -i + re-encode = accurate seek; -t is the span duration
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{in_s:.3f}", "-i", str(film),
           "-t", f"{dur:.3f}"]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-c:a", "aac", "-b:a", "128k", str(dst)]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--film", required=True, help="your sourced Forrest Gump file (25 fps master)")
    ap.add_argument("--out", default="data/clips_studyforrest", help="output dir")
    ap.add_argument("--id", default="forrestgump", help="output clip stem")
    ap.add_argument("--src-fps", type=float, default=SRC_FPS_DEFAULT,
                    help="frame rate of YOUR copy (the spans are frame indices; default 25)")
    ap.add_argument("--height", type=int, default=360, help="downscale px tall (0 = original)")
    ap.add_argument("--dry-run", action="store_true", help="print the plan; cut nothing")
    args = ap.parse_args()
    args.film = os.path.expanduser(args.film)
    args.out = os.path.expanduser(args.out)

    rows, total = plan(args.src_fps)
    print(f"research cut = {len(SPANS)} spans, total {total:.1f}s ({total/60:.1f} min) "
          f"@ src-fps {args.src_fps:g}")
    for i, in_s, dur in rows:
        print(f"  span {i}: from {in_s:8.2f}s  keep {dur:7.2f}s")
    if args.dry_run:
        print("\n[dry-run] no files written.")
        return

    if not os.path.exists(args.film):
        raise SystemExit(f"film not found: {args.film}")
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found. Install it:  brew install ffmpeg")
    if abs(args.src_fps - 25.0) > 0.01:
        print("  !! src-fps != 25 — the spans are 25 fps frame indices; a non-25fps copy will "
              "MISALIGN. Verify against the annotation, or use shot-cut warping instead.")

    os.makedirs(args.out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        segs = []
        for i, in_s, dur in rows:
            seg = os.path.join(tmp, f"seg_{i}.mp4")
            print(f"[cut] span {i} ({dur:.0f}s) ...")
            _cut_span(args.film, in_s, dur, seg, args.height)
            segs.append(seg)
        listf = os.path.join(tmp, "concat.txt")
        with open(listf, "w") as f:
            for s in segs:
                f.write(f"file '{s}'\n")
        dst = os.path.join(args.out, f"{args.id}.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                        "-i", listf, "-c", "copy", dst], check=True)

    print(f"\n[done] -> {dst}  (~{total/60:.0f} min, aligned to human_affect_{args.id}.csv)")
    print("VERIFY one segment boundary by eye against the annotation before trusting alignment.")
    print("In Colab, prefer VIDEO-ONLY for this clip (German-annotated; TRIBE audio is English).")


if __name__ == "__main__":
    main()
