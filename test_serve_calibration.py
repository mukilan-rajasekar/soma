#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.calibration import spearman, summarize_fixture  # noqa: E402


def test_spearman_handles_perfect_rank():
    assert spearman([1, 2, 3], [10, 20, 30]) == 1.0
    assert spearman([1, 2, 3], [30, 20, 10]) == -1.0


def test_positive_fixture_reports_signal():
    fixture = json.loads((ROOT / "tools/serve/fixtures/calibration_positive.json").read_text())

    summary = summarize_fixture(fixture)

    assert summary["n"] == 4
    assert summary["metric"] == "ctr"
    assert summary["model_spearman"] == 1.0
    assert summary["signal"] is True


def test_null_fixture_refuses_signal():
    fixture = json.loads((ROOT / "tools/serve/fixtures/calibration_null.json").read_text())

    summary = summarize_fixture(fixture)

    assert summary["n"] == 3
    assert summary["signal"] is False


def test_cli_writes_summary(tmp_path):
    out = tmp_path / "summary.json"
    proc = subprocess.run(
        [
            sys.executable,
            "tools/serve/calibration.py",
            "tools/serve/fixtures/calibration_positive.json",
            "--out",
            str(out),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    assert out.exists()
    assert '"signal": true' in proc.stdout
