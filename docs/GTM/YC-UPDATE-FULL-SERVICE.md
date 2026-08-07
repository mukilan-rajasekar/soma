# Soma — YC application UPDATE: Analyze / Improve / Serve

> **Status: PASTE-READY REPLACEMENT COPY for the pivot-affected answers in
> `docs/GTM/YC-APPLICATION.md`.** Everything here is written as final text, not as advice about
> what to write. Drop each block over the answer it replaces. The honesty rules in the parent
> doc's preamble (lines 21–33) still bind every word below and are *not* relaxed by the pivot —
> if anything, Serve tightens them, because a false claim made to someone about to hand you media
> budget is a different category of problem than a false claim on a landing page.
>
> **What this supersedes in the parent doc:** the 50-character description (:144–147), the founder
> video script (:154–174), the product answer (:202–245), the competition answer (:400–443), the
> money answer (:445–481), and interview killers 2 and 4 (:579–589, :600–607). The "pre-testing"
> and "before you spend a dollar" constructions are dead everywhere they appear. Every line number
> in this document was re-checked against the file it points at on 2026-08-06.
>
> **What this adds that the parent doc has no slot for:** the canonical offering statement and the
> analysis-only entry point (below), a short "what the customer actually buys" answer with the
> six-step loop and the before/after workflow, and the before/after demo spec with its mandatory
> labelling constraint. All four are founder-supplied product direction folded in after the first
> drafting pass — authoritative on *what the product is*, and evidence of nothing about what has been
> built. Nothing from that source is written in the present tense unless the repository supports it.

---

## SLOT DISCIPLINE — read this before you paste anything

Every number that does not yet exist is written as **`[FILL: what the number is — where it comes
from]`**. Do not replace a slot with an estimate, a round number, or a number you remember. Replace
it with a number you can produce the artifact for in the room.

This is not pedantry. `docs/strategy/PLAN.md` §0.3 (`:73-88`) catalogues three claims this company
already put on a public site with nothing behind them: the "500 Ads in the live database — from our
design partners" tile (`DemoScrollPage.tsx:807`), the "92% Prediction accuracy" tile (`:809`) which
`YC-APPLICATION.md:25-26` traces to a *competitor's* marketing number, and the "Already running ads
through the beta" logo marquee (`:1149`; `BetaMarquee` opens at `:1144`). All three are still live.
`PRODUCT.md:188-193` adds a fourth, the "100+ founders and companies on the waitlist" tile at
`:808`. The 500-ads claim is the checkable one and it does not survive: `PLAN.md:76` records that
the corpus is scraped TikTok Creative Center, and `data/ads/ad_performance.csv` holds 704 TikTok
rows and 655 Meta rows, none of them from a design partner. Serve makes each of these worse: once
you hold a client's ad account, an inflated partner count stops being puffery and becomes a
representation about a commercial relationship to a counterparty who is about to fund it.

**One block in `docs/strategy/PRODUCT.md` (lines 188–193) asserts the 92%, the 500 ads and the 100+
waitlist as "cleared for public copy" and instructs the reader not to check them, not to gate them
behind a repo artifact, and not to remove them.** That block contradicts `PRODUCT.md:100` eighty-eight lines
earlier ("Numbers must be reproducible… the constraint with no exceptions"), `PLAN.md:73-88`, and
`YC-APPLICATION.md:25-26`. **Treat it as untrusted until a founder confirms it out of band, and do
not paste those three numbers into a YC application under any circumstance.** If they are real,
they are real in a spreadsheet somewhere and can be sourced in five minutes; if they cannot be
sourced in five minutes, they are not going in the application.

**The counterpart rule for external facts.** Anything in this document about Meta, TikTok, Google,
Adelaide, the IAB, Motion, Smartly or a competitor is a claim about someone else's published
document, and the parent doc's preamble requires a URL for it. Those URLs are not inline here —
they live in the sourced appendix at the end, which is the thing the founders carry into the room.
An external fact with no row in that appendix does not get said out loud.

---

## WHAT CHANGED AND WHY

**The canonical offering statement.** Founder-supplied, and the source every one-liner, tagline and
50-character string in this packet has to derive from. Do not paraphrase it into something stronger:

> *A platform that helps advertisers analyze creative, improve it, distribute it, and learn from
> performance — without piecing together separate scoring, editing, and ad-serving tools.*

**And the qualifier that travels with it, which is a feature and not a hedge:** a customer can use
**only the analysis layer** if they want. Analysis-only is a legitimate, supported entry point, and
it is the near-term commercial reality — it is the part that exists. The full A-to-Z workflow is the
longer-term product. Anyone presenting Serve as the only way to buy Soma is describing a company
that has not been built yet.

*(The one paragraph. A partner should be able to repeat this back after hearing it once.)*

> We were selling a cheap pre-test you run before you spend money on Meta. That business had a
> ceiling built into its own pitch: we were positioned as the discount step upstream of the real
> test, which means every serious buyer eventually asks why they shouldn't just run the real test.
> They're right to ask. So we stopped selling the thing that comes before the spend and became the
> thing the spend runs through. Soma now does three things: **Analyze** — score the ad against a
> predicted cortical response and name the window where a named brain network's predicted response
> falls to the bottom of that clip's own range; **Improve** — a small, surgical set of fixes
> delivered as a finished file, not a creative agency; and **Serve** — we place the ads for the
> client, Meta first and then TikTok and Google, pass media through at cost, and charge a flat fee
> for the intelligence. You can buy Analyze on its own — that is a real entry point and it is what we
> can sell today. But Serving is where the company goes, because it is the only mechanism that gives
> us the outcome labels — impressions, CTR, CVR, ROAS, tied to the exact creative and the exact
> predicted brain response — that could turn our diagnostic from an observation into a prediction. We
> are not competing with Meta's A/B test anymore. We're running it.

**The pricing decision that makes the rest of it sayable:** our fee is flat — a monthly platform
fee per managed brand plus a per-asset fee per creative scored and per recut delivered, with media
passed through at cost. It is not a percentage of spend. So this sentence is literally true, and it
is the strongest sentence we have: **our fee never rises when your budget rises — we are the only
party in your chain with no reason to want your money spent.**

**If you get one follow-up sentence, it is this:** the reason nobody has done this is that the
people with the brain model don't hold the ad account, and the people holding the ad account don't
have the brain model. We are proposing to be both, on purpose, because the loop only closes if one
company owns both ends.

---

# REWRITTEN ANSWERS

## Describe what your company does in 50 characters or less

*(Replaces `YC-APPLICATION.md:144-147`. Character counts verified with `len()`, 2026-08-06.)*

