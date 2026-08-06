#!/usr/bin/env python3
"""
ingest_partner_ad.py — one partner ad in, a logged-in dashboard out.

    video.mp4 + brief.json  ->  shots  ->  rendered re-cuts  ->  ONE scoring run
                            ->  storage objects  ->  batches / uploads / edit_runs / edit_cuts

WHY THIS SCRIPT EXISTS. The site deploys to Vercel, which has no Python, no ffmpeg and no
model, so nothing on a request path can score or render anything (src/lib/edit-capability.ts
says so and defaults closed). The dashboard is therefore a READER over artifacts produced
here, on a box that has the stack. docs/strategy/PLAN.md § 0.2 asks for exactly this:
"precompute the edit candidates on the scorer box during the batch run... it is the same
estimator, it runs where Python already lives, and it makes the block real instead of
hidden."

THE ORDERING PROBLEM, AND WHY THIS SCRIPT INVERTS THE USUAL ONE.
tools/edit/search.py runs: estimate every candidate off the original's arc -> render the
best few -> optionally re-score them. That is right for SEARCHING a big space cheaply,
because estimating is free and encoding is not.

It cannot start the chain for a brand-new ad, because the estimate needs an arc and the arc
needs a scoring run — and a scoring run of ONE ad exits: normalize_within_batch() at
demo/process_batch.py:1017 refuses fewer than three, since every component is a percentile
against the others in the batch and a percentile over one item is not a number.

So this script renders FIRST and scores ONCE:

    the original + its K re-cuts are scored together, in a single batch.

Three things fall out of that, all of them good:
  * n = K+1 >= 3, so the percentile stage is satisfied honestly rather than bypassed.
  * The batch is apples-to-apples BY CONSTRUCTION — same product, same brand, same length
    bucket, same footage. That is precisely the comparison process_batch.py is built for,
    and it is the same trick tools/edit/search.py:verify_batch already uses.
  * Every delta is MEASURED. Each cut was really encoded and really run through the model,
    so nothing here has to be labelled 'estimate'. tools/edit/ops.py refuses to set
    `measured` and only a real scoring pass may — this is that pass.

The candidate set is chosen WITHOUT an arc, because there isn't one yet. It is a
deterministic, documented spread rather than a search result, and the script says so:
single-shot removals spread evenly across the film, plus a head trim. The MEASURED scores
are what rank them afterwards, which is a stronger ordering than an estimate would have
produced anyway.

USAGE
    ./.venv/bin/python scripts/ingest_partner_ad.py partner.mp4 brief.json \\
        --owner-email founder@brand.com

    # everything except the model pass, to exercise the plumbing on a laptop
    ./.venv/bin/python scripts/ingest_partner_ad.py partner.mp4 brief.json \\
        --owner-email founder@brand.com --skip-score

brief.json is demo/manifest.example.json's shape minus `ads` — this script fills that in,
because the ad list is the original plus the cuts it just rendered.

Stdlib + ffmpeg only, matching tools/concierge/run_batch.py: this runs on a provisioned
box, not in the app.
"""

import argparse
import datetime
import json
import mimetypes
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools.capture.recorder import Recorder, sha256_of                  # noqa: E402
from tools.edit import render as rnd                                    # noqa: E402
from tools.edit.ops import shots_from_boundaries, total_seconds         # noqa: E402

BUCKET = "uploads"

# The brief fields process_batch.py reads. Validated here rather than after the GPU has
# already been spent: a missing benefit line should cost a second, not forty minutes.
REQUIRED_BRIEF = (
    "batch_name", "brand_name", "product_name",
    "primary_problem", "primary_benefit", "offer", "desired_cta",
)


# ==============================================================================
# env + supabase, over stdlib (same shape as tools/concierge/run_batch.py)
# ==============================================================================

def load_dotenv():
    """Populate os.environ from .env. Never overrides a real environment variable."""
    for path in (Path.cwd() / ".env", ROOT / ".env"):
        if not path.exists():
            continue
        try:
            for line in path.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip().removeprefix("export ").strip()
                val = val.strip().strip('"').strip("'")
                if not key or key in os.environ or "PASTE" in val:
                    continue
                os.environ[key] = val
        except OSError:
            pass
        break


