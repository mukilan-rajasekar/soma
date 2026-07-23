#!/usr/bin/env python3
"""
coarse_states.py — turn the proxy valence/arousal arc into a COARSE affective-state
probability SPREAD over time, and write it into arc_<id>.json's affect block so the
demo's experimental "coarse states" lane populates.

WHAT THIS IS (and the honesty guardrails)
    - The states are AFFECT QUADRANTS, not named emotions:
        pleasant·calm, pleasant·intense, unpleasant·calm, unpleasant·intense
      derived by soft-assigning each second's (valence, arousal) to four prototype
      points. This deliberately avoids naming a specific emotion ("amusement",
      "fear") — that would be the reverse-inference trap (a validated named-emotion
      decoder is Rung 4 on the roadmap, fMRI-earned, not this).
    - It is a PROBABILITY SPREAD each second (a row that sums to 1), never a single
      confident verdict. The demo badges the lane "hypothesis · experimental" and
      states the model does NOT assert any single named emotion.
    - It inherits ALL the caveats of affect_extract.py: the underlying valence/
      arousal is an unvalidated a-priori PROXY, and the sign of valence is unproven.
      A coarse spread computed from an unvalidated proxy is itself unvalidated —
      this is a research preview of the OUTPUT SHAPE, not a result.

INPUT : arc_<id>.json with affect.valence[] (~[-1,1]) and affect.arousal[] (~[0,1]).
OUTPUT: same file, with affect.coarse_states = {labels:[...], probs:[[...], ...]}.

USAGE
    python coarse_states.py --arc-glob "public/arcs/*.json"
    python coarse_states.py --arc-glob "data/arcs/arc_*.json" --temp 0.18
"""
import argparse
import glob
import json
import math

LABELS = ["pleasant·calm", "pleasant·intense", "unpleasant·calm", "unpleasant·intense"]
# prototype (valence in [-1,1], arousal in [0,1]) for each coarse state
PROTO = [(0.6, 0.25), (0.6, 0.80), (-0.6, 0.25), (-0.6, 0.80)]


def softmax(xs):
    m = max(xs)
    es = [math.exp(x - m) for x in xs]
    s = sum(es) or 1.0
    return [e / s for e in es]


def coarse_row(v, a, temp=0.20):
    """Soft membership of one (valence, arousal) point over the 4 quadrant prototypes."""
    # negative squared distance / temperature -> softmax = smooth quadrant assignment
    logits = [-((v - pv) ** 2 + (a - pa) ** 2) / (2 * temp) for pv, pa in PROTO]
    return softmax(logits)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arc-glob", default="public/arcs/*.json")
    ap.add_argument("--temp", type=float, default=0.20,
                    help="softmax temperature; higher = softer/flatter spread")
    args = ap.parse_args()

    files = sorted(glob.glob(args.arc_glob))
    if not files:
        raise SystemExit(f"No arc jsons match {args.arc_glob!r}.")

    n_ok = 0
    for path in files:
        try:
            arc = json.load(open(path))
        except Exception as e:
            print(f"  [skip] {path}: {e}")
            continue
        af = arc.get("affect")
        if not af or not af.get("valence") or not af.get("arousal"):
            print(f"  [skip] {path}: no affect.valence/arousal (run affect_extract.py)")
            continue
        val, aro = af["valence"], af["arousal"]
        n = min(len(val), len(aro))
        probs = [[round(x, 4) for x in coarse_row(float(val[i]), float(aro[i]), args.temp)]
                 for i in range(n)]
        af["coarse_states"] = {
            "labels": LABELS,
            "probs": probs,
            "status": "experimental",
            "method": "soft affect-QUADRANT assignment of the proxy (valence,arousal) — "
                      "NOT named emotions, NOT validated; a research preview of the "
                      "output shape only (see ROADMAP.md Rung 4).",
        }
        json.dump(arc, open(path, "w"), indent=2)
        print(f"  {path}: wrote coarse_states ({n} steps, 4 quadrants)")
        n_ok += 1

    print(f"\n[done] wrote coarse states into {n_ok} arc(s). The demo's coarse lane is "
          "badged\n'hypothesis · experimental' — it shows a probability SPREAD, never a "
          "single named emotion.")


if __name__ == "__main__":
    main()
