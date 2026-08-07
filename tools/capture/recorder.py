#!/usr/bin/env python3
"""
recorder.py — an append-only record of what a pipeline run ACTUALLY did.

    Recorder(work_dir) -> run.jsonl -> tools/capture/summarize.py -> a page

WHY THIS EXISTS. `/demo` narrates the pipeline. Narration is exactly the thing an
investor cannot check, and this repo has already been burned by it: docs/strategy/PLAN.md
§ 0.3 is a list of claims the site made that no artifact in the tree supported. A page
that says "then we score it on the GPU" is worth nothing if no GPU was involved, and
worth nothing MORE than the truth if one was — because the reader cannot tell the two
apart.

So nothing here is written by hand. Every line of run.jsonl is emitted by the code that
did the work, at the moment it did it, and carries the artifact it produced: a path, a
byte count and a sha256. The page downstream renders that record and nothing else. If a
stage did not run, the record says so and the page says so, in the same type size as the
stages that did.

THE INVARIANT THAT MAKES THIS WORTH TRUSTING, and the reason for most of the asserts
below: **the recorder can only report what it observed.** It never fills in a plausible
value. Three consequences, each of which cost something to get right:

  * A stage that raises ends `failed` with the exception text, not `ok`. The context
    manager does this in __exit__, so no caller can forget.
  * A stage that is skipped MUST supply a reason. `skipped` with no reason raises, so
    "we didn't run the encoder" can never render as an unexplained gap.
  * The environment fingerprint records ABSENCE as a value. On this laptop torch is not
    installed, so `torch: {"present": false}` — and the encoder stage that follows is
    honestly `skipped`, rather than silently producing numbers from somewhere else.

That last one is the whole point. The device a run used is the single fact that decides
whether "we scored it on the GPU" is a true sentence, so it is observed from the running
process (torch.cuda.get_device_name) rather than inferred from a flag anyone could pass.

USAGE

    rec = Recorder(work_dir, run_id="9f3c8a12")
    rec.env()                                   # fingerprint the box, once
    with rec.stage("shots", "Shot detection") as st:
        st.fact(threshold=0.28, shots=len(shots))
        st.artifact(manifest_path, kind="manifest")
    rec.finish()

Stdlib only. This runs on the scorer box next to ingest_partner_ad.py, which is also
stdlib + ffmpeg, and adding a dependency to the thing whose job is provenance would be a
poor trade.
"""

import contextlib
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

# Stage keys the page knows how to title and order. A run may legitimately emit a subset
# (a one-shot ad renders nothing), but a key NOT in here means the page and the pipeline
# have drifted apart — summarize.py --check fails on it rather than rendering an untitled
# box. Keep this list and src/lib/run-capture.ts's STAGE_TITLES in step.
STAGE_KEYS = (
    "probe",     # what came in: bytes, duration, dimensions, hash
    "shots",     # ffmpeg scene detection
    "render",    # the re-cut ladder, encoded for real
    "encode",    # TRIBE v2 forward pass — the GPU step
    "score",     # percentile / within-item collapse to a read-out
    "posters",   # one frame per ad, for the library grid
    "publish",   # storage objects + rows + the customer's URL
)

_TERMINAL = ("ok", "skipped", "failed")


