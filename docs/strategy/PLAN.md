# PLAN — from pre-alpha to a fundable, sellable Soma

Written 2026-07-30. Supersedes `WEEK-PLAN.md`, whose deadline (Jul 27) has passed.
Grounded in the Tola/Shawn Kung conversation and a full audit of this repo.

**The spine of this plan:** one GPU job and one design-partner test answer the two
questions everything else waits on. The GPU job says whether the brain signal
predicts ad outcomes at real n. The partner test produces the first outside-in
number anyone has ever generated about Soma. Both start this week; everything else
sequences behind them.

---

## Where we actually are (audited, not remembered)

- **The correlational layer — the thing we tell investors is the moat — does not
  exist.** No head has ever been fit to an ad-performance label. The one
  brain→performance test we ran returned null: `validation/ad_backtest.json`,
  partial r = −0.128, permutation p = 0.548, n = 29.
- **The corpus is ready and the features are not.** 1,359 labeled ads on disk
  (1,325 usable, 174 real failures, 395 in within-advertiser pairs, detectable
  |r| ≥ 0.08). Only **29** have TRIBE arcs. The null above was measured on those 29.
- **The head that had signal is missing from the tree.** `validation/head_attn.json`
  (median r = 0.20, Stouffer p = 2.7e-4 on TVSum n=15) was deleted in `c8887f3` and
  is still referenced by `ad_backtest.py:45`, `head_apply.py:17`, and the locked
  pre-registration.
- **The shipped scorer uses hand-picked constants, not a learned head**
  (`demo/process_batch.py:80`), and every score is a percentile inside a batch of
  five — so each component can only be 10/30/50/70/90.
- **A customer can do exactly one thing end to end:** `/upload` → `/r/<token>`, with
  no account, in 20–40 min, if a human has provisioned the box, accepted the gated
  licence, and applied migrations 0003–0006 by hand.
- **The encoder cannot be sold.** TRIBE v2 weights *and code* are CC BY-NC 4.0, and
  there is no named fallback backbone anywhere in the repo — only a `[FILL: …]`.

---

## Three tracks, different bottlenecks, run in parallel

| Track | Bottleneck | Owner shape |
|---|---|---|
| **A · Science** — does the signal predict outcomes? | GPU hours | one person + a rented box |
| **B · Product** — can a stranger use this, and does it remember them? | engineering | one person |
| **C · Narrative** — is the story true, and is it the story Shawn told us to tell? | founder time + conversations | GTM owner |

They are genuinely parallel. Track A is mostly waiting on a machine. Do not let it
serialize behind Track B.

---

## Phase 0 — This week (Jul 30 – Aug 5): stop the bleeding

Five small things. None takes more than a day. All of them are currently costing us
credibility or money.

**0.1 — Restore the deleted head.** One command:
`git show 1cada56:validation/head_attn.json > validation/head_attn.json`
Without it `ad_backtest.py --score head` and `head_apply.py` both fail on a fresh
checkout, and the pre-registration cites an artifact that isn't there. Also restore or
rewrite `head_incremental.py` and the `Makefile`, both deleted in the same commit and
both cited in `PREREGISTRATION-addendum.md:83` as the reproduction path.

**0.2 — Fix the edit-preview block on customer reports.**
`src/app/api/batches/[token]/edit-preview/route.ts` shells out to Python via
`runEditSearch`, and `ResultReport.tsx:245` fetches it on every `/r/<token>` render.
There is no Python on Vercel. **Every real customer report currently renders an error
block**, with links below it to an `/edit` form whose submit 404s. Either move the
preview behind the same beta gate as `/generate` and `/edit` and hide Block 05 when
it's closed, or precompute the edit candidates on the scorer box during the batch run
and store them in the report JSON. The second is better — it's the same estimator,
it runs where Python already lives, and it makes the block real instead of hidden.

