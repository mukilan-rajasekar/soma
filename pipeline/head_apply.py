"""Thin entry: `python -m pipeline.head_apply` → `head_apply.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("head_apply.py")
