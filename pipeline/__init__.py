"""Thin CLI re-dispatch package. Real implementations stay at repo root / demo / tools.

See pipeline/README.md for the role catalog. Wrappers exist so agents can discover
entrypoints via `python -m pipeline.<name>` without a mass move that would break the gate.
"""

from __future__ import annotations

from pipeline._run import run_script

__all__ = ["run_script"]
