#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def test_missing_data_mode_exits_zero(tmp_path):
    proc = subprocess.run(
        [sys.executable, "scripts/stage1_tiktok_dryrun.py", "--root", str(tmp_path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    assert proc.returncode == 0
    assert "GPU/data not in this checkout" in proc.stdout
    assert "signal" not in proc.stdout.lower()
