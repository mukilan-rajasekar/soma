#!/usr/bin/env python3
"""
render.py — a timeline becomes an actual mp4, cut from the customer's own frames.

This is what separates "your score would be 66 if you cut the second beat" from handing
someone a file. Nothing here generates a frame: every output is a re-cut of the source,
which is why the edit product can be honest about provenance ("from your frames, never
regenerated") and why it sidesteps the video-generation quality problem entirely.

ONE ffmpeg INVOCATION PER CANDIDATE, not a concat demuxer over intermediate files. The
demuxer route needs every segment written to disk first, re-encodes twice, and stitches
on keyframe boundaries — which silently moves a cut point by up to a keyframe interval,
so the rendered file stops matching the timeline that was scored. trim/concat in one
filter graph cuts on exact frames and encodes once.
"""

import shutil
import subprocess
from pathlib import Path

from .ops import Timeline

# Sane, universally playable output. Not archival: these are decision artifacts a buyer
# watches and forwards, and matching the source's bitrate would triple the size for a
# difference nobody makes a call on.
V_ARGS = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
A_ARGS = ["-c:a", "aac", "-b:a", "128k"]


def have_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def has_audio(src: Path) -> bool:
    """ffprobe: does this file carry an audio stream? A timeline built for audio+video
    against a silent source produces a filter graph referencing [0:a], which fails the
    whole render rather than degrading."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
             "stream=index", "-of", "csv=p=0", str(src)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return bool(out)
    except (subprocess.CalledProcessError, OSError):
        return False


def build_filter(timeline: Timeline, audio: bool) -> str:
    """The filter graph for one timeline.

    Each segment is trimmed and its timestamps rebased to zero (setpts/asetpts), then all
    of them are concatenated IN LIST ORDER — which is what makes a reorder a reorder
    rather than a no-op, since trim alone would leave the segments in source order.
    """
    parts, labels = [], []
    for i, (a, b) in enumerate(timeline):
        parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}]")
        labels.append(f"[v{i}]")
        if audio:
            parts.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}]")
            labels.append(f"[a{i}]")

    n = len(timeline)
    if audio:
        # concat wants the streams interleaved per segment: v0 a0 v1 a1 ...
        order = "".join(f"[v{i}][a{i}]" for i in range(n))
        parts.append(f"{order}concat=n={n}:v=1:a=1[outv][outa]")
    else:
        order = "".join(f"[v{i}]" for i in range(n))
        parts.append(f"{order}concat=n={n}:v=1:a=0[outv]")
    return ";".join(parts)


def render(timeline: Timeline, src: Path, dst: Path, *, audio: bool | None = None) -> Path:
    """Cut `timeline` out of `src` into `dst`. Raises RuntimeError with ffmpeg's own tail
    on failure, because ffmpeg's last few lines are usually the actual diagnosis."""
    if not timeline:
        raise RuntimeError("Cannot render an empty timeline.")
    if not have_ffmpeg():
        raise RuntimeError("ffmpeg and ffprobe are required to render an edit.")

    src, dst = Path(src), Path(dst)
    if not src.exists():
        raise RuntimeError(f"Source not found: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)

    use_audio = has_audio(src) if audio is None else audio
    graph = build_filter(timeline, use_audio)

    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", graph,
           "-map", "[outv]"]
    if use_audio:
        cmd += ["-map", "[outa]", *A_ARGS]
    cmd += [*V_ARGS, "-movflags", "+faststart", str(dst)]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not dst.exists():
        tail = " ".join((proc.stderr or "").strip().splitlines()[-4:])
        raise RuntimeError(f"ffmpeg failed: {tail[:500]}")
    return dst


def duration_of(path: Path) -> float:
    """Rendered duration, for checking the output actually matches the timeline that was
    scored. A silent mismatch here would mean shipping a file whose score describes a
    different cut."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return float(out)
    except (subprocess.CalledProcessError, ValueError, OSError):
        return 0.0