> - `We score, fix, and run your video ads` — **37** ✅  *(lead option — the whole company in one
>   line, no neuro claim in the hook, no "pre-" anything)*
> - `Brain-based creative for the ads we run` — **39** ✅
> - `We run your ads and fix what loses attention` — **44** ⚠️  *(only if the body immediately
>   qualifies it: what falls is a **predicted** response in a named network, relative to that
>   clip's own range. Honesty rule 5 at `YC-APPLICATION.md:28-29` binds this string.)*

**Do not use** any string containing "pre-test", "pre-testing", or "before you spend". There is no
downstream buy to be upstream of. You are it.

---

## What is your company going to make?

*(Replaces `YC-APPLICATION.md:202-245` in full.)*

**The 50-word version — use this as the opening of the answer and in the video:**

> Soma runs video ad campaigns — Meta first, then TikTok and Google. Before anything goes live we
> predict the viewer's second-by-second cortical response, name the three-to-five-second window where
> a named brain network's predicted response hits the bottom of that clip's range, recut it, and
> serve the variants. Media at cost; our fee is flat.

*(54 words. Every noun in it is a thing that exists: the response is predicted and group-average,
the network is named, the window is a window rather than a timestamp, and the platform order is the
build order. Nothing here asserts what is on screen.)*

**The full answer:**

> **Soma is an end-to-end creative performance company for video ads: we score the creative against
> a predicted brain response, fix what the score exposes, run the media, and feed the realized
> outcome back into the model.** Three parts, and they are ordered deliberately.
>
> **1. Analyze.** Meta open-sourced **TRIBE v2**, the successor to its Algonauts-2025-winning brain
> encoder (1st of 263 teams, benchmarked against real fMRI). Point it at a video and it predicts,
> once per second, the cortical response at **20,484 points on the cortical surface** — every vertex
> of the fsaverage5 mesh. Almost everyone who touches this model — including us, until now —
> collapses that to a single number and throws the rest away.
>
> We stopped throwing it away. Using the Schaefer-2018 400-parcel / 7-network parcellation, the
> same 20,484-vertex map resolves into named functional networks. Four lanes ship in our report
> today: the dorsal attention network (2,089 vertices), the ventral attention / salience network
> (2,363), visual cortex (2,826), and a higher-order association lane assembled from lateral
> temporal, ventral prefrontal and frontoparietal control parcels (2,754). They are pairwise
> disjoint and together they are **10,032 vertices — 48.97% of the surface**. The other 51% —
> somatomotor, limbic, most of the default-mode network, most of the control network, and 1,743
> vertices FreeSurfer leaves unassigned in the medial wall — is computed by the model on every run
> and thrown away. Keeping all 400 parcels instead is arithmetic anyone can check in the room:
> 400 parcels × 2 bytes × 30 seconds = **24 KB per 30-second ad**. The spatial map has been free the
> whole time; nobody was reading it.
>
> *(Lane definitions and vertex counts: `demo/process_batch.py:110-122` for the lane tags,
> re-derived and counted by `tools/readout/lane_stats.py` into `validation/lane_stats.json`, which
> also records the SHA-256 of both Schaefer annot files. The medial-wall vertices are dead weight,
> not hidden signal — they are named here so the counts add up to 20,484 rather than to imply they
> are useful.)* The pooling step itself is one matmul against a membership matrix, applied to an
> array the encoder has already produced. It is arithmetically negligible beside a transformer
> forward pass, and no plausible constant changes that ordering — which is why we can say the
> spatial map has been free the whole time. **[FILL: the measured wall-clock figure —
> `tools/readout/bench.py --write` → `validation/readout_sizes.json`; not yet run. An earlier draft
> asserted "3.2 milliseconds"; it had nothing behind it and was removed rather than rounded.]**
>
> That is the difference between "your ad is underperforming" and this: *"predicted salience-network
> response (Schaefer-2018 SalVentAttn, 2,363 fsaverage5 vertices) falls to the bottom of this clip's
> own range between 0:03 and 0:08 — shot 4 of 11, boundary detected at 3.1 s."* Which network, and
> when, and which shot — and then we can cut it, re-score the cut, and run it.
>
> **What we deliberately do not say in that sentence.** We do not say what is *on* the shot. There
> is no face detection, no object or content labelling anywhere in our pipeline, and speech and
> on-screen-text extraction are switched off in the only report we have shipped
> (`public/preflight/batch_report.json`: `asrBackend: "none"`, `ocrBackend: "none"`). Shot indices
> and boundaries are real — ffmpeg scene detection at threshold 0.28, `tools/demo/build_report.py:384`.
> Naming what replaced what needs a detector stage we have not built. **[NEEDS BUILD: on-screen
> content labelling — a new pipeline stage, not a tuning change. Until it ships, the note is
> "shot 4 of 11", not "where the product card replaces the face."]**
>
> **2. Improve — deliberately small.** We are not a creative agency and we are not going to generate
> your ads. Companies want to own their creative, and the ones who don't already have an agency they
> like. Improve is surgical, and the operator set is finite and enumerable — remove a shot, remove
> an adjacent pair, hoist a later shot to the front, trim the head (`tools/edit/ops.py:164-242`).
> That is four operations, not an editing service. It is delivered as a finished file rendered with
> ffmpeg, and the delta on the recut is either **measured** — we re-ran the encoder on the rendered
> file — or flagged as an **estimate**, with hoists demoted to "weak estimate" because a hoisted
> shot lands in a context it was never predicted in. That distinction is enforced by our database
> schema, not by our marketing copy: `supabase/migrations/0008_accounts.sql:131` says `measured` is
> the honesty bit, that `ops.py` may not set it, and that only the verify stage may. Heavier editing
> we partner out.
>
> **3. Serve — the reason the company works.** We place the ads, find the placement that returns,
> and pass ad spend through at cost. Meta first; TikTok and Google follow the same shape. We charge
> a flat fee for the intelligence layer and nothing on the media.
>
> **Why serving is not a services bolt-on.** Every creative-analytics company on the market —
> VidMob, Motion, AdCreative.ai, Neurons, Realeyes — sells a score and then hands you back to your
> media buyer. That hand-off is where the training signal dies. They have to ask the customer for
> their outcome data after the fact and mostly don't get it. If we run the campaign, the label
> arrives automatically, attached to the exact creative, at the ad level — which on Meta is
> creative level **provided Dynamic Creative and Advantage+ creative enhancements are off**, because
> with them on a single ad carries multiple asset combinations and insights aggregate across them.
> Serve therefore has to create ads with those features disabled, and that assertion belongs in the
> same guard that checks a newly created ad is paused. Predicted brain response in, realized
> commercial outcome out, same row. That is the asset a public encoder cannot give anyone.
>
> **What is honestly true today, stated plainly.** The pipeline is real and runs offline on a
> provisioned GPU box; the site is a reader over its output. Analyze works end-to-end for a signed-in
> customer — upload a batch, get a report with per-second network lanes, per-shot diagnosis, and
> rendered recuts. Improve works in the narrow form described above. **Serve does not exist yet: we
> have written zero lines of Meta, TikTok, or Google campaign-management code.** We have read the
> write path — it is four creates plus a video upload on Meta's side — and the real gate is Meta's
> app review and a legal decision about whose ad account and whose money, not the code. **[FILL:
> engineer-days to first programmatic campaign — nobody who would build it has made an estimate.
> A number invented for an application is the exact failure this document exists to prevent, and a
> slot containing a guess is worse than an empty slot because it reads as sourced.]**
>
> **And the claim ladder has not moved.** Video → predicted brain activation is validated, by Meta,
> publicly, against real fMRI — not our work.
>
> Predicted network response → attention is our hypothesis, and it has one null and one positive.
> The pre-registered primary — the raw DMN arc against TVSum importance — came back **null**
> (Stouffer p ≈ 0.69, `docs/science/PREREGISTRATION-addendum.md:20`), and we report it. The
> *trained* read-out head **did** clear on the same dataset: leave-one-video-out median r ≈ **0.20**,
> Stouffer p ≈ **2.7e-4**, n = **15** videos (`validation/head_attn.json`). Said with its limits
> attached: that is against a human-interest proxy, on fifteen videos, and it is not ad performance.
> It is a real result and a small one, and it is the one positive validated result this company owns
> — we would rather state it with the caveats than let the ladder read as if we had none.
> *(Housekeeping before anyone diffs the repo: `docs/strategy/PLAN.md:23-24` records this artifact as
> deleted in `c8887f3`, while the file is present on disk today. Reconcile the tree before the figure
> is quoted to anyone — a number whose provenance the repo argues with itself about is worth nothing.)*
>
> Predicted response → commercial outcome is the thing Serve exists to test, and **three separate
> tests of it have already run — all at n = 29, all against proxy labels, and all three came back
> null.** The learned head: partial r = −0.13, permutation p = 0.548, with top-9 precision of 0.222
> against a chance rate of 9/29 ≈ 0.310, which is *below* chance (`validation/ad_backtest.json`).
> The arithmetic arc: partial r = 0.12, permutation p = 0.559
> (`validation/recheck/B-ads-temporal/ad_backtest_arc.log`). And six temporal shape features, of
> which nothing survives Holm correction (`validation/temporal_readout.json`). **Three, not one.**
> If a partner is going to count our nulls, we would rather they got the number from us.
>
> **One number in that file points the right way, and we would rather tell you than have you find
> it.** The same artifact records an exploratory hook-window summary at partial r = 0.33, p = 0.11
> (`exploratory.hook`; the arc-scored twin in
> `validation/recheck/B-ads-temporal/ad_backtest_arc.log` reads 0.39 at p = 0.059). We are not
> quoting either as a result, because we did not declare the hook window in advance and our own rule
> at `docs/science/PREREGISTRATION.md:39-42` forbids scanning for the best number after the fact.
> We are instead pre-registering the hook window as a named secondary endpoint, with an explicit
> multiplicity correction and the same |r| ≥ 0.10 floor, dated before the corpus run —
> **[FILL: filing date of `docs/science/PREREGISTRATION-hook.md` — not yet written]** — and we will
> report it whichever way it comes out.
>
> We ship the network breakdown as a *description* of what the model predicts, badged
> **predicted / relative / not validated against outcome**, and it stays a description until the
> outcome data says otherwise. Serve is how we get the data that could promote it to advice.

---

## What the customer actually buys — the offering, in one block

*(Short paste-ready answer. Use it where the application asks what the product is in plain terms,
and use it verbatim in a first sales call. Built directly on the founder's offering statement. Every
verb below is deliberately tensed: what exists is present tense, what does not is "will".)*

> **Soma is a platform that helps advertisers analyze creative, improve it, distribute it, and learn
> from performance — without piecing together separate scoring, editing and ad-serving tools.**
>
> You can buy one layer or the whole thing.
>
> **Analyze — working today, and the near-term commercial reality.** Upload a video. You get a
> per-second predicted cortical response read out through named brain networks, a per-shot diagnosis,
> and the window where a named network's predicted response falls to the bottom of that clip's own
> range. Every number is badged **predicted / relative / not validated against outcome**, because
> that is what it is.
>
> **Improve — working today, deliberately narrow.** Four operations — remove a shot, remove an
> adjacent pair, hoist a later shot forward, trim the head — rendered to a finished file with ffmpeg
> and re-scored, with each delta flagged **measured** or **estimate**. Heavier generation and editing
> is optional, partnered out, and explicitly not the wedge. We are not going to become your agency.
>
> **Serve — not built. Zero lines of campaign-management code today.** The intent is that you choose
> a budget and a goal and we place and test the creative across Meta, TikTok and Google, pass media
> through at cost, charge a flat fee, and report it back in one dashboard instead of three. What that
> buys *us* is the outcome label attached to the exact creative — which is the only way the diagnosis
> ever becomes a prediction rather than a description.
>
> The reason to sell it as one platform rather than three products: today a performance team buys a
> score from one vendor, edits in a second tool, buys media through a third, and no step tells the
> next one anything. The score never learns whether it was right.
>
> **Two facts that belong in the same breath as all of the above:** paying customers, zero; prices,
> not yet set. "Working today" describes the pipeline, not a book of business.

**The loop, in six steps — the compact rendering. Read step 6 carefully before you say it.**

| # | Step | Status today |
|---|---|---|
| 1 | Customer uploads an existing ad or an ad concept | **Works** — `/upload` → `/r/<token>`, 20–40 min, with a human having provisioned the GPU box first (`PLAN.md:30-32`) |
| 2 | Soma analyzes predicted attention and identifies the weak moments | **Works** — per-second network lanes and per-shot diagnosis, scored offline by us, human in the loop by design |
| 3 | Soma suggests or applies small improvements — stronger hook, cuts, audio changes | **Partly** — shot-level cuts, hoists and head-trims render and re-score today; audio operations are **[NEEDS BUILD]**, and "stronger hook" today means *remove the weak window*, not *write a new one* |
| 4 | Customer chooses a budget and a campaign goal | **Not built** |
| 5 | Soma places and tests the ad across platforms | **Not built** |
| 6 | Soma collects performance data and feeds it back, so future scoring improves | **Not built, and this is the one to be careful with** |

**Why step 6 needs the care.** It is the step that makes the whole loop worth building, and it is
also the step it would be easiest to describe dishonestly. Feeding realized outcomes back is the
**mechanism by which the predicted-response → commercial-outcome link would be earned.** It is not a
description of a link that exists. Three tests of that link have run — all at n = 29, all on proxy
labels, all null (the learned head, the arithmetic arc, and six temporal features of which nothing
survives Holm). Say: *"serving is how we find out whether the signal is real."* Never: *"serving
makes the model better at predicting your winners,"* which asserts the thing three of our own
experiments have so far failed to find.

**What the customer's week looks like — before and after.** This is the version to say out loud,
because it is a description of a workflow rather than a claim about a result.

> **Before.** You make the ad internally. You send it to Meta and spend money to find out whether it
> works. What comes back is platform analytics — accurate, aggregate, and about outcomes rather than
> about the creative, so there is no direct route from "this variant lost" to "change this." You make
> an edit, relaunch, wait, repeat. The loop is fragmented across three vendors and its cycle time is
> measured in campaign flights.
>
> **After.** Upload the creative. Get the attention analysis, the per-network lanes and the score.
> See the specific seconds and the specific shot the score is objecting to. Take the basic fixes —
> cuts, head-trims, hoists — as a finished file; take heavier work elsewhere if you want it, and we
> will say so. Then, once Serve exists, launch through Soma across channels, watch it in one
> dashboard, and keep updating the creative against live performance instead of against a quarterly
> post-mortem.

*(Honest framing of that pair: the "before" column is a true description of today's workflow. In the
"after" column, everything up to and including the finished file is real; everything from "launch
through Soma" onward is the plan. Do not blur the line — a partner who finds the blur will re-read
everything else in this application as advocacy.)*

---

## The problem

*(New answer. Replaces the pre-spend framing throughout the Idea section, `:370-398`.)*

> After the iOS privacy changes, targeting stopped being the lever and creative became the lever.
> A performance team now ships dozens to hundreds of paid-social video variants a month, and the
> only real feedback loop is to put money behind them and watch which ones die. That loop is
> expensive by construction: you find the losers by paying to run them.
>
> The tools that claim to fix this split into two groups that both stop short. Creative analytics —
> VidMob, Motion — tells you what happened after the spend, in aggregate, and never touches the
> media. Pre-launch scoring — Neurons, AdCreative.ai, VidCognition — gives you a number before the
> spend and then hands you back to your media buyer. Neither one closes the loop, so neither one
> ever learns. The scorer never sees whether its score was right; the analytics tool never sees the
> creative decision that produced the result.
>
> Meanwhile the diagnosis itself is too coarse to act on. "This ad scores 62" is not a note anybody
> can execute. The note a creative director can execute names *which few seconds, and which shot* —
> and to give that note you need the spatial and temporal structure of the response, not a scalar.
>
> So the customer sits between two vendors, neither of which learns from the other, holding a score
> they can't act on and an outcome they can't attribute. **[FILL: one verbatim operator sentence
> saying this in their own words, with permission to quote — from the dated outreach log. Use their
> sentence, not ours; a paraphrase of a conversation is not a quote.]**

---

## Why now

*(New answer. Four things. Each external fact has a row in the sourced appendix at the end of this
document; if a row is empty, the fact does not get said.)*

> Four things became true recently enough that this wasn't buildable before.
>
> **One — the brain model became public and good.** TRIBE won Algonauts 2025 (1st of 263 teams) and
> Meta open-sourced v2. Predicting a cortical response to arbitrary video used to require a scanner
> and a lab; now it requires a GPU and about four minutes per ad end to end (`demo/README.md:83`;
> the encoder-only figure our own plan budgets against is ~2.5 min/ad, `docs/strategy/PLAN.md:109`).
> We do not have to build the eye.
>
> **Two — creative is the lever, because targeting stopped being one.** Post-ATT, the marginal
> return on audience tuning collapsed and moved to the creative. That is a permanent structural
> change in where the value sits, and it happened after all the incumbent creative-testing tools
> were designed for a handful of hero brand spots a year.
>
> **Three — attention data has already started buying media, just not on the creative axis.**
> Adelaide's attention metric is live as pre-bid targeting inside Amazon's and Yahoo's DSPs;
> PubMatic and Equativ have adopted it. The market has accepted that an attention signal can drive
> a buying decision. But the IAB's own attention playbook says third-party signal is insufficient
> in CTV and walled gardens — and Meta and TikTok are exactly those walled gardens. The existing
> attention-to-buying loop structurally cannot reach where the video budget actually is. It can be
> reached from inside, by whoever holds the ad account. *(This is the strongest why-now in the set.
> Both external facts need appendix rows before it is said out loud.)*
>
> **Four — the standalone score has commoditised, which is the actual reason we pivoted.** A
> pre-launch creative score is now a **[VERIFY: current low-end monthly price band for pre-launch
> creative scoring — quoted from memory, no source located; get two vendor pricing pages with fetch
> dates]** product with a free tier. When the thing you were selling becomes a checkbox on someone
> else's plan inside a year, the standalone score is no longer a business, and vertical integration
> stops being ambition and becomes the only viable shape. That is a timing argument about the
> market, not about us.

*(Cut from this list, deliberately: the Meta / Google / TikTok API-tiering facts that used to sit
here. They are implementation notes, not market timing — and the companion strategy document
records that multiple developers report Meta's upgrade path failing to appear even when the criteria
are met, so presenting the threshold change as a tailwind in one document and as unreliable in
another is exactly the selectivity this packet exists to prevent. Those facts belong in the build
plan, carrying that qualifier with them.)*

---

## What is different and defensible

*(Replaces the "what we understand that they don't" block, `:421-443`.)*

> **1. No competitor we have found reads the map, and the closest one says so in writing.** VidCognition
> builds on the same public TRIBE model and their own `/science` page states that their hook score
> comes from a vision-language-model critique of the ad rather than from region-level brain data,
> and that the TRIBE curve they run on paid plans is a secondary directional panel the score is not
> derived from. The ground we're claiming has been publicly vacated by the party standing closest to
> it. The 20,484-vertex map is unclaimed. *(Fetched 2026-08-06 — appendix row required, and quote
> their page verbatim from the appendix rather than paraphrasing it in the room.)*
>
> Two engineering facts make that concrete rather than aspirational, and both now have a script and
> a committed artifact behind them: `tools/readout/lane_stats.py` writes `validation/lane_stats.json`
> with a `--check` mode, and every figure below is a field in that file.
>
> First, **the four lanes we ship are not one signal repeated — but they are more correlated than the
> full seven-network picture, and we will give you the four-lane number because that is what the
> product uses.** Across the four shipped lanes, folded over the 19 non-ad stimuli in `data/arcs/`
> (named in full two paragraphs down, because a lane figure without its stimulus set is a figure about
> nothing), mean off-diagonal correlation is **0.436** and the
> first principal component of the lane *correlation* matrix explains **63.4%** of the variance, so
> roughly a third of it is region-specific. (On the raw covariance matrix, where the highest-variance
> lane dominates, PC1 is 0.81 — we quote the equal-weighted one and the artifact holds both.) Across
> all seven Yeo networks the same statistics are 0.416 and 53.5%. **The four-lane numbers are the
> worse ones**, because dropping somatomotor, limbic and most of the control network removes the
> least-correlated columns. An earlier draft of this answer quoted the seven-network figures under a
> four-lane sentence; we caught it against the artifact, which is the whole reason the artifact
> exists.
>
> Second, **we found a real defect in our own default.** Over that same 19-stimulus set, the dorsal
> attention lane we shipped as the headline "Attention" number shares a mean r² of **0.593** with the
> visual lane (mean r = +0.75) — it was substantially re-detecting how bright and busy the frame was.
> The salience lane's mean r² against visual is **0.262**, and the higher-order lane's mean r is
> **+0.083**, flipping sign across stimuli from −0.49 to +0.80. That is the kind of thing you only
> find by looking at the whole map, and a competitor shipping one scalar cannot find it at all.
>
> **The stimulus set those numbers are over, said before you ask.** All of it is the 19 cached
> prediction arrays in `data/arcs/` — fifteen ~2-minute web clips and four COGNIMUSE features,
> 8,881 seconds at TR = 1.0 s. **Not one of them is an ad.** Ads are shorter, faster-cut and
> higher-contrast, and nothing here establishes that the visual-drive fraction transfers.
> `lane_stats.py` takes `--preds-dir` and can be pointed at the 29 scored ads in `data/ads/arcs/`,
> but **[FILL: the same six statistics folded over ad footage — no ad artifact has been committed,
> and until one is, these figures describe web clips and films, not the product's inputs.]**
>
> **And one more thing we would rather say than have found.** The four lanes above are Schaefer
> parcellation masks. The lanes on our public `/demo` page are built from a *different* atlas —
> Destrieux anatomical selections in `data/roi_mask_*.npy` — and the two do not agree. The demo's
> salience-equivalent lane and the shipped `salventattn` lane share a Dice overlap of **0.207**; the
> demo's attention mask against the real dorsal attention network is **0.509**, its next-largest
> overlap being somatomotor at 0.197. Worse, `roi_mask_memory`'s largest overlap with any Yeo-7
> network is **visual cortex at 0.242**. Every mask whose name asserts a network does pick that
> network as its best match, so the names are directionally right — but no legacy mask is
> interchangeable with the Schaefer lane of the same name, and we are not shipping a region-level
> claim off the legacy set. All seven Dice figures are in `validation/lane_stats.json`.
>
> **2. We will own the label, because we will run the campaign.** Everyone else in creative scoring
> has to ask the customer for their outcome data after the fact and mostly doesn't get it. We will
> get it from the ad account we operate, at the ad level, with breakdowns by placement, platform
> position and device — predicted network response and realized ROAS landing in the same row
> automatically. **That is the architecture, and none of it is built: zero lines of
> campaign-management code today.** Built, that corpus is the only thing in this answer a competitor
> cannot download.
>
> **The honest timescale, because the exciting version of this claim is wrong on a seed horizon.**
> The unit that matters for any claim that generalises across advertisers is **brands, not ads** —
> ads inside a brand share footage, production style, audience and pixel, so a held-out split has to
> be by brand. At five design partners the flywheel has n = 5 on the axis that counts, and a client
> month yields tens of labelled creatives, not thousands. Serving alone does not reach statistical
> power for years. **So the flywheel is not our seed-stage evidence; it is what makes the company
> defensible later.** Our seed-stage evidence is a public-corpus run we already own the data for:
> `data/ads/` holds 1,359 labelled ad videos with 1,359 baseline extractions, of which only 29 have
> been through the encoder. `docs/strategy/PLAN.md:104-118` scopes the rest at ~55 GPU-hours on one
> rented box, against a pre-registered floor of |r| ≥ 0.10 and a baseline bar that already moved
> (dumb ffmpeg features reach |rho| = 0.115 at p = 0.002 on the Meta subset). We are funding both,
> and we will not let the exciting one starve the decisive one.
>
> **3. We are honest about what that corpus is worth today: nothing. It has zero rows.** All three
> outcome tests we have run are null. We are not claiming a moat we hold; we are claiming that Serve
> is the only architecture that can build one, and that we will be running client media
> **[FILL: target date for first campaign under Soma's management — no date has been set]** while
> the pure-scoring companies are still emailing customers asking for a CSV.
>
> **4. The honest constraint on #2, stated before diligence finds it.** Meta Developer Policy 10.7b
> reads: *"Only use data from an end-advertiser's campaign to optimize or measure the performance of
> that end-advertiser's Meta campaign,"* and 10.7d: *"Don't mix data obtained from us with
> advertising campaigns on different platforms."* As literally written, that restricts pooling
> outcome labels across clients — the exact thing we just said is the asset.
>
> **We are not going to oversell the way out.** Section 10.7 contains one qualifier — *"unless the
> terms for that product allow it explicitly"* (10.7a and 10.7d) — and no written-approval clause;
> the *"as otherwise approved by Meta in writing"* language is in **10.5**, which governs ad-account
> combination, not data use. And 10.7a is a prohibition with a narrow exception, not a door: it
> permits aggregate-and-anonymous use *"only to assess the performance and effectiveness of the end
> advertiser's campaigns,"* which on its face does not reach pooled cross-client model training.
> **[NEEDS EVIDENCE — no published route from 10.7 to a pooled corpus has been identified.]**
> **[FILL: outcome of the written question to Meta's partner team — the question has not been asked;
> record date asked and date answered.]** We would rather put this to Meta before writing serving
> code than after, because it costs an email and it changes the architecture. The constraint binds
> Meta-sourced data specifically; the predicted-response side is ours. TikTok and Google carry their
> own terms, **[FILL: TikTok and Google data-use clauses — not yet reviewed; either could be
> stricter.]**

---

## How do or will you make money? How much could you make?

*(Replaces `YC-APPLICATION.md:445-481` in full.)*

> **One product, three lines of revenue, and the media is not one of them.**
>
> **Media at cost, always, and the fee is flat.** We pass ad spend through without markup, and our
> fee is not a percentage of it. A monthly platform fee per managed brand, a per-asset fee per
> creative scored, a per-file fee per recut delivered. That is a positioning decision and it is the
> load-bearing one in this whole document: an agency that takes a percentage of spend is paid more
> when it spends more, and every client knows it. A percentage fee would have exactly the incentive
> gradient our own pitch condemns, and it would falsify the strongest sentence we have. With a flat
> fee the sentence is literally true: **our fee never rises when your budget rises — we are the
> only party in your chain with no reason to want your money spent.** It also means our revenue line
> is never inflated by other people's media, which is the honest way to report it, and it means our
> revenue does not inherit the client's budget volatility.
>
> **What we charge for:**
> - **Analyze** — per creative scored, or a monthly bundle. The comparison band is creative-analytics
>   tooling, which publishes prices. **[VERIFY: Motion's current published price tiers, with a fetch
>   date — quoted from memory in an earlier draft and pulled out; get the pricing page.]**
> - **Improve** — per finished file. Deliberately capped in scope so it does not become a
>   headcount-linear editing shop.
> - **Serve** — the monthly platform fee per managed brand, which is the main line. The comparison
>   set still prices on spend — **[VERIFY: Smartly.io's fee structure, source and fetch date]**,
>   **[VERIFY: the performance-agency percentage band, with a primary source rather than a survey
>   aggregator]** — and part of the sale is that we do not. **[FILL: our actual monthly fee per
>   managed brand and per-asset price — the founders have not set these numbers and we are not
>   going to invent them for an application.]**
>
> **The randomised holdout, and who pays for it.** The flywheel needs a randomly-assigned control
> arm — creatives the model ranks low, run anyway, so the corpus has both tails. Spending a client's
> budget on creative we predict will lose, in order to build a training asset *we* own, is an
> undisclosed conflict of interest and the exact inverse of the paragraph above. So **the client's
> monthly fee is reduced by the same percentage as the holdout fraction** — a 10% holdout means a 10%
> lower fee, every month — **plus a second term that is zero today.** The second term compensates the
> client for the measured gap between the score-selected arm and the randomly-assigned one, and it
> only becomes non-zero once we can demonstrate that a gap exists. We have failed to demonstrate it
> three times in public, so today it is exactly zero and the rebate is the flat fee times the holdout
> fraction — nothing more. **Soma bears the cost of the experiment Soma benefits from.** It is
> disclosed in the MSA and it is disclosed in the pitch, because an arrangement that only works
> undisclosed is not an arrangement, it is a problem waiting.
>
> *The awkward part, said rather than found.* That second term, on the day it is non-zero, is the
> only spend-linked number anywhere in our contract — and it only ever **reduces** what Soma is paid.
> Today it is zero and the flagship sentence above is literally true as written. The day we switch it
> on, the sentence tightens to **"our fee never rises when your budget rises,"** which is the form
> that survives forever; or we express the term as a flat credit and keep the original wording.
> Either is fine. Leaving a spend-linked term quietly inside a contract whose whole pitch is that it
> has none is not.
>
> **Why the fee is priced on value and not on cost.** Passing media through at cost is about the
> media, not about us — it removes the perverse incentive. The intelligence fee is priced on what
> the creative decision is worth, which is the difference between the campaign you would have run
> and the one we ran. Once we are serving, that difference is measurable rather than argued.
>
> **Unit economics we can already see, and the one we can't.** GPU cost per ad is bounded and small.
> One ad is about four minutes end to end (`demo/README.md:83`); the encoder step our own plan
> budgets against is ~2.5 min/ad (`PLAN.md:109`), and the plan rents an A100 at $1–2/hr
> (`YC-APPLICATION.md:318`) — which is **four to eight cents of GPU per ad**, with everything
> downstream of the encoder on CPU. **`[ESTIMATE — derived from two committed repo figures, not
> measured on a box.]`** **[FILL: the measured per-ad figure from a timed run on the provisioned box
> — a serving business should hold the measurement, not only the arithmetic.]** The part that has to
> scale nonlinearly is human time per account, and that is the number to watch: **[FILL: human
> minutes per managed account per week — measured on the first managed account, not estimated.]**
>
> **Market size.** We do not have a defensible number and we are not going to assert one. It has to
> be built bottoms-up — target brands in the beachhead × brands per rep × fee per brand — and
> **[FILL: bottoms-up TAM with each input sourced; `PLAN.md:241` already records that no TAM exists
> anywhere in our docs.]** What we can say without a slot: the budget we are attaching to is media
> spend, not research spend, and media spend is the larger of the two by a wide margin at every
> brand we have talked to.
>
> **The licensing constraint, named and unresolved, and it is not only our problem.** Meta's TRIBE v2
> weights *and* code are CC-BY-NC-4.0, and Meta publishes no commercial-licensing path. Charging for
> a creative decision made by a non-commercial model is a more direct commercial use than selling a
> research report, not a lesser one — so Serve sharpens this constraint rather than dodging it.
> **And the exposure is not only ours: a recut we deliver becomes the client's commercial asset,
> produced with a non-commercially-licensed model, and their counsel will find that before ours
> does.** So we are gating it earlier than is comfortable. `PLAN.md:328` (gate 4) says the fallback
> backbone must be named before we quote anyone a price; Serve does not move that gate, it makes it
> load-bearing, and the client-side exposure moves it earlier still: **before the first Improve file
> is delivered to any client for use in a live campaign, paid or unpaid.** We have *not* determined
> whether an unpaid design-partner pilot is commercial use under CC-BY-NC-4.0, and we are not going
> to reason our way to an answer internally. **[FILL: named permissively-licensed fallback backbone,
> with a cost and a timeline — gate 4 at `PLAN.md:328`, still empty.]** **[FILL: counsel's written
> read on (a) whether an unpaid design-partner pilot is commercial use, and (b) the client's own
> derivative exposure from running a recut we produced.]** The MSA discloses the model's licence
> status to the client in writing at onboarding. Disclosing it ourselves is survivable; having it
> found by a brand's legal team is not, and that is the kind of thing that ends a pilot and then
> three other conversations.

---

## Are people using your product? / How far along are you?

*(Amends `:266-301` and `:330-333`. This is where the founder's "lots of interest" line has to live,
rendered so it survives contact with a partner.)*

> **Analyze:** working end-to-end for a signed-in user, offline-scored by us, human in the loop by
> design. The number a partner will ask for, stated before they ask: **29 ads have per-vertex
> encoder outputs committed in this repo** (`data/ads/arcs/`, 29 `preds_meta_*.npy`), and all 29 are
> from a scraped Meta corpus — **none from a customer, none from a design partner, none anyone paid
> for.** Their outcome column is `days_running`, an ad-longevity proxy, not a performance measure;
> we verified that `primary_label == days_running` for all 655 Meta rows in
> `data/ads/ad_performance.csv`. The 704 TikTok rows in the same file carry `ctr_index` — a
> **relative** click-through index in [0,1], 97 distinct values on a 0.01 grid — which at least
> varies where `days_running` only counts days. It is still a proxy and our own scraper says so in
> capitals: the label is "performance index in [0,1] (NOT a raw click rate)"
> (`ad_performance.py:14-17`), the corpus is TikTok's *Top Ads* showcase — an already-curated set of
> strong performers — so a label means "how strong AMONG strong ads", not "winner vs loser"
> (`:34-38`); and the companion `ctr_percentile` column is a constant 0.99 on every row, degenerate
> by construction. **None of them has been scored yet.** That is the run.
> **[FILL: total ads through a real TRIBE forward pass on the provisioned box, including runs whose
> outputs are not committed — the repo can only prove 29.]** **Paying customers: zero.**
>
> **Improve:** working in the narrow form — real shot detection, real ffmpeg renders, real re-scored
> deltas, with every row flagged measured or estimate.
>
> **Serve:** not built. Zero lines of campaign-management code today.
>
> **Demand, stated so it can be checked.** We have talked to **[FILL: N people at M companies —
> counted from a dated outreach log, not from memory]** about this. **[FILL: K of them]** raised,
> without being prompted, that they would rather buy scoring and media from one place than stitch a
> scoring vendor to an agency. **[FILL: Q of them]** said something we can quote with their written
> permission. **[FILL: L]** have agreed to be design partners on the Serve pilot.

**Note on the "we've had a lot of interest" line — read this before you say it out loud.**

"We've gotten a lot of interest and talked to a lot of people who want an end-to-end platform" is
the single easiest sentence in this application to get destroyed on, because the follow-up is
always "how many?" and there is no good answer to that except a number. The sentence is *probably
true*. That is not the same as being sayable.

**The countable version — this is the sentence, and it is the only form of it that goes in the
application or gets said in the room:**

> *"We've had this conversation with **[FILL: N]** operators at **[FILL: M]** companies since
> **[FILL: start month]**, and **[FILL: K]** of them raised the end-to-end problem before we
> described it."*

Two of those four slots are the claim; the other two are what makes it checkable. The version
without numbers is not a weaker version of this sentence, it is a different sentence — "a lot" is
a number you have decided not to disclose, and every partner hears it that way.

**What makes it safe to say, in ascending order of strength:**

1. **A dated outreach log** — one row per conversation: date, person, company, role, the one-line
   ask in their words, and a yes/no on whether they raised end-to-end unprompted. This is what turns
   "a lot of people" into "twenty-three people at nineteen companies since June." Cheapest possible
   artifact, highest possible return, and it should exist by tomorrow. **Until this file exists, N,
   M and K are not knowable and the sentence does not get said in any form.**
2. **The unprompted tally kept separately** from who agreed with it after you described it. Those
   are different numbers and only the first one is evidence. K is the interesting number precisely
   because it is the small one.
3. **Two or three verbatim quotes with written permission to use them.** One real sentence from a
   growth lead beats any adjective, and permission is what makes it quotable rather than hearsay.
4. **A signed, non-binding design-partner LOI for the Serve pilot.** This is the one that ends the
   conversation, because it is a person putting their name on wanting the thing.

**Why this is worth the discipline rather than being pedantry about a throwaway line.** The
strongest thing in this whole packet is that we report our own nulls. A partner who catches one
soft, uncountable claim will re-read every hard one — including the nulls — as advocacy. "A lot of
people" costs more here than it would in an application that had nothing to protect.

---

## Founder video — revised script

*(Replaces `:154-174`. Same length, same one-take format.)*

> "Hi — we're Mukilan, Aayaan, and Aarya, the founders of **Soma**.
>
> Meta open-sourced a model that predicts the brain's cortical response to video — it won the
> Algonauts 2025 benchmark, first of 263 teams, checked against real fMRI. It outputs a value at
> twenty thousand points on the cortex, once per second — **a prediction from the file, not a scan
> of anyone's brain, and a group average, not a person.** Everyone using it, including us until
> recently, collapses that to one number and throws the rest away.
>
> We read the map. So instead of 'your ad scores a 62,' we can say: the predicted salience-network
> response drops to the bottom of this clip's own range between three and eight seconds — that's
> shot four of eleven. Cut it, and here's the recut, re-scored.
>
> And then we run it. Soma places the ads for the client — Meta is the one we're building, the
> others follow the same shape — passes the media through at cost, and charges a flat fee. Flat
> matters: our fee doesn't move when your budget moves, so we're the only party in the chain with
> no reason to want your money spent. And when we run the campaign, we get the outcome attached to
> the creative automatically. Predicted brain response in, real ROAS out, same row. Nobody selling a
> score has that, because they hand you back to your media buyer and never find out if they were
> right.
>
> We're honest about where we are. The scoring works and runs today, and our trained read-out head
> does clear on a public human-interest dataset — fifteen videos, a real result and a small one. The
> serving is scoped and not built. And we've tested this score against actual ad outcomes three
> separate ways, at twenty-nine ads each, and all three came back null. We published all three. We'd
> rather earn the claim than assert it, and serving is how we earn it.
>
> We'd love to build the rest with YC."

**Two things the script must not drift back into.** It says "a prediction from the file, not a scan
of anyone's brain" because honesty rule 5 at `YC-APPLICATION.md:28-29` requires it and the current
approved script already carries it — a replacement that drops it is a regression, not an edit. And
it says "shot four of eleven," not "where the product card replaces the face," because we have no
face detection, no content labelling, and OCR/ASR are off in the only report we have shipped. The
shot index is real; what is on the shot is not something we can currently say.

---

# THE BEFORE / AFTER DEMO — spec and the rule that governs it

*(Not application prose. This is the presentation asset that goes alongside the video, and it is the
single most dangerous artifact in the packet, because a comparison table is exactly the shape that
invites an invented number. Build it to this spec or do not build it.)*

**The side-by-side.**

| Without Soma | With Soma |
|---|---|
| Customer launches an original ad via Meta | Customer uploads the same ad to Soma |
| Meta campaign / dashboard view | Soma analysis: heatmap, per-network attention lanes, overall score |
| Platform metrics and campaign cost | Soma's recommended change and the revised creative |
| Results from the original version | A/B test or comparison against the improved version |
| Limited creative feedback loop | Ongoing loop: analyze → improve → serve → learn |

**Presentation assets:** a reference Meta dashboard and a Soma dashboard mockup, plus an original
and an improved version of the same ad. The metric story compares **spend, impressions and
performance outcomes**, and the point it is making is that Soma gives more direct creative guidance —
not that Soma produced a better outcome. The worked example uses a fictionalized client and roughly
**$1K/month** of illustrative ad spend.

**One word in that table needs building or relabelling before the slide exists: "heatmap."** The
string does not appear anywhere in this repository. What the pipeline produces today is per-second
per-network lane traces plus a per-shot diagnosis (`public/preflight/batch_report.json`), and the
cortex visual on the site is labelled decoration (`YC-APPLICATION.md:321`). Either build the heatmap
and show the real one, or write the cell as "per-second attention lanes" — which is what we have and
is a perfectly good cell. **[NEEDS BUILD: a heatmap rendering, if the word is going to stay on the
slide.]**

### MANDATORY labelling constraint — this is not a style note

A fictionalized client and an illustrative spend figure are legitimate presentation devices. This
repository also has a documented history of exactly this failure mode: `docs/strategy/PLAN.md` §0.3
catalogues invented design-partner counts and a logo wall of non-customers, all still live on the
site. So the following are conditions of the artifact existing at all:

1. **The client must be visibly fictional on the artifact itself** — in the frame, not merely known
   to be fictional by whoever is presenting. Label it: *"Illustrative example — not a customer."* A
   screenshot outlives its presenter.
2. **The $1K/month spend and every downstream metric must be marked illustrative** on the slide, and
   must never be presented as a measured result or as a Soma outcome.
3. **The "With Soma" performance column must not show a fabricated lift.** Either leave the outcome
   cells explicitly empty pending a real campaign, or show only what is real — the analysis output
   and the recut, both of which exist.
4. **If a real corpus ad is used as the creative** — for example `data/ads/videos/tt_09.mp4`, a real
   brand's spot from the scraped corpus — the brand is anonymised, or the frame states that the brand
   is not a Soma customer and did not participate. Never pair a real brand's footage with an invented
   spend story.

**And the version that is actually strongest.** Left column real: a real ad and its real
platform-side reality. Right column real: the real analysis and the real recut, both of which the
pipeline produces today. Outcome row marked **"pending first live campaign."** That is more
persuasive to a YC partner than a fabricated lift, and it is the only version that survives the
follow-up question every good partner asks, which is *"can I see the artifact?"*

---

# THE INTERVIEW KILLERS — prepared answers

*(Replaces `:559-607`. Each answer leads with the strongest true fact.)*

### 1. "So you're an ad agency? Agencies don't scale."

> Agencies don't scale because the unit of production is a human account manager and the unit of
> revenue is a percentage of someone else's spend. We inverted both. Our fee is flat — a monthly
> platform fee per brand plus per-asset pricing — and media passes through at cost, so we have no
> incentive to spend more and our revenue does not require us to move budget. And the thing we sell
> is a model output, not a person's judgment: the diagnosis of which network's predicted response
> fell, and in which window, is produced by a GPU in about four minutes, and the recut is produced
> by ffmpeg from that diagnosis using four enumerable operations.
>
> What is genuinely human today is the concierge layer — someone runs the batch and someone reviews
> the recut. We know that is the number that decides whether this is software or a body shop, so we
> are measuring it from account one: **[FILL: human minutes per managed account per week — measured
> on the first managed account, not estimated. Same slot as in the money answer; fill both from one
> measurement.]** If that number is flat as accounts grow, we have a
> services business with a good margin. If it falls, we have a software business. The plan is built
> for it to fall, and the reason we capped the Improve tier so aggressively — surgical fixes only,
> heavier editing partnered out — is precisely to keep an editing shop from growing inside the
> company.
>
> The honest version: today we are a services company with an unusually good asset. The framing we
> are working from — **[VERIFY: YC's published piece on AI-native service companies, with the URL
> and the exact wording, before paraphrasing it to a YC partner. The 30%-to-50%+ margin framing is
> quoted from memory and the audience is the one group guaranteed to know whether it is quoted
> correctly.]** — is that the trajectory has to be believable rather than already achieved. Our
> trajectory argument is that every marginal account adds GPU-seconds and API calls, not headcount,
> and that the model gets better with each one, which is the opposite of how an agency works.

### 2. "Why wouldn't Meta just do this?"

> Meta has all of it — the encoder is theirs, the ad account is theirs, the outcome data is theirs.
> If they wanted to ship brain-based creative diagnostics inside Ads Manager, nothing stops them.
> We say that plainly rather than pretending there is a technical barrier.
>
> Three reasons we think they won't, in order of how much I'd bet on them.
>
> **They published the model instead of productizing it.** TRIBE was released as research under a
> non-commercial license by FAIR, not shipped by the ads org. Meta's ads business optimizes
> delivery — who sees the ad, when, at what price — not the creative itself. Their creative tooling
> is generative and volume-oriented, because more creative means more auction inventory. A tool
> whose output is "run fewer, better variants" is orthogonal to how that business makes money.
>
> **They are structurally single-platform, and we are not.** Our value to a client includes deciding
> whether the dollar goes to Meta or TikTok. Meta will never build the thing that routes spend away
> from Meta. That is also the honest reason a client would rather have us hold the account than have
> Meta's own recommendation engine do it.
>
> **The creative is not theirs to touch.** Meta can tell you an ad underperformed. Recutting a
> brand's footage and handing it back is a service relationship with the brand's creative team, and
> Meta does not have that relationship with the long tail.
>
> The risk I can't dismiss is that they ship a good-enough version inside Ads Manager for free and
> compress the diagnostic to a commodity. My answer is that the diagnostic is not the durable asset
> anyway — the corpus of predicted-response-to-realized-outcome pairs across platforms is, and that
> one Meta structurally cannot build, because they cannot see TikTok.

### 3. "Your signal is a proxy for a proxy. Why should I trust a brain model over a live test?"

> You shouldn't, and we don't ask you to. A live test is ground truth. Our model is a prediction of
> a group-average cortical response, made by an encoder whose own accuracy against real fMRI is
> around 0.21 mean Pearson — and that figure is Meta's Algonauts benchmark in Schaefer-1000, a
> different parcellation and a different space from the 400-parcel surface we read out from, so we
> do not actually know how well it predicts the specific regions we sell. Our pre-registered test of
> whether one region's *raw arc* tracks human interest came back null. The one thing on our side of
> the ledger that did clear is the trained read-out head on TVSum — leave-one-video-out median
> r ≈ 0.20, Stouffer p ≈ 2.7e-4, n = 15 (`validation/head_attn.json`) — which is a human-interest
> proxy on fifteen videos, not ad performance, and I would not want you to hear it as more than that.
> I lead with all of it because it is the honest shape of the thing.
>
> The signal is not a replacement for the live test. It is a **candidate prior on what to test** —
> and I want to be precise that "candidate" is doing real work in that sentence. A live test tells
> you the truth about the four variants you happened to run. It cannot tell you which four to run,
> and it charges you real money to discover that three of them were bad. That discovery cost is the
> thing we want to attack. *If* a brain-based prior improves the hit rate of the variant set you put
> into the auction, it pays for itself in spend not wasted, and it would not have to beat the auction
> to be worth having — only to beat guessing. **We have tested exactly that and it did not beat
> guessing: top-9 precision of 0.222 against a chance rate of 0.310, at n = 29.** So this is a
> hypothesis with an adverse preliminary result, not a feature.
>
> And there is a second thing the live test cannot do at any price: tell you *where*. A live test
> says variant B lost. It does not say the predicted salience response fell to the bottom of that
> clip's own range across shot four of eleven. That is a note a creative director can act on; "B
> lost" is not. (What we cannot yet say is what is *on* shot four — that needs a detector we have
> not built.)
>
> The reason we are building Serve is precisely that this argument should not have to be made
> rhetorically. Once we run the campaigns, we can answer it with a number: did the ads our prior
> ranked highest actually outperform, over a real spend, controlling for a dumb baseline. That test
> does not exist yet; we have run three retrospective cousins of it, and all three were null at
> n = 29. Serve is how it becomes answerable.

**Before this answer is said out loud, one housekeeping item.** It quotes `validation/head_attn.json`
(median leave-one-video-out r ≈ 0.20, Stouffer p ≈ 2.7e-4, n = 15 TVSum videos). The file is present
on disk today, and `docs/strategy/PLAN.md:23-24` records it as deleted in `c8887f3`. Both are true as
written and the repo therefore argues with itself about the provenance of the one positive number we
own. Reconcile the tree — restore-and-note or amend `PLAN.md` — before the figure is quoted to
anyone. A partner who greps for the artifact and finds the deletion note will treat every other
citation in this packet as suspect, and they would be right to.

### 4. "$1,000 of real signal beats $100 of fake signal. Why are you not just worse and cheaper?"

> That objection kills the old company and I'd make it myself. The old pitch was "our test is
> cheaper than Meta's" — a straight-line undercut, which invites exactly this and loses.
>
> The new answer has two parts and only one of them is proven today. I'll give you the proven one
> first because it is the one that doesn't depend on our science being right.
>
> **The proven part is structural.** We are not selling you a cheaper test — we are running the real
> test. The thousand dollars of real signal you're describing is the money you spend on Meta to learn
> which creative works. We spend it, we pass it through at cost, and our fee is flat: a monthly
> platform fee per brand plus per-asset pricing, not a percentage of the thousand dollars. **That
> makes us the only party in your chain with no reason to want your money spent** — not Meta, whose
> revenue *is* the spend; not your agency at ten to twenty percent of it; not us. That claim is true
> on the day we sign, it does not require you to believe anything about neuroscience, and it is a
> contract term rather than a result.
>
> **The unproven part is the interesting one, and it is a hypothesis.** We think a brain-based prior
> lets you find the winner across fewer arms, so more of the thousand goes to variants with a reason
> to win rather than to discovering losers. We have tested that three separate ways on the same
> twenty-nine retrospective ads and **all three came back null.** The learned head did not beat
> loudness, cuts, luminance and motion at predicting rank — partial r = −0.13, permutation p = 0.548,
> with a top-9 precision of 0.222 against the 0.310 you would get drawing at random. The arithmetic
> arc did no better: partial r = 0.12, p = 0.559. And of six temporal shape features, nothing survived
> Holm correction. They are in `validation/ad_backtest.json`,
> `validation/recheck/B-ads-temporal/ad_backtest_arc.log` and `validation/temporal_readout.json`,
> and I would rather hand you the three files than have you find them.
>
> **Here is what we are doing about it, and it is cheap.** We already hold 1,359 labelled ad videos
> with baseline features extracted for all of them; only 29 have been through the encoder, and all
> 29 are Meta ads whose label is `days_running` — an ad-longevity proxy, not a performance measure.
> 704 of the rows are TikTok ads carrying `ctr_index`, a relative click-through index in [0,1] with
> 97 distinct values — a label that actually varies. It is still a proxy, and our own scraper says so:
> "NOT a raw click rate" (`ad_performance.py:14-17`), and the corpus is TikTok's *Top Ads* showcase,
> so a label means "how strong AMONG strong ads", not "winner vs loser" (`:34-38`). Scoring them
> takes n from 29 to about seven hundred — 704 TikTok rows, **673** after the corpus's own exclusions
> (28 long-form clips over 180 s and 3 silent) — and swaps a longevity proxy for a performance-ranked
> one. **A materially better test, not a clean one.**
>
> And the reason we ultimately have to run the campaigns ourselves is written into our own scraper,
> by us, months before we knew we were going to pivot: *"For a real winner/loser test you want ads
> that failed too, which this source does not expose — a design partner's own CPA on their own ads
> remains the gold standard"* (`ad_performance.py:39-40`). Every public ad corpus is survivor-biased.
> Serving is the only way to observe the ads that lost.
>
> **And the price of it is the part I want you to hear.** At the repo's own figures — ~2.5 min/ad
> (`PLAN.md:109`) over ~673 ads, on a $1–2/hr A100 (`YC-APPLICATION.md:318`) — that is roughly **30
> GPU-hours and $30–60**. **`[ESTIMATE — derived from two committed repo figures, not measured on a
> box.]`** (Sweeping the ~1,330 corpus ads that still lack features is ~55 GPU-hours,
> `PLAN.md:106-109`.) **The
> experiment that decides whether our science is real costs about fifty dollars, and we have not run
> it yet.** The effect floor is pre-registered at |r| ≥ 0.10 and the baseline bar has already moved:
> dumb ffmpeg features reach |rho| = 0.115 at p = 0.002 on the Meta subset, so beating zero is not
> the test.
>
> **And if it is null again, I will tell you that too.** In that world we are an honestly-incentivised
> media operator with a diagnostic nobody else sells and no evidence it predicts outcome — which is
> a smaller company than the one I'm describing, and still a real one, because the structural half
> of this answer does not depend on the science half.
>
> The old pitch also had a ceiling this one doesn't: a pre-test is a line item in a research budget,
> which is small and belief-dependent — the buyer has to trust our science to spend anything. Media
> is a budget that is already being spent, and the buyer only has to look at the outcome. Nobody has
> to believe our neuroscience for us to get paid; they have to see the campaign work. That is a much
> shorter sale.

### 5. "What stops your customer from taking the insight and buying media themselves?"

> Nothing stops them, and some will. Here is why we think it's a bad trade for them, and where we
> are genuinely exposed.
>
> The insight is not a document, it's a loop. What you get from us is not "cut at 0:04" — it's score,
> recut, re-score, serve four variants, measure, and feed the result back so the next batch is
> better. Taking one insight and leaving means you get one cut of one ad and then you're back to
> guessing. Staying means the model that scores your ads has seen your outcomes. The switching cost
> is the accumulated fit to their own account, and it grows the longer they stay.
>
> Where we're exposed, honestly: the client owns and funds the ad account, so they can revoke our
> access instantly and keep everything. We chose that architecture on its own merits — we act as
> agent rather than principal, we hold no float, we carry no chargeback exposure, and the client can
> fire us in an afternoon, which is a thing worth being able to say to someone deciding whether to
> hand you their budget. *(We had also cited Meta policy 10.5 as forcing this. It does not, quite:
> 10.5 says don't combine multiple end advertisers in one ad account **"unless you meet the
> requirements described here or as otherwise approved by Meta in writing,"** and "here" links to a
> published criteria page. **[NEEDS EVIDENCE — that criteria page has not been read; whether Soma
> could qualify is unknown.]** The architecture stands on the four reasons above without needing
> 10.5 to be absolute.)* We are not building lock-in through hostage assets and we don't want to.
> If the loop isn't worth more than the insight, we deserve to be left.
>
> **What does accumulate is boring and real.** After six months on an account we hold a per-brand
> history of predicted responses, delivered cuts, frozen predictions made before the spend, and
> realized outcomes — on their footage, their audience, their pixel. A replacement vendor starts that
> at zero, and so does the client if they take it in-house: the model that has seen their outcomes is
> worth more to them than the same model cold. I am not calling that a moat. It is a switching cost
> that grows monthly, and we got it without building a hostage asset.
>
> The other retention fact, and it is the flat fee again: because we don't charge a percentage of
> spend, our revenue doesn't swing when their budget swings. A percentage fee inherits the client's
> budget volatility and reads as churn that has nothing to do with whether the product worked.
> **[FILL: our monthly fee against what the same brand pays an agency to push the buttons — fill
> once the fee is set; today neither number is in hand.]**

### 6. "You can't use TRIBE v2 commercially."

> Correct, as things stand, and it is written down in our own strategy docs rather than discovered
> in diligence. TRIBE v2's weights **and code** are CC-BY-NC-4.0, and Meta publishes no
> commercial-licensing path. There's a second license underneath it: the text branch uses
> Llama-3.2-3B under the Llama 3.2 Community License, which does permit commercial use but requires
> "Built with Llama" attribution and a name-prefix on derivatives.
>
> Serve makes this constraint sharper, not softer. Charging for a creative decision that came from a
> non-commercial model is a more direct commercial use than selling a report. We are not going to
> argue our way around that.
>
> **And the exposure is not only ours.** A recut we deliver becomes the client's commercial asset,
> produced with a non-commercially-licensed model, and it sits on their balance sheet, not ours.
> Their counsel will find that during MSA review before ours does. So the MSA discloses the model's
> licence status in writing at onboarding — disclosing it ourselves is survivable, having a brand's
> legal team find it is not.
>
> Three things make it a bounded problem rather than an existential one.
>
> **What transfers cleanly is the outcome corpus — and only that.** Creative paired with realized
> commercial outcome is encoder-free and survives any backbone change. The read-out head does **not**
> transfer: it is a fitted function of TRIBE's specific 20,484-dimensional output space, so swapping
> backbones means refitting it and re-running the new encoder over every historical video, which
> also invalidates every cached prediction we hold. I want to be exact about that because the
> zero-GPU-cost compounding property we claim elsewhere is conditional on the encoder never changing,
> and that is in direct tension with this mitigation. The arithmetic says the re-run is affordable —
> ~2.5 min/ad (`PLAN.md:109`) at $1–2/hr (`YC-APPLICATION.md:318`) is four to eight cents an ad
> **`[ESTIMATE — derived from two committed repo figures, not measured on a box]`** — but that is a
> derivation and not a measurement, and it prices only the GPU, not the refit or the engineering.
>
> **"Good enough for a read-out" is a much smaller target than winning Algonauts.** We don't need
> state of the art; we need a video encoder whose representation supports the same region-level
> read-out, and that is an engineering swap onto an existing permissively-licensed backbone, not
> the scanner-scale work of training a brain encoder from scratch. **[FILL: named fallback backbone
> with a cost and timeline — gate 4 at `PLAN.md:328`, still empty.]**
>
> **We will ask Meta in writing, and we will not present the ask as a route.** No commercial path is
> published; they may decline. **[FILL: date asked, date answered, outcome — the question has not
> been asked.]**
>
> **The gate, stated once and identically everywhere we state it.** `PLAN.md:328` (gate 4) puts the
> named fallback backbone before we quote anyone a price. Serve does not move that gate, it makes it
> load-bearing — and the client-side exposure above moves it earlier still, to **before the first
> Improve file is delivered to any client for use in a live campaign, paid or unpaid.** We have
> **not** determined whether an unpaid design-partner pilot constitutes commercial use under
> CC-BY-NC-4.0. An earlier draft of this answer asserted that it does not; that was an unadvised
> legal conclusion presented as a company decision, and it is withdrawn. **[FILL: counsel's written
> read on (a) whether an unpaid design-partner pilot is commercial use, and (b) the client's own
> derivative exposure from running a recut we produced — obtain this, do not reason about it
> internally.]**

### 7. "How is this a marketplace?"

> It isn't, and I'd rather say that than defend a frame that fails on the first follow-up.
>
> A two-sided marketplace connects two groups that need each other and doesn't sell anything itself.
> Meta and TikTok are not a second side — they're suppliers, and they do not need us to find
> advertisers. There's no cross-side network effect and there was never a chicken-and-egg problem to
> solve, which also means none of the defensibility a real marketplace would have. Calling it one
> would be borrowing credit we haven't earned.
>
> What it actually is: **a vertically integrated, single-sided company with a proprietary data
> loop.** We sell one thing to one group — advertisers — and we own every step from creative
> diagnosis through media execution to outcome measurement. The defensibility isn't network effects,
> it's that owning all three steps is the only way to get the training data that links a predicted
> brain response to a realized commercial outcome, and that data compounds — on a horizon measured
> in years, because the unit that counts is brands and a client-month yields tens of creatives, not
> thousands. That is a weaker claim than "marketplace" and a truer one, and it survives being pushed
> on.
>
> There is a marketplace *available* here — advertisers on one side, freelance editors and boutique
> creative shops on the other, with us scoring and matching. We've considered it and we're not doing
> it. Editing partners are subcontractors, which is supply, not a second side, and running a
> two-sided business is a different company from the one we're describing. Naming it and killing it
> is cleaner than leaving it in the deck as an option.

### 8. *(Bonus — the one nobody warned you about)* "Meta's platform policy says you can't pool client data for training."

> That is the sharpest question about this business and I'd rather answer it than have it found.
> Meta Developer Policy 10.7b says: only use data from an end-advertiser's campaign to optimize or
> measure the performance of *that* end-advertiser's Meta campaign. 10.7d says don't mix Meta data
> with campaigns on other platforms. As literally written, that restricts the pooled cross-client,
> cross-platform corpus I just described as our asset.
>
> Three things about it.
>
> **We found this before writing serving code, not after.** It is the first thing to put to Meta's
> partner team in writing, because it costs an email and it changes the architecture.
> **[FILL: date asked / date answered / their response — not yet asked.]**
>
> **I am not going to overstate the way out, because a diligence lawyer will read 10.7 in five
> minutes.** Section 10.7 contains exactly one qualifier — *"unless the terms for that product allow
> it explicitly,"* in 10.7a and 10.7d — and **no written-approval clause**; the *"as otherwise
> approved by Meta in writing"* language people reach for is in 10.5, which governs ad-account
> combination, not data use. And 10.7a is a prohibition with a narrow exception rather than a
> carve-out: it permits aggregate-and-anonymous use *"only to assess the performance and
> effectiveness of the end advertiser's campaigns,"* which on its face does not reach pooled
> cross-client model training. **[NEEDS EVIDENCE — no published route from 10.7 to a pooled corpus
> has been identified.]** What we *can* do unilaterally is the client-consent half: our MSA
> separately and explicitly obtains permission to use campaign outcomes for model training, per
> policy 10.8's flow-down requirement. That handles the client. It does not handle Meta.
>
> **The constraint binds Meta-sourced data, not our own.** The predicted cortical response, the
> creative features, the shot structure, the edit decisions — all of that is ours and pools freely.
> The worst realistic case is that the outcome side has to stay per-advertiser on Meta and the
> cross-client model trains on TikTok and Google labels plus per-client Meta fits. That is a
> smaller, slower flywheel than the one we want. It is not zero. **[FILL: TikTok and Google
> data-use clauses — not yet reviewed; both could be stricter and neither has been checked.]**

---

# PROOF WE STILL OWE

*(Ordered by how much each artifact would move a partner. The top three are cheap and would change
the conversation more than anything else on this list.)*

**1. A dated outreach log with a count in it.**
Converts "we've had a lot of interest" from a red flag into a number. One row per conversation:
date, person, company, role, the ask in their words, whether they raised end-to-end unprompted.
Cost: an afternoon. Nothing else on this list has a better ratio.
*Upgrades:* every demand slot in the Progress and Idea answers.

**2. The corpus run: score the TikTok ads and re-run the backtest against `ctr_index`.**
This is the most important item on the list and the only one that can change the science answer.
`data/ads/` already holds 1,359 labelled ad videos with baseline features extracted for all of them;
29 have encoder outputs, and all 29 are Meta ads whose label is `days_running`, an ad-longevity
proxy — `primary_label == days_running` for all 655 Meta rows. The 704 TikTok rows carry `ctr_index`
— a relative click-through index in [0,1], 97 distinct values on a 0.01 grid — which varies where
`days_running` only counts days. **It is not a raw CTR and must never be described as one.** The
scraper says so itself: "performance index in [0,1] (NOT a raw click rate)" (`ad_performance.py:14-17`),
and its HONESTY block at `:34-38` records that the corpus is TikTok's *Top Ads* showcase, an
already-curated set of strong performers, so a label means "how strong AMONG strong ads", not
"winner vs loser." The companion `ctr_percentile` column 0.99 on every row that carries a value (529 of 704) and empty on the rest — zero discriminative power, exactly as the docstring says at `:24-27`. Scoring them takes n from 29 to about seven hundred — **673** after the corpus's own
exclusions (28 long-form over 180 s, 3 silent), which is 7.79 h of footage out of the 12.0 h the
full 704 rows represent — and swaps a longevity proxy for a performance-ranked one. That is a
materially better test, not a clean one. `PLAN.md:106-109` budgets the sweep of the ~1,330 corpus
ads that still lack features at ~55 GPU-hours on one rented box; the 673-ad TikTok subset alone is
~28 GPU-hours and **$30–60** at
`PLAN.md:109`'s 2.5 min/ad and `YC-APPLICATION.md:318`'s $1–2/hr A100
**`[ESTIMATE — derived from two committed repo figures, not measured on a box]`**. Pre-registered
|r| ≥ 0.10 floor, against a baseline bar that has already moved (ffmpeg features at |rho| = 0.115,
p = 0.002 on Meta).
*Upgrades:* killers #3 and #4, the claim ladder, and the entire "prior on what to test" argument —
in either direction. **The experiment that decides whether our science is real costs about fifty
dollars and has not been run.**

**3. One real client campaign running under our management, even a human-operated one.**
The fastest version may not need the write API at all: have a person create the campaign in Ads
Manager and pull per-ad outcome data with read-only access. That would produce a live campaign, real
outcome labels, and the first rows of the corpus in days rather than through the multi-week approval
path, **whose length Meta does not publish**. **[VERIFY: whether `ads_read` on an account you have
been granted access to genuinely requires no App Review — this claim is the entire de-risking
argument for the fast path and it currently has no source. Get the permission-reference URL with a
fetch date before anyone builds against it.]**
*Upgrades:* "Serve does not exist" becomes "Serve is running, semi-automated." This is the single
biggest change in what the company is.

**4. A stated count of real encoder runs, and on whose footage.**
The only committed end-to-end pipeline capture in the repo (`captures/be2450c6ec72/run.jsonl`)
records the encoder **skipped** — its own log line says torch is not installed on that host because
it is a laptop and the encoder needs a provisioned CUDA box. The demo report is committed output. A
partner who looks will find that. The repo can prove 29 ads with committed per-vertex outputs, all
from a scraped Meta corpus, none from a partner. If the real total on the GPU box is higher, it
needs a countable artifact; if it is not, 29 is the number and we say 29.
*Upgrades:* the Progress answer, and the credibility of every other number.

**5. Written answer from Meta's partner team on policy 10.7.**
Determines whether the cross-client corpus — the stated core of the strategy — is permitted, and
in what form. Costs an email, and it has not been sent. If the answer is no, the strategy changes
shape, and it is far better to learn that now than after building.
*Upgrades:* killer #8 from "we've identified a risk" to "we've cleared it" (or reshapes the pitch
honestly).

**6. A *measured* per-ad GPU cost, and human-minutes per managed account per week.**
The GPU half is now derivable rather than unknown — ~2.5 min/ad (`PLAN.md:109`) at $1–2/hr
(`YC-APPLICATION.md:318`) is four to eight cents an ad, and the 673-ad TikTok sweep is ~30
GPU-hours and $30–60 — but every one of those is an estimate off two committed numbers, not a
stopwatch on the provisioned box. Human-minutes per managed account does not exist in any form, and
it is the number that decides whether this is software or a body shop. Without both measured,
"AI-native services with a software-like margin trajectory" is an adjective. With them it's a slide.
*Upgrades:* killers #1 and #4, and the business-model answer.

**7. The atlas/label mismatch fixed.**
Two different brain atlases in this codebase produce lanes with the same customer-facing names, and
they do not agree. The demo's lanes come from Destrieux anatomical selections in
`data/roi_mask_*.npy`; the shipped preflight lanes come from Schaefer. `validation/lane_stats.json`
now measures the disagreement: `roi_mask_arousal` against the Schaefer salience network is Dice
**0.207**; `roi_mask_dan` against the real dorsal attention network is **0.509**, with its
next-largest overlap being somatomotor at 0.197; `roi_mask_dmn` against Default is **0.535**. Every
mask whose name asserts a network does pick that network as its best overlap, so the names are
directionally right — but the maximum agreement anywhere is 0.535 and **no legacy mask is
interchangeable with the Schaefer lane of the same name.** The sharpest case: `roi_mask_memory`'s
largest overlap with any Yeo-7 network is **visual cortex, at 0.242** — anything built on a
"memory-encoding" lane inherits that. If we're going to sell "which network's response fell," the
network we name has to be the network we measured. Fix before any region-level claim goes on a
customer-facing surface.
*Upgrades:* the entire region-level pitch, which currently makes a claim two different atlases
support two different ways.

**8. A dated pre-registration for the specific region-level claim, filed before the test runs.**
Our own rule (`docs/science/PREREGISTRATION.md:39-42`) forbids scanning regions for the best r.
There is currently **zero outcome validation of any kind** for the four Schaefer lanes the product
actually ships — the only ROI ever pre-registered and tested was the DMN, and it was null.
Declaring the salience lane in advance, then testing it, is what separates this from the thing we
criticize competitors for. The hook-window secondary endpoint (`PREREGISTRATION-hook.md`) belongs
in the same filing, dated before the corpus run.
*Upgrades:* moves the network diagnostic from "described" toward "validated," and converts the one
tempting exploratory number in `ad_backtest.json` from a liability into a commitment.

**9. Perturbation stability under changes that shouldn't matter.**
Re-encode the same ad, shift it one frame, crop it slightly — does the diagnosis hold? Nothing in
the repo measures this. A diagnostic that flips on a re-encode is not sellable and we would rather
find that out ourselves. Note what the lane statistics already imply about the resolution we can
honestly claim: **over the 19 non-ad stimuli in `data/arcs/`** — fifteen ~2-minute web clips and
four COGNIMUSE features, no ad among them — lag-1-second autocorrelation across the four shipped
lanes is 0.94–0.97 and falls to 0.50–0.74 by five seconds (`validation/lane_stats.json`), which is
why the window is stated as three-to-five seconds and never as a single timestamp. Whether ads,
which are shorter and faster-cut, hold the same autocorrelation is exactly item 10 below.
*Upgrades:* the credibility of the timestamped claim ("0:03–0:08") the whole pitch rests on.

**10. The same six lane statistics computed on ad footage.**
`tools/readout/lane_stats.py` and `validation/lane_stats.json` now exist and settle the geometry
question — but only over the 19 non-ad stimuli in `data/arcs/`. The script takes `--preds-dir` and
`--out`, so the ad fold is one command; no ad artifact has been committed, and until one is, every
lane figure in this application describes web clips and films rather than ads.
*Upgrades:* the "different and defensible" answer, which currently has to name its stimulus set as a
caveat rather than as a match.

**11. Per-parcel encoding accuracy for this checkpoint on this surface.**
We quote ~0.21 mean Pearson (`docs/pipeline/INFERENCE-PIPELINE.md:58`), which is Meta's Algonauts
benchmark in Schaefer-1000 — a different parcellation and a different space from the 400-parcel
fsaverage5 surface we read out from. We do not know which of the 400 parcels this model predicts
well. Until we do, we cannot rank regions by trustworthiness — and there is a live hypothesis, which
we should test rather than hope about, that encoders are most accurate in early sensory cortex and
least accurate in exactly the association regions we want to sell.
*Upgrades:* lets us say which regions we trust, instead of treating all four lanes as equal.

**12. The interventional test: recut → re-score → serve → measure.**
The one that promotes the whole thing from observation to advice. It requires Serve to exist and
it is the reason Serve exists. Everything above is a prerequisite for running it honestly, and the
held-out split has to be by **brand**, not by ad.

---

*One item came off this list during this revision, and it is the template for the rest.* The lane
correlation, PC1, visual-drive, autocorrelation, vertex-count and legacy-mask-Dice figures used to
be numbers in a document with no script behind them — the exact shape of the failure `PLAN.md` §0.3
catalogues. They are now `tools/readout/lane_stats.py` → `validation/lane_stats.json`, with a
`--check` mode that reproduces byte-identically and fails loudly on drift. Two caveats travel with
it: the inputs under `data/` are gitignored, so `--check` only runs on a box that has them (the
artifact records the SHA-256 of all 19 prediction files, both Schaefer annots and all 7 legacy
masks, so the committed file is still tied to exact bytes); and it must **not** be wired into
`scripts/verify.sh`, because it would fail every fresh checkout. It belongs in the scorer-box
workflow next to a run.

---

# CROSS-REFERENCE: what to change in the repo when this lands

*(Not application copy. The list of places the old frame is still live, so the site and the docs
don't contradict the application.)*

| File | What's wrong |
|---|---|
| `docs/strategy/PRODUCT.md:188-193` | The "founder-attested figures" block. Highest-risk text in the repo. Resolve out of band or delete. Its three live surfaces are `DemoScrollPage.tsx:807` (500 ads), `:808` (100+ waitlist) and `:809` (92%) — all three, not two. |
| `docs/strategy/PLAN.md:23-24` | Records `validation/head_attn.json` as deleted in `c8887f3`. The file is present on disk today. This is the provenance of the **one positive validated result the company owns** (median LOVO r ≈ 0.20, Stouffer p ≈ 2.7e-4, n = 15 TVSum), and it is quoted in the claim ladder and killer #3. Reconcile before either is said: restore-and-note, or amend the line. |
| `docs/strategy/PLAN.md:340-342` | Lists ad serving under "What we are deliberately not doing" and calls it "three products away." The pivot reverses this; amend it explicitly rather than contradicting it silently. |
| `docs/strategy/PLAN.md:170-183` | Specs the `outcomes` table and says "do not build Meta OAuth yet." Both decisions are now live questions. |
| `docs/strategy/PLAN.md:77` | Cites the beta marquee at `DemoScrollPage.tsx:1145`; the string is at `:1149` and `BetaMarquee` opens at `:1144`. Small drift, but §0.3 is the section whose whole point is citation discipline. |
| `src/components/demo2/DemoScrollPage.tsx:894` | "Scored before you spend a dollar" — the dead frame, live on the site. |
| `src/components/demo2/DemoScrollPage.tsx:1149` | "Already running ads through the beta" marquee (`BetaMarquee` at `:1144`) — the unsupported claim PLAN.md §0.3 catalogued, still shipping. |
| `docs/strategy/COMPETITORS.md:143-180` | Stale on epistemics and disclosure posture. VidCognition's `/science` page now publishes Spearman 0.43 on 218 early-retention-labelled videos **and states the score comes from a vision-language-model critique, not from the brain model, with the TRIBE curve a secondary directional panel the score is not derived from** (fetched 2026-08-06). Do not present that 0.43 against Soma's r ≈ 0.20 as a scoreboard: theirs is a cross-video scalar-vs-outcome correlation, ours is a within-video arc-vs-per-second-importance correlation. Different quantities, different units of analysis, different label — neither is evidence about the other. The buyer question (do they still target the same performance buyer?) has **not** been re-checked. The section already carries its own `[verify]` marker at `:178-180`. |
| `docs/strategy/COMPETITORS.md:78-94` | Realeyes section is stale — **[VERIFY: realeyes.ai's current business and whether the ad product moved to a separate domain; asserted from memory, no fetch on record.]** |
| `docs/strategy/VISION.md:69-76` | Names two YC RFS themes and already flags at `:75-76` that the exact 2026 wording is unverified. **[NEEDS EVIDENCE — the current RFS page has not been fetched. Do not assert either presence or absence until it has.]** |
| `docs/strategy/VISION.md:78-83` | "Why cheaper" compares against per-test panel pricing. Wrong denominator now — but note the new denominator is a flat platform fee, not a percentage of ad spend. |
| `docs/strategy/OPPORTUNITIES.md:100-181` | Ranks creator tools above ads, and forbids the absolute cross-ad score that placement decisions need. Both need an explicit resolution, not a quiet override. |
| `src/components/site/PitchDeck.tsx:73,:214,:241-242` | "Last mile on top," "inference layer on top," "per-seat SaaS" — all three are the middleware framing the pivot abandons. |
| `src/components/demo2/ServiceTiers.tsx` | Four tiers, no prices, by design. Serve is a fifth rung. Keep the no-prices posture. |
| `demo/process_batch.py:1410` | `--arc-roi` still defaults to `dorsattn` — the lane that shares a mean r² of 0.593 with the visual lane **over the 19 non-ad stimuli in `data/arcs/`** (`validation/lane_stats.json`; that figure is a property of those web clips and films, not of ads). Changing the default is a product decision, not a cleanup, and it should not be made until the same statistic has been computed on ad footage. |

---

# SOURCED APPENDIX — external claims, to be filled before any of them is said out loud

*(Not application copy. This is the page the founders carry. The parent doc's preamble requires a
URL for every external claim; none of these has one on record, so each is a slot rather than a fact.
A row with an empty URL is a sentence that does not get spoken.)*

| Claim as used in this document | Where used | Source |
|---|---|---|
| TRIBE won Algonauts 2025, 1st of 263 teams; TRIBE v2 open-sourced by Meta; weights **and** code CC-BY-NC-4.0; text branch Llama-3.2-3B under the Llama 3.2 Community License | Product answer, Why now, video, killer #6 | **[FILL: URL + fetch date for the Algonauts result and for the model card's licence fields]** |
| ~0.21 mean Pearson encoder accuracy, Schaefer-1000 | Killer #3, proof item 11 | `docs/pipeline/INFERENCE-PIPELINE.md:58` (internal) — **[FILL: the primary Meta source that row traces to]** |
| Post-ATT shift of marginal return from targeting to creative | Why now #2 | **[FILL: URL + fetch date]** |
| Adelaide attention metric live as pre-bid targeting in Amazon's and Yahoo's DSPs; PubMatic and Equativ adoption | Why now #3 | **[FILL: URL + fetch date, per platform]** |
| IAB attention playbook says third-party signal is insufficient in CTV and walled gardens | Why now #3 | **[FILL: URL + fetch date + the sentence quoted verbatim]** |
| Pre-launch creative scoring has commoditised to a low monthly price band | Why now #4 | **[FILL: two vendor pricing pages with fetch dates]** |
| Meta Developer Policy 10.5, 10.7a/b/d, 10.8 — quoted text | Killers #5 and #8, defensible #4 | **[FILL: developers.facebook.com/devpolicy/ + fetch date; the live page was last updated 2026-02-03. Also fetch the separate-ad-accounts criteria page 10.5 links to — it has not been read.]** |
| `ads_read` on a granted account needs no App Review | Proof item 3 | **[FILL: permission-reference URL + fetch date. Load-bearing: it decides whether the fast path exists.]** |
| Meta / Google / TikTok API tier thresholds (cut from Why now, retained in the build plan) | Build plan only | **[FILL: URL + fetch date each, carrying the qualifier that developers report the upgrade path failing to appear even when criteria are met]** |
| Motion's published pricing; Smartly.io's fee structure; performance-agency percentage band | Money answer | **[FILL: pricing pages and a primary source, not a review-site aggregate]** |
| VidCognition `/science` — Spearman 0.43 on n=218; hook score is a VLM critique; TRIBE curve is a secondary panel; region-level detail disclaimed | Defensible #1, cross-reference table | **[FILL: vidcognition.com/science + fetch date + the paragraph quoted verbatim]** |
| YC's framing on AI-native services margins | Killer #1 | **[FILL: the YC library URL and the exact wording. Audience is YC.]** |

---

*Companion to `docs/GTM/YC-APPLICATION.md`. Every honesty rule in that document's preamble applies
here unchanged. Every bracketed slot is a real gap, not a formatting convention — a slot shipped as
a guess is the exact failure mode `PLAN.md` §0.3 exists to prevent.*
