#!/usr/bin/env python3
"""
test_meta_ads.py — the rules that decide whether a collected "loser" is really a loser.

tools/corpus/meta_ads.py exists to fix the one thing audit.py said was broken: a corpus
of curated winners cannot answer "will this ad work". Its value therefore rests entirely
on the labels being honest, and there is exactly one way to destroy that quietly —

    LEFT CENSORING. An ad that started yesterday and is still running has a two-day
    duration. It is new, not failed. Let those in and the model learns that new ads are
    bad, which is worse than having no losers at all because it looks like it worked.

So the tests that matter here are not "does it parse HTML". They are the admission rules:
a record is usable only if the ad has STOPPED and its stop time is recorded, and a record
without media is not a training example no matter how good its label is.

Run: .venv/bin/python -m pytest -q test_meta_ads.py
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from tools.corpus.meta_ads import (
    MAX_AD_SECONDS,
    is_an_ad,
    scan_records,
    usable,
    video_url,
)

VID = "https://video-sea5-1.xx.fbcdn.net/o1/v/t2/f2/m367/AQNe.mp4?_nc_cat=102"

# Unix seconds. 2026-05-01 -> 2026-05-08 is a seven-day completed run.
START, END = 1777590000, 1778194800


def _render(dst: Path, seconds: float) -> Path:
    """A real file with a real duration — the filter reads the container, so a fixture
    that only claims a length would test nothing."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi",
         "-i", f"testsrc2=size=320x240:duration={seconds}:rate=8",
         "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(dst)],
        check=True)
    return dst


def record(**over):
    base = {
        "ad_archive_id": "1394221922532142",
        "is_active": False,
        "start_date": START,
        "end_date": END,
        "page_id": "195235680671697",
        "publisher_platform": ["FACEBOOK", "INSTAGRAM"],
        "targeted_or_reached_countries": ["DE"],
        "collation_count": 1,
        "snapshot": {"page_name": "REDCON1", "cta_type": "SHOP_NOW",
                     "videos": [{"video_hd_url": VID}]},
    }
    base.update(over)
    return base


# ── the left-censoring guard ────────────────────────────────────────────────────

def test_a_still_running_ad_is_refused():
    """The whole point. A live ad's duration is a partial measurement, and admitting it
    would manufacture a loser out of an ad that has not finished losing or winning."""
    assert usable(record(is_active=True)) is None


def test_an_ad_with_no_stop_time_is_refused():
    """`is_active` false is not enough on its own — without an end_date there is no
    completed lifetime to measure, only an absence."""
    for missing in (0, None, "", "1778194800"):
        assert usable(record(end_date=missing)) is None, f"admitted end_date={missing!r}"


def test_a_completed_run_is_admitted_with_its_real_duration():
    got = usable(record())
    assert got is not None
    assert got["days"] == 7
    assert got["page_name"] == "REDCON1"
    assert got["lib_id"] == "1394221922532142"


def test_impossible_ordering_is_refused():
    """end before start is corrupt, not a zero-day ad."""
    assert usable(record(start_date=END, end_date=START)) is None


def test_a_same_day_run_is_kept_as_zero_days():
    """A one-day kill is the most informative loser in the corpus. It must not be
    confused with the corrupt case above and dropped."""
    got = usable(record(end_date=START))
    assert got is not None and got["days"] == 0


# ── no media, no training example ───────────────────────────────────────────────

def test_a_record_without_video_is_refused():
    assert usable(record(snapshot={"page_name": "X", "videos": []})) is None


def test_video_is_found_in_carousel_cards():
    """Multi-asset ads keep the creative on the cards. Skipping them would quietly bias
    the corpus toward single-video ads, which is a different population."""
    snap = {"page_name": "X", "videos": [],
            "cards": [{"video_sd_url": VID}]}
    assert video_url(snap) == VID


def test_hd_is_preferred_over_sd():
    snap = {"videos": [{"video_sd_url": "https://sd.example/a.mp4",
                        "video_hd_url": VID}]}
    assert video_url(snap) == VID


def test_extra_videos_are_searched():
    assert video_url({"videos": [], "extra_videos": [{"video_hd_url": VID}]}) == VID


def test_non_http_media_is_not_accepted():
    assert video_url({"videos": [{"video_hd_url": "blob:whatever"}]}) is None


# ── parsing the page's own payload ──────────────────────────────────────────────

def test_scan_records_finds_nested_records_in_surrounding_noise():
    """The records arrive embedded in a much larger page, several levels deep. Brace
    matching rather than a regex is why body text containing braces does not truncate
    one."""
    page = ('<script>window.__d("x",[],function(){return ' +
            json.dumps({"data": {"edges": [{"node": {"collated_results": [record()]}}]}}) +
            '})</script>')
    got = scan_records(page)
    assert len(got) == 1
    assert got[0]["ad_archive_id"] == "1394221922532142"


def test_body_text_with_braces_does_not_break_a_record():
    r = record()
    r["snapshot"]["body"] = {"text": "use code {SAVE20} — } weird } copy"}
    got = scan_records(json.dumps(r))
    assert len(got) == 1
    assert usable(got[0])["days"] == 7


def test_unparseable_fragments_are_dropped_not_guessed_at():
    assert scan_records('{"ad_archive_id": "1", "broken":') == []


# ── is this even an ad ──────────────────────────────────────────────────────────
#
# A keyword search matches long-form video that happens to run through the ad system.
# The first real sweep pulled a 15-minute video, a 25-minute one, and one SIX HOURS long
# — 20% of that haul was not advertising. Length is only knowable after the download, so
# these are the rules applied to the file on disk.

@pytest.mark.skipif(shutil.which("ffprobe") is None, reason="ffprobe not installed")
def test_a_long_video_is_not_an_ad(tmp_path):
    clip = _render(tmp_path / "long.mp4", 200)
    ok, secs, why = is_an_ad(clip)
    assert not ok
    assert secs > MAX_AD_SECONDS
    assert "long-form" in why


@pytest.mark.skipif(shutil.which("ffprobe") is None, reason="ffprobe not installed")
def test_a_normal_ad_length_is_kept(tmp_path):
    ok, secs, why = is_an_ad(_render(tmp_path / "ad.mp4", 15))
    assert ok and why == ""
    assert 14 < secs < 16


@pytest.mark.skipif(shutil.which("ffprobe") is None, reason="ffprobe not installed")
def test_a_sub_second_stub_is_not_an_ad(tmp_path):
    ok, _secs, why = is_an_ad(_render(tmp_path / "blip.mp4", 1))
    assert not ok and "too short" in why


def test_an_unmeasurable_file_is_kept_but_flagged(monkeypatch, tmp_path):
    """Without ffprobe the filter is not running. Silently accepting everything would
    put long-form video back in the corpus with nobody aware it had happened, so the
    operator is told instead."""
    monkeypatch.setattr("tools.corpus.meta_ads.probe_seconds", lambda _p: None)
    ok, secs, why = is_an_ad(tmp_path / "whatever.mp4")
    assert ok and secs is None
    assert "ffprobe" in why
