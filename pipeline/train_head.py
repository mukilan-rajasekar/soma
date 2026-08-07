"""Thin entry: `python -m pipeline.train_head` → `train_head.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("train_head.py")
