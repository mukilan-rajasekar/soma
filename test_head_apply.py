#!/usr/bin/env python3
"""
test_head_apply.py — the arc_<id>.json contract, i.e. the only file the demo renders.

train_head/affect_head VALIDATE; `head_apply.apply_one` is the single writer of the
artifact the browser actually reads. Everything it does is a claim about honesty rather
than about arithmetic, which is why none of it shows up as a wrong number downstream:

  * The untrained arithmetic arc is DEMOTED into `arc["baseline"]` with its label, never
    deleted. That is the whole "we did not quietly replace the null result" story — if the
    demotion regressed, the head arc would simply appear where the arithmetic one used to
    be and no reader could tell. The guard that makes it safe is `"baseline" not in arc`:
    without it a SECOND apply would demote the FIRST apply's head arc into a slot labelled
    "untrained arithmetic arc", which is a lie that survives every other check here.
  * An affect-only apply onto an arc whose activation length disagrees with the freshly
    scored preds raises rather than misaligning the lanes. Same shape of failure: a
    15-second headline next to a 12-second valence lane renders perfectly.
  * The block-level `arc["affect"]["status"]` is the WORST status among the dims applied,
    never a hardcoded 'learned-hypothesis'. Note that a plain `min()` over the status
    STRINGS would return "learned-hypothesis" over "smoke" alphabetically — the exact
    inversion of the intent — so the STATUS_RANK key is load-bearing.
  * The emitted JSON parses with `json.loads(..., parse_constant=<raise>)`, proving
    `allow_nan=False` held and no bare `NaN` token reached the browser. Python's json
    ACCEPTS `NaN`; JavaScript's JSON.parse does not, so a leaked token bails the whole
    demo render rather than showing one bad second.

Also covered here: `_baseline_series`' arc-csv branch, which refuses to feed a
roi_mag-fitted head a global_mag column (different physical quantities), because it is the
other half of head_apply and test_affect_head.py exercised only the 'proxy' branch.

Fixtures are built inline: a fresh clone has no tests/ directory (it is gitignored and
local-only), so anything reading tests/synth/ passes here and fails everywhere else.

Run: .venv/bin/python -m pytest -q
"""
import json
import os
import warnings

import numpy as np
import pytest

import head_apply
import head_io


N_SEC, N_VERT, SHOT_SEC = 12, 6, 3.0        # 12 s at shot_sec 3.0 -> exactly 4 shots
PREDS = np.random.default_rng(20260727).normal(size=(N_SEC, N_VERT))
VAL_MASK = np.array([True, True, True, False, False, False])
ARO_MASK = np.array([False, False, False, True, True, True])

# the four badge rungs, as stamps. Verified against head_io.badge_text in test_head_badge.py;
# restated here so a rollup test names the status it is actually asking for.
VALIDATED = dict(median_r=0.31, stouffer_p=1e-4, paired_p=0.01, n_videos=20,
                 leak_check="pass", dataset="LIRIS-ACCEDE", date="2026-07-27")
SMOKE = dict(VALIDATED, n_videos=5)                        # n < 8
UNVALIDATED = dict(VALIDATED, median_r=-0.05)              # did not beat chance
POISONED = dict(VALIDATED, leak_check="FAIL")              # leakage control failed
NULL = dict(VALIDATED, median_r=float("nan"), stouffer_p=float("nan"),
            paired_p=float("nan"))                         # a null head's stamp is NaN


def _head(tmp, kind, masks, stamp, baseline_col="proxy", tag=""):
    """A saved+reloaded head, exactly as head_apply.main would hand it to apply_one."""
    path = os.path.join(str(tmp), f"head_{kind}{tag}.json")
    head_io.save_head(path, kind, np.full(2 * len(masks) + 1, 0.5), 0.1, 1.0,
                      masks, baseline_col, SHOT_SEC, stamp)
    return head_io.load_head(path)


def _valence(tmp, stamp=VALIDATED, tag=""):
    return _head(tmp, "valence", [("valence", VAL_MASK)], stamp, tag=tag)


