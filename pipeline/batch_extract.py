"""Thin entry: `python -m pipeline.batch_extract` → `batch_extract.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("batch_extract.py")