**0.3 — Fix the design-partner contradiction.** The site says one thing and the deck
says the opposite, and Shawn is specifically asking for outside-in proof:
- `DemoScrollPage.tsx:807` — "500 Ads in the live database — **from our design
  partners**" (the corpus is scraped TikTok Creative Center, and the real count is 700)
- `DemoScrollPage.tsx:1145` — a marquee headed "**Already running ads through the
  beta**" with TikTok, Browserbase, Supercell, MrBeast, NextXI logos, backed by no
  artifact in the repo
- `DemoScrollPage.tsx:809` — "92% Prediction accuracy up from a 75% baseline," which
  `YC-APPLICATION.md:26` traces to *VidCognition's* marketing number
- against `PitchDeck.tsx:339` and `YC-APPLICATION.md:33`: "pre-design-partner,
  waitlist only"

Two real design partners who've shared real ad data is a good story at this stage.
Tell that one. Replace the logo wall with the two partners (named with permission, or
"a DTC supplement brand" / "a 12-person performance agency"), and either source the
92% to a Soma artifact or delete it.

**0.4 — Turn clarity back on.** Every ad in the shipped report has `clarity: 50.0`,
`asrBackend: "none"`, `ocrBackend: "none"` — 25% of the preflight score carrying zero
information. Install faster-whisper and tesseract on the scorer box; it is a
provisioning line, not a project.

**0.5 — Ship the stale-claim reaper and the intake email.** The two items
`tools/concierge/README.md:202` already names. A hard kill strands a batch on
`processing` forever and the customer's page says "we're working on it" indefinitely.
A `started_at` age check that returns old claims to `queued` is an afternoon.

---

## Phase 1 — Weeks 1–3 (Aug 3 – Aug 21): the two experiments that decide everything

### 1A · The verdict run (Track A, starts immediately, GPU-bound)

Extract TRIBE features for the ~1,330 labeled corpus ads that don't have them, then
re-run the pre-registered backtest at real n.

- **Cost:** ~2.5 min/ad ⇒ roughly 55 GPU-hours ⇒ 2–3 days on one box.
- **Do not run it on the concierge box.** That machine serves customer batches; a
  55-hour job will collide with a live run. Rent a second box for the corpus sweep.
  `tools/concierge/provision.sh` stands one up in a command.
- **Then:** `ad_backtest.py --score head`, primary = mean of the per-ad neural series,
  partialled against `[loudness, cuts, luminance, motion, duration]`, 20k permutations,
  pre-registered floor |r| ≥ 0.10 AND p < 0.05.
- **The floor moved — check it.** The newest baseline run
  (`validation/baseline_predicts_meta.csv`, 2026-07-29) has dumb ffmpeg features
  reaching |rho| = 0.115 at p = 0.002 on meta n=652. Beating zero is no longer the bar;
  beating that is.
- **Analyze the within-advertiser pairs separately.** 395 ads sit in same-advertiser
  pairs, which is the comparison `meta_ads.py` says to trust — it controls for brand,
  budget and audience in a way the cross-advertiser correlation cannot.

**This run is not only a science result.** It also produces a population of ~1,300
scored ads, which is the thing that kills the percentile-within-batch-of-5 problem.
Once it exists, a customer's ad can be scored against a real distribution instead of
against four other cuts. That is a product unlock and a "store of value" claim, and it
falls out of the same GPU spend.

**Pre-commit the branch now, before seeing the result** — this repo has a
pre-registration culture and we should not break it under commercial pressure:

- **If it clears the floor:** that is the moat claim, made real. It goes on the deck
  with the n, the p, the partial-r and the baseline it beat. Rung 2 opens.
- **If it is null but the confidence interval is tight:** report "we can rule out an
  effect larger than X." That is still a publishable, defensible finding, and it means
  the product's value is diagnostic (*where* attention drops) rather than predictive
  (*which ad wins*) — which is what `/preflight` actually sells today anyway.
