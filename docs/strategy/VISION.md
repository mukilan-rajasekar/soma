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

## The product surface (the three things a user can do)

Soma is a **platform** with one engine — the brain-response read-out — wrapped in three
jobs. The read-out is the **scoring function** ("which cut holds attention / lands the
message?"); capabilities 2 and 3 point generation and editing at that judge. Honesty
register still applies: only #1's *analysis* is close to today; #2 and #3 are the
platform roadmap, built on external generators/editors with Soma as the scorer.

1. **Bring your own videos → get the best one.** Drop in pre-existing ads/variants;
   Soma ranks them on attention, comprehension, and weak-spots and tells you which to
   ship. Closest to today's product (the read-out + variant compare). *Status: the
   mechanic is real; the ranking's predictive validity is what we're validating.*
2. **Generate from scratch with natural language + props.** Describe the ad (and hand
   over brand props/assets); Soma spins up many candidates via **pre-trained
   generators primed with tribe/creator context** (so it knows good hooks, attention
   holds, and comprehension patterns) and surfaces the strongest. *Status: roadmap —
   Soma is the scorer over third-party generation, not a pixel model of our own.*
3. **AI ad editing (applies to #1 and #2).** Selectively splice, reorder shots, or add
   text; auto-generate edit options, run each through the model, and splice the best.
   **Does not require pixel generation** — reordering/captioning is enough to win. *Status:
   roadmap — the value is the read-out choosing among edits, not novel footage.*

## Model posture (what's running the read-out)

Prototype runs on **Meta's TRIBE v2 weights as a blueprint** (frozen encoder + our
read-out head). A **custom encoder is in development** — a faster, less GPU-intensive
model built specifically for ad testing (cheaper per run, unblocks the CC-BY-NC / Llama
licensing constraint the frozen stack carries). Full plan: **`STRATEGY-PROPRIETARY-MODEL.md`**.

## How we sell it right now (service posture + who buys)

- **Concierge, not self-serve.** We operate a **concierge model with a waitlist** — we run
  the pipeline for the customer and hand back the read-out. AI-native services shape: we
  sell the *outcome/work*, not a tool the customer has to drive.
- **ICP = large companies that run lots of ads** (more ads → more time saved, no panel
  campaigns to stand up, more variants de-risked before spend). That is who this is *for*.
- **Reality today: the waitlist is small companies**, on purpose — they're easier to
  process and scale to real results, and there's an **access problem** (we don't have
  Pepsi-exec access yet). Small-co now is the on-ramp to the large-co ICP, not a pivot.

## The two YC lanes we fit (Requests for Startups)

Soma sits squarely in two YC RFS themes:
1. **Startups that want to sell to huge companies** — the large-advertiser ICP above.
2. **AI-Native Service Companies** — the concierge/sell-the-work posture above.

*(Paraphrase these — verify the exact 2026 RFS wording before quoting it in the
application; see the same caution in `../GTM/YC-APPLICATION.md`.)*

## Why cheaper (real today)

Human pre-testing (Realeyes, Nielsen, System1, panels) needs real people, so it
costs thousands and takes days per ad. Soma predicts from the file in minutes — so
a team can test *every* variant, not just the hero cut. This advantage is true now,
independent of how far the science ladder has climbed.

## Why it can exist now

Meta open-sourced **TRIBE v2** — the successor to Meta's Algonauts-2025-winning
TRIBE — that predicts the brain's response to any video. That's the expensive part (the "eye"), and it's public.
**Meta built the eye; Soma builds the lens** — a targeted read-out that turns the
generic brain-response firehose into the handful of signals advertisers act on,
plus the proprietary ad-outcome data that sharpens the lens over time.

---

## Status today — the honest ladder (why a partner should believe the vision)

