"""Thin entry: `python -m pipeline.build_roi_mask` → `build_roi_mask.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("build_roi_mask.py")