- **If it is null and wide:** the corpus is still underpowered, and the answer is the
  cheapest fix in the repo — `DATASHEET.md` notes 2,551 skipped TikTok ads whose ids
  and metrics are already recorded, and they are the low-CTR tail the corpus lacks.
  Re-fetching them is a scrape against a known id list, not a discovery problem.

In all three branches, **the pitch stops saying "predict subcortical responses."**
Nothing in this repo touches subcortex; NAcc, amygdala and hippocampus are all off
TRIBE's cortical surface, and `ROADMAP.md` correctly puts that work at Rung 4, months
24–48. A correlational layer from cortical output to sales outcomes is a *performance
model*, not a subcortical prediction. Say the true thing — it is still a good thing.

### 1B · The blind retrospective test (Track C, one week, no new infrastructure)

**This is the fastest path to Shawn's "money shot," and it needs nothing we don't
already have.** For each design partner:

1. They send 15–25 ads they have already run, with performance **withheld**.
2. We score and rank them blind, and commit the ranking in writing before any reveal.
3. They reveal the outcomes.
4. We report the rank correlation, the top-quintile hit rate, and — critically —
   whether we beat the ffmpeg baseline on their data.

One week per partner, both in parallel. The output is external, outside-in, and
falsifiable, which is exactly the property Shawn said makes VCs lean in. It is also
worth far more than a prospective test right now because it needs no waiting for a
campaign to run.

Publish the result either way. If we beat baseline on a partner's real spend, that is
the ROI slide. If we don't, we learn it in a week from a friendly counterparty instead
of in month six from a paying one.

### 1C · The outcome loop, v0 (Track B)

Do **not** build Meta OAuth yet. With two design partners and a concierge process,
v0 is:

- a migration adding an `outcomes` table keyed to `batches` and to individual ads
  (spend, impressions, clicks, CTR, ThruPlay, CPA, window start/end, source)
- a `tools/concierge/ingest_outcomes.py` that takes the CSV a partner emails us and
  writes those rows
- a stable customer identity so a second batch from the same brand joins the first —
  minimally an `accounts` table with an id on `batches`, not a full auth system yet

That is the schema the flywheel needs, built in days rather than weeks, and it makes
the ROI slide's data collectible starting now. Automate the pull later, once there are
more partners than a human can chase.

---

## Phase 2 — Weeks 3–6 (Aug 17 – Sep 6): platform, not middleware

### 2A · The platform layer (Track B)

Shawn's structural point is that agency-by-agency selling gets to $10M and stops. The
mechanism that changes that is the accumulating data asset. Here is the build order:

1. **Accounts and real multi-tenancy.** Replace capability-URL-only access
   (`/r/<token>`, `/g/<token>`, `/e/<token>`) with actual sessions. Today two
   customers' batches sit in the same table with no boundary except token
   unguessability, and RLS has no anon policies at all — every read is service_role.
   Keep the share tokens for sending a report to a colleague; stop using them *as* the
   auth system.
2. **Cross-batch persistence and a house baseline.** With the Phase-1 population in
   place, score against a real distribution. Per-brand baselines are the first thing
   `ServiceTiers.tsx` sells that would actually exist.
3. **The library.** Every scored ad plus every ingested outcome, queryable across
   customers with the obvious contractual care. This is the "system of record, store of
   value" artifact — say the phrase in the deck only once this table has rows in it.
4. **Make the betas reachable.** `/generate` and `/edit` are real code that no customer
   can run: the browser clients never send `x-soma-beta`
   (`EditBeta.tsx:76`, `GenerateBeta.tsx:44`), the routes need Python and ffmpeg on the
   request host, and generation hard-codes `provider: "stub"` — a slate card, not a
   video. Either wire the Veo provider and route these to the long-lived box, or pull
   them from the nav and stop implying they exist.
5. **Self-serve `/upload`.** Drop the `robots: index:false` once intake email, reaper,
   and accounts are in. Until then it stays sold-in-a-conversation, which is correct.

