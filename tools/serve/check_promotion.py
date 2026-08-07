#!/usr/bin/env python3
"""
check_promotion.py - refuse flywheel promotion without calibration evidence.

Promotion means "let this signal influence future serving decisions." Until a calibration
artifact says signal=true, this script fails closed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def check_promotion(path: Path) -> dict[str, object]:
    if not path.exists():
        raise RuntimeError("no calibration artifact; refusing promotion")
    artifact = json.loads(path.read_text(encoding="utf8"))
    if artifact.get("signal") is not True:
        raise RuntimeError("calibration signal=false; refusing promotion")
    return artifact


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Check whether a calibration artifact permits promotion.")
    p.add_argument("artifact", type=Path)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        artifact = check_promotion(args.artifact)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "artifact": str(args.artifact), "n": artifact.get("n")}, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