def _arousal(tmp, stamp=VALIDATED, tag=""):
    return _head(tmp, "arousal", [("arousal", ARO_MASK)], stamp, tag=tag)


def _attention(tmp, stamp=VALIDATED, tag=""):
    return _head(tmp, "attention", [("attention", VAL_MASK)], stamp, tag=tag)


def _write_arc(tmp, vid, obj):
    with open(os.path.join(str(tmp), f"arc_{vid}.json"), "w") as f:
        json.dump(obj, f)


def _apply(tmp, vid, heads, preds=PREDS, out_dir=None):
    outp, applied = head_apply.apply_one(vid, preds, heads, str(tmp),
                                         str(out_dir or tmp))
    with open(outp) as f:
        return json.load(f), applied, outp


ARITHMETIC = [round(0.1 * i, 4) for i in range(N_SEC)]


# -----------------------------------------------------------------------------
# demotion — the arithmetic arc is relabelled, never dropped
# -----------------------------------------------------------------------------
def test_an_existing_arithmetic_arc_is_demoted_into_a_labelled_baseline(tmp_path):
    """The null result has to stay visible next to the head arc that supersedes it."""
    _write_arc(tmp_path, "v1", dict(activation=ARITHMETIC))
    arc, _, _ = _apply(tmp_path, "v1", [_valence(tmp_path)])
    assert arc["baseline"]["activation"] == ARITHMETIC
    assert "untrained arithmetic" in arc["baseline"]["label"]


def test_an_affect_only_apply_leaves_the_arithmetic_headline_in_place(tmp_path):
    """No attention head means no new headline — activation must survive untouched."""
    _write_arc(tmp_path, "v1", dict(activation=ARITHMETIC))
    arc, applied, _ = _apply(tmp_path, "v1", [_valence(tmp_path)])
    assert arc["activation"] == ARITHMETIC
    assert applied == ["valence"]


def test_an_attention_head_takes_the_headline_and_the_arithmetic_arc_survives(tmp_path):
    """The promotion path: activation is replaced, but only after being copied down."""
    _write_arc(tmp_path, "v1", dict(activation=ARITHMETIC))
    arc, _, _ = _apply(tmp_path, "v1", [_attention(tmp_path)])
    assert arc["activation"] != ARITHMETIC
    assert arc["baseline"]["activation"] == ARITHMETIC
    assert arc["attention_status"] == "learned-hypothesis"
    assert "trained head" in arc["attention_badge"]


def test_a_second_apply_does_not_demote_the_head_arc_over_the_baseline(tmp_path):
    """The sharpest guard in the file: `"baseline" not in arc` makes demotion idempotent.

    Drop it and re-running head_apply overwrites the arithmetic baseline with the PREVIOUS
    run's head arc — still carrying the label "untrained arithmetic arc". Every length,
    every type and every key stays valid; the file just starts lying about its own null.
    """
    _write_arc(tmp_path, "v1", dict(activation=ARITHMETIC))
    first, _, _ = _apply(tmp_path, "v1", [_attention(tmp_path)])
    second, _, _ = _apply(tmp_path, "v1", [_attention(tmp_path)])
    assert second["baseline"]["activation"] == ARITHMETIC
    assert second["baseline"]["activation"] != first["activation"]


def test_a_clip_with_no_prior_arc_gets_no_fabricated_baseline(tmp_path):
    """Nothing to demote means no baseline key — an empty one would invent a null."""
    arc, _, _ = _apply(tmp_path, "fresh", [_valence(tmp_path)])
    assert "baseline" not in arc
    assert "activation" not in arc            # affect-only: no headline is invented either
    assert len(arc["affect"]["valence"]) == N_SEC


# -----------------------------------------------------------------------------
# the length guard — refuse rather than misalign the lanes
# -----------------------------------------------------------------------------
def test_affect_only_apply_refuses_an_activation_of_the_wrong_length(tmp_path):
    _write_arc(tmp_path, "v2", dict(activation=[0.1] * (N_SEC + 3)))
    with pytest.raises(SystemExit, match="would misalign"):
        _apply(tmp_path, "v2", [_valence(tmp_path)])


