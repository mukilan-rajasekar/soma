"""
test_capture.py — the recorder cannot report what it did not observe.

These are not tests of formatting. Each one pins an invariant that, if it broke, would let
/run make a claim the pipeline never earned — which is the single failure mode the whole
capture layer exists to prevent. The interesting ones:

  * a stage that raises is recorded `failed`, even though the exception propagates
  * `skip()` without a reason raises, so an unexplained gap cannot reach the page
  * the fold's counts are derived from the stages, so they cannot be edited apart
  * an unknown stage key fails the fold instead of rendering as an untitled box

The committed capture is checked too, because it is what /run actually renders.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.capture.recorder import STAGE_KEYS, Recorder, sha256_of      # noqa: E402
from tools.capture.summarize import (                                   # noqa: E402
    CAPTURE, REDACTED, fold, read_events, redact_argv, redact_env, serialize,
)


def events_of(path: Path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def make(tmp_path, run_id="testrun"):
    return Recorder(tmp_path, run_id, argv=["test"])


# ---------------------------------------------------------------- the recorder

def test_ok_stage_is_recorded_ok(tmp_path):
    rec = make(tmp_path)
    with rec.stage("probe", "t") as st:
        st.fact(a=1)
    rec.finish()
    ends = [e for e in events_of(rec.path) if e["kind"] == "stage.end"]
    assert [e["status"] for e in ends] == ["ok"]


def test_a_raising_stage_is_recorded_failed_and_still_raises(tmp_path):
    """The exception must reach the caller AND the record must not say `ok`.

    Recording in `finally` rather than after the body is what buys this; an earlier shape
    that recorded on the success path left a crashed run looking like it simply stopped.
    """
    rec = make(tmp_path)
    with pytest.raises(RuntimeError):
        with rec.stage("encode", "t"):
            raise RuntimeError("cuda oom")
    rec.finish(status="failed")
    end = [e for e in events_of(rec.path) if e["kind"] == "stage.end"][0]
    assert end["status"] == "failed"
    assert "cuda oom" in end["reason"]


def test_skip_without_a_reason_is_refused(tmp_path):
    rec = make(tmp_path)
    with pytest.raises(ValueError):
        with rec.stage("encode", "t") as st:
            st.skip("")
    rec.finish()


def test_skip_reason_survives_to_the_record(tmp_path):
    rec = make(tmp_path)
    with rec.stage("encode", "t") as st:
        st.skip("torch is not installed on this host")
    rec.finish()
    end = [e for e in events_of(rec.path) if e["kind"] == "stage.end"][0]
    assert end["status"] == "skipped"
    assert end["reason"] == "torch is not installed on this host"


def test_unknown_stage_key_is_refused_at_the_source(tmp_path):
    rec = make(tmp_path)
    with pytest.raises(ValueError):
        with rec.stage("teleport", "t"):
            pass


def test_a_missing_artifact_is_recorded_as_missing_not_dropped(tmp_path):
    """Silence about a file that should exist is the same as claiming it does."""
    rec = make(tmp_path)
    with rec.stage("render", "t") as st:
        st.artifact(tmp_path / "never-written.mp4", role="video")
    rec.finish()
    art = [e for e in events_of(rec.path) if e["kind"] == "artifact"][0]
    assert art["present"] is False
    assert "sha256" not in art


def test_artifact_hash_is_the_real_hash(tmp_path):
    f = tmp_path / "a.bin"
    f.write_bytes(b"soma")
    rec = make(tmp_path)
    with rec.stage("probe", "t") as st:
        st.artifact(f, role="source")
    rec.finish()
    art = [e for e in events_of(rec.path) if e["kind"] == "artifact"][0]
    assert art["sha256"] == sha256_of(f)
    assert art["bytes"] == 4


def test_artifact_role_does_not_clobber_the_event_kind(tmp_path):
    """Regression: the field was named `kind`, which overwrote the event discriminator
    and raised TypeError — the reader dispatches on `kind`, so the collision was fatal."""
    rec = make(tmp_path)
    f = tmp_path / "a.bin"
    f.write_bytes(b"x")
    with rec.stage("probe", "t") as st:
        st.artifact(f, role="source")
    rec.finish()
    art = [e for e in events_of(rec.path) if e.get("role") == "source"][0]
    assert art["kind"] == "artifact"


def test_disabled_recorder_writes_nothing(tmp_path):
    rec = Recorder(tmp_path, "x", enabled=False)
    rec.env()
    with rec.stage("probe", "t") as st:
        st.fact(a=1)
    rec.finish()
    assert not (tmp_path / "run.jsonl").exists()


# -------------------------------------------------------------------- the fold

def test_fold_counts_are_derived_from_the_stages(tmp_path):
    rec = make(tmp_path)
    rec.env()
    with rec.stage("probe", "t"):
        pass
    with rec.stage("encode", "t") as st:
        st.skip("no torch")
    rec.finish(status="partial")
    folded = fold(events_of(rec.path))
    assert folded["counts"] == {"ok": 1, "skipped": 1, "failed": 0}
    assert folded["status"] == "partial"
    assert [s["key"] for s in folded["stages"]] == ["probe", "encode"]


def test_fold_is_deterministic(tmp_path):
    """--check compares bytes, so an unstable fold would fail the gate at random."""
    rec = make(tmp_path)
    rec.env()
    with rec.stage("probe", "t") as st:
        st.fact(b=2, a=1)
    rec.finish()
    evs = events_of(rec.path)
    assert serialize(fold(evs)) == serialize(fold(evs))


def test_redact_argv_hides_owner_email_and_keeps_the_flag():
    """ /run prints argv; a partner email must not survive the publish fold."""
    argv = [
        "scripts/ingest_partner_ad.py",
        "ad.mp4",
        "brief.json",
        "--owner-email",
        "founder@brand.com",
        "--dry-run",
        "--token=sekrit",
        "other@example.com",
    ]
    out = redact_argv(argv)
    assert out == [
        "scripts/ingest_partner_ad.py",
        "ad.mp4",
        "brief.json",
        "--owner-email",
        REDACTED,
        "--dry-run",
        f"--token={REDACTED}",
        REDACTED,
    ]
    assert "founder@brand.com" not in out
    assert "sekrit" not in out


def test_fold_redacts_owner_email_from_argv_and_env(tmp_path):
    rec = Recorder(
        tmp_path, "pii",
        argv=["scripts/ingest_partner_ad.py", "--owner-email", "founder@brand.com"],
    )
    rec.env(extra={"ownerEmail": "founder@brand.com", "dryRun": True})
    with rec.stage("probe", "t"):
        pass
    rec.finish()
    folded = fold(events_of(rec.path))
    assert folded["argv"] == [
        "scripts/ingest_partner_ad.py", "--owner-email", REDACTED,
    ]
    assert folded["env"]["ownerEmail"] == REDACTED
    assert folded["env"]["dryRun"] is True
    assert "founder@brand.com" not in serialize(folded)


def test_redact_env_leaves_compute_fingerprint_alone():
    env = redact_env({
        "host": "box",
        "dryRun": True,
        "ownerEmail": "x@y.z",
        "torch": {"present": False},
    })
    assert env["ownerEmail"] == REDACTED
    assert env["host"] == "box"
    assert env["torch"] == {"present": False}


def test_fold_refuses_a_stage_the_page_cannot_title(tmp_path):
    rec = make(tmp_path)
    with rec.stage("probe", "t"):
        pass
    rec.finish()
    evs = events_of(rec.path)
    for e in evs:
        if e.get("stage") == "probe":
            e["stage"] = "teleport"
    with pytest.raises(SystemExit):
        fold(evs)


def test_a_run_that_died_mid_stage_does_not_fold_to_ok(tmp_path):
    """A killed run has a stage.begin with no stage.end. That must not read as success."""
    rec = make(tmp_path)
    rec._write("stage.begin", stage="encode", title="TRIBE v2")
    folded = fold(events_of(rec.path))
    assert folded["stages"][0]["status"] == "failed"
    assert folded["status"] == "incomplete"


# ------------------------------------------------------- the committed capture

def test_committed_capture_exists_and_is_internally_consistent():
    assert CAPTURE.exists(), "src/data/run-capture.json is what /run renders"
    cap = json.loads(CAPTURE.read_text())
    stages = cap["stages"]
    assert stages, "a capture with no stages renders an empty page"
    assert cap["counts"]["ok"] == sum(1 for s in stages if s["status"] == "ok")
    assert cap["counts"]["skipped"] == sum(1 for s in stages if s["status"] == "skipped")
    assert cap["counts"]["failed"] == sum(1 for s in stages if s["status"] == "failed")
    for s in stages:
        assert s["key"] in STAGE_KEYS
        if s["status"] != "ok":
            assert (s["reason"] or "").strip(), f"{s['key']} is {s['status']} with no reason"
    # The committed capture is public; an email here is an email on /run.
    blob = CAPTURE.read_text()
    assert "@" not in "".join(cap.get("argv") or []), blob
    assert cap.get("env", {}).get("ownerEmail") in (None, REDACTED)


def test_committed_capture_still_matches_its_source():
    """The same assertion scripts/verify.sh makes, so `pytest` alone catches the drift."""
    cap = json.loads(CAPTURE.read_text())
    src = ROOT / cap["sourceJsonl"]
    assert src.exists(), f"{cap['sourceJsonl']} is missing; the page cannot be re-derived"
    assert CAPTURE.read_text() == serialize(fold(read_events(src), source=cap["sourceJsonl"]))


def test_summarize_check_fails_when_the_capture_is_edited(tmp_path):
    """The property the whole layer rests on: you cannot hand-edit the page's data.

    Runs the real CLI against a tampered copy rather than calling fold() directly, because
    the gate runs the CLI and an exit code is what it reads.
    """
    cap = json.loads(CAPTURE.read_text())
    tampered = dict(cap)
    tampered["stages"] = [dict(s) for s in cap["stages"]]
    tampered["stages"][0]["status"] = "ok"
    tampered["stages"][0]["elapsedMs"] = 447000

    backup = CAPTURE.read_text()
    try:
        CAPTURE.write_text(json.dumps(tampered, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
        proc = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "capture" / "summarize.py"), "--check"],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        assert proc.returncode != 0, "a tampered capture passed the check"
        assert "does not match" in (proc.stdout + proc.stderr)
    finally:
        CAPTURE.write_text(backup)
