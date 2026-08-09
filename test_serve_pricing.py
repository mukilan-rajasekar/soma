#!/usr/bin/env python3
"""Pricing engine tests.

The schema (0016) re-checks the price identity on insert, so the engine's job is to
never produce a row the database would refuse: weekly_price = spend + margin exactly,
in integers, and the platform split conserves every micro. The parity corpus is pinned
here too - if cases() drifts from the committed fixture, the TS mirror gate is checking
against a corpus that no longer describes this engine.

Run: .venv/bin/python -m pytest -q test_serve_pricing.py
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve import pricing  # noqa: E402
from tools.serve.pricing import (  # noqa: E402
    MARGIN_PCT_DEFAULT,
    cases,
    quote,
    recommend_cases,
    recommend_spend,
)

FIXTURE = ROOT / "tools" / "serve" / "fixtures" / "pricing_cases.json"
RECOMMEND_FIXTURE = ROOT / "tools" / "serve" / "fixtures" / "recommend_cases.json"


def test_price_identity_and_split_conservation():
    q = quote(
        {"platforms": ["meta", "tiktok"], "weekly_spend_micros": 1_000_000_001, "goal": "low_cost_testing"}
    )
    assert q["weekly_price_micros"] == q["weekly_spend_micros"] + q["margin_micros"]
    assert sum(p["weekly_spend_micros"] for p in q["platforms"]) == 1_000_000_001
    assert q["margin_pct"] == MARGIN_PCT_DEFAULT
    assert q["renews"] == "weekly_until_paused"
    assert "not an invoice" in q["billing_note"]


def test_margin_rounds_up_never_down():
    # 7 micros at 50%: 3.5 rounds to 4, or the schema's identity check would force the
    # price to undercharge and the row to lie about its own margin.
    q = quote(
        {"platforms": ["meta"], "weekly_spend_micros": 7, "goal": "aggressive_conversions", "margin_pct": 50}
    )
    assert q["margin_micros"] == 4
    assert q["weekly_price_micros"] == 11


def test_goal_playbooks_are_attached_verbatim():
    q = quote({"platforms": ["meta"], "weekly_spend_micros": 100, "goal": "low_cost_testing"})
    assert q["playbook"]["holdout_pct"] == 0.1
    assert q["playbook"]["arms"] == 3


def test_refusals():
    good = {"platforms": ["meta"], "weekly_spend_micros": 100, "goal": "low_cost_testing"}
    with pytest.raises(ValueError, match="at least one platform"):
        quote({**good, "platforms": []})
    with pytest.raises(ValueError, match="duplicate platform"):
        quote({**good, "platforms": ["meta", "meta"]})
    with pytest.raises(ValueError, match="unknown platform"):
        quote({**good, "platforms": ["google"]})
    with pytest.raises(ValueError, match="positive"):
        quote({**good, "weekly_spend_micros": 0})
    with pytest.raises(ValueError, match="unknown goal"):
        quote({**good, "goal": "vibes"})
    with pytest.raises(ValueError, match="margin_pct"):
        quote({**good, "margin_pct": 51})
    with pytest.raises(ValueError, match="duration_weeks"):
        quote({**good, "duration_weeks": 0})


def test_committed_parity_corpus_matches_the_engine():
    assert FIXTURE.exists(), "regenerate with: tools/serve/pricing.py --cases --out " + str(
        FIXTURE.relative_to(ROOT)
    )
    committed = json.loads(FIXTURE.read_text(encoding="utf8"))
    assert committed == cases(), (
        "fixtures/pricing_cases.json drifted from pricing.cases(); regenerate it and "
        "update src/lib/pricing.ts in the same commit"
    )


def test_funded_caps_are_media_only_and_conserve():
    q = quote(
        {"platforms": ["meta", "tiktok"], "weekly_spend_micros": 1_000_000_001, "goal": "low_cost_testing"}
    )
    from tools.serve.pricing import funded_caps

    caps = funded_caps(q)
    assert sum(c["lifetime_cap_micros"] for c in caps) == q["weekly_spend_micros"]
    # The margin never becomes spendable media: caps sum strictly below the price.
    assert sum(c["lifetime_cap_micros"] for c in caps) < q["weekly_price_micros"]
    for c in caps:
        # Pin the identity, not an inequality. `daily * 7 >= lifetime` bounds the daily cap
        # from BELOW only: it also holds for daily == lifetime, so it cannot detect the cap
        # being loosened 7x. guard.check_spend enforces min(daily, lifetime), which makes
        # daily the binding ceiling on the live activation path.
        assert c["daily_cap_micros"] == -(-c["lifetime_cap_micros"] // 7)
        assert c["source"] == "funded_week_media"


def test_funded_caps_refuse_an_empty_split():
    from tools.serve.pricing import funded_caps

    import pytest as _pytest

    with _pytest.raises(ValueError, match="no platform split"):
        funded_caps({"platforms": [], "weekly_spend_micros": 0})


def test_recommend_psychological_pair():
    # National + one platform + default 20% → $1,500 / $600 all-in.
    conversion = recommend_spend(
        {"platforms": ["meta"], "goal": "aggressive_conversions", "reach": "national"}
    )
    testing = recommend_spend({"platforms": ["meta"], "goal": "low_cost_testing", "reach": "national"})
    assert conversion["weekly_spend_micros"] == 1_250_000_000
    assert testing["weekly_spend_micros"] == 500_000_000
    assert quote({**conversion, "weekly_spend_micros": conversion["weekly_spend_micros"]})[
        "weekly_price_micros"
    ] == 1_500_000_000
    assert quote({**testing, "weekly_spend_micros": testing["weekly_spend_micros"]})[
        "weekly_price_micros"
    ] == 600_000_000


def test_recommend_rounds_half_up_to_the_dollar():
    # 1250 × 1.25 (two platforms) = 1562.50 → $1,563 media.
    rec = recommend_spend(
        {"platforms": ["meta", "tiktok"], "goal": "aggressive_conversions", "reach": "national"}
    )
    assert rec["weekly_spend_micros"] == 1_563_000_000


def test_recommend_refusals():
    good = {"platforms": ["meta"], "goal": "low_cost_testing", "reach": "national"}
    with pytest.raises(ValueError, match="at least one platform"):
        recommend_spend({**good, "platforms": []})
    with pytest.raises(ValueError, match="unknown platform"):
        recommend_spend({**good, "platforms": ["google"]})
    with pytest.raises(ValueError, match="unknown reach"):
        recommend_spend({**good, "reach": "global"})
    with pytest.raises(ValueError, match="unknown goal"):
        recommend_spend({**good, "goal": "vibes"})
    with pytest.raises(ValueError, match="duration_weeks"):
        recommend_spend({**good, "duration_weeks": 0})


def test_committed_recommend_corpus_matches_the_engine():
    assert RECOMMEND_FIXTURE.exists(), (
        "regenerate with: tools/serve/pricing.py --recommend-cases --out "
        + str(RECOMMEND_FIXTURE.relative_to(ROOT))
    )
    committed = json.loads(RECOMMEND_FIXTURE.read_text(encoding="utf8"))
    assert committed == recommend_cases(), (
        "fixtures/recommend_cases.json drifted from pricing.recommend_cases(); "
        "regenerate it and update src/lib/pricing.ts in the same commit"
    )


# --- §4.6 holdout rebate ------------------------------------------------------------


def test_holdout_rebate_waives_the_margin_on_the_holdout_fraction():
    # Term one is the whole rebate while g is zero, and at h=0.10 it is exactly a tenth
    # of the week's margin -- "we earn nothing on the media we chose to spend on our own
    # training asset." $1,000 media, $200 margin, 10% holdout -> $20.
    q = quote({"platforms": ["meta"], "weekly_spend_micros": 1_000_000_000, "goal": "low_cost_testing"})
    r = pricing.holdout_rebate(q, holdout_fraction=0.10)

    assert r["margin_waiver_micros"] == 20_000_000
    assert r["gap_term_micros"] == 0
    assert r["rebate_micros"] == 20_000_000
    assert r["capped"] is False
    # h scales it linearly: doubling the holdout doubles what Soma gives back.
    assert pricing.holdout_rebate(q, holdout_fraction=0.20)["rebate_micros"] == 40_000_000
    # No holdout, no rebate -- the term is not a discount, it is compensation.
    assert pricing.holdout_rebate(q, holdout_fraction=0.0)["rebate_micros"] == 0


def test_holdout_rebate_second_term_needs_a_dated_artifact():
    # §4.6 names the residual conflict: Soma has a financial reason to under-report g.
    # The control is that g must trace to a calibration artifact, not to a keystroke.
    q = quote({"platforms": ["meta"], "weekly_spend_micros": 1_000_000_000, "goal": "low_cost_testing"})

    with pytest.raises(ValueError, match="calibration_ref"):
        pricing.holdout_rebate(q, holdout_fraction=0.10, gap_g=0.05)

    r = pricing.holdout_rebate(
        q, holdout_fraction=0.10, gap_g=0.05, calibration_ref="calib/2026-W32.json"
    )
    # h * S * g = 0.10 * $1,000 * 0.05 = $5, on top of the $20 waiver.
    assert r["gap_term_micros"] == 5_000_000
    assert r["rebate_micros"] == 25_000_000

    # A random arm that beats the score-selected one is a result to publish, never a
    # charge: the term can only ever reduce Soma's fee.
    with pytest.raises(ValueError, match="not a fee"):
        pricing.holdout_rebate(q, holdout_fraction=0.10, gap_g=-0.01, calibration_ref="x")


def test_holdout_rebate_is_capped_at_the_whole_margin():
    # §4.6: "in the worst case Soma works the month for nothing; it can never make the
    # month cost the client more." A large demonstrated gap must not invert the fee.
    q = quote({"platforms": ["meta"], "weekly_spend_micros": 1_000_000_000, "goal": "low_cost_testing"})
    r = pricing.holdout_rebate(
        q, holdout_fraction=0.50, gap_g=2.0, calibration_ref="calib/huge.json"
    )

    assert r["rebate_micros"] == q["margin_micros"]
    assert r["capped"] is True
    assert r["margin_waiver_micros"] + r["gap_term_micros"] > q["margin_micros"]
    assert r["rebate_micros"] <= q["margin_micros"]


def test_holdout_rebate_rounds_toward_the_client():
    # Every other rounding decision in this module rounds up toward Soma (the margin
    # itself does). A rebate that inherited that would shave micros off what is owed.
    q = quote({"platforms": ["meta"], "weekly_spend_micros": 7, "goal": "low_cost_testing"})
    r = pricing.holdout_rebate(q, holdout_fraction=0.33)
    # margin on 7 micros is 2; 33% of 2 is 0.66, which must round UP to 1.
    assert q["margin_micros"] == 2
    assert r["margin_waiver_micros"] == 1
