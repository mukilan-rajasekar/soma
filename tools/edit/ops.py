#!/usr/bin/env python3
"""
ops.py — the edit space: what edits exist, and what each one is predicted to score.

This turns the read-out from a diagnosis into a deliverable. /demo already shows a
leave-one-shot-out pass ("cut the 1.7-4.9s beat and the score goes 62 to 66"), but that
pass only ever removes ONE shot and only ever reports a number. Here the same arithmetic
is generalised into a searchable space of real edits, every one of which can be rendered
to an actual file from the customer's own frames.

── ONE REPRESENTATION ──────────────────────────────────────────────────────────

Every edit, whatever produced it, is a TIMELINE: an ordered list of (start, end) segments
in SOURCE time, played in list order.

    remove shot 3      ->  [(0,1.7), (1.7,4.9), (7.2,30)]        a segment is dropped
    hoist shot 5       ->  [(12,15), (0,1.7), (1.7,4.9), ...]    order changes, nothing lost
    trim the first 2s  ->  [(2,4.9), (4.9,7.2), ...]             a segment is shortened

That is the whole DSL, and it is deliberately not a list of named operations. The
estimator and the renderer both consume a timeline and nothing else, so adding a new kind
of edit means adding a function that returns one — no new branch in the scorer, no new
branch in ffmpeg, no way for the two to disagree about what an edit means.

── THE HONESTY THAT SHAPES THIS FILE ───────────────────────────────────────────

Scoring a timeline by re-slicing the ALREADY-COMPUTED arc is nearly free, and it is what
shot_contributions() in tools/demo/build_report.py does today. It is also an ESTIMATE,
not a measurement, and the artifact says why in its own words:

    "the model's temporal window is likely non-causal, so the lead response can be
     contaminated by the content that follows"
                              — batch_report.json, comparability.note

If TRIBE saw shot 5 while predicting the response to shot 4, then deleting shot 5 changes
what shot 4 should predict, and re-slicing the old arc cannot know that. The estimate is
still a good SEARCH heuristic — it is monotone in the thing we care about and costs
nothing — but it is not the score of the edited film.

So this module is explicitly the cheap half of a two-stage design:

    enumerate  ->  estimate (free, here)  ->  render top-K  ->  RE-SCORE through TRIBE
                   a ranking heuristic                          the actual number

`Candidate.measured` stays False until something has run the rendered file back through
the encoder. Nothing in this file may set it True. That distinction is the difference
between "we think this cut is better" and "we checked", and it is the one the category
routinely blurs.

Reordering is estimated on a longer leash than removal and is flagged accordingly
(`confidence`): removing a shot at least leaves the surviving shots in their original
context, while hoisting one moves it into a context it was never predicted in.
"""

import math
from dataclasses import dataclass, field
from typing import Callable, Sequence

Segment = tuple[float, float]
Timeline = list[Segment]

# Below this, a segment is not a shot: it is a cut artifact from ffmpeg's scene detector,
# and scoring it produces noise. Matches the 1.0s floor shot_contributions() already uses.
MIN_SHOT_S = 1.0

# An edit that leaves too little film has nothing left to score. score_ad reads a 3s hook
# window off the front, so anything at or under it is not an ad any more.
MIN_RESULT_S = 6.0

# How confident the estimate is for a given kind of edit. Not a probability — a label,
# so a reader can see which numbers rest on more assumption than others.
CONFIDENCE = {
    "remove": "estimate",           # survivors keep their original neighbours
    "remove_pair": "estimate",
    "trim_head": "estimate",
    "hoist": "weak estimate",       # the shot is moved into a context it was never predicted in
    "swap": "weak estimate",
    # The arc was computed WITH this soundtrack, so re-slicing it cannot say what a
    # soundtrack change does. These carry est_delta 0 by construction and only the
    # verify stage can attach a real number to them.
    "mute_shot": "unestimated",
    "duck_shot": "unestimated",
}