def test_the_refusal_names_both_lengths(tmp_path):
    """The message has to be actionable: which arc, and by how much."""
    _write_arc(tmp_path, "v2", dict(activation=[0.1] * (N_SEC + 3)))
    with pytest.raises(SystemExit, match=r"is 15s but preds are 12s"):
        _apply(tmp_path, "v2", [_valence(tmp_path)])


def test_including_an_attention_head_replaces_the_mismatched_headline(tmp_path):
    """Replacing the headline resolves the mismatch, so the guard must not fire."""
    _write_arc(tmp_path, "v2", dict(activation=[0.1] * (N_SEC + 3)))
    arc, _, _ = _apply(tmp_path, "v2", [_valence(tmp_path), _attention(tmp_path)])
    assert len(arc["activation"]) == N_SEC
    assert len(arc["affect"]["valence"]) == N_SEC
    assert len(arc["baseline"]["activation"]) == N_SEC + 3   # the old one is still recorded


def test_a_matching_length_passes_the_guard(tmp_path):
    """The guard must not be over-eager: an aligned arc is applied without complaint."""
    _write_arc(tmp_path, "v2", dict(activation=ARITHMETIC))
    arc, _, _ = _apply(tmp_path, "v2", [_valence(tmp_path)])
    assert arc["activation"] == ARITHMETIC


def test_an_empty_activation_list_is_not_a_length_mismatch(tmp_path):
    """`and existing` — an empty list carries no alignment to disagree with."""
    _write_arc(tmp_path, "v2", dict(activation=[]))
    arc, _, _ = _apply(tmp_path, "v2", [_valence(tmp_path)])
    assert len(arc["affect"]["valence"]) == N_SEC


# -----------------------------------------------------------------------------
# the block-level affect status — worst applied dim, by rank not by name
# -----------------------------------------------------------------------------
def test_block_affect_status_is_the_worst_applied_dim(tmp_path):
    """One smoke dim must drag the block down, whatever the other dim scored.

    Also the alphabetical trap: `min(["learned-hypothesis", "smoke"])` is
    "learned-hypothesis", so a rollup that forgot STATUS_RANK would report the BEST dim.
    """
    heads = [_valence(tmp_path, VALIDATED), _arousal(tmp_path, SMOKE)]
    arc, _, _ = _apply(tmp_path, "s", heads)
    assert arc["affect"]["status"] == "smoke"


def test_the_rollup_does_not_depend_on_head_order(tmp_path):
    heads = [_arousal(tmp_path, SMOKE), _valence(tmp_path, VALIDATED)]
    arc, _, _ = _apply(tmp_path, "s", heads)
    assert arc["affect"]["status"] == "smoke"


def test_unvalidated_beats_smoke_but_loses_to_learned_hypothesis(tmp_path):
    """The middle of the ladder, so the rollup is a real ordering and not a poison flag."""
    arc, _, _ = _apply(tmp_path, "s1",
                       [_valence(tmp_path, VALIDATED), _arousal(tmp_path, UNVALIDATED)])
    assert arc["affect"]["status"] == "unvalidated"
    arc, _, _ = _apply(tmp_path, "s2",
                       [_valence(tmp_path, UNVALIDATED, tag="_u"), _arousal(tmp_path, SMOKE, tag="_s")])
    assert arc["affect"]["status"] == "smoke"


def test_a_poisoned_dim_drags_the_block_to_poisoned(tmp_path):
    """Rank 0. apply_one labels it truthfully even though main() is what refuses to run it."""
    arc, _, _ = _apply(tmp_path, "p",
                       [_valence(tmp_path, VALIDATED), _arousal(tmp_path, POISONED)])
    assert arc["affect"]["status"] == "poisoned"
    assert arc["affect"]["arousal_status"] == "poisoned"
    assert "DO NOT TRUST" in arc["affect"]["arousal_badge"]


def test_two_validated_dims_keep_learned_hypothesis(tmp_path):
    """The rollup must not be a hardcoded pessimism either — it has to be the real minimum."""
    arc, _, _ = _apply(tmp_path, "g",
                       [_valence(tmp_path, VALIDATED), _arousal(tmp_path, VALIDATED)])
    assert arc["affect"]["status"] == "learned-hypothesis"


