#!/usr/bin/env python3
"""
audit.py — can this corpus support the claim we want to make?

Scraping more ads is only worth doing if the ads we already have cannot answer the
question. This measures whether they can, so the next collection run is aimed rather than
hopeful.

THE QUESTION. Soma's moat claim is a mapping from predicted cortical response to the
metrics advertisers buy on. Training that mapping needs creative paired with outcomes
that VARY — and specifically that vary across the winner/loser boundary. A model fit on
winners alone learns to rank winners among winners, which is a different and much less
valuable thing than knowing whether an ad will work.

ad_performance.py already states the problem in its own header, and this quantifies it:

    "this whole corpus is TikTok's *Top Ads* showcase — an already-curated set of strong
     performers. So a label here means 'how strong AMONG strong ads', not 'winner vs
     loser'. ... For a real winner/loser test you want ads that failed too, which this
     source does not expose."

WHAT IT CHECKS

  coverage     how many ads have a label AND a downloadable video. Only their
               intersection is trainable; everything else is catalogue.
  variance     does the label move at all? A degenerate label (ad_performance.py found
               ctr_percentile pinned at 0.99 for every ad) has zero discriminative power
               no matter how many rows it has.
  range        does the label span the failure end? This is the one that decides whether
               more of the SAME source helps. If every ad in the corpus is a winner,
               scraping ten thousand more winners changes nothing.
  power        with this much usable data, what effect size could a test even detect?
               A corpus too small to detect a real effect will return a null that means
               "we could not tell", which is very different from "there is nothing there"
               and must not be reported as the latter.

Reads data/ads/ad_performance.csv and data/ads/ad_manifest.csv. Stdlib only, no network.

    python tools/corpus/audit.py
    python tools/corpus/audit.py --data-dir data/ads --json audit.json
"""

import argparse
import csv
import json
import math
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

# Below this, a label is not moving enough to fit anything to. Not a p-value: a coefficient
# of variation floor, used only to catch the degenerate case early and loudly.
MIN_CV = 0.05

# The corpus is a winners showcase if almost everything sits in the top of the label range.
# Not a law of nature — a threshold chosen to make the shape visible.
WINNER_QUANTILE = 0.5


def load(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="") as fh:
        return list(csv.DictReader(fh))


def numeric(rows, field):
    out = []
    for r in rows:
        v = (r.get(field) or "").strip()
        if not v:
            continue
        try:
            out.append(float(v))
        except ValueError:
            continue
    return out


def detectable_r(n: int, alpha: float = 0.05, power: float = 0.80) -> float:
    """Roughly the smallest correlation a two-sided test at this n could detect.

    Fisher-z approximation: r ~ tanh((z_a + z_b) / sqrt(n - 3)). Deliberately approximate
    — its job is to answer "is this corpus big enough to be worth running a test on",
    where the difference between 0.31 and 0.33 does not change the decision."""
    if n < 6:
        return float("nan")
    z_alpha, z_beta = 1.96, 0.8416          # two-sided .05, power .80
    return math.tanh((z_alpha + z_beta) / math.sqrt(n - 3))


def audit(data_dir: Path) -> dict:
    perf = load(data_dir / "ad_performance.csv")
    manifest = load(data_dir / "ad_manifest.csv")

    with_video = {r.get("ad_id") for r in manifest if r.get("ad_id")}
    findings = []
    platforms = {}

    for platform in sorted({r.get("platform", "?") for r in perf}):
        rows = [r for r in perf if r.get("platform") == platform]
        # The label each platform is actually scored on, per ad_performance.py.
        field = "ctr_index" if platform == "tiktok" else "days_running"
        vals = numeric(rows, field)
        trainable = [r for r in rows if r.get("ad_id") in with_video]

        entry = {
            "platform": platform,
            "labelField": field,
            "rows": len(rows),
            "labelled": len(vals),
            "withVideo": len(trainable),
        }

        if vals:
            mean = statistics.fmean(vals)
            sd = statistics.pstdev(vals)
            entry.update({
                "min": min(vals), "max": max(vals),
                "median": statistics.median(vals),
                "sd": round(sd, 4),
                "cv": round(sd / mean, 4) if mean else 0.0,
                "distinctValues": len(set(vals)),
            })
            # The winners-only shape: what fraction sits above the midpoint of the
            # observed range rather than above the median (which is 50% by definition).
            midpoint = min(vals) + (max(vals) - min(vals)) * WINNER_QUANTILE
            entry["fractionAboveMidRange"] = round(sum(v >= midpoint for v in vals) / len(vals), 3)

            if entry["distinctValues"] <= 2:
                findings.append(
                    f"{platform}: {field} takes only {entry['distinctValues']} distinct "
                    f"value(s). It cannot rank anything.")
            elif entry["cv"] < MIN_CV:
                findings.append(
                    f"{platform}: {field} barely varies (cv={entry['cv']}). Effectively "
                    f"a constant, so it has no discriminative power.")

        entry["detectableR"] = round(detectable_r(entry["withVideo"]), 3) if entry["withVideo"] >= 6 else None
        platforms[platform] = entry

    total_trainable = sum(p["withVideo"] for p in platforms.values())

    # ── the finding that decides the next collection run ─────────────────────
    tk = platforms.get("tiktok")
    if tk and tk.get("fractionAboveMidRange", 0) is not None and tk["rows"]:
        findings.append(
            "The TikTok rows come from Top Ads, which is a curated showcase of strong "
            "performers. Whatever their spread, none of them is a FAILED ad, so a model "
            "fit here learns 'how strong among strong' and cannot be asked whether an ad "
            "will work. More of the same source does not fix this."
        )

    if total_trainable:
        r = detectable_r(total_trainable)
        findings.append(
            f"With {total_trainable} ads carrying both a label and a video, a test at "
            f"conventional power could only detect |r| >= {r:.2f}. A null below that "
            f"means 'could not tell', not 'nothing there', and must not be reported as "
            f"the latter."
        )

    return {
        "totals": {
            "performanceRows": len(perf),
            "manifestRows": len(manifest),
            "trainable": total_trainable,
        },
        "platforms": platforms,
        "findings": findings,
    }


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", default="data/ads")
    ap.add_argument("--json", dest="json_path", default=None)
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.is_absolute():
        data_dir = ROOT / data_dir
    if not (data_dir / "ad_performance.csv").exists():
        sys.exit(f"No ad_performance.csv under {data_dir}. Run ad_performance.py first.")

    result = audit(data_dir)
    t = result["totals"]

    print(f"corpus     {t['performanceRows']} labelled rows, {t['manifestRows']} with video")
    print(f"trainable  {t['trainable']} ads carry BOTH\n")

    print(f"{'platform':<10} {'label':<14} {'n':>5} {'video':>6} {'distinct':>9} "
          f"{'cv':>7} {'range':>18}")
    for p in result["platforms"].values():
        rng = (f"{p['min']:.2f}..{p['max']:.2f}" if "min" in p else "-")
        print(f"{p['platform']:<10} {p['labelField']:<14} {p['rows']:>5} {p['withVideo']:>6} "
              f"{p.get('distinctValues', 0):>9} {p.get('cv', 0):>7.3f} {rng:>18}")

    print("\nfindings")
    for f in result["findings"]:
        print(f"  - {f}")

    if args.json_path:
        Path(args.json_path).write_text(json.dumps(result, indent=2))
        print(f"\nwrote {args.json_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