def _utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_of(path: Path, chunk=1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def _cmd_version(argv, first_line=True):
    """Best-effort version string for a system tool. Absence is a value, not an error."""
    exe = shutil.which(argv[0])
    if not exe:
        return None
    try:
        out = subprocess.run(argv, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    text = (out.stdout or out.stderr or "").strip()
    if not text:
        return None
    return text.splitlines()[0].strip() if first_line else text


def probe_torch():
    """What compute this box actually has, observed rather than assumed.

    Returns a dict that is safe to render verbatim. `present: False` is the normal answer
    on a developer laptop and is NOT a failure — it is the fact that makes the encoder
    stage below it honestly skipped instead of quietly fabricated.
    """
    try:
        import torch                                                     # noqa: PLC0415
    except Exception as e:                                               # noqa: BLE001
        return {"present": False, "reason": f"{type(e).__name__}: {e}"}

    info = {"present": True, "version": torch.__version__, "devices": []}
    try:
        if torch.cuda.is_available():
            info["backend"] = "cuda"
            info["cudaVersion"] = torch.version.cuda
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                info["devices"].append({
                    "index": i,
                    "name": torch.cuda.get_device_name(i),
                    "totalMemoryMb": round(props.total_memory / (1 << 20)),
                })
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            # Worth distinguishing loudly. MPS runs the graph but is not the box the
            # timings in docs/strategy/PLAN.md were costed on, so a run here is not
            # evidence about throughput on a rented CUDA box.
            info["backend"] = "mps"
        else:
            info["backend"] = "cpu"
    except Exception as e:                                               # noqa: BLE001
        info["backend"] = "unknown"
        info["reason"] = f"{type(e).__name__}: {e}"
    return info


def probe_tribe_weights():
    """Is facebook/tribev2 on this box, and where.

    The weights are CC BY-NC 4.0 behind a click-through that tools/concierge/provision.sh
    deliberately refuses to automate ("a human agreeing to a licence, so it stays
    manual"). So their absence is the single most common reason a run cannot encode, and
    it deserves to be named in the record rather than surfacing as a stack trace.
    """
    home = os.environ.get("HF_HOME") or os.environ.get("HUGGINGFACE_HUB_CACHE")
    roots = [Path(home)] if home else []
    roots += [Path.home() / ".cache" / "huggingface"]
    for root in roots:
        for sub in (root / "hub", root):
            hit = sub / "models--facebook--tribev2"
            if hit.exists():
                return {"present": True, "path": str(hit)}
    return {"present": False, "searched": [str(r) for r in roots]}


class Stage:
    """A live stage. Only the Recorder constructs these."""

    def __init__(self, rec, key, title):
        self.rec = rec
        self.key = key
        self.title = title
        self.started = time.monotonic()
        self.status = "ok"
        self.reason = None

    def fact(self, **kv):
        """A measured value. Keys land on the page as a label/value row."""
        self.rec._write("fact", stage=self.key, values=_jsonable(kv))
        return self

    def artifact(self, path, role="file", label=None):
        """A file this stage produced, addressed by content.

        A MISSING file is recorded as missing rather than skipped. A record that silently
        omits the artifact it failed to write is how a page ends up claiming a rendered
        cut that is not on disk.

        `role` rather than `kind` because `kind` is the event's own discriminator in
        run.jsonl, and a payload key that shadows it would have silently rewritten the
        event type — which is the one field the whole reader dispatches on.
        """
        p = Path(path)
        if not p.exists():
            self.rec._write("artifact", stage=self.key, role=role, label=label,
                            path=self.rec._rel(p), present=False)
            return self
        self.rec._write("artifact", stage=self.key, role=role, label=label,
                        path=self.rec._rel(p), present=True,
                        bytes=p.stat().st_size, sha256=sha256_of(p))
        return self

    def log(self, text, stream="stdout"):
        """Raw tool output, kept verbatim. This is the grit."""
        for line in str(text).splitlines():
            if line.strip():
                self.rec._write("log", stage=self.key, stream=stream, text=line.rstrip())
        return self

    def skip(self, reason):
        """End this stage as not-run, with a reason that will be shown.

        The reason is mandatory on purpose — see the module docstring. An unexplained gap
        on the page is indistinguishable from a bug.
        """
        if not str(reason or "").strip():
            raise ValueError("skip() needs a reason — an unexplained gap is not a record")
        self.status = "skipped"
        self.reason = str(reason).strip()
        return self

    def fail(self, reason):
        self.status = "failed"
        self.reason = str(reason).strip() or "failed"
        return self


class Recorder:
    """Writes run.jsonl. One per pipeline run."""

    def __init__(self, work_dir, run_id, argv=None, enabled=True):
        self.enabled = bool(enabled)
        self.work = Path(work_dir)
        self.run_id = run_id
        self.path = self.work / "run.jsonl"
        self.seq = 0
        self.t0 = time.monotonic()
        self._fh = None
        self._stages = []
        if not self.enabled:
            return
        self.work.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "w", encoding="utf-8")
        self._write("run.begin", runId=run_id, startedAt=_utc_now(),
                    argv=[str(a) for a in (argv or sys.argv)])

    # -- writing ---------------------------------------------------------------

    def _rel(self, p: Path):
        """Paths are recorded relative to the repo when they live under it, so a capture
        is portable and a committed one does not leak an operator's home directory."""
        p = Path(p)
        try:
            return str(p.resolve().relative_to(ROOT))
        except ValueError:
            return str(p)

    def _write(self, kind, **payload):
        if not self.enabled or self._fh is None:
            return
        self.seq += 1
        rec = {"seq": self.seq, "tMs": round((time.monotonic() - self.t0) * 1000),
               "kind": kind, **payload}
        self._fh.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
        self._fh.flush()   # a killed run keeps everything it had already earned

    # -- api -------------------------------------------------------------------

    def env(self, extra=None):
        """Fingerprint the box once, before any work. This is the block a reader checks
        first, because it is what decides whether the rest of the record means anything."""
        payload = {
            "host": platform.node(),
            "platform": platform.platform(),
            "python": platform.python_version(),
            "git": _cmd_version(["git", "rev-parse", "--short", "HEAD"]),
            "ffmpeg": _cmd_version(["ffmpeg", "-version"]),
            "tesseract": _cmd_version(["tesseract", "--version"]),
            "torch": probe_torch(),
            "tribeWeights": probe_tribe_weights(),
            "fasterWhisper": _module_version("faster_whisper"),
            **(extra or {}),
        }
        self._write("env", **payload)
        return payload

    @contextlib.contextmanager
    def stage(self, key, title):
        """Run a stage, recording its outcome whatever happens.

        An exception propagates (the caller still decides what a failure means) but is
        recorded as `failed` on the way past, so a crashed run produces a truthful record
        rather than a stage that simply stops mid-sentence.
        """
        if key not in STAGE_KEYS:
            raise ValueError(f"unknown stage key {key!r} — add it to STAGE_KEYS and the page")
        st = Stage(self, key, title)
        self._write("stage.begin", stage=key, title=title)
        try:
            yield st
        except BaseException as e:
            st.status = "failed"
            st.reason = f"{type(e).__name__}: {e}"
            raise
        finally:
            assert st.status in _TERMINAL, f"bad stage status {st.status!r}"
            if st.status != "ok" and not st.reason:
                st.reason = "no reason recorded"
            self._stages.append(st.key)
            self._write("stage.end", stage=key, status=st.status, reason=st.reason,
                        elapsedMs=round((time.monotonic() - st.started) * 1000))

    def run_logged(self, stage: Stage, cmd, cwd=None, env=None):
        """Run a subprocess, tee its output to the terminal AND into the record.

        The scoring pass is the stage a reader most wants to see raw, and it is the one
        that used to vanish: ingest_partner_ad.py let process_batch.py inherit stdout, so
        the GPU log went to a terminal nobody kept. Streaming line-by-line rather than
        capturing at the end means a forty-minute run is watchable while it happens.
        """
        stage.fact(command=" ".join(str(c) for c in cmd))
        proc = subprocess.Popen(
            [str(c) for c in cmd], cwd=str(cwd) if cwd else None, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
        for line in proc.stdout:                      # type: ignore[union-attr]
            sys.stdout.write(line)
            stage.log(line)
        proc.wait()
        stage.fact(exitCode=proc.returncode)
        return proc.returncode

    def finish(self, status="ok", **outputs):
        if not self.enabled:
            return None
        self._write("run.end", status=status,
                    elapsedMs=round((time.monotonic() - self.t0) * 1000),
                    stages=list(self._stages), **_jsonable(outputs))
        self._fh.close()                              # type: ignore[union-attr]
        self._fh = None
        return self.path


def _module_version(name):
    try:
        mod = __import__(name)
    except Exception:                                                    # noqa: BLE001
        return {"present": False}
    return {"present": True, "version": getattr(mod, "__version__", None)}


def _jsonable(obj):
    """Paths and tuples appear all over the pipeline; make them survive json.dumps
    without every caller remembering to convert. Anything exotic falls back to repr via
    json's default=str, which is set at the write site."""
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    if isinstance(obj, Path):
        return str(obj)
    return obj
