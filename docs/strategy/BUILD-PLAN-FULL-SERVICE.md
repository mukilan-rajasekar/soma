# BUILD PLAN — Analyze / Improve / Serve

Written 2026-08-06. **Living product engineering plan** for turning the ANALYZE-only
concierge product into analyze → improve → serve. Agent / human “what to build next”
for product work starts here (see also `docs/INDEX.md`).

Companion strategy: `STRATEGY-FULL-SERVICE.md`. Access checklist: `SERVE-ACCESS.md`.
Revenue / weekly pricing: `BUILD-PLAN-REVENUE.md`. Science / GTM Tracks A and C remain
sequenced in `PLAN.md` (2026-07-30); this file owns Serve staging and schema.

**What this document is.** A build order with real file paths, real table shapes, and a
verification step per stage that fits the existing gate (`scripts/verify.sh`). It
sequences by dependency, and it puts the things that consume calendar rather than
engineering hours at the front.

**What this document is not.** It is not a schedule. Where I give durations they are
estimates and are labelled as such. It contains no customer count, no accuracy figure,
no TAM, and no benchmark that does not already exist as a committed artifact in this
repo. Where the plan needs a number that does not exist, it says so and marks it
`[NEEDS EVIDENCE]`.

Three labels are used and they mean different things. A figure with no label is arithmetic
over committed bytes and is checkable. `[ESTIMATE]` is a figure derived from cited committed
figures — the derivation is shown, so it is checkable too, and it is not the same failure
mode as an invented round number. `[ESTIMATE, UNCOMMITTED]` is a number someone measured
locally with no artifact behind it: those are quarantined here and may not be quoted on any
outward surface until a script writes them into `validation/`.

**Where the lane figures come from.** Every vertex count, lane correlation, visual-drive
r and autocorrelation figure in this document is quoted from
`validation/lane_stats.json`, written by `tools/readout/lane_stats.py --write` and
re-checkable with `--check`. That artifact folds **19 non-ad stimuli** in `data/arcs/`
(15 short web clips at T = 99–121 s, 4 COGNIMUSE features at T = 1,598–1,878 s; 8,881
timepoints at TR = 1.0 s). **No ad is in that set.** The same fold over the 29 scored ads
gives materially different numbers and is *not* a committed artifact, so nothing here
quotes the committed figures as if they described ads. See §2.4.

**It once contradicted PLAN.md.** An earlier PLAN listed “Campaign management / ad serving”
under *What we are deliberately not doing*. PLAN.md now points here as the destination;
keep both documents in sync if that bullet moves again.

---

## The product this plan builds

Founder-supplied, 2026-08-06, and authoritative on *what the product is*. It arrived after
the first drafting pass, so this section is the point where it enters the build order.
Nothing in it is evidence about what exists; the "today" column below is.

**The canonical offering statement.** Every surface's one-liner derives from this:

> A platform that helps advertisers analyze creative, improve it, distribute it, and learn
> from performance — without piecing together separate scoring, editing, and ad-serving
> tools.

**Analysis-only is a supported entry point, not a downgrade.** A customer may use the
analysis layer alone. That is the near-term commercial reality — it is the only layer that
runs end to end today — and the A-to-Z workflow is the longer-term product. Any surface
describing the three layers must make the analysis-only path legible, because for the whole
of Stages 0–3 it is the only path that exists. This has a build consequence and not only a
copy one: nothing in Stages 2 and 3 may be designed so that it requires a connected ad
account to render.

**Serve, defined.** Instead of handing a customer an attention score and telling them to buy
media on Meta themselves, Soma manages distribution across channels — Meta, TikTok, Google.
The intended loop in the founder's order, against the stage that builds each step and what
exists in the tree today:

| # | Loop step | Stage | In the repo today |
|---|---|---|---|
| 1 | Customer uploads an existing ad or ad concept | — | **Yes.** `/upload` → `/r/<token>` is the one thing that runs end to end (`docs/strategy/PLAN.md:30-32`), given a provisioned box. |
| 2 | Soma analyzes attention and identifies weak moments | 2 | **Partly.** Four network lanes ship (`process_batch.py:1414`, `:1517-1521`) and weak spots ship (`WEAK_N_STD, WEAK_MIN_LEN = 1.25, 3`, `:87`). The per-network read-out, the window finder and the window→sentence layer are Stage 2. |
| 3 | Soma suggests or applies small improvements — stronger hook, cuts, audio changes | 3 | **Partly, and one third of it does not exist.** Real ffmpeg renders and a bounded edit space exist; `enumerate_candidates()` (`tools/edit/ops.py:164`) emits exactly four kinds — `remove`, `remove_pair`, `hoist`, `trim_head`. **There is no audio operation of any kind.** "Audio changes" is `[NEEDS BUILD]` and is not in this plan's scope; do not put it on a surface. Candidate choice is also still blind (`choose_candidates()`, `scripts/ingest_partner_ad.py:242`) until §3.1. |
| 4 | Customer chooses a budget and a campaign goal | 5 | **No.** Zero lines. `spend_guards` is §5.2. |
| 5 | Soma places and tests the ad across platforms | 5 | **No.** Zero lines. Meta first; `tools/serve/tiktok_client.py` is deferred behind the first Meta client having served one ad (§4.0), and Google is not in this plan at all. |
| 6 | Soma collects performance data and feeds it back, so future scoring and recommendations improve | 4 + 6 | **No.** No column in eight migrations stores an impression, click, CTR, spend or ROAS. |

**Step 6 is the mechanism, never the result.** It is how the predicted-response →
commercial-outcome link would be *earned*. It is not a description of a link that exists:
three committed tests of exactly that link, all at n = 29 on proxy labels, all came back
null (§0, "Zero"). Written as a reason to build the loop it is the strongest argument in
this document. Written as a capability it is false, and the repo refutes it in one `cat`.

**The customer flow, before and after — with the build cost of each "after" line.**

| Before Soma | With Soma | What makes the right column true |
|---|---|---|
| Makes an ad internally | Uploads the creative | Ships today |
| Sends it to a platform and spends money to find out whether it works | Receives an attention analysis and an overall score | Ships today. **"Heatmap" does not** — see §0.7; there is no such artifact in the tree |
| Receives platform analytics, less directly actionable for improving the creative | Sees the specific parts of the video that should be changed | Weak spots ship; naming the *network* and the *window* with a badge is Stage 2 |
| Iteration is fragmented: edit, relaunch, wait, repeat | Uses the improvement layer for basic fixes — cuts and hooks | Stage 3. Cuts and hooks only; audio is `[NEEDS BUILD]`. More substantial generation is optional and explicitly not the wedge |
| — | Launches through Soma across ad channels | Stage 5, Meta only, behind App Review and Full tier |
| — | Monitors results in one dashboard | Stage 4 §4.5 |
| — | Keeps updating the ad from live performance feedback | Stage 6 §6.4 (`propose_next.py`) |

The asset those two tables are sold with is the before/after demo, and building it is an
engineering task with its own constraints — §0.7.

---

## 0 · The current-state boundary

Blunt version, three columns.

### Exists and works

- **A real Next.js 16 + Supabase app.** Auth, RLS, private storage, share links,
  dashboard library, per-video read-out, read-only edit workbench. 23 `page.tsx`,
  14 `route.ts` under `src/app/api`.
- **A serious offline scoring pipeline.** `demo/process_batch.py` (1,778 lines) runs
  TRIBE v2 over stimulus-built video, caches `(T, 20484)` float32 predictions per ad
  (`run_tribe`, `process_batch.py:509`; the write is `:553`), masks them with
  Schaefer-2018 400Parcels/7Networks on fsaverage5 (`:1467-1473`), and emits a batch
  report.
- **Four per-second network lanes already ship.** `--lanes` defaults to `"all"`
  (`process_batch.py:1414`); the loop builds `salventattn`, `higher_order` and `visual`
  arcs alongside the `--arc-roi` primary (`:1517-1521`) and writes them under `lanes`
  (`:1643`). `public/preflight/batch_report.json` has them today.
- **Real re-cuts with real ffmpeg renders**, persisted as rows in `edit_cuts`
  (migration `0008_accounts.sql:136`), each carrying a `measured` boolean that only the
  verify stage may set true.
- **A gate that means something.** `scripts/verify.sh` runs `next build`, whole-repo
  `eslint`, pytest (271 tests pass), three artifact-coherence checks
  (`tools/demo/check_coherence.py`, `scripts/check-shot-cells.mts`,
  `tools/capture/summarize.py --check`) and a Playwright smoke suite.
- **A publish gate that can kill a run.** `tools/concierge/run_batch.py` stage 6 fails
  the batch to `failed` if the predictions look bounded `[0,1]` or if content-minus-black
  does not drive occipital cortex.
- **A corpus that is one GPU run away from answering the only question that matters.**
  `data/ads/` holds 1,359 ad videos and 1,359 baseline extractions. 704 of them are
  TikTok ads carrying `ctr_index` — a **relative click-through index in [0,1]**, 97
  distinct values on a 0.01 grid, in `data/ads/ad_manifest.csv`. It is **not a raw click
  rate**, and the repo's own scraper says so in capitals: "ctr — performance index in
  [0,1] (NOT a raw click rate)" (`ad_performance.py:14-17`). See Stage 1 — this is the
  plan's first substantive engineering item, everything downstream is contingent on it,
  and §1.1 states exactly what that label is and is not before anyone quotes it.

### Partial

- **The diagnostic.** Four lanes ship; 51.0% of the cortical surface (SomMot 3,626
  vertices, the 3,114 of Default the `higher_order` mixture does not take, Limbic 1,383,
  the 586 of Cont it does not take, plus 1,743 medial-wall) is computed and never read.
  All 400-parcel spatial resolution is discarded. The union of the four shipped ROIs is
  10,032 / 20,484 vertices = **48.97%**, and the four are pairwise disjoint, so the union
  is the exact sum (`validation/lane_stats.json`, `shipped_lanes`).
- **IMPROVE.** Shot detection, a bounded edit space (`tools/edit/ops.py`), real renders,
  and a `measured` flag exist. Re-scoring exists **only** inside
  `scripts/ingest_partner_ad.py`, as a side effect of scoring original + K re-cuts as
  one batch. The candidates are chosen by `choose_candidates()`
  (`ingest_partner_ad.py:242`) — a deterministic even spread of single-shot removals
  plus a 1.0 s head trim, picked **without an arc**. The file says so itself: "this
  cannot be a search result and does not pretend to be one."
- **Compute on request.** Nothing. Every compute-bearing route is default-closed
  (`src/lib/edit-capability.ts:29-32`, `src/lib/beta-gate.ts:97-100`), and the browser
  clients never send the header the gate needs (`EditBeta.tsx:74-77`,
  `GenerateBeta.tsx:44-47`), so `/edit` and `/generate` are unreachable in production by
  construction. `src/lib/edit-runner.ts:28` disables `--verify` by default because it
  re-enters `process_batch.py` (~4 min) against a 3-minute exec timeout
  (`edit-runner.ts:96`).
- **Identity.** `0008_accounts.sql` added a nullable `user_id` on the run tables and
  SELECT-only RLS. There is no brand/account entity above the user, so a second batch
  from the same company does not join the first — and no membership entity at all, so
  "an advertiser is a company with several people" is currently unrepresentable.

### Zero

- **SERVE.** No code anywhere creates, manages or reads a campaign, ad set, ad account,
  placement or spend on Meta, TikTok or Google. The only platform code is read-only
  corpus scraping: `ad_fetch_bb.py:809` hits the public Ad Library `ads_archive` with
  `ads_read` scope only; `ad_advertisers.py:46` and `ad_performance.py:68` hit TikTok's
  public Top Ads listing. **Both of those last two are at the repository root, not under
  `tools/corpus/`** — that directory exists and contains `audit.py`,
  `baseline_predicts.py`, `bundle.py`, `clean.py`, `meta_ads.py`, `probe.py`.
- **Outcomes.** Seven tables across eight migrations: `waitlist`, `arcs`, `uploads`,
  `batches`, `generation_runs`, `edit_runs`, `edit_cuts`. No column anywhere stores
  impressions, clicks, CTR, CVR, spend or ROAS. `docs/strategy/PLAN.md:170-183` specs the
  v0 `outcomes` table and the `tools/concierge/ingest_outcomes.py` that writes it; neither
  was built.
- **OAuth of any kind to an ad platform.** No token storage, no refresh handling, no
  system users.
- **Validation of the four ROIs the product ships.** Grepping `validation/` for
  `dorsattn`, `salventattn`, `higher_order` or `Schaefer` returns no *result* artifact
  (`validation/lane_stats.json` describes lane geometry and coupling; it is explicitly
  not an outcome test — see its `notes.scope`). The one pre-registered ROI test (DMN)
  returned null. **Three** tests of predicted response against ad outcome have run, all at
  n = 29, all on proxy labels, and all three came back null:
  1. the **learned head** — `validation/ad_backtest.json` and
     `validation/recheck/B-ads-temporal/ad_backtest_head.{json,log}`: partial r = −0.128,
     permutation p = 0.548, top-1 hit rate 0.0;
  2. the **arithmetic arc** — `ad_backtest_arc.{json,log}`: partial r = +0.123,
     permutation p = 0.559;
  3. the **temporal features** — `validation/temporal_readout.json`: six features
     (`hook_decay`, `hook_slope`, `decay_tau`, `surprise_rate`, `rise_fall_asym`, `tvar`),
     nothing survives Holm correction (smallest `holm_p` = 0.327, on `hook_decay`).

  All three carry `"signal": false`. Count them as three everywhere; the packet has
  previously said one and two, and the strongest asset this company has is that it
  reports its own nulls accurately.
- **Shot *content*.** There is no face detection, no shot-content labelling and no
  "product card" concept anywhere in the tree, and OCR/ASR are off in the only shipped
  report (`public/preflight/batch_report.json` has `asrBackend: "none"`, `ocrBackend:
  "none"` — the strings, on all five ads in that report, not JSON nulls). Shot *indices
  and boundaries* do exist (`build_report.py:384`, ffmpeg scene
  threshold 0.28). Anything a sentence says about **what is on** a shot is
  `[NEEDS BUILD]`, and §2.5 enforces that.

### One defect to fix before anything region-named ships

`tools/demo/build_report.py:13-16` describes `data/roi_mask_arousal.npy` as
"(Yeo SalVentAttn: anterior insula + ACC)". It is not that mask. It is a **Destrieux
anatomical** mask built by `build_roi_mask.py:83-89`, and its Dice overlap with the real
Schaefer SalVentAttn is **0.207** — 43% of its 831 vertices land in Schaefer's Default
network versus 40% in SalVentAttn. `roi_mask_dan.npy` vs Schaefer DorsAttn is Dice 0.509,
with 30% of it in SomMot. (All Dice figures: `validation/lane_stats.json`,
`legacy_roi_masks`.)

Worse in the same table: `roi_mask_memory.npy`'s largest overlap with any Yeo-7 network is
**visual cortex** (Dice 0.242), ahead of Limbic (0.191) and Default (0.158). Any claim
built on a "memory-encoding" lane is currently a claim about occipital cortex.

So `/demo` and `/preflight` currently both render a lane called "Surprise"/"Salience" and
they are **different regions with the same customer-facing name**. Shipping a region-level
diagnostic on top of that is shipping a labelled contradiction. This is Stage 2, task 1.

---

## Stage ordering, and why

Three things gate everything and only one of them is engineering.

1. **Meta App Review and Business Verification.** Meta publishes no SLA. Advanced
   (now "Full") access to `ads_management` for accounts you do not own requires review,
   and Full Marketing API Access Tier requires ≥500 calls in 15 days with <15% error rate.
   This is calendar time. It starts on day one or it is the last thing that finishes.
2. **A written answer from Meta on Developer Policy 10.7.** 10.7b: "Only use data from an
   end-advertiser's campaign to optimize or measure the performance of that
   end-advertiser's Meta campaign." 10.7d: "Don't mix data obtained from us with
   advertising campaigns on different platforms." 10.7g: keep each advertiser's data
   separate. As literally written that restricts the pooled cross-client training set that
   is the stated reason serving is valuable. It is cheap to ask and expensive to discover
   in month six. `[NEEDS EVIDENCE — no answer exists. 10.7 contains **no written-approval
   clause**; its only qualifier is "unless the terms for that product allow it explicitly"
   (10.7a, 10.7d), and 10.7a's exception permits aggregate-and-anonymous use "only to
   assess the performance and effectiveness of the end advertiser's campaigns", which on
   its face does not reach pooled cross-client model training. The "as otherwise approved
   by Meta in writing" language is in **10.5**, which governs ad-account combination, not
   data use — do not build a mitigation on it. No published route from 10.7 to a pooled
   corpus has been identified.]`
