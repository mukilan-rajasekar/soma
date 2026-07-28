#!/usr/bin/env python3
"""
run_batch.py — take one queued batch from the site all the way to a delivered read-out.

This is the missing middle of the concierge loop. Before it, intake and delivery were
connected by a person doing this by hand for twenty minutes: read the row, download the
files, hand-write a manifest, run the scorer, read four lines of output to decide whether
the numbers were trustworthy, copy the JSON into public/, rebuild, and email a link.

    /upload  ->  batches (queued)  ->  [ THIS SCRIPT ]  ->  batches (done)  ->  /r/<token>

WHAT IT DOES, in order, and it stops at the first thing that is not right:

    1  claim     queued -> processing, so two operators cannot run the same batch twice
    2  fetch     the batch row and its upload rows, ordered by ad_id
    3  download  each object out of the private bucket to <workdir>/batch/<ad_id>.mp4
    4  manifest  batches.manifest written to disk VERBATIM (see below)
    5  score     demo/process_batch.py, in place, from this checkout
    6  gate      the honesty checks that decide whether these numbers may be published
    7  upload    the web transcodes and posters to results/<batch_id>/
    8  publish   report + run log -> the row; status -> done

THE MANIFEST IS NOT BUILT HERE. It is written to disk exactly as it is stored, because
src/lib/batch.ts built it in the pipeline's own format at intake time. There is therefore
no translation step in this script that could disagree with the form, and no second place
that has to learn about a new manifest field. If you find yourself reshaping the manifest
here, the fix belongs in buildManifest() instead.

THE GATE IS THE POINT. demo/README.md lists four lines an operator must read before
trusting a run, and two of them are absolute: if the model's predictions come back bounded
[0,1] the whole signed-delta design is invalid, and if content-minus-black-screen does not
drive occipital cortex then a mask, the vertex order, or the timing alignment is wrong and
"no number in this file should be trusted." A human reading those by eye is a human who
will eventually be tired. Here they are conditions: fail either and the batch goes to
`failed` with the reason, and NOTHING is published to the customer. Publishing a number we
cannot stand behind is the one outcome this script exists to make impossible.

USAGE

    # what is waiting
    python tools/concierge/run_batch.py --list

    # run one (id or share token)
    python tools/concierge/run_batch.py 9f3c...  --workdir /tmp/soma-run

    # re-score without the GPU, from the preds cache (see demo/README.md)
    python tools/concierge/run_batch.py <id> --skip-tribe

    # everything except the writes
    python tools/concierge/run_batch.py <id> --dry-run

Stdlib only (urllib + subprocess), matching publish_to_supabase.py: this has to run on a
rented box with the pipeline's requirements and nothing else installed.
"""

import argparse
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

BUCKET = "uploads"

# Same dual naming as publish_to_supabase.py, so one .env serves the Python pipeline and
# the Next runtime. Python names win when both are set: this IS the pipeline.
URL_VARS = ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
KEY_VARS = ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
RESEND_KEY_VARS = ("RESEND_API_KEY",)
RESEND_FROM_VARS = ("RESEND_FROM_EMAIL", "NOTIFY_FROM_EMAIL")
RESEND_REPLY_TO_VARS = ("RESEND_REPLY_TO_EMAIL", "NOTIFY_REPLY_TO_EMAIL")
APP_URL_VARS = ("PUBLIC_APP_URL", "APP_URL", "SITE_URL")
DEFAULT_APP_URL = "https://www.usesoma.work"
DEFAULT_POLL_SECONDS = 60

# How much of the run log to keep on the row. The full log stays on the box; this is the
# tail a person reads when asking "what happened", and it has to fit in a jsonb-adjacent
# text column without turning every row read into a megabyte.
RUN_LOG_TAIL_CHARS = 20_000


# ==============================================================================
# environment
# ==============================================================================

def env_any(names, default=""):
    for name in names:
        val = os.environ.get(name, "").strip()
        if val:
            return val
    return default


