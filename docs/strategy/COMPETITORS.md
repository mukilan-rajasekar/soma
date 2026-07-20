# Competitors — how Soma is different (and where it's honestly better)

*The single source of truth for competitive positioning. The demo comparison pages
(`demo/compare.html`), the pitch deck, and the YC-interview "why won't Realeyes just
build it?" answer all draw from here — change positioning **here first**, then
propagate.*

> **Honesty rule applies to competitors too.** Everything claimed as a Soma
> advantage below is either (a) true today (cost, "from the file, no panel,"
> transparency, the *visible* evidence boundary) or (b) explicitly framed as
> roadmap. We do **not** claim Soma is more *accurate* than any incumbent — that
> requires the held-out validation we're still running. Overclaiming against a
> competitor is the same diligence risk as overclaiming a result. Competitor facts
> marked **[verify]** are from their own marketing or third-party pages and must be
> confirmed before they go in a deck or on the public site.

---

## The one-sentence version

Everyone else measures reactions from **recruited humans** (panels, webcams,
surveys — Realeyes, System1, Neurons, Nielsen) or **simulates** them by prompting an
LLM to role-play a person (Aaru, Simile). Soma predicts the **actual cortical
response** from the video file with a public, benchmark-winning brain-encoding model
— no panel, no webcam, no survey — and is the only one that draws a **visible line
between what's validated and what's still a labeled hypothesis.**

---

## The three axes we win on (true today)

1. **Signal source (the wedge).** A brain-encoding model trained on real fMRI vs.
   (a) a human panel you have to recruit, run, and pay, or (b) an LLM guessing what a
   person would say. This is the differentiator — *not* the shape of the output.
   Realeyes and Neurons already ship per-second attention curves + weak-spot
   callouts; Aaru/Simile already ship simulated opinion. We change **where the signal
   comes from**: predicted biology, from the file.
2. **Cost & volume.** Prediction from the file runs in minutes for cents, so a team
   can test *every* cut and variant — not just the one hero spot they can afford to
   panel. Panels cost thousands and take days per ad. This is real today, independent
   of how far the science ladder has climbed.
3. **Epistemic honesty (the moat nobody copies).** Every claim wears its evidence
   tier — green validated / amber validating / red hypothesis. Incumbents sell an
   opaque score you take on faith; the LLM-persona tools present a confident answer
   with no biology under it. Our whole edge is the *visible* validated-vs-hypothesis
   boundary. It is a design choice a "trust our black box" incumbent structurally
   cannot copy without undercutting their own pitch.

**The moat is not the model.** `facebook/tribev2` is public — Realeyes, VidCognition,
and anyone else can download the same weights. Defensibility is (1) the honest
validation nobody else bothers to do, (2) the product/workflow, and (3) the
proprietary **ad × real-outcome × retention** data flywheel our design partners
generate, which a public-encoder competitor can never scrape.

**What we do NOT claim (yet):** more accurate than a panel; that the arc predicts
retention; that activation = interest. Those are on the roadmap (`ROADMAP.md` R1→R3),
earned by held-out tests, never asserted.

---

## The field, grouped by signal source

| Camp | Who | How they get the signal | Soma's line |
|---|---|---|---|
| **Human panel — neuro/biometric** | Realeyes, Neurons Inc | webcam facial-coding, eye-tracking/gaze, some EEG, on recruited viewers | We predict the cortical response *from the file* — no viewers to recruit, minutes not days, and we predict the brain state, not a facial proxy for it. |
| **Human panel — survey/emotion** | System1, Nielsen | recruited panels rate ads (facial + self-report), tied to large normative DBs | Built for a handful of hero spots at brand budgets. We serve the high-volume, low-cost end they ignore. |
| **Synthetic / LLM personas** | Aaru, Simile | prompt an LLM to role-play a consumer and self-report | No biology — predicts what a person might *say* (biased toward agreeable answers), not how a brain responds. We predict the actual neural signal. |
| **Same model, different bet** | **VidCognition** | *also* Meta TRIBE v2 → per-second "brain engagement" | Same public eye, different lens: they overclaim (present activation→engagement as fact); we ship the visible validated-vs-hypothesis boundary and actually run the held-out validation. Different buyer, too. |