@dataclass
class Candidate:
    """One edit, its timeline, and what we think it scores."""

    kind: str
    label: str
    timeline: Timeline
    #: Source segments this edit removes, for explaining the edit in words.
    removed: Timeline = field(default_factory=list)
    #: Audio-only operations in SOURCE time: {"op": "mute"|"duck", "start", "end"}.
    #: The timeline is untouched — an audio op changes the soundtrack, not the frames —
    #: and the renderer remaps these into output time before applying them.
    audio_ops: list = field(default_factory=list)
    est_score: float = 0.0
    est_delta: float = 0.0
    #: How much film survives, in seconds.
    result_s: float = 0.0
    #: False until the rendered file has been run back through the encoder. Only the
    #: verify stage may flip this, and nothing in this module does.
    measured: bool = False
    confidence: str = "estimate"

    def describe(self) -> str:
        cut = sum(b - a for a, b in self.removed)
        tail = f", {cut:.1f}s out" if cut else ""
        return f"{self.label} ({self.est_delta:+.0f}{tail})"


# ── shots ───────────────────────────────────────────────────────────────────────

def shots_from_boundaries(boundaries: Sequence[float], duration: float) -> Timeline:
    """ffmpeg scene-detection cut points -> the shot segments between them.

    Same edge construction as build_report.shot_contributions, including the
    sub-second floor: a "shot" shorter than MIN_SHOT_S is a detector artifact and is
    folded into its predecessor rather than dropped, so the timeline stays gapless and
    a rendered edit cannot silently lose frames.
    """
    edges = [0.0] + [round(float(b), 3) for b in boundaries if 0 < b < duration] + [float(duration)]
    edges = sorted(set(edges))

    shots: Timeline = []
    for a, b in zip(edges, edges[1:]):
        if b - a < MIN_SHOT_S and shots:
            # extend the previous shot rather than emitting a sliver
            shots[-1] = (shots[-1][0], b)
        else:
            shots.append((a, b))
    # A leading sliver has no predecessor to merge into; fold it forward instead.
    if len(shots) > 1 and shots[0][1] - shots[0][0] < MIN_SHOT_S:
        shots[1] = (shots[0][0], shots[1][1])
        shots.pop(0)
    return shots


def total_seconds(timeline: Timeline) -> float:
    return sum(max(0.0, b - a) for a, b in timeline)


def lane_length(lanes) -> int:
    """How many timepoints the arc has, whatever the lanes happen to be called.

    THIS USED TO BE `len(lanes.get("dorsal") or [])` AND THAT WAS A SILENT ZERO. There are
    two producers of `lanes` and they do not agree on the key names:

        /demo campaign   build_report.py     dorsal / ventral / language
        customer batch   process_batch.py    higherOrder / salventattn / visual

    estimate() only wants the SAMPLE COUNT — it slices every lane it is given by index and
    never reads a lane by name — so keying the count off one producer's vocabulary made the
    other producer's arcs look like empty arrays. n came back 0, the `len(idx) < 4` guard
    fired, and every candidate returned est_delta 0.0 with result_s left at its 0.0 default.
    rank() then had nothing to sort by and fell through to enumeration order.

    The visible symptom was not an error. It was a customer edit search that returned a
    plausible-looking list of edits whose numbers were all +0 and whose ranking was
    arbitrary — on the demo campaign it worked correctly, which is exactly why it survived.

    Taking the longest lane rather than a named one is also the honest reading of the
    contract: the lanes are parallel arrays over the same timebase, so any of them answers
    the question, and max() is robust to one lane being absent or short.
    """
    return max((len(v) for v in lanes.values() if v), default=0)


# ── the edit space ──────────────────────────────────────────────────────────────