def load_dotenv():
    """Populate os.environ from .env, exactly as publish_to_supabase.py does. Never
    overrides a var already set in the real environment; skips placeholders."""
    for path in (Path.cwd() / ".env", ROOT / ".env"):
        if not path.exists():
            continue
        try:
            for line in path.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                if key.startswith("export "):
                    key = key[len("export "):].strip()
                val = val.strip().strip('"').strip("'")
                if not key or key in os.environ:
                    continue
                if "PASTE" in val or val.endswith("..."):
                    continue
                os.environ[key] = val
        except OSError:
            pass
        break


def app_url():
    return env_any(APP_URL_VARS, DEFAULT_APP_URL).rstrip("/")


# ==============================================================================
# supabase, over stdlib
# ==============================================================================

class Supabase:
    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.key = key

    def _headers(self, extra=None):
        h = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
        }
        if extra:
            h.update(extra)
        return h

    def _request(self, method, path, *, body=None, headers=None, raw=False):
        req = urllib.request.Request(
            self.url + path, data=body, method=method, headers=self._headers(headers)
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                payload = resp.read()
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:600]
            raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from None
        except urllib.error.URLError as e:
            raise RuntimeError(f"{method} {path} -> unreachable: {e.reason}") from None
        if raw:
            return payload
        return json.loads(payload) if payload else None

    # ---- postgrest ----------------------------------------------------------

    def select(self, table, query):
        return self._request("GET", f"/rest/v1/{table}?{query}",
                             headers={"Accept": "application/json"})

    def patch(self, table, query, row):
        return self._request(
            "PATCH", f"/rest/v1/{table}?{query}",
            body=json.dumps(row).encode("utf-8"),
            headers={"Content-Type": "application/json", "Prefer": "return=representation"},
        )

    # ---- storage ------------------------------------------------------------

    def download(self, path, dest: Path):
        quoted = urllib.parse.quote(path)
        data = self._request("GET", f"/storage/v1/object/{BUCKET}/{quoted}", raw=True)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return len(data)

    def upload(self, src: Path, path):
        quoted = urllib.parse.quote(path)
        ctype = mimetypes.guess_type(src.name)[0] or "application/octet-stream"
        # x-upsert so a re-run of the same batch replaces its own artifacts rather than
        # colliding with them. Re-running is normal (a --skip-tribe re-score after a
        # weight change), so a second attempt must not need a manual cleanup first.
        return self._request(
            "POST", f"/storage/v1/object/{BUCKET}/{quoted}",
            body=src.read_bytes(),
            headers={"Content-Type": ctype, "x-upsert": "true"},
        )


# ==============================================================================
# the gate
# ==============================================================================

