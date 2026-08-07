#!/usr/bin/env python3
"""
check_claims.py - the demo has no hardcoded founder-attested marketing claims.

The page used to carry three literals that no committed artifact supported:
500 ads "from our design partners", 100+ waitlist entries, and 92% prediction
accuracy. This check is intentionally fixture-free and network-free: it scans the
TSX source that can render those claims and fails if the same shapes come back.

    .venv/bin/python tools/demo/check_claims.py
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"

failures: list[str] = []


def note(ok: bool, label: str, detail: str = "") -> None:
    if ok:
        print(f"  \033[32m✓\033[0m {label}")
    else:
        print(f"  \033[31m✗\033[0m {label}" + (f"\n      {detail}" if detail else ""))
        failures.append(label)


def strip_comments(text: str) -> str:
    """Remove TS/JS comments so source-code cautions do not trip marketing-copy checks."""
    text = re.sub(r"\{/\*.*?\*/\}", "", text, flags=re.S)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"(^|[^\S\r\n])//.*$", "", text, flags=re.M)
    return text


def windows(text: str, needle: re.Pattern[str], radius: int = 360) -> list[str]:
    return [
        text[max(0, m.start() - radius) : min(len(text), m.end() + radius)]
        for m in needle.finditer(text)
    ]


def find_near(
    files: list[Path],
    value_pattern: str,
    label_pattern: str,
) -> list[str]:
    value_re = re.compile(value_pattern, re.I)
    label_re = re.compile(label_pattern, re.I)
    hits: list[str] = []
    for path in files:
        text = strip_comments(path.read_text(encoding="utf8"))
        for chunk in windows(text, value_re):
            if label_re.search(chunk):
                hits.append(os.path.relpath(path, ROOT))
                break
    return hits


def find_file_pair(files: list[Path], first: str, second: str) -> list[str]:
    first_re = re.compile(first, re.I)
    second_re = re.compile(second, re.I)
    hits: list[str] = []
    for path in files:
        text = strip_comments(path.read_text(encoding="utf8"))
        if first_re.search(text) and second_re.search(text):
            hits.append(os.path.relpath(path, ROOT))
    return hits


def main() -> int:
    files = sorted(SRC.rglob("*.tsx"))
    note(bool(files), "TSX files found under src/")
    if not files:
        return finish()

    checks = [
        (
            "no 500 design-partner tile",
            find_near(files, r"value\s*=\s*\{\s*500\s*\}", r"design\s+partners"),
        ),
        (
            "no 92% prediction-accuracy tile",
            find_near(files, r"value\s*=\s*\{\s*92\s*\}", r"prediction\s+accuracy"),
        ),
        (
            "no 100+ waitlist tile",
            find_near(files, r"value\s*=\s*\{\s*100\s*\}", r"waitlist"),
        ),
        (
            "no literal 92% prediction-accuracy copy",
            find_file_pair(files, r"92\s*%", r"prediction\s+accuracy"),
        ),
        (
            "no literal design-partner provenance copy with 500",
            find_file_pair(files, r"from\s+our\s+design\s+partners", r"\b500\b"),
        ),
    ]

    for label, hits in checks:
        note(not hits, label, ", ".join(hits))

    return finish()


def finish() -> int:
    if failures:
        print(f"\n\033[31m✗ {len(failures)} claim check(s) failed\033[0m")
        print("  Re-derive public counts from committed artifacts, not literals.")
        return 1
    print("\n\033[32m✓ demo marketing claims are artifact-backed\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