def test_each_dim_keeps_its_own_status_next_to_the_block_status(tmp_path):
    """Per-dim truth survives the rollup, so a UI can show the good lane honestly."""
    arc, _, _ = _apply(tmp_path, "s",
                       [_valence(tmp_path, VALIDATED), _arousal(tmp_path, SMOKE)])
    assert arc["affect"]["valence_status"] == "learned-hypothesis"
    assert arc["affect"]["arousal_status"] == "smoke"
    assert arc["lanes"]["valence"]["status"] == "learned-hypothesis"
    assert arc["lanes"]["arousal"]["status"] == "smoke"


# -----------------------------------------------------------------------------
# the JSON itself — no token a browser will refuse
# -----------------------------------------------------------------------------
def _strict_load(path):
    """Parse the way a browser would: `NaN`/`Infinity` are NOT valid JSON there.

    Python's json accepts them silently, so asserting on json.load alone proves nothing;
    parse_constant is the only hook that makes a leaked token an error on this side.
    """
    def refuse(tok):
        raise AssertionError(f"emitted a bare {tok!r} token — strict JSON.parse would bail")
    with open(path) as f:
        return json.loads(f.read(), parse_constant=refuse)


def test_a_fully_nan_shot_still_emits_strict_json(tmp_path):
    """The realistic NaN source: one shot's features are entirely missing.

    Seconds 0-2 are a whole shot at shot_sec=3, so pooling gives NaN, `good` is False and
    per_sec is NaN before the display mapping. to_unit/to_signed send it to 0.0 — which is
    a legitimate value in both lanes, so a dropped shot is indistinguishable from a
    measured one. That is a display-honesty question, not this file's contract; what is
    pinned here is only that nothing non-finite reaches the file.
    """
    preds = PREDS.copy()
    preds[0:3, :] = np.nan
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")             # nanmean of an all-NaN shot
        _, _, outp = _apply(tmp_path, "n", [_valence(tmp_path)], preds=preds)
    arc = _strict_load(outp)
    assert np.isfinite(arc["affect"]["valence"]).all()
    assert arc["affect"]["valence"][:3] == [0.0, 0.0, 0.0]


def test_a_null_head_stamp_is_serialized_as_null_not_nan(tmp_path):
    """A null head's median_r/stouffer_p/paired_p come back NaN from the fit."""
    _, _, outp = _apply(tmp_path, "z", [_valence(tmp_path, NULL)])
    arc = _strict_load(outp)
    stamp = arc["lanes"]["valence"]["stamp"]
    assert stamp["median_r"] is None and stamp["stouffer_p"] is None
    assert arc["lanes"]["valence"]["status"] == "unvalidated"


def test_the_raw_file_contains_no_nan_or_infinity_token(tmp_path):
    """Belt and braces: parse_constant only fires on a token json recognises."""
    _, _, outp = _apply(tmp_path, "z", [_valence(tmp_path, NULL)])
    with open(outp) as f:
        raw = f.read()
    assert "NaN" not in raw and "Infinity" not in raw


def test_lane_values_are_rounded_to_four_decimals(tmp_path):
    """round(x, 4) at write time — the demo does not need 17 significant digits per second."""
    arc, _, _ = _apply(tmp_path, "r", [_valence(tmp_path)])
    for v in arc["affect"]["valence"]:
        assert v == round(v, 4)


def test_signed_and_unit_lanes_stay_inside_their_declared_ranges(tmp_path):
    """LANE_DISPLAY: valence is signed [-1, 1], attention and arousal are unit [0, 1]."""
    arc, _, _ = _apply(tmp_path, "b", [_valence(tmp_path), _arousal(tmp_path),
                                       _attention(tmp_path)])
    assert all(-1.0 <= v <= 1.0 for v in arc["affect"]["valence"])
    assert all(0.0 <= v <= 1.0 for v in arc["affect"]["arousal"])
    assert all(0.0 <= v <= 1.0 for v in arc["activation"])


