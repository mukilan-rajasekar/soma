#!/usr/bin/env python3
"""
brand_calibration.py - fit one brand's frozen scores to that brand's realized CTR.

This is the first mechanism in the repo that lets outcomes change what a customer sees,
so its boundaries matter more than its math. What it does: pool-adjacent-violators
isotonic regression from frozen prediction scores to realized CTR, per brand, producing
a versioned mapping artifact that reranks that brand's future candidates. What it does
NOT do: touch the encoder, touch the head, or pool data across brands. The cross-brand
refusal is load-bearing - Meta Policy 10.7's reach over pooled cross-client training is
an open counsel question (BUILD-PLAN §6.6), and until it is answered in writing this
module raises on any fixture whose rows span more than one brand_id.

The mapping is honest about its own weight: `calibrated` is false below MIN_PAIRS, the
fit is reported as in-sample (no holdout is claimed), and applying an uncalibrated
artifact returns the frozen score unchanged rather than a decorated one.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.serve.calibration import _latest_outcomes, _score, spearman  # noqa: E402

MIN_PAIRS = 8


def _pairs_from_fixture(data: dict[str, Any]) -> tuple[str, list[tuple[float, float]]]:
    brand_ids = set()
    declared = str(data.get("brand_id") or "")
    if declared:
        brand_ids.add(declared)

    served_ads = data.get("served_ads") or data.get("servedAds") or []
    outcomes = _latest_outcomes(data.get("outcomes") or [])

    pairs: list[tuple[float, float]] = []
    for ad in served_ads:
        ad_brand = str(ad.get("brand_id") or declared or "")
        if ad_brand:
            brand_ids.add(ad_brand)
        sid = str(ad.get("id") or "")
        outcome = outcomes.get(sid)
        if not sid or not outcome:
            continue
        outcome_brand = str(outcome.get("brand_id") or ad_brand or "")
        if outcome_brand:
            brand_ids.add(outcome_brand)
        try:
            impressions = float(outcome.get("impressions"))
            clicks = float(outcome.get("clicks"))
        except (TypeError, ValueError):
            continue
        if impressions <= 0:
            continue
        score = _score(ad.get("prediction") or {})
        if score is None:
            continue
        pairs.append((score, clicks / impressions))

    if len(brand_ids) > 1:
        raise ValueError(
            f"fixture spans {len(brand_ids)} brands ({sorted(brand_ids)}); refusing to pool "
            "cross-brand outcomes - Meta Policy 10.7 counsel question is open (BUILD-PLAN §6.6)"
        )
    if not brand_ids:
        raise ValueError("fixture carries no brand_id anywhere; a per-brand fit needs one")
    return brand_ids.pop(), sorted(pairs)


def _pava(pairs: list[tuple[float, float]]) -> list[dict[str, float]]:
    """Non-decreasing isotonic fit over score-sorted (score, ctr) pairs."""
    blocks: list[list[float]] = []  # [sum_y, count, min_score, max_score]
    for score, ctr in pairs:
        blocks.append([ctr, 1.0, score, score])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            b = blocks.pop()
            blocks[-1][0] += b[0]
            blocks[-1][1] += b[1]
            blocks[-1][3] = b[3]
    return [
        {
            "score_min": round(b[2], 6),
            "score_max": round(b[3], 6),
            "calibrated_ctr": round(b[0] / b[1], 6),
        }
        for b in blocks
    ]


def fit(data: dict[str, Any]) -> dict[str, Any]:
    brand_id, pairs = _pairs_from_fixture(data)
    calibrated = len(pairs) >= MIN_PAIRS
    mapping = _pava(pairs) if calibrated else []
    rho = spearman([p[0] for p in pairs], [p[1] for p in pairs])
    return {
        "brand_id": brand_id,
        "method": "pava_isotonic",
        "metric": "ctr",
        "n": len(pairs),
        "min_pairs": MIN_PAIRS,
        "calibrated": calibrated,
        "in_sample": True,
        "scope": "single_brand_rerank",
        "encoder_touched": False,
        "spearman_score_vs_ctr": None if rho is None else round(rho, 6),
        "mapping": mapping,
    }


def apply_mapping(artifact: dict[str, Any], score: float) -> float:
    """Calibrated CTR for a frozen score; the frozen score itself when uncalibrated."""
    if not artifact.get("calibrated") or not artifact.get("mapping"):
        return score
    mapping = artifact["mapping"]
    if score <= mapping[0]["score_min"]:
        return mapping[0]["calibrated_ctr"]
    for block in mapping:
        if score <= block["score_max"]:
            return block["calibrated_ctr"]
    return mapping[-1]["calibrated_ctr"]


def rank(artifact: dict[str, Any], served_ads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # The fit refuses cross-brand pooling; the apply side has to refuse cross-brand
    # LEAKAGE, or one brand's learned mapping quietly reorders another brand's ads
    # through the CLI (Greptile P1). An ad without a brand_id is tolerated - fixtures
    # predate the field - but a stated mismatch is a raise, same posture as fit().
    artifact_brand = str(artifact.get("brand_id") or "")
    for ad in served_ads:
        ad_brand = str(ad.get("brand_id") or "")
        if artifact_brand and ad_brand and ad_brand != artifact_brand:
            raise ValueError(
                f"artifact is for brand {artifact_brand} but served ad "
                f"{ad.get('id')!r} carries brand {ad_brand}; refusing cross-brand rerank "
                "(Policy 10.7 counsel question is open, BUILD-PLAN §6.6)"
            )
    rows = []
    for ad in served_ads:
        score = _score(ad.get("prediction") or {})
        if score is None:
            continue
        rows.append(
            {
                "served_ad_id": str(ad.get("id") or ""),
                "frozen_score": score,
                "calibrated_ctr": round(apply_mapping(artifact, score), 6),
            }
        )
    rows.sort(key=lambda r: (-r["calibrated_ctr"], -r["frozen_score"]))
    return rows


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Per-brand isotonic calibration of frozen scores to CTR.")
    action = p.add_mutually_exclusive_group(required=True)
    action.add_argument("--fit", type=Path, help="JSON fixture with brand_id, served_ads, outcomes")
    action.add_argument("--rank", type=Path, help="JSON with artifact and served_ads to rerank")
    p.add_argument("--out", type=Path, help="write result JSON")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.fit:
            result: Any = fit(json.loads(args.fit.read_text(encoding="utf8")))
        else:
            spec = json.loads(args.rank.read_text(encoding="utf8"))
            result = {"ranked": rank(spec["artifact"], spec.get("served_ads") or [])}
    except Exception as exc:
        print(f"brand_calibration failed: {exc}", file=sys.stderr)
        return 1
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
