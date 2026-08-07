"""Thin entry: `python -m pipeline.check_preds_space` → `check_preds_space.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("check_preds_space.py")