def enumerate_candidates(shots: Timeline, *, allow_reorder: bool = True) -> list[Candidate]:
    """Every edit worth scoring, given the shot list.

    Bounded by construction rather than by a cap: with n shots this yields n removals,
    n-1 adjacent-pair removals, n-1 hoists and 2 head trims, so about 4n candidates. For
    a real ad (8 to 15 shots) that is 30 to 60 — small enough to score all of them for
    free, and large enough that the winner is usually not the one a person would have
    guessed.

    What is deliberately NOT in here: arbitrary permutations. n! is not searchable, and
    reordering is the weakest thing the estimator can speak to, so the reorder family is
    restricted to single-shot hoists where the intent (get to the product sooner) is
    legible and the claim is small.
    """
    out: list[Candidate] = []
    n = len(shots)
    if n < 2:
        return out

    # ── remove one shot ─────────────────────────────────────────────────────
    for i in range(n):
        rest = shots[:i] + shots[i + 1:]
        if total_seconds(rest) < MIN_RESULT_S:
            continue
        out.append(Candidate(
            kind="remove",
            label=f"Cut the {_fmt(shots[i])} beat",
            timeline=rest,
            removed=[shots[i]],
            confidence=CONFIDENCE["remove"],
        ))

    # ── remove two adjacent shots ───────────────────────────────────────────
    # A single slow beat is often two shots of the same slow idea; removing them
    # separately can score worse than removing both, which is exactly the kind of thing
    # a one-at-a-time pass cannot find.
    for i in range(n - 1):
        rest = shots[:i] + shots[i + 2:]
        if total_seconds(rest) < MIN_RESULT_S:
            continue
        out.append(Candidate(
            kind="remove_pair",
            label=f"Cut {_fmt(shots[i])} and {_fmt(shots[i + 1])}",
            timeline=rest,
            removed=[shots[i], shots[i + 1]],
            confidence=CONFIDENCE["remove_pair"],
        ))

    # ── hoist a later shot to the front ─────────────────────────────────────
    # Every frame is kept; only the order changes. This is the "get to the product in
    # the first second" edit, and it is the one a media buyer asks for by name.
    if allow_reorder:
        for i in range(1, n):
            hoisted = [shots[i]] + shots[:i] + shots[i + 1:]
            out.append(Candidate(
                kind="hoist",
                label=f"Open on the {_fmt(shots[i])} beat",
                timeline=hoisted,
                removed=[],
                confidence=CONFIDENCE["hoist"],
            ))

    # ── trim the head ───────────────────────────────────────────────────────
    # Not a shot boundary edit: sometimes the first shot is right and merely long. Two
    # fixed trims rather than a sweep, because the estimate is on a 1 Hz grid and
    # anything finer than a second is below its resolution.
    first_a, first_b = shots[0]
    for t in (1.0, 2.0):
        if first_b - first_a <= t + MIN_SHOT_S:
            continue
        trimmed = [(first_a + t, first_b)] + shots[1:]
        if total_seconds(trimmed) < MIN_RESULT_S:
            continue
        out.append(Candidate(
            kind="trim_head",
            label=f"Trim {t:.0f}s off the open",
            timeline=trimmed,
            removed=[(first_a, first_a + t)],
            confidence=CONFIDENCE["trim_head"],
        ))

    return out


def enumerate_audio_candidates(shots: Timeline) -> list[Candidate]:
    """Audio-only edits: silence or duck one shot's soundtrack, keeping every frame.

    Two ops per shot, so 2n candidates. Their honesty story is different from the cut
    family's and the difference is the point: the arc these candidates would be estimated
    against was computed WITH the original soundtrack, so the estimator has nothing true
    to say about them — estimate() will hand back est_delta 0 because the timeline is
    unchanged, and CONFIDENCE labels them "unestimated". They exist because audio IS in
    the model's input (process_batch runs TRIBE on audio+video and the stimulus
    fingerprint hashes the soundtrack), which means the verify stage can measure them for
    real. Enumerate, render, measure — never pretend to predict.
    """
    out: list[Candidate] = []
    timeline = list(shots)
    for a, b in shots:
        out.append(Candidate(
            kind="mute_shot",
            label=f"Silence the {_fmt((a, b))} beat",
            timeline=timeline,
            removed=[],
            audio_ops=[{"op": "mute", "start": a, "end": b}],
            confidence=CONFIDENCE["mute_shot"],
        ))
        out.append(Candidate(
            kind="duck_shot",
            label=f"Duck the {_fmt((a, b))} beat to -12 dB",
            timeline=timeline,
            removed=[],
            audio_ops=[{"op": "duck", "start": a, "end": b}],
            confidence=CONFIDENCE["duck_shot"],
        ))
    return out


