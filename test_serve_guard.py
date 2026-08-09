#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve.guard import SpendCaps, check_ok, check_spend, decision_from_fixture  # noqa: E402


def test_check_spend_allows_below_cap():
    decision = check_spend(900, SpendCaps(daily_cap_micros=1000), mode="would_pause")

    assert decision.ok is True
    assert decision.action == "ok"
    assert decision.cap_micros == 1000


def test_check_spend_would_pause_at_cap():
    decision = check_spend(1000, SpendCaps(daily_cap_micros=1000), mode="would_pause")

    assert decision.ok is False
    assert decision.action == "would_pause"
    assert decision.observed_spend_micros == 1000


def test_pause_mode_reports_pause_without_budget_edit():
    decision = check_spend(
        1500,
        SpendCaps(daily_cap_micros=1000, lifetime_cap_micros=5000),
        mode="pause",
    )

    assert decision.ok is False
    assert decision.action == "pause"
    assert decision.cap_micros == 1000


def test_fixture_caps_drive_decision(tmp_path):
    fixture = tmp_path / "spend.json"
    fixture.write_text(
        json.dumps({
            "ads": [
                {
                    "external_ad_id": "ad_1",
                    "observed_spend_micros": 1200,
                    "daily_cap_micros": 1000,
                    "currency": "USD",
                }
            ]
        }),
        encoding="utf8",
    )

    decision = decision_from_fixture(fixture, external_ad_id="ad_1")

    assert decision.action == "would_pause"


def test_check_ok_raises_when_over_cap():
    with pytest.raises(RuntimeError, match="Spend guard blocked activation"):
        check_ok(1200, SpendCaps(daily_cap_micros=1000))


def test_no_cap_is_not_permission_to_spend():
    decision = check_spend(0, SpendCaps())
    assert decision.ok is False
    assert decision.reason == "no cap configured"
    with pytest.raises(RuntimeError, match="no daily or lifetime cap"):
        check_ok(0, SpendCaps())


def test_activate_requires_guard_fixture():
    from tools.serve import launch

    with pytest.raises(RuntimeError, match="requires --guard-fixture"):
        launch.activate("ad_1", fixture=None, dry_run=True)


def test_activate_requires_a_funded_quote_or_an_explicit_exception(tmp_path):
    # §0.6's funded-by-default rule is the OUTERMOST door on activation, and until this
    # test only its bypass was exercised (greptile_fixes passes allow_unfunded=True to get
    # past it). Nothing asserted that omitting both actually refuses.
    from tools.serve import launch

    fixture = tmp_path / "spend.json"
    fixture.write_text(
        json.dumps([{
            "external_ad_id": "ad_1",
            "observed_spend_micros": 10,
            "daily_cap_micros": 1000,
            "currency": "USD",
        }]),
        encoding="utf8",
    )

    with pytest.raises(RuntimeError, match="requires --funded-quote"):
        launch.activate("ad_1", fixture=fixture, dry_run=True)

    # The exception is named and deliberate, not a default: with it, activation proceeds.
    assert launch.activate(
        "ad_1", fixture=fixture, dry_run=True, allow_unfunded=True
    )["guard"]["ok"] is True


def test_activate_refuses_when_the_fixture_cap_is_breached(tmp_path):
    # The tests above pin check_spend's arithmetic and the missing-fixture door. Neither
    # reaches launch.activate's `if not decision.ok` block, so until this test the primary
    # spend-cap refusal could be deleted outright with the suite still green.
    # allow_unfunded isolates the spend-cap door from the funded-quote door above it.
    from tools.serve import launch

    over = tmp_path / "over.json"
    over.write_text(
        json.dumps([{
            "external_ad_id": "ad_1",
            "observed_spend_micros": 1200,
            "daily_cap_micros": 1000,
            "currency": "USD",
        }]),
        encoding="utf8",
    )

    with pytest.raises(RuntimeError, match="Spend guard blocked activation") as excinfo:
        launch.activate("ad_1", fixture=over, dry_run=True, allow_unfunded=True)
    # Both numbers must reach the operator: "blocked" without the figures is unactionable.
    assert "1200" in str(excinfo.value)
    assert "1000" in str(excinfo.value)

    # A fixture row carrying neither cap field is refused too — a row with no ceiling is
    # not a row that permits spend.
    uncapped = tmp_path / "uncapped.json"
    uncapped.write_text(
        json.dumps([{"external_ad_id": "ad_1", "observed_spend_micros": 5}]),
        encoding="utf8",
    )
    with pytest.raises(RuntimeError, match="no cap configured"):
        launch.activate("ad_1", fixture=uncapped, dry_run=True, allow_unfunded=True)