def now_iso():
    """A real timestamp, because PostgREST sends values as literals rather than SQL.

    The string "now()" looks like it would work and does not: Postgres accepts 'now' as a
    timestamptz literal, but 'now()' is function-call syntax and is invalid as a value,
    so the insert fails with `invalid input syntax for type timestamp with time zone`
    AFTER the model pass and the uploads have already been paid for.
    """
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def env_any(names, default=""):
    for name in names:
        val = os.environ.get(name, "").strip()
        if val:
            return val
    return default


class Supabase:
    """The service_role client. Bypasses RLS, which is what lets this script write rows
    it then hands to a user — see migration 0008 for why writes stay server-side."""

    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.key = key

    def _request(self, method, path, *, body=None, headers=None, raw=False):
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(self.url + path, data=body, method=method, headers=h)
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

    def select(self, table, query):
        return self._request("GET", f"/rest/v1/{table}?{query}",
                             headers={"Accept": "application/json"})

    def insert(self, table, row):
        rows = self._request(
            "POST", f"/rest/v1/{table}",
            body=json.dumps(row).encode("utf-8"),
            headers={"Content-Type": "application/json", "Prefer": "return=representation"},
        )
        return rows[0] if isinstance(rows, list) and rows else rows

    def patch(self, table, query, row):
        return self._request(
            "PATCH", f"/rest/v1/{table}?{query}",
            body=json.dumps(row).encode("utf-8"),
            headers={"Content-Type": "application/json", "Prefer": "return=representation"},
        )

    def upload(self, src: Path, path):
        quoted = urllib.parse.quote(path)
        ctype = mimetypes.guess_type(src.name)[0] or "application/octet-stream"
        # x-upsert so a re-run replaces its own artifacts instead of colliding with them.
        return self._request(
            "POST", f"/storage/v1/object/{BUCKET}/{quoted}",
            body=src.read_bytes(),
            headers={"Content-Type": ctype, "x-upsert": "true"},
        )

    def user_id_for(self, email):
        """auth.users is not exposed through PostgREST; the Admin API is the way in."""
        query = urllib.parse.urlencode({"page": 1, "per_page": 200})
        data = self._request("GET", f"/auth/v1/admin/users?{query}")
        users = data.get("users", data) if isinstance(data, dict) else data
        wanted = email.strip().lower()
        for user in users or []:
            if str(user.get("email", "")).strip().lower() == wanted:
                return user["id"]
        return None


# ==============================================================================
# stages
# ==============================================================================

def _dimensions(video: Path):
    """(width, height), or (None, None) if ffprobe cannot say.

    Recorded because it is the fastest way for a reader to tell a real delivered asset
    from a scraped thumbnail-grade file, and the record should not make them guess.
    """
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height", "-of", "csv=p=0:s=x", str(video)],
        capture_output=True, text=True,
    )
    try:
        w, h = proc.stdout.strip().splitlines()[0].split("x")[:2]
        return int(w), int(h)
    except (IndexError, ValueError):
        return None, None


