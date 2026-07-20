# Soma — Product Vision

*The North Star we pitch and build toward. Sections are split into **the vision**
(what Soma is/does — bold, aspirational, allowed in a pitch) and **status today**
(what's validated vs. building — the credibility scaffold that survives diligence).*

---

## The pitch (one breath)

**Upload a video ad. Soma runs it through a simulated brain and hands back a
second-by-second read on where it holds attention, how it feels at each moment,
and where it loses people — and lets you compare every cut and variant across as
many runs as you want. Predicted from the file, no human panel, at a fraction of
the cost and time.**

## The loop (what a customer does)

1. Drop in a video — or several variants of the same ad.
2. Soma predicts the average viewer's second-by-second cortical response with a
   brain-encoding model (a "digital fMRI of the ad from the file").
3. Off that response it reads out:
   - an **attention arc** — where the ad holds vs. where attention leaks,
   - a **coarse emotion arc** — valence/arousal at each beat,
   - **weak-spot callouts** — "you lose them at 0:12."
4. Compare variants side by side, iterate the edit, re-run. Cheap enough to test
   every cut instead of only the one you can afford to panel.

## Why cheaper (real today)

Human pre-testing (Realeyes, Nielsen, System1, panels) needs real people, so it
costs thousands and takes days per ad. Soma predicts from the file in minutes — so
a team can test *every* variant, not just the hero cut. This advantage is true now,
independent of how far the science ladder has climbed.

## Why it can exist now

Meta open-sourced **TRIBE v2**, a benchmark-winning model that predicts the brain's
response to any video. That's the expensive part (the "eye"), and it's public.
**Meta built the eye; Soma builds the lens** — a targeted read-out that turns the
generic brain-response firehose into the handful of signals advertisers act on,
plus the proprietary ad-outcome data that sharpens the lens over time.

---

## Status today — the honest ladder (why a partner should believe the vision)

| Capability in the pitch | Where it really is |
|---|---|
| Video → brain activation | ✅ **Validated** — Meta's TRIBE v2, benchmarked vs real fMRI. Not ours; we say so. |
| Attention arc | 🟡 **Validating now** — pre-registered vs a human-interest curve (TVSum), permutation-tested. May return null; we report it either way. |
| Emotion at each point | 🔴 **Hypothesis** — cortical proxy (OFC/insula for valence/arousal), explicitly unvalidated, never a confident single named emotion. |
| "Loses people" / retention | 🎯 **The outcome we're proving** — does the predicted signal forecast real drop-off? Being tested; known to be hard (a public result finds whole-brain drive does *not* predict replay). This is the crux of the company, framed as what we validate, not a shipped feature. |
| Multiple-run / variant compare | ⚙️ **Product mechanic** — straightforward to build; the value is in the read-out it compares. |
| Lower cost than panels | ✅ **Real today.** |

**The moat is not the model.** The encoder is public — anyone can download it. Our
defensibility is (1) honest validation nobody else bothers to do, (2) the product,
and (3) the proprietary *ad × real-outcome* data flywheel our design partners
generate, which a public-encoder competitor can never scrape.

---

## Against the field (the one-breath version)

Everyone else measures reactions from **recruited humans** (panels, webcams, surveys)
or **simulates** them by prompting an LLM to role-play a person. Soma predicts the
**actual cortical response from the file** — no panel, no webcam, no survey — and is
the only one that draws a **visible line between validated and hypothesis.**

| Camp | Who | How they get the signal | Our line (true today) |
|---|---|---|---|
| Panel · neuro/biometric | Realeyes, Neurons Inc | webcam facial-coding, eye-tracking, some EEG on recruited viewers | From the *file*, minutes not days, cheap enough to test every variant — a predicted brain state, not a facial proxy. |
| Panel · survey/emotion | System1, Nielsen | recruited panels rate ads, tied to norms | Built for a few hero spots at brand budgets; we serve the high-volume low end they ignore. |
| Synthetic · LLM personas | Aaru, Simile | prompt an LLM to role-play a consumer | No biology — predicts what a person would *say* (agreeable-answer bias), not how a brain responds. |
| Same model, different bet | **VidCognition** | *also* Meta TRIBE v2 → per-second "brain engagement" | Same public eye; we differ on **honesty** (we show validated-vs-hypothesis and run the held-out test; they present it as fact) and **buyer** (performance teams + a data flywheel, not a creator hook-score). |

**The wedge is the signal source, not the arc's shape** — incumbents already ship
per-second curves; we change where the signal comes from. We do **not** claim to be
more accurate, or that the arc predicts retention — those are earned on the roadmap,
never asserted. Full breakdown + the four interview-killer answers: **`COMPETITORS.md`**.

---

## The road to "this level" (R0 → R4)

Each rung is *earned by a held-out test*, never asserted. (Mirrors `ROADMAP.md`.)

- **R0 — now:** frozen encoder + honest attention arc (transparent arithmetic) +
  the demo. Validated step is Meta's; our arc is a hypothesis, badged as such.
- **R1 — attention, learned:** train our own read-out *head* on top of frozen
  TRIBE, validated leave-one-video-out on public attention data (TVSum). First
  weights that are honestly ours. *(`train_head.py` is scaffolded; needs a real
  10–20 clip GPU run.)*
- **R2 — 2D affect:** the same head architecture reads out valence/arousal on
  public human-labeled proxies (LIRIS-ACCEDE), all badged proxy-hypothesis.
- **R3 — outcomes + the flywheel turns on:** retrain the head on **proprietary ad
  × real-reaction × retention** data from design partners. This is where
  "predicts where you lose people" earns its claim — and where the moat begins.
- **R4 — named emotions:** "amusement," "tension," "warmth," each rung earned by a
  held-out test, never before.

**Blocker to clear in parallel:** TRIBE's license is non-commercial (verify exact
terms). The frozen encoder powers R&D + the demo, but the paid pipeline needs a
written commercial license from Meta *or* a differently-licensed encoder. This is a
product-architecture constraint, not an afterthought.

---

## How to say it to YC (bold vision + one honest breath)

> "Upload an ad; our simulated brain tells you where it holds attention, how it
> feels moment to moment, and where it loses people — and compares every variant,
> for a fraction of what a human panel costs. Meta open-sourced the brain-encoding
> model that makes this possible; our edge is the targeted read-out on top and the
> proprietary ad-outcome data our partners generate. Today the video→brain step is
> validated, we're validating the attention read-out against real human data right
> now, and the emotion and retention layers are our labeled, pre-registered
> roadmap — we ship a claim only when a held-out test reproduces it."

That last sentence is the one that *wins* the room with YC: it signals a team
rigorous enough to be trusted with a hard problem, instead of one that overclaims
and dies on the first diligence question.
