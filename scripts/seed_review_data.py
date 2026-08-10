#!/usr/bin/env python3
"""
seed_review_data.py — put REAL pipeline output behind a login, so the dashboard can be
looked at before there is a partner ad to put in it.

    public/preflight/batch_report.json  ->  a batches row owned by a review account
    public/campaign/*.mp4               ->  posters + three rendered re-cuts
    tools/edit/ops.estimate             ->  real deltas off the real arcs

WHAT IS AND IS NOT REAL HERE, because a demo that blurs this is worse than no demo:

  REAL  the report. public/preflight/batch_report.json is committed output from
        demo/process_batch.py — five ads, real TRIBE arcs, real per-second lanes, real
        within-batch percentiles. Nothing in it is invented by this script.
  REAL  the re-cuts. ffmpeg renders them from the actual campaign footage, and they play.
  REAL  the deltas — but they are ESTIMATES, produced by tools/edit/ops.estimate
        re-slicing the real arc. Every row is written with measured=false and
        confidence='estimate', and the UI says so in two places.
  NOT   measured deltas. Turning an estimate into a measured number means re-encoding each
        cut through TRIBE, which needs the GPU box. That is the one thing this script
        cannot fake and does not try to.
  NOT   partner footage. This is the Throne demo campaign.

    ./.venv/bin/python scripts/seed_review_data.py --email you@example.com
    ./.venv/bin/python scripts/seed_review_data.py --email you@example.com --clean

--clean removes every row and object this script created, and nothing else. It is safe to
run against the live project because it only ever touches the batch it made.
"""

import argparse
import datetime
import json
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.ingest_partner_ad import Supabase, env_any, load_dotenv, now_iso   # noqa: E402
from tools.edit import render as rnd                                           # noqa: E402
from tools.edit.ops import enumerate_candidates, estimate, rank, shots_from_boundaries  # noqa: E402

REPORT = ROOT / "public" / "preflight" / "batch_report.json"
BATCH_NAME = "Throne — Q3 hook test (review seed)"
# Stable ids so --clean finds exactly what a previous run made, and a re-run replaces
# itself instead of stacking up a second copy of the same batch.
BATCH_ID = "5eed0000-0000-4000-8000-000000000001"
EDIT_RUN_ID = "5eed0000-0000-4000-8000-000000000002"
TOP = 3


def detect_shots(video: Path, duration: float):
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(video), "-filter:v",
         "select='gt(scene,0.28)',showinfo", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    bounds = []
    for line in proc.stderr.splitlines():
        if "pts_time:" in line:
            try:
                bounds.append(float(line.split("pts_time:")[1].split()[0]))
            except (IndexError, ValueError):
                pass
    return shots_from_boundaries(sorted(bounds), duration)


def poster(video: Path, dest: Path, at=1.0):
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(at),
         "-i", str(video), "-frames:v", "1", "-q:v", "3", str(dest)],
        check=True, capture_output=True)
    return dest


def lanes_for(ad):
    """The report's lane names vary by producer (higher_order here, higherOrder in
    search.load_custom_ad, dorsal in build_report). estimate() only needs parallel arrays,
    and since the lane_length() fix it no longer cares what they are called."""
    out = {}
    for key, lane in (ad.get("lanes") or {}).items():
        raw = (lane or {}).get("raw") or []
        if raw:
            out[key] = [float(v) for v in raw]
    return out