def test_guard_fixture_selects_the_requested_ad(tmp_path):
    # decision_from_fixture filters then takes rows[0]. If that filter were ever softened,
    # activation would silently check a DIFFERENT ad's spend against this ad's ceiling —
    # the quietest spend hole available, because every assertion still passes.
    fixture = tmp_path / "spend.json"
    fixture.write_text(
        json.dumps({
            "ads": [
                {
                    "external_ad_id": "ad_1",
                    "observed_spend_micros": 9000,
                    "daily_cap_micros": 1000,
                    "currency": "USD",
                },
                {
                    "external_ad_id": "ad_2",
                    "observed_spend_micros": 10,
                    "daily_cap_micros": 1000,
                    "currency": "USD",
                },
            ]
        }),
        encoding="utf8",
    )

    decision = decision_from_fixture(fixture, external_ad_id="ad_2")
    assert decision.ok is True
    assert decision.observed_spend_micros == 10

    # ad_1 is over cap in the same fixture: asking for it must not inherit ad_2's verdict.
    assert decision_from_fixture(fixture, external_ad_id="ad_1").ok is False

    with pytest.raises(ValueError, match="no matching ad spend row"):
        decision_from_fixture(fixture, external_ad_id="ad_3")


def test_activate_on_tiktok_reaches_the_tiktok_client(tmp_path, capsys):
    # launch._client's tiktok branch had never executed: the only test passing
    # platform="tiktok" raises on the funded-quote allocation check before reaching it.
    from tools.serve import launch

    fixture = tmp_path / "spend.json"
    fixture.write_text(
        json.dumps([{
            "external_ad_id": "ad_9",
            "observed_spend_micros": 10,
            "daily_cap_micros": 1000,
            "currency": "USD",
        }]),
        encoding="utf8",
    )

    result = launch.activate("ad_9", fixture=fixture, dry_run=True, platform="tiktok", allow_unfunded=True)

    assert result["guard"]["ok"] is True
    calls = [
        json.loads(line)
        for line in capsys.readouterr().out.splitlines()
        if line.startswith("{") and line.rstrip().endswith("}")
    ]
    assert len(calls) == 1
    assert "business-api.tiktok.com" in calls[0]["url"]
    assert "/ad/status/update/" in calls[0]["url"]
    # ACTIVE must arrive on the wire as TikTok's ENABLE, and only for the requested ad.
    assert calls[0]["payload"]["operation_status"] == "ENABLE"
    assert calls[0]["payload"]["ad_ids"] == ["ad_9"]


def test_activate_on_google_reaches_the_google_client(tmp_path, capsys):
    # Same hole as the tiktok branch above, on the third platform: the only test passing
    # platform="google" raises on the funded-quote allocation check, so launch._client's
    # google branch has never executed either. Google's vocabulary is ENABLED, not ENABLE.
    from tools.serve import launch

    ad_id = "customers/1/adGroupAds/2~3"
    fixture = tmp_path / "spend.json"
    fixture.write_text(
        json.dumps([{
            "external_ad_id": ad_id,
            "observed_spend_micros": 10,
            "daily_cap_micros": 1000,
            "currency": "USD",
        }]),
        encoding="utf8",
    )

    result = launch.activate(
        ad_id, fixture=fixture, dry_run=True, platform="google", allow_unfunded=True
    )

    assert result["guard"]["ok"] is True
    calls = [
        json.loads(line)
        for line in capsys.readouterr().out.splitlines()
        if line.startswith("{") and line.rstrip().endswith("}")
    ]
    assert len(calls) == 1
    assert "googleads.googleapis.com" in calls[0]["url"]
    operation = calls[0]["payload"]["operations"][0]["update"]
    assert operation["status"] == "ENABLED"
    assert operation["resourceName"] == ad_id
