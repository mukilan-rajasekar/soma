"""Thin entry: `python -m pipeline.message_extract` → `message_extract.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("message_extract.py")