def test_the_valence_lane_actually_carries_sign(tmp_path):
    """The bounds above are not enough on their own: [0, 1] fits inside [-1, 1].

    Routing valence through to_unit instead of to_signed keeps every length, every type and
    the declared range — it just deletes the direction, which is the entire point of a
    valence lane. to_signed puts the median at 0, so a real signed lane straddles zero.
    """
    arc, _, _ = _apply(tmp_path, "b", [_valence(tmp_path), _arousal(tmp_path)])
    assert min(arc["affect"]["valence"]) < 0.0 < max(arc["affect"]["valence"])
    assert min(arc["affect"]["arousal"]) >= 0.0        # a magnitude lane never goes negative


def test_a_nan_token_in_the_existing_arc_is_refused_not_propagated(tmp_path):
    """`allow_nan=False` is load-bearing, and this is the input that reaches it.

    Python's json.load ACCEPTS a bare NaN, so an arc_<id>.json written by any upstream tool
    at the json default (allow_nan=True) loads fine and would be copied into the demoted
    baseline verbatim. The dump refuses instead; head_apply.main's per-clip `except
    Exception` then skips that clip rather than shipping a file the browser cannot parse.
    """
    _write_arc(tmp_path, "q", dict(activation=ARITHMETIC))
    path = os.path.join(str(tmp_path), "arc_q.json")
    with open(path, "w") as f:
        f.write('{"activation": [NaN' + ", 1.0" * (N_SEC - 1) + "]}")
    with pytest.raises(ValueError, match="not JSON compliant"):
        _apply(tmp_path, "q", [_valence(tmp_path)])


# -----------------------------------------------------------------------------
# the surrounding frame — timestamps, duration, lane merging, output location
# -----------------------------------------------------------------------------
def test_timestamps_are_kept_when_their_length_already_agrees(tmp_path):
    """A clip at a non-1 Hz arc grid must not have its real timebase overwritten."""
    stamps = [round(i * 0.5, 2) for i in range(N_SEC)]
    _write_arc(tmp_path, "t", dict(activation=ARITHMETIC, timestamps=stamps, fps_arc=2.0))
    arc, _, _ = _apply(tmp_path, "t", [_valence(tmp_path)])
    assert arc["timestamps"] == stamps
    assert arc["duration_sec"] == 6.0                 # 12 samples at 2 fps
    assert arc["fps_arc"] == 2.0


def test_timestamps_are_regenerated_when_their_length_disagrees(tmp_path):
    _write_arc(tmp_path, "t", dict(activation=ARITHMETIC, timestamps=[0.0, 1.0, 2.0]))
    arc, _, _ = _apply(tmp_path, "t", [_valence(tmp_path)])
    assert arc["timestamps"] == [float(i) for i in range(N_SEC)]
    assert arc["fps_arc"] == 1.0
    assert arc["duration_sec"] == float(N_SEC)


def test_a_zero_fps_arc_does_not_divide_by_zero(tmp_path):
    """`arc.get("fps_arc") or 1.0`. The stored fps_arc is left as written, so a 0 there is
    still worth fixing upstream — but it must not take the whole apply down."""
    _write_arc(tmp_path, "t", dict(activation=ARITHMETIC, fps_arc=0))
    arc, _, _ = _apply(tmp_path, "t", [_valence(tmp_path)])
    assert arc["duration_sec"] == float(N_SEC)


def test_lanes_from_an_earlier_apply_are_merged_not_replaced(tmp_path):
    """`arc.get("lanes", {})` — applying heads in two runs must keep both lanes.

    NOTE the limit of this, deliberately not asserted: `affect["status"]` is rolled up from
    the dims applied in THIS call only, so a second run that applies just valence resets
    the block status even though the earlier smoke arousal lane is still in the file and
    still rendered. Within one invocation — which is what main() always does — the worst-dim
    claim holds; across invocations it does not.
    """
    _apply(tmp_path, "m", [_arousal(tmp_path, SMOKE)])
    arc, _, _ = _apply(tmp_path, "m", [_valence(tmp_path, VALIDATED)])
    assert sorted(arc["lanes"]) == ["arousal", "valence"]
    assert arc["lanes"]["arousal"]["status"] == "smoke"
    assert set(arc["affect"]) >= {"valence", "arousal"}


