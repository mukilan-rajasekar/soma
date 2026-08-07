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

from .ops import Timeline, audio_ops_to_output_time

# Sane, universally playable output. Not archival: these are decision artifacts a buyer
# watches and forwards, and matching the source's bitrate would triple the size for a
# difference nobody makes a call on.
V_ARGS = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
A_ARGS = ["-c:a", "aac", "-b:a", "128k"]

# Audio op gains. Duck is a fixed -12 dB (0.25 linear) rather than a parameter: one
# audible, defensible level, not a knob whose value nobody can justify per candidate.
AUDIO_OP_GAIN = {"mute": 0.0, "duck": 0.25}


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


def build_filter(timeline: Timeline, audio: bool, audio_ops: list | None = None) -> str:
    """The filter graph for one timeline.

    Each segment is trimmed and its timestamps rebased to zero (setpts/asetpts), then all
    of them are concatenated IN LIST ORDER — which is what makes a reorder a reorder
    rather than a no-op, since trim alone would leave the segments in source order.

    `audio_ops` are OUTPUT-time windows (already remapped by the caller) applied as
    volume filters after the concat, so they act on what the viewer hears, not on source
    seconds that a cut may have moved or removed.
    """
    parts, labels = [], []
    for i, (a, b) in enumerate(timeline):
        parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}]")
        labels.append(f"[v{i}]")
        if audio:
            parts.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}]")
            labels.append(f"[a{i}]")

    n = len(timeline)
    ops = list(audio_ops or [])
    if audio:
        # concat wants the streams interleaved per segment: v0 a0 v1 a1 ...
        order = "".join(f"[v{i}][a{i}]" for i in range(n))
        a_label = "rawa" if ops else "outa"
        parts.append(f"{order}concat=n={n}:v=1:a=1[outv][{a_label}]")
        cur = a_label
        for j, op in enumerate(ops):
            kind = str(op["op"])
            if kind not in AUDIO_OP_GAIN:
                raise ValueError(f"unknown audio op {kind!r}; have {sorted(AUDIO_OP_GAIN)}")
            nxt = "outa" if j == len(ops) - 1 else f"fa{j}"
            parts.append(
                f"[{cur}]volume=enable='between(t,{float(op['start']):.3f},{float(op['end']):.3f})'"
                f":volume={AUDIO_OP_GAIN[kind]}[{nxt}]"
            )
            cur = nxt
    else:
        order = "".join(f"[v{i}]" for i in range(n))
        parts.append(f"{order}concat=n={n}:v=1:a=0[outv]")
    return ";".join(parts)


def render(
    timeline: Timeline, src: Path, dst: Path, *, audio: bool | None = None,
    audio_ops: list | None = None,
) -> Path:
    """Cut `timeline` out of `src` into `dst`. Raises RuntimeError with ffmpeg's own tail
    on failure, because ffmpeg's last few lines are usually the actual diagnosis.

    `audio_ops` arrive in SOURCE time (as Candidate.audio_ops carries them) and are
    remapped to output time here — the one place that knows the final play order."""
    if not timeline:
        raise RuntimeError("Cannot render an empty timeline.")
    if not have_ffmpeg():
        raise RuntimeError("ffmpeg and ffprobe are required to render an edit.")

    src, dst = Path(src), Path(dst)
    if not src.exists():
        raise RuntimeError(f"Source not found: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)

    use_audio = has_audio(src) if audio is None else audio
    if audio_ops and not use_audio:
        # A muted mute is not "done", it is meaningless — refuse rather than no-op.
        raise RuntimeError("Audio ops requested but the source has no audio track.")
    out_ops = audio_ops_to_output_time(timeline, audio_ops) if audio_ops else None
    graph = build_filter(timeline, use_audio, out_ops)

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
