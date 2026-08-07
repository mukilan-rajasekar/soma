"""Thin entry: `python -m pipeline.head_io` → `head_io.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("head_io.py")
