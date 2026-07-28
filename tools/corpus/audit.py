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
  failures     how many ads actually FAILED, counted rather than assumed. This is the
               measure the first run of this audit was missing: it could say the corpus
               was winners-only, but once a loser-bearing source was added it had no way
               to notice. An audit that cannot see its own recommendation being followed
               is not much of an audit.
  pairing      how many advertisers appear more than once. A same-advertiser pair holds
               brand, budget and audience roughly constant so only the creative moved —
               a much stronger comparison than ranking across advertisers, and the one
               this corpus should be used for first.
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
import re
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

# An ad that ran two weeks or less and then STOPPED is the closest thing this data has to
# a failure. Advertisers keep paying for what works, so a short completed run is a proxy
# for "they stopped believing in it" — not proof, and tools/corpus/meta_ads.py spells out
# why (a short run can also be a dated promo that always had an end date). It is only
# meaningful for ads that have actually ended; a live ad's duration is a partial
# measurement and meta_ads.py refuses to collect those at all.
FAILURE_DAYS = 14

# Sources that are curated showcases by construction. No amount of collection from these
# produces a failed ad, so their rows are counted separately from the failure measure.
CURATED_SOURCES = {"tiktok"}


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


def advertisers(manifest) -> dict:
    """ad_id -> advertiser, read out of the manifest's own note field.

    meta_ads.py records `page_<name>` there. Nothing else in the corpus carries an
    advertiser, which is precisely why the within-advertiser comparison was not available
    before and is now."""
    out = {}
    for row in manifest:
        m = re.search(r"page_([A-Za-z0-9_]+)", row.get("note") or "")
        if m and row.get("ad_id"):
            out[row["ad_id"]] = m.group(1)
    return out


def audit(data_dir: Path) -> dict:
    perf = load(data_dir / "ad_performance.csv")
    manifest = load(data_dir / "ad_manifest.csv")

    with_video = {r.get("ad_id") for r in manifest if r.get("ad_id")}
    by_advertiser = advertisers(manifest)
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

        # ── the failure end, counted rather than assumed ──────────────────────
        # Only meaningful where the label IS a completed duration. A ctr index has no
        # notion of "stopped", so a curated source is marked as such instead of being
        # scored zero, which would read as a finding when it is a property of the source.
        if platform in CURATED_SOURCES:
            entry["curated"] = True
            entry["failures"] = None
        elif field == "days_running" and vals:
            fails = [v for v in vals if v <= FAILURE_DAYS]
            entry["curated"] = False
            entry["failures"] = len(fails)
            entry["failureFraction"] = round(len(fails) / len(vals), 3)

        # ── within-advertiser pairs ───────────────────────────────────────────
        seen = {}
        for r in trainable:
            adv = by_advertiser.get(r.get("ad_id"))
            if adv:
                seen.setdefault(adv, []).append(r)
        entry["advertisers"] = len(seen)
        entry["pairedAdvertisers"] = sum(1 for v in seen.values() if len(v) > 1)
        entry["adsInPairs"] = sum(len(v) for v in seen.values() if len(v) > 1)

        entry["detectableR"] = round(detectable_r(entry["withVideo"]), 3) if entry["withVideo"] >= 6 else None
        platforms[platform] = entry

    total_trainable = sum(p["withVideo"] for p in platforms.values())

    # ── the finding that decides the next collection run ─────────────────────
    total_failures = sum(p.get("failures") or 0 for p in platforms.values())
    total_paired = sum(p.get("adsInPairs") or 0 for p in platforms.values())

    curated_rows = sum(p["rows"] for p in platforms.values() if p.get("curated"))
    if curated_rows:
        findings.append(
            f"{curated_rows} rows come from a curated showcase (TikTok Top Ads). None of "
            "them is a FAILED ad, so on their own they teach 'how strong among strong' "
            "and cannot be asked whether an ad will work. More of that source does not "
            "fix this."
        )

    if total_failures:
        findings.append(
            f"{total_failures} ads ran {FAILURE_DAYS} days or less and then STOPPED. That "
            "is the failure end a curated source structurally cannot contain, so the "
            "winner/loser question is now askable of this corpus rather than only the "
            "rank-among-winners one. Still a proxy: a short completed run can also be a "
            "dated promo that always had an end date."
        )
    elif curated_rows:
        findings.append(
            "No ads in this corpus failed. Until some do, any model fit here can only "
            "rank winners among winners — run tools/corpus/meta_ads.py."
        )

    if total_paired:
        findings.append(
            f"{total_paired} ads come from advertisers with more than one ad in the "
            "corpus. Those are the comparisons to trust first: same brand, similar "
            "budget and audience, so the creative is close to the only thing that moved."
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
          f"{'cv':>7} {'range':>18} {'failed':>8} {'paired':>7}")
    for p in result["platforms"].values():
        rng = (f"{p['min']:.2f}..{p['max']:.2f}" if "min" in p else "-")
        fails = ("curated" if p.get("curated")
                 else (f"{p['failures']}" if p.get("failures") is not None else "-"))
        print(f"{p['platform']:<10} {p['labelField']:<14} {p['rows']:>5} {p['withVideo']:>6} "
              f"{p.get('distinctValues', 0):>9} {p.get('cv', 0):>7.3f} {rng:>18} "
              f"{fails:>8} {p.get('adsInPairs', 0):>7}")

    print("\nfindings")
    for f in result["findings"]:
        print(f"  - {f}")

    if args.json_path:
        Path(args.json_path).write_text(json.dumps(result, indent=2))
        print(f"\nwrote {args.json_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
