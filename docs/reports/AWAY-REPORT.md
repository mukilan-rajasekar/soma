# While you were away — 2026-07-17

Plain-language summary of the ~3 hours. Nothing here is fabricated; every number below is
either a synthetic-fixture test result (labeled as such) or a "not yet run" honest blank.

---

## TL;DR

I did the two things you asked: (1) optimized/hardened the whole pipeline, and (2) actually
**built the first version of our own model** — an honest one. I also caught and fixed a
**live overclaim in the demo** that a YC partner would have spotted immediately. `make test`
is green (28/28 checks). Four new docs + one new trainer are on disk.

## 1. We now have our own model (the honest kind)

**New file: `train_head.py`** — SomAI's first *trained* model. In plain terms:

- Meta's TRIBE is a "brain firehose" — it predicts the whole brain's response to a video.
  We **freeze** it (don't touch it) and train a **small model of our own** on top that
  distills the firehose into one number advertisers care about: second-by-second attention.
- **Meta built the eye; we build the targeted lens.** We do NOT claim to beat Meta at the
  brain part — that's impossible for us and claiming it would be a lie.
- It's tested: on synthetic data it **finds a planted signal** (r≈0.94), correctly finds
  **nothing** where there's nothing, and its cheating-detector (shuffle test) **collapses** —
  proving it doesn't fake wins. All wired into the test suite so it can't silently break.
- It's honest by construction: it must **beat the simple arithmetic arc we already have**
  (that arc is nested inside it), it's judged leave-one-**video**-out, and if it doesn't beat
  the baseline on real data it will **say so plainly**. I wrote `PREREGISTRATION-head.md`
  locking the design *before* any real result — so we can't fool ourselves later.

**It can't make a real claim yet** — it needs the GPU run (≥10–20 clips). Today only proves
the machine works. That's the honest state.

See **`STRATEGY-PROPRIETARY-MODEL.md`** for the full "what's Meta's vs ours," the 5-phase
roadmap, and — important — the exact **allowed vs forbidden claims** for YC.

## 2. I fixed a live overclaim in the demo (this mattered most)

The demo hard-coded the attention arc as **"weakly validated · vs TVSum (shipped)"** — but
we've **never run the validation**, and the same page elsewhere honestly says "not yet run."
That contradiction is exactly what kills you in diligence. Fixed:

- Attention badge is now **data-driven**, defaulting to **"validation pending · not yet run"**
  (it'll flip to a real number only when a real result exists).
- Roadmap Rung 0, the nav chip ("sample arc"), the "rungs validated" counter (now 0), and the
  waitlist badge all corrected. The decorative background brain got a visible
  "ambient visual · not data" label, and a wrong HUD spec line was fixed.

## 3. I fixed two real bugs that would have burned us on the real run

`incremental_validity.py` produces the "why not just use ffmpeg?" number — the answer to a
classic investor question. It had two confirmed bugs that were **hidden by the synthetic test
data** and would only break on the real GPU run:

1. it lined up the baseline on the wrong clock → **crashes** on the normal ~1s length
   mismatch (and was being silently swallowed), and
2. it fabricated fake "co-movement" across dropped time-bins.

Both fixed to match the careful main harness. So: **do not quote a "beats ffmpeg" number
until it's run on real data** — but now when you do, it'll be right.

## 4. Smaller wins

- `batch_extract.py` now saves brain data at half the file size (float32), no quality loss.
- Direction-blind "Fisher p" relabeled so it can't be misread as proof of tracking.
- A false claim in a docstring ("the model cannot beat the human ceiling") deleted — it can.
- (Earlier today) `tvsum_trim.py` + the Colab "light path" so the GPU only does brain-math.

## What needs YOU (I deliberately did NOT decide these alone)

Some audit findings are **statistical-design judgment calls** where changing the code
silently could *hurt* honesty. I left them for you, with the fix written out in
`OPTIMIZATION-BACKLOG.md` (#6, #9, #10, #19): the noise-ceiling basis, one consistent
effect-size floor, family-wise correction across the ~5 tests, and making the weak-spot
detector falsifiable. These belong in `PREREGISTRATION.md` with your sign-off.

I also **rejected** one audit suggestion (zip only arcs in Colab) because it would break
`train_head.py`, which needs the preds. Noted in the backlog.

## Your exact next steps

1. **Upload** `data/clips_trimmed/` (3 clips, ready) to Google Drive → `MyDrive/soma/clips`.
2. When the Colab GPU limit resets: **Cell 1 → restart → Cell 2B → Cell 3 → Cell 4 → Cell 5.**
3. Download the results zip → `make ingest ZIP=~/Downloads/soma_arcs.zip` → open
   `validation/report.html` for the honest signal-or-null verdict on the arc.
4. Build the ROI masks (`build_roi_mask.py --network dmn/dan/valence/arousal` into `data/`),
   then **`make head`** to train and validate the read-out head on the real preds. Whatever
   it says — signal or null — is the honest first result of our own model.

## New/changed files

- **New:** `train_head.py`, `PREREGISTRATION-head.md`, `STRATEGY-PROPRIETARY-MODEL.md`,
  `OPTIMIZATION-BACKLOG.md`, this file.
- **Fixed:** `incremental_validity.py`, `batch_extract.py`, `honest_corr_timeseries.py`,
  `publish_results.py`, `tests/dry_run.py`, `demo/{app.js,index.html,styles.css,waitlist.html}`,
  `Makefile`, `colab_run.ipynb`, `colab_README.md`.

## Honesty ledger

No fabricated numbers anywhere. The only quantities produced are on **synthetic fixtures**
(explicitly labeled) to prove the code works. `demo/results.json` is still absent (correct —
no real run yet). The demo now says "validation pending," not "validated," everywhere the
truth is "not run." `make test`: **28/28 PASS.**