| Capability in the pitch | Where it really is |
|---|---|
| Video → brain activation | ✅ **Validated** — Meta's TRIBE v2, benchmarked vs real fMRI. Not ours; we say so. |
| Attention arc | 🟡 **Tested — primary null, exploratory signal weak.** The pre-registered raw-arc vs human-attention test (TVSum, n=15) came back **null**. An exploratory trained read-out head shows a weak aggregate signal but only 2/15 clips individually beat the plain ffmpeg baseline (`validation/head_incremental.csv` footer: `median_raw=0.1719 median_partial=0.1784 adds=2/15 stouffer_p=0.0005`). Not a validated win; we report it as-is. |
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
the only one that **draws — and reports — the line between validated and hypothesis**,
in our pre-registration and diligence, even when the held-out test comes back null —
and compounds a proprietary **ad×outcome data flywheel** a public-encoder rival can't scrape.

| Camp | Who | How they get the signal | Our line (true today) |
|---|---|---|---|
| Panel · neuro/biometric | Realeyes, Neurons Inc | webcam facial-coding, eye-tracking, some EEG on recruited viewers | From the *file*, minutes not days, cheap enough to test every variant — a predicted brain state, not a facial proxy. |
| Panel · survey/emotion | System1, Nielsen | recruited panels rate ads, tied to norms | Built for a few hero spots at brand budgets; we serve the high-volume low end they ignore. |
| Synthetic · LLM personas | Aaru, Simile | prompt an LLM to role-play a consumer | No biology — predicts what a person would *say* (agreeable-answer bias), not how a brain responds. |
| Same model, different bet | **VidCognition** | *also* Meta TRIBE v2 → per-second "brain engagement" | Same public eye, **same DTC/performance buyer** — we differ on **honesty** (we actually run the held-out test and report the result — including a null — while they present it as fact) and the proprietary **ad×outcome data flywheel** a public-encoder rival can't scrape. |

**The wedge is the signal source, not the arc's shape** — incumbents already ship
per-second curves; we change where the signal comes from. We do **not** claim to be
more accurate, or that the arc predicts retention — those are earned on the roadmap,
never asserted. Full breakdown + the four interview-killer answers: **`COMPETITORS.md`**.

---

## The road to "this level" (R0 → R4)

Each rung is *earned by a held-out test*, never asserted. (Mirrors `ROADMAP.md`.)

- **R0 — now:** frozen encoder + honest attention arc (transparent arithmetic) +
  the demo. Validated step is Meta's; our arc is a hypothesis, and we say so.
- **R1 — attention, learned:** train our own read-out *head* on top of frozen
  TRIBE, evaluated leave-one-video-out on public attention data (TVSum). First
  weights that are honestly ours. *(`train_head.py`, `head_io.py`, and
  `head_apply.py` ship the full train → save → apply path; the first 15-clip
  run is in — aggregate `stouffer_p=0.0005` but only 2/15 clips beat baseline,
  so the head is **detectable, not yet validated** — this rung is not earned.)*
- **R2 — 2D affect:** the same head architecture reads out valence/arousal on
  public human-labeled proxies (LIRIS-ACCEDE), all badged proxy-hypothesis.
- **R3 — outcomes + the flywheel turns on:** retrain the head on **proprietary ad
  × real-reaction × retention** data from design partners. This is where
  "predicts where you lose people" earns its claim — and where the moat begins.
- **R4 — named emotions:** "amusement," "tension," "warmth," each rung earned by a
  held-out test, never before.

**Blocker to clear in parallel:** TRIBE's weights *and* code are both CC-BY-NC-4.0 —
non-commercial. The frozen encoder powers R&D + the demo, but the paid pipeline needs a
written commercial license from Meta — for which Meta publishes **no path**, so it's a
**hope Meta may decline**, not an option we can count on — *or* a differently-licensed
encoder. And even a hypothetical commercial TRIBE license wouldn't clear the required
Llama-3.2-3B text branch, which carries the **Llama 3.2 Community License** ("Built with
Llama" attribution, a "Llama" name prefix on derivatives, AUP compliance, and a separate
Meta license above 700M MAU). This is a product-architecture constraint, not an afterthought.

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
