# SomAI — the honest "proprietary model" strategy

*Written 2026-07-17 from a multi-agent audit + strategy pass. Numbers marked ⚠️ came from
agent web-research and MUST be independently verified before you say them to anyone.*

---

## The one-paragraph version (ELI5)

Meta open-sourced a model (**TRIBE v2**, the successor to Meta's Algonauts-2025-winning
TRIBE) that predicts the brain's full response to any video — a generic neuroscience firehose. We **freeze** it and, on top of it,
train a **small model of our own** that distills that firehose into the one signal
advertisers act on: second-by-second attention. **Meta built the eye; we build the targeted
lens.** We do **not** try to out-build Meta's eye — that would take a fMRI dataset and
compute we can't match, and claiming we did would be a lie a YC partner catches in one
question. Our model is the *lens* (the read-out head) plus the *proprietary ad-outcome data*
we collect. That's real, defensible, and true.

## What is Meta's vs what is ours (say it exactly like this)

| Piece | Whose | Honest status |
|---|---|---|
| Video → brain activation (the encoder) | **Meta's** (public TRIBE v2, CC-BY-NC) | Validated by Meta vs real fMRI (Schaefer-1000 parcels, ~0.21 mean Pearson) |
| The `~1B params` | **Mostly Meta's** frozen backbones ⚠️ (Llama-3.2-3B, Wav2Vec2-BERT, V-JEPA 2) | Not ours — never call this "our model" |
| The read-out **head** (`train_head.py`) | **Ours** | A trained model, but a *learned hypothesis* (activation→attention), not validated |
| The **ad-outcome data** the head learns from | **Ours** (Phase 3+) | The actual moat |

> **Never** call frozen TRIBE "our proprietary model" or "our 1B-parameter model." The
> proprietary object is only the head + the data.

## Can we build our own (better) encoder? — Honest verdict: no, and we shouldn't

- Out-encoding Meta means training on CNeuroMod-scale fMRI: ⚠️ ~6 subjects × ~200 h for v1,
  700+ subjects for v2 — $0.6M to tens of millions in scanner time. Infeasible for a seed
  team and off-ethos.
- The head reads out **from** the encoder; it does not compete with it. So the honest
  comparative claim is **"more targeted than Meta's generic encoder," never "more accurate."**
- The genuine narrow opening is *targeting*, not *accuracy*: TRIBE was trained on movies, not
  ads, and predicts activation, not ad outcomes. That gap is ours to close.

## The phased roadmap (what we can honestly claim at each rung)

**Phase 0 — Frozen TRIBE + honest arithmetic arc (what we have NOW).**
The validated step is Meta's; our arc is transparent arithmetic (mean |activation| over an
a-priori DMN mask); the demo says so on every surface. *Claim:* "Meta's frozen model does the
validated video→brain step; our arc is a simple reduction of it — whether it tracks
attention is a pre-registered hypothesis that may return null."

**Phase 1 — Proof-of-architecture read-out head on public TVSum (BUILT: `train_head.py`).**
A tiny ridge over a-priori ROI-pooled TRIBE features, the untrained arc nested as a baseline
it must beat, validated leave-one-VIDEO-out with a circular-shift null. *Claim:* "Our first
trained read-out head — encoder is Meta's, these weights are ours — validated LOVO on public
TVSum. **Proof-of-architecture, explicitly not the moat**; TVSum is public and importance is
a proxy. ~10–20 videos = underpowered; may return null, and we'll say so."
*Gated on the GPU extraction of ~10–20 clips + a locked brain space.*

**Phase 2 — Multi-target warm-start on public affect/memory proxies.**
Same head architecture reused for valence/arousal (LIRIS-ACCEDE) and memory (Memento10k),
all badged `proxy-hypothesis`. *Claim:* "the same architecture reads out attention, affect,
and memory on public human-labeled proxies — de-risks the design for ~$0. Proxies, not
outcomes; effects expected weak."

**Phase 3 — Proprietary ad-outcome flywheel (THE MOAT).**
Retrain the same head on proprietary ad × real-reaction × outcome data a public-encoder
competitor can never scrape: design-partner ad accounts (retention / ThruPlay via Meta /
YouTube / TikTok APIs, harvested ~$0), plus cheap Prolific webcam-gaze panels — behind a
consent/GDPR/BIPA layer. *Claim:* "the moat is the **same head retrained on proprietary
ad-outcome data our partners generate** — not out-training Meta, not the public TVSum head.
Retention is noisy/confounded; head output stays a learned hypothesis." *Start partner
conversations NOW; the Phase 0/1 demo is the wedge.*