def gate(report, log):
    """The conditions under which these numbers may be shown to a customer.

    Returns (fatal, warnings). `fatal` is a list; non-empty means publish nothing.

    The two fatals are demo/README.md's own "stop" cases, restated as code. Everything
    else is recorded and travels to the customer inside the artifact (the result page
    renders warnings, comparability and sanity verbatim) rather than blocking a run."""
    fatal, warn = [], []

    # A1/A4 — content minus a black screen MUST drive occipital cortex. If it does not,
    # the fsaverage5 [LH; RH] vertex-order assumption, the Schaefer mask, or the
    # content/baseline alignment is wrong, and nothing in the file is trustworthy.
    sanity = report.get("sanity") or {}
    if sanity.get("visualPositive") is not True:
        by_ad = sanity.get("fullVisualByAd") or {}
        bad = [k for k, v in by_ad.items() if not isinstance(v, (int, float)) or v <= 0]
        fatal.append(
            "Sanity check failed: content minus a black screen did not drive occipital "
            "cortex" + (f" for {', '.join(sorted(bad))}" if bad else "")
            + ". A mask, the vertex order, or the content/baseline timing is wrong."
        )

    # A1 — predictions must be SIGNED. If TRIBE came back bounded [0,1] the whole
    # signed-delta design (baseline-subtracted contrast) is invalid.
    bounded = []
    for ad in report.get("ads") or []:
        stats = ((ad.get("diagnostics") or {}).get("predsStats") or {})
        for window, s in stats.items():
            if isinstance(s, dict) and s.get("looksBounded01") is True:
                bounded.append(f"{ad.get('id')}·{window}")
    if bounded:
        fatal.append(
            "Predictions look bounded to [0,1] for " + ", ".join(bounded)
            + ". The signed-delta design assumes signed BOLD; these numbers are not valid."
        )

    # A2 — per-run z-scoring makes cross-ad LEVELS meaningless. process_batch.py already
    # auto-switches the chart to the psc lane and flags it, so this is a warning that
    # travels with the artifact, not a stop.
    comp = report.get("comparability") or {}
    if comp.get("perRunZscoreVerdict") not in (None, "fixed_stats_likely"):
        warn.append(
            f"Per-run z-score verdict is {comp.get('perRunZscoreVerdict')!r}: cross-cut "
            "levels are not directly comparable and the chart has switched scale."
        )
    if comp.get("crossAdLevelsTrustworthy") is False:
        warn.append("The run reports that cross-cut levels are not trustworthy.")

    # Clarity is 25% of the score. If no ASR/OCR backend was present, every ad ties on it
    # and a quarter of the score carries no information. Not a stop — the result page
    # says so plainly — but it is the single most common quiet degradation, so it is
    # surfaced to the operator here too.
    ads = report.get("ads") or []
    blind = [a for a in ads
             if {"no_asr_backend", "no_ocr_backend"} & set(a.get("flags") or [])]
    if ads and len(blind) == len(ads):
        warn.append(
            "No ASR or OCR backend on this box: clarity is tied across the batch and is "
            "carrying no signal. Install faster-whisper / tesseract to score it."
        )

    for w in report.get("warnings") or []:
        warn.append(str(w))

    for f in fatal:
        log(f"  GATE FAIL  {f}")
    for w in warn:
        log(f"  gate warn  {w}")
    if not fatal and not warn:
        log("  gate: clean")
    return fatal, warn


# ==============================================================================
# notifications
# ==============================================================================

def result_url(token):
    return f"{app_url()}/r/{token}"


def build_batch_email(kind, batch, *, reason=None):
    """Subject + plain-text body for customer lifecycle emails.

    Returns None when the batch lacks the fields needed to address the customer or to link
    them back to the run.
    """
    email = (batch.get("email") or "").strip()
    token = (batch.get("share_token") or "").strip()
    if not email or not token:
        return None

    name = (batch.get("batch_name") or "your batch").strip()
    url = result_url(token)

    if kind == "processing":
        return {
            "to": email,
            "subject": f"Soma is scoring {name}",
            "text": (
                f"Soma has started scoring {name}.\n\n"
                f"Track the run here:\n{url}\n\n"
                "The page updates itself as the run moves from queued to processing to ready."
            ),
        }
    if kind == "done":
        return {
            "to": email,
            "subject": f"Soma read-out ready: {name}",
            "text": (
                f"Your Soma read-out is ready for {name}.\n\n"
                f"Open it here:\n{url}\n\n"
                "This link is the run's live address and keeps working after the result lands."
            ),
        }
    if kind == "failed":
        why = reason or "The run stopped before Soma could publish a result."
        return {
            "to": email,
            "subject": f"Soma run stopped: {name}",
            "text": (
                f"Soma could not finish scoring {name}.\n\n"
                f"What stopped the run:\n{why}\n\n"
                f"Track the run here:\n{url}"
            ),
        }
    return None


def send_email(message):
    """Best-effort Resend delivery. Never raises when email is merely unconfigured."""
    api_key = env_any(RESEND_KEY_VARS)
    sender = env_any(RESEND_FROM_VARS)
    if not api_key or not sender or not message:
        return False, "not configured"

    payload = {
        "from": sender,
        "to": [message["to"]],
        "subject": message["subject"],
        "text": message["text"],
    }
    reply_to = env_any(RESEND_REPLY_TO_VARS)
    if reply_to:
        payload["reply_to"] = reply_to

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
            return True, f"sent ({resp.status})"
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        return False, f"http {e.code}: {detail}"
    except urllib.error.URLError as e:
        return False, f"unreachable: {e.reason}"


