#!/usr/bin/env python3
"""Per-brand calibration tests.

The two properties that must never regress: the cross-brand refusal (Policy 10.7 is an
open counsel question, so pooling brands is a raise, not a warning) and the honesty of
`calibrated` (below MIN_PAIRS the artifact says so and apply_mapping passes frozen
scores through untouched).

Run: .venv/bin/python -m pytest -q test_serve_brand_calibration.py
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.brand_calibration import MIN_PAIRS, apply_mapping, fit, rank  # noqa: E402


def _fixture(n: int, *, brand: str = "brand_1", noisy_ctr=None):
    served, outcomes = [], []
    for i in range(n):
        score = (i + 1) / n
        ctr = noisy_ctr(i) if noisy_ctr else 0.005 + 0.01 * score
        served.append({"id": f"ad_{i}", "brand_id": brand, "prediction": {"score": score}})
        outcomes.append(
            {
                "served_ad_id": f"ad_{i}",
                "brand_id": brand,
                "impressions": 10_000,
                "clicks": int(round(ctr * 10_000)),
                "pulled_at": "2026-08-01",
            }
        )
    return {"brand_id": brand, "served_ads": served, "outcomes": outcomes}


def test_fit_refuses_cross_brand_pooling():
    data = _fixture(10)
    data["served_ads"][3]["brand_id"] = "brand_2"
    with pytest.raises(ValueError, match="10.7"):
        fit(data)


def test_fit_is_monotone_and_deterministic():
    artifact = fit(_fixture(12))
    assert artifact["calibrated"] is True
    values = [b["calibrated_ctr"] for b in artifact["mapping"]]
    assert values == sorted(values)
    assert artifact == fit(_fixture(12))
    assert artifact["encoder_touched"] is False
    assert artifact["scope"] == "single_brand_rerank"


def test_below_min_pairs_is_uncalibrated_and_passthrough():
    artifact = fit(_fixture(MIN_PAIRS - 1))
    assert artifact["calibrated"] is False
    assert artifact["mapping"] == []
    assert apply_mapping(artifact, 0.42) == 0.42


def test_pava_pools_violators():
    # A dip in the middle must be pooled flat, not memorized.
    dips = {3: 0.001}
    artifact = fit(_fixture(10, noisy_ctr=lambda i: dips.get(i, 0.005 + 0.001 * i)))
    values = [b["calibrated_ctr"] for b in artifact["mapping"]]
    assert values == sorted(values)


def test_rank_orders_by_calibrated_then_frozen():
    artifact = fit(_fixture(12))
    ranked = rank(
        artifact,
        [
            {"id": "low", "prediction": {"score": 0.1}},
            {"id": "high", "prediction": {"score": 0.9}},
        ],
    )
    assert [r["served_ad_id"] for r in ranked] == ["high", "low"]


def test_cli_fit_round_trips(tmp_path):
    fixture_path = tmp_path / "fixture.json"
    fixture_path.write_text(json.dumps(_fixture(10)), encoding="utf8")
    out_path = tmp_path / "artifact.json"
    subprocess.run(
        [
            sys.executable,
            "tools/serve/brand_calibration.py",
            "--fit",
            str(fixture_path),
            "--out",
            str(out_path),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    artifact = json.loads(out_path.read_text(encoding="utf8"))
    assert artifact["brand_id"] == "brand_1"
    assert artifact["calibrated"] is True


def test_cli_cross_brand_fails_loudly(tmp_path):
    data = _fixture(10)
    data["outcomes"][2]["brand_id"] = "brand_2"
    fixture_path = tmp_path / "fixture.json"
    fixture_path.write_text(json.dumps(data), encoding="utf8")
    result = subprocess.run(
        [sys.executable, "tools/serve/brand_calibration.py", "--fit", str(fixture_path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "10.7" in result.stderr
