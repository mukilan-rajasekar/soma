"""Thin entry: `python -m pipeline.baseline_extract` → `baseline_extract.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("baseline_extract.py")
