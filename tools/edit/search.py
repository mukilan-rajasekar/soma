#!/usr/bin/env python3
"""
search.py — find the best re-cut of an ad, render it, and say honestly how sure we are.

    enumerate  ->  estimate (free)  ->  render top-K  ->  [verify through TRIBE]
    ~4n edits      a ranking          real mp4s          the number that counts

WHY TWO STAGES. Scoring an edit by re-slicing the existing arc costs nothing, so the
search can be exhaustive: every single-shot removal, every adjacent pair, every hoist,
two head trims. But the arc was predicted from the UNEDITED film, and TRIBE's temporal
window is non-causal (batch_report.json says so in comparability.note), so re-slicing it
cannot know that deleting a shot changes what its neighbours predict. The estimate is a
search heuristic. The only way to get the score of an edited film is to run the edited
film through the encoder.

So: estimate everything, render the few that look best, and re-score THOSE. Cheap where
cheap is fine, expensive only where the number is going to be quoted.

    # search and render, no GPU needed
    python -m tools.edit.search --ad v02_30s_deal_first --top 3 --out-dir /tmp/edits

    # ...and re-score the rendered cuts for real (needs the TRIBE stack)
    python -m tools.edit.search --ad v02_30s_deal_first --top 3 --out-dir /tmp/edits --verify

Without --verify every number it prints is labelled `estimate` and `measured` stays false
in the JSON. That flag is the only thing that flips it.
"""

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.edit import render as rnd                      # noqa: E402
from tools.edit.ops import (                              # noqa: E402
    enumerate_audio_candidates, enumerate_candidates, estimate, rank,
    shots_from_boundaries, total_seconds,
)

# A rendered cut must match the timeline it was scored from. Segments are trimmed on
# frame boundaries, so a little rounding is expected and accumulates with segment count;
# past this the delivered file is describably not the one the score belongs to.
DURATION_TOLERANCE_S = 0.75
HOOK_SECONDS = 3.0
HOOK_VENTRAL_SHARE = 0.65
WEIGHTS = {"hook": 0.40, "processing": 0.35, "clarity": 0.25}


def load_build_report():
    """tools/demo/build_report.py by path — it is a script, not a package, and importing
    it gives us detect_shots() and score_ad() rather than a second copy of either."""
    path = ROOT / "tools" / "demo" / "build_report.py"
    spec = importlib.util.spec_from_file_location("soma_build_report", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, float(x)))


def pct_rank(series, value):
    vals = [float(v) for v in series]
    if not vals:
        return 0.0
    return float(sum(v < value for v in vals)) / float(len(vals))


def brand_score(mentions, duration):
    if not mentions or not duration:
        return 0.0
    first = min(m.get("t", duration) for m in mentions)
    earliness = clamp(1.0 - (first / max(duration, 1e-6)))
    repetition = clamp(len(mentions) / 4.0)
    channels = len({m.get("source", "speech") for m in mentions}) / 2.0
    return clamp(0.5 * earliness + 0.3 * repetition + 0.2 * channels)


def mentions_from_transcript(transcript, message):
    names = []
    for key in ("brandName", "productName"):
        val = (message or {}).get(key) or ""
        val = str(val).strip().lower()
        if val:
            names.append(val)
    if not names:
        return []

    mentions = []
    for seg in transcript or []:
        text = str(seg.get("text") or "").lower()
        if not text:
            continue
        if any(re.search(rf"(?<!\w){re.escape(name)}(?!\w)", text) for name in names):
            mentions.append({
                "t": float(seg.get("t") or 0.0),
                "text": seg.get("text") or "",
                "source": "speech",
            })
    return mentions


def make_preflight_score_fn(spec):
    base_clarity01 = clamp(((spec.get("scores") or {}).get("clarity", 50.0)) / 100.0)

    def score_fn(lanes, _levels, brand, duration, fps=1.0):
        higher = [float(v) for v in lanes.get("higherOrder") or []]
        salvent = [float(v) for v in lanes.get("salventattn") or []]
        n_hook = max(1, int(round(HOOK_SECONDS * fps)))
        v_hook = sum(salvent[:n_hook]) / max(1, len(salvent[:n_hook]))
        h_hook = sum(higher[:n_hook]) / max(1, len(higher[:n_hook]))
        hook01 = (HOOK_VENTRAL_SHARE * pct_rank(salvent, v_hook)
                  + (1 - HOOK_VENTRAL_SHARE) * pct_rank(higher, h_hook))

        hold01 = (
            sum(1 for v in higher if v >= 0.0) / float(len(higher))
            if higher else 0.0
        )
        comp01 = clamp(0.7 * base_clarity01 + 0.3 * brand_score(brand, duration))
        soma = (WEIGHTS["hook"] * hook01
                + WEIGHTS["processing"] * hold01
                + WEIGHTS["clarity"] * comp01)
        return {"soma": round(soma * 100)}

    return score_fn