def detect_shots(video: Path, duration: float, threshold=0.28):
    """ffmpeg scene detection, same call and same threshold as
    tools/demo/build_report.py:detect_shots — the two must agree or a rendered cut would
    not line up with the shot list the report shows."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(video), "-filter:v",
         f"select='gt(scene,{threshold})',showinfo", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    bounds = []
    for line in proc.stderr.splitlines():
        if "pts_time:" not in line:
            continue
        try:
            bounds.append(float(line.split("pts_time:")[1].split()[0]))
        except (IndexError, ValueError):
            continue
    return shots_from_boundaries(sorted(bounds), duration)


def choose_candidates(shots, top):
    """A deterministic spread of edits, chosen WITHOUT an arc.

    There is no arc yet — that is the whole ordering problem in the module docstring — so
    this cannot be a search result and does not pretend to be one. It takes single-shot
    removals spread evenly through the film (so the set probes the open, the middle and
    the close rather than three adjacent shots), then a 1.0s head trim if there is room.

    The MEASURED scores from the scoring run are what rank these afterwards. This function
    only has to produce a spread worth measuring.
    """
    candidates = []
    n = len(shots)

    # Evenly spaced indices across the shot list, de-duplicated, order preserved.
    picks, seen = [], set()
    for j in range(top):
        i = round(j * (n - 1) / max(1, top - 1)) if top > 1 else 0
        if i not in seen:
            seen.add(i)
            picks.append(i)

    for i in picks:
        timeline = [s for k, s in enumerate(shots) if k != i]
        if not timeline:
            continue
        candidates.append({
            "kind": "remove",
            "label": f"Drop shot {i + 1} ({shots[i][0]:.1f}–{shots[i][1]:.1f}s)",
            "timeline": timeline,
            "removed": [shots[i]],
        })

    head = shots[0]
    if head[1] - head[0] > 2.0:
        trimmed = [(head[0] + 1.0, head[1]), *shots[1:]]
        candidates.append({
            "kind": "trim_head",
            "label": "Trim 1.0s off the open",
            "timeline": trimmed,
            "removed": [(head[0], head[0] + 1.0)],
        })

    return candidates[:top]


def poster_for(video: Path, dest: Path, at=0.5):
    """One frame, for the library grid. Storage's MIME allowlist gained image/jpeg in
    migration 0007 precisely so this upload does not 415."""
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(at),
         "-i", str(video), "-frames:v", "1", "-q:v", "3", str(dest)],
        check=True, capture_output=True,
    )
    return dest


def score_batch(manifest_path: Path, videos_dir: Path, out_dir: Path, n: int,
                rec: Recorder, stage, extra=()):
    """One process_batch.py run over the original plus its cuts.

    --allow-n because the batch size is K+1 by construction rather than the default 5, and
    that is deliberate rather than an accident worth warning about.

    The subprocess runs through rec.run_logged rather than inheriting stdout, so the
    model pass — the longest and least visible part of the whole pipeline — ends up in
    the record instead of only in whichever terminal happened to be open.
    """
    cmd = [
        sys.executable, str(ROOT / "demo" / "process_batch.py"),
        str(manifest_path), str(videos_dir),
        "--out-dir", str(out_dir),
        "--batch-size", str(n), "--allow-n", *extra,
    ]
    print(f"  $ {' '.join(cmd[1:])}")
    if rec.run_logged(stage, cmd, cwd=ROOT) != 0:
        stage.fail("process_batch.py exited non-zero")
        sys.exit(
            "The scoring run failed. Its output is above. Nothing was written to the "
            "database, so re-running this script after fixing the cause is safe."
        )
    report_path = out_dir / "batch.json"
    if not report_path.exists():
        stage.fail(f"no {report_path.name} was produced")
        sys.exit(f"The scoring run produced no {report_path}.")
    stage.artifact(report_path, role="report", label="batch.json")
    return json.loads(report_path.read_text())


# ==============================================================================
# main
# ==============================================================================

def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path, help="the partner's mp4")
    ap.add_argument("brief", type=Path, help="manifest fields minus `ads` (see the docstring)")
    ap.add_argument("--owner-email", required=True,
                    help="the Supabase Auth user who will see this in /dashboard")
    ap.add_argument("--top", type=int, default=3,
                    help="how many re-cuts to render (default 3, so the batch is 4)")
    ap.add_argument("--work-dir", type=Path, default=ROOT / "ingest-runs")
    ap.add_argument("--skip-score", action="store_true",
                    help="render and upload but do not run the model — plumbing only")
    ap.add_argument("--dry-run", action="store_true",
                    help="do everything local, write nothing to Supabase")
    # Provenance is on by default. It costs one small file in the work dir, and a run
    # that was not recorded cannot be shown to anyone afterwards — which is the whole
    # problem tools/capture/recorder.py exists to fix.
    ap.add_argument("--no-capture", dest="capture", action="store_false", default=True,
                    help="do not write run.jsonl (provenance is recorded by default)")
    args = ap.parse_args()

    if not args.video.exists():
        sys.exit(f"No such video: {args.video}")
    brief = json.loads(args.brief.read_text())
    missing = [k for k in REQUIRED_BRIEF if not str(brief.get(k, "")).strip()]
    if missing:
        sys.exit(f"brief.json is missing: {', '.join(missing)}")
    if args.top < 2:
        sys.exit("--top must be at least 2: the scoring run needs three ads including the original.")

    rnd.have_ffmpeg()

    load_dotenv()
    supabase = None
    owner_id = None
    if not args.dry_run:
        url = env_any(("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"))
        key = env_any(("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"))
        if not url or not key:
            sys.exit("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or use --dry-run).")
        supabase = Supabase(url, key)
        owner_id = supabase.user_id_for(args.owner_email)
        if not owner_id:
            sys.exit(
                f"No Supabase Auth user for {args.owner_email}. Create the account first "
                "(the app's /sign-up page does it), then re-run."
            )

    run_id = uuid.uuid4().hex[:12]
    work = args.work_dir / run_id
    videos_dir = work / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)

    rec = Recorder(work, run_id, enabled=args.capture)
    env = rec.env(extra={"ownerEmail": args.owner_email, "dryRun": bool(args.dry_run)})

    # ── 0. probe ─────────────────────────────────────────────────────────────
    # The input, addressed by content. Everything downstream is a claim about THIS file,
    # so the hash is what lets a reader check that the cut they were shown is the cut
    # that was scored.
    with rec.stage("probe", "The file that came in") as st:
        duration = rnd.duration_of(args.video)
        w, h = _dimensions(args.video)
        st.fact(filename=args.video.name, durationS=round(duration, 3),
                width=w, height=h, bytes=args.video.stat().st_size,
                sha256=sha256_of(args.video))
        st.artifact(args.video, role="source", label="the partner's cut")

    # ── 1. shots ─────────────────────────────────────────────────────────────
    with rec.stage("shots", "Where the cuts already are") as st:
        shots = detect_shots(args.video, duration)
        st.fact(detector="ffmpeg select=gt(scene,0.28)", threshold=0.28, shots=len(shots))
        for i, (a, b) in enumerate(shots):
            st.fact(**{f"shot{i + 1:02d}": f"{a:.2f}–{b:.2f}s"})
    print(f"1/6  {args.video.name}  {duration:.1f}s  ->  {len(shots)} shots")

    # A ONE-SHOT AD IS NOT AN ERROR, and this used to exit here.
    #
    # ffmpeg's scene detector finds no cut above threshold 0.28 on a single continuous
    # take or a slow product pan. There is genuinely no edit space in that — every
    # candidate in tools/edit/ops.py is defined in terms of shots — but the review does
    # not depend on shots at all. The arc, the weak spots, the hook read and the clarity
    # check all come from the footage itself.
    #
    # So: say what will and will not be delivered, and carry on. Refusing the whole run
    # because one of its two deliverables is unavailable was the same mistake the
    # two-ad minimum made.
    recuttable = len(shots) >= 2
    if not recuttable:
        print("     one shot only — no edit space, so this run delivers the review "
              "without a re-cut ladder")

    # ── 2. render ────────────────────────────────────────────────────────────
    original = videos_dir / "ad_01.mp4"
    original.write_bytes(args.video.read_bytes())

    candidates = choose_candidates(shots, args.top) if recuttable else []
    print(f"2/6  rendering {len(candidates)} re-cuts")
    rendered = []
    with rec.stage("render", "The re-cut ladder, encoded for real") as st:
        if not recuttable:
            st.skip("one shot only — there is no edit space to render")
        st.fact(candidates=len(candidates), strategy="even spread of single-shot removals, plus a head trim")
        for i, cand in enumerate(candidates):
            ad_id = f"ad_{i + 2:02d}"
            dst = videos_dir / f"{ad_id}.mp4"
            try:
                rnd.render(cand["timeline"], args.video, dst)
            except RuntimeError as e:
                print(f"     ! {cand['label']}: {e}")
                st.fact(**{f"{ad_id}_failed": str(e)})
                continue
            actual = rnd.duration_of(dst)
            print(f"     {dst.name}  {actual:.2f}s  {cand['label']}")
            st.fact(**{ad_id: f"{cand['label']}  ->  {actual:.2f}s"})
            st.artifact(dst, role="video", label=cand["label"])
            rendered.append({**cand, "adId": ad_id, "path": dst, "durationS": actual})

    # No floor here any more. demo/process_batch.py scores a run of one within-item
    # (within_item_scores), so "the original alone" is a complete deliverable — it just
    # gets a review and no ladder. Exiting instead would throw the review away too.
    if recuttable and len(rendered) < 2:
        print("     fewer than two cuts survived rendering; delivering the review alone")
        rendered = []

    # ── 3. score ─────────────────────────────────────────────────────────────
    ads = [{"filename": original.name, "id": "ad_01", "title": brief.get("original_title")
            or "Original cut"}]
    ads += [{"filename": r["path"].name, "id": r["adId"], "title": r["label"]} for r in rendered]

    manifest = {**{k: brief[k] for k in REQUIRED_BRIEF},
                **{k: v for k, v in brief.items() if k not in ("ads",)},
                "ads": ads}
    manifest_path = work / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    out_dir = work / "out"
    report = None

    # THE TWO STAGES THAT DECIDE WHETHER ANY OF THIS IS EVIDENCE.
    #
    # `encode` is the TRIBE v2 forward pass — the GPU step, and the only step whose cost
    # is measured in minutes rather than seconds. `score` is the cheap collapse of those
    # arcs into a read-out. They are one subprocess (process_batch.py does both) but two
    # stages in the record, because a reader asking "did a model actually run" is asking
    # about the first one and would not be able to find the answer inside the second.
    #
    # The skip reason names the ACTUAL missing piece rather than saying "skipped": torch
    # absent and licence-not-accepted are different problems with different fixes, and a
    # page that cannot tell them apart is not worth reading.
    skip_reason = None
    if args.skip_score:
        skip_reason = "--skip-score was passed: plumbing was exercised, no model ran"
    elif not env["torch"]["present"]:
        skip_reason = ("torch is not installed on this host, so there is no model to run "
                       "(this is a laptop; the encoder needs a provisioned CUDA box — "
                       "tools/concierge/provision.sh)")
    elif not env["tribeWeights"]["present"]:
        skip_reason = ("facebook/tribev2 weights are not on this host. They are CC BY-NC "
                       "4.0 behind a click-through, so a human has to accept the licence "
                       "on Hugging Face before any box can encode.")

    with rec.stage("encode", "TRIBE v2 forward pass") as st:
        st.fact(ads=len(ads),
                device=(env["torch"].get("backend") or "none") if env["torch"]["present"] else "none",
                weights="facebook/tribev2 (CC BY-NC 4.0)")
        if skip_reason:
            print(f"3/6  no model pass — {skip_reason}")
            st.skip(skip_reason)
        else:
            print(f"3/6  scoring {len(ads)} ads in one batch")
            report = score_batch(manifest_path, videos_dir, out_dir, len(ads), rec, st)

    with rec.stage("score", "Arcs collapsed to a read-out") as st:
        if report is None:
            st.skip("no arcs were produced, so there is nothing to score")
        else:
            scoring = report.get("scoring") or {}
            st.fact(scale=scoring.get("scale"), cohortN=scoring.get("cohortN") or len(ads))
            for a in report.get("ads", []):
                s = a.get("scores") or {}
                st.fact(**{a["id"]: (f"preflight {s.get('preflight')}  "
                                     f"hook {s.get('hook')}  processing {s.get('processing')}  "
                                     f"clarity {s.get('clarity')}")})

    # ── 4. posters ───────────────────────────────────────────────────────────
    print("4/6  posters")
    with rec.stage("posters", "One frame per cut, for the grid") as st:
        posters = {"ad_01": poster_for(original, work / "ad_01.jpg")}
        for r in rendered:
            posters[r["adId"]] = poster_for(r["path"], work / f"{r['adId']}.jpg")
        for ad_id, p in posters.items():
            st.artifact(p, role="poster", label=ad_id)

    if args.dry_run:
        with rec.stage("publish", "Storage objects, rows, and the customer's URL") as st:
            st.skip("--dry-run: nothing was written to Supabase")
        rec.finish(status="partial", workDir=str(work),
                   note="dry run: no rows, no storage objects, no share link")
        print(f"\n--dry-run: artifacts are in {work}. Nothing was written to Supabase.")
        if args.capture:
            print(f"           record       ->  {rec.path}")
        return 0

    # ── 5+6. publish ─────────────────────────────────────────────────────────
    # Upload and rows are one stage in the record even though they are two in the
    # console, because they succeed or fail together: a storage object with no row
    # pointing at it is invisible, and a row pointing at an object that failed to
    # upload renders as a broken player. The stage ends when the customer has a URL.
    with rec.stage("publish", "Storage objects, rows, and the customer's URL") as st:
        # ── 5. upload ────────────────────────────────────────────────────────────
        batch_id = str(uuid.uuid4())
        edit_run_id = str(uuid.uuid4())
        print("5/6  uploading")

        def put(src: Path, key: str) -> str:
            supabase.upload(src, key)
            return key

        source_key = put(original, f"queued/{batch_id}/ad_01.mp4")
        keys = {"ad_01": {"video": source_key, "poster": put(posters["ad_01"], f"results/{batch_id}/ad_01.jpg")}}
        for r in rendered:
            keys[r["adId"]] = {
                "video": put(r["path"], f"edits/{edit_run_id}/{r['adId']}.mp4"),
                "poster": put(posters[r["adId"]], f"edits/{edit_run_id}/{r['adId']}.jpg"),
            }

        # The report stores object KEYS, never URLs: the bucket is private, so any URL is
        # stale the moment it is written. /r/<token> and the dashboard both sign at render.
        if report:
            for ad in report.get("ads", []):
                if ad["id"] in keys:
                    ad["video"] = keys[ad["id"]]["video"]
                    ad["poster"] = keys[ad["id"]]["poster"]

        # ── 6. rows ──────────────────────────────────────────────────────────────
        #
        # A SKIPPED RUN IS TERMINAL, NOT QUEUED. --skip-score writes no report, and nothing
        # anywhere will ever come back and finish these rows — there is no worker watching
        # for them and no stale-claim reaper. Writing 'queued' left a row the dashboard
        # renders as "Searching the edit space… reload in a few minutes" forever, which is
        # the exact failure tools/concierge/README.md already lists as unbuilt.
        #
        # The schema's only terminal states are done and failed, and this is honestly the
        # second: the run stopped before producing a result, and the reason is worth saying
        # in words rather than leaving as a spinner.
        SKIPPED = ("Scoring was skipped (--skip-score), so this run has no read-out. "
                   "Re-run scripts/ingest_partner_ad.py without that flag on a host with "
                   "the model stack.")
        terminal = "done" if report else "failed"

        print("6/6  writing rows")
        batch = supabase.insert("batches", {
            "id": batch_id,
            "email": args.owner_email,
            "user_id": owner_id,
            "batch_name": manifest["batch_name"],
            "manifest": manifest,
            "status": terminal,
            **({"report": report, "completed_at": now_iso()}
               if report else {"error": SKIPPED, "completed_at": now_iso()}),
        })
        token = batch["share_token"]

        supabase.insert("uploads", [{
            "email": args.owner_email,
            "user_id": owner_id,
            "filename": args.video.name,
            "content_type": "video/mp4",
            "storage_path": source_key,
            "batch_id": batch_id,
            "ad_id": "ad_01",
            "ad_title": ads[0]["title"],
        }])

        # Scores from the run, so a delta is the difference between two measured numbers.
        scored = {a["id"]: a["scores"]["preflight"] for a in (report or {}).get("ads", [])}
        base = scored.get("ad_01")

        supabase.insert("edit_runs", {
            "id": edit_run_id,
            "user_id": owner_id,
            "ad_id": "ad_01",
            "source_kind": "batch",
            "source_title": ads[0]["title"],
            "batch_share_token": token,
            "status": terminal,
            **({"result": {"baseScore": base,
                           "shots": [{"start": a, "end": b} for a, b in shots],
                           "verified": True},
                "completed_at": now_iso()}
               if report else {"error": SKIPPED, "completed_at": now_iso()}),
        })

        if report:
            supabase.insert("edit_cuts", [{
                "edit_run_id": edit_run_id,
                "position": i + 1,
                "kind": r["kind"],
                "label": r["label"],
                # Not an estimate: each of these was encoded and then scored by the run above.
                "confidence": "measured",
                "measured": True,
                "storage_path": keys[r["adId"]]["video"],
                "poster_path": keys[r["adId"]]["poster"],
                "duration_s": round(r["durationS"], 2),
                "est_score": scored.get(r["adId"]),
                "est_delta": (None if base is None or scored.get(r["adId"]) is None
                              else round(scored[r["adId"]] - base, 2)),
            } for i, r in enumerate(rendered)])

        st.fact(batchStatus=terminal, shareToken=token, batchId=batch_id,
                storageObjects=sum(len(v) for v in keys.values()),
                editCuts=len(rendered) if report else 0)

    # The run's own verdict. `partial` is not a euphemism: it is what a run that rendered
    # and published but never encoded actually is, and calling it `ok` would put a green
    # tick on the page next to a stage that says "no model ran".
    rec.finish(status="ok" if report else "partial",
               workDir=str(work), shareToken=token, dashboard="/dashboard")

    print(f"\ndone.  /dashboard  ->  {ads[0]['title']}")
    print(f"       share link   ->  /r/{token}")
    print(f"       artifacts    ->  {work}")
    if args.capture:
        print(f"       record       ->  {rec.path}")
        print(f"       publish it   ->  .venv/bin/python tools/capture/summarize.py {rec.path} --write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
