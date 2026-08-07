#!/usr/bin/env python3
"""
check_licence_gate.py - no Serve fees while the backbone-cost gate is open.

PLAN.md gate 4 says "Named fallback backbone with a cost". While that exact gate line
is still present, this repository must not contain brand fee rows, even as fixtures.
The switch is the document line itself: resolving the gate in PLAN.md changes what this
check enforces.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "docs" / "strategy" / "PLAN.md"
FIXTURE = ROOT / "tools" / "serve" / "fixtures" / "brand_fees.json"
GATE_LINE = "Named fallback backbone with a cost"

failures: list[str] = []


def licence_blocked() -> bool:
    """True while PLAN.md still carries gate 4's marker line.

    Import this rather than re-reading PLAN.md elsewhere: one string, one reader, one
    switch. renewals.py uses it to refuse --execute — a weekly subscription that
    advances is a bill in waiting, and bills are what the gate blocks.
    """
    return GATE_LINE in PLAN.read_text(encoding="utf8")


def note(ok: bool, label: str, detail: str = "") -> None:
    if ok:
        print(f"  \033[32m✓\033[0m {label}")
    else:
        print(f"  \033[31m✗\033[0m {label}" + (f"\n      {detail}" if detail else ""))
        failures.append(label)


def main() -> int:
    gate_open = licence_blocked()
    note(True, f"PLAN.md licence gate is {'open' if gate_open else 'resolved'}")

    if not gate_open:
        return finish()

    if not FIXTURE.exists():
        note(True, "brand_fees fixture absent while gate is open")
        return finish()

    try:
        rows = json.loads(FIXTURE.read_text(encoding="utf8"))
    except json.JSONDecodeError as exc:
        note(False, "brand_fees fixture parses as JSON", str(exc))
        return finish()

    note(isinstance(rows, list), "brand_fees fixture is a list")
    if isinstance(rows, list):
        note(
            len(rows) == 0,
            "no brand_fees rows while PLAN gate 4 is open",
            f"{os.path.relpath(FIXTURE, ROOT)} contains {len(rows)} row(s)",
        )

    return finish()


def finish() -> int:
    if failures:
        print(f"\n\033[31m✗ {len(failures)} licence gate check(s) failed\033[0m")
        print("  Resolve PLAN.md gate 4 before adding brand_fees rows.")
        return 1
    print("\n\033[32m✓ Serve licence gate holds\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
