#!/usr/bin/env python3
"""A/B planner and evaluator tests.

Two properties carry the module: budget conservation (allocated + holdout equals the
total exactly, in integers, every time) and honest decisions (no winner below the
floors, no winner without a p-value under alpha against the control).

Run: .venv/bin/python -m pytest -q test_serve_ab.py
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.ab import evaluate, plan_split  # noqa: E402


def test_plan_conserves_budget_exactly_with_holdout():
    plan = plan_split(
        {
            "daily_budget_micros": 10_000_001,
            "holdout_pct": 0.1,
            "arms": [{"arm_key": "control", "is_control": True}, {"arm_key": "b"}, {"arm_key": "c"}],
        }
    )
    assert plan["allocated_micros"] + plan["holdout_micros"] == 10_000_001
    assert sum(a["daily_budget_micros"] for a in plan["arms"]) == plan["allocated_micros"]
    # Deterministic: same spec, same split.
    again = plan_split(
        {
            "daily_budget_micros": 10_000_001,
            "holdout_pct": 0.1,
            "arms": [{"arm_key": "control", "is_control": True}, {"arm_key": "b"}, {"arm_key": "c"}],
        }
    )
    assert plan == again


def test_plan_refuses_degenerate_specs():
    with pytest.raises(ValueError, match="launch, not a test"):
        plan_split({"daily_budget_micros": 1000, "arms": [{"arm_key": "only"}]})
    with pytest.raises(ValueError, match="duplicate"):
        plan_split({"daily_budget_micros": 1000, "arms": [{"arm_key": "a"}, {"arm_key": "a"}]})
    with pytest.raises(ValueError, match="one arm may be the control"):
        plan_split(
            {
                "daily_budget_micros": 1000,
                "arms": [{"arm_key": "a", "is_control": True}, {"arm_key": "b", "is_control": True}],
            }
        )
    with pytest.raises(ValueError, match="holdout_pct"):
        plan_split({"daily_budget_micros": 1000, "holdout_pct": 1.0, "arms": [{"arm_key": "a"}, {"arm_key": "b"}]})


def test_weighted_split_follows_weights():
    plan = plan_split(
        {
            "daily_budget_micros": 3_000_000,
            "arms": [{"arm_key": "a", "weight": 2.0}, {"arm_key": "b", "weight": 1.0}],
        }
    )
    a, b = plan["arms"]
    assert a["daily_budget_micros"] == 2_000_000
    assert b["daily_budget_micros"] == 1_000_000


def test_evaluate_names_a_winner_only_with_evidence():
    clear = evaluate(
        {
            "arms": [
                {"arm_key": "control", "is_control": True, "impressions": 100_000, "clicks": 1_000},
                {"arm_key": "variant", "impressions": 100_000, "clicks": 1_500},
            ]
        }
    )
    assert clear["decision"] == "winner"
    assert clear["winner"] == "variant"
    assert clear["arms"][1]["vs_control"]["p_value"] < 0.05


def test_evaluate_refuses_below_floors():
    tiny = evaluate(
        {
            "arms": [
                {"arm_key": "control", "is_control": True, "impressions": 50, "clicks": 2},
                {"arm_key": "variant", "impressions": 50, "clicks": 5},
            ]
        }
    )
    assert tiny["decision"] == "insufficient_n"
    assert tiny["winner"] is None
    assert tiny["floors"]["met"] is False


def test_evaluate_ties_are_no_winner_not_a_coin_flip():
    tie = evaluate(
        {
            "arms": [
                {"arm_key": "control", "is_control": True, "impressions": 100_000, "clicks": 1_000},
                {"arm_key": "variant", "impressions": 100_000, "clicks": 1_010},
            ]
        }
    )
    assert tie["decision"] == "no_winner"
    assert tie["winner"] is None


def test_evaluate_rejects_impossible_counts():
    with pytest.raises(ValueError, match="within"):
        evaluate(
            {
                "arms": [
                    {"arm_key": "a", "impressions": 10, "clicks": 20},
                    {"arm_key": "b", "impressions": 10, "clicks": 1},
                ]
            }
        )


def test_cli_plan_round_trips(tmp_path):
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(
        json.dumps(
            {
                "daily_budget_micros": 1_000_000,
                "holdout_pct": 0.2,
                "arms": [{"arm_key": "control", "is_control": True}, {"arm_key": "b"}],
            }
        ),
        encoding="utf8",
    )
    out_path = tmp_path / "plan.json"
    subprocess.run(
        [sys.executable, "tools/serve/ab.py", "--plan", str(spec_path), "--out", str(out_path)],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    plan = json.loads(out_path.read_text(encoding="utf8"))
    assert plan["allocated_micros"] + plan["holdout_micros"] == 1_000_000
