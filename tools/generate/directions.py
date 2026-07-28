#!/usr/bin/env python3
"""
directions.py — a brief becomes N deliberately different openings.

WHY A TAXONOMY AND NOT ONE PROMPT WITH A HIGH TEMPERATURE. Sampling one prompt many times
gives you variations on whatever the model already thinks an ad looks like: the candidates
end up correlated, and a filter over correlated candidates is a filter over nothing. The
spread has to be structural. Each direction below opens on a genuinely different beat, so
the batch actually spans the decision the read-out is being asked to make.

The taxonomy is openings specifically, because the hook is 40% of the score and is the
one part of an ad where the choice is discrete and nameable. Everything after the first
three seconds is a continuum; the opening is a fork.

EACH DIRECTION CARRIES ITS NEURAL RATIONALE, and this is the part worth being careful
about. `why` states which lane the direction is a bet on and what the bet is — "an
unexpected object in frame drives ventral salience" is a hypothesis about the score, not
a claim that it will win. The whole point of generating N and scoring them is that the
rationale is allowed to be WRONG and the measurement decides. A direction whose rationale
reads like a guarantee has misunderstood what the filter is for.

No LLM is required. Deterministic assembly from the brief keeps a generation run
reproducible, keeps a second vendor out of the loop, and means the directions are
auditable — a customer can read exactly what was asked for on their behalf.
"""

from dataclasses import dataclass

from .provider import ClipSpec


@dataclass(frozen=True)
class Direction:
    key: str
    label: str
    #: The instruction, in the generator's voice.
    move: str
    #: Which lane this is a bet on, and why. A hypothesis, not a promise.
    why: str


# Ordered by how discrete the opening choice is, not by expected score — the ranking is
# the measurement's job, and ordering these by a guess would quietly bias which ones a
# reader takes seriously.
DIRECTIONS: list[Direction] = [
    Direction(
        "product_first", "Product first",
        "Open on the product in hand, mid-frame, before a word is spoken.",
        "A bet on ventral salience: an unexpected object landing in frame is the thing "
        "the salience network fires on, and that firing is what a hook is.",
    ),
    Direction(
        "problem_first", "Problem first",
        "Open inside the problem, shot from the customer's point of view.",
        "A bet on comprehension carrying the open: naming the pain early gives the "
        "language cortex something to lock onto before any product appears.",
    ),
    Direction(
        "proof_first", "Proof first",
        "Open on the result, then reveal what produced it.",
        "A bet on dorsal attention: a face or an outcome mid-reaction holds gaze, and "
        "the reveal gives the held attention somewhere to go.",
    ),
    Direction(
        "motion_first", "Motion first",
        "Open mid-action, already moving, no establishing shot.",
        "A bet that skipping the establishing beat avoids the early dip: attention has "
        "to be earned back after a scene-setting shot.",
    ),
    Direction(
        "offer_first", "Offer first",
        "Lead with the offer, then justify it with the product.",
        "A weak bet on comprehension rather than salience, deliberately included: a price "
        "is a familiar shape, so it registers in language cortex without producing much "
        "ventral surprise. Worth measuring rather than assuming.",
    ),
    Direction(
        "question_first", "Question first",
        "Open on a direct question to camera, then answer it.",
        "A bet on prediction error: a question opens a loop the brain wants closed, "
        "which is the same mechanism a hook exploits.",
    ),
]


def build_prompt(direction: Direction, brief: dict) -> str:
    """The direction, made specific to this advertiser. Assembled rather than generated so
    a run is reproducible and a customer can audit what was asked for on their behalf."""
    brand = brief.get("brand_name", "").strip()
    product = brief.get("product_name", "").strip()
    problem = brief.get("primary_problem", "").strip()
    benefit = brief.get("primary_benefit", "").strip()
    offer = brief.get("offer", "").strip()
    cta = brief.get("desired_cta", "").strip()

    parts = [
        f"A short vertical video ad for {brand} {product}.".replace("  ", " "),
        direction.move,
    ]
    if problem:
        parts.append(f"The viewer's problem: {problem}.")
    if benefit:
        parts.append(f"What it promises: {benefit}.")
    if offer:
        parts.append(f"Close on the offer: {offer}.")
    if cta:
        parts.append(f"End on the call to action: {cta}.")
    parts.append("Shot like real footage, not a slideshow. No on-screen logo lockup.")
    return " ".join(p for p in parts if p.strip())


def plan(brief: dict, *, n: int | None = None, duration_s: float = 15.0,
         aspect: str = "9:16") -> list[tuple[Direction, ClipSpec]]:
    """The full generation plan: every direction paired with the clip it asks for.

    `n` truncates the taxonomy rather than sampling it, so a smaller run is a PREFIX of a
    larger one. Two consequences worth having: a 3-clip run and a 6-clip run share their
    first three candidates and can be compared directly, and nobody has to wonder whether
    a missing direction was dropped or merely unlucky.
    """
    chosen = DIRECTIONS[: n or len(DIRECTIONS)]
    out = []
    for i, d in enumerate(chosen):
        out.append((
            d,
            ClipSpec(
                # ad_01… so the ids line up with what process_batch.py expects from a
                # manifest, and a generated batch scores through the same path as an
                # uploaded one with no special-casing.
                id=f"ad_{i + 1:02d}",
                label=d.label,
                prompt=build_prompt(d, brief),
                duration_s=duration_s,
                aspect=aspect,
            ),
        ))
    return out