def notify_batch(kind, batch, log, *, reason=None):
    message = build_batch_email(kind, batch, reason=reason)
    ok, detail = send_email(message)
    if ok:
        log(f"email     {kind} -> {message['to']}")
    elif detail != "not configured":
        log(f"email     {kind} skipped: {detail}")


# ==============================================================================
# the run
# ==============================================================================

def find_batch(sb, ident):
    """By id (uuid) or by share_token. Tries id first; a 22P02 (bad uuid) is not an
    error here, it just means the argument was a token."""
    if len(ident) == 36 and ident.count("-") == 4:
        try:
            rows = sb.select("batches", f"id=eq.{ident}&select=*")
            if rows:
                return rows[0]
            return None
        except RuntimeError:
            pass
    rows = sb.select("batches", f"share_token=eq.{ident}&select=*")
    return rows[0] if rows else None


def list_batches(sb, *, statuses=None, limit=25, ascending=False):
    statuses = statuses or []
    query = "select=id,share_token,batch_name,status,email,created_at,manifest"
    if statuses:
        query += "&status=in.(" + ",".join(statuses) + ")"
    query += f"&order=created_at.{ 'asc' if ascending else 'desc' }&limit={int(limit)}"
    return sb.select("batches", query) or []


def claim_oldest_queued(sb):
    """Pick and atomically claim the oldest queued batch.

    Two workers may read the same candidate row; the conditional PATCH on status=queued is
    what makes the claim real. A worker that loses the race gets an empty response and tries
    the next row.
    """
    for batch in list_batches(sb, statuses=["queued"], limit=10, ascending=True):
        claimed = sb.patch(
            "batches",
            f"id=eq.{batch['id']}&status=eq.queued",
            {"status": "processing", "started_at": now_iso(), "error": None},
        )
        if claimed:
            return claimed[0]
    return None