**Phase 4 — Owned neural validation cohort + commercial-license *ask* (a hope, not a documented path).**
A small (n~10–30) consumer-EEG / facial-coding validation cohort (framed strictly as
validation, cross-checked vs public AMIGOS/DEAP), plus a **formal written commercial-license
*request* to Meta** for TRIBE — a hope, not a documented option; Meta publishes no
commercial-licensing path and may decline. *Claim:* "EEG is a small coarse-state validation
cohort — NOT fMRI-grade, NOT our label engine. Frozen TRIBE stays non-commercial R&D unless
Meta grants a commercial license in writing — which it may never do."

## The licensing blocker (do not skip)

Both the `facebook/tribev2` **weights and code are CC-BY-NC-4.0** — non-commercial. They can
power research, validation, and the demo, but **not the paid/revenue pipeline.** Meta
publishes **no commercial-licensing path** for TRIBE, so "ask Meta in writing" is a **hope
Meta may decline**, not a documented option — log the outcome, and never present it as a route
that already exists. This shapes the product architecture (frozen TRIBE = R&D/demo; the paid
path needs a written license we may never get, or a differently-licensed encoder).

**And a second license sits underneath even that hope.** The commercial pipeline needs the
Llama-3.2-3B text branch, which carries the **Llama 3.2 Community License** — commercial use
*is* allowed, but requires **"Built with Llama" attribution**, a **"Llama" name prefix on any
derivative model**, **Acceptable-Use-Policy compliance**, and a **separate license from Meta
above 700M MAU**. So even a hypothetical commercial TRIBE license would not clear the text
branch's terms on its own.

## Allowed claims ✅ (all true today or after the Phase-1 run)

- "Meta's frozen TRIBE does the validated video→brain step (benchmarked vs real fMRI on
  Schaefer-1000 at ~0.21 mean Pearson); on top of it, frozen, we train a small proprietary
  read-out head — the encoder is Meta's, the head's weights are ours."
- "More **targeted** than Meta's generic encoder, not more accurate."
- "Introducing a trained head is a real upgrade — today's arc is pure arithmetic; there is no
  trained model yet."
- "Validated leave-one-VIDEO-out on public TVSum with a circular-shift null and a nested
  baseline it must beat" — *only after the run, reporting every video, null stated plainly.*
- "The moat is the same architecture retrained on proprietary ad-outcome data" (the flywheel),
  and public proxies (TVSum/LIRIS/Memento) openly labeled PROXY that warm-start it for free.

## Forbidden claims ❌ (diligence-fatal — never say these)

- "Our proprietary brain model" / "our 1B-param model" for frozen TRIBE.
- "Validated vs TVSum (shipped)" for the attention arc **while no GPU run has happened** *(this
  was live in the demo and is now fixed to "validation pending")*.
- "Beats the ffmpeg / Realeyes baseline" until the incremental_validity fixes are confirmed on
  **real** (non-fixture) data *(bugs now fixed; test still needs to run on real data)*.
- "The model reaches X% of the human ceiling" as a hard bound / "cannot beat the ceiling."
- "More accurate than Meta" / "we built a better brain encoder."
- "Predicts retention / engagement / watch-through / memory / sales" for any current output.
- "Our EEG measures the brain like fMRI." / Presenting TVSum/LIRIS/etc. as proprietary data.
- Quoting one surviving test out of ~5 as THE result without a pre-registered primary +
  family-wise correction; citing shots (~1000s) not videos (~10–20) as the sample size.
- Claiming our fsaverage5 projection is what the TRIBE paper benchmarked (it used
  Schaefer-1000). Shipping frozen TRIBE in the paid pipeline under CC-BY-NC.

## The single most demoable honest v0

The tiny ridge read-out head (`train_head.py`) validated LOVO on public TVSum, wired into the
demo behind a badge that **defaults to "validation pending"** and flips to the real LOVO
number — reporting a null plainly if the head only ties the baselines. It's a genuine step up
from today's pure-arithmetic arc, the weights are honestly ours while the encoder is honestly
Meta's, and it's judged by the identical honest yardstick as the baseline it must beat.
