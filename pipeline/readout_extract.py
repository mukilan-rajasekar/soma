"""Thin entry: `python -m pipeline.readout_extract` → `readout_extract.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("readout_extract.py")