def load_custom_ad(spec):
    lanes = spec.get("lanes") or {}
    transcript = ((spec.get("media") or {}).get("transcript") or [])
    mentions = mentions_from_transcript(transcript, spec.get("message") or {})
    return {
        "id": spec.get("id") or "ad",
        "title": spec.get("title") or spec.get("id") or "Uploaded cut",
        "duration": float(spec.get("durationS") or 0.0),
        "lanes": {
            "higherOrder": ((lanes.get("higherOrder") or {}).get("raw") or []),
            "salventattn": ((lanes.get("salventattn") or {}).get("raw") or []),
            "visual": ((lanes.get("visual") or {}).get("raw") or []),
        },
        "scores": spec.get("scores") or {},
        "brandMentions": mentions,
        "message": spec.get("message") or {},
        "batchName": spec.get("batchName") or "Uploaded batch",
    }


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", default="public/demo/report.json")
    ap.add_argument("--ad", default=None,
                    help="variant id to edit (default: the report's dipId)")
    ap.add_argument("--ad-json", dest="ad_json", default=None,
                    help="JSON spec for a scored customer ad")
    ap.add_argument("--video", default=None,
                    help="source mp4 (default: derived from the ad's own video field)")
    ap.add_argument("--out-dir", default="edits")
    ap.add_argument("--top", type=int, default=3, help="how many to render")
    ap.add_argument("--no-reorder", action="store_true",
                    help="removals and trims only; skip the weaker reorder estimates")
    ap.add_argument("--audio", action="store_true",
                    help="also enumerate audio-only candidates (mute/duck one beat); "
                         "these are unestimated by construction and only --verify can "
                         "attach a real number to them")
    ap.add_argument("--verify", action="store_true",
                    help="re-score the rendered cuts through the real pipeline (needs TRIBE)")
    ap.add_argument("--estimate-only", action="store_true",
                    help="rank candidates and write JSON without rendering or verifying")
    ap.add_argument("--json", dest="json_path", default=None)
    args = ap.parse_args()

    br = load_build_report()
    score_fn = br.score_ad
    manifest_meta = None

    if args.ad_json:
        spec = json.loads(Path(args.ad_json).read_text())
        ad = load_custom_ad(spec)
        ad_id = ad["id"]
        base = float((spec.get("scores") or {}).get("preflight") or 0.0)
        score_fn = make_preflight_score_fn(spec)
        manifest_meta = {
            "batch_name": spec.get("batchName") or "Uploaded batch",
            "brand_name": ((spec.get("message") or {}).get("brandName") or "brand"),
            "product_name": ((spec.get("message") or {}).get("productName") or ad["title"]),
            "primary_problem": ((spec.get("message") or {}).get("primaryProblem") or "n/a"),
            "primary_benefit": ((spec.get("message") or {}).get("primaryBenefit") or "n/a"),
            "offer": ((spec.get("message") or {}).get("offer") or "n/a"),
            "desired_cta": ((spec.get("message") or {}).get("desiredCta") or "n/a"),
        }
        video = Path(args.video) if args.video else Path(spec.get("video") or "")
    else:
        report = json.loads((ROOT / args.report).read_text())

        ad_id = args.ad or report["campaign"].get("dipId")
        variants = report["campaign"]["variants"]
        ad = next((v for v in variants if v["id"] == ad_id), None)
        if ad is None:
            sys.exit(f"No variant {ad_id!r}. Have: {', '.join(v['id'] for v in variants)}")

        # ad["video"] is a WEB path ("/campaign/x.mp4"); on disk that lives under public/.
        video = Path(args.video) if args.video else ROOT / "public" / ad["video"].lstrip("/")
    if not video.exists():
        sys.exit(f"Source video not found: {video}")

    # ── shots ────────────────────────────────────────────────────────────────
    bounds = br.detect_shots(str(video))
    shots = shots_from_boundaries(bounds, ad["duration"])
    if args.ad_json:
        base = float((ad.get("scores") or {}).get("preflight") or base)
    else:
        base = br.score_ad(ad["lanes"], ad["levels"], ad["brandMentions"], ad["duration"])["soma"]

    print(f"ad        {ad_id}  ({ad['title']})")
    print(f"source    {video.name}  {ad['duration']:.1f}s")
    print(f"shots     {len(shots)} detected")
    print(f"base      {base}")

    if len(shots) < 2:
        sys.exit("Only one shot detected: there is no edit space to search.")

    # ── search ───────────────────────────────────────────────────────────────
    cands = enumerate_candidates(shots, allow_reorder=not args.no_reorder)
    if args.audio:
        if rnd.has_audio(video):
            cands += enumerate_audio_candidates(shots)
        else:
            print("note: --audio requested but the source has no audio track; skipping")
    for c in cands:
        estimate(
            c,
            ad["lanes"],
            ad.get("levels") or {},
            ad["brandMentions"],
            score_fn,
            base,
        )
    ranked = rank(cands)

    print(f"\n{len(ranked)} candidate edits, estimated on the existing arc")
    print(f"{'est':>5} {'score':>6} {'kept':>7}  {'confidence':<15} edit")
    for c in ranked[:10]:
        print(f"{c.est_delta:+5.0f} {c.est_score:6.0f} {c.result_s:6.1f}s  "
              f"{c.confidence:<15} {c.label}")

    # ── render ───────────────────────────────────────────────────────────────
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rendered = []

    if args.estimate_only:
        print("\nestimate-only mode: skipping render and verification")
    else:
        print(f"\nrendering the top {min(args.top, len(ranked))}")
        for i, c in enumerate(ranked[:args.top]):
            dst = out_dir / f"{ad_id}_edit{i + 1}_{c.kind}.mp4"
            try:
                rnd.render(c.timeline, video, dst, audio_ops=c.audio_ops or None)
            except RuntimeError as e:
                print(f"  ! {c.label}: {e}")
                continue
            actual = rnd.duration_of(dst)
            drift = abs(actual - c.result_s)
            flag = "" if drift <= DURATION_TOLERANCE_S else "  ** DRIFT"
            print(f"  {dst.name}  {actual:.2f}s (scored {c.result_s:.2f}s, drift {drift:.2f}s){flag}")
            rendered.append((c, dst, actual, drift))

    # ── verify ───────────────────────────────────────────────────────────────
    # The estimate ranked these. Only this stage can say what they actually score, and
    # it is the only thing permitted to set `measured`.
    if args.verify and rendered:
        print("\nverifying: re-scoring the rendered cuts through the encoder")
        verify_batch([r[1] for r in rendered], out_dir, ad, rendered, manifest_meta=manifest_meta)
    elif args.verify:
        print("\nnothing rendered to verify")
    else:
        print("\nNOT verified. Every number above is an estimate off the unedited arc:")
        print("  TRIBE's temporal window is non-causal, so removing a shot changes what")
        print("  its neighbours predict, and re-slicing the old arc cannot see that.")
        print("  Pass --verify (needs the TRIBE stack) to score the rendered cuts for real.")

    # ── write ────────────────────────────────────────────────────────────────
    payload = {
        "adId": ad_id,
        "source": str(video),
        "baseScore": base,
        "shots": [{"start": a, "end": b} for a, b in shots],
        "verified": bool(args.verify and rendered),
        "candidates": [
            {**asdict(c), "timeline": [list(s) for s in c.timeline],
             "removed": [list(s) for s in c.removed]}
            for c in ranked
        ],
        "rendered": [
            {"label": c.label, "file": str(p), "durationS": d, "driftS": dr}
            for c, p, d, dr in rendered
        ],
    }
    out_json = Path(args.json_path) if args.json_path else out_dir / f"{ad_id}_edits.json"
    out_json.write_text(json.dumps(payload, indent=2))
    print(f"\nwrote {out_json}")
    return 0


