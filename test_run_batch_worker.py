#!/usr/bin/env python3
"""
test_run_batch_worker.py — queue-claiming and lifecycle-email helpers.

These paths are the new "autonomous worker" surface of tools/concierge/run_batch.py.
They are exactly the kind of logic that can silently regress while the happy-path manual
run still works, so they are pinned separately from the publish gate tests.
"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _load_runner():
    path = ROOT / "tools" / "concierge" / "run_batch.py"
    spec = importlib.util.spec_from_file_location("soma_run_batch", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = _load_runner()


class FakeSupabase:
    def __init__(self, rows, claimed_ids=()):
        self.rows = rows
        self.claimed_ids = set(claimed_ids)
        self.patches = []

    def select(self, _table, _query):
        return list(self.rows)

    def patch(self, _table, query, row):
        self.patches.append((query, row))
        batch_id = query.split("id=eq.", 1)[1].split("&", 1)[0]
        if batch_id in self.claimed_ids:
            return []
        self.claimed_ids.add(batch_id)
        return [{"id": batch_id, "status": row["status"]}]


def test_build_processing_email_includes_live_run_url(monkeypatch):
    monkeypatch.setenv("PUBLIC_APP_URL", "https://www.usesoma.work")
    msg = runner.build_batch_email("processing", {
        "email": "team@example.com",
        "share_token": "abc123",
        "batch_name": "Q3 hook test",
    })
    assert msg["to"] == "team@example.com"
    assert "Q3 hook test" in msg["subject"]
    assert "https://www.usesoma.work/r/abc123" in msg["text"]


def test_build_failed_email_carries_reason(monkeypatch):
    monkeypatch.setenv("PUBLIC_APP_URL", "https://www.usesoma.work")
    msg = runner.build_batch_email("failed", {
        "email": "team@example.com",
        "share_token": "deadbeef",
        "batch_name": "Batch 7",
    }, reason="The scorer stopped.")
    assert "Batch 7" in msg["subject"]
    assert "The scorer stopped." in msg["text"]
    assert "/r/deadbeef" in msg["text"]


def test_build_email_returns_none_without_address():
    assert runner.build_batch_email("done", {"share_token": "abc"}) is None
    assert runner.build_batch_email("done", {"email": "x@example.com"}) is None


def test_claim_oldest_queued_skips_lost_race():
    sb = FakeSupabase(
        rows=[
            {"id": "batch-1", "status": "queued"},
            {"id": "batch-2", "status": "queued"},
        ],
        claimed_ids={"batch-1"},
    )
    claimed = runner.claim_oldest_queued(sb)
    assert claimed == {"id": "batch-2", "status": "processing"}
    assert len(sb.patches) == 2


def test_claim_oldest_queued_returns_none_when_queue_empty():
    sb = FakeSupabase(rows=[])
    assert runner.claim_oldest_queued(sb) is None


# ── what a failure is allowed to say to a customer ──────────────────────────────
#
# `batches.error` is rendered verbatim on /r/<token>, which is a capability URL a
# customer opens. Both strings below are REAL scorer output captured from live runs
# against Supabase, which is how the leak was found in the first place.

INSTALL_FAILURE = """  pip install 'numpy>=1.26,<2.1'   # HARD pin; >=2.1 segfaults neuralset
  pip install torch --index-url <matching the box's CUDA>
  pip install neuralset tribev2 huggingface_hub transformers nibabel
  huggingface-cli login            # facebook/tribev2 weights are gated"""

BUCKET_FAILURE = ("Ads span multiple duration categories: ad_01.mp4=>60s, "
                  "ad_02.mp4=21-35s. Length is a confound; length-match the batch. "
                  "Pass --force to downgrade this to a warning.")


def test_install_instructions_never_reach_the_customer():
    """The regression this function exists for: a box without the model published an
    install guide to a customer's result page."""
    msg = runner.customer_reason(INSTALL_FAILURE)
    for leak in ("pip install", "huggingface", "CUDA", "segfault", "numpy", "torch"):
        assert leak.lower() not in msg.lower(), f"{leak!r} leaked into {msg!r}"
    assert msg == runner.GENERIC_SCORER_FAILURE