def audio_ops_to_output_time(timeline: Timeline, audio_ops: list) -> list:
    """SOURCE-time audio ops mapped into OUTPUT time by walking the timeline in play order.

    Same reasoning as _remap_brand: anything timed against the source has to travel with
    its segment through cuts and reorders, or the renderer would mute the wrong seconds
    of a hoisted edit. An op whose interval was entirely cut simply disappears.
    """
    out = []
    for op in audio_ops:
        s, e = float(op["start"]), float(op["end"])
        elapsed = 0.0
        for a, b in timeline:
            lo, hi = max(a, s), min(b, e)
            if hi > lo:
                out.append({
                    "op": op["op"],
                    "start": round(elapsed + (lo - a), 3),
                    "end": round(elapsed + (hi - a), 3),
                })
            elapsed += b - a
    return out


# ── estimation ──────────────────────────────────────────────────────────────────

def timeline_sample_indices(timeline: Timeline, n_samples: int, fps: float = 1.0) -> list[int]:
    """The arc sample indices a timeline keeps, IN OUTPUT ORDER.

    Output order is the entire reason this function exists rather than a set filter. The
    hook is scored off the first 3 seconds of whatever the viewer actually sees, so a
    hoisted shot has to arrive at the FRONT of the returned list or the estimate would
    score the edit as if the reorder had not happened — silently reporting that
    reordering never changes anything.

    CEIL, NOT ROUND, on both bounds. Sample i sits at timestamp i/fps and belongs to
    segment [a, b) iff a*fps <= i < b*fps, which is exactly range(ceil(a*fps),
    ceil(b*fps)). Rounding instead drops the last sample of any segment whose end falls
    in the upper half of a sample interval: on the committed report, removing the
    12.37-14.0s shot also lost the sample at t=12.0, because round(12.37) is 12. That
    made the estimator disagree with build_report.shot_contributions — which uses the
    `a <= i/fps < b` form — by a point on one shot, and it is the kind of off-by-one that
    never looks like a bug, just like a slightly different number.
    """
    idx: list[int] = []
    for a, b in timeline:
        lo = max(0, math.ceil(a * fps))
        hi = min(n_samples, math.ceil(b * fps))
        idx.extend(range(lo, hi))
    return idx


def _remap_brand(brand, timeline: Timeline):
    """Brand mentions, re-timed into output time and dropped if their segment was cut.

    Comprehension weighs WHEN the brand is named (an early mention is worth more), so a
    mention has to travel with its shot through a reorder. Leaving them on source time
    would score a hoisted product shot as though its brand mention were still 12 seconds
    in."""
    out = []
    elapsed = 0.0
    for a, b in timeline:
        for m in brand or []:
            t = m.get("t")
            if t is None or not (a <= t < b):
                continue
            moved = dict(m)
            moved["t"] = elapsed + (t - a)
            out.append(moved)
        elapsed += b - a
    return sorted(out, key=lambda m: m["t"])


def estimate(
    cand: Candidate,
    lanes: dict,
    levels,
    brand,
    score_fn: Callable,
    base_score: float,
    fps: float = 1.0,
) -> Candidate:
    """Score a candidate by re-slicing the existing arc. Free, and an ESTIMATE.

    `score_fn` is injected rather than imported so this module stays pure and testable
    without numpy or the report pipeline — pass tools.demo.build_report.score_ad.
    """
    n = lane_length(lanes)
    idx = timeline_sample_indices(cand.timeline, n, fps)

    if len(idx) < 4:
        cand.est_score, cand.est_delta = base_score, 0.0
        return cand

    cut_lanes = {k: [v[i] for i in idx if i < len(v)] for k, v in lanes.items() if v}
    result_s = total_seconds(cand.timeline)
    scored = score_fn(cut_lanes, levels, _remap_brand(brand, cand.timeline), result_s, fps)

    cand.est_score = float(scored["soma"])
    cand.est_delta = cand.est_score - base_score
    cand.result_s = result_s
    cand.measured = False       # belt and braces: only the verify stage may set this
    return cand


def rank(candidates: list[Candidate]) -> list[Candidate]:
    """Best first. Ties break toward the edit that keeps more film: given two cuts that
    score the same, the one that throws less away is the better deliverable and the
    easier one to defend to whoever paid for the footage."""
    return sorted(candidates, key=lambda c: (-c.est_delta, -c.result_s))


def _fmt(seg: Segment) -> str:
    a, b = seg
    return f"{a:.1f}-{b:.1f}s"