def verify_batch(files, out_dir, ad, rendered, *, manifest_meta=None):
    """Re-score rendered cuts by running them as a batch through demo/process_batch.py.

    They are apples-to-apples by construction — same campaign, same product, same length
    bucket — which is exactly the comparison that script is built for. It needs the TRIBE
    stack, so this degrades to a clear message rather than a traceback on a laptop."""
    manifest = {
        "batch_name": (manifest_meta or {}).get("batch_name") or f"{ad['id']} edits",
        "brand_name": (manifest_meta or {}).get("brand_name") or ad.get("brand") or "brand",
        "product_name": (manifest_meta or {}).get("product_name") or ad.get("title") or "product",
        "primary_problem": (manifest_meta or {}).get("primary_problem") or "n/a",
        "primary_benefit": (manifest_meta or {}).get("primary_benefit") or "n/a",
        "offer": (manifest_meta or {}).get("offer") or "n/a",
        "desired_cta": (manifest_meta or {}).get("desired_cta") or "n/a",
        "batch": {"platform": "meta", "placement": "reels", "objective": "conversions",
                  "product": ad.get("title") or "product", "audience": "n/a"},
        "ads": [{"filename": p.name, "id": f"edit_{i + 1:02d}", "title": c.label}
                for i, (c, p, _d, _dr) in enumerate(rendered)],
    }
    mpath = out_dir / "verify_manifest.json"
    mpath.write_text(json.dumps(manifest, indent=2))

    cmd = [sys.executable, str(ROOT / "demo" / "process_batch.py"), str(mpath), str(out_dir),
           "--out-dir", str(out_dir / "verify"), "--batch-size", str(len(files)), "--allow-n"]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    if proc.returncode != 0:
        tail = " ".join((proc.stderr or proc.stdout or "").strip().splitlines()[-4:])
        print(f"  verification did not run: {tail[:400]}")
        print("  (the rendered files are still on disk and still valid)")
        return

    vpath = out_dir / "verify" / "batch.json"
    if not vpath.exists():
        print("  verification produced no batch.json")
        return
    vr = json.loads(vpath.read_text())
    print(f"  {'measured':>9}  edit")
    for a in vr.get("ads", []):
        print(f"  {a['scores']['preflight']:9.0f}  {a['title']}")
    for c, *_ in rendered:
        c.measured = True


if __name__ == "__main__":
    sys.exit(main())
