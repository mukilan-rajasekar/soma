#!/usr/bin/env python3
"""
pipeline.py — brief in, ranked candidates out. Generation, filtered by the read-out.

    brief.json  ->  N directions  ->  provider  ->  N clips  ->  score  ->  ranked
                    (taxonomy)       (any vendor)              (TRIBE)     + a winner

THE FILTER IS THE PRODUCT. Generating video is a commodity that changes vendor every few
months. What is not a commodity is refusing to show you nineteen of the twenty-four, and
being able to say why. So this script is mostly not about generation: it is about making
sure every candidate goes through exactly the same scorer an uploaded batch goes through,
so a generated ad and a real one are directly comparable numbers rather than two scales
that happen to share a range.

That comparability is why the generated clips are scored by demo/process_batch.py as a
BATCH, with ids ad_01…ad_NN and a manifest built from the same brief — the identical path
tools/concierge/run_batch.py drives for a customer upload. There is no second scoring
route to keep in step, and no way for a generated score to mean something subtly
different from an uploaded one.

    # end to end today, no vendor and no key: the stub renders real scoreable files
    python -m tools.generate.pipeline --brief brief.json --out-dir /tmp/gen

    # …and score them for real (needs the TRIBE stack)
    python -m tools.generate.pipeline --brief brief.json --out-dir /tmp/gen --score

Without --score you get generated candidates and no ranking, and the run says so. A
ranking is the one thing this pipeline must never invent: without the scorer there is
nothing here but a taxonomy and some files.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.generate.directions import plan                      # noqa: E402
from tools.generate.provider import get_provider                # noqa: E402

MESSAGE_FIELDS = ("brand_name", "product_name", "primary_problem",
                  "primary_benefit", "offer", "desired_cta")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--brief", required=True, help="JSON with the six message fields")
    ap.add_argument("--out-dir", default="generated")
    ap.add_argument("--provider", default="stub")
    ap.add_argument("--n", type=int, default=None, help="how many directions (default: all)")
    ap.add_argument("--duration", type=float, default=15.0)
    ap.add_argument("--aspect", default="9:16", choices=["9:16", "1:1", "16:9"])
    ap.add_argument("--score", action="store_true",
                    help="score the generated clips through the real pipeline")
    args = ap.parse_args()

    brief = json.loads(Path(args.brief).read_text())
    missing = [f for f in MESSAGE_FIELDS if not str(brief.get(f, "")).strip()]
    if missing:
        sys.exit("The brief is missing: " + ", ".join(missing)
                 + "\nThese are the same six fields /upload collects; clarity is 25% of "
                   "the score and cannot be computed without them.")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    provider = get_provider(args.provider)

    specs = plan(brief, n=args.n, duration_s=args.duration, aspect=args.aspect)
    print(f"brief     {brief.get('brand_name')} {brief.get('product_name')}")
    print(f"provider  {provider.name}")
    print(f"plan      {len(specs)} directions\n")

    made = []
    for direction, spec in specs:
        dst = out_dir / f"{spec.id}.mp4"
        try:
            provider.generate(spec, dst)
        except RuntimeError as e:
            # Per-clip, so one refusal or timeout cannot lose the batch. A short batch is
            # still rankable; a failed run is not.
            print(f"  ! {spec.label}: {e}")
            continue
        made.append((direction, spec, dst))
        print(f"  {spec.id}  {spec.label:<16} {dst.name}")

    if not made:
        sys.exit("\nNothing generated.")

    payload = {
        "brief": {k: brief.get(k, "") for k in MESSAGE_FIELDS},
        "provider": provider.name,
        "scored": False,
        "candidates": [
            {"id": s.id, "label": s.label, "direction": d.key, "why": d.why,
             "prompt": s.prompt, "file": str(p)}
            for d, s, p in made
        ],
    }

    if args.score:
        print(f"\nscoring {len(made)} candidates through demo/process_batch.py")
        ranked = score_batch(made, brief, out_dir)
        if ranked:
            payload["scored"] = True
            by_id = {r["id"]: r for r in ranked}
            for c in payload["candidates"]:
                c["scores"] = by_id.get(c["id"], {}).get("scores")
                c["rank"] = by_id.get(c["id"], {}).get("rank")
            payload["candidates"].sort(key=lambda c: c.get("rank") or 99)
            print(f"\n  {'rank':>4} {'score':>6}  direction")
            for c in payload["candidates"]:
                if c.get("scores"):
                    print(f"  {c['rank']:>4} {c['scores']['preflight']:6.0f}  {c['label']}")
            print(f"\n  winner: {payload['candidates'][0]['label']}")
    else:
        print("\nNOT scored, so NOT ranked. These are candidates, not a recommendation:")
        print("  the filter is the product, and without --score it has not run.")

    out_json = out_dir / "generated.json"
    out_json.write_text(json.dumps(payload, indent=2))
    print(f"\nwrote {out_json}")
    return 0


def score_batch(made, brief, out_dir):
    """Score generated clips exactly the way an uploaded batch is scored.

    Same script, same manifest shape, same ids. A generated score and an uploaded score
    are therefore the same measurement, which is the only way the claim "our generated
    ads outscore your current ones" could ever mean anything."""
    manifest = {
        "batch_name": f"{brief.get('brand_name', 'brand')} generated",
        **{k: brief.get(k, "") for k in MESSAGE_FIELDS},
        "brand_aliases": brief.get("brand_aliases", []),
        "product_aliases": brief.get("product_aliases", []),
        "batch": {
            "platform": brief.get("platform", "meta"),
            "placement": brief.get("placement", "reels"),
            "objective": brief.get("objective", "conversions"),
            "product": brief.get("product_name", ""),
            "audience": brief.get("audience", "n/a"),
        },
        "ads": [{"filename": p.name, "id": s.id, "title": s.label} for _d, s, p in made],
    }
    mpath = out_dir / "manifest.json"
    mpath.write_text(json.dumps(manifest, indent=2))

    cmd = [sys.executable, str(ROOT / "demo" / "process_batch.py"), str(mpath), str(out_dir),
           "--out-dir", str(out_dir / "scored"), "--batch-size", str(len(made))]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    if proc.returncode != 0:
        tail = " ".join((proc.stderr or proc.stdout or "").strip().splitlines()[-4:])
        print(f"  scoring did not run: {tail[:400]}")
        print("  (the generated files are still on disk)")
        return None

    rpath = out_dir / "scored" / "batch.json"
    if not rpath.exists():
        print("  scoring produced no batch.json")
        return None
    return json.loads(rpath.read_text()).get("ads", [])


if __name__ == "__main__":
    sys.exit(main())
