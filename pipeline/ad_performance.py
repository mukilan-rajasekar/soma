"""Thin entry: `python -m pipeline.ad_performance` → `ad_performance.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("ad_performance.py")
