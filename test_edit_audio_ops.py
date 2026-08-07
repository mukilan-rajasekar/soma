#!/usr/bin/env python3
"""Audio edit op tests.

The property under protection: audio candidates never pretend to be estimated. The arc
was computed with the original soundtrack, so estimate() must hand back exactly delta
zero, the confidence label must say "unestimated", and the only way an audio edit gets a
real number is the verify stage. The render half is protected by an integration test
that renders a synthetic clip and measures that the muted window is actually silent.

Run: .venv/bin/python -m pytest -q test_edit_audio_ops.py
"""

import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.edit import render as rnd  # noqa: E402
from tools.edit.ops import (  # noqa: E402
    Candidate,
    audio_ops_to_output_time,
    enumerate_audio_candidates,
    estimate,
)

SHOTS = [(0.0, 4.0), (4.0, 8.0), (8.0, 12.0)]


def test_enumerate_two_ops_per_shot_all_unestimated():
    cands = enumerate_audio_candidates(SHOTS)
    assert len(cands) == 2 * len(SHOTS)
    assert {c.kind for c in cands} == {"mute_shot", "duck_shot"}
    for c in cands:
        assert c.timeline == SHOTS, "an audio op must not touch the frames"
        assert c.removed == []
        assert c.confidence == "unestimated"
        assert len(c.audio_ops) == 1


def test_output_time_is_identity_when_nothing_is_cut():
    ops = [{"op": "mute", "start": 4.0, "end": 8.0}]
    assert audio_ops_to_output_time(SHOTS, ops) == [{"op": "mute", "start": 4.0, "end": 8.0}]


def test_output_time_shifts_across_a_removal_and_dies_inside_one():
    # Shot 2 (4-8s) removed: an op on shot 3 slides 4s earlier; an op on shot 2 vanishes.
    cut = [SHOTS[0], SHOTS[2]]
    shifted = audio_ops_to_output_time(cut, [{"op": "duck", "start": 8.0, "end": 12.0}])
    assert shifted == [{"op": "duck", "start": 4.0, "end": 8.0}]
    gone = audio_ops_to_output_time(cut, [{"op": "mute", "start": 4.0, "end": 8.0}])
    assert gone == []


def test_output_time_travels_with_a_hoisted_shot():
    hoisted = [SHOTS[2], SHOTS[0], SHOTS[1]]
    moved = audio_ops_to_output_time(hoisted, [{"op": "mute", "start": 8.0, "end": 12.0}])
    assert moved == [{"op": "mute", "start": 0.0, "end": 4.0}]


def test_estimate_returns_exactly_zero_delta_for_audio_candidates():
    lanes = {"attention": list(range(12))}

    def score_fn(cut_lanes, levels, brand, result_s, fps):
        return {"soma": 50.0 + len(cut_lanes["attention"])}

    cand = enumerate_audio_candidates(SHOTS)[0]
    base = score_fn(lanes, {}, [], 12.0, 1.0)["soma"]
    estimate(cand, lanes, {}, [], score_fn, base)
    assert cand.est_delta == 0.0
    assert cand.measured is False
    assert cand.confidence == "unestimated"


def test_build_filter_chains_volume_and_ends_at_outa():
    graph = rnd.build_filter(
        [(0.0, 12.0)], True,
        [{"op": "mute", "start": 2.0, "end": 4.0}, {"op": "duck", "start": 6.0, "end": 8.0}],
    )
    assert "volume=enable='between(t,2.000,4.000)':volume=0.0" in graph
    assert "volume=enable='between(t,6.000,8.000)':volume=0.25" in graph
    assert graph.count("[outa]") == 1
    with pytest.raises(ValueError, match="unknown audio op"):
        rnd.build_filter([(0.0, 12.0)], True, [{"op": "reverse", "start": 0, "end": 1}])


def test_render_refuses_audio_ops_on_silent_source(tmp_path, monkeypatch):
    monkeypatch.setattr(rnd, "have_ffmpeg", lambda: True)
    src = tmp_path / "silent.mp4"
    src.write_bytes(b"not a real file, never reaches ffmpeg")
    with pytest.raises(RuntimeError, match="no audio track"):
        rnd.render(
            [(0.0, 1.0)], src, tmp_path / "out.mp4",
            audio=False, audio_ops=[{"op": "mute", "start": 0.0, "end": 1.0}],
        )


def _mean_volume_db(path: Path, start: float, end: float) -> float:
    out = subprocess.run(
        ["ffmpeg", "-v", "info", "-ss", str(start), "-to", str(end), "-i", str(path),
         "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    for line in out.splitlines():
        if "mean_volume" in line:
            return float(line.split("mean_volume:")[1].split("dB")[0].strip())
    raise AssertionError(f"volumedetect produced no mean_volume:\n{out[-500:]}")


def test_rendered_mute_window_is_actually_silent(tmp_path):
    if not rnd.have_ffmpeg():
        pytest.skip("ffmpeg not on PATH")
    src = tmp_path / "tone.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "lavfi", "-i", "color=c=gray:s=192x108:d=8",
         "-f", "lavfi", "-i", "sine=frequency=440:d=8",
         "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac",
         str(src)],
        check=True, capture_output=True,
    )
    dst = tmp_path / "muted.mp4"
    rnd.render([(0.0, 8.0)], src, dst, audio_ops=[{"op": "mute", "start": 2.0, "end": 4.0}])

    muted = _mean_volume_db(dst, 2.2, 3.8)
    loud = _mean_volume_db(dst, 4.2, 5.8)
    assert muted < -60.0, f"muted window is audible: {muted} dB"
    assert loud > -40.0, f"unmuted window went quiet: {loud} dB"