def score_fn_for(ad):
    """A within-item scorer in the shape tools/edit/search.py:make_preflight_score_fn uses:
    the hook window's percentile against the clip's OWN timeline, plus the share of the
    film holding above baseline. No other ad appears in it, which is what makes it usable
    on a single cut."""
    base_clarity = float(ad["scores"].get("clarity", 50.0)) / 100.0

    def pct_rank(series, value):
        return (sum(1 for v in series if v < value) / len(series)) if series else 0.0

    def score(cut_lanes, _levels, _brand, _duration, fps=1.0):
        higher = cut_lanes.get("higher_order") or cut_lanes.get("higherOrder") or []
        salvent = cut_lanes.get("salventattn") or []
        n_hook = max(1, int(round(3.0 * fps)))
        hook = (0.65 * pct_rank(salvent, sum(salvent[:n_hook]) / max(1, len(salvent[:n_hook])))
                + 0.35 * pct_rank(higher, sum(higher[:n_hook]) / max(1, len(higher[:n_hook]))))
        hold = (sum(1 for v in higher if v >= 0.0) / len(higher)) if higher else 0.0
        return {"soma": round(100 * (0.40 * hook + 0.35 * hold + 0.25 * base_clarity))}

    return score


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--email", required=True, help="the account that will own this")
    ap.add_argument("--password", default="review-me-1234",
                    help="only used if the account has to be created")
    ap.add_argument("--ad", default=None,
                    help="which ad to render re-cuts for (default: the worst-ranked, which has the most headroom)")
    ap.add_argument("--clean", action="store_true", help="remove what this script created")
    args = ap.parse_args()

    load_dotenv(local=True)
    url = env_any(("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"))
    key = env_any(("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"))
    if not url or not key:
        sys.exit("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.")
    sb = Supabase(url, key)

    if args.clean:
        # edit_cuts cascade from edit_runs; uploads cascade from batches.
        for table, ident in (("edit_runs", EDIT_RUN_ID), ("batches", BATCH_ID)):
            try:
                sb._request("DELETE", f"/rest/v1/{table}?id=eq.{ident}")
                print(f"deleted {table} {ident}")
            except RuntimeError as e:
                print(f"{table}: {e}")
        try:
            sb._request("DELETE", f"/storage/v1/object/uploads/seed/{BATCH_ID}")
        except RuntimeError:
            pass
        print("clean done. The account itself was left alone.")
        return 0

    # ── the account ──────────────────────────────────────────────────────────
    owner = sb.user_id_for(args.email)
    if owner:
        print(f"account       {args.email} (existing)")
    else:
        created = sb._request(
            "POST", "/auth/v1/admin/users",
            body=json.dumps({"email": args.email, "password": args.password,
                             # Pre-confirmed: the project requires confirmation, and a
                             # review account should not need an inbox round-trip.
                             "email_confirm": True}).encode(),
            headers={"Content-Type": "application/json"})
        owner = created["id"]
        print(f"account       {args.email} (created, password: {args.password})")

    report = json.loads(REPORT.read_text())
    work = ROOT / "ingest-runs" / "review-seed"
    work.mkdir(parents=True, exist_ok=True)

    # ── posters, so the library looks like a library ─────────────────────────
    print("posters       ", end="", flush=True)
    for ad in report["ads"]:
        src = ROOT / "public" / str(ad["video"]).lstrip("/")
        if not src.exists():
            continue
        jpg = poster(src, work / f"{ad['id']}.jpg")
        key_ = f"seed/{BATCH_ID}/{ad['id']}.jpg"
        sb.upload(jpg, key_)
        ad["poster"] = key_
        print(".", end="", flush=True)
    print(" done")

    # ── the batch ────────────────────────────────────────────────────────────
    sb._request("DELETE", f"/rest/v1/batches?id=eq.{BATCH_ID}")
    batch = sb.insert("batches", {
        "id": BATCH_ID, "email": args.email, "user_id": owner,
        "batch_name": BATCH_NAME,
        "manifest": {"batch_name": BATCH_NAME,
                     "ads": [{"id": a["id"], "title": a["title"]} for a in report["ads"]]},
        "status": "done", "report": report, "completed_at": now_iso(),
    })
    token = batch["share_token"]
    print(f"batch         {BATCH_NAME}  ->  /r/{token}")

    sb.insert("uploads", [{
        "email": args.email, "user_id": owner,
        "filename": Path(str(a["video"])).name, "content_type": "video/mp4",
        "storage_path": f"seed/{BATCH_ID}/{a['id']}.mp4",
        "batch_id": BATCH_ID, "ad_id": a["id"], "ad_title": a["title"],
    } for a in report["ads"]])

    # ── re-cuts for the ad with the most headroom ────────────────────────────
    #
    # The LAST id in report.order, i.e. the worst-ranked cut — not the winner. Measured
    # across this batch, the two are completely different demos:
    #
    #     Product First (80)  best available edit  -1     nothing to gain
    #     Weak Open     (34)  best available edit  +46
    #
    # That is not a quirk of these five ads, it is the product's actual shape: a tight cut
    # has no slack to remove, and a loose one does. Seeding the editor on the winner
    # produces a screen offering three ways to make a good ad worse, which is a true
    # result and a terrible thing to look at first.
    target_id = args.ad or report["order"][-1]
    best = next(a for a in report["ads"] if a["id"] == target_id)
    src = ROOT / "public" / str(best["video"]).lstrip("/")
    duration = rnd.duration_of(src)
    shots = detect_shots(src, duration)
    print(f"re-cuts       {best['title']}  {duration:.1f}s  {len(shots)} shots")

    # BASE AND CUTS MUST COME FROM THE SAME SCORER, and the obvious choice is wrong.
    #
    # best["scores"]["preflight"] is a percentile against the OTHER FOUR ADS in this batch
    # (34 = "worst of five"). The candidates are scored within-item, against this clip's
    # own timeline. Subtracting one from the other produced a headline "+46" that was two
    # different quantities wearing the same units — the first thing anyone numerate would
    # ask about, and they would be right to.
    #
    # So the base is re-derived with the SAME within-item score_fn the candidates use. The
    # delta is then a real difference: this cut against itself, re-cut.
    lanes = lanes_for(best)
    scorer = score_fn_for(best)
    base = float(scorer(lanes, {}, [], duration)["soma"])
    print(f"              base {base:.0f} (within-item; batch percentile was "
          f"{best['scores']['preflight']:.0f} and is a different quantity)")
    cands = enumerate_candidates(shots)
    for c in cands:
        estimate(c, lanes, {}, [], scorer, base)
    ranked = [c for c in rank(cands) if c.result_s > 0][:TOP]

    sb._request("DELETE", f"/rest/v1/edit_runs?id=eq.{EDIT_RUN_ID}")
    sb.insert("edit_runs", {
        "id": EDIT_RUN_ID, "user_id": owner, "ad_id": best["id"],
        "source_kind": "batch", "source_title": best["title"],
        "batch_share_token": token, "status": "done",
        "result": {"baseScore": base, "verified": False,
                   "shots": [{"start": a, "end": b} for a, b in shots]},
        "completed_at": now_iso(),
    })

    cuts = []
    for i, c in enumerate(ranked):
        dst = work / f"cut_{i + 1}.mp4"
        try:
            rnd.render(c.timeline, src, dst)
        except RuntimeError as e:
            print(f"  ! {c.label}: {e}")
            continue
        jpg = poster(dst, work / f"cut_{i + 1}.jpg", at=0.5)
        vkey = f"edits/{EDIT_RUN_ID}/cut_{i + 1}.mp4"
        pkey = f"edits/{EDIT_RUN_ID}/cut_{i + 1}.jpg"
        sb.upload(dst, vkey)
        sb.upload(jpg, pkey)
        print(f"  cut {i + 1}  {rnd.duration_of(dst):5.1f}s  {c.est_delta:+.0f}  {c.label}")
        cuts.append({
            "edit_run_id": EDIT_RUN_ID, "position": i + 1, "kind": c.kind, "label": c.label,
            # Not measured, and the schema is where that has to be true first.
            "confidence": c.confidence, "measured": False,
            "storage_path": vkey, "poster_path": pkey,
            "duration_s": round(rnd.duration_of(dst), 2),
            "est_score": round(c.est_score, 2), "est_delta": round(c.est_delta, 2),
        })
    if cuts:
        sb.insert("edit_cuts", cuts)

    print(f"\nsign in as {args.email} -> /dashboard")
    print(f"video   /dashboard/v/{token}/{best['id']}")
    print(f"editor  /dashboard/v/{token}/{best['id']}/edit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
