"""Thin entry: `python -m pipeline.publish_to_supabase` → `publish_to_supabase.py`."""
from pipeline._run import run_script

if __name__ == "__main__":
    run_script("publish_to_supabase.py")
