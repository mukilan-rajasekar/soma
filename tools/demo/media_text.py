#!/usr/bin/env python3
"""
media_text.py — what the ad SAYS and what it SHOWS, with timestamps.

The comprehension layer on /demo claims a brand/product name lands at a specific
second. That claim has to come from the clip itself, not from a copywriter, so this
reads both channels the spec names:

  * SPEECH  — faster-whisper (CPU, int8) transcribes the audio track with word-level
              timings. Same family of model as the WhisperX pass TRIBE's text branch
              already uses, so the words feeding the language ROI and the words we
              print on the page come from the same place.
  * SCREEN  — macOS Vision (VNRecognizeTextRequest) OCRs one frame per second. No
              tesseract dependency; Vision ships with the OS and is markedly better
              on the low-contrast, motion-blurred text these ads are full of.

Output per clip: data/demo/media/<id>.json
  { id, duration, speech: [{t, end, text}], words: [{t, w}], screen: [{t, lines[]}] }

Brand-term matching lives in build_report.py — this file only reports what it heard
and saw, so a bad term list can never silently rewrite the transcript.

USAGE
  .venv/bin/python tools/demo/media_text.py --videos public/ad-videos/*.mp4
  .venv/bin/python tools/demo/media_text.py --videos data/ads/variants/talk_ad/*.mp4 \
      --out-dir data/demo/media_variants
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

# --- speech ---------------------------------------------------------------------------


def transcribe(path, model_size="small"):
    """faster-whisper on CPU. Returns (segments, words). Empty on a silent/failed track."""
    from faster_whisper import WhisperModel

    global _MODEL
    if "_MODEL" not in globals() or _MODEL is None:
        _MODEL = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _info = _MODEL.transcribe(path, word_timestamps=True, vad_filter=True)
    segs, words = [], []
    for s in segments:
        text = (s.text or "").strip()
        if text:
            segs.append({"t": round(s.start, 2), "end": round(s.end, 2), "text": text})
        for w in (s.words or []):
            tok = (w.word or "").strip()
            if tok:
                words.append({"t": round(w.start, 2), "w": tok})
    return segs, words


# --- on-screen text -------------------------------------------------------------------


def ocr_frames(path, fps=1.0, tmp=None):
    """One frame per second -> macOS Vision OCR. Returns [{t, lines:[...]}, ...]."""
    import Quartz
    import Vision

    frames_dir = tmp or tempfile.mkdtemp(prefix="somaocr_")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps}",
         os.path.join(frames_dir, "f_%04d.png")],
        check=True,
    )
    out = []
    for name in sorted(os.listdir(frames_dir)):
        if not name.startswith("f_"):
            continue
        idx = int(name[2:6]) - 1
        url = Quartz.CFURLCreateFromFileSystemRepresentation(
            None, os.path.join(frames_dir, name).encode(), len(os.path.join(frames_dir, name).encode()), False)
        src = Quartz.CGImageSourceCreateWithURL(url, None)
        if src is None:
            continue
        img = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
        if img is None:
            continue
        handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(img, None)
        req = Vision.VNRecognizeTextRequest.alloc().init()
        req.setRecognitionLevel_(1)  # accurate
        req.setUsesLanguageCorrection_(True)
        ok, _err = handler.performRequests_error_([req], None)
        if not ok:
            continue
        lines = []
        for obs in (req.results() or []):
            cand = obs.topCandidates_(1)
            if cand and len(cand):
                s = str(cand[0].string()).strip()
                if s:
                    lines.append({"text": s, "conf": round(float(cand[0].confidence()), 3)})
        if lines:
            out.append({"t": round(idx / fps, 2), "lines": lines})
    return out, frames_dir


def duration_of(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True,
    )
    try:
        return round(float(r.stdout.strip()), 2)
    except ValueError:
        return 0.0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--videos", nargs="+", required=True)
    ap.add_argument("--out-dir", default="data/demo/media")
    ap.add_argument("--model", default="small")
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    for path in args.videos:
        vid = os.path.splitext(os.path.basename(path))[0]
        outp = os.path.join(args.out_dir, f"{vid}.json")
        if os.path.exists(outp) and not args.force:
            print(f"skip {vid} (exists)", flush=True)
            continue
        print(f"-- {vid}", flush=True)
        rec = {"id": vid, "duration": duration_of(path), "speech": [], "words": [], "screen": []}
        try:
            rec["speech"], rec["words"] = transcribe(path, args.model)
            print(f"   speech: {len(rec['speech'])} segs, {len(rec['words'])} words", flush=True)
        except Exception as e:
            print(f"   speech FAILED: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        if not args.no_ocr:
            try:
                rec["screen"], _d = ocr_frames(path)
                print(f"   screen: {len(rec['screen'])} frames with text", flush=True)
            except Exception as e:
                print(f"   ocr FAILED: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        with open(outp, "w") as f:
            json.dump(rec, f, indent=1)
    print("done", flush=True)


if __name__ == "__main__":
    main()
