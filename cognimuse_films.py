#!/usr/bin/env python3
"""
cognimuse_films.py — "clean" the COGNIMUSE movie files: cut each film to the exact segment
its emotion annotations cover, downscale, and name it by code so it lines up with the
human_affect_<code>.csv you already built. The output clips are what you upload to Drive and
run through the improved Colab notebook (they become preds_<code>.npy).

WHAT IT DOES (local, ffmpeg, no GPU):
  For each human_affect_<code>.csv in --affect-dir, it finds the matching film in --films-dir
  (by code like GLA or movie name like Gladiator), reads the annotation duration D from the
  CSV, and cuts a D-second window from the film, downscaled to --height px.

  -> data/clips_cognimuse/<code>.mp4   (name it stays <code> so preds_<code>.npy ↔ human_affect_<code>.csv)

ALIGNMENT — WHERE THE WINDOW ENDS (do not change blindly):
  affect_head lines up brain-second t with human-second t, so the D-second clip must cover the
  SAME film footage the annotators rated. COGNIMUSE annotates the last ~30 min of each film's
  STORY, ending at its final shot (Zlatintsi et al. 2017: "half-hour segments ... with the
  final shot/scene included"). The CSV's t_sec runs 0..D over exactly that story window.

  The trap: a commercial film FILE does NOT end at the final story shot — it rolls 3-9 min of
  END CREDITS after it. So the default -sseof anchor (keep the last D seconds of the FILE) puts
  credits in the clip's tail and shifts every second later by the credit length — durations
  still match, so it silently validates brain-vs-human on scenes minutes apart. This was a real
  bug (fixed 2026-07-20). Pass --story-end CODE=SECONDS with each film's last-story-frame
  timestamp so the window becomes [story_end - D, story_end] and the credits are dropped. The
  per-film values live in data/cognimuse/story_end.csv; regenerate them by eyeballing the
  story->credits boundary (see COGNIMUSE-ALIGNMENT-FIX.md). Only films whose file already ends
  at the final story frame are safe with the bare -sseof default. Always verify one clip's LAST
  frame by eye (a story shot, not a credit card); the README also flags a ~2-3 s FeelTrace lag.

LEGAL / HONESTY:
  This tool only PROCESSES film files you already have — it does not obtain them. The 7
  COGNIMUSE films are copyrighted commercial movies; obtain them legitimately (own/rent/
  license) and comply with the COGNIMUSE terms + Zlatintsi et al. 2017 citation. I won't help
  source the films. Downscaling changes the preds vs full-res, but it's applied uniformly to
  every clip, so the within-movie affect test stays internally consistent (same as tvsum_trim).

USAGE:
  # drop the films in a folder, named by code (GLA.mkv) or by movie (Gladiator.mp4):
  python cognimuse_films.py --films-dir ~/cog_films --affect-dir data/cognimuse
  python cognimuse_films.py --films-dir ~/cog_films --affect-dir data/cognimuse --dry-run
  # explicit mapping if auto-match can't find one:
  python cognimuse_films.py --films-dir ~/cog_films --map "GLA=~/movies/glad.mkv,DEP=~/movies/dep.mp4"

Needs ffmpeg:  brew install ffmpeg
"""
import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import cognimuse_prep  # for the token<->code map
from honest_corr_timeseries import _read_csv

VIDEO_EXTS = (".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm", ".flv", ".mpg", ".mpeg", ".ts")
HERE = Path(__file__).resolve().parent
TOKEN_BY_CODE = {code: token for token, code in cognimuse_prep.CODE.items()}


def affect_duration(csv_path):
    """Annotation duration D (seconds) = last t_sec in a human_affect_<code>.csv."""
    _, cols = _read_csv(csv_path)
    t = cols.get("t_sec")
    if t is None or len(t) == 0:
        raise ValueError(f"{csv_path}: no t_sec column")
    return float(t[-1])


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def find_film(films_dir, code, token):
    """Find the film file for a code. Match the movie TOKEN (e.g. 'gladiator') anywhere in
    the filename first; else the 3-letter CODE as a delimited token (\\bGLA\\b)."""
    files = [p for p in sorted(glob.glob(os.path.join(films_dir, "*")))
             if os.path.splitext(p)[1].lower() in VIDEO_EXTS]
    tnorm = _norm(token)
    for p in files:                       # strong match: full movie name in the filename
        if tnorm and tnorm in _norm(os.path.basename(p)):
            return p
    for p in files:                       # weak match: the code as a whole word (GLA, DEP…)
        if re.search(rf"\b{re.escape(code)}\b", os.path.basename(p), re.IGNORECASE):
            return p
    return None


