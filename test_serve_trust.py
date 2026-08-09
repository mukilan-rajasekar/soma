#!/usr/bin/env python3
"""Trust-surface tests: validation ledger, fatigue, spend statement, MER, lift, report.

One invariant per module, pinned: no verdict below the floors, no comparison across
currencies, no MER from a feed the client doesn't own, no lift claim whose CI spans
zero, no report section without an artifact behind it — and refusals always rendered.

Run: .venv/bin/python -m pytest -q test_serve_trust.py
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve import client_report, fatigue, lift_analyzer, revenue_feed, spend_statement  # noqa: E402
from tools.serve import pricing, validation_report  # noqa: E402


# --- validation_report --------------------------------------------------------------


def _served(n, brand="b1"):
    return [
        {"id": f"s{i}", "brand_id": brand, "prediction": {"score": i / 10}} for i in range(n)
    ]


def _outcomes(n, monotone=True):
    return [
        {
            "served_ad_id": f"s{i}",
            "impressions": 1000,
            "clicks": (10 + i) if monotone else 10,
            "observed_at": "2026-08-01",
        }
        for i in range(n)
    ]


def test_validation_below_floor_is_insufficient_never_a_rho():
    report = validation_report.build({"served_ads": _served(5), "outcomes": _outcomes(5)})
    assert report["brands"]["b1"]["verdict"] == "insufficient_n"
    assert "spearman" not in report["brands"]["b1"]


def test_validation_tracks_a_monotone_fixture_and_labels_the_pool():
    report = validation_report.build({"served_ads": _served(12), "outcomes": _outcomes(12)})
    block = report["brands"]["b1"]
    assert block["verdict"] == "tracking"
    assert block["spearman"] == 1.0
    assert block["permutation_p"] < 0.05
    assert "never training" in report["pooled"]["scope"]


# --- fatigue ------------------------------------------------------------------------


def _series(sid, ctrs):
    return [
        {"served_ad_id": sid, "date": f"2026-08-{i + 1:02d}", "impressions": 1000, "clicks": int(1000 * c)}
        for i, c in enumerate(ctrs)
    ]


def test_fatigue_flags_decay_and_only_recommends():
    out = fatigue.flags(_series("ad1", [0.05, 0.05, 0.05, 0.05, 0.05, 0.02, 0.02, 0.02]))
    assert out["fatigued"][0]["served_ad_id"] == "ad1"
    assert "recommendation only" in out["fatigued"][0]["note"]


def test_fatigue_below_floors_stays_silent():
    out = fatigue.flags(_series("ad2", [0.05, 0.01]))
    assert out["fatigued"] == [] and out["insufficient_history"]


# --- spend_statement ----------------------------------------------------------------


def _quote():
    return pricing.quote(
        {"platforms": ["meta", "tiktok"], "weekly_spend_micros": 1_000_000_000, "goal": "low_cost_testing"}
    )


def test_statement_grades_evidence_and_refuses_currency_mismatch():
    stmt = spend_statement.statement(
        _quote(),
        [{"platform": "meta", "spend_micros": 400_000_000, "currency": "USD", "source": "operator_fixture"}],
        period="2026-W32",
    )
    meta_line = next(line for line in stmt["lines"] if line["platform"] == "meta")
    assert meta_line["evidence"] == "operator-attested"
    assert "verified" not in str(stmt).lower()

    with pytest.raises(ValueError, match="currency mismatch"):
        spend_statement.statement(
            _quote(),
            [{"platform": "meta", "spend_micros": 1, "currency": "KWD", "source": "platform_api"}],
            period="2026-W32",
        )


def test_statement_refuses_unallocated_platform():
    with pytest.raises(ValueError, match="does not allocate"):
        spend_statement.statement(
            _quote(),
            [{"platform": "google", "spend_micros": 1, "currency": "USD", "source": "platform_api"}],
            period="2026-W32",
        )


def test_statement_discloses_fees_separately_from_spend():
    # Meta Developer Policy 10.6 (effective 2027-02-03) wants spend stated apart from
    # fees AND the fee structure. A margin figure alone does not say what it is a
    # percentage OF, which is the half that makes a bundled price auditable.
    stmt = spend_statement.statement(
        _quote(),
        [
            {"platform": "meta", "spend_micros": 400_000_000, "currency": "USD", "source": "platform_api"},
            {"platform": "tiktok", "spend_micros": 100_000_000, "currency": "USD", "source": "platform_api"},
        ],
        period="2026-W32",
    )
    disclosure = stmt["fee_disclosure"]

    assert disclosure["fee_basis"] == "percentage_of_funded_media"
    assert disclosure["fee_pct"] == 20.0
    assert disclosure["media_funded_micros"] == 1_000_000_000
    assert disclosure["fee_micros"] == 200_000_000
    assert disclosure["client_paid_micros"] == 1_200_000_000
    # Media and fee are stated separately and sum to what the client paid: that identity
    # IS the disclosure, and 0016 enforces the same one on insert.
    assert (
        disclosure["media_funded_micros"] + disclosure["fee_micros"]
        == disclosure["client_paid_micros"]
    )
    # Delivered is reported next to funded, so undelivered media is visible rather than
    # inferable. 400 + 100 of the funded 1,000.
    assert disclosure["media_delivered_micros"] == 500_000_000
    assert stmt["delivered_spend_micros"] == 500_000_000
    assert disclosure["fee_is_spendable_as_media"] is False
    assert disclosure["effective"] == "2027-02-03"


def test_fee_disclosure_refuses_a_quote_whose_identity_is_broken():
    # A tampered or hand-built quote must not be laundered into a compliance artifact.
    # This is the one document a client or regulator would rely on.
    bad = _quote()
    bad["margin_micros"] = bad["margin_micros"] + 1
    with pytest.raises(ValueError, match="quote identity broken"):
        spend_statement.fee_disclosure(bad, delivered_micros=0)

    # A fee with no media under it has no basis to disclose, so refuse rather than
    # print a percentage of nothing.
    with pytest.raises(ValueError, match="no basis to disclose"):
        spend_statement.fee_disclosure(
            {"weekly_spend_micros": 0, "margin_micros": 5, "weekly_price_micros": 5, "margin_pct": 20.0},
            delivered_micros=0,
        )


# --- revenue_feed -------------------------------------------------------------------


def test_mer_requires_client_ownership():
    with pytest.raises(ValueError, match="client_owned"):
        revenue_feed.mer(
            {"currency": "USD", "weeks": [{"week": "2026-W32", "revenue_micros": 1}]},
            weekly_price_micros=1_000_000,
            currency="USD",
        )


def test_mer_math_and_survey_shares():
    out = revenue_feed.mer(
        {"client_owned": True, "currency": "USD", "weeks": [{"week": "2026-W32", "revenue_micros": 4_500_000_000}]},
        weekly_price_micros=1_500_000_000,
        currency="USD",
    )
    assert out["weeks"][0]["mer"] == 3.0

    sv = revenue_feed.survey_witness([{"channel": "tiktok", "count": 3}, {"channel": "meta", "count": 1}])
    assert sv["channels"][0] == {"channel": "tiktok", "responses": 3, "share": 0.75}


# --- lift_analyzer ------------------------------------------------------------------


def test_lift_floors_null_reporting_and_registration_flag():
    below = lift_analyzer.analyze({}, {"test": {"conversions": 10, "exposed": 1000}, "control": {"conversions": 10, "exposed": 1000}})
    assert below["verdict"] == "insufficient_n"

    null = lift_analyzer.analyze(
        {"pre_registered": True, "randomization_unit": "geo", "assignment": "randomized", "power_note": "x"},
        {"test": {"conversions": 100, "exposed": 10000}, "control": {"conversions": 98, "exposed": 10000}},
    )
    assert null["verdict"] == "no_detectable_lift"
    assert null["ci95"][0] < 0 < null["ci95"][1]

    lift = lift_analyzer.analyze(
        {},
        {"test": {"conversions": 200, "exposed": 10000}, "control": {"conversions": 100, "exposed": 10000}},
    )
    assert lift["verdict"] == "lift" and lift["unregistered"] is True
    assert "exploratory" in lift["note"]


# --- client_report ------------------------------------------------------------------


def test_report_requires_cycle_and_renders_refusals(tmp_path):
    with pytest.raises(ValueError, match="cycle report"):
        client_report.compose({"period": "2026-W32"}, base=tmp_path)

    cycle = {
        "actions_executed": [],
        "actions_planned": [],
        "activation_referrals": [],
        "refusals": [{"stage": "renewals", "refused": "gate 4 is open"}],
    }
    validation = validation_report.build({"served_ads": _served(12), "outcomes": _outcomes(12)})
    report = client_report.compose(
        {"period": "2026-W32", "brand_id": "b1", "cycle_report": cycle, "validation": validation},
        base=tmp_path,
    )
    md = report["markdown"]
    assert "What we declined to do" in md and "gate 4 is open" in md
    assert "Predicted vs. actual" in md and "Spearman 1.0" in md
    # sections without artifacts are omitted, not faked
    assert "Blended MER" not in md and "Incrementality" not in md
    assert report["kind"] == "client_report" and report["period_label"] == "2026-W32"


def test_fee_disclosure_refuses_an_incomplete_quote():
    # Regression: absent fields defaulted to 0, so {} satisfied `0 + 0 == 0` and rendered
    # a complete-looking disclosure of nothing with a null rate. The empty dict is the
    # input most likely to arrive by accident (an unreadable or truncated quote file).
    with pytest.raises(ValueError, match="missing"):
        spend_statement.fee_disclosure({}, delivered_micros=0)

    full = pricing.quote(
        {"platforms": ["meta"], "weekly_spend_micros": 1_000_000_000, "goal": "low_cost_testing"}
    )
    for field in ("weekly_spend_micros", "margin_micros", "weekly_price_micros", "margin_pct"):
        partial = {k: v for k, v in full.items() if k != field}
        with pytest.raises(ValueError, match="missing"):
            spend_statement.fee_disclosure(partial, delivered_micros=0)

    # A zero-margin quote is legitimate and must still disclose: margin_pct 0.0 is a
    # value, not an absence, so presence is checked rather than truthiness.
    free = pricing.quote(
        {"platforms": ["meta"], "weekly_spend_micros": 1_000_000_000,
         "goal": "low_cost_testing", "margin_pct": 0}
    )
    assert spend_statement.fee_disclosure(free, delivered_micros=0)["fee_micros"] == 0


def test_fee_disclosure_refuses_a_rate_that_was_not_charged():
    # A stale margin_pct beside correct amounts still satisfies media + margin == price:
    # the quote is internally consistent and the disclosure would publish a rate nobody
    # was charged. That is the single error Meta policy 10.6 exists to prevent.
    q = pricing.quote(
        {"platforms": ["meta"], "weekly_spend_micros": 1_000_000_000, "goal": "low_cost_testing"}
    )
    q["margin_pct"] = 35.0  # money untouched, rate stale

    with pytest.raises(ValueError, match="was not charged"):
        spend_statement.fee_disclosure(q, delivered_micros=0)

    # The reconciliation goes through pricing's own function, so a margin the engine
    # actually produces is always accepted -- including the 287 two-decimal rates whose
    # basis point the shared truncation drops (AGENTS.md). 2.01% bills 200bp, and the
    # disclosure must state the 200bp that was charged rather than reject the quote.
    odd = pricing.quote(
        {"platforms": ["meta"], "weekly_spend_micros": 1_000_000_000,
         "goal": "low_cost_testing", "margin_pct": 2.01}
    )
    assert odd["margin_micros"] == 20_000_000  # 200bp, not 201
    assert spend_statement.fee_disclosure(odd, delivered_micros=0)["fee_pct"] == 2.01
