#!/usr/bin/env python3
"""
check_frozen.py - served_ads fixtures carry immutable scorer provenance.

The Serve table freezes the prediction that was acted on at launch. A fixture row with a
prediction but no scorer_version or encoder_rev would train the dashboard to tolerate the
exact ambiguity the table exists to prevent.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tools" / "serve" / "fixtures" / "served_ads.json"

failures: list[str] = []


def note(ok: bool, label: str, detail: str = "") -> None:
    if ok:
        print(f"  \033[32m✓\033[0m {label}")
    else:
        print(f"  \033[31m✗\033[0m {label}" + (f"\n      {detail}" if detail else ""))
        failures.append(label)


def main() -> int:
    try:
        rows = json.loads(FIXTURE.read_text(encoding="utf8"))
    except FileNotFoundError:
        note(False, "served_ads fixture exists", os.path.relpath(FIXTURE, ROOT))
        return finish()
    except json.JSONDecodeError as exc:
        note(False, "served_ads fixture parses as JSON", str(exc))
        return finish()

    note(isinstance(rows, list), "served_ads fixture is a list")
    if not isinstance(rows, list):
        return finish()

    missing: list[str] = []
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            missing.append(f"row {i}: not an object")
            continue
        prediction = row.get("prediction")
        if not isinstance(prediction, dict):
            missing.append(f"row {i}: prediction is missing")
            continue
        for key in ("scorer_version", "encoder_rev"):
            if not prediction.get(key):
                missing.append(f"row {i}: prediction.{key} is missing")

    note(not missing, "every served_ads prediction has scorer_version and encoder_rev", "; ".join(missing))
    return finish()


def finish() -> int:
    if failures:
        print(f"\n\033[31m✗ {len(failures)} frozen prediction check(s) failed\033[0m")
        return 1
    print("\n\033[32m✓ served_ads predictions are frozen with provenance\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