def plan(films_dir, affect_dir, explicit_map, pad_sec):
    """Return [(code, film_path_or_None, cut_sec)] for every human_affect_<code>.csv."""
    rows = []
    for csv_path in sorted(glob.glob(os.path.join(affect_dir, "human_affect_*.csv"))):
        code = os.path.basename(csv_path)[len("human_affect_"):-len(".csv")]
        token = TOKEN_BY_CODE.get(code, code)
        film = explicit_map.get(code)
        if film:
            film = str(Path(film).expanduser())
            if not os.path.exists(film):
                film = None
        if not film:
            film = find_film(films_dir, code, token) if films_dir else None
        try:
            cut = affect_duration(csv_path) + pad_sec
        except ValueError:
            cut = None
        rows.append((code, film, cut))
    return rows


def _english_audio_map(src):
    """If a film has MULTIPLE audio tracks and the first is NOT English, return the ffmpeg
    -map args that select video + the English audio track. This stops a Russian/other-dub
    first track (common in HDRip rips) from being fed to TRIBE instead of the annotated
    English audio. Returns None (ffmpeg default = first audio) for single-track/eng-first
    files, or when ffprobe is unavailable."""
    if not shutil.which("ffprobe"):
        return None
    try:
        # read BOTH the language tag AND the title tag — rips (esp. .avi) often label the
        # track only in `title` ("English"/"Russian"), leaving `language` empty.
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=index:stream_tags=language,title", "-of", "csv=p=0",
             str(src)], capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        return None
    rows = [ln.split(",") for ln in out.strip().splitlines() if ln.strip()]
    if len(rows) <= 1:
        return None                                    # single audio track -> default is right

    def is_eng(fields):
        blob = " ".join(fields[1:]).lower()            # language + title tags for this track
        return blob.startswith("en") or "eng" in blob or "english" in blob

    if is_eng(rows[0]):
        return None                                    # first track already English
    for r in rows:
        if is_eng(r):
            return ["-map", "0:v:0", "-map", f"0:{r[0]}"]
    return None                                        # no English track found -> leave default


