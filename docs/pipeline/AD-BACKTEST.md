# Ad-outcome backtest — "can we predict which of your ads wins?"

The single highest-leverage validation we can run right now. It answers the make-or-break
GTM question **before** we say it to a prospect: does the neural score actually rank real
ads by their real performance — *over and above* dumb ffmpeg features?

- If **yes** → the cold email ("we predicted your winning ad, here's the proof") is true, and
  the in-app ranking gets a real badge.
- If **no** → we learned it for ~free, before torching a single lead, and we know the learned
  head needs the proprietary ad-outcome flywheel before this pitch works.

Either way it is honest. **Never send the "we predicted your winner" email before this number
exists and clears the floor.**

---

## What it does (and how it differs from the TVSum tests)

`incremental_validity.py` / `head_incremental.py` correlate a *within-video time series*
(shot-by-shot arc vs human interest). This backtest is **cross-sectional**: each ad collapses
to **one** neural score, and we ask whether that score ranks a *set* of ads by their outcome.

Headline statistic = **partial Spearman**: neural-score-vs-outcome after removing what the
ffmpeg summary (loudness / cuts / luminance / motion / duration) already explains in both.
That is the answer to "aren't top ads just short, loud, and face-first?" — reused straight
from `incremental_validity.partial_spearman`, with a label-permutation null (deterministic
seed, honest `1/(M+1)` floor) and the same effect floor `|r| ≥ 0.10`.

The **pre-registered primary** neural score is the **mean** of the per-ad neural series. `peak`,
`hook` (first 3 s), and `area` are computed too but are **exploratory** — never quoted as the
result (avoids best-of-4 cherry-picking).

---

## Inputs

Everything lives under `data/ads/` (override dirs with flags):

| File | Columns / shape | Produced by |
|---|---|---|
| `data/ads/ad_manifest.csv` | `ad_id,outcome[,platform,note]` — **higher outcome = better** | `ad_fetch.py` or by hand |
| `data/ads/arcs/arc_<ad_id>.csv` | `t_sec,roi_mag[,global_mag]` | `batch_extract.py` |
| `data/ads/arcs/preds_<ad_id>.npy` | `(n_sec, 20484)` — only for `--score head` | `batch_extract.py` |
| `data/ads/baseline/baseline_<ad_id>.csv` | `t_sec,loudness,cuts,luminance,motion` | `baseline_extract.py` |

The **outcome** is any number where bigger = better: CTR, ThruPlay rate, days-an-ad-has-run,
or a rank where 1 = best (then pass `--outcome-is-rank`, which inverts it). A design partner's
own CPA/ThruPlay on their own ads is the gold source — when you have it, skip scraping.

---

## Step-by-step

### 1. Gather ~15–30 real ads + a real outcome

**Option A — TikTok Creative Center (free, already ranked by performance):**
```bash
python ad_fetch.py tiktok --out data/ads --limit 30 --country US --period 30 --order-by ctr
```
The list position IS the outcome proxy (#1 outperformed #20). TikTok rotates anti-crawl
headers, so if it returns nothing, fall back to Option B.

**Option B — build the manifest by hand (always works):**
```bash
python ad_fetch.py scaffold --out data/ads      # writes a clean template + a README
```
Then, for ~15–30 ads from TikTok Top Ads or Meta Ad Library: download each video to
`data/ads/videos/<ad_id>.mp4` and fill `ad_manifest.csv` (outcome = CTR / days-running /
rank). Read `data/ads/ad_manifest.README.txt` for the exact convention.

> **Proxy honesty:** TikTok rank and Meta longevity are *proxies* for real spend outcomes — a
> longer-running / higher-CTR ad usually wins, not always. Say "proxy" in every claim, as the
> code does. The strongest data is a partner's own outcomes on their own ads.

### 2. Extract the brain arc (GPU) + the ffmpeg baseline (CPU)

```bash
# GPU (A100 / Colab) — same extractor as everything else, see PIPELINE.md:
python batch_extract.py --video-dir data/ads/videos --out data/ads/arcs   # -> arc_/preds_

# CPU, laptop-friendly:
python baseline_extract.py --video-dir data/ads/videos --out data/ads/baseline
```

### 3. Run the backtest

```bash
# arithmetic-arc score (no head needed):
make ad-backtest                         # SCORE=arc by default

# trained-head score (the real bet), applied OUT-OF-DISTRIBUTION to each ad:
make ad-backtest SCORE=head HEAD=validation/head_attn.json
# or directly:
python ad_backtest.py --manifest data/ads/ad_manifest.csv --score head \
    --head validation/head_attn.json --preds-dir data/ads/arcs \
    --arc-dir data/ads/arcs --baseline-dir data/ads/baseline
```

### 4. Read the verdict

Console prints raw r, partial r, perm p, top-1 hit, and top-k precision for each summary
(only `mean` is the verdict). Outputs:

- `validation/ad_backtest.csv` — per-ad neural score + covariates (audit trail)
- `validation/ad_backtest.json` — machine-readable summary the demo reads (`signal`, `primary`, `verdict`)

**SIGNAL** (`primary.perm_p < 0.05` **and** `|partial_r| ≥ 0.10`) → the neural score predicts
real ad rank over ffmpeg. Encouraging, still a proxy / out-of-distribution / small-n
hypothesis. **NULL** → reported plainly; the claim waits.

---

## What you may / may not say

✅ *"On N real ads with a public performance proxy, our neural score ranked them beyond
loudness/cuts/duration (partial r = …, perm p = …). Early, proxy outcome, out-of-distribution
scorer — a hypothesis we're powering up on partner data."*

❌ *"We predict ad performance"* / *"92% accurate"* / quoting `peak`/`hook` because they beat
`mean` / citing shots instead of the **number of ads** as the sample size / sending the cold
email before the primary clears the floor.

---

## Guardrails baked into the code

- ffmpeg partial control is the headline (a pure loudness confound collapses — see
  `tests/test_ad_backtest.py::test_ffmpeg_confound_collapses_under_partial`).
- Effect floor `MIN_EFFECT_R = 0.10` **and** perm `p < 0.05` both required for "SIGNAL".
- Pre-registered primary summary; exploratory ones labeled, never quoted as the result.
- Ads missing a baseline are excluded from the partial (and it says so) — no silent inflation.
- A poisoned head is refused; a head applied to a new ad is badged out-of-distribution.
- `< 6` scorable ads → hard stop (underpowered); `< baseline` coverage → warned.

Smoke test (GPU-free, no network): `.venv/bin/python -m pytest tests/test_ad_backtest.py`.
