"""Thin entry: `python -m pipeline.ad_backtest` → `ad_backtest.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("ad_backtest.py")
