# Pre-registration - TikTok ad CTR-index backtest

**Locked on: 2026-08-07.** This document must predate the Stage 1 TikTok backtest run.
Do not change the feature, label direction, covariates, permutation count or effect floor
after looking at results.

## Question

Across TikTok ad creatives, does the pre-registered neural summary rank ads in the same
direction as TikTok's `ctr_index`, after partialling out ffmpeg baselines?

## Primary feature / ROI

Primary arc mean: the mean of the per-ad neural arc used by `ad_backtest.py --score arc`.
Hook, peak and area summaries are exploratory and must be reported as such.

## Label

`ctr_index` as-is, higher is better. It is not inverted and `ad_backtest.py` must not be
run with `--outcome-is-rank` for this test.

This is a proxy label from TikTok's Top Ads corpus, not a raw click-through rate and not a
client CPA. A null is a valid outcome.

## Covariates

Partial out the ffmpeg baseline features used by `ad_backtest.py`:

- loudness
- cuts
- luminance
- motion
- duration

## Test

- Primary statistic: partial Spearman correlation of primary arc mean vs `ctr_index`,
  controlling for the ffmpeg baseline features above.
- Permutation null: label permutation, `n_perm = 20000`.
- Effect floor: `|partial r| >= 0.10` and permutation `p < 0.05`.

## Reporting rule

Report the exact n, missing arcs, missing baselines, partial r and permutation p. Never
claim signal from `scripts/stage1_tiktok_dryrun.py`; it only checks readiness and prints
the commands for the scorer box.