def _probe_duration(path):
    """Output media duration in seconds via ffprobe, or 0.0 if missing/unreadable. Used to
    reject short/truncated clips: ffmpeg exits 0 even when -sseof clamps to a source shorter
    than cut_sec, which would silently offset every downstream video-second."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nokey=1:noprint_wrappers=1", str(path)],
            capture_output=True, text=True, check=True).stdout.strip()
        return float(out)
    except (subprocess.CalledProcessError, ValueError):
        return 0.0


def _cut_tail(src, dst, cut_sec, height, end_sec=None):
    """ffmpeg: extract the cut_sec-second annotation window, downscale to height px tall, and
    prefer an English audio track when a dub is first. Returns (remapped, downmixed).

    end_sec=None anchors the window at the file's final frame (-sseof), which is only correct
    when the file ends exactly where the annotation does. COGNIMUSE annotations end at the
    film's last STORY frame, but the source files then roll 5-9 min of end credits — so for
    those, pass end_sec = the story-end timestamp and the window becomes [end_sec - cut_sec,
    end_sec], dropping the credit tail. Without this the clip is shifted later by the credit
    length and every downstream video-second is misaligned against the human affect curve."""
    vf = f"scale=-2:'min({height},ih)'" if height else None    # never upscales
    amap = _english_audio_map(src)

    def _run(extra_audio):
        cmd = ["ffmpeg", "-y", "-loglevel", "error"]
        if end_sec is None:
            cmd += ["-sseof", f"-{cut_sec:.2f}", "-i", str(src)]
        else:
            start = max(0.0, end_sec - cut_sec)
            cmd += ["-ss", f"{start:.2f}", "-i", str(src), "-t", f"{cut_sec:.2f}"]
        if amap:
            cmd += amap
        if vf:
            cmd += ["-vf", vf]
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
                "-c:a", "aac", "-b:a", "192k"] + extra_audio + ["-movflags", "+faststart", str(dst)]
        # Capture stderr so the caller can tell WHY ffmpeg failed (layout vs bad map vs
        # damaged stream vs disk-full) instead of blindly retrying the whole encode.
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise subprocess.CalledProcessError(r.returncode, cmd, r.stdout, r.stderr)

    try:
        _run([])
        return bool(amap), False
    except subprocess.CalledProcessError as e:
        # Only the "Unsupported channel layout" case is fixable by downmixing (e.g. a 5.1 track
        # tagged as bare "6 channels" with no layout mask). TRIBE's audio front-end is mono, so
        # -ac 2 changes nothing the model consumes. For ANY other failure (bad -map, damaged
        # stream, disk-full) re-raise with the real stderr rather than re-encoding the whole
        # clip only to fail again.
        if "channel layout" not in (e.stderr or "").lower():
            raise
        _run(["-ac", "2"])
        return bool(amap), True


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--films-dir", default=None, help="folder where you dropped the film files")
    ap.add_argument("--affect-dir", default=str(HERE / "data" / "cognimuse"),
                    help="dir with human_affect_<code>.csv (from cognimuse_prep.py)")
    ap.add_argument("--out", default=str(HERE / "data" / "clips_cognimuse"),
                    help="where the cut clips are written (upload THIS folder to Drive)")
    ap.add_argument("--height", type=int, default=360, help="downscale to px tall (0 = keep original)")
    ap.add_argument("--pad-sec", type=float, default=0.0,
                    help="extra seconds to include before the annotation window (alignment nudge)")
    ap.add_argument("--map", default="",
                    help="explicit code=path pairs, comma-separated (overrides auto-match)")
    ap.add_argument("--story-end", default="",
                    help="code=SECONDS pairs, comma-separated: anchor the clip to END at this "
                         "film timestamp (the last STORY frame) instead of the file's final "
                         "frame. Use it to drop end credits — COGNIMUSE annotations stop at the "
                         "last story shot, but source files roll 5-9 min of credits after it, so "
                         "the default -sseof anchor misaligns every second by the credit length.")
    ap.add_argument("--dry-run", action="store_true", help="print the plan; cut nothing")
    args = ap.parse_args()
    args.films_dir = os.path.expanduser(args.films_dir) if args.films_dir else None
    args.affect_dir = os.path.expanduser(args.affect_dir)
    args.out = os.path.expanduser(args.out)

    explicit_map = {}
    for pair in (args.map or "").split(","):
        if "=" in pair:
            k, v = pair.split("=", 1)
            explicit_map[k.strip()] = v.strip()

    story_end_map = {}
    for pair in (args.story_end or "").split(","):
        if "=" in pair:
            k, v = pair.split("=", 1)
            try:
                story_end_map[k.strip()] = float(v.strip())
            except ValueError:
                sys.exit(f"--story-end: expected code=SECONDS, got {pair!r}")

    rows = plan(args.films_dir, args.affect_dir, explicit_map, args.pad_sec)
    if not rows:
        raise SystemExit(f"No human_affect_*.csv in {args.affect_dir!r}. Run cognimuse_prep.py "
                         "first (make cognimuse COG=...).")

    print(f"{'code':<6}{'cut_s':>8}  film")
    print("-" * 74)
    todo = []
    for code, film, cut in rows:
        tag = "MISSING film" if not film else ("no duration" if cut is None else os.path.basename(film))
        print(f"{code:<6}{(f'{cut:.0f}' if cut else '--'):>8}  {tag}")
        if film and cut:
            todo.append((code, film, cut))

    if args.dry_run:
        print(f"\n[dry-run] would cut {len(todo)}/{len(rows)} clip(s) to {args.out}. "
              "No files written.")
        return
    if not todo:
        raise SystemExit("\nNo films matched. Drop them in --films-dir named by code (GLA.mkv) "
                         "or movie (Gladiator.mp4), or pass --map CODE=path.")
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found. Install it:  brew install ffmpeg")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n[cut] {len(todo)} clip(s) -> {out_dir}  (last-D-seconds, {args.height or 'orig'}px tall)\n")
    made = 0
    for code, film, cut in todo:
        dst = out_dir / f"{code}.mp4"
        # A prior clip only counts as done if its duration matches the annotation window;
        # size>0 is not enough — a truncated leftover would otherwise be silently accepted.
        if dst.exists() and abs(_probe_duration(dst) - cut) <= 1.0:
            print(f"  [skip-exists] {dst.name}")
            made += 1
            continue
        if dst.exists():                       # 0-byte / truncated leftover -> redo it
            dst.unlink()
        end_sec = story_end_map.get(code)
        try:
            remapped, downmixed = _cut_tail(film, dst, cut, args.height, end_sec=end_sec)
            dur = _probe_duration(dst)
            if not dst.exists() or dst.stat().st_size == 0 or abs(dur - cut) > 1.0:
                # ffmpeg exited 0 but the clip is empty or short (e.g. cut_sec > source length,
                # or --story-end earlier than cut_sec): never ship it — a short clip misaligns
                # every downstream second.
                dst.unlink(missing_ok=True)
                print(f"  [ERROR] {code}: output missing/short "
                      f"(dur {dur:.1f}s vs cut {cut:.1f}s) — skipping")
                continue
            anchor = (f"ending at story-end {end_sec:.0f}s" if end_sec is not None
                      else "last-D from file-EOF")
            note = (" · picked English audio track" if remapped else "") + \
                   (" · downmixed audio to stereo (source layout rejected)" if downmixed else "")
            print(f"  [ok] {dst.name}  ({dst.stat().st_size/1e6:.1f} MB, {cut:.0f}s of "
                  f"{os.path.basename(film)}, {anchor}){note}")
            made += 1
        except subprocess.CalledProcessError as e:
            dst.unlink(missing_ok=True)          # drop any partial so it is redone next run
            err = (e.stderr or "").strip().splitlines()
            reason = err[-1] if err else str(e)
            print(f"  [ERROR] {code}: ffmpeg failed ({reason}) — skipping")

    print(f"\n[done] {made} clip(s) in {out_dir}.")
    print("Next: upload this folder to Drive (MyDrive/soma/clips), run the improved Colab "
          "notebook (name preds by code), then:  make affect-head-save")
    print("Verify one clip by eye — the README flags a ~2-3 s annotation lag; nudge with --pad-sec.")


if __name__ == "__main__":
    main()
