#!/usr/bin/env python3
"""
test_build_events.py — GPU-free smoke test for batch_extract.build_events.

This pins the neuralset event-schema contract described in build_events' docstring:
a single-row Video events df, run through ExtractAudioFromVideo + ChunkEvents, must
come back with BOTH Audio and Video event rows. It does NOT run the model (no GPU,
no gated weights) — it only exercises the event-building transforms.

Guarded twice so it is safe on a CPU-only contributor box:
  - skips entirely unless `neuralset` is importable (the GPU stack);
  - skips if imageio-ffmpeg (the mp4 muxer) is unavailable.

Run:  ./.venv/bin/python -m pytest tests/test_build_events.py -s
"""
import os
import shutil
import subprocess
import sys

import pytest

# neuralset is the GPU/inference stack; on a CPU box this skips the whole module.
pytest.importorskip("neuralset")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def _make_silent_mp4(path, seconds=5):
    """Synthesize a ~5s black clip WITH a silent audio track (anullsrc), so
    ExtractAudioFromVideo has an audio stream to derive Audio events from.
    Skips the test if the bundled ffmpeg isn't available."""
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"imageio-ffmpeg unavailable ({e}); cannot synthesize mp4")
    cmd = [
        ffmpeg, "-y",
        "-f", "lavfi", "-i", f"color=c=black:s=128x72:r=12:d={seconds}",
        "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
        "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", str(path),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"ffmpeg failed to synthesize silent mp4 ({e})")


def test_build_events_has_audio_and_video(tmp_path):
    mp4 = tmp_path / "silent_5s.mp4"
    _make_silent_mp4(mp4, seconds=5)

    import batch_extract
    df = batch_extract.build_events(str(mp4))

    # print the resolved event-schema columns once so the contract is captured
    print("\n[build_events] resolved columns:", list(df.columns))

    assert len(df) > 0, "build_events returned an empty events df"
    types = set(str(t) for t in df["type"])
    assert "Audio" in types, f"no Audio event rows (types seen: {sorted(types)})"
    assert "Video" in types, f"no Video event rows (types seen: {sorted(types)})"


def test_trimodal_transform_chain_constructs():
    """The TRIMODAL text branch must import + construct with build_events' exact kwargs.

    This catches an upstream rename of ``ExtractWordsFromAudio`` (tribev2) or
    ``AddText`` / ``AddSentenceToWords`` / ``AddContextToWords`` / ``RemoveMissing``
    (neuralset) — the break that would otherwise surface only mid-batch on a rented A100.
    Cheap on purpose: constructs the transforms but does NOT run whisperx."""
    pytest.importorskip("tribev2")
    from tribev2.eventstransforms import ExtractWordsFromAudio
    from neuralset.events.transforms import (
        AddText, AddSentenceToWords, AddContextToWords, RemoveMissing,
    )
    # exact kwargs used by batch_extract.build_events(trimodal=True)
    ExtractWordsFromAudio()
    AddText()
    AddSentenceToWords(max_unmatched_ratio=0.05)
    AddContextToWords(sentence_only=False, max_context_len=1024, split_field="")
    RemoveMissing()


@pytest.mark.skipif(
    shutil.which("uvx") is None or not os.environ.get("SOMA_RUN_WHISPERX"),
    reason="full trimodal build runs whisperx (heavy: downloads large-v3). Set "
           "SOMA_RUN_WHISPERX=1 with uvx on PATH (e.g. on the GPU box) to exercise it.")
def test_build_events_trimodal_end_to_end(tmp_path):
    """Opt-in end-to-end: the full trimodal build (transcribe -> text events) must run.

    Uses a silent clip, so whisperx yields no Word rows, but the whole chain
    (ExtractWordsFromAudio -> AddText -> ... -> RemoveMissing) must complete and still
    return Audio+Video events. Only runs when SOMA_RUN_WHISPERX=1 and uvx is present."""
    mp4 = tmp_path / "clip.mp4"
    _make_silent_mp4(mp4, seconds=5)

    import batch_extract
    df = batch_extract.build_events(str(mp4), trimodal=True)
    assert len(df) > 0, "trimodal build_events returned an empty events df"
    types = set(str(t) for t in df["type"])
    assert "Audio" in types and "Video" in types, f"types seen: {sorted(types)}"