---

## Per-competitor breakdown

### Realeyes
- **What they do:** attention + emotion measurement via **webcam facial-coding and
  eye-tracking** on recruited panels; per-second attention curves and quality scores
  for video ads.
- **Where they're genuinely strong:** real human reactions (not predicted); an
  established brand with agency/advertiser trust and years of normative data.
- **How Soma differs:** we predict from the **file** — no webcam, no recruited panel,
  no scheduling — in minutes, at a fraction of the cost, so you can test every
  variant. Their signal is a facial/gaze *proxy* for internal state; ours is a
  predicted **cortical** response. And we show the evidence tier on every claim.
- **"Why won't Realeyes just build this?"** (interview killer) — A public, transparent,
  from-the-file model directly undercuts their "recruit a panel, trust our score,
  pay per study" business. It's a **business-model conflict, not an engineering
  gap.** Incumbents rarely ship the thing that commoditizes their core pricing.
- **Honest caveat:** they have real humans in the loop and a normative DB we don't.
  We don't claim to beat their accuracy — we claim a different signal source, radically
  lower cost/latency, and honest labeling.

### Neurons Inc (Predict)
- **What they do:** AI **attention/gaze prediction** for creative, trained on
  eye-tracking (and some neuro) data; per-frame attention heatmaps and scores.
  The most *functionally* similar shipping product (per-frame engagement timeline).
- **Pricing:** enterprise; **~€15,000/year for ~5 seats [verify]** (figure comes from
  a third-party comparison page — confirm before quoting).
- **Where they're strong:** shipping, polished, established with enterprise marketing
  teams; attention prediction is a real, validated-in-its-domain capability.
- **How Soma differs:** Neurons predicts **gaze/attention** (where the eye goes);
  Soma predicts the **full cortical response** — attention *and* a coarse affect read
  — from a brain-encoding model. We're priced for performance teams and creators, not
  five-figure enterprise contracts, and we carry the honesty boundary they don't.
- **Honest caveat:** their attention model is mature; our attention arc is *validating*
  (amber), not validated. Differentiate on signal breadth, price, and honesty — not
  on a superiority claim we haven't earned.

