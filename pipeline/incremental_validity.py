"""Thin entry: `python -m pipeline.incremental_validity` → `incremental_validity.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("incremental_validity.py")
