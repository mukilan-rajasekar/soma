#!/usr/bin/env python3
"""
test_generate.py — the generation seam in tools/generate/.

The valuable properties here are not "does ffmpeg work". They are the ones that decide
whether the FILTER — the actual product — can be trusted:

  * the stub emits a real, scoreable video, not a fixture path. If it did not, the whole
    generate -> score -> rank loop would only ever be exercised against a mock, and the
    one claim worth making ("we kill the losers before you see them") would be untested.
  * the stub is NOT a near-black card. process_batch.py hard-fails a run where content
    does not drive occipital cortex, so a solid slate would make the pipeline permanently
    ungateable. This is the test that keeps the stub honest about being a video.
  * ids line up with what process_batch.py expects from a manifest, so a generated batch
    scores through the identical path an uploaded one does. Comparability between
    generated and real ads rests entirely on that.
  * plan() truncates rather than samples, so a 3-clip run is a prefix of a 6-clip run.
  * determinism holds ACROSS PROCESSES — Python randomises str hashing per process, and
    an earlier version of this used hash(), which silently made two runs of the same
    batch incomparable.

Run: .venv/bin/python -m pytest -q test_generate.py
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from tools.generate.directions import DIRECTIONS, build_prompt, plan
from tools.generate.provider import ClipSpec, StubProvider, _stable_index, get_provider

BRIEF = {
    "brand_name": "Kova",
    "product_name": "Whey Isolate",
    "primary_problem": "protein powder that makes you bloated",
    "primary_benefit": "clean protein without the bloat",
    "offer": "20% off your first order",
    "desired_cta": "tap the link in bio",
}

needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="ffmpeg/ffprobe not installed",
)


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "stream=codec_type,width,height:format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


# ── the stub is a real video ────────────────────────────────────────────────────

@needs_ffmpeg
def test_stub_emits_a_real_playable_video(tmp_path):
    spec = ClipSpec(id="ad_01", label="Product first", prompt="a thing", duration_s=2.0)
    dst = StubProvider().generate(spec, tmp_path / "ad_01.mp4")

    assert dst.exists() and dst.stat().st_size > 10_000
    info = probe(dst)
    kinds = {s["codec_type"] for s in info["streams"]}
    assert "video" in kinds
    # An audio track must be PRESENT: process_batch.py flags an ad with no audio stream,
    # and a stub batch should not trip a flag that means something real.
    assert "audio" in kinds
    assert float(info["format"]["duration"]) == pytest.approx(2.0, abs=0.35)


@needs_ffmpeg
def test_stub_respects_aspect(tmp_path):
    for aspect, (w, h) in {"9:16": (720, 1280), "16:9": (1280, 720), "1:1": (960, 960)}.items():
        spec = ClipSpec(id="ad_01", label="x", prompt="y", duration_s=1.0, aspect=aspect)
        dst = StubProvider().generate(spec, tmp_path / f"{aspect.replace(':', 'x')}.mp4")
        v = next(s for s in probe(dst)["streams"] if s["codec_type"] == "video")
        assert (v["width"], v["height"]) == (w, h)


@needs_ffmpeg
def test_stub_is_not_a_near_black_card(tmp_path):
    """The gate-keeping property. process_batch.py fails a run where content minus a
    black screen does not drive occipital cortex; a dark solid slate is barely different
    from the baseline, so a stub batch of those could never pass and the loop could never
    be exercised end to end. Proxy for "has real visual content": a moving, detailed clip
    does not compress anywhere near as small as a flat one."""
    spec = ClipSpec(id="ad_01", label="x", prompt="y", duration_s=3.0)
    dst = StubProvider().generate(spec, tmp_path / "a.mp4")
    # A 3s flat colour card at 720x1280 lands in the low tens of KB; real detail+motion
    # is an order of magnitude more.
    assert dst.stat().st_size > 100_000, "stub looks like a flat card, not a video"


# ── determinism ─────────────────────────────────────────────────────────────────

def test_stable_index_is_stable_across_processes():
    """hash() is randomised per process; this must not be."""
    keys = [f"ad_{i:02d}" for i in range(1, 7)]
    here = [_stable_index(k, 6) for k in keys]
    code = (
        "import sys; sys.path.insert(0, '.');"
        "from tools.generate.provider import _stable_index;"
        f"print([_stable_index(k, 6) for k in {keys!r}])"
    )
    other = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                           cwd=str(Path(__file__).resolve().parent))
    assert other.returncode == 0, other.stderr
    assert json.loads(other.stdout.replace("'", '"')) == here


def test_sequential_ids_get_distinct_buckets():
    """Six sequential ids across six buckets must not collide, or the tint stops
    distinguishing anything."""
    got = [_stable_index(f"ad_{i:02d}", 6) for i in range(1, 7)]
    assert sorted(got) == list(range(6))


def test_non_numeric_ids_still_bucket():
    assert 0 <= _stable_index("hero-cut", 6) < 6


# ── the plan ────────────────────────────────────────────────────────────────────

def test_plan_ids_match_what_the_scorer_expects():
    """ad_01… is the manifest id shape process_batch.py is driven with everywhere else.
    Comparability between a generated batch and an uploaded one depends on them scoring
    through the identical path, which depends on this."""
    got = [spec.id for _d, spec in plan(BRIEF)]
    assert got == [f"ad_{i:02d}" for i in range(1, len(DIRECTIONS) + 1)]


def test_plan_truncates_rather_than_samples():
    """A 3-clip run must be a PREFIX of the full run, so two runs of different sizes are
    directly comparable and a missing direction is never ambiguous."""
    small = [d.key for d, _s in plan(BRIEF, n=3)]
    full = [d.key for d, _s in plan(BRIEF)]
    assert small == full[:3]


def test_plan_carries_the_brief_into_every_prompt():
    for _d, spec in plan(BRIEF):
        assert BRIEF["brand_name"] in spec.prompt
        assert BRIEF["product_name"] in spec.prompt
        assert BRIEF["primary_problem"] in spec.prompt
        assert BRIEF["desired_cta"] in spec.prompt


def test_directions_open_on_genuinely_different_beats():
    """The spread has to be structural. Sampling one prompt would give correlated
    candidates, and a filter over correlated candidates filters nothing."""
    moves = [d.move for d in DIRECTIONS]
    assert len(set(moves)) == len(moves)
    assert len(DIRECTIONS) >= 4


def test_every_direction_states_which_lane_it_bets_on():
    """`why` is a hypothesis the measurement is allowed to refute. It must exist for
    every direction, or the taxonomy is arbitrary."""
    for d in DIRECTIONS:
        assert d.why.strip()
        assert any(w in d.why.lower()
                   for w in ("ventral", "dorsal", "salience", "comprehension",
                             "language", "attention", "prediction"))


def test_build_prompt_tolerates_a_sparse_brief():
    sparse = {"brand_name": "Kova", "product_name": "Whey"}
    text = build_prompt(DIRECTIONS[0], sparse)
    assert "Kova" in text and "Whey" in text
    assert "None" not in text and "  " not in text.replace(". ", ". ")


# ── the registry ────────────────────────────────────────────────────────────────

def test_get_provider_returns_the_stub():
    assert get_provider("stub").name == "stub"


def test_unknown_provider_fails_with_instructions():
    with pytest.raises(SystemExit) as e:
        get_provider("veo")
    assert "stub" in str(e.value)