3. **F1 — does anyone actually want this.** Five prospects granting partner access to a
   real ad account. Not signatures, not interest: a granted `ANALYZE` task on
   `act_<ID>/assigned_users`. This is a sales gate, it costs no engineering, and until it
   clears there is no reason to write a serving schema.

And one that is engineering, and is the point of the whole document:

4. **F2 — the decisive experiment.** Score the 704 TikTok ads that carry `ctr_index` —
   673 after the repo's own long-form and silent exclusions (§1.2) — and re-run the
   committed backtest. That is Stage 1. It is the experiment that decides whether Stages
   3–6 are worth building at all, it needs nobody's permission, and the inputs are already
   on disk.

```
S0  access + licence + F1 sales gate  ──────────────────────►  (calendar, parallel)
S1  F2: the decisive experiment (~673 TikTok ads vs ctr_index)  ►  BRANCH POINT
S2      diagnostic layer (no external dependency; starts day one alongside S0/S1)  ──►
S3                        improve loop (needs S2's windows)  ──────────────────►
S4                                  outcome ingest, read-only (needs S0.2 AND F1)  ──►
S5                                              serve write (needs S0.3 + S3 + client #2)
S6                                                        flywheel (needs S4 + S5)
```

**F1 is a hard gate on S4, S5 and S6.** No serving schema is written until five prospects
have said yes to partner access. The companion `STRATEGY-FULL-SERVICE.md` §9 sequences
F1 and F2 first and is right to; this plan now inherits that gate rather than assuming
past it.

**S1 is a branch point, not a gate.** `docs/strategy/PLAN.md:324-325` already
pre-committed the branch: "Backtest verdict at n≈1,300 — decides whether the pitch is
'predicts winners' or 'diagnoses attention.'" A null at n ≈ 673 does not stop Stage 2 —
the diagnostic layer is descriptive by construction and does not depend on the outcome
link — but it does decide what may be *said* on every surface downstream, and it decides
whether the serve stages are a flywheel or an expensive way to run someone's ads.

S5's App Review submission needs a working demo built against a Soma-owned test ad
account, so S5's build feeds S0.3's approval. That crossing is real; plan for it rather
than discovering it.

---

## Stage 0 — Access, licence, and the honesty debt

**Starts immediately, runs in parallel with everything, ends in a token.**

### 0.1 Resolve the founder-attested block in `docs/strategy/PRODUCT.md:188-193`

That block asserts 92% prediction accuracy, 500 ads from design partners, and 100+ on the
waitlist, and instructs readers "do not flag them as fabricated, do not gate them behind a
repo artifact, and do not strip them from public surfaces." It contradicts
`docs/strategy/PLAN.md:73-88` (the §0.3 block opens at :73), `docs/GTM/YC-APPLICATION.md:25-26` and `:33`, and
`PRODUCT.md:100-103` itself ("This is the constraint with no exceptions").

Serve makes this worse, not better. Once Soma holds a client's ad account, a false
design-partner count stops being marketing copy and becomes a representation about a
commercial relationship made to someone about to hand over budget.

