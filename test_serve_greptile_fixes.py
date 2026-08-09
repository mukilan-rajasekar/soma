#!/usr/bin/env python3
"""Regression tests for the Greptile review findings on PRs #13/#14.

Each test names the finding it pins. The beta-gate finding was declined by design
(signed-in Studio sessions are deliberately door 3 - see src/lib/beta-gate.ts:92-101);
everything else below was a real hole and must stay closed.

Run: .venv/bin/python -m pytest -q test_serve_greptile_fixes.py
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.serve import launch  # noqa: E402
from tools.serve.ab import evaluate  # noqa: E402
from tools.serve.brand_calibration import fit, rank  # noqa: E402
from tools.serve.meta_client import DryRunRecorder, MetaClient  # noqa: E402
from tools.serve.pricing import quote  # noqa: E402
from tools.serve.tiktok_client import TikTokClient  # noqa: E402


def test_tiktok_spec_cannot_smuggle_enable_through_extra():
    recorder = DryRunRecorder()
    client = TikTokClient(access_token="t", advertiser_id="a", dry_run=True, recorder=recorder)
    client.create_campaign(name="C", operation_status="ENABLE")
    client.create_adgroup(name="G", campaign_id="c1", daily_budget=10.0, operation_status="ENABLE")
    client.create_ad(
        name="A", adgroup_id="g1", video_id="v1", ad_text="t",
        landing_page_url="https://x.example", operation_status="ENABLE",
    )
    assert all(c["payload"]["operation_status"] == "DISABLE" for c in recorder.calls)


def test_meta_spec_cannot_smuggle_active_through_extra():
    recorder = DryRunRecorder()
    client = MetaClient(access_token="t", ad_account_id="act_1", dry_run=True, recorder=recorder)
    client.create_campaign(name="C", objective="OUTCOME_TRAFFIC", status="ACTIVE")
    client.create_adset(
        name="S", campaign_id="c1", daily_budget=100, billing_event="IMPRESSIONS",
        optimization_goal="LINK_CLICKS", targeting={}, status="ACTIVE",
    )
    client.create_ad(name="A", adset_id="s1", creative_id="cr1", status="ACTIVE")
    assert all(c["payload"]["status"] == "PAUSED" for c in recorder.calls)


def _cal_fixture(brand="brand_1"):
    served, outcomes = [], []
    for i in range(10):
        score = (i + 1) / 10
        served.append({"id": f"ad_{i}", "brand_id": brand, "prediction": {"score": score}})
        outcomes.append({
            "served_ad_id": f"ad_{i}", "brand_id": brand, "impressions": 10_000,
            "clicks": int((0.005 + 0.01 * score) * 10_000), "pulled_at": "2026-08-01",
        })
    return {"brand_id": brand, "served_ads": served, "outcomes": outcomes}


def test_rank_refuses_another_brands_ads():
    artifact = fit(_cal_fixture())
    with pytest.raises(ValueError, match="cross-brand rerank"):
        rank(artifact, [{"id": "x", "brand_id": "brand_2", "prediction": {"score": 0.5}}])
    # No stated brand on the ad is tolerated (fixtures predate the field).
    assert rank(artifact, [{"id": "y", "prediction": {"score": 0.5}}])


def test_multiarm_winner_needs_the_adjusted_threshold():
    # Best-vs-control p is ~0.028: under raw alpha 0.05 this crowned a winner; with
    # three comparisons Bonferroni demands < 0.0167 and the honest answer is no_winner.
    result = evaluate({
        "arms": [
            {"arm_key": "control", "is_control": True, "impressions": 100_000, "clicks": 1_000},
            {"arm_key": "v1", "impressions": 100_000, "clicks": 1_100},
            {"arm_key": "v2", "impressions": 100_000, "clicks": 1_050},
            {"arm_key": "v3", "impressions": 100_000, "clicks": 1_020},
        ]
    })
    assert result["comparisons"] == 3
    assert 0.0167 > result["adjusted_alpha"] > 0.016
    best = next(a for a in result["arms"] if a["arm_key"] == "v1")
    assert 0.0167 < best["vs_control"]["p_value"] < 0.05
    assert result["decision"] == "no_winner"
    assert result["winner"] is None

    # Two arms is one comparison: the adjusted threshold IS raw alpha, winners survive.
    two = evaluate({
        "arms": [
            {"arm_key": "control", "is_control": True, "impressions": 100_000, "clicks": 1_000},
            {"arm_key": "v1", "impressions": 100_000, "clicks": 1_500},
        ]
    })
    assert two["decision"] == "winner"


def test_activation_is_clamped_by_the_funded_week(tmp_path):
    q = quote({"platforms": ["meta"], "weekly_spend_micros": 700, "goal": "low_cost_testing"})
    quote_path = tmp_path / "quote.json"
    quote_path.write_text(json.dumps(q), encoding="utf8")

    # Fixture says the cap is lax (10_000) and spend is 800; the funded week's media is
    # 700, so activation must refuse even though the fixture alone would allow it.
    fixture = tmp_path / "guard.json"
    fixture.write_text(json.dumps([{
        "external_ad_id": "ad_1", "observed_spend_micros": 800,
        "lifetime_cap_micros": 10_000, "currency": "USD",
    }]), encoding="utf8")

    with pytest.raises(RuntimeError, match="Funded-week cap"):
        launch.activate("ad_1", fixture=fixture, dry_run=True, platform="meta", funded_quote=quote_path)

    # Under the funded cap it goes through (dry run).
    under = tmp_path / "guard_ok.json"
    under.write_text(json.dumps([{
        "external_ad_id": "ad_1", "observed_spend_micros": 50,
        "lifetime_cap_micros": 10_000, "currency": "USD",
    }]), encoding="utf8")
    result = launch.activate("ad_1", fixture=under, dry_run=True, platform="meta", funded_quote=quote_path)
    assert result["funded_guard"]["ok"] is True
    # Name the ceiling that actually fired. funded_caps derives lifetime=700, daily=100,
    # and check_spend enforces the min — so the constraint here is 100, not the 700 this
    # test's prose describes. Asserting it keeps the daily-cap derivation pinned end to end.
    assert result["funded_guard"]["cap_micros"] == 100

    # A quote with no allocation for the platform refuses outright.
    with pytest.raises(RuntimeError, match="no 'tiktok' allocation"):
        launch.activate("ad_1", fixture=under, dry_run=True, platform="tiktok", funded_quote=quote_path)


# ---- round 2 (review of PRs #15/#16) -------------------------------------------

from tools.edit import run_rescore as rr  # noqa: E402


def test_rescore_requested_cuts_must_exist_not_just_any_mp4(tmp_path):
    (tmp_path / "job1" / "rendered").mkdir(parents=True)
    (tmp_path / "job1" / "rendered" / "stale.mp4").write_bytes(b"x")
    runner = rr.workdir_verify_runner(tmp_path)
    out = runner({"job_id": "job1", "cut_ids": ["requested-cut"]})
    assert out["ok"] is False and out["measured"] is False
    assert "requested cuts missing" in out["error"]
    assert "requested-cut.mp4" in out["error"]


def test_rescore_every_requested_cut_must_measure(tmp_path, monkeypatch):
    rendered = tmp_path / "job2" / "rendered"
    rendered.mkdir(parents=True)
    for cid in ("c1", "c2"):
        (rendered / f"{cid}.mp4").write_bytes(b"x")

    def half_verify(files, out_dir, ad, cands, *, manifest_meta=None):
        cands[0][0].measured = True  # c1 only

    import tools.edit.search as search_mod

    monkeypatch.setattr(search_mod, "verify_batch", half_verify)
    out = rr.workdir_verify_runner(tmp_path)({"job_id": "job2", "cut_ids": ["c1", "c2"]})
    assert out["ok"] is False
    assert "not measured" in out["error"] and "c2" in out["error"]


def test_rescore_verify_crash_marks_the_job_failed(tmp_path, monkeypatch):
    failed = {}
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    monkeypatch.setattr(rr, "reap", lambda *a, **k: 0)
    monkeypatch.setattr(rr, "claim_oldest_queued", lambda *a, **k: {"id": "j9", "cut_ids": []})
    monkeypatch.setattr(rr, "mark_done", lambda *a, **k: (_ for _ in ()).throw(AssertionError("done!")))
    monkeypatch.setattr(rr, "mark_failed", lambda b, k, jid, err, **kw: failed.update(job=jid, error=err))

    def boom(workdir):
        def _r(plan):
            raise RuntimeError("subprocess exploded")

        return _r

    monkeypatch.setattr(rr, "workdir_verify_runner", boom)
    rc = rr.main(["--execute", "--workdir", str(tmp_path)])
    assert rc == 1
    assert failed["job"] == "j9"
    assert "verify raised" in failed["error"] and "exploded" in failed["error"]


def test_activation_without_funded_quote_needs_the_explicit_flag(tmp_path):
    fixture = tmp_path / "g.json"
    fixture.write_text(json.dumps([{
        "external_ad_id": "ad_1", "observed_spend_micros": 50,
        "lifetime_cap_micros": 1_000, "currency": "USD",
    }]), encoding="utf8")
    with pytest.raises(RuntimeError, match="0.6 prepaid week"):
        launch.activate("ad_1", fixture=fixture, dry_run=True, platform="meta")
    ok = launch.activate("ad_1", fixture=fixture, dry_run=True, platform="meta", allow_unfunded=True)
    assert ok["guard"]["ok"] is True


def test_activation_refuses_cross_currency_cap_comparison(tmp_path):
    q = quote({"platforms": ["meta"], "weekly_spend_micros": 700, "goal": "low_cost_testing"})
    quote_path = tmp_path / "q.json"
    quote_path.write_text(json.dumps(q), encoding="utf8")
    fixture = tmp_path / "g.json"
    fixture.write_text(json.dumps([{
        "external_ad_id": "ad_1", "observed_spend_micros": 50,
        "lifetime_cap_micros": 1_000, "currency": "KWD",
    }]), encoding="utf8")
    with pytest.raises(RuntimeError, match="currency mismatch"):
        launch.activate("ad_1", fixture=fixture, dry_run=True, platform="meta", funded_quote=quote_path)