def run_batch(sb, batch, args):
    batch_id = batch["id"]

    workdir = Path(args.workdir) if args.workdir else (ROOT / "concierge-runs" / batch_id)
    videos_dir = workdir / "batch"
    out_dir = workdir / "out"
    web_dir = out_dir / "web"
    videos_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    log_path = workdir / "run.log"
    log_lines = []

    def log(msg):
        line = str(msg)
        print(line, flush=True)
        log_lines.append(line)
        try:
            log_path.write_text("\n".join(log_lines))
        except OSError:
            pass

    def fail(reason):
        """Terminal. The customer's page shows this sentence, so it is written for them
        as much as for us: what stopped, not a stack trace."""
        log(f"\nFAILED: {reason}")
        if not args.dry_run:
            sb.patch("batches", f"id=eq.{batch_id}", {
                "status": "failed",
                "error": reason,
                "run_log": "\n".join(log_lines)[-RUN_LOG_TAIL_CHARS:],
                "completed_at": now_iso(),
            })
            notify_batch("failed", batch, log, reason=reason)
        return 1

    started = time.time()
    log(f"batch     {batch_id}")
    log(f"name      {batch.get('batch_name')}")
    log(f"workdir   {workdir}")

    try:
        # ---- 1 · claim -----------------------------------------------------
        # Marks the row before any long work, so a second operator running --list sees
        # it is taken rather than starting the same GPU job twice.
        if not args.dry_run and batch.get("status") != "processing":
            sb.patch("batches", f"id=eq.{batch_id}",
                     {"status": "processing", "started_at": now_iso(), "error": None})
        log("claimed   status -> processing")
        notify_batch("processing", batch, log)

        # ---- 2 · the ads ---------------------------------------------------
        uploads = sb.select(
            "uploads",
            f"batch_id=eq.{batch_id}&select=ad_id,ad_title,storage_path,filename&order=ad_id.asc",
        ) or []
        if not uploads:
            return fail("This batch has no uploads attached to it.")

        manifest = batch.get("manifest") or {}
        entries = {e.get("id"): e for e in (manifest.get("ads") or [])}
        if not entries:
            return fail("This batch has no ads in its manifest.")

        # The manifest and the upload rows must describe the same set. They are written
        # in one transaction by /api/batches/create from one array, so a mismatch means
        # something wrote to these tables out of band.
        missing = sorted(set(entries) - {u["ad_id"] for u in uploads})
        if missing:
            return fail(f"Manifest names ads with no uploaded file: {', '.join(missing)}.")

        # ---- 3 · download --------------------------------------------------
        log(f"\ndownloading {len(uploads)} cuts")
        for u in uploads:
            ad_id = u["ad_id"]
            entry = entries.get(ad_id)
            if not entry:
                log(f"  ! {ad_id} has no manifest entry, skipping")
                continue
            # The manifest names the file <ad_id>.mp4 (buildManifest mints it that way),
            # so the download target is the manifest's own filename. Nothing here depends
            # on the customer's original filename surviving sanitisation.
            dest = videos_dir / entry["filename"]
            n = sb.download(u["storage_path"], dest)
            log(f"  {ad_id:<8} {entry['filename']:<14} {n/1e6:6.1f} MB  {entry.get('title','')}")

        # ---- 4 · manifest --------------------------------------------------
        manifest_path = videos_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))
        log(f"\nmanifest  {manifest_path}")

        # ---- 5 · score -----------------------------------------------------
        script = ROOT / "demo" / "process_batch.py"
        if not script.exists():
            return fail(f"process_batch.py not found at {script}.")

        cmd = [
            args.python, str(script), str(manifest_path), str(videos_dir),
            "--out-dir", str(out_dir),
            "--web-videos", str(web_dir),
            # The report's `video`/`poster` come out as "<prefix>/<ad_id>.mp4". Pointing
            # the prefix at the results/ key space means the artifact lands with storage
            # keys already in it, and /r/<token> exchanges those for signed URLs at
            # render time. No rewriting pass, and nothing to keep in step.
            "--video-url-prefix", f"results/{batch_id}",
            # Exactly the batch we have, so the n-mismatch guard never fires spuriously
            # and we never have to pass --allow-n (which would suppress a real warning).
            "--batch-size", str(len(uploads)),
            "--modality", args.modality,
        ]
        if args.skip_tribe:
            cmd.append("--skip-tribe")

        log(f"\nscoring   {' '.join(cmd[1:])}\n")
        proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
        for line in (proc.stdout or "").splitlines():
            log(f"  | {line}")
        if proc.returncode != 0:
            tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-6:]
            return fail("The scorer stopped: " + " ".join(tail)[:600])

        # ---- 6 · gate ------------------------------------------------------
        report_path = out_dir / "batch.json"
        if not report_path.exists():
            return fail("The scorer finished but produced no batch.json.")
        report = json.loads(report_path.read_text())

        log("\ngate")
        fatal, warnings = gate(report, log)
        if fatal:
            return fail(" ".join(fatal))

        # Warnings the gate raised travel to the customer inside the artifact, where the
        # result page already renders report.warnings verbatim.
        if warnings:
            report["warnings"] = list(report.get("warnings") or []) + [
                w for w in warnings if w not in (report.get("warnings") or [])
            ]

        # ---- 7 · upload artifacts -------------------------------------------
        if args.dry_run:
            log("\ndry run: not uploading, not publishing")
            log(f"\nartifact at {report_path}")
            return 0

        log("\nuploading web copies")
        uploaded = 0
        for ad in report.get("ads") or []:
            for field, ext in (("video", "mp4"), ("poster", "jpg")):
                key = ad.get(field)
                if not key:
                    continue
                local = web_dir / f"{ad['id']}.{ext}"
                if not local.exists():
                    # The scorer only writes a poster when ffmpeg could pull a frame; a
                    # missing one is normal and the player falls back cleanly.
                    ad[field] = None
                    continue
                sb.upload(local, key)
                uploaded += 1
                log(f"  {key}")
        log(f"  {uploaded} objects")

        # ---- 8 · publish ----------------------------------------------------
        sb.patch("batches", f"id=eq.{batch_id}", {
            "status": "done",
            "report": report,
            "run_log": "\n".join(log_lines)[-RUN_LOG_TAIL_CHARS:],
            "completed_at": now_iso(),
            "error": None,
        })
        notify_batch("done", batch, log)

        token = batch.get("share_token")
        log(f"\ndone in {time.time() - started:.0f}s")
        log(f"read-out  /r/{token}")

        if not args.keep_workdir:
            # The preds cache lives under demo/.cache, not here, so removing this does
            # not cost a future --skip-tribe re-score.
            shutil.rmtree(workdir, ignore_errors=True)
        return 0

    except RuntimeError as e:
        return fail(str(e))
    except KeyboardInterrupt:
        return fail("The run was interrupted by the operator.")


