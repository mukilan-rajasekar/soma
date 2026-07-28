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
from tools.generate.provider import (
    PROVIDERS,
    ClipSpec,
    StubProvider,
    _stable_index,
    get_provider,
    veo_duration,
    veo_request,
    veo_video_uri,
)

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
        get_provider("nonesuch")
    assert "stub" in str(e.value)


def test_veo_is_registered():
    """It used to be the example of an UNKNOWN provider. It is a real one now, and that
    test would have kept passing by coincidence — _veo_from_env also raises SystemExit —
    while silently testing nothing."""
    assert "veo" in PROVIDERS


def test_veo_without_a_key_says_what_to_do_and_what_it_costs(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with pytest.raises(SystemExit) as e:
        get_provider("veo")
    msg = str(e.value)
    assert "GEMINI_API_KEY" in msg
    # Nobody should discover a six-generation bill by running the default sweep.
    assert "PAID" in msg
    assert "stub" in msg


# ── veo: the places its constraints do not match a ClipSpec ─────────────────────
#
# Network calls are not tested here — a mocked HTTP round trip only proves the mock
# matches my reading of the docs. What IS worth pinning is every point where Veo's shape
# differs from ClipSpec's, because those are where a silent mismatch would put an
# uncomparable clip into a batch and nothing downstream would notice.

def test_duration_snaps_to_what_veo_actually_offers():
    """ClipSpec defaults to 15s. Veo takes "4", "6" or "8" — as strings. Asking for 15
    does not get a shorter clip, it gets an error."""
    assert veo_duration(15.0) == "8"
    assert veo_duration(4.2) == "4"
    assert veo_duration(6.0) == "6"
    assert veo_duration(0.5) == "4"


def test_a_tie_rounds_down():
    """5s is equidistant from 4 and 6. The hook is the first three seconds and carries 40%
    of the score, so the shorter clip wastes less on material the score barely weighs."""
    assert veo_duration(5.0) == "4"
    assert veo_duration(7.0) == "6"


def test_the_body_matches_the_documented_shape():
    spec = ClipSpec(id="ad_01", label="x", prompt="a thing", duration_s=8, aspect="9:16")
    body = veo_request(spec)
    assert body["instances"] == [{"prompt": "a thing"}]
    assert body["parameters"]["aspectRatio"] == "9:16"
    assert body["parameters"]["durationSeconds"] == "8"     # a string, not a number
    assert body["parameters"]["resolution"] == "720p"


def test_an_unsupported_aspect_is_refused_rather_than_substituted():
    """Veo has no 1:1. Quietly returning 16:9 would put a clip in the batch that cannot be
    compared with the rest of it, which is the failure this whole pipeline exists to avoid."""
    spec = ClipSpec(id="ad_01", label="x", prompt="y", aspect="1:1")
    with pytest.raises(RuntimeError) as e:
        veo_request(spec)
    assert "1:1" in str(e.value)


def test_vendor_hints_pass_through_without_inventing_dialect():
    spec = ClipSpec(id="ad_01", label="x", prompt="y", aspect="16:9",
                    extra={"negativePrompt": "no text", "seed": 7, "ignored": "x"})
    params = veo_request(spec)["parameters"]
    assert params["negativePrompt"] == "no text" and params["seed"] == 7
    assert "ignored" not in params


def test_a_finished_operation_yields_the_file_uri():
    op = {"done": True, "response": {"generateVideoResponse": {
        "generatedSamples": [{"video": {"uri": "https://example/v.mp4"}}]}}}
    assert veo_video_uri(op) == "https://example/v.mp4"


def test_a_safety_refusal_is_reported_as_one():
    """A done operation with no samples is the normal shape of a filtered generation.
    Calling it 'no video' would send someone debugging the pipeline for a rejected prompt."""
    op = {"done": True, "response": {"generateVideoResponse": {
        "generatedSamples": [], "raiMediaFilteredCount": 2,
        "raiMediaFilteredReasons": ["prompt violated policy"]}}}
    with pytest.raises(RuntimeError) as e:
        veo_video_uri(op)
    assert "filtered" in str(e.value)
    assert "retrying it will not" in str(e.value)


def test_an_operation_error_carries_the_vendors_own_words():
    op = {"done": True, "error": {"message": "model not found"}}
    with pytest.raises(RuntimeError) as e:
        veo_video_uri(op)
    assert "model not found" in str(e.value)


def test_an_empty_response_is_not_silently_a_success():
    with pytest.raises(RuntimeError):
        veo_video_uri({"done": True, "response": {}})