### 2B · Metric and vocabulary alignment (Track B, small but blocking the deck)

- **Cut brand recall and retention drop-off from the pitch.** Brand recall does not
  exist in code (the nearest thing is an OCR keyword match worth 7.5% of the
  composite), retention was tested and came back null
  (`retention_head_roi.json`: n=38, median r = 0.029, `"signal": false`), and both
  substrates are subcortical and out of TRIBE's reach. `OPPORTUNITIES.md:167` already
  calls brand-recall claims "the most dangerous overclaim in the set." We publish that
  null on `/demo` — we cannot also sell the metric.
- **One vocabulary, one scale.** The two scorers disagree: `/demo` emits
  hook/hold/comprehension, `/preflight` emits hook/processing/clarity, and
  "comprehension" labels a different brain region in each. Nothing anywhere is on the
  1–5 scale the pitch promises; everything is /100, 0–1, or a within-batch percentile.
  Pick the customer-facing names and the customer-facing scale once, make both scorers
  emit them, and extend `check_coherence.py` to guard it.
- Fix `DemoScrollPage.tsx:491` ("about 45% of the total") against the real
  `WEIGHTS["hook"] = 0.40`.

### 2C · The deck rebuild (Track C)

Against Shawn's checklist, the current deck has the ask and the team, and is missing
everything else. Rebuild in this order:

| Slide | Status now | What it needs |
|---|---|---|
| Problem | adjectives only — "billions", "thousands per study", "dozens a week", uncited; no TAM anywhere in `docs/` | a sourced number for creative-testing waste, and the cost of one failed campaign at a partner's real scale |
| Validation | **absent** — only Meta's Algonauts benchmark and a public dataset | Phase 1B blind retrospective, per partner, with the ranking committed before reveal |
| ROI | **absent** — "pays for itself" is asserted, never computed | performance delta on partner spend, from 1B and the outcome loop |
| Funnel | **absent** — the tally `WEEK-PLAN.md:53` asked for was never produced | Shawn's number: 50–100 agency/publisher contacts, with calls held, converted, and in pipeline |
| Ask | present but **expired** — reads "$500K · YC Fall 2026 · deadline Mon Jul 27" | round size, instrument, runway, milestones with dollars against them |
| Team | present; debate covered, neuro thin, **GTM missing** | `YC-APPLICATION.md:69` names Aarya as the commercial/GTM founder — the slide tags all three as technical. Name the neuroscience advisor or drop "in progress" |
| Positioning | **argues the opposite of the advice** | see below |

On positioning: the deck currently says "we don't reinvent the brain; **we build the
last mile on top of it**" (`:72`), "the **inference layer on top**" (`:214`), priced
"per-seat / per-video SaaS" (`:242`). That is middleware framing in Shawn's exact
terms. Meanwhile the *site* already tells the full-stack story the deck doesn't —
Measure / Generate / Edit (`DemoScrollPage.tsx:1046`) and a four-rung service ladder
ending at "a read-out head trained on your outcome data" (`ServiceTiers.tsx:58`).
Move that onto the slides. "System of record, store of value" goes in only when 2A.3
has rows.

### 2D · Go-to-market volume (Track C, starts week 1, runs continuously)

Shawn's number is 50–100 agency and publisher contacts. That is not a build, it is a
calendar. Start it in week 1 so the funnel slide has real numbers by the time the
deck is rebuilt. Track leads → conversations → design-partner candidates in one
place, and produce the tally `WEEK-PLAN.md:53` asked for and never got.

---

## Phase 3 — Weeks 6–12 (Sep – Oct): the flywheel and the licence

### 3A · Resolve the licence, because it gates every dollar

`STRATEGY-PROPRIETARY-MODEL.md:80` is blunt: TRIBE v2 weights and code are
CC BY-NC 4.0, they "can power research, validation, and the demo, but **not the
paid/revenue pipeline**," and Meta publishes no commercial-licensing path. The Llama
3.2 text branch adds a second set of terms underneath that. Wav2Vec2-BERT and V-JEPA 2
licences are undocumented in this repo entirely.

