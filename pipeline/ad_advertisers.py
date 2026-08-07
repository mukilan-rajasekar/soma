"""Thin entry: `python -m pipeline.ad_advertisers` → `ad_advertisers.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("ad_advertisers.py")