### System1
- **What they do:** predictive ad testing focused on **emotional response** ("Test
  Your Ad," Star ratings) via recruited panels + facial/self-report, tied to
  long-term brand-effect norms.
- **Where they're strong:** outcome-linked normative data and credibility with **brand**
  marketers who care about long-term brand building.
- **How Soma differs:** panel-based, per-study, slow, and aimed at big-brand hero
  spots. Soma is the **high-volume, low-cost, from-the-file** read for performance
  teams shipping dozens of paid-social videos a week — the segment System1's model
  is too slow and pricey to serve.

### Nielsen
- **What they do:** legacy ad/creative testing — large panels, norms, brand-lift; the
  incumbent of incumbents.
- **How Soma differs:** expensive, slow, enterprise, hero-spot-oriented. Same story as
  System1 — we serve the unserved high-volume low end. Mention mainly to show we know
  the landscape; not a head-to-head target.

### Aaru / Simile (synthetic research, LLM personas)
- **What they do:** simulate consumer research by prompting LLMs to **role-play
  people** and answer survey-style questions; fast, cheap, flexible.
- **Where they're strong:** genuinely fast and cheap; can answer *any* question you can
  phrase (not just second-by-second attention). Aaru is a strong YC-lineage precedent.
- **How Soma differs:** **no biology.** They predict what a person might *say* — and
  LLM personas are biased toward agreeable, plausible-sounding answers. We predict the
  actual neural response with a model trained on real fMRI. "GPT imagines what someone
  would say; we predict the cortical signal, reproducible run to run."
- **Honest caveat:** partly a **different job** — they do broad simulated survey
  research; we do second-by-second neural arcs on video. Don't frame it as strictly
  either/or; frame it as *grounded vs. ungrounded* for the video-reaction question.

### VidCognition — the closest analog, and the sharpest positioning test
- **What they do:** *also* built on **Meta's TRIBE v2**; per-second predicted "brain
  engagement" for TikTok/Reels/Shorts; creator-focused; cheap "first analysis free"
  funnel; a public `/science` page and a hook-grader tool.
- **Why they matter most:** same **public base model** we use. Neither of us owns the
  eye — so on the model axis we are even. Which means the entire contest is **lens +
  epistemics + buyer**, exactly where we choose to compete.
- **How Soma differs — three real forks:**
  1. **Epistemics.** VidCognition presents the activation→engagement step as settled
     fact ("ACC activation correlates with low early drop-off," "amygdala activation
     drives higher completion") while its own FAQ admits *"we do not generate
     proprietary accuracy claims"* and leans entirely on Meta's ~92% *encoder*
     correlation. That 92% is for **video → cortical activation** — it says nothing
     about whether their engagement score predicts completion. This is the exact
     reverse-inference trap we refuse: dressing an unvalidated heuristic as a result.
     Soma shows the tier and runs the held-out test (TVSum/LIRIS).
  2. **Buyer & job.** They sell creators a "brain engagement score" (a
     viral-ish index) to grade hooks. We sell **performance/DTC teams** a decision
     instrument tied to real media spend — with A/B variant compare and a data
     flywheel. Different buyer, different willingness to pay, different retention.
  3. **Disclosure posture.** We proactively disclose the negative prior (whole-cortex
     global drive does *not* predict YouTube most-replayed); they cherry-pick the
     flattering number. To a skeptical expert, disclosed limitations read as *more*
     credible, not less.
- **What to borrow from them (not fight):** their public science/education page,
  their plain-English region→pattern translation, their comparison pages, and their
  low-friction "one free analysis" funnel are all good playbook. Match their
  production values; **do not** match their epistemics. (See `demo/CONTENT-PLAN.md`.)
- **Moat vs. VidCognition specifically:** validation rigor + the proprietary
  ad×outcome data flywheel — *not* the model (neither of us owns TRIBE). Whoever
  earns real validation and accumulates real outcome data first wins the honest
  version of this race.
- **[verify]** VidCognition's specific claims, pricing, and whether they've published
  any real activation→engagement validation. Re-check before citing them by name
  publicly.

---

## The four YC-interview killers, answered from this doc

1. **"n of how many?"** — Validation is *within-video* (n = time, ~1 point/sec ×
   many clips) against public human data (TVSum 20 annotators; LIRIS continuous
   affect), permutation-tested — not a small between-video n. Report the real number
   Day 3, including a null.
2. **"Why won't Realeyes just build it?"** — Business-model conflict: a public,
   transparent, from-the-file model undercuts panel recruitment + per-study pricing.
   They won't commoditize their own core.
3. **"Better than prompting GPT?"** — GPT/Aaru/Simile imagine what a person would
   *say* (agreeable-answer bias, no biology). We predict the actual cortical response
   from a model benchmarked against real brains — reproducible run to run.
4. **"Who pays and how much?"** — DTC/performance-marketing growth + creative leads,
   per-seat/per-video SaaS priced far below a panel study (and below Neurons'
   enterprise tier). Value anchor: flag a predicted attention drop before you commit
   six figures of media.

---

## Positioning guardrails (do not violate on any public surface)

- Never say Soma is **more accurate** than an incumbent — unproven.
- Never say the arc **predicts retention** — that's the outcome we're validating.
- Never call the public model a **moat** — it isn't; the flywheel + validation are.
- Always pair a competitor's weakness with an honest acknowledgment of their
  strength — it reads as confidence, not spin, to the skeptical expert who is our
  primary audience.
- Cite the **negative prior** proactively when the topic comes up. It builds more
  credibility than hiding it.