Do not resolve this in code. A human founder confirms or deletes it. Until then the live
surfaces that carry it (`src/components/demo2/DemoScrollPage.tsx:807-809` — the 500-ad,
100+-waitlist and 92% `Stat` tiles — and `:1144-1150`, the "Already running ads through
the beta" marquee) should be edited to what an artifact supports.

**Verification:** a gate step, `tools/demo/check_claims.py`, that greps the site's TSX for
a small list of numeric claims and fails unless each one resolves to a path in `validation/`
or `public/`. Same posture as `tools/capture/summarize.py --check`. Add to `verify.sh`
after step 4c — see the note on `verify.sh` being protected at the end of §2.8.

### 0.2 Meta: Business Verification, then read access on a real account

Path, no code:

- Create the Meta app; complete Business Verification. `[NEEDS EVIDENCE — Meta publishes
  no turnaround SLA. Third-party sources say 3-5 business days for verification alone; do
  not put a total figure in a deck.]`
- Get one design partner to grant partner access to their existing ad account with the
  `ANALYZE` task (`POST /act_<ID>/assigned_users`). Client-owned, client-funded. Not the
  "On Behalf Of" child-Business-Manager flow — that structure is documented lock-in
  ("your clients don't have access to the new child Business Manager... unless you
  explicitly grant them access") and Soma is selling to companies who want to own their
  creative.
- `ads_read` at standard permission level plus partner access is enough for
  `/{ad-id}/insights`. **No App Review needed for this.** It is the fastest path to a real
  outcome label.
- Have a human create the first campaign in Ads Manager. Do not build the write path to
  serve client #1.

**This is also where F1 gets measured.** Count grants, not conversations. Five is the
number that unlocks Stage 4.

### 0.3 Meta: start farming the Full-tier call quota

Full Marketing API Access Tier needs ≥500 calls in the trailing 15 days with <15% error
rate over the last 500. That is ~33/day and the dev tier permits 300 `ads_management`
calls per ad account per hour, so it is reachable on a Soma-owned sandbox account. Build
a heartbeat job now: `tools/serve/heartbeat.py`, run from the same systemd timer shape as
`tools/concierge/soma-worker.service`.

This job is also permanent infrastructure, not scaffolding: Policy 10.4 downgrades access
after 30 days of non-use. A gap between design partners silently costs the approval.

### 0.4 The licence blocker, and exactly what it blocks

`docs/strategy/STRATEGY-PROPRIETARY-MODEL.md:80-94` states TRIBE v2 weights **and code**
are CC BY-NC-4.0 — research, validation and demo, not the paid pipeline. It also notes a
second licence underneath: the Llama-3.2-3B text branch carries the Llama 3.2 Community
License with attribution, naming and AUP obligations of its own.

The three documents in this packet disagreed about what this blocks. **One answer, and it
is the conservative one.**

`docs/strategy/PLAN.md:328` (gate 4) reads, in full:

> 4. **Named fallback backbone with a cost** — before quoting anyone a price.

That is the whole line. An earlier draft of this section presented a longer sentence as a
block quote from it — *"Unpaid design-partner pilots may run. No invoice is issued and no
fee is quoted until a named permissively-licensed fallback backbone exists with a cost
attached"* — and instructed the other two documents to propagate it verbatim. **That
sentence is not in the repo.** It was invented and attributed to a committed line, in the
document whose own premise is citation discipline, and its first clause is an unadvised
legal conclusion that `YC-UPDATE-FULL-SERVICE.md` explicitly withdraws. It is struck here
and must not be propagated anywhere.

What the repo line actually gates is **price quotation**. The client-side exposure moves
the gate earlier still: the question is not only whether Soma may invoice, but whether a
client may run a recut Soma produced with a non-commercial backbone in a live paid
campaign. So the engineering-side rule this plan can defend without counsel is narrow:

- **No fee may be quoted and no `brand_fees` row may exist** until a named
  permissively-licensed fallback backbone exists with a cost attached (PLAN.md gate 4).
  This one is directly enforceable and the check below enforces it.
- **Whether an unpaid design-partner pilot is commercial use under CC BY-NC-4.0 has not
  been determined**, and it is not engineering's call or this document's.

`[FILL: counsel's written read on (a) whether an unpaid design-partner pilot is commercial
use under CC BY-NC-4.0, and (b) the client's derivative exposure from running in a paid
campaign a recut Soma produced. Until (a) comes back, the pilot question is open, not
answered in Soma's favour — which is a different posture from the one the earlier draft
asserted.]`

`[NEEDS EVIDENCE — no named fallback backbone exists in the repo, only a `[FILL: …]`. No
Meta commercial path is published. `STRATEGY-PROPRIETARY-MODEL.md:84-85` is explicit that
"ask Meta in writing" is a "hope Meta may decline", "not a documented option".]`

**Make it a check, not a paragraph.** `tools/serve/check_licence_gate.py` in `verify.sh`:
no `brand_fees` row may exist (fixture-driven, same posture as `check_frozen.py`) while
`docs/strategy/PLAN.md`'s gate-4 line is unresolved. The gate reads the doc; the doc is
the switch. That check is satisfiable today — gate 4 is a committed line with a definite
state — which is exactly why the enforceable half of this section is the fee half.

### 0.5 Pricing is a bundled weekly price per campaign — SUPERSEDED DECISION RECORD

**Founder decision, 2026-08-07, after the Serve expansion and the Shawn Kung
discussions.** Pricing is now: the onboarding brief (reach, duration, platforms, goal)
returns **a single all-inclusive weekly price per campaign** — bundled media spend
across every chosen network **plus a margin (default 20%) on serving costs** — renewing
weekly until paused. One number, one bill; the client never manages per-platform
finances. Implemented in migration `0016_campaign_pricing.sql`, `tools/serve/pricing.py`
(canonical), `src/lib/pricing.ts` (mirror, parity-gated in verify), and
`tools/serve/renewals.py`.

**What this supersedes, preserved because it was a real argument.** The first version of
this section priced Soma as a flat monthly fee with media passed through at cost, so
that *"our fee never rises when your budget rises"* was literally true, and the schema
enforced it (`brand_fees.media_markup_pct = 0`, migration 0011 — the constraint stands
untouched on that now-legacy table). The argument was about incentive gradients: a fee
indexed to spend gives the vendor a reason to want the budget spent. That argument has
not been refuted; it has been **outweighed** by what inbound demand actually asks for —
one bundled number covering spend they no longer want to manage — and by the founder's
judgment that recurring revenue tied to managed spend is the business.

**Consequences that must be owned, not papered over:**

1. **The "never rises" sentence is retired everywhere.** It is false under this model,
   and no surface may carry it. The honest replacement: *"one weekly price, everything
   included, pause any time."* (`docs/strategy/STRATEGY-FULL-SERVICE.md` carries a
   supersession banner listing every section whose economics need re-derivation.)
2. **Soma becomes a media principal, not an agent.** Bundling spend inside Soma's own
   price means Soma fronts platform costs, carries credit and refund risk, and likely
   grosses up revenue. §0.6's legal/finance question is therefore REOPENED and larger
   than before — revenue recognition, money-transmission exposure, and platform ToS on
   reselling all need the same counsel pass the licence already does.
3. **The holdout rebate math in §6.3 no longer composes.** Its two-term formula was
   derived against a flat fee F; against a bundled weekly price it needs re-derivation
   before any contract quotes it. `[NEEDS REWORK — §6.3 rebate under bundled pricing.]`
4. **The licence gate is unchanged and still blocks invoices.** A quote is not an
   invoice: `campaign_quotes` rows may exist, `campaign_subscriptions` may be planned,
   and `renewals.py --execute` refuses while PLAN.md gate 4 stands. Pilots yes,
   invoices no — that boundary survives the pricing model because it never was about
   the pricing model.

`[FILL: the default margin is 20% by decision; minimum campaign size, payment terms, and
the accepted-quote → funded-campaign flow are founder/finance decisions not invented
here.]`

**Market context (researched 2026-08-07):** `docs/GTM/PRICING-LANDSCAPE.md` — how
incumbent agencies and the AI-native pack price, why 20%-of-spend is normal-to-cheap at
Soma's weekly tier but high above ~$20k/month spend, why nobody else bundles media with
a *disclosed* margin, and the six objections (ANA principal-media critique, gross-vs-net,
verifiability, lock-in, incentive gradient, flat-fee SaaS anchoring) to prepare answers
for before any pricing page ships.

### 0.6 The media-principal structure: the prepaid week

The bundled price (§0.5's superseded-decision record) makes the old client-owned,
client-funded assumption unavailable: one all-inclusive number means Soma's account
spends the media. The structure that survives that with the smallest legal surface is
the **prepaid week**, and it is engineering-enforceable, which is why it is decided
here and not left as an open question:

1. **Prepaid, never fronted.** A campaign week activates only after the client has paid
   that week's bundled price in full. Soma extends no credit and books no media
   receivable — there is no float and no chargeback exposure on money not yet received.
   `campaign_subscriptions` is scheduling truth; a funded-week record (with payment
   reference) is the activation predicate when billing opens.
2. **Funded media is the spend ceiling, in code.** The media component of a funded week
   (the quote's `weekly_spend_micros`, NOT the price) becomes the spend-guard caps:
   per-platform lifetime cap = that platform's funded media for the week, daily cap =
   ceil(weekly/7). `tools/serve/pricing.py funded_caps()` derives the caps from the
   quote, and the existing guard — which already refuses activation without caps —
   enforces that Soma cannot spend money it has not collected. The margin is never in
   the caps: fee money is not spendable media by construction.
3. **Disclosed margin.** The quote UI itemizes media vs margin and the MSA states the
   margin as the service fee. Separately-stated margin over prepaid pass-through media
   is the fact pattern that best supports net revenue recognition — that determination
   is still counsel's, but engineering hands them the cleanest version of it.
4. **One end advertiser per ad account, still.** Policy 10.5 ("Don't combine multiple
   end advertisers … in the same ad account") binds regardless of who funds: one
   Soma-managed ad account per client brand, never pooled.

**What remains for counsel, sharpened rather than removed:** revenue recognition
(gross vs net under the prepaid disclosed-margin structure), money-transmission
exposure of holding prepaid campaign funds, and platform ToS on managed spend at a
margin. `[NEEDS COUNSEL — same pass as the licence question.]`

### 0.7 The before/after demo — what has to be built or captured

The founder addendum specifies a side-by-side comparison as the asset F1 conversations are
conducted with. It sits in Stage 0 because it is needed early, not because it is cheap:
of its five rows, one is pure capture, two depend on Stage 2 and Stage 3 work, and **two
have no referent in the repo before Stage 4.**

| Without Soma | With Soma | What has to be built or captured |
|---|---|---|
| Customer launches an original ad via Meta | Customer uploads the same ad to Soma | **Capture only.** `/upload` → `/r/<token>` is the one thing that runs end to end today (`docs/strategy/PLAN.md:30-32`). The left cell is a screen recording of a real Meta launch — a capture task, not an engineering one. |
| Meta campaign/dashboard view | Soma analysis: attention signals and overall score | **Capture + Stage 2.** The per-video read-out ships (`WeakSpots.tsx`, `ScoreBreakdown.tsx`, `ShotDiagnosisStrip.tsx`); the per-network lanes and the window sentence are §2.5–§2.6. **The addendum's word "heatmap" has no referent in this repo** — `grep -ril heatmap src/ public/ tools/ demo/` returns nothing. What ships is a per-second lane plot over `ads[].timestamps`. Either the frame says "attention over time" or "heatmap" is `[NEEDS BUILD]`. Do not put a cortical surface render in this frame either: the 3-D brain page is cut from Stage 2 and gated on a per-parcel accuracy map (§2.6). |
| Platform metrics and campaign cost | Soma's recommended changes and revised creative | **Stage 3.** A real recut with a real ffmpeg render exists today through `scripts/ingest_partner_ad.py`. What is *not* true today is that the recommendation came from the arc — `choose_candidates()` (`ingest_partner_ad.py:242`) is an even spread, and the file says so about itself. §3.1 is what makes this cell's caption true. |
| Results from the original version | A/B test or comparison against the improved version | **Stage 4 at the earliest. This is the row that does not exist.** No column anywhere in eight migrations stores an impression, click, spend or conversion. Until Stage 4 this cell is `[NEEDS BUILD]` and reads "pending first live campaign". |
| Limited creative feedback loop | Ongoing feedback: analyze → improve → serve → learn | **Stages 4–6.** Diagrammatic, and must be drawn as intent rather than as a screenshot of something. |

Presentation assets the addendum names: a reference Meta dashboard, a Soma dashboard frame,
and an original plus an improved version of the same ad. Two are captures of things that
run, one is a capture of someone else's product, and the fourth is a Stage 3 output.

**And note which metrics the addendum's story runs on: spend, impressions, and performance
outcomes.** All three are platform-side numbers, none of which this product records
anywhere — that is the §0 "Zero" row about `outcomes`, restated as a demo constraint. In
the left column they are real (they are Meta's, from the client's own account). In the
right column they do not exist until Stage 4 and must not be simulated. What the right
column *can* carry today, honestly, is the thing the addendum says the comparison is
actually for: that Soma gives more direct creative guidance. That claim is demonstrable
with artifacts that exist — a named window, a named network, a badge, and a rendered
recut — and it does not need a fabricated number standing next to it.

#### The labelling constraints are build requirements

They are stated here as requirements on the artifact, not as advice to a presenter,
because the artifact will be screenshotted and forwarded without the presenter attached.

1. **The fictionalized client must be visibly fictional inside the frame.** A label in the
   composition — "Illustrative example — not a customer" — not a footnote and not
   presenter knowledge.
2. **The ~$1K/month spend and every metric derived from it must be marked illustrative in
   the frame**, and must never be rendered in the same visual style as a figure that
   traces to `validation/`. This repository has a documented instance of exactly this
   failure mode: `docs/strategy/PLAN.md:73-88` records invented design-partner counts and
   a logo wall of non-customers shipped on a live page (`DemoScrollPage.tsx:807`, `:809`,
   `:1149`), which §0.1 is still cleaning up. A second instance, produced deliberately,
   would be worse than the first — and it would land on the same surface a partner reaches
   for when they ask to see the thing.
3. **The "With Soma" outcome cells must not show a lift.** No measured lift exists. Either
   leave them explicitly empty and marked "pending first live campaign", or show only what
   is real — the analysis output and the recut, both of which do exist. A fabricated lift
   here is the single thing in this packet that would turn the three nulls from a
   disclosure into evidence of concealment.
4. **Real footage carries real attribution discipline — and verify the brand before naming
   it.** If a corpus ad is used, the brand is either anonymised or the frame states that
   the brand is not a Soma customer and did not participate. Note one correction to the
   addendum: it names `data/ads/videos/tt_09.mp4` as "a real Cozey spot" and that is not
   what the manifest says. `tt_09`'s note is `tt7663558279403405333;ctr_0.25;dur_25.3s`
   with **no brand tag**. The Cozey ad in this corpus is **`tt_322`**
   (`...;brand_cozey;dur_47.9s` in `data/ads/ad_manifest.csv`, and one `cozey` row in
   `data/ads/advertiser_summary.csv` — CA, Furniture). Only **179** of the 1,359 manifest
   rows carry a `brand_` tag at all; the remainder are unattributed and must not be
   described as belonging to anyone.
5. **Nothing in the frame may be styled so that a platform output reads as a Soma output**,
   or the reverse. The left column is Meta's product and should look like it.

#### Make it a check, and that argues for how to build it

The `$1K/month` figure and every metric derived from it are numeric claims on a public
surface, which is precisely what §0.1's `tools/demo/check_claims.py` is specified to catch.
Extend that script's rule set rather than adding a ninth gate step: a numeric claim inside
a frame tagged `data-illustrative` passes only if the same frame carries the visible
label; a numeric claim anywhere else must resolve to a path under `validation/` or
`public/`.

That only works if the asset is a **page** — TSX under `src/app`, which the gate can read.
If it is built as a slide deck instead, no gate can see it, requirements 1–5 become
procedural, and the failure mode in requirement 2 is a human forgetting rather than a
build breaking. Build it as a page. It is also the version that survives being asked for
the artifact.

**The strongest version of this demo is the one where the left column is real** — a real
ad and its real platform-side reality — **and the right column shows the real analysis and
the real recut, with the outcome row honestly marked "pending first live campaign."** That
is more persuasive to a partner than an invented lift, and it is the only version that
does not have to be withdrawn the moment someone asks which client it was.

**Stage 0 is done when:** a system-user token exists that can read
`/{ad-id}/insights` on a real partner ad account; `PRODUCT.md:188-193` is resolved;
`check_licence_gate.py` is in the gate and passing, with no `brand_fees` row while
PLAN.md's gate 4 is unresolved, and none of the three strategy documents asserts a legal
conclusion about unpaid pilots that counsel has not given (§0.4); the before/after demo
asset in §0.7 exists and carries its labels; and F1 has a number attached that is a count
of granted ad-account access, not of meetings.

Note what that criterion deliberately does *not* say. It does not require one sentence to
be identical across three documents, because the earlier version of §0.4 required
propagating a sentence one of the three explicitly rejects — an exit criterion nobody
could satisfy. What all three must share is the *fee* rule and the open `[FILL]`, not a
conclusion.

---

## Stage 1 — The decisive experiment: ~673 TikTok ads against `ctr_index`

**No external dependency. No new schema. Uses committed code over data already on disk.
This is the first substantive engineering item and it should not queue behind anything.**

### 1.1 Why this and not something else

The company's whole claim splits at one boundary, and the repo already encodes the split
in every `data/arcs/*.json` under `claim.validated` vs `claim.hypothesis`:

| link | status |
|---|---|
| video → predicted brain/attention response | **validated.** TRIBE v2 is a published model, benchmarked against real fMRI (Schaefer-1000, r ≈ 0.21, `docs/pipeline/INFERENCE-PIPELINE.md:58`). And the one positive result Soma owns sits here: the trained read-out head clears on TVSum, **leave-one-video-out median r = 0.201, Stouffer p = 2.7e-4, n = 15 videos** (`validation/head_attn.json`, `stamp`; the LOVO scheme is `train_head.py:152`, `:199`). Against a human-interest proxy, on fifteen videos — a real result and a small one. **Caveat that must travel with it:** `docs/strategy/PLAN.md:23-24` says that file was deleted in `c8887f3`, and it is present on disk. Reconcile before quoting the figure anywhere; see closing item 14. |
| predicted response → commercial outcome | **not validated.** Three nulls, all at n = 29, all on proxy labels, all out of distribution |

State both rows. A ladder that reads "the validated rung is Meta's and ours is null, null,
null" is *less* true than the honest version, not more, and the honest version is the one
that survives someone opening `validation/`.

Everything in Stages 3–6 is an attempt to buy data for the second row. Before spending a
quarter on that, spend a GPU run on the data that is already here.

The 29 ads that have ever been scored are **all Meta ads**, and their `outcome` column is
literally `days_running` — verified: `outcome == days_running` for **655/655** Meta rows in
`data/ads/ad_manifest.csv` against `data/ads/ad_performance.csv`. That is an ad-longevity
proxy, not a performance measure.

**What the TikTok label actually is, stated before anyone builds on it.** The 704 TikTok
rows carry `ctr_index` — a **relative click-through index in [0,1]**, 97 distinct values on
a 0.01 grid, with `duration_s` summing to 12.0 hours across all 704 and **7.79 hours**
across the 673-row usable subset (§1.2). Three things about it are committed facts and all
three constrain what may be said:

- It is **not a raw click rate.** `ad_performance.py:14-17`: "ctr — performance index in
  [0,1] (**NOT a raw click rate**). VARIES across ads (~100 distinct values, median ~0.29)
  -> this is the primary_label."
- The corpus is **TikTok's Top Ads showcase — an already-curated set of strong
  performers.** `ad_performance.py:34-38`, the file's own HONESTY block: "every number here
  is a PROXY for real spend performance ... So a label here means '**how strong AMONG
  strong ads**', not 'winner vs loser'. ... For a real winner/loser test you want ads that
  failed too, which this source does not expose."
- The companion `ctr_percentile` column is **degenerate and unusable.** The docstring says
  so at `:24-27`, and the data agrees: across the 704 TikTok rows it is `0.99` on every row
  that carries a value (529 of them) and empty on the other 175. Zero discriminative
  power. `ctr_index` is the label; `ctr_percentile` is not.

So the honest version of the sentence is: **scoring them takes n from 29 to about 673 and
swaps a longevity proxy for a performance-*ranked* one — a materially better test, not a
clean one.** Every "real CTR", "raw CTR" and "actual performance measure" construction is
struck from this document and must be struck from the companions. This is not hedging. It
is the difference between a claim a diligence reader can check and a claim the repo's own
scraper refutes in one grep — which is precisely the failure `docs/strategy/PLAN.md:73-88`
already records against this company once.

### 1.2 The blocker nobody has hit yet: the two TikTok manifests disagree

Found by reading the files, and it would have silently inverted the result:

- `data/ads/ad_manifest.csv` — 1,359 rows (704 tiktok + 655 meta). TikTok `outcome` is
  **`ctr_index` as-is**; `tt_09` has `outcome = 0.25` and note `ctr_0.25`. Higher = better,
  which matches `data/ads/ad_manifest.README.txt` line 1 ("HIGHER outcome = better
  performance").
- `data/ads/ad_manifest_tiktok.csv` — **673** rows, and its `outcome` is **1 − `ctr_index`**
  for all 673 (verified: `outcome_main + outcome_tiktok == 1.0` for every shared row;
  `tt_09` is `0.75` there). Higher = **worse**.

The 31-row difference is not arbitrary: 28 are `long_form_*` exclusions above 180 s and 3
are `silent`, per `exclude_reason` in `data/ads/ad_performance.csv`. The 673-row subset is
the sane one — all 673 videos and all 673 `baseline_*.csv` are present, and it is
**7.79 hours** of footage rather than 12.0.

`ad_backtest.py`'s contract is `outcome numeric, HIGHER = better performance` unless
`--outcome-is-rank` is passed. Run it against the per-platform file as it stands and the
sign flips. **Task 1 of this stage is to resolve that, not to notice it later.**

Concretely: pick `data/ads/ad_manifest_tiktok.csv` as the input (it already encodes the
exclusions), fix its `outcome` column to `ctr_index` as-is, and add a pytest —
`test_ad_manifest_direction.py` — that asserts, for every row, that `outcome` agrees in
rank with `data/ads/ad_performance.csv`'s `ctr_index`. A manifest whose sign is only
correct by convention is a manifest that will be wrong once.

### 1.3 The run

1. **Pre-register first.** `docs/science/PREREGISTRATION-ads-ctr.md`, dated, before the
   GPU touches anything. Declare: the a-priori ROI, the summary statistic (mean of the
   per-ad neural series — `ad_backtest.py`'s pre-registered primary; peak/hook/area stay
   exploratory), the covariate set, the effect floor and the permutation count. The rule
   at `docs/science/PREREGISTRATION.md:39-42` — "We do **not** scan regions for the best
   `r`" — applies with more force at n = 673 than at n = 29, because at n = 673 a scan
   will find something.
2. **Extract.** `batch_extract.py` + `baseline_extract.py` over
   `data/ads/videos/tt_*.mp4` into `data/ads/arcs/`. Baselines already exist for all 704
   (`data/ads/baseline/baseline_tt_*.csv`); arcs exist for **0** TikTok ads today
   (`data/ads/arcs/` holds 58 files = 29 Meta arcs + 29 Meta preds).
3. **Backtest, both scores, committed code, no new script.**

   ```
   .venv/bin/python ad_backtest.py --manifest data/ads/ad_manifest_tiktok.csv \
       --score arc  --arc-dir data/ads/arcs --baseline-dir data/ads/baseline \
       --json-out validation/ad_backtest_tiktok_arc.json
   .venv/bin/python ad_backtest.py --manifest data/ads/ad_manifest_tiktok.csv \
       --score head --head validation/head_attn.json --preds-dir data/ads/arcs \
       --arc-dir data/ads/arcs --baseline-dir data/ads/baseline \
       --json-out validation/ad_backtest_tiktok_head.json
   ```

4. **Floor it against dumb features.** `tools/corpus/baseline_predicts.py` already
   computes what loudness/cuts/luminance/motion/duration predict on their own, and
   `ad_backtest.py` partials out the same five. Report the floor next to the result. A
   neural score that ties ffmpeg has demonstrated nothing.
5. **Publish either way**, into `validation/`, in the shape
   `validation/recheck/B-ads-temporal/` already uses: n, the statistic, the permutation p,
   the baseline comparison, and a `verdict` string that is allowed to say NULL.

### 1.4 What each outcome licenses

- **Signal (|partial r| ≥ 0.10 and perm p < 0.05, over the ffmpeg floor).** What becomes
  sayable is narrower than "our score relates to real ad performance", and the narrow
  version is the only one the corpus supports: *"our score relates to relative CTR rank
  within an already-curated set of strong TikTok ads, at n ≈ 673, out of distribution."*
  Those qualifiers are not decoration — the corpus contains no failed ads
  (`ad_performance.py:39-40`), so a signal here is evidence about ranking among winners
  and silent about winner-versus-loser. Stages 4–6 acquire a reason to exist beyond
  growing n, and the first thing a real client's own CPA data buys is the losers this
  corpus cannot supply.
- **Null.** Then the pitch is "diagnoses attention", exactly as `PLAN.md:325-326`
  pre-committed, and Stages 4–6 are justified *only* as label acquisition — which is a
  weaker but still coherent argument, and one this plan can make honestly because it
  never claimed otherwise. Stage 2 proceeds unchanged either way.

Note what a null here does **not** do: it does not invalidate the video → predicted-response
link, which is the validated half and the half the diagnostic layer sells.

### 1.5 Cost and verification

**The order of magnitude is derivable from two committed repo figures, and saying so is
better than declining to.** `docs/strategy/PLAN.md:109` costs extraction at **~2.5 min/ad**;
`docs/GTM/YC-APPLICATION.md:318` prices an A100 at **~$1–2/hr** (Colab Pro / rentable
RunPod, Lambda, Vast). At 673 ads that is **~28 GPU-hours and roughly $30–60**.
`[ESTIMATE — derived from two committed repo figures, not measured on a box. The 2.5
min/ad figure is itself PLAN.md's estimate for the full corpus sweep, and TikTok ads are
shorter than the Meta corpus average, so this is more likely an over-estimate than an
under.]`

That number is worth stating plainly: **the experiment that decides whether the science is
real costs about fifty dollars, and it has not been run.** An estimate derived from two
cited repo figures and labelled as one is not the failure mode `PRODUCT.md:100` forbids;
an invented round number is.

`[NEEDS EVIDENCE — no *measured* per-ad GPU cost or wall-clock figure exists anywhere in
the tree. `src/lib/edit-runner.ts:15-21` says verification is "roughly four minutes for a
SINGLE ad" — a different operation on a different path, and the only latency number in the
repo. Measure the real rate on the first 20 ads and write it into `validation/` before
committing to the rest.]`

- `test_ad_manifest_direction.py` — as above.
- The two `validation/ad_backtest_tiktok_*.json` artifacts are the deliverable, and they
  are re-checkable by re-running the committed script over committed inputs.
- **Note the input-commitment problem up front:** `/data/` is gitignored
  (`.gitignore:90`), so these inputs are local-only. The artifacts must therefore record
  the manifest SHA-256 and the per-ad file list, the way `validation/lane_stats.json`
  already records the SHA-256 of all 19 preds files and both annots. Same fix as §2.8.

**Stage 1 is done when:** `validation/ad_backtest_tiktok_arc.json` and
`..._head.json` exist, carry n ≈ 673, a permutation p, and an explicit comparison against
the ffmpeg floor — and a dated pre-registration predates both.

---

## Stage 2 — The diagnostic layer

**The thing that is computed and thrown away.** This is the largest product delta in the
plan and it has no external dependency. It should start on day one alongside Stages 0 and 1.

### 2.1 Fix the atlas/label collision first

Files: `tools/demo/build_report.py:9-18`, `:230-245`, `:253-287`, `build_roi_mask.py`.

Either re-derive the `data/roi_mask_*.npy` masks from the Schaefer annots so the names are
true, or rename the product concepts on `/demo` so they stop claiming a network they do
not cover. Do not ship a second surface that says "Salience" about a third region.

Recommendation: re-derive. The Schaefer annots are already cached and already parsed
(`load_parcel_names`, `process_batch.py:638-661`), so the masks become one function call
instead of a Destrieux label list, and `mask_for()` (`:663`) already hard-exits if a tag
set selects zero vertices.

**Note the cost:** re-deriving the masks changes `validation/head_attn.json`'s feature
definitions (its four `mask_*` features are the Destrieux ones, `n_true` 831/1743/3393/868).
The trained head must be refit or the old masks kept under an explicit legacy name. Do not
quietly change what a fitted weight refers to. If Stage 1 has already run against the
current head, re-running Stage 1's backtest after a refit is part of this task's cost.

### 2.2 Pool, and persist

New modules under `tools/readout/` (the package already exists — `tools/readout/lane_stats.py`
is in it):

- `tools/readout/pool.py` — `(T, 20484) → (T, 401)` parcel table and `(T, 7)` network
  table, from the cached annots. **401, not 400:** the Schaefer 400Parcels/7Networks annot
  yields 400 parcels *plus* the medial-wall label (1,743 vertices,
  `validation/lane_stats.json → atlas.vertices_unassigned_medial_wall`). Storing 400 and
  silently dropping the 401st is how a vertex-count mismatch becomes a silent
  misalignment.
  Pooling is negligible beside a TRIBE forward pass — a single matmul against a
  membership matrix, over an array whose largest instance in the repo (`preds_BMI.npy`,
  T = 1878) is 76,937,904 bytes as float16. `[NO TIMING FIGURE IS QUOTED HERE. An earlier
  draft gave single-digit milliseconds for a 120 s clip and ~69 ms to load `preds_BMI.npy`;
  those were uncommitted local measurements and are struck alongside the gzip figures
  above. Exact timings are machine- and method-dependent — a normalised-membership matmul
  and a loop over labels differ by ~2× in both directions — and they belong in
  `tools/readout/bench.py --write` → `validation/readout_sizes.json` with the input
  SHA-256. The claim that survives without a benchmark is the ordering: pooling is a
  matmul, inference is a transformer forward pass, and no plausible constant makes the
  first dominate the second.]`
- `tools/readout/windows.py` — the window finder (§2.4).
- `tools/readout/phrase.py` — the structured facts that become a sentence (§2.5).

`demo/process_batch.py` gains `--emit-readout <dir>`. It does **not** gain
`--keep-vertices`: `run_tribe` already persists the full `(T, 20484)` float32 to
`<cache-dir>/preds/<key>.npy` (`process_batch.py:509-556`, write at `:553`). The missing
capability was never retention, it was **getting the existing cache artifact off the box**,
which `--emit-readout` covers on its own.

Per scored clip, it writes:

| artifact | shape | size at T = 30 (SI: KB = 10³, MB = 10⁶) |
|---|---|---|
| `<clip_id>.networks.json` | 7 × T, all three scalings | ~4 KB as JSON `[ESTIMATE]` |
| `<clip_id>.parcels.f16.npy` | (T, 401) float16 | **24,060 B** of array + a 128 B `.npy` header = **24,188 B** |
| `<clip_id>.vertices.f16.npy` | (T, 20484) float16 | **1,229,040 B** of array + 128 B header = **1,229,168 B** (~1.23 MB) |

**Only the raw sizes are stated here, because only the raw sizes are arithmetic.**
30 × 401 × 2 = 24,060 and 30 × 20484 × 2 = 1,229,040; the 128-byte header is `numpy`'s and
is checkable by writing an empty array of that shape. An earlier draft of this table also
carried gzip figures (~22.5 KB and ~1.13 MB) described as *measured* on a 30-row slice of
`data/arcs/preds_-esJrBWj2d8.npy`. Those are struck: they were asserted with no script, no
committed artifact, and an input under gitignored `/data/` (`.gitignore:90`) — the exact
shape of the failure `tools/readout/lane_stats.py` was written to eliminate, in the section
that praises that fix. `[ESTIMATE, UNCOMMITTED — the compression ratio of a dense float16
vertex map is not derivable a priori and no committed artifact measures it. It must not be
quoted anywhere, in this document or the companions, until `tools/readout/bench.py --write`
emits `validation/readout_sizes.json` with the input SHA-256, in the shape
`validation/lane_stats.json` already uses.]`

The earlier draft also gave the parcel row as 46.9 KB, which implies T = 60 while the
vertex row on the same line implies T = 30. That inconsistency propagated into the
companion strategy and YC copy; both need the corrected figure.

**Which T.** `T ≈ 30` for a 30 s ad, and it is the *content-only* T — what `build_arc`
emits and what the report's `timestamps` array carries. `public/preflight/batch_report.json`
settles it: `durationS` 28.5 → 29 timestamps, 31.32 → 32. The *padded stimulus* is longer
(LEAD_PAD_S 5.0 at `process_batch.py:94` + content + TAIL_PAD_S 8.0 at `:95`, and
`--min-stimulus-s` defaults to 35.0 at `:1399`, giving tail = max(8, 35−5−30) = 8, so
T_padded = 43 for a 30 s ad). Every size in the table is content-only T.

**The float16 cast is lossy and irreversible, and the bound is arithmetic, not a
measurement.** `run_tribe` writes float32 (`:553`). float16 carries a 10-bit significand
with an implicit leading bit, so round-to-nearest gives a **maximum relative error of
2⁻¹¹ = 4.88e-4** for any normal value — no file needs to be opened to know that, and it
holds for every array this pipeline will ever write, not just the one someone happened to
test. Three decimal digits is comfortably enough for a lane mean or a within-clip z, and
it halves the compounding asset's storage.

`[ESTIMATE, UNCOMMITTED — an earlier draft additionally asserted a measured value range of
−1.068 to 1.125 on `data/arcs/preds_-esJrBWj2d8.npy`. That is an uncommitted measurement
over a gitignored input and is struck for the same reason as the gzip figures. It belongs
in `tools/readout/bench.py --write` → `validation/readout_sizes.json`. The a-priori bound
above needs no artifact and is safe to quote today; the empirical range is not.]`

The compounding-asset argument should rest on the stated bound rather than on the cast
being unmentioned. If a future head needs more precision, the float32 is still in the box's
preds cache until it is evicted.

The vertex map is the only **structurally** irreversible choice: parcels can always be
re-derived from vertices and never the reverse. Keep it.

**Storage is per scored clip, not per ad.** Stage 3 gives every rendered re-cut its own
readout via `edit_cuts.readout_id`, so the multiplier is 1 + K. At K = 4 and 1,000 ads per
month that is ~5,000 clips ≈ **6.1 GB/month** of vertex maps *uncompressed* (5,000 ×
1,229,168 B = 6.15 GB), against 1.23 GB if you count the ad and forget its cuts. Both
numbers are raw arithmetic at T = 30; neither is a compressed figure, because no committed
artifact measures compression yet. Anyone quoting a per-ad storage cost must say whether
they mean the ad or the ad plus its cuts, and whether the number is raw or gzipped.

### 2.3 Data model — migration `0009_readout.sql`

**First, the storage bucket, because otherwise every upload in §2.7 fails.** The `uploads`
bucket has a MIME allowlist that permits `video/*` and `image/*` only:
`0001_init.sql:133-141` creates it with the five video types, and `0007_result_posters.sql:25-38`
widens it only to add `image/jpeg`, `image/png`, `image/webp`. Uploading a `.npy` returns
exactly the error `0007` exists to document — `415 invalid_mime_type`
(`0007_result_posters.sql:9`) — **after** the GPU work is paid for and **before** the
customer gets anything. It would present as a pipeline bug and it is a schema one.

```sql
-- WHY THIS BLOCK IS FIRST IN THE FILE. Same failure 0007 documents, same place in the
-- run: stage 7 of tools/concierge/run_batch.py uploads the artifacts AFTER the GPU spend.
-- A .npy has no video/* or image/* type, so without this every readout upload 415s and
-- the batch fails with all the expensive work already done. Adding octet-stream does not
-- weaken anything: /api/uploads/sign is what actually gates customer intake (0001:149-150),
-- and the bucket list is defence in depth behind it.
update storage.buckets
   set allowed_mime_types = array[
         'video/mp4','video/quicktime','video/webm','video/x-msvideo','video/x-matroska',
         'image/jpeg','image/png','image/webp',
         'application/octet-stream'          -- readouts/<batch_id>/*.npy
       ]
 where id = 'uploads';
```

**And mind the 150 MB cap** (`0001_init.sql:135`, `file_size_limit` 157286400). A 30 s ad's
vertex map is ~1.23 MB, which is nowhere near it — but the longest array in the repo,
`preds_BMI.npy` at T = 1878, would be **76.9 MB** as float16, and a 10-minute asset would
exceed the cap outright. So `--emit-readout` computes the vertex-map size before writing
and, above a stated ceiling, emits parcels only and records
`ad_readouts.vertices_path = null` with a reason. Failing loudly at write time beats a 413
at upload time.

Then two tables. Networks inline, parcels and vertices in storage.

```sql
create table if not exists public.ad_readouts (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.batches(id) on delete cascade,
  ad_id         text not null,          -- the id inside batches.report.ads[]

  -- WHICH ATLAS, RECORDED, NOT ASSUMED. build_report.py once called a Destrieux mask
  -- "Yeo SalVentAttn" (Dice 0.207 against the real thing) and nothing caught it because
  -- nothing wrote down which parcellation produced a number. This column plus the
  -- checksum is what makes that mistake detectable instead of readable.
  atlas         text not null,          -- 'Schaefer2018_400Parcels_7Networks_fsaverage5'
  atlas_sha256  text not null,          -- of lh+rh .annot, concatenated

  encoder       text not null,          -- 'facebook/tribev2'
  encoder_rev   text,                   -- HF revision pin, nullable only for pre-pin rows

  n_timepoints  integer not null,       -- content-only T (see 2.2)
  n_parcels     integer not null,       -- 401 = 400 parcels + medial-wall label
  tr_seconds    numeric not null default 1.0,

  -- NOT "which scaling this row is" — the networks blob carries all three, exactly as
  -- lane_json emits them (process_batch.py:1631-1635: raw, psc, mag + stats). What is
  -- worth recording is which one was PRIMARY for the run, because --arc-scale
  -- auto-switches raw -> psc when the per-run z-score test fires (:1411-1413).
  primary_scaling text not null,        -- 'raw' | 'psc'

  -- 7 keys x 3 scalings x T floats ~= 4 KB. Inline because every render of the video page
  -- needs all of it, and a signed-URL round trip to fetch 4 KB is worse than a column.
  networks      jsonb not null,

  -- Object keys in the private `uploads` bucket under readouts/<batch_id>/.
  -- Keys, not URLs, for the reason 0003 and 0008 both give: the bucket is private, so
  -- any URL is stale the moment it is written. vertices_path is nullable: see the
  -- 150 MB cap note above.
  parcels_path  text,
  vertices_path text,
  vertices_omitted_reason text,

  created_at    timestamptz not null default now()
);

create unique index if not exists ad_readouts_batch_ad_uidx
  on public.ad_readouts (batch_id, ad_id);
```

```sql
create table if not exists public.readout_windows (
  id            uuid primary key default gen_random_uuid(),
  readout_id    uuid not null references public.ad_readouts(id) on delete cascade,

  network       text not null,          -- 'SalVentAttn' | 'DorsAttn' | ...
  start_s       numeric not null,
  end_s         numeric not null,
  direction     text not null,          -- 'drop' | 'rise'

  -- Within-item only. There is no cross-ad scale and this column must never imply one.
  z             numeric not null,       -- robust z of the window mean vs this clip's median
  band          text not null,          -- 'low' | 'mid' | 'high' — TERTILES, not deciles (2.5)

  shot_index    integer,                -- from the same ffmpeg boundaries the editor uses
  vis_partial   numeric,                -- residual after regressing out the Vis lane

  -- THE HONESTY BIT, same contract as edit_cuts.measured. false means "this is a
  -- description of a model output". true would mean "a pre-registered test found this
  -- network's lane tracks a human ground truth out of sample."
  -- NOTHING MAY SET THIS TRUE TODAY. Zero validation exists for any of the four shipped
  -- Schaefer ROIs; the one pre-registered ROI test (DMN) returned null at Stouffer
  -- p ~= 0.69. tools/readout/windows.py refuses to write true and the gate enforces it.
  validated     boolean not null default false,

  created_at    timestamptz not null default now()
);

-- 3.0s is not a style choice. Across the four SHIPPED lanes, folded over the 19 NON-AD
-- stimuli in data/arcs (15 short web clips + 4 COGNIMUSE features -- NO AD IS IN THAT
-- SET), mean lag-1s autocorrelation is 0.94-0.97 (salventattn 0.941 .. higher_order
-- 0.968), decaying at 5 s to 0.50 (visual) and 0.74 (higher_order)
-- -- validation/lane_stats.json, sets.across_four_shipped_lanes.autocorr. A window
-- shorter than this claims a temporal resolution the signal does not have. The constraint
-- is set from the only measurement that exists; the ad-set fold (2.4) may move it, and if
-- it does, this constraint moves with it rather than the other way round.
--
-- QUOTE THE RIGHT LANE SET. Across all SEVEN Yeo networks the 5 s range is 0.50 (Vis) to
-- 0.78 (Default), and it is tempting to reach for 0.78 because it is the friendlier
-- number. Default is NOT a lane this product computes. `higher_order` is a five-tag
-- mixture -- Default_Temp, Default_PFCv, Cont_PFCl, Cont_Temp, Cont_Par
-- (process_batch.py:119) -- and labelling it "the default mode network" anywhere,
-- in a comment or on a screen, is the same defect as calling roi_mask_arousal
-- "Yeo SalVentAttn".
alter table public.readout_windows drop constraint if exists readout_windows_min_span;
alter table public.readout_windows
  add constraint readout_windows_min_span check (end_s - start_s >= 3.0);
```

RLS: SELECT-only for `authenticated`, ownership inherited from `batches` via `EXISTS`,
exactly the shape `edit_cuts` uses in `0008_accounts.sql:174-189`. Writes stay
`service_role`. **This idiom is repeated on every new table in this plan; §4.0 states it
once, in full, and every later migration refers back to it.**

### 2.4 The window finder

`tools/readout/windows.py`. Input: the `(T, 7)` network table, the shot boundaries from
`detect_shots()` (ffmpeg scene threshold 0.28, `build_report.py:384-395` /
`ingest_partner_ad.py:222-240`), and the clip's own median and robust SD. Output: rows for
`readout_windows`.

Rules, all of which exist to stop the output over-claiming:

- Minimum window 3.0 s, enforced in the finder and again by the check constraint.
- Snap window edges to shot boundaries where one falls within ±1 s. An instruction the
  editor cannot act on ("cut from 4.3 s") is not an instruction.
- Reuse the shipped weak-spot rule rather than inventing a second one: `WEAK_N_STD,
  WEAK_MIN_LEN = 1.25, 3` at `process_batch.py:87`. A window is "low" when the lane sits
  more than 1.25 robust SD below this clip's median for at least 3 s. That threshold is
  already committed, already rendered, and already survives the gate.
- Report `vis_partial` on every window: the residual after regressing out the
  visual-cortex lane. This is not optional decoration. Across the **19 non-ad stimuli** in
  `data/arcs/`, the visual lane explains **59.3%** of the DorsAttn lane's variance
  (mean r = +0.751, mean r² = 0.593) versus **26.2%** for SalVentAttn (mean r = +0.452)
  and 11.2% for higher_order (mean r = +0.083, and it flips sign across stimuli, −0.49 to
  +0.80) — `validation/lane_stats.json → sets.across_four_shipped_lanes`. The default
  `--arc-roi` is `dorsattn` (`process_batch.py:1410`), so the lane currently shipped as
  the headline "Attention" is the one most contaminated by the sensory drive the code
  itself refuses to reward (`process_batch.py:112-114`: a high occipital response "is
  equally consistent with a compelling hook and with meaningless sensory intensity").

**Scope caveat that must travel with those numbers.** They are over 19 *non-ad* stimuli —
15 short web clips and 4 COGNIMUSE features. The same fold over the 29 scored ads gives
materially different values, and it is **not a committed artifact**. Before any of this is
quoted about ads, run `tools/readout/lane_stats.py --preds-dir data/ads/arcs --out
validation/lane_stats_ads.json` and quote that instead. The script already supports it,
and it records the folded directory in the JSON so checking one artifact against another
set's inputs fails loudly.

#### 2.4.1 Changing the default `--arc-roi` is a pre-registration edit, not a flag flip

`salventattn` is ~2.3× better separated from visual drive than `dorsattn` (r² 0.262 vs
0.593) and it is the lane the product story is about. But choosing a region because it
scores better on a property measured after the fact is exactly what
`docs/science/PREREGISTRATION.md:41-42` forbids: *"We do **not** scan regions for the best
`r`. If we ever prefer a different a-priori region, we change it here **before** running
and note the change."* Stage 2.8's own `check_windows.py` is specified to enforce that
rule against `readout_windows.validated`; the default lane may not be exempt from it.

So it is a **three-part commit, in this order**:

1. **Edit `docs/science/PREREGISTRATION.md`**, dated before the re-run, stating the
   discriminant-validity reason (visual-lane r², from `validation/lane_stats.json`) and
   that no outcome statistic was consulted in making the choice.
2. **Change the flag** (`process_batch.py:1410`) and re-run. Note the coupled assertion:
   A5 at `:1524-1528` ties `mean(arc)` to `full_c[args.arc_roi]` within 1e-4, so the arc
   and the contrast must be rebuilt together or the run warns.
3. **Refresh `validation/compare_cuts_dan.json`**, whose `attention_source` field declares
   "a-priori DAN (dorsal-attention) ROI mean |activation|". Leaving that string while the
   product's default lane is ventral is the same class of defect as §0's atlas collision.

`[NEEDS EVIDENCE — neither lane has ever been validated against a human ground truth, so
this is a choice between two untested lanes made on discriminant grounds only. Stage 1's
result does not settle it either: that test is cross-sectional over a whole-ad summary,
not a lane comparison.]`

### 2.5 From a window to a sentence

One implementation, in TypeScript, because the dashboard renders it and storing generated
prose in a column means it cannot be corrected without a re-run.

`src/lib/readout-phrase.ts` — takes a `ReadoutWindow` and returns the sentence plus its
badge. The template:

> Predicted **salience-network** response (Schaefer-2018 SalVentAttn, **2,363 fsaverage5
> vertices**) falls to the **bottom third of this clip's own range** between **0:03 and
> 0:08** — **shot 4 of 11**, boundary detected at **3.1 s**.
>
> `PREDICTED · RELATIVE / WITHIN-ITEM · NOT VALIDATED AGAINST OUTCOME`

The 2,363 is exact: `validation/lane_stats.json → shipped_lanes.lanes.salventattn`
(2,363 vertices, 11.54% of 20,484).

**Everything after the shot index is `[NEEDS BUILD]`.** The previous draft of this template
ended "…coinciding with the product card replacing the face." There is no face detection,
no shot-content labelling and no "product card" concept anywhere in the tree, and ASR/OCR
are off in the only shipped report (`batch_report.json`: `asrBackend: "none"`,
`ocrBackend: "none"` — strings, on all five ads). Shot **indices and boundaries** are real and come from `detect_shots()`. Shot
**content** is a capability that does not exist, and the sentence must stop at the
capability boundary. If content descriptions are wanted, that is a separate build with its
own accuracy question — not a clause appended to a sentence about fsaverage5 vertices.

Five hard constraints:

1. **PREDICTED.** It is a model output about a group average, not a measurement of anyone.
   The word "predicted" is not removable.
2. **RELATIVE / WITHIN-ITEM.** Against this clip's own distribution. There is no absolute
   scale and no cross-ad benchmark. `demo/process_batch.py:1004` `percentile_rank` and
   `:1089` `normalize_within_batch` are the whole scoring story;
   `src/app/dashboard/page.tsx:3-8` already refuses to sort the library by score for this
   reason.
3. **A WINDOW, NEVER A SECOND.** "Collapses at 0:04" is over-precise. Effective temporal
   resolution is 3–5 s. The renderer must be structurally incapable of emitting a single
   timestamp.
4. **A BAND, NEVER A DECILE.** The same argument that bans a bare second bans a decile. A
   30 s ad gives T ≈ 30 samples, and the only committed autocorrelation measurement —
   mean lag-1s of 0.94–0.97 across the four shipped lanes, **over the 19 non-ad stimuli in
   `data/arcs/`, not over ads** (`validation/lane_stats.json`) — implies an effective
   number of independent samples in the low single digits, which makes a decile boundary
   one or two points. The ad-set fold (§2.4) has not been run and may move those numbers;
   it will not move them far enough to make a decile honest at T ≈ 30. Permitted magnitude vocabulary: **tertiles** ("bottom third of this clip's
   own range") or a **signed robust-z band** ("more than 1.25 robust SD below this clip's
   median, sustained 3 s or more" — which is the shipped rule at `process_batch.py:87`).
   "Decile" and "percentile" are banned for a within-clip magnitude, and
   `check-readout-phrase.mts` fails on either word.
5. **NOT VALIDATED AGAINST OUTCOME.** All three outcome tests that exist returned null, and
   Stage 1 may or may not change that. The sentence describes; it does not prescribe.
   "Improve your ventral response and the ad performs better" asserts two links, and the
   second has never survived a test. If Stage 1 comes back with signal, this badge gets a
   *narrower* replacement naming the platform, the label and the n — not a removal.

The badge vocabulary already exists in the repo — `validation/compare_cuts_dan.json`
carries "PREDICTED · RELATIVE · WITHIN-ITEM. ... A hypothesis, not a result." Reuse it
verbatim rather than inventing a second phrasing.

### 2.6 Dashboard surface

Extend, don't replace. `/dashboard/v/[token]/[adId]` is already the cut deep-dive.

| path | what | new? |
|---|---|---|
| `src/app/dashboard/v/[token]/[adId]/page.tsx` | mount `NetworkLanes` + `ReadoutWindows` below `WeakSpots` | edit |
| `src/components/dashboard/NetworkLanes.tsx` | 7-lane small multiple over `ads[].timestamps` | new |
| `src/components/dashboard/ReadoutWindows.tsx` | the instruction list, badge per row | new |
| `src/components/dashboard/VisualDriveNote.tsx` | the `vis_partial` disclosure per window | new |
| `src/lib/readout.ts` | loader through `sessionClient`, RLS is the enforcement | new |
| `src/lib/readout-phrase.ts` | window → sentence + badge | new |
| `src/app/api/readouts/[token]/[adId]/parcels/route.ts` | signed URL for the parcel `.npy` | new |

**The 3-D brain page is cut from this stage.** The previous draft claimed it was
"half-built already" and that `tools/export_brain.py` "ships fsaverage5/6/7 surface
geometry to `public/brain/*.bin`". That is wrong on the inventory and wrong on the
difficulty:

- `public/brain/` contains exactly **two** files: `fs6_idx.bin` and `fs6_pos.bin`. There
  is no fs5, no fs7, and not even the `fs6_sulc.bin` the script's own docstring documents
  at `tools/export_brain.py:13`.
- The script *can* emit any resolution (`sys.argv[1]`, default `fsaverage6`,
  `export_brain.py:81`) but nothing fsaverage5 has ever been generated or committed.
- `src/components/demo2/TwoRegionBrain3D.tsx:408` fetches only `/brain/fs6_pos.bin`.
  fsaverage6 is **81,924** vertices; the predictions are **20,484** on fsaverage5. So this
  needs fs5 binaries generated and committed, or an fs5→fs6 upsampling step that does not
  exist anywhere in the tree.
- The docstring line that says the mesh "never carries a real prediction value" is
  `export_brain.py:19`, not `:21`.

And the deeper reason to cut it: closing item 3 of this document says a 400-parcel map
would show "400 parcels of unknown individual reliability", because no per-parcel encoding
accuracy exists for this checkpoint on this surface. A mesh with 400 unranked parcels is
the decorative hero with a number attached, which is a *worse* honesty position than the
decoration was. **Gate the brain page on the per-parcel accuracy map existing.** The
sellable artifact in this stage is the sentence in §2.5 and the 7-lane small multiple —
and those are what make Stage 3's candidate ranking possible anyway.

### 2.7 Pipeline plumbing

- `tools/concierge/run_batch.py`: stage 7 (`upload artifacts`, `:628`) uploads the readout
  files; a new stage between 6 (`gate`) and 7 writes `ad_readouts` and `readout_windows`.
  Order matters — nothing is written if the gate failed the run.
- `scripts/ingest_partner_ad.py`: same, on the partner path.
- `scripts/seed_review_data.py`: seeds readout rows from `public/preflight/batch_report.json`
  so the dashboard has something to render before a GPU box runs. Its header block
  (`seed_review_data.py:10-22`) already separates REAL from NOT line by line and declares
  every delta it writes as an estimate; readout seeds must carry the same disclosure.

### 2.8 Verification

New pytest files (`test_readout_pool.py`, `test_readout_windows.py`), one Node check, one
gate script:

- `tools/readout/check_atlas.py` — recomputes the annot sha256 and the four shipped ROI
  vertex counts (dorsattn **2,089**, salventattn **2,363**, higher_order **2,754**, visual
  **2,826**; union **10,032** of 20,484 = 48.97%; pairwise disjoint) and fails if any
  drifted. This is what makes the atlas column trustworthy rather than aspirational.

  **This check cannot be added to the gate as-is, and fixing that is part of the task.**
  The Schaefer `.annot` files live in `demo/.cache/atlas/`, which is gitignored
  (`.gitignore:58`, `demo/.cache/`), and are fetched at run time by
  `urllib.request.urlretrieve` (`process_batch.py:656`) from a pinned CBIG raw-GitHub URL
  built at `:124-127`. On a fresh checkout the check either downloads over the network —
  violating the gate's own stated posture, "no GPU, no network, no build"
  (`scripts/verify.sh:87`, restated at `:99` as "no build, no server, no network") — or
  fails. And the integrity story is inverted: recording a hash *after* an unauthenticated download detects drift only if
  the first value was already trusted.

  Two changes, both small:
  1. **Pin the expected sha256 at the download site** (`process_batch.py:656`) and fail
     the *fetch*, not the gate. `validation/lane_stats.json` already records both annot
     SHA-256s, so the pin has a committed source today.
  2. **Commit a derived artifact** — either the two `.annot` files or a 20,484-entry label
     array plus its hash — so `check_atlas.py` is pure arithmetic over committed data, the
     way `tools/demo/check_coherence.py` and `tools/capture/summarize.py --check` already
     are.

  The same problem applies to `tools/readout/lane_stats.py --check`, which is why that
  script is deliberately **not** in `verify.sh` today: `/data/` is gitignored
  (`.gitignore:90`) so `--check` exits non-zero on a fresh clone. It belongs in the
  scorer-box workflow next to a run. Do not wire it into the gate without the same fix.

- `tools/readout/check_windows.py` — fails if any window is shorter than 3.0 s, or if any
  row has `validated = true` without a matching dated `docs/science/PREREGISTRATION-*.md`
  naming that network as an a-priori ROI. This is the machine version of
  `PREREGISTRATION.md:39-42`.
- `scripts/check-readout-phrase.mts` — run via `node --experimental-strip-types`, same as
  `scripts/check-shot-cells.mts`. Over fixtures: every generated sentence contains
  "Predicted", contains a within-item qualifier, names a span of ≥3 s, never names a bare
  second, and **never contains "decile" or "percentile"**. Fails otherwise.

**Procedural note that applies to every Verification section below.** `scripts/verify.sh`
and `scripts/smoke.mjs` are both in `scripts/loop.sh:21`'s `PROTECTED` list and are
reverted on change. `verify.sh:6-8` states it directly: *"The loop is explicitly forbidden
from editing it... If you want the loop to be able to do more, widen the gate here,
deliberately, by hand."* This plan widens the gate **eight** times — count them in the
consolidated list at the end; the earlier draft said seven and the list has eight rows.
Each one is a
deliberate human commit, not something an agent loop does en route to something else.
Batch them if you like, but do not plan them as free.

**Stage 2 is done when:** a signed-in user opens `/dashboard/v/<token>/<adId>` on a real
scored ad and reads a sentence naming a network, a 3-plus-second window, a within-item
band, a shot index, and a badge that says it is not validated — and `verify.sh` fails if
any of those is missing.

---

## Stage 3 — The improve loop

**Does re-scoring after an edit exist today?** Partly, and in the wrong place.

- `tools/edit/search.py --verify` renders candidates and re-enters `demo/process_batch.py`
  on the rendered files (`search.py:304-327`, `verify_batch()`). That is a genuine closed
  loop and it works — offline.
- `scripts/ingest_partner_ad.py` renders K re-cuts, then scores original + cuts as **one
  batch** with `--allow-n`, and writes `edit_cuts` rows with `confidence='measured'`,
  `measured=true` (`:636-637`). Also a genuine closed loop, also offline, and the
  re-scoring is a side effect of scoring the whole batch rather than a job you can ask for.
- `src/lib/edit-runner.ts:28` sets `VERIFY_BY_DEFAULT = false` because verify takes ~4 min
  against a 3-minute exec timeout (`:96`). And the site has no Python anyway.

So three things are missing: the candidates are chosen blind, re-scoring is not a
requestable job, and the comparison shown to the customer is a composite score delta
rather than "did the flagged window move."

### 3.1 Make candidate selection arc-driven

`scripts/ingest_partner_ad.py:242-286` `choose_candidates()` is an even spread. Replace it
with a two-pass:

- **Pass A** — score the original alone. Produces the arc, the network table, and the
  `readout_windows` rows from Stage 2.
- **Pass B** — enumerate the real candidate space via `tools/edit/ops.py:164`
  `enumerate_candidates()` (removes, adjacent pairs, hoists, two head trims — richer than
  the ingest path's single-shot spread), **score every candidate**, then draw K
  stochastically (see §6.3 — the selection rule has to be stochastic for the causal
  machinery downstream to work at all, and it is cheaper to build it that way once than to
  retrofit it), render the drawn K, and re-score original + K as one batch.

This is the first time the edit selection is a search rather than a spread, and it is only
possible because Stage 2 produced windows. That is the dependency.

`tools/edit/ops.py:44-47` must keep its rule: `Candidate.measured` stays false until
something has run the rendered file back through the encoder, and nothing in that file may
set it true (`ops.py:325` already re-asserts it belt-and-braces).

**The edit space is four visual operations and no audio operation, and the product
description must not outrun it.** `enumerate_candidates()` emits `remove` (`ops.py:189`),
`remove_pair` (`:205`), `hoist` (`:219`) and `trim_head` (`:238`). The founder's loop
step 3 names "stronger hook, cuts, audio changes": hook and cuts are `trim_head` and
`remove`/`remove_pair`, and **audio is `[NEEDS BUILD]`** — there is no gain, duck, swap or
music operation anywhere in `tools/edit/`. Adding one is not a line item on this stage: it
needs its own bounded op, its own renderer path, and its own answer to whether the encoder
is even sensitive to it, since the audio branch's contribution to the predicted response
has never been isolated in this repo. Until then, no surface says Soma changes audio.

### 3.2 Make re-score a job, not a side effect

Migration `0010_rescore_jobs.sql`. Same queue shape as `batches` — `status` in
`queued | processing | done | failed`, claimed by the watcher
(`tools/concierge/run_batch.py:466` `claim_oldest_queued`).

```sql
create table if not exists public.rescore_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  edit_run_id   uuid references public.edit_runs(id) on delete cascade,
  batch_id      uuid references public.batches(id) on delete cascade,
  ad_id         text,
  cut_ids       uuid[] not null default '{}',
  status        text not null default 'queued',

  -- THE REAPER COLUMNS. claim_oldest_queued (run_batch.py:466-475) claims by conditional
  -- PATCH on status=queued, which makes the claim atomic but gives nothing a way to undo
  -- it: a worker that dies mid-run leaves the row in 'processing' forever. The existing
  -- concierge path has this gap today; adding two more queues without fixing it triples
  -- the exposure.
  claimed_at    timestamptz,
  attempts      integer not null default 0,

  error         text,
  run_log       text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);
```

`tools/concierge/reap.py`, on the watcher timer, releases any claim older than a stated
ceiling back to `queued` and fails the row after N attempts with a customer-readable
error. It runs over `batches`, `rescore_jobs` and (from Stage 5) `serve_jobs`. Add
`claimed_at` and `attempts` to `batches` in the same migration — the gap is already there
and this is the cheapest moment to close it.

And one column on the existing table, so a measured cut has its own readout and the diff
is a join rather than a recomputation:

```sql
alter table public.edit_cuts
  add column if not exists readout_id uuid references public.ad_readouts(id) on delete set null;
```

RLS on `rescore_jobs`: the §4.0 idiom, ownership via `EXISTS` against `edit_runs`.

`src/app/api/edit/rescore/route.ts` **enqueues only**. It must not spawn a process. This is
not a limitation to route around — `src/lib/edit-cuts.ts:3-8` and
`src/app/dashboard/v/[token]/[adId]/edit/page.tsx:3-8` already state the rule ("NOTHING ON
THIS PATH SPAWNS A PROCESS") and it is the correct boundary for a pipeline whose unit of
work is four GPU-minutes.

**And it needs a per-user enqueue limit.** `0001_init.sql:149-150` already records
"real content validation + rate-limiting are an infra follow-up, NOT RLS" as an open gap,
and `src/lib/beta-gate.ts:136` / `:151` are the only 429s in the tree — they cover
`/api/{generate,edit}/{run,create}`, not this route. An unbounded queue in front of
four-GPU-minute jobs is the cheapest possible denial-of-wallet. Reuse `beta-gate.ts`'s
daily-cap and in-flight-cap shape rather than writing a second limiter.

`tools/concierge/run_batch.py` gains a `--kind rescore` mode in the watcher so one worker
process drains both queues.

### 3.3 The comparison the customer sees

Today: composite score, estimate vs measured. After Stage 2 the honest and much more
specific comparison is available: **did the window that was flagged actually move, in the
network it was flagged in?**

`src/components/dashboard/CutReadoutDiff.tsx` — for each rendered cut, the original
window's `z` and the re-cut's `z` over the corresponding span, per network, with the
`measured` flag governing whether the row is rendered as a fact or as an estimate.
`ShotDiagnosisStrip.tsx`'s existing posture applies verbatim: a shot nobody scored shows
"not tested" rather than inheriting someone else's number.

The claim this earns, and its exact boundary:

- **Earned:** "the re-cut moved the predicted salience lane in the flagged window from the
  bottom third to the middle of the clip's own range." Pure arithmetic over two encoder
  runs.
- **Not earned:** "the re-cut will perform better." That link is exactly what all three
  committed outcome tests probed and all three came back null, and it is what Stage 1
  re-tests at n ≈ 673 against `ctr_index`.

### 3.4 Verification

- `test_edit_candidate_ranking.py` — given a fixture window set and a fixture shot
  timeline, the ranked candidates cover the flagged windows. Fails if the ranking is
  insensitive to the windows (which would mean the "search" is still a spread).
- `test_rescore_job.py` — the worker claims, runs, and writes `edit_cuts.readout_id` and
  `measured = true`; on failure it writes `failed` and a customer-readable `error`, per the
  `fail()` contract at `run_batch.py:506`.
- `test_reaper.py` — a row stuck in `processing` past the ceiling returns to `queued`,
  `attempts` increments, and the row fails terminally after N.
- Smoke: `POST /api/edit/rescore` unauthenticated → 401 or 404. **Put this in
  `scripts/smoke.mjs`'s unconditional `ROUTES` array, beside the existing
  `/dashboard → /sign-in` checks at `smoke.mjs:48-49` — not beside the beta-gate
  assertions, which are skipped entirely when `SOMA_BETA_TOKEN` is unset
  (`smoke.mjs:220-221`) and so would never run in a default gate.**
- A gate assertion that no code path outside the verify stage writes `measured = true` —
  a pytest that imports `tools/edit/ops.py` and asserts the string does not appear.

**Stage 3 is done when:** a customer can look at a rendered re-cut and see, labelled
`measured`, that the specific window the diagnostic flagged moved — and the number beside
an unverified cut still says `estimate`.

---

## Stage 4 — Serve, read-only: the outcome table

**Gated by Stage 0.2 AND by F1 — five prospects granting partner access.** No App Review,
no write API. This can be live within days of partner access being granted, and it is the
correct de-risking move: it tests whether serving sells before six-to-ten weeks of
approvals are spent.

### 4.0 What v0 is, and what is deliberately deferred

The honest scope objection to this plan is that it specifies a company that has already
validated its two riskiest assumptions, written by a company that has validated neither.
So v0 of Stage 4 is **two migrations and one script**, and that is enough to support the
entire human-operated Ads Manager path:

**In v0:** `brands` + `brand_members` + `brand_fees` (`0011_brands.sql`); `served_ads` +
`outcomes` + the `outcomes_current` view (`0012_outcomes.sql`);
`tools/serve/ingest_outcomes_csv.py`; two dashboard pages.

**Deferred until after client #2, and this is a decision rather than a slip:**

| deferred | trigger that un-defers it |
|---|---|
| `platform_connections`, `platform_ad_accounts` (`0013_serve_connections.sql`) | first client whose insights a human will not fetch by hand |
| the token-vault decision | same |
| both OAuth routes | same |
| `serve_jobs` + spend guards (`0014_serve_jobs.sql`) | Stage 5, i.e. first write to a platform |
| `tools/serve/tiktok_client.py` | first Meta client has served one ad. The `platform text` column is the right amount of forward-compatibility until then |
| `tools/serve/retrain.py` | first calibration artifact committed. §6.1 puts retraining third behind calibration and a pre-registration; `calibration.py` + `check_promotion.py` are sufficient until one exists |

The reframe that answers the focus objection in the room: *this is not three products. Two
of the three already run end to end in the repo today. The third one, in the version being
built first, is a human using Ads Manager and one script that reads an insights endpoint.
It is one integration, not a product line, and it was scoped that way deliberately so it
could not eat the company.*

**The RLS idiom, stated once.** Every table in Stages 4–6 gets this shape, in the
`0008_accounts.sql:174-189` style — SELECT-only for `authenticated`, all writes
`service_role`, ownership resolved by `EXISTS` **through `brand_members`, never through
`brands.owner_user_id`**, because an advertiser is a company with several people and a
single owner uuid cannot represent that. Stage 2 specified this correctly for
`ad_readouts`/`readout_windows` and it must not be dropped exactly where the data becomes
sensitive: external ad-account ids, token pointers, spend and outcomes. With no policy the
Stage 4.5 pages return nothing; with a naive policy every authenticated user sees every
brand's spend. Neither is acceptable and neither is the default.

```sql
-- The canonical policy, written out once. Every table below substitutes its own
-- brand_id path into the same EXISTS.
create policy "members read their brand's <table>"
  on public.<table> for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = <table>.brand_id
        and m.user_id = (select auth.uid())
    )
  );
```

### 4.1 Brand identity first

`docs/strategy/PLAN.md:180` already asked for this: "a stable customer identity so a second
batch from the same brand joins the first." Nothing above `auth.users` exists today.

Migration `0011_brands.sql`:

```sql
create table if not exists public.brands (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,

  -- Meta Developer Policy 10.7g requires that data maintained on behalf of one advertiser
  -- be kept separate from another's, and 10.7b restricts using one advertiser's campaign
  -- data to that advertiser's campaigns. Pooled training is therefore NOT a default; it is
  -- a per-brand flag with a recorded source (the signed MSA clause, by reference).
  training_consent        boolean not null default false,
  training_consent_source text,
  training_consent_at     timestamptz,

  created_at    timestamptz not null default now()
);

-- AN ADVERTISER IS A COMPANY WITH SEVERAL PEOPLE. A single owner_user_id on brands cannot
-- represent "the media buyer, the creative director and the founder all see this account",
-- and every RLS policy in stages 4-6 joins through this table rather than through an owner
-- column. Roles are advisory today; the policies only check membership.
create table if not exists public.brand_members (
  brand_id      uuid not null references public.brands(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member',   -- owner | member | viewer
  created_at    timestamptz not null default now(),
  primary key (brand_id, user_id)
);

alter table public.batches   add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.edit_runs add column if not exists brand_id uuid references public.brands(id) on delete set null;

-- LEGACY TABLE AS OF 0016 (see 0.5's supersession record). This DDL encoded the
-- original flat-fee decision -- no percent_of_spend column, media_markup_pct forced to
-- zero -- and it shipped as 0011 before the founder superseded that model with the
-- bundled weekly price (0016: campaign_briefs / campaign_quotes /
-- campaign_subscriptions, margin on the quote). brand_fees stays as shipped: its
-- constraint is true OF THIS TABLE, no live row exists (the licence gate forbids any),
-- and rewriting applied-migration history is how schemas start lying.
--
-- TWO COLUMNS, BECAUSE THE REBATE RULE HAS TWO TERMS. 6.3: Rebate = h*F + h*S*g. Term one
-- reduces the monthly fee by the holdout percentage (h=0.10 -> a 10% lower fee, every
-- month). Term two compensates the client for media spent on the random arm at the
-- DEMONSTRATED per-dollar gap g between the score-selected and random arms, and g is 0
-- until a calibration artifact shows an edge -- which three committed tests have so far
-- failed to find. Storing only holdout_rebate_pct makes the rule uncomputable and invites
-- the reading "rebate = h * spend", which at h=0.10 on $200k spend is $20k against a $12k
-- fee. Term two is the only spend-linked component in the contract and it only ever
-- REDUCES Soma's fee -- the downward-only property the retired flat-fee sentence rested
-- on. Disclosed in the MSA, recorded here so the invoice and the experiment cannot drift
-- apart. (Rebate constants need re-derivation under 0016's bundled pricing; see 6.3.)
create table if not exists public.brand_fees (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null references public.brands(id) on delete cascade,
  monthly_platform_fee_micros bigint not null,
  per_asset_fee_micros        bigint not null,
  per_recut_fee_micros        bigint not null,
  media_markup_pct            numeric not null default 0,   -- MUST be 0: media at cost
  holdout_rebate_pct          numeric not null default 0,   -- h in 6.3
  holdout_gap_g               numeric not null default 0,   -- g in 6.3; 0 until calibration finds an edge
  currency              text not null,
  effective_from        date not null,
  msa_reference         text,
  created_at            timestamptz not null default now(),
  constraint brand_fees_no_markup check (media_markup_pct = 0)
);
```

RLS: the §4.0 idiom on all three. `brand_members` additionally lets a member see only rows
for brands they belong to.

Policy 10.8 requires flow-down: clients must agree to Meta's Terms of Service, Advertising
Standards, Commercial Terms and Self-Serve Ads Terms. The MSA must **separately** obtain
permission to use campaign outcomes for model training. `training_consent` is that clause's
representation in the schema, and nothing may read a brand's outcomes into a pooled
training set without it.

`tools/serve/check_licence_gate.py` (§0.4) asserts no `brand_fees` row exists while the
licence gate is open.

### 4.2 The moat table

This is the schema decision everything downstream depends on. Migration `0012_outcomes.sql`.

```sql
create table if not exists public.served_ads (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,

  -- What Soma predicted about, addressed the way everything else in this repo addresses a
  -- cut: (batch share token, ad id). src/lib/edit-source.ts and src/lib/dashboard.ts both
  -- resolve a video that way; a third addressing scheme here would need a translation layer.
  batch_id      uuid references public.batches(id) on delete set null,
  ad_id         text,
  edit_cut_id   uuid references public.edit_cuts(id) on delete set null,

  platform      text not null,
  external_ad_account_id text not null,
  external_campaign_id   text,
  external_adset_id      text,
  external_ad_id         text,

  -- Ads that were run against each other. The unit of comparison is the group, not the ad.
  variant_group text,
  generation    integer not null default 1,   -- 6.4: which round of proposals this came from

  -- FROZEN AT LAUNCH, AND THIS IS THE WHOLE POINT OF THE TABLE.
  -- Every score in this product is a percentile inside its own batch
  -- (process_batch.py:1004, :1089) and the scorer's constants are hand-picked
  -- (process_batch.py:80, WEIGHTS). Re-deriving "what we predicted" months later from a
  -- report that has since been re-scored produces a number nobody ever acted on. So the
  -- prediction is copied here, in full, at the moment the ad goes live, and never updated.
  -- Contents: the component scores, the readout window summary, the batch n and the
  -- percentile grid the score came off.
  prediction    jsonb not null,
  scorer_version text not null,
  encoder       text not null,
  encoder_rev   text,
  atlas         text,

  -- WHY THIS CREATIVE GOT SPEND. Without this column the outcome corpus is uninterpretable:
  -- if Soma chose the winners, every realized outcome is conditioned on Soma's own prior
  -- and training on it teaches the model to reproduce itself. See Stage 6.
  assignment    text not null,           -- 'model' | 'random' | 'client'

  -- THE PROPENSITY, AND WHY IT IS A TRIPLE. A single logged number is not enough: if the
  -- rule was "serve the top K by score" then every served row has p = 1 and every unserved
  -- one has p = 0, positivity fails, and IPW is UNDEFINED rather than noisy. So the rule
  -- itself and its parameters are recorded, the draw is stochastic (6.3), and the
  -- probability is the one actually computed at draw time -- for served AND unserved
  -- candidates, which is why unserved candidates get rows too (see below).
  selection_rule        text not null,   -- 'softmax_topk' | 'epsilon_greedy' | 'client'
  selection_rule_params jsonb not null,  -- {temperature: .., epsilon: .., pool_size: ..}
  selection_p           numeric not null check (selection_p > 0 and selection_p <= 1),

  -- PLATFORM REVIEW IS THE MOST COMMON OPERATIONAL EVENT IN AD SERVING and it is also a
  -- censoring event: a disapproved variant did not lose, it never ran. Same class as an
  -- early pause (6.2 point 4), and calibration.py treats it the same way.
  review_status   text,                  -- pending | approved | rejected | limited
  review_feedback jsonb,

  launched_at   timestamptz,
  paused_at     timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists served_ads_brand_idx on public.served_ads (brand_id, created_at desc);
create unique index if not exists served_ads_external_uidx
  on public.served_ads (platform, external_ad_id) where external_ad_id is not null;
```

**Unserved candidates get rows too**, with `external_ad_id` null, `launched_at` null and
their computed `selection_p`. That is what makes the propensity model complete rather than
a log of ones — the denominator of an IPW estimate needs the candidates that *could* have
been drawn, not only the ones that were. It costs one row per candidate per group and it
is the difference between a salvageable observational corpus and an inert one.

```sql
create table if not exists public.outcomes (
  id              uuid primary key default gen_random_uuid(),
  served_ad_id    uuid not null references public.served_ads(id) on delete cascade,

  window_start    date not null,
  window_end      date not null,

  -- Explicit, because it stopped being constant. Meta removed 7d_view and 28d_view
  -- across all API versions on 2026-01-12; those windows now return no data. A row
  -- without its attribution label is not comparable to one written before that date.
  attribution     text,

  impressions     bigint,
  reach           bigint,
  frequency       numeric,
  spend_micros    bigint,
  currency        text,
  clicks          bigint,
  video_p25       bigint,
  video_p50       bigint,
  video_p75       bigint,
  video_p100      bigint,
  thruplays       bigint,
  conversions     bigint,
  conversion_value_micros bigint,

  source          text not null,         -- meta_insights_api | tiktok_api | csv | manual
  pulled_at       timestamptz not null default now(),
  revision        integer not null default 1,

  -- The untouched API row. Derived metrics change definition; the payload does not.
  raw             jsonb,

  -- KEEP EVERY PULL. THIS IS THE ONE SCHEMA DECISION IN THIS PLAN THAT IS EXPENSIVE TO
  -- UNDO. A re-pull of the same window legitimately returns different numbers --
  -- conversions backfill across the attribution window -- so a key without pulled_at
  -- forces either a conflict or an upsert, and an upsert destroys the pull history.
  -- That history IS the measurement 4.4 says is mandatory: "how long until a label
  -- stabilizes" directly determines how tight any retrain loop can be, and it is
  -- unrecoverable once overwritten. pulled_at on the row but not in the key carries no
  -- information after the first overwrite.
  unique (served_ad_id, window_start, window_end, attribution, source, pulled_at)
);

-- The current value is a VIEW, exactly the posture this schema already takes for rates.
create or replace view public.outcomes_current as
select distinct on (served_ad_id, window_start, window_end, attribution, source) *
  from public.outcomes
 order by served_ad_id, window_start, window_end, attribution, source, pulled_at desc;

-- And the settling curve is then a query over committed rows rather than a number nobody
-- can reconstruct: for each served_ad, conversions by pulled_at, per window.
```

Rates (CTR, CVR, ROAS) are **not** columns. They are views. A stored rate is a stored
division whose numerator and denominator came from different pulls.

RLS on both: the §4.0 idiom. `served_ads` joins `brand_members` directly on `brand_id`;
`outcomes` joins through `served_ads`.

### 4.3 Platform connections — DEFERRED (`0013_serve_connections.sql`)

Written here so the deferral is legible, not built in v0. Trigger: the first client whose
insights a human will not fetch by hand.

```sql
create table if not exists public.platform_connections (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  platform      text not null,           -- meta | tiktok | google
  external_business_id text,
  scopes        text[] not null default '{}',
  status        text not null default 'active',   -- active | revoked | expired
  token_ref     text not null,           -- A POINTER. NO TOKEN IN THIS TABLE.
  connected_at  timestamptz not null default now(),
  last_ok_at    timestamptz,
  last_error    text
);

create table if not exists public.platform_ad_accounts (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.platform_connections(id) on delete cascade,
  external_id   text not null,           -- act_<id>
  name          text,
  currency      text,
  timezone      text,
  role          text,                    -- ANALYZE | ADVERTISE | MANAGE, as granted
  unique (connection_id, external_id)
);
```

RLS: §4.0 idiom; `platform_connections` on `brand_id`, `platform_ad_accounts` through it.
These two tables are the most sensitive in the schema — they name a company's ad accounts —
and they are also the ones a naive policy would leak wholesale.

**Token storage is a decision, not a detail.** `token_ref` is a pointer, not a secret. The
credential that can spend a client's money must not live in a column that a Vercel-side
`service_role` key can read, because the site has no reason to hold it: every platform
write happens on the box. Options, in order of preference:

1. The worker box's own secret store, keyed by `token_ref`. Simplest, and it matches the
   existing architecture where the box already holds the HF token and the GPU.
2. Supabase Vault / pgsodium with a key the Vercel runtime does not have.

Do not default into option 3 (encrypted column, key in `.env`) because it is the easy one.
`[NEEDS EVIDENCE — no secret-management decision exists in the repo today;
`tools/concierge/provision.sh` is the only place that touches box-level configuration and
I did not audit it for this.]`

### 4.4 Ingest

- `tools/serve/ingest_outcomes_csv.py` — the path `PLAN.md:170-183` specced, and **the
  whole of v0**. A partner emails a CSV; this writes rows with `source='csv'`. Works on day
  one, works forever, and is the fallback when a token expires.
- `tools/serve/pull_meta_insights.py` — deferred with §4.3. When it is built, it is
  **not** one `GET /{ad-id}/insights` per served ad per pull. That scales linearly with the
  corpus that is the entire point of the company. Specify instead:
  - **Meta's async insights job** (`POST /act_<ID>/insights` → poll a report run id),
    which exists for exactly this shape,
  - **exponential backoff keyed on `X-Business-Use-Case-Usage`**, not on a fixed sleep,
  - and idempotency by the unique index above, with `raw` written untouched.
- `tools/serve/poll_status.py` — reconciles `effective_status` on the platform into
  `served_ads.review_status` / `review_feedback`. Meta can disapprove at create time *and*
  re-review and disapprove an ad that is already live; accounts and Pages get restricted.
  A customer should learn that from Soma, not from Ads Manager, and the corpus should learn
  it as censoring rather than as a bad outcome.
- All of these run from the watcher timer, not from the site.

`[NEEDS EVIDENCE — Meta publishes no data-freshness SLA for Insights. The practical pattern
(spend near-real-time, conversions backfilling across the attribution window) is widely
reported but unverified against a primary source. The lag from ad-serve to usable training
label is UNKNOWN and must be measured on the first live campaign, not assumed. The
`pulled_at`-in-the-key decision in §4.2 exists precisely so that measurement is a query
rather than a guess.]`

### 4.5 Dashboard surface

v0 is the first two rows. The rest arrive with §4.3.

| path | what | v0? |
|---|---|---|
| `src/app/dashboard/brands/page.tsx` | brand list | yes |
| `src/app/dashboard/campaigns/[servedGroupId]/page.tsx` | one variant group: predicted vs realized | yes |
| `src/app/dashboard/brands/[brandId]/page.tsx` | connections, ad accounts, consent flags | with 4.3 |
| `src/app/dashboard/campaigns/page.tsx` | served variants across brands, spend to date | with 4.3 |
| `src/components/dashboard/PredictedVsRealized.tsx` | the two columns, `assignment` on every row | yes |
| `src/lib/serve.ts` | loaders through `sessionClient` | yes |
| `src/app/api/serve/outcomes/[servedAdId]/route.ts` | read-only | yes |

`PredictedVsRealized.tsx` must render three things that are easy to omit and dishonest to:

1. **`assignment` on every row.** A table that shows "we predicted X, it did Y" without
   showing that Soma chose which ads ran is the most misleading screen this product could
   build, and it is the exact failure mode Stage 6 is about.
2. **`review_status`**, so a rejected variant reads as "never ran" rather than as a loss.
3. **A scorer-version staleness line.** The freeze rule on `served_ads.prediction` is
   right, and its consequence is that the report a customer is reading today may have been
   re-scored since the campaign was launched on it. The row says so: *"This prediction is
   from scorer_version X. The current report for this creative is Y."*

### 4.6 Verification

- `test_serve_outcomes_ingest.py` — CSV and API fixtures; a re-pull of the same window
  writes a **new row** rather than overwriting, `outcomes_current` returns the latest, and
  a row arriving without `attribution` when `source` is an API is a hard failure.
- `test_brand_rls.py` — fixture-driven: a user who is not in `brand_members` for a brand
  sees zero rows from `brands`, `served_ads` and `outcomes`; a member sees exactly theirs.
  This is the check that turns §4.0's idiom from a paragraph into a guarantee.
- `tools/serve/check_frozen.py` in `verify.sh` — every `served_ads` row's `prediction` blob
  carries `scorer_version` and `encoder_rev`; no `outcomes` row exists whose `served_ad_id`
  has a null `prediction`. Fixture-driven so it runs without a database.
- Smoke: `/dashboard/campaigns` → redirect `/sign-in`, in the unconditional `ROUTES` array
  at `smoke.mjs:48-49`.

**Stage 4 is done when:** one real campaign, created by a human in Ads Manager, has its
per-creative insights in `outcomes`, joined to a frozen prediction in `served_ads`, and the
dashboard shows both columns with the assignment label attached — and a second pull of the
same window has left the first pull intact.

---

## Stage 5 — Serve, write: campaigns from the box

**Gated by Stage 0.3 (Full tier) + App Review for advanced `ads_management`, by Stage 3
(there is no point launching variants you cannot generate on purpose), and by client #2.**
The App Review submission needs a screencast of a working flow, so this stage's code is
built against a Soma-owned test ad account *before* the approval it is waiting on.

### 5.1 The client

`tools/serve/meta_client.py`. Four creates plus an upload:

1. `POST /act_<ID>/campaigns` — objective, buying_type, `status=PAUSED`
2. `POST /act_<ID>/adsets` — budget, billing_event, optimization_goal, targeting,
   `status=PAUSED`
3. video: `POST /act_<ID>/video_ads` with `upload_phase=start` → `{video_id, upload_url}`,
   then `POST` to the returned `rupload.facebook.com` URL with an
   `Authorization: OAuth <TOKEN>` header and a `file_url:` header. **Meta pulls the file
   itself**, so this hands it a short-lived signed Supabase storage URL rather than
   streaming bytes out of the box. That is a genuinely good fit for this architecture.
4. `POST /act_<ID>/adcreatives` — `object_story_spec{page_id, video_data{video_id, ...}}`.
   A Facebook Page is mandatory and **cannot be created via the API at any access tier** —
   the client provides it, and onboarding must ask for it.
5. `POST /act_<ID>/ads` — adset_id, creative_id, `status=PAUSED`

Everything is created **PAUSED**. Unpausing is a separate, explicit command
(`tools/serve/launch.py --activate`) that checks the spend guard first and writes
`served_ads.launched_at`. A script that can both create and spend in one invocation is a
script that will one day spend by accident.

Note the one-way door: `ad_account.partner`, once set to anything other than `NONE` or
`UNFOUND`, cannot be modified. Get the agency declaration fields right at onboarding.

### 5.2 Budget control

Migration `0014_serve_jobs.sql` carries both the queue and the guards, so the migration
boundary matches the stage boundary:

```sql
create table if not exists public.serve_jobs (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  served_ad_id  uuid references public.served_ads(id) on delete set null,
  kind          text not null,           -- create | activate | pause | poll_status
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued',
  claimed_at    timestamptz,
  attempts      integer not null default 0,
  error         text,
  run_log       text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

create table if not exists public.spend_guards (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  external_campaign_id text,             -- null = brand-wide
  daily_cap_micros    bigint,
  lifetime_cap_micros bigint,
  currency      text not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.guard_events (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  served_ad_id  uuid references public.served_ads(id) on delete set null,
  action        text not null,           -- paused | would_pause | cap_raised
  observed_spend_micros bigint,
  cap_micros    bigint,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
```

RLS: §4.0 idiom on all three, `brand_id` in every one for that reason.

`tools/serve/guard.py` runs on the watcher loop: pull spend, compare to cap, and **pause**
anything over. It pauses rather than throttling because ad set budgets may be changed only
**4 times per hour** (error 613 / subcode 1487632) — a guard built on budget edits would
run out of edits precisely when it is needed. Pausing has no such limit.

`tools/serve/reconcile.py` lists ads on each connected ad account and flags any
Soma-created ad with **no `served_ads` row**. This is the only failure in the plan that
spends money silently: a `serve_jobs` row that wedges after the platform create but before
the local write leaves a live Meta ad that nothing points at, which `guard.py` cannot see
and therefore cannot pause. The reaper (§3.2) recovers the job; reconcile recovers the ad.

The guard and reconcile are the pieces that have to be right before any real money moves.
Write both before `launch.py --activate` exists, not after.

### 5.3 Job queue, not request path

`src/app/api/serve/launch/route.ts` writes a `serve_jobs` row and returns. The box claims
it. Same shape as `batches` and `rescore_jobs`, and for the same reason plus one more: it
keeps ad-platform credentials off Vercel entirely.

**Per-user enqueue limit, same as §3.2.** This route enqueues work costed in someone
else's money, which is a stronger reason for a limit than GPU minutes, not a weaker one.

`src/app/api/serve/oauth/[platform]/start/route.ts` and `.../callback/route.ts` are the
only routes that touch a platform directly, and they hand the resulting token straight to
the box's secret store rather than persisting it in Postgres.

### 5.4 Verification

- `test_serve_meta_client.py` — against **recorded HTTP fixtures**, no network. Asserts the
  four request bodies, asserts `status=PAUSED` on all three creates, and fails if any code
  path constructs an `ACTIVE` object.
- `test_serve_guard.py` — synthetic spend series; the guard pauses at the cap, is
  idempotent under repeat runs, and never issues a budget edit.
- `test_serve_reconcile.py` — a platform listing containing an ad with no `served_ads` row
  produces a flagged orphan, not a silent pass.
- `tools/serve/check_paused_default.py` in `verify.sh` — a static check that no literal
  `"ACTIVE"` appears in a create payload anywhere under `tools/serve/`.
- Smoke: `POST /api/serve/launch` unauthenticated → 401/404, in the unconditional `ROUTES`
  array at `smoke.mjs:48-49`.

**Stage 5 is done when:** `tools/serve/launch.py` creates a paused campaign, ad set,
creative and ad on a real client account from a `serve_jobs` row, writes the frozen
prediction into `served_ads`, and `--activate` refuses to run when the guard says no.

---

## Stage 6 — The flywheel, and what "live training" may responsibly mean

This is the stage most likely to be built wrong, because the wrong version is easier and
looks the same for the first six months.

### 6.1 What the outcome corpus may be used for, in order

1. **Calibration monitoring.** Per brand, per campaign: does the frozen predicted rank
   correlate with the realized rank, and does it beat the ffmpeg stimulus baseline
   (loudness / cuts / luminance / motion) that `PREREGISTRATION-affect.md:50-53` already
   makes mandatory? Publish the number either way, in the `/run` style — derived from a
   committed artifact, gate-checked, not retyped. This is the first honest use and it
   requires no retraining at all.
2. **A pre-registered prospective test.** Declare the ROI, the label, the n and the effect
   floor in a dated `docs/science/PREREGISTRATION-serve.md` *before* the campaign runs.
   The repo's own rule (`PREREGISTRATION.md:39-42`) forbids scanning regions for the best r;
   holding the ad account does not create an exemption, it creates more opportunity to
   violate it.
3. **Retraining.** Only after (1) and (2), and only on a schedule. `tools/serve/retrain.py`
   does not get written until a calibration artifact exists (§4.0).

Today the honest position is: **zero.** All three outcome tests that exist are null
(`validation/ad_backtest.json` and `validation/recheck/B-ads-temporal/`: partial r = −0.128,
perm p = 0.548, top-1 hit rate 0.0, n = 29 for the head; +0.123 / 0.559 for the arc;
`validation/temporal_readout.json`: six temporal features, nothing survives Holm). Stage 1
re-runs that question at n ≈ 673 against `ctr_index` — a relative CTR index over an
already-curated corpus, not a raw click rate (§1.1) — and its answer is the honest input to
this stage. Owning the ad account does not change any of the three results; it changes how
fast n grows and it is the only route to a label that is the client's own outcome rather
than a proxy.

### 6.2 Selection bias, spelled out

If Soma chooses which variants get spend, the outcome sample is conditioned on Soma's own
score. Four distinct problems, which are usually conflated:

1. **The model trains on its own prior.** Only creatives the model liked ever get an
   outcome label. Fitting on that corpus teaches the model to reproduce its ranking, not to
   predict outcomes. The correlation goes up and the validity does not.
2. **Spend is a confounder.** Higher-scored creative gets more budget → more impressions →
   a better-estimated CTR *and* a different estimand. CTR at 1M impressions is not CTR at
   10k: frequency rises, the audience saturates, the auction changes.
3. **Meta's optimizer is a second learner in the loop.** The observed outcome is
   (creative × delivery optimizer × audience × budget). Attributing the delta to the
   creative requires holding the rest fixed. A multi-ad ad set does not do that — the
   optimizer reallocates within it. An ad-set-level split test does.
4. **Survivorship in the pause decision.** If the guard or a human pauses losers early,
   the surviving rows are truncated on the outcome. The pause timestamp is data; record it
   (`served_ads.paused_at`) and treat early-paused rows as **censored, not missing**. A
   platform rejection (`review_status = 'rejected'`) is the same class of censoring and
   goes through the same code path.

### 6.3 The design requirements that follow

- **Every served ad carries `assignment`.** `'model'`, `'random'`, or `'client'`, written
  at launch, never inferred later.

- **The selection rule must be stochastic, or the causal machinery is decoration.** This is
  the single most consequential correction in this document. "Soma wrote the selection
  rule, so the propensity is known exactly" is only true if the rule *has* a propensity. If
  the rule is "render and serve the top K candidates by score" — which is what §3.1's
  arc-driven ranking naturally produces — then the realized propensity is 1 for served
  variants and 0 for everything else. IPW divides by the propensity; with no overlap
  between treated and untreated in score-space the positivity assumption fails outright and
  the estimator is **undefined, not merely noisy**. A logged column of ones is decoration.

  This matters far beyond elegance, because IPW is the mechanism that extracts anything
  usable from the non-random arm, and the non-random arm is where nearly all the data will
  be. Get it wrong and the corpus's dirty majority is not partially salvageable — it is
  inert.

  Concretely: rank candidates by score, then **sample K without replacement from a softmax
  over the scores at temperature τ**, or run **ε-greedy** (with probability ε, draw a slot
  uniformly from the full candidate pool). Record τ or ε in `selection_rule_params`, and
  record the exact computed probability for **every candidate — served and unserved** — in
  `selection_p`. The rule is then reconstructible from the row rather than from a script
  that has since changed.

- **The random arm is the ε = 1 special case, and Soma pays for it.** Within each
  `variant_group`, at least one variant is drawn uniformly from the candidate pool rather
  than by score. That arm is the only unbiased training data the company will ever have.

  It is also a real cost imposed on a client to build an asset Soma owns — a conflict
  that must be disclosed whatever the pricing model.

  `[NEEDS REWORK — the rebate arithmetic below was derived against the superseded flat
  fee F (§0.5's decision record, 2026-08-07). Under bundled weekly pricing the fee and
  the media are one number, so both terms need re-derivation against the margin
  component before any contract quotes this rule. The disclosure obligation and the
  two-term structure survive; the constants do not.]`

  **Resolution, with the arithmetic written out, because an earlier draft's phrasing was
  read as something far larger than the rule intends.** "Rebated by the holdout fraction of
  spend" reads literally as rebate = h × S — at h = 0.10 and S = $200,000 that is $20,000
  against a gross monthly fee of $12,000, a rebate 1.67× the entire fee and indexed to
  spend, which falsifies §0.5's sentence in the same breath that asserts it. The rule is
  two terms, not one:

  ```
  Rebate = h × F      +      h × S × g
           ^ the fee            ^ the demonstrated edge, zero today
  ```

  - **Term one: the client's monthly fee is reduced by the same percentage as the holdout
    fraction.** A 10% holdout means a 10% lower fee, every month. At F = $12,000 that is
    $1,200. This term is the whole rebate today.
  - **Term two compensates the client for the media they spent on the random arm instead
    of the score-selected one, and it is worth exactly `g` — the demonstrated per-dollar
    gap between the two arms.** `g = 0` until a calibration artifact shows the
    score-selected arm beating the random one. **Today g is zero, because three committed
    tests have publicly failed to demonstrate that edge.** If §6.1's calibration ever finds
    one, this term switches on and the client is paid for the difference.

  **Term two is the only spend-linked component anywhere in the contract, and it only ever
  reduces Soma's fee.** That is why §0.5's sentence is stated there as *"our fee never
  rises when your budget rises"* rather than "does not move" — the weaker claim is the one
  that stays true after this clause is signed, and a sentence that survives its own
  contract is worth more than a sentence that has to be retired.

  **The schema needs two numbers where it currently has one.** `brand_fees.holdout_rebate_pct`
  alone cannot compute a rule with two terms; §4.1 therefore carries `holdout_gap_g`
  beside it, both disclosed in the MSA, so the invoice and the experiment cannot drift
  apart. `[FILL: the holdout fraction h itself — the founders must accept a specific
  number, because it is simultaneously the statistical power of the only clean arm and a
  line item on Soma's own P&L.]`

- **Randomize at the ad-set level.** Use Meta's split-test structure so budget is
  randomized across cells rather than reallocated within one.

- **Held-out split is by BRAND, not by ad.** Ads within a brand share production style,
  audience, pixel and often the same footage. That is the same leakage
  `PREREGISTRATION-head.md:28-30` already worries about with shots inside a video ("n =
  VIDEOS, not shots"), one level up.

### 6.4 Closing the loop the founders described

"Your ad is never stagnant, your ad is always evolving" requires a link this plan otherwise
does not have. Stage 3 covers score → edit → re-score. §6.1 covers outcome → calibration →
retrain. Nothing so far covers **outcome → new variant**.

`tools/serve/propose_next.py`, on the watcher timer: for each live `variant_group`, read
`outcomes_current` plus the `readout_windows` of every member, and where a variant is
underperforming its group by a stated margin, enqueue a `rescore_job` for the next
candidate. Critically, it writes `assignment`, `selection_rule`, `selection_rule_params`,
`selection_p` and `generation = n + 1` **at proposal time**, so the second and subsequent
generations of a group are logged rather than reconstructed. A generation whose propensity
was computed after the fact is not a propensity.

This is also where the loop can go wrong fastest: each generation conditions on the
previous one's outcome, so without the stochastic draw of §6.3 the corpus collapses onto
the model's own prior within a few rounds.

**Built 2026-08-07 — the cycle entry point.** `tools/serve/autopilot.py` is the spinal
cord for the organs above: one spec in, one cycle report out, running every stage it has
inputs for (ab evaluate → guard would-pause → brand calibration fit/rerank →
propose_next → renewals tick). Its safety invariant is asymmetric on purpose: autopilot
may **stop** spend unattended (pause a losing arm, pause a cap breach) but has no
activation path at all — winners come back as referrals to `launch.py --activate
--funded-quote` (§0.6), and `test_serve_autopilot.py` pins that no client is ever asked
for ACTIVE. Renewal execution honors the licence gate as a recorded refusal rather than
a crash, so an unattended cycle completes and says what it could not do. This does not
discharge §6.3's stochastic-draw requirement; it is the place that requirement will be
enforced when generation-n+1 proposals start flowing through it.

### 6.5 What "live training" may mean

Not continuous. Concretely:

- `tools/serve/calibration.py` runs on a schedule and writes a dated artifact into
  `validation/` with the same shape as `validation/head_attn.json` — n, the statistic, the
  permutation p, the baseline comparison, and a `verdict` string that is allowed to say
  NULL. `validation/ad_backtest.json` and `validation/recheck/B-ads-temporal/` already
  model this exactly. It treats early-paused and rejected rows as censored.
- `tools/serve/retrain.py` refits the head on a frozen snapshot, on a cadence measured in
  months, and writes a new `scorer_version`. It **never** writes to production. It is not
  written until a calibration artifact exists.
- Promotion is a gate, not a deploy. `tools/serve/check_promotion.py` in `verify.sh`
  refuses to let a `scorer_version` be marked `production` unless a validation artifact
  exists whose n, p and baseline comparison are in the file and whose held-out split was by
  brand. Same posture as `tools/capture/summarize.py --check`: the derived thing must
  re-fold from the source or the gate fails.
- The frozen `prediction` blob on `served_ads` is what makes this possible at all. A
  retrained scorer changes what today's report says; it must not change what last quarter's
  campaign was launched on. §4.5's staleness line is how the customer finds that out.

### 6.6 The policy ceiling on the flywheel

Meta Developer Policy 10.7b restricts using an advertiser's campaign data to that
advertiser's campaigns; 10.7d forbids mixing Meta-obtained data with campaigns on other
platforms; 10.7g requires per-advertiser separation. The pooled cross-client, cross-platform
training set is the specific activity those clauses name.

So the schema keeps outcomes keyed to `served_ads → brands`, and a pooled training view is
an explicitly-created materialization that filters on `brands.training_consent`. It is
never the primary store. If the answer from Meta is no, the per-brand calibration product
still works and the code does not need restructuring — that is the point of building it
this way.

`[NEEDS EVIDENCE — whether written per-client consent satisfies 10.7 is not answerable from
the public docs. Note what cannot be leaned on: **10.7 contains no written-approval
clause.** Its only qualifier is "unless the terms for that product allow it explicitly"
(10.7a, 10.7d); the "as otherwise approved by Meta in writing" language belongs to 10.5,
which governs ad-account combination. So the consent design above is a good-faith
mitigation, not a route the policy text grants. This is the single highest-value open
question in the plan and it should be put to Meta's partner team in writing before Stage 5
engineering starts.]`

### 6.7 Verification

- `test_selection_log.py` — a `served_ads` row without `assignment`, `selection_rule` or
  `selection_p` fails to write. **And the degenerate-propensity test:** a fixture corpus in
  which every `selection_p` is 1.0 must cause `tools/serve/calibration.py` to emit a
  *confounded* verdict — positivity violated, estimator undefined — rather than a number.
- `test_calibration.py` — the calibration statistic on a synthetic corpus where the answer
  is known, including the null case, and the baseline comparison is mandatory. Censored
  rows (early-paused, rejected) are handled as censored and a fixture proves it.
- A second deliberate negative test: a fixture corpus where every row has
  `assignment='model'` must produce a confounded verdict, not a number.
- `tools/serve/check_promotion.py` — as above, in `verify.sh`.

**Stage 6 is done when:** `validation/serve_calibration_<date>.json` exists, was produced
by a script the gate re-checks, contains a real n, and is allowed to say NULL.

---

## Consolidated route and file inventory

New migrations, in stage order:

| migration | stage | contents |
|---|---|---|
| `0009_readout.sql` | 2 | `uploads` MIME widening (+`application/octet-stream`), `ad_readouts`, `readout_windows`, RLS |
| `0010_rescore_jobs.sql` | 3 | `rescore_jobs`, `edit_cuts.readout_id`, `claimed_at`/`attempts` on `batches`, RLS |
| `0011_brands.sql` | 4 v0 | `brands`, `brand_members`, `brand_fees`, `brand_id` on `batches`/`edit_runs`, RLS |
| `0012_outcomes.sql` | 4 v0 | `served_ads`, `outcomes`, `outcomes_current` view, RLS |
| `0013_serve_connections.sql` | **deferred** | `platform_connections`, `platform_ad_accounts`, RLS |
| `0014_serve_jobs.sql` | 5 | `serve_jobs`, `spend_guards`, `guard_events`, RLS |

New pages:

```
src/app/demo/before-after/page.tsx                         (0.7, every illustrative
                                                            figure inside a frame the
                                                            gate can see — see §0.7)
src/app/dashboard/brands/page.tsx                          (4 v0)
src/app/dashboard/campaigns/[servedGroupId]/page.tsx       (4 v0)
src/app/dashboard/brands/[brandId]/page.tsx                (deferred with 0013)
src/app/dashboard/campaigns/page.tsx                       (deferred with 0013)
```

Cut from this plan: `src/app/dashboard/v/[token]/[adId]/brain/page.tsx` — gated on a
per-parcel accuracy map existing, and on fsaverage5 geometry being generated and committed
(see §2.6).

New API routes:

```
src/app/api/readouts/[token]/[adId]/parcels/route.ts       (2)
src/app/api/edit/rescore/route.ts                          (3, enqueue only, rate-limited)
src/app/api/serve/outcomes/[servedAdId]/route.ts           (4 v0, read-only)
src/app/api/serve/oauth/[platform]/start/route.ts          (deferred)
src/app/api/serve/oauth/[platform]/callback/route.ts       (deferred)
src/app/api/serve/connections/route.ts                     (deferred)
src/app/api/serve/launch/route.ts                          (5, enqueue only, rate-limited)
src/app/api/serve/jobs/[id]/status/route.ts                (5)
```

New components:

```
src/components/dashboard/NetworkLanes.tsx        (2)
src/components/dashboard/ReadoutWindows.tsx      (2)
src/components/dashboard/VisualDriveNote.tsx     (2)
src/components/dashboard/CutReadoutDiff.tsx      (3)
src/components/dashboard/PredictedVsRealized.tsx (4 v0)
src/components/serve/ConnectPlatform.tsx         (deferred)
src/components/serve/SpendGuardPanel.tsx         (5)
```

New libs: `src/lib/readout.ts`, `src/lib/readout-phrase.ts`, `src/lib/serve.ts`.

New Python:

```
tools/readout/{pool,windows,phrase,bench,check_atlas,check_windows}.py     (2)
tools/concierge/reap.py                                                    (3)
tools/serve/{heartbeat,check_licence_gate}.py                              (0)
tools/serve/{ingest_outcomes_csv,poll_status,check_frozen}.py              (4 v0)
tools/serve/pull_meta_insights.py                                          (deferred)
tools/serve/{meta_client,launch,guard,reconcile,check_paused_default}.py   (5)
tools/serve/{calibration,propose_next,check_promotion}.py                  (6)
```

**Not yet, with their trigger conditions:** `tools/serve/tiktok_client.py` (first Meta
client has served one ad); `tools/serve/retrain.py` (first calibration artifact
committed).

New gate steps in `scripts/verify.sh` (after the existing 4c). **`verify.sh` is in
`scripts/loop.sh:21`'s `PROTECTED` list and reverted on change — each of these is a
deliberate human edit, not a free line:**

```
tools/demo/check_claims.py                                  (0; §0.7 extends its rule set
                                                             to the illustrative-demo
                                                             frames rather than adding a
                                                             ninth step)
tools/serve/check_licence_gate.py                           (0)
tools/readout/check_atlas.py                                (2, after the annot is committed)
tools/readout/check_windows.py                              (2)
node --experimental-strip-types scripts/check-readout-phrase.mts   (2)
tools/serve/check_frozen.py                                 (4)
tools/serve/check_paused_default.py                         (5)
tools/serve/check_promotion.py                              (6)
```

Docs that must change, not be silently contradicted: `docs/strategy/PLAN.md:340-342`
(ad serving moves from "not doing" to the spine), `docs/strategy/PRODUCT.md:188-193`
(resolve or delete), `docs/strategy/PLAN.md:328` + `STRATEGY-PROPRIETARY-MODEL.md:80-94`
(the **fee** rule from §0.4 — no fee quoted and no `brand_fees` row until a named fallback
backbone exists with a cost — plus the open `[FILL]` for counsel on the pilot question. Do
**not** propagate a conclusion about unpaid pilots; the earlier draft's sentence was
invented and is struck),
`docs/science/PREREGISTRATION.md` (the `--arc-roi` change, dated, §2.4.1),
`docs/strategy/OPPORTUNITIES.md:156-181` (the absolute-score prohibition and placement
decisions collide; resolve explicitly), `docs/strategy/COMPETITORS.md` (the VidCognition
and Realeyes sections are factually stale), `docs/GTM/YC-APPLICATION.md` (every "pre-test"
and "before you spend" construction), `src/components/demo2/ServiceTiers.tsx` (a fifth
rung, still with no prices — see §0.5 for the fee shape and the `[FILL]` it carries).

---

## Everything in this plan that rests on something unproven

Ordered by how much of the plan falls over if the answer is bad.

1. **No validation exists for any of the four Schaefer ROIs the product ships.** Grepping
   `validation/` for `dorsattn`, `salventattn`, `higher_order` or `Schaefer` returns no
   *result* artifact — `validation/lane_stats.json` describes their geometry and coupling
   and explicitly disclaims outcome scope. The whole diagnostic layer is therefore
   *descriptive*: it says what the model predicted, not what a viewer felt or what an ad
   will do. Every sentence it emits must carry the not-validated badge, and Stage 2's gate
   exists to make that mechanical rather than remembered.
2. **All three outcome tests that exist are null.** Head: partial r = −0.128, perm
   p = 0.548, n = 29 (`validation/ad_backtest.json`). Arc: +0.123, p = 0.559, n = 29
   (`validation/recheck/B-ads-temporal/ad_backtest_arc.json`). Temporal features: six of
   them, nothing survives Holm, smallest `holm_p` = 0.327, n = 29
   (`validation/temporal_readout.json`). All three on `days_running` — an ad-longevity proxy —
   and all 29 are Meta ads. Stage 1 is the fix and it is first in the build order for that
   reason. Serving does not repair this. It makes n grow.
3. **No per-parcel encoding accuracy exists for this checkpoint on this surface.** The only
   accuracy figure in the repo is r ≈ 0.21 in Schaefer-1000 MNI
   (`docs/pipeline/INFERENCE-PIPELINE.md:58` — :56 is the table header row; both companion
   documents cite :58 and this one was the outlier), a different parcellation from the one the
   product reads out of — and `docs/strategy/ROADMAP.md:114-136` says nothing Soma has
   produced has ever been in that space. Without a per-region accuracy map you cannot rank
   regions by trustworthiness, which is why the 400-parcel brain page is cut from Stage 2
   rather than merely deprioritised.
4. **Unverified hypothesis that would invert the product story:** fMRI encoding models are
   generally most accurate in early sensory cortex and least accurate in association
   cortex. The lane-coupling figures are consistent with that shape — the dorsal-attention
   lane shares ~59% of its variance with the visual lane
   (`validation/lane_stats.json`) — without establishing it. If it holds for TRIBE v2, the
   model is strongest exactly where `process_batch.py:112-114` refuses to reward it, and
   weakest in the salience/association regions the pitch is about. This needs a number
   before the region story is sold.
5. **Meta Policy 10.7 versus the pooled training set.** Unanswered, and **there is no
   written-approval escape hatch in 10.7** — that language is in 10.5, which governs
   ad-account combination. 10.7's only qualifier is "unless the terms for that product
   allow it explicitly" (10.7a, 10.7d), and 10.7a's aggregate-and-anonymous exception is
   limited to assessing "the performance and effectiveness of the end advertiser's
   campaigns", which on its face does not reach pooled cross-client model training. Cheap
   to ask, expensive to discover late, and expensive in a different way to have assumed a
   clause that is not in the section.
6. **The TRIBE licence.** CC BY-NC-4.0 weights *and* code, no named fallback backbone, and
   a second licence (Llama 3.2 Community) underneath the text branch. §0.4 fixes what it
   blocks — pilots yes, invoices no — but does not remove the blocker.
7. **F1 is unmeasured.** Nobody has yet granted Soma partner access to a real ad account.
   Stages 4–6 are gated on five such grants and the count today is
   `[NEEDS EVIDENCE — no artifact records prospect status; this is a sales fact, not a repo
   fact, and it should be written down somewhere that is not a memory.]`
8. **No cost or latency figure for the pipeline.** "Roughly four minutes for a SINGLE ad"
   (`src/lib/edit-runner.ts:15-21`) is the only one in the tree. Stage 1 alone is 7.79
   hours of footage. A serving business needs a per-ad GPU cost and a per-ad storage cost,
   and the flywheel needs a measured ad-serve-to-usable-label lag — which §4.2's
   pull-history key now makes measurable.
9. **Perturbation stability is unmeasured.** TRIBE is deterministic, so re-running produces
   identical output; nothing in the repo measures stability under changes that should not
   matter (re-encode, ±1 frame shift, small crop, different bitrate). A diagnostic that
   flips on a re-encode is not sellable, and the customer will re-encode.
10. **Split-half reliability across vertices (r = 0.998-1.000) must not be quoted as
    evidence of anything.** It measures the spatial smoothness of the model's own output,
    not whether the prediction is correct.
11. **The lane figures describe non-ad stimuli.** `validation/lane_stats.json` folds 19
    clips and features from `data/arcs/`; no ad is among them. The same fold over the 29
    scored ads differs materially and is not committed. Nothing in this document quotes the
    committed numbers as describing ads, and §2.4 says how to produce the ad version before
    anyone does.
12. **Live Supabase state is unverified.** Whether migrations 0001-0008 are actually
    applied, whether any real customer batches exist, and whether the concierge worker is
    running on a provisioned box were all read from the tree, not the deployment.
13. **How many real TRIBE forward passes have ever completed on partner footage is
    unknown.** `public/preflight/batch_report.json` looks like genuine output, but the one
    committed run capture (`src/data/run-capture.json`) shows `torch` absent and the
    encoder skipped. Someone should state the real count plainly. This is exactly the kind
    of number the house rules forbid inventing, and the plan does not invent it.
14. **`validation/head_attn.json` is present on disk and `docs/strategy/PLAN.md:23-24` says
    it was deleted in `c8887f3`.** Reconcile before anyone quotes median r = 0.20 — and
    note Stage 1's `--score head` run depends on that file being the one it claims to be.
15. **Every duration and effort figure in this document is an estimate.** None is sourced
    from a published benchmark, and Meta publishes no App Review SLA at all.
