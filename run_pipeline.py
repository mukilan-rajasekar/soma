#!/usr/bin/env python3
"""
run_pipeline.py — ONE command that runs the whole CPU analysis chain end-to-end and
(optionally) publishes the result into the demo + a shareable report:

    honest_corr_timeseries  →  incremental_validity  →  affect_validate
                            →  publish_results (demo/results.json)
                            →  make_report (validation/report.html)

WHAT IT DOES / DOESN'T DO
    - It runs the ANALYSIS half locally on CPU — no GPU needed. It assumes the
      per-video arcs already exist (arc_<id>.csv + arc_<id>.json from batch_extract.py
      / colab_run.ipynb). The GPU EXTRACTION (video → brain) is a separate step you
      run on Colab; see colab_README.md. This script deliberately does not fake it.
    - Every stage is the real, honest harness. If the result is a null, the demo and
      report say so — publish_results stamps "null result — as pre-registered".
    - Stages whose inputs are missing are SKIPPED with a printed note (e.g. no
      baseline_*.csv → the incremental "beats ffmpeg" stage is skipped, not faked).

USAGE
    # smoke-test the whole chain on the synthetic fixtures (writes to a scratch dir):
    python run_pipeline.py --arc-dir tests/synth/arcs --human-dir tests/synth/human \
        --baseline-dir tests/synth/baseline --arc-json-dir tests/synth/arcs \
        --liris-dir tests/synth --out-dir /tmp/pl --no-demo

    # a real run: publish to the demo + write the report
    python run_pipeline.py --arc-dir data/arcs --human-dir data/tvsum \
        --baseline-dir data/baseline --arc-json-dir data/arcs --liris-dir data/liris \
        --out-dir validation --demo
"""
import argparse
import glob
import os
import subprocess
import sys

PY = sys.executable
ROOT = os.path.dirname(os.path.abspath(__file__))
# format-contract checks live under tests/ (dependency-free); import so a real run
# fails fast if a stage emits an off-schema CSV the demo/report can't consume.
sys.path.insert(0, os.path.join(ROOT, "tests"))
from check_formats import check_results_csv


def run(label, cmd, required=True):
    print(f"\n=== {label} ===")
    print("  $ " + " ".join(os.path.basename(c) if c.endswith(".py") else c for c in cmd))
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    tail = (r.stdout or "").strip().splitlines()[-6:]
    for ln in tail:
        print("    " + ln)
    if r.returncode != 0:
        print("    ! stderr:", (r.stderr or "").strip().splitlines()[-4:])
        if required:
            raise SystemExit(f"[pipeline] stage failed: {label}")
        print(f"    [skip] {label} failed but is optional — continuing.")
        return False
    return True