Three things, in order:

1. **Name the fallback backbone.** `YC-APPLICATION.md:473` is still a literal
   `[FILL: …]`. A VC will ask, and "we'd swap the encoder" without a named candidate
   and a cost is not an answer. Scope it: which permissively-licensed video/multimodal
   backbone, what it costs to re-fit the read-out head onto it, how long.
2. **Send the Meta ask in writing anyway** and log the outcome. It may be declined;
   that is fine. What is not fine is presenting it as a route that already exists.
3. **Disclose it publicly.** The licence string currently renders only on the
   token-gated result page (`ResultReport.tsx:422`). `/demo`, `/preflight`, `/science`
   and `/pitch` say nothing, and `public/demo/report.json` has no licence field at all.
   `YC-APPLICATION.md:646` still has this as an unchecked box. Disclosing a constraint
   we have a plan for reads as rigor; having it found in diligence reads as concealment.

The portability argument is sound and should be said out loud: **the read-out head and
the outcome data transfer across encoders.** The moat we are building is not the
encoder, which is exactly why the licence is survivable.

### 3B · Roadmap items that now have prerequisites met

- ~~**Resolve which TRIBE we serve.**~~ Done 2026-07-30 — see `ROADMAP.md`. Also
  shipped `check_preds_space.py`, the space-detection script six error messages had
  been pointing at for weeks without it ever having been committed.
- **`run_full.py`.** `INFERENCE-PIPELINE.md:96` — no single command spans extract →
  reduce → heads → validate → publish; GPU extract and CPU analysis are joined by
  copying files off the box by hand. `affect_extract`, `coarse_states` and
  `message_extract` are orphaned from orchestration entirely.
- **Rung 1 (2D affect)** stays on the roadmap and off the deck until it clears its own
  pre-registered test.

### 3C · Incorporate

Pre-incorporation while taking real ad data from partners is the wrong side of a line.
Entity, then a DPA with each partner covering what we may do with their creative and
their outcome data — which matters a great deal given that 2A.3 turns it into a
cross-customer asset.

---

## The gates

Do not skip past these; each one changes the plan behind it.

1. ~~**TRIBE variant resolved** — before the 55-hour extraction.~~ **CLEARED
   2026-07-30.** The ROADMAP warning was stale: we serve fsaverage5 surface (20484,
   `[lh; rh]`), every prediction array and mask in the repo agrees, and a medial-wall
   alignment test on existing data confirms the vertex order. Extraction is unblocked.
2. **Backtest verdict at n≈1,300** — decides whether the pitch is "predicts winners"
   or "diagnoses attention." Branch pre-committed in 1A.
3. **First blind retrospective result** — decides whether we have an ROI slide or a
   research slide.
4. **Named fallback backbone with a cost** — before quoting anyone a price.
5. **Outcome table with rows in it** — before saying "system of record, store of
   value" to an investor.

---

## What we are deliberately not doing

- **Subcortical prediction.** Rung 4, months 24–48. Remove it from the verbal pitch now.
- **Building our own encoder from scratch.** `STRATEGY-PROPRIETARY-MODEL.md:32` costs
  it at $0.6M to tens of millions in scanner time. The fallback in 3A.1 is a swap onto
  an existing permissive backbone, which is a different and much smaller project.
- **Campaign management / ad serving is now the destination.** The prior "three products
  away" deferral is reversed. Staged path:
  `docs/strategy/BUILD-PLAN-FULL-SERVICE.md` (S0→S6). Analysis-only remains a supported
  entry.
- **Self-serve before the concierge path is boring.** Two partners and a human in the
  loop is the correct amount of manual for this stage. Automate the parts that have
  already broken twice, not the parts we imagine breaking.