def run_watch(sb, args):
    print(f"watching   queued batches every {args.poll_seconds}s", flush=True)
    while True:
        batch = claim_oldest_queued(sb)
        if batch:
            print("", flush=True)
            rc = run_batch(sb, batch, args)
            if rc and rc != 1:
                return rc
            continue
        print(f"{now_iso()}  idle", flush=True)
        time.sleep(args.poll_seconds)


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("batch", nargs="?", help="batch id (uuid) or share token")
    ap.add_argument("--list", action="store_true", help="show waiting batches and exit")
    ap.add_argument("--next", dest="claim_next", action="store_true",
                    help="claim and run the oldest queued batch, then exit")
    ap.add_argument("--watch", action="store_true",
                    help="keep polling for queued batches and run them continuously")
    ap.add_argument("--poll-seconds", type=int, default=DEFAULT_POLL_SECONDS,
                    help=f"watch-mode poll interval in seconds (default: {DEFAULT_POLL_SECONDS})")
    ap.add_argument("--workdir", default=None,
                    help="scratch dir (default: ./concierge-runs/<batch_id>)")
    ap.add_argument("--keep-workdir", action="store_true",
                    help="do not delete the scratch dir on success")
    ap.add_argument("--skip-tribe", action="store_true",
                    help="re-score from the preds cache; no GPU (see demo/README.md)")
    ap.add_argument("--dry-run", action="store_true",
                    help="do everything except mutate the row or upload artifacts")
    ap.add_argument("--force", action="store_true",
                    help="run a batch that is not queued (re-run a done or failed one)")
    ap.add_argument("--python", default=sys.executable,
                    help="interpreter for process_batch.py (default: this one)")
    ap.add_argument("--modality", choices=["av", "video"], default="av")
    args = ap.parse_args()

    if args.poll_seconds < 1:
        ap.error("--poll-seconds must be at least 1")

    load_dotenv()
    url, key = env_any(URL_VARS), env_any(KEY_VARS)
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or the NEXT_PUBLIC_/"
                 "SECRET_KEY names) in the environment or .env.")
    sb = Supabase(url, key)

    # ---- --list ------------------------------------------------------------
    if args.list:
        rows = list_batches(sb, limit=25) or []
        if not rows:
            print("nothing in the queue.")
            return 0
        print(f"{'status':<11} {'created':<21} {'id':<38} name")
        for r in rows:
            print(f"{r['status']:<11} {r['created_at'][:19]:<21} {r['id']:<38} "
                  f"{r.get('batch_name') or ''}")
        return 0

    if args.watch:
        return run_watch(sb, args)

    if args.claim_next:
        batch = claim_oldest_queued(sb)
        if not batch:
            print("nothing queued.")
            return 0
        return run_batch(sb, batch, args)

    if not args.batch:
        ap.error("give a batch id or share token, or use --list, --next, or --watch")

    batch = find_batch(sb, args.batch)
    if not batch:
        sys.exit(f"No batch matches {args.batch!r}.")

    batch_id = batch["id"]
    status = batch["status"]
    if status != "queued" and status != "processing" and not args.force:
        sys.exit(f"Batch {batch_id} is {status!r}, not 'queued'. Pass --force to run it anyway.")

    return run_batch(sb, batch, args)


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


if __name__ == "__main__":
    sys.exit(main())
