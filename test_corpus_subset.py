#!/usr/bin/env python3
"""
test_corpus_subset.py — the rules that decide whether a training subset is honest.

tools/corpus/subset.py exists so a 51-ad pilot can be carried to the GPU box instead of
4.1 GB. Its value rests entirely on the subset being a fair miniature of the corpus, and
there are exactly three ways to destroy that quietly:

    NO WITHIN-ADVERTISER PAIRS. 82% of the variance in log1p(days_running) is between
    advertiser. A subset of 50 distinct brands makes the CV grouping a no-op and throws
    away the one comparison the datasheet says to trust first. Taking the first N rows of
    the manifest does exactly this.

    FEWER ADVERTISERS THAN FOLDS. group_kfold() silently clamps n_splits to the number of
    groups, so a subset dominated by three big brands turns a requested 5-fold CV into
    3 folds of one-brand-each and nobody is told.

    A SILENTLY SMALLER n. train.py skips an ad whose video find_video() cannot resolve
    with no message, so a bundle missing files trains on fewer ads than it claims and
    reports the smaller number as if it were the plan.

So the tests here are not "does it copy files". They are those three admission rules,
plus the load-bearing layout demo/train.py requires.

Run: .venv/bin/python -m pytest -q test_corpus_subset.py
"""
import csv
import subprocess
import sys
from pathlib import Path

import pytest

from tools.corpus.subset import (
    advertiser_of,
    group_by_advertiser,
    select,
)

ROOT = Path(__file__).resolve().parent


def make_corpus(root, advertisers):
    """A corpus of {advertiser: [outcomes]} with the videos and baselines it implies."""
    (root / "videos").mkdir(parents=True)
    (root / "baseline").mkdir(parents=True)
    rows = []
    index = 0
    for name, outcomes in advertisers.items():
        for outcome in outcomes:
            ad_id = f"meta_{index:02d}"
            rows.append({
                "ad_id": ad_id,
                "outcome": str(outcome),
                "platform": "meta",
                "note": f"lib{index};start_Apr_20_2026;page_{name}",
            })
            (root / "videos" / f"{ad_id}.mp4").write_bytes(b"\x00" * 16)
            (root / "baseline" / f"baseline_{ad_id}.csv").write_text(
                "t_sec,loudness,cuts,luminance,motion\n0,0.1,0.2,0.3,0.4\n"
            )
            index += 1
    with (root / "ad_manifest_meta.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["ad_id", "outcome", "platform", "note"]
        )
        writer.writeheader()
        writer.writerows(rows)
    return rows


@pytest.fixture
def corpus(tmp_path):
    # 20 advertisers x 3 ads, outcomes fanning from the failure end to long runs
    root = tmp_path / "corpus"
    make_corpus(root, {f"brand{i:02d}": [i, i * 20, i * 40] for i in range(20)})
    return root


def run(corpus, out, *extra):
    return subprocess.run(
        [sys.executable, "tools/corpus/subset.py",
         "--corpus", str(corpus), "--out", str(out), *extra],
        cwd=ROOT, capture_output=True, text=True,
    )


# --- the parsing the whole grouping rests on --------------------------------------

def test_advertiser_parses_out_of_the_note_string():
    assert advertiser_of({"note": "lib1;start_Apr_20_2026;page_Hismile;q_x"}) == "Hismile"


def test_row_without_a_page_token_is_dropped_not_made_a_singleton():
    # train.py invents __solo__<ad_id> here. A singleton group cannot contribute a
    # within-advertiser pair, so carrying it into a subset only dilutes it.
    assert advertiser_of({"note": "lib1;start_Apr_20_2026"}) is None
    assert advertiser_of({"note": ""}) is None
    assert advertiser_of({}) is None


# --- admission rule 1: the subset must contain within-advertiser pairs ------------

def test_selection_keeps_advertisers_whole(corpus):
    rows = list(csv.DictReader((corpus / "ad_manifest_meta.csv").open()))
    pool = group_by_advertiser(rows, 2, 6)
    picked = select(pool, 12)
    for name, ads in picked:
        assert len(ads) == len(pool[name]), f"{name} was split across the boundary"


def test_subset_has_within_advertiser_pairs(corpus, tmp_path):
    out = tmp_path / "subset"
    assert run(corpus, out, "-n", "12").returncode == 0
    rows = list(csv.DictReader((out / "ad_manifest_meta.csv").open()))
    names = [advertiser_of(row) for row in rows]
    assert len(rows) > len(set(names)), "every ad came from a different advertiser"


