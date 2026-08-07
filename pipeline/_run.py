"""Run a tracked script by relative path with the caller's argv."""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_script(relative: str, argv: list[str] | None = None) -> None:
    """Execute `ROOT/relative` as __main__, preserving CLI argv after the module name."""
    target = ROOT / relative
    if not target.is_file():
        raise FileNotFoundError(f"pipeline wrapper target missing: {target}")
    # Replace argv so argparse inside the target sees the same flags as a direct invoke.
    sys.argv = [str(target), *(argv if argv is not None else sys.argv[1:])]
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    runpy.run_path(str(target), run_name="__main__")
