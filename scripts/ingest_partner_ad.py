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


def score_batch(manifest_path: Path, videos_dir: Path, out_dir: Path, n: int, extra=()):
    """One process_batch.py run over the original plus its cuts.

    --allow-n because the batch size is K+1 by construction rather than the default 5, and
    that is deliberate rather than an accident worth warning about.
    """
    cmd = [
        sys.executable, str(ROOT / "demo" / "process_batch.py"),
        str(manifest_path), str(videos_dir),
        "--out-dir", str(out_dir),
        "--batch-size", str(n), "--allow-n", *extra,
    ]
    print(f"  $ {' '.join(cmd[1:])}")
    proc = subprocess.run(cmd, cwd=str(ROOT))
    if proc.returncode != 0:
        sys.exit(
            "The scoring run failed. Its output is above. Nothing was written to the "
            "database, so re-running this script after fixing the cause is safe."
        )
    report_path = out_dir / "batch.json"
    if not report_path.exists():
        sys.exit(f"The scoring run produced no {report_path}.")
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

    # ── 1. shots ─────────────────────────────────────────────────────────────
    duration = rnd.duration_of(args.video)
    shots = detect_shots(args.video, duration)
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
    for i, cand in enumerate(candidates):
        ad_id = f"ad_{i + 2:02d}"
        dst = videos_dir / f"{ad_id}.mp4"
        try:
            rnd.render(cand["timeline"], args.video, dst)
        except RuntimeError as e:
            print(f"     ! {cand['label']}: {e}")
            continue
        actual = rnd.duration_of(dst)
        print(f"     {dst.name}  {actual:.2f}s  {cand['label']}")
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
    if args.skip_score:
        print("3/6  --skip-score: no model pass, no report")
        report = None
    else:
        print(f"3/6  scoring {len(ads)} ads in one batch")
        report = score_batch(manifest_path, videos_dir, out_dir, len(ads))

    # ── 4. posters ───────────────────────────────────────────────────────────
    print("4/6  posters")
    posters = {"ad_01": poster_for(original, work / "ad_01.jpg")}
    for r in rendered:
        posters[r["adId"]] = poster_for(r["path"], work / f"{r['adId']}.jpg")

    if args.dry_run:
        print(f"\n--dry-run: artifacts are in {work}. Nothing was written to Supabase.")
        return 0

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
    print("6/6  writing rows")
    batch = supabase.insert("batches", {
        "id": batch_id,
        "email": args.owner_email,
        "user_id": owner_id,
        "batch_name": manifest["batch_name"],
        "manifest": manifest,
        "status": "done" if report else "queued",
        **({"report": report, "completed_at": now_iso()} if report else {}),
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
        "status": "done" if report else "queued",
        **({"result": {"baseScore": base,
                       "shots": [{"start": a, "end": b} for a, b in shots],
                       "verified": True},
            "completed_at": now_iso()} if report else {}),
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

    print(f"\ndone.  /dashboard  ->  {ads[0]['title']}")
    print(f"       share link   ->  /r/{token}")
    print(f"       artifacts    ->  {work}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
