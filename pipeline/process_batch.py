"""Thin entry: `python -m pipeline.process_batch` → `demo/process_batch.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("demo/process_batch.py")