def test_band_excludes_advertisers_outside_it(tmp_path):
    root = tmp_path / "corpus"
    make_corpus(root, {"singleton": [5], "big": list(range(20)), "fits": [1, 2, 3]})
    rows = list(csv.DictReader((root / "ad_manifest_meta.csv").open()))
    assert set(group_by_advertiser(rows, 2, 6)) == {"fits"}


# --- admission rule 2: enough advertisers that grouped CV keeps its folds ---------

def test_subset_yields_more_advertisers_than_folds(corpus, tmp_path):
    out = tmp_path / "subset"
    assert run(corpus, out, "-n", "24").returncode == 0
    rows = list(csv.DictReader((out / "ad_manifest_meta.csv").open()))
    assert len({advertiser_of(row) for row in rows}) >= 5


def test_selection_spans_the_outcome_range(corpus):
    rows = list(csv.DictReader((corpus / "ad_manifest_meta.csv").open()))
    picked = select(group_by_advertiser(rows, 2, 6), 15)
    medians = [
        sorted(float(r["outcome"]) for r in ads)[len(ads) // 2] for _, ads in picked
    ]
    everything = sorted(float(row["outcome"]) for row in rows)
    # the picked brands must straddle the corpus median, not cluster on one side
    corpus_median = everything[len(everything) // 2]
    assert min(medians) < corpus_median < max(medians)


# --- admission rule 3: never write a bundle that trains on fewer ads than it says --

def test_missing_video_is_refused_not_silently_dropped(corpus, tmp_path):
    next(corpus.glob("videos/*.mp4")).unlink()
    result = run(corpus, tmp_path / "subset", "-n", "60")
    assert result.returncode != 0
    assert "lack a video or baseline" in result.stdout + result.stderr


def test_missing_baseline_is_refused(corpus, tmp_path):
    # 220 KB of CSV; without it control_series() falls through to opencv and train.py
    # catches the RuntimeError per-ad, skipping every one of them in silence.
    next(corpus.glob("baseline/*.csv")).unlink()
    result = run(corpus, tmp_path / "subset", "-n", "60")
    assert result.returncode != 0
    assert "lack a video or baseline" in result.stdout + result.stderr


# --- the layout demo/train.py requires -------------------------------------------

def test_bundle_layout_matches_what_train_py_reads(corpus, tmp_path):
    out = tmp_path / "subset"
    assert run(corpus, out, "-n", "12").returncode == 0

    # load_labels() hardcodes this filename for --target meta
    manifest = out / "ad_manifest_meta.csv"
    assert manifest.exists()

    rows = list(csv.DictReader(manifest.open()))
    for row in rows:
        # find_video() resolves ad_id -> videos/<ad_id>.mp4
        assert (out / "videos" / f"{row['ad_id']}.mp4").exists()
        # control_series() resolves baseline_dir/baseline_<ad_id>.csv
        assert (out / "baseline" / f"baseline_{row['ad_id']}.csv").exists()

    # nothing else ships: the bundle is the three things and no stragglers
    assert {p.name for p in out.iterdir()} == {
        "ad_manifest_meta.csv", "videos", "baseline"
    }


def test_manifest_schema_is_unchanged(corpus, tmp_path):
    out = tmp_path / "subset"
    assert run(corpus, out, "-n", "12").returncode == 0
    source = csv.DictReader((corpus / "ad_manifest_meta.csv").open()).fieldnames
    assert csv.DictReader((out / "ad_manifest_meta.csv").open()).fieldnames == source


# --- reproducibility: the choice of ads must not drift ---------------------------

def test_selection_is_deterministic(corpus, tmp_path):
    first, second = tmp_path / "a", tmp_path / "b"
    assert run(corpus, first, "-n", "18").returncode == 0
    assert run(corpus, second, "-n", "18").returncode == 0
    assert (first / "ad_manifest_meta.csv").read_text() == \
           (second / "ad_manifest_meta.csv").read_text()


def test_existing_output_is_not_clobbered_without_force(corpus, tmp_path):
    out = tmp_path / "subset"
    assert run(corpus, out, "-n", "12").returncode == 0
    again = run(corpus, out, "-n", "12")
    assert again.returncode != 0
    assert "--force" in again.stdout + again.stderr
    assert run(corpus, out, "-n", "12", "--force").returncode == 0
