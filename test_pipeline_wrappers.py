#!/usr/bin/env python3
"""pipeline wrappers resolve to real tracked scripts."""

from pathlib import Path

import pipeline

ROOT = Path(__file__).resolve().parent
PIPELINE = ROOT / "pipeline"

# Every thin wrapper module (except package helpers) must point at an existing file.
EXPECTED = {
    "batch_extract": "batch_extract.py",
    "build_roi_mask": "build_roi_mask.py",
    "baseline_extract": "baseline_extract.py",
    "readout_extract": "readout_extract.py",
    "process_batch": "demo/process_batch.py",
    "train_head": "train_head.py",
    "head_io": "head_io.py",
    "head_apply": "head_apply.py",
    "honest_corr_timeseries": "honest_corr_timeseries.py",
    "incremental_validity": "incremental_validity.py",
    "ad_backtest": "ad_backtest.py",
    "ad_fetch_bb": "ad_fetch_bb.py",
    "ad_performance": "ad_performance.py",
    "ad_advertisers": "ad_advertisers.py",
    "affect_extract": "affect_extract.py",
    "affect_head": "affect_head.py",
    "coarse_states": "coarse_states.py",
    "message_extract": "message_extract.py",
    "publish_to_supabase": "publish_to_supabase.py",
    "check_preds_space": "check_preds_space.py",
}


def test_pipeline_package_imports():
    assert pipeline.__doc__


def test_wrapper_targets_exist_and_are_listed():
    for name, rel in EXPECTED.items():
        wrapper = PIPELINE / f"{name}.py"
        assert wrapper.is_file(), f"missing wrapper pipeline/{name}.py"
        target = ROOT / rel
        assert target.is_file(), f"wrapper {name} points at missing {rel}"
        text = wrapper.read_text(encoding="utf8")
        assert rel in text, f"pipeline/{name}.py does not reference {rel}"


def test_readme_names_canonical_scorer():
    readme = (PIPELINE / "README.md").read_text(encoding="utf8")
    assert "demo/process_batch.py" in readme
    assert "do not invent" in readme.lower() or "Do not" in readme