def _has(pattern):
    return bool(glob.glob(pattern))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arc-dir", default="data/arcs", help="dir with arc_<id>.csv")
    ap.add_argument("--human-dir", default="data/tvsum", help="TVSum human_arc_<id>.csv")
    ap.add_argument("--baseline-dir", default="data/baseline",
                    help="baseline_<id>.csv (optional; enables the incremental test)")
    ap.add_argument("--arc-json-dir", default="data/arcs",
                    help="arc_<id>.json with affect blocks (optional; affect test)")
    ap.add_argument("--liris-dir", default="data/liris",
                    help="liris_<id>.csv (optional; affect ground-truth)")
    ap.add_argument("--feature", choices=["roi", "global"], default="roi")
    ap.add_argument("--n-perm", type=int, default=5000)
    ap.add_argument("--out-dir", default="validation")
    ap.add_argument("--demo", dest="demo", action="store_true",
                    help="publish results into demo/results.json")
    ap.add_argument("--no-demo", dest="demo", action="store_false")
    ap.add_argument("--report", dest="report", action="store_true", default=True)
    ap.add_argument("--no-report", dest="report", action="store_false")
    ap.set_defaults(demo=False)
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    results_csv = os.path.join(args.out_dir, "results.csv")
    incr_csv = os.path.join(args.out_dir, "incremental.csv")
    affect_csv = os.path.join(args.out_dir, "affect_results.csv")

    # Clear last run's OPTIONAL-stage outputs up front: a stage that is SKIPPED this
    # run must never leave a stale CSV/plot for the report or publish to embed as if
    # fresh (that would stamp a different dataset's numbers into an as-is report). The
    # required attention stage regenerates results.csv every run, so leave that.
    for stale in (incr_csv, affect_csv,
                  os.path.join(args.out_dir, "affect_results_forest.png")):
        if os.path.exists(stale):
            os.remove(stale)

    if not _has(os.path.join(args.arc_dir, "arc_*.csv")):
        raise SystemExit(f"No arc_*.csv in {args.arc_dir}. Run batch_extract.py / "
                         f"colab_run.ipynb first (that's the GPU step).")

    print("=" * 72)
    print("Soma pipeline — CPU analysis chain (extraction is the separate GPU step)")
    print("=" * 72)

    # 1) attention (required)
    run("attention · honest_corr_timeseries",
        [PY, "honest_corr_timeseries.py", "--model-glob", os.path.join(args.arc_dir, "arc_*.csv"),
         "--human-dir", args.human_dir, "--feature", "both", "--n-perm", str(args.n_perm),
         "--out", os.path.join(args.out_dir, "results")])
    # fail fast if results.csv isn't the schema the demo/report + publish_results read
    check_results_csv(results_csv)

    # 2) incremental (optional — needs baselines)
    have_incr = False
    if _has(os.path.join(args.baseline_dir, "baseline_*.csv")):
        have_incr = run("incremental · vs ffmpeg baseline",
                        [PY, "incremental_validity.py", "--arc-dir", args.arc_dir,
                         "--human-dir", args.human_dir, "--baseline-dir", args.baseline_dir,
                         "--feature", args.feature, "--n-perm", str(args.n_perm),
                         "--out", incr_csv], required=False)
    else:
        print("\n[skip] incremental_validity — no baseline_*.csv (run baseline_extract.py "
              "to enable the 'beats ffmpeg?' test).")

    # 3) affect (optional — needs arc jsons with affect + liris)
    have_affect = False
    if _has(os.path.join(args.arc_json_dir, "arc_*.json")) and _has(os.path.join(args.liris_dir, "liris_*.csv")):
        have_affect = run("affect · Rung-1 vs LIRIS",
            [PY, "affect_validate.py", "--liris-dir", args.liris_dir,
             "--arc-dir", args.arc_json_dir, "--baseline-dir", args.baseline_dir,
             "--n-perm", str(args.n_perm), "--out", os.path.join(args.out_dir, "affect_results")],
            required=False)
    else:
        print("\n[skip] affect_validate — need arc_*.json (affect blocks) + liris_*.csv.")

    # 4) publish to demo (optional)
    if args.demo:
        cmd = [PY, "publish_results.py", "--results", results_csv, "--feature", args.feature,
               "--out", os.path.join(ROOT, "demo", "results.json")]
        if have_incr and os.path.exists(incr_csv):
            cmd += ["--incremental", incr_csv]
        run("publish · demo/results.json", cmd, required=False)
    else:
        print("\n[note] --demo not set: NOT writing demo/results.json (demo stays "
              "'illustrative'). Pass --demo only for a REAL run.")

    # 5) report (optional, on by default)
    if args.report:
        cmd = [PY, "make_report.py", "--results", results_csv,
               "--out", os.path.join(args.out_dir, "report.html")]
        # include an optional section ONLY if its stage actually ran+succeeded THIS run
        # (not merely that a file is on disk) — same this-run guard the publish stage uses.
        if have_affect and os.path.exists(affect_csv):
            cmd += ["--affect", affect_csv]
        if have_incr and os.path.exists(incr_csv):
            cmd += ["--incremental", incr_csv]
        run("report · validation/report.html", cmd, required=False)

    print("\n" + "=" * 72)
    print(f"[done] pipeline complete. Outputs in {args.out_dir}/ "
          f"(results.csv{', incremental.csv' if have_incr else ''}"
          f"{', affect_results.csv' if have_affect else ''}, report.html).")
    if args.demo:
        print("       demo/results.json written — the demo will show the real numbers "
              "(or an honest null).")
    print("       Reminder: publish to the demo ONLY from a real GPU run, never synthetic.")


if __name__ == "__main__":
    main()