def test_a_batch_shape_problem_is_passed_through():
    """This one the customer caused and can fix, so hiding it would be unhelpful."""
    msg = runner.customer_reason(BUCKET_FAILURE)
    assert "duration categories" in msg
    assert "length-match" in msg


def test_the_operator_instruction_is_stripped_from_a_passed_through_message():
    """`--force` is a flag only whoever runs the box has. Keeping the useful sentence
    while dropping the one addressed to an operator is the whole point of splitting on
    sentences rather than filtering the blob as a unit."""
    msg = runner.customer_reason(BUCKET_FAILURE)
    assert "--force" not in msg
    assert "downgrade this to a warning" not in msg


def test_empty_scorer_output_still_says_something_honest():
    for blank in ("", "   ", "\n\n"):
        assert runner.customer_reason(blank) == runner.GENERIC_SCORER_FAILURE


def test_generic_failure_does_not_blame_the_customers_footage():
    """A run that died on our infrastructure must not read as 'your ads were bad'."""
    msg = runner.GENERIC_SCORER_FAILURE.lower()
    assert "on our side" in msg
    assert "your footage" in msg


# ── what the worker does after an interrupt ─────────────────────────────────────
#
# The systemd unit sends SIGINT rather than SIGTERM for one reason: run_batch() turns
# KeyboardInterrupt into a `failed` row, so an interrupted run closes itself out instead
# of being stranded on `processing` forever.
#
# That guarantee is only worth anything if the WATCH LOOP also stops. It used to return
# fail()'s 1, which run_watch() reads as an ordinary batch failure — so the loop carried
# on, claimed the next queued batch, and systemd SIGKILLed the process ~90s later with
# that second row stuck on `processing`. The unit's whole justification defeated itself
# on the second batch.


class _InterruptingSupabase:
    """Raises KeyboardInterrupt where a real run would be doing long work, and records
    the row writes that follow."""

    def __init__(self):
        self.patches = []

    def select(self, _table, _query):
        raise KeyboardInterrupt

    def patch(self, _table, query, row):
        self.patches.append((query, row))
        return [{"id": "b"}]


class _Args:
    workdir = None
    dry_run = False
    keep_workdir = True
    poll_seconds = 1
    python = "python3"
    modality = "av"
    skip_tribe = False


def test_an_interrupted_run_closes_its_own_row(tmp_path):
    """The promise the systemd unit is built on: SIGINT means the batch is marked failed
    rather than left on `processing` forever."""
    sb = _InterruptingSupabase()
    args = _Args()
    args.workdir = str(tmp_path / "wd")
    runner.run_batch(sb, {"id": "b", "status": "processing", "batch_name": "x"}, args)
    statuses = [row.get("status") for _q, row in sb.patches]
    assert "failed" in statuses, f"interrupted run did not close its row: {sb.patches}"


def test_an_interrupted_run_does_not_look_like_an_ordinary_failure(tmp_path):
    """THE REGRESSION, and the reason this is asserted on run_batch rather than on the
    watch loop: the handler used to `return fail(...)`, which is 1 — indistinguishable
    from a batch that simply failed. run_watch() carries on after an ordinary failure, so
    it claimed the next batch, and systemd SIGKILLed the process with that second row
    stuck on `processing`. The exit code IS the fix; the guard in run_watch() only makes
    it explicit."""
    sb = _InterruptingSupabase()
    args = _Args()
    args.workdir = str(tmp_path / "wd")
    rc = runner.run_batch(sb, {"id": "b", "status": "processing", "batch_name": "x"}, args)
    assert rc == runner.INTERRUPTED, f"interrupt returned {rc}, which run_watch reads as 'carry on'"
    assert rc != 1


def test_interrupt_is_distinguishable_from_failure():
    assert runner.INTERRUPTED == 130
    assert runner.INTERRUPTED != 1
