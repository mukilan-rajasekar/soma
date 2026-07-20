# PREREGISTRATION — Addendum & sign-off (2026-07-20)

**Purpose.** Lock the three open analysis decisions so the n=15 TVSum result can be quoted
*honestly* — i.e. so the trained-head signal is reported as one exploratory finding inside a
declared family of tests, not cherry-picked as a "best-of-5" win. This addendum sits on top of
`PREREGISTRATION.md` (attention) and `PREREGISTRATION-head.md` (the read-out head). Where they
conflict, this document governs, and it was written **after** seeing the first run — so every
decision below is stated as a *framing/reporting* rule, not a new significance claim.

**Sign-off:** Mukilan Rajasekar  (founder)   date: 2026-07-20

---

## Decision 1 — one confirmatory PRIMARY test; everything else is exploratory

- **PRIMARY (confirmatory).** The single pre-registered confirmatory test is: *does the **raw**
  region-of-interest (DMN) activation arc track the TVSum human interest arc, within video,
  first-differenced, against a circular-shift null?* This is the one test whose result we treat
  as confirmatory.
  - **Outcome: NULL** (Stouffer combined p ≈ 0.69 across 15 videos). We report this as the
    headline confirmatory result. A null is a legitimate, pre-registered outcome.
- **EXPLORATORY / hypothesis-generating (all of these):** the `global` whole-cortex arc; the
  **trained read-out head**; the head-vs-raw-arc incremental test; the head-vs-ffmpeg incremental
  test; the affect (valence/arousal) track. Findings here are **hypothesis-generating**, explicitly
  labelled as such, and never stated as a validated/confirmatory result.

> Why this matters: it makes the honest claim un-attackable — "our pre-registered primary was
> null; separately, an exploratory learned read-out shows an encouraging signal we are now
> powering up." That is the opposite of p-hacking.

## Decision 2 — multiple-comparison correction across the declared family

- **Family (5 tests), corrected together with Holm–Bonferroni** at family-wise α = 0.05:
  1. raw `roi` arc vs human (PRIMARY)
  2. raw `global` arc vs human
  3. trained head vs human (LOVO)
  4. head incremental over the raw arc (paired sign test)
  5. head incremental over the ffmpeg baseline (partial correlation)
- **Reporting rule:** every quoted p-value is accompanied by its Holm-adjusted p and the family
  size (5). We never quote a raw p in isolation as if it stood alone.
- Per-video permutation p-values *within* a test keep their own honest 1/(M+1) floor; Holm is
  applied to the **combined** (across-video) p per test, at the family level.

## Decision 3 — one pre-specified effect-size floor

- **Effect floor = |r| ≥ 0.10** (`MIN_EFFECT_R = 0.10`, already in `honest_corr_timeseries.py`).
  A result must clear BOTH the significance bar (Holm-adjusted) AND this effect floor to be called
  a signal. A statistically-significant but sub-floor correlation is reported as "detectable but
  below our materiality floor," never as a product-relevant effect.
- Rationale: at n≈15 clips × ~60 shots, tiny correlations can reach significance without meaning
  anything for a marketer. The floor is set once, in advance of any future run, and not tuned.

---

## What this lets us honestly say (the frozen n=15 result, under the rules above)

> "Our pre-registered primary test — does the raw brain-activation arc track human attention —
> came back **null** (Stouffer p ≈ 0.69), consistent with the published prior that whole-brain
> drive doesn't predict replay. Separately and exploratorily, a small **trained read-out head**
> over a-priori ROI features tracks the human interest curve out-of-sample: leave-one-video-out
> median Spearman **r ≈ 0.20** (~0.87× the human noise ceiling), combined **p = 0.0003**. It
> **survives** a loudness/cuts/luminance/motion control (partial r ≈ 0.18, p = 0.0005), so it is
> not merely re-deriving the edit. It does **not** yet beat the raw arc at a significant level
> (paired p = 0.087, underpowered). This is early: **n = 15 videos, TVSum is a public proxy for
> interest (not ad retention), and the head is a learned hypothesis, not a validated engagement
> model.**"

## Mandatory qualifiers whenever the head number is shown (deck, app, application)

1. **Exploratory / learned hypothesis** — not the confirmatory primary (which was null).
2. **Public proxy** — TVSum interest ≠ ad retention/engagement.
3. **Underpowered** — n = 15 videos; head-beats-arc is trending, not significant.
4. **Leakage-controlled** — the saved head must carry `leak_check = pass`
   (`validation/head_attn.json`); a poisoned/unshuffle-failing head is never quoted.
5. **Report every video and every null** — same rule as the primary; no dropping unfavourable rows.

---

## Provenance

Numbers frozen from the first n=15 TVSum run, committed to `validation/results.csv`,
`validation/head.csv`, `validation/head_incremental.csv`, `validation/head_attn.json`, reproducible
via `make head`, `python head_incremental.py`, and `baseline_extract.py → incremental_validity.py`.
This addendum does not change any computation — only how the results are framed and reported.