def test_every_lane_records_its_source_and_the_heads_stamp(tmp_path):
    """Provenance travels with the lane, so a reader never has to trust the arc alone."""
    arc, _, _ = _apply(tmp_path, "l", [_valence(tmp_path)])
    lane = arc["lanes"]["valence"]
    assert lane["source"] == "head"
    assert lane["stamp"]["leak_check"] == "pass"
    assert lane["stamp"]["dataset"] == "LIRIS-ACCEDE"
    assert len(lane["values"]) == N_SEC


def test_output_goes_to_out_dir_and_leaves_the_source_arc_untouched(tmp_path):
    """--out-dir is how a batch is re-scored without clobbering the inputs it read."""
    _write_arc(tmp_path, "o", dict(activation=ARITHMETIC))
    out_dir = tmp_path / "scored"
    arc, _, outp = _apply(tmp_path, "o", [_valence(tmp_path)], out_dir=out_dir)
    assert outp == os.path.join(str(out_dir), "arc_o.json")
    assert arc["video_id"] == "o"
    with open(os.path.join(str(tmp_path), "arc_o.json")) as f:
        assert json.load(f) == dict(activation=ARITHMETIC)   # source unchanged


# -----------------------------------------------------------------------------
# _baseline_series, arc-csv branch — the other half of "never fake the baseline"
# -----------------------------------------------------------------------------
def _write_arc_csv(tmp_path, vid, col, values):
    lines = [f"t_sec,{col}"] + [f"{i},{v}" for i, v in enumerate(values)]
    with open(os.path.join(str(tmp_path), f"arc_{vid}.csv"), "w") as f:
        f.write("\n".join(lines) + "\n")


def test_baseline_series_reads_the_named_column_from_the_arc_csv(tmp_path):
    vals = [float(i) for i in range(N_SEC)]
    _write_arc_csv(tmp_path, "c", "roi_mag", vals)
    head = _head(tmp_path, "attention", [("dmn", VAL_MASK)], VALIDATED,
                 baseline_col="roi_mag")
    t, v = head_apply._baseline_series(head, "c", PREDS, str(tmp_path))
    assert np.array_equal(t, np.arange(N_SEC, dtype=float))
    assert np.array_equal(v, np.asarray(vals))


def test_baseline_series_refuses_when_the_arc_csv_is_missing(tmp_path):
    """"refusing to fake it" — a head fitted against roi_mag needs roi_mag, not a default."""
    head = _head(tmp_path, "attention", [("dmn", VAL_MASK)], VALIDATED,
                 baseline_col="roi_mag")
    with pytest.raises(SystemExit, match="refusing to fake it"):
        head_apply._baseline_series(head, "missing", PREDS, str(tmp_path))


def test_baseline_series_refuses_the_wrong_baseline_column(tmp_path):
    """roi_mag (DMN ROI) and global_mag (whole cortex) are different physical quantities.

    Both are per-second float columns of the right length, so swapping them produces a
    plausible score from a weight that was never fitted for it.
    """
    _write_arc_csv(tmp_path, "c", "global_mag", [float(i) for i in range(N_SEC)])
    head = _head(tmp_path, "attention", [("dmn", VAL_MASK)], VALIDATED,
                 baseline_col="roi_mag")
    with pytest.raises(SystemExit, match="DIFFERENT physical quantities"):
        head_apply._baseline_series(head, "c", PREDS, str(tmp_path))


def test_a_roi_mag_head_scores_end_to_end_from_the_csv(tmp_path):
    """The csv branch reaching apply_one, so the two halves are known to compose."""
    _write_arc_csv(tmp_path, "e", "roi_mag", list(np.abs(PREDS[:, VAL_MASK]).mean(axis=1)))
    head = _head(tmp_path, "attention", [("dmn", VAL_MASK)], VALIDATED,
                 baseline_col="roi_mag")
    arc, applied, outp = _apply(tmp_path, "e", [head])
    assert applied == ["attention"]
    assert len(arc["activation"]) == N_SEC
    _strict_load(outp)
