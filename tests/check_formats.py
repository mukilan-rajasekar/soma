#!/usr/bin/env python3
"""
check_formats.py — cheap, dependency-free contract checks for the file formats the
demo + report consume. These pin the SHAPE of the artifacts (columns/keys/lengths)
so a downstream refactor can't silently change the schema the demo reads.

Each helper raises AssertionError with a specific message on violation and returns
True on success, so callers can wire it straight into their own check() harness:

    check("arc csv shape", check_arc_csv(path))

Contracts use SUBSET checks (required <= actual) on results.csv on purpose — other
agents may append columns; we require the ones we depend on, not exact equality.
"""
import csv
import json
import os


def _read_csv_rows(path):
    with open(path, newline="") as f:
        return [r for r in csv.reader(f) if r]


def check_arc_csv(path):
    """arc_<id>.csv: header[:2] == ['t_sec','global_mag']; header[2:] is [] or
    ['roi_mag']; and there are >= 2 numeric data rows."""
    assert os.path.exists(path), f"arc csv missing: {path}"
    rows = _read_csv_rows(path)
    assert len(rows) >= 3, f"arc csv needs header + >=2 rows, got {len(rows)} lines: {path}"
    header = [h.strip() for h in rows[0]]
    assert header[:2] == ["t_sec", "global_mag"], \
        f"arc csv header[:2] must be ['t_sec','global_mag'], got {header[:2]}: {path}"
    assert header[2:] in ([], ["roi_mag"]), \
        f"arc csv header[2:] must be [] or ['roi_mag'], got {header[2:]}: {path}"
    numeric = 0
    for r in rows[1:]:
        try:
            [float(x) for x in r[:len(header)]]
            numeric += 1
        except ValueError:
            raise AssertionError(f"arc csv has a non-numeric data row {r}: {path}")
    assert numeric >= 2, f"arc csv needs >=2 numeric rows, got {numeric}: {path}"
    return True


def check_arc_json(path):
    """arc_<id>.json: must contain at least {'video_id','duration_sec','timestamps',
    'activation'}, with len(timestamps) == len(activation)."""
    assert os.path.exists(path), f"arc json missing: {path}"
    with open(path) as f:
        d = json.load(f)
    required = {"video_id", "duration_sec", "timestamps", "activation"}
    assert required <= set(d.keys()), \
        f"arc json missing keys {required - set(d.keys())}: {path}"
    assert len(d["timestamps"]) == len(d["activation"]), \
        (f"arc json len(timestamps)={len(d['timestamps'])} != "
         f"len(activation)={len(d['activation'])}: {path}")
    return True


def check_results_csv(path):
    """results.csv: header must be a SUPERSET of the required columns
    {'video','feature','n','r','p','p_param'}. Extra columns are allowed."""
    assert os.path.exists(path), f"results csv missing: {path}"
    rows = _read_csv_rows(path)
    assert rows, f"results csv is empty: {path}"
    header = {h.strip() for h in rows[0]}
    required = {"video", "feature", "n", "r", "p", "p_param"}
    assert required <= header, \
        f"results csv missing required columns {required - header}: {path}"
    return True
