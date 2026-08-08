# Soma as a full-service advertiser: Analyze, Improve, Serve

**Status:** strategy argument, not a plan of record. Written 2026-08-06; third revision 2026-08-06,
against two adversarial audits and a final verification pass, and folding in the founder-supplied
Serve specification.
**Author:** Mukilan Rajasekar

> **PRICING SUPERSEDED — 2026-08-07.** The founder replaced the flat-fee model this
> document argues for with a **bundled weekly price per campaign**: media spend across
> the chosen networks plus a default 20% margin on serving costs, one all-inclusive
> number, renewing weekly until paused (decision record and consequences:
> `BUILD-PLAN-FULL-SERVICE.md` §0.5; implementation: migration `0016`,
> `tools/serve/pricing.py`, `src/lib/pricing.ts`, `tools/serve/renewals.py`).
> Consequences for THIS document: the sentence *"our fee never rises when your budget
> rises"* is **retired** everywhere it appears (§0 lead, §1.5, §4.2, §8, closing); the
> incentive-alignment argument it carried must be restated or conceded, not assumed; and
> every derived number in §4.3 (the $12,000/$10,800 unit economics), §4.6 (the rebate
> formula constants), and §5 (N-per-operator math) is `[NEEDS REWORK]` against the
> bundled model. §4.2 below has been rewritten to the new decision; the surrounding
> sections retain the superseded reasoning as argument history until re-derived — read
> them as *why the old model was chosen*, not as what is being sold.

**How to read the citations.** Repo claims carry `file:line`. External claims carry a URL, and a
URL without a fetch date is a claim I have not re-checked for this revision. Anything I modelled
rather than measured is marked `[ESTIMATE]`. Anything that needs a number nobody has yet is marked
`[NEEDS EVIDENCE]`. Anything that names a capability the repo does not have is marked
`[NEEDS BUILD]`. There are no unmarked numbers in this document that are not either in the repo or
in a cited source — the disclosure rule at `docs/strategy/PRODUCT.md:100` ("the constraint with no
exceptions") applies to strategy documents too.

**One thing I did not act on.** `docs/strategy/PRODUCT.md:188-193` asserts three figures (92%
accuracy vs a 75% baseline, 500 ads from design partners, 100+ waitlist) as "cleared for public
copy" and instructs readers not to flag, gate, or strip them. That block contradicts
`docs/strategy/PLAN.md:73-88`, `docs/GTM/YC-APPLICATION.md:25-26`, and
`docs/strategy/PRODUCT.md:100` 88 lines above it. I have used none of those three numbers here.
Section 8.5 explains why Serve makes that block materially more dangerous than it is today. A
founder should confirm or delete it out of band.

**What changed in the second revision, and why it mattered.** The first draft led with an
incentive-alignment claim ("we are the only party that does not earn more when your money is
wasted") and then priced the company at 4–8% of managed spend. Those two things cannot both be
true. The percentage fee has been removed and replaced with a flat structure (§4.2), which is what
makes the lead sentence literally defensible rather than merely rhetorical. The second change is
§4.6: the randomised control arm that makes the whole flywheel interpretable is now explicitly
paid for by Soma, because spending a client's budget on creative our own model predicts will lose,
in order to build an asset we own, is the exact inverse of the argument we lead with.

**What changed in this third revision.** Six corrections, each of which a hostile reader would
otherwise have found first:

1. **Meta Developer Policy 10.7 contains no written-approval clause.** The previous revision built
   a mitigation on "as otherwise approved by Meta in writing" — language that lives in **10.5**,
   which governs ad-account combination, not data use. §7.4 W1 and §11 item 2 are rewritten. The
   moat's legal position is materially worse than the last draft implied.
2. **The TikTok label is not a raw CTR.** The decisive experiment's outcome column is a relative
   performance *index* over an already-curated showcase of strong ads, the repo's own scraper says
   so in capitals, and the usable n is ~673, not 704. §9 step 3 is rewritten (§9).
3. **The rebate arithmetic is stated rather than gestured at**, and its second term is named as the
   only spend-linked component in the contract — one that can only ever *reduce* Soma's fee (§4.6).
   §1.5's positioning sentence is restated to match.
4. **The designated money sentence in §2.3 no longer claims the second link.** "Our read-out
   explains the result" asserts exactly what three nulls failed to find.
5. **Every lane figure now names its stimulus set.** The committed lane statistics are folded over
   19 non-ad stimuli. No ad is in that set, and the figures were being quoted as properties of ads.
6. **The founder's Serve specification is folded in** (§3.4), including a mandatory labelling
   constraint on the before/after demo that §8.5 exists to enforce.

---

## 0. The argument in one page

**The offering, as the founder states it** — this is the canonical one-liner and everything below
is downstream of it:

> A platform that helps advertisers analyze creative, improve it, distribute it, and learn from
> performance — without piecing together separate scoring, editing, and ad-serving tools.

Two things must stay attached to that sentence every time it is used. **First, a customer can buy
the analysis layer alone.** Analysis-only is a legitimate, supported entry point and it is the
near-term commercial reality; the full A-to-Z workflow is the longer-term product. Second, **only
the analysis layer exists** — Improve is partial and Serve is zero lines of code (§3.3). Written in
the present tense the sentence is false today; written as what the platform is *for*, it is the
right sentence.

The old wedge — *"Meta's A/B test costs thousands, so buy our cheap pre-test first"* — is dead
the moment Soma serves ads. It is dead by construction, because you cannot position against
the expensive thing you have become. It was also already dying independently: the same pitch
is now shipped by an incumbent and by two $29–199/month tools, one of which publishes better
validation than Soma has.

The replacement argument is not that Soma's signal is better. It is that **Soma is the only party
in the creative supply chain whose revenue never rises when ad spend rises**, and that the brain
prior stops being a product you must convince someone to buy and becomes a cost-reduction
mechanism inside a service that has to be bought anyway.

The three tiers are **separable as purchases and inseparable as an argument.** A customer may buy
Analyze on its own and many will — that is the near-term revenue. But no tier on its own can ever
promote Soma's regional diagnostic from an observation into advice; only the closed loop can, and
that is why the loop and not the tier is the company:

- **ANALYZE is the wedge, and a standalone product.** It is the only thing that works today, it
  opens the account, and it qualifies the client. A customer who never advances past it is a real
  customer, not a failed one. It is not the moat — the category is commoditized at both ends of
  the price band.
- **IMPROVE is the proof, and it must stay small.** It is the only way to demonstrate the
  diagnostic is actionable, and the only source of clean matched training pairs. It is also the
  headcount-linear part of the business, which is why "small" is a margin decision and not modesty.
- **SERVE is the moat.** Not because placing media is hard, but because holding the ad account
  is the only mechanism that produces ground-truth outcome labels, and outcome labels are the
  only thing that can ever promote Soma's regional diagnostic from an observation into advice.

**The business reduces to one measurable number:** accounts per operator (N). On two assumptions,
neither of which is observed — a flat fee netting **$10,800/month** on a brand spending $200k/month
(§4.3, illustrative; the founders have not named a price) and a **$10,000/month** fully-loaded
operator `[both ESTIMATE]` — break-even is below one account, YC's 50%-margin bar arrives at N=2,
and N=4 gives 77% margin and $43,200/month of revenue per operator. The thresholds move linearly
with either input. **The number to actually measure is N**, and every other argument in this
document is downstream of whether it rises across cohorts.

**Our first customer is not someone deciding whether to believe neuroscience. It is someone
already paying an agency more than us for less.** That is the sale that closes before any science
does (§1.3, §6).

**And the claim ladder, stated once so nothing below has to overstate it.** Video → predicted brain
response is validated, publicly, by Meta, against real fMRI — that rung is not Soma's work. Soma's
own trained read-out head *does* clear on TVSum: median leave-one-video-out r = 0.201, Stouffer
p = 2.7e-4, n = 15 (`validation/head_attn.json`) — against a human-interest proxy, on fifteen
videos, which is a real result and a small one. Predicted response → **commercial outcome** is the
rung Serve exists to test, and all three tests of it have come back null (§1.2). Saying only the
last part would be the more modest document and the less accurate one.

**The five things that would falsify all of it** are listed in §2.5, four of them are cheap to
test, and two of them have already returned answers Soma should not like.

---

## 1. The repositioning

### 1.1 Why the old wedge dies

The pre-test frame runs through Soma's documents. It is one of three candidate 50-character
company descriptions — *"Neural pre-testing for video ads"* (`docs/GTM/YC-APPLICATION.md:145`).
The founder video says *"in minutes, before you spend a dollar on media"* (`:162`). The revenue
model prices *"per-asset / per-run pre-testing … priced below existing panel-based pre-tests"*
(`:447-451`). The live site still renders *"Scored before you spend a dollar"*
(`src/components/demo2/DemoScrollPage.tsx:894`). Note in fairness that the *recommended* lead
option, `:144` — *"Predict where your ad loses attention"*, annotated "safest lead — no neuro
claim in the hook" — already avoids the construction entirely. The frame is pervasive but it is
not unanimous, and the argument below survives without overstating it.

Serve breaks each of these in a different way, and it is worth being precise about which:

1. **"Pre-" loses its referent.** The word only means something relative to a downstream buy you
   are upstream of. If Soma places the media, there is no downstream. The word becomes a
   description of Soma's own internal sequencing, which is not a customer benefit.
2. **The price inverts.** The old model sits *below* an incumbent test. The new model sits
   *alongside* media. Those are not the same paragraph edited; they are opposite directions of
   comparison, against a completely different denominator. `docs/strategy/VISION.md:78-83`
   compares against per-test panel pricing; the relevant comparison after Serve is what a
   performance agency charges — see §4.2.
3. **Half of the "why won't Realeyes just build it" defence evaporates; the other half is
   strengthened.** That answer has two legs. The panel-margin leg
   (`docs/GTM/YC-APPLICATION.md:579-583` — a no-panel product undercuts an incumbent's per-test
   panel margin, so they won't ship it) loses its referent under Serve, because Soma is no longer
   undercutting a test at all and the relevant incumbent stops being Realeyes and becomes
   Smartly.io and performance agencies. The data-asset leg (`:583-587` — *"a focused team
   compounding the one asset neither of us has yet — ad creative paired with real CPA/ThruPlay
   from design partners … we get to that data faster"*) not only survives the pivot, Serve is
   precisely the mechanism that makes it faster. **Rewrite the first half; keep and sharpen the
   second.**
4. **The plan of record says not to do this.** `docs/strategy/PLAN.md:340-342` lists "Campaign
   management / ad serving" under *"What we are deliberately not doing"* and calls it "three
   products away." The pivot reverses the plan's single most explicit exclusion. That document
   should be amended on the record, not silently contradicted.

### 1.2 The wedge was already dying without Serve

This matters, because it changes the pivot from a gamble into a forced move.

*"From the file, no panel, in minutes"* is no longer a differentiator. Neurons markets it
verbatim: *"predictive ad testing software like Neurons AI now lets teams simulate and score ad
performance in minutes—without live media spend"*
(https://www.neuronsinc.com/ad-testing/creative-testing, fetched 2026-08-06).

The price floor has collapsed. VidCognition is $29/$79/$199 per month
(https://vidcognition.com/). AdCreative.ai claims creative scoring at "over 90% accuracy" at
$39–999/month (https://www.adcreative.ai/). Neurons sits at the other end at a reported ~€15,000/yr
for ~5 seats — third-party sourced, do not quote it in a deck. **There is no viable price point
for Soma in Analyze alone**, and that is an independent argument for Serve that has nothing to
do with strategy preference.

And the honesty wedge has inverted on the numbers. VidCognition's current science page publishes
Spearman 0.43 against 218 videos carrying ground-truth early-retention labels
(https://vidcognition.com/science, fetched 2026-08-06). Soma's best result is the trained read-out
head on TVSum: median leave-one-video-out r = 0.201, Stouffer p = 2.7e-4, n = 15 videos
(`validation/head_attn.json`, `stamp`) — against a human-interest *proxy*, on fifteen videos. That
is a real result and a small one, and it is the one positive result the company owns. The
pre-registered primary ROI test (DMN) came back NULL, and **three** separate ad-outcome tests came
back NULL at n=29:

| Test | Artifact | Result |
|---|---|---|
| Learned head vs ad outcome | `validation/ad_backtest.json` | `signal: false`, partial r = −0.128, perm p = 0.548, top1 hit 0.0 |
| Arithmetic arc vs ad outcome | `validation/recheck/B-ads-temporal/ad_backtest_arc.log` | partial r = 0.12, perm p = 0.559 |
| Temporal features vs ad outcome | `validation/recheck/B-ads-temporal/temporal_*.log` | nothing survives Holm |

**PROVENANCE DISCREPANCY — quote the 0.201 with this attached, not without it.**
`docs/strategy/PLAN.md:23-24` states that `validation/head_attn.json` was "deleted in `c8887f3`",
while the file is present on disk and carries the stamp quoted above (`median_r` 0.2009,
`stouffer_p` 2.66e-4, `n_videos` 15, `dataset` TVSum, `date` 2026-07-20). One of those two is
stale. **Reconcile the repo before this figure appears on any public surface** — it is a live
instance of exactly the citation drift `PLAN.md` §0.3 exists to catch, sitting under the company's
single best number.

A partner or a sophisticated buyer who reads both pages concludes the competitor has better
validation, on a better label, at seven times the n, for a tenth the price. **Soma cannot
currently claim to be the honest one on the strength of its numbers.** It can only claim to be
the honest one on the strength of its disclosure, which is worth something but is not a business.

**The split that is actually true, and that the repo already encodes** in every
`data/arcs/*.json` under `claim.validated` vs `claim.hypothesis` (and in
`public/preflight/batch_report.json`'s `claim` block):

- **VALIDATED:** video → predicted brain/attention response. TRIBE v2 is a published model; the
  trained read-out head clears on TVSum at median leave-one-video-out r = 0.201, Stouffer
  p = 2.7e-4, n = 15 (`validation/head_attn.json`, `stamp`, dated 2026-07-20, `leak_check: pass`)
  — on a human-interest proxy, and subject to the provenance discrepancy noted above.
- **NOT VALIDATED:** predicted response → commercial outcome. Three nulls, n=29, proxy labels,
  applied out of distribution.

Every sentence in this document that sells something must sit on the first line and must not
imply the second.

### 1.3 "Why don't we just become the A/B test, and cheaper?" — made rigorous

The founders' instinct is right but the sentence needs unpacking, because the naive reading is
false. Meta's split-testing tooling is not expensive. It is free. What costs thousands is not
the test; it is **the media burned on the arms that lose**.

So "cheaper" cannot mean "cheaper test infrastructure." It has to mean **fewer dollars burned per
unit of creative learning**. There are exactly two mechanisms available, they are very
different in quality, and they imply two different customers.

**Mechanism A — arm reduction. Real arithmetic, currently unsupported by evidence.**

A creative test spends budget across *k* arms until the arms separate. Cost to identify a winner
scales roughly with *k*. If a pre-launch prior can eliminate the worst *m* arms before any
impression is served, the same total budget spreads over *k−m* arms and each reaches separation
proportionally sooner. Critically, this does **not** require the prior to pick the winner. It only
requires the prior to be better than chance at rejecting the worst — a much weaker claim.

Soma cannot make even the weak claim today. `validation/ad_backtest.json` reports
`topk_prec: 0.222` at `k: 9` over `n_ads: 29`. Chance precision at top-9 of 29 is 9/29 ≈ 0.310.
**The observed value is below chance.** `top1_hit` is 0.0. The partial correlation against the
ffmpeg baseline (loudness, cuts, luminance, motion, duration) is −0.128 at p = 0.548. The one test
that has been run says the prior does not do the weak version of the job either.

**State the bar out loud, because without it the claim is not checkable.** Soma's fee is
*additive* to media: the client's total cost is media + fee. For the prior to make advertising
cheaper *on its own*, arm reduction has to save more than the fee — on the §4.3 configuration,
more than about 5% of spend, every month, forever. **We have not shown that and we will not claim
it.** That test is n=29 and underpowered; §9 step 3 specifies the run that would settle it. Until
it reports, **Mechanism A is a hypothesis with an adverse preliminary result, and it must not be
sold.**

**This has an ICP consequence that the first draft never drew.** Against a brand currently paying
a performance agency 10–20% of spend, Soma at a lower flat fee is net-cheaper on day one with
*zero science required* — the saving is the fee differential, not the prior. Against a brand
running media in-house, Soma is a pure cost increase justified entirely by an unproven prior.
**Those are two completely different sales**, with different objection sets and different burdens
of proof, and the first draft pitched them as one. The first ICP is brands paying a performance
agency 10–20% of spend on paid-social video with enough creative volume to make the diagnostic
worth reading. The in-house-media segment is explicitly deprioritised until F2 returns (§6.5).

**Mechanism B — incentive alignment. Structural, true today, independent of the science —
*provided no component of the fee rises with spend*.**

Every other party in the chain makes more money when more money is spent. Meta's revenue *is* the
spend. An agency at 10–20% of spend earns more when spend rises, including when it rises because
the creative was bad and needed more impressions to work. Smartly's percentage-of-spend fee has
the same gradient.

The first draft of this document claimed this ground while pricing Soma at 4–8% of managed spend.
That was self-falsifying: a percentage fee has *exactly* the gradient the argument condemns.
"No markup on media" and "no gradient on spend" are different properties, and only the second one
supports the claim. **§4.2 therefore prices Soma on a flat basis**, and only then is this true:

> Our fee never rises when your budget rises. We are paid the same whether you spend fifty
> thousand or five hundred thousand. The one term in our contract that does track your spend is a
> rebate that pays *you* (§4.6). We are the only party in your chain with no financial reason to
> want your money spent.

That is a property of the contract, and it survives even if the brain signal turns out to be
worthless — in which case Soma is merely an honestly-incentivised agency, which is a smaller
business but not a fraudulent one.

This is the argument to lead with, because it is the one that is true today — **once the pricing
in §4.2 is what is actually signed.**

### 1.4 What a customer gets that Meta structurally cannot give them

Most claims of this shape are false, so let me be strict. Meta can tell you which variant won,
faster, with better attribution, at any breakdown you like — `/{ad-id}/insights` is a first-class
edge and ad level *is* creative level
(https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights). Do not claim
Meta cannot measure. It measures better than Soma ever will.

Three things are genuinely structural:

**(a) A signal that exists before any impression.** Meta's signal requires impressions, and
impressions require money and time. There is no zero-spend Meta signal, and there cannot be. This
is the old wedge — and here is the reframe that matters: **the pre-test capability does not die,
the pre-test business dies.** The prior stops being a thing you must convince someone is worth
$100 and becomes an input to a service that has to be purchased regardless. You no longer have to
win the argument "is your score real"; you have to win the argument "can you run my account at
least as well as the alternative." That is a much lower sales bar and a much higher delivery bar,
and it is the correct trade for a company whose science is not yet validated.

**(b) A readout *inside* the asset rather than *of* the asset.** Meta reports one outcome per
creative. It does not decompose a 30-second file. Soma already ships four per-second Schaefer
network lanes end to end — verified in the committed artifact
`public/preflight/batch_report.json`, and constructed at `demo/process_batch.py:1516-1521` and
`:1631-1643`. The four lanes are pairwise disjoint and cover **10,032 of 20,484 fsaverage5
vertices, 48.97% of cortex** — DorsAttn 2,089, SalVentAttn 2,363, higher-order 2,754, visual 2,826
(`validation/lane_stats.json`, `shipped_lanes`). **This is the one lane figure in this document
that does not need a stimulus set attached to it**, because lane geometry is a property of the
Schaefer-2018 400-parcel atlas, not of anything anyone watched. Every *other* lane number below is
a fold over specific stimuli and is meaningless without them named. Extending to a full
400-parcel per-second table is a pooling change, not a new model: the spatial map is already
computed and then discarded. `[ESTIMATE — the first draft quoted "3.2 ms of pooling for a 120 s
clip" and "~44 KB gzipped per 30 s ad"; neither traces to a committed measurement. Measure both on
the concierge box before either appears on a public surface.]`

Three honesty constraints on how this is described:

- **Temporal resolution is a window, not a second.** Across the 19 stimuli in `data/arcs/`, mean
  lag-1 s autocorrelation of the four shipped lanes is **0.94–0.97**, falling to **0.50–0.74** at
  lag-5 s (`validation/lane_stats.json`, `sets.across_four_shipped_lanes.autocorr`). The founders'
  target sentence *"your response collapses at 0:04"* is over-precise. The honest form is a
  window: *"between 0:03 and 0:08."*
- **Those numbers are over web clips and feature films, not ads. No ad is in that set.** The 19
  stimuli in `data/arcs/` are fifteen ~2-minute web clips plus four COGNIMUSE feature films
  (`validation/lane_stats.json`, `notes.stimulus_set`). Over *that* set, the four shipped lanes
  carry a mean off-diagonal r of **0.4364**, with PC1 taking **63.42%** of the z-scored variance
  and **80.55%** of the raw (`sets.across_four_shipped_lanes`) — against the ~25% floor four
  independent lanes would give, so much of what four lanes show a customer is one shared component.
  That is worth knowing before it is sold as four signals. The artifact says the quiet part out
  loud: *"Lane correlation
  rises with stimulus length, so a figure quoted without its stimulus set is a figure about
  nothing"* (`notes.stimulus_set`). **The committed figures must therefore never be quoted as
  describing ads.**

  A local cross-check fold over the 29 scored ads in `data/ads/arcs/` moves them materially —
  4-lane mean off-diagonal r 0.363, PC1 z-scored 0.653, visual drive on DorsAttn +0.781 and on
  SalVentAttn +0.122. `[UNCOMMITTED — that fold was run locally and is not in the tree. The
  numbers in this bullet's second paragraph are recorded here so the *direction* of the gap is
  on the record; they must not leave this document until the artifact is committed.]` Running
  `tools/readout/lane_stats.py --preds-dir data/ads/arcs --out validation/lane_stats_ads.json` and
  committing it is minutes of work and closes the gap permanently (§9 step 5).
- **The default lane is contaminated — again, over those 19 non-ad stimuli.** The dorsal-attention
  lane tracks the visual lane at mean r = **0.7505** (mean r² **0.593**), against r = **0.4518**
  (r² **0.262**) for the salience lane and r = **0.0831** for the higher-order lane
  (`validation/lane_stats.json`, `sets.across_four_shipped_lanes.visual_drive`) — i.e. the salience
  lane is roughly **2.3× less driven by raw sensory intensity**. DorsAttn is the default
  `--arc-roi` (`demo/process_batch.py:1410`) and the headline "Attention" lane, and
  `demo/process_batch.py:112-114` explicitly warns that a high occipital response is "equally
  consistent with a compelling hook and with meaningless sensory intensity."
  **The default should change, and this is a code decision, not a copy decision.** Note that the
  uncommitted ad fold above puts DorsAttn's visual drive *higher* still (+0.781), so nothing about
  the ad distribution rescues the default lane.

**(c) Alignment on the ranking objective.** Meta's delivery system optimises within an ad set and
reallocates impressions toward whatever it predicts will perform, which means observed per-creative
outcomes are partly a measurement of Meta's own delivery decisions rather than of the creative. A
party that wants a clean creative read has to *force* the split, at some cost. Meta has no
incentive to give you that for free. Soma does. (This cuts both ways — see §7.4 W3, where the same
fact is a weakness of the moat, and §4.6, where forcing the split is what Soma pays for.)

**What is NOT structural, and should never be claimed:** that Meta cannot localize a problem. A/B
testing two cuts also localizes it, if you make the cuts. Soma's contribution is proposing *which*
cut to test — a search-space reduction, which is Mechanism A, which is unvalidated.

### 1.5 The replacement positioning sentence

> Soma runs your paid social. Media passes through at cost and our fee never rises when your
> budget rises — we are the only party in your chain with no financial reason to want your money
> spent. We read every creative at the level of predicted cortical response before it ships, we
> cut the version the read-out implies, we run both, and we keep the result. Your ad is never
> finished; it is always the current best-known cut.

Note what this sentence does not say. It does not claim the score is accurate. It does not claim
to beat Meta. It claims a structure and a loop, both of which are true or buildable, and it leaves
the accuracy claim to be earned later by evidence Soma does not yet have. **Its first clause is
only true under the pricing in §4.2.**

**Why "never rises" and not "does not move."** §4.6's rebate has a second term, *h × S × g*, which
is a function of managed spend. It is the only spend-linked component anywhere in the contract and
it runs in one direction only: it is a credit against Soma's fee, so more spend can only ever make
Soma *poorer*. "Never rises" is therefore exactly true and "does not move" is not, and the
difference is the kind a procurement lawyer finds. **If a spend-linked component that increases
Soma's fee is ever signed, this sentence must be changed the same day.**

---

## 2. The hardest objection

> *"If I'm a big advertiser, I'd rather have a $1,000 real signal than a $100 fake signal."*

### 2.1 Concede the part that is true

At n=29, Soma's neural score does not beat a dumb ffmpeg baseline at predicting ad rank — on the
learned head (`validation/ad_backtest.json`), on the arithmetic arc
(`validation/recheck/B-ads-temporal/ad_backtest_arc.log`), or on temporal features
(`validation/recheck/B-ads-temporal/`, nothing survives Holm). Zero validation exists for any of
the four Schaefer ROIs the product actually ships. The only pre-registered ROI test that has ever
run (DMN) returned NULL. If the buyer's question is *"does your number predict which ad wins,"*
the honest answer today is **no, not demonstrated, and every test we ran said no.** A buyer who
refuses to substitute that for a real test is correct, and Soma should say so rather than argue.

Selling a $100 score as a *substitute* for a $1,000 real signal is selling the fake signal. Do not
do it. This is not a positioning problem; it is the thing the objection correctly identifies.

### 2.2 Then take apart the hidden assumption

The objection assumes the $1,000 buys a *signal*. It does not. It buys an *outcome ranking over
the specific variants you happened to make*, and most of the $1,000 is media burned on the loser.
The ranking does not tell you why, does not transfer to the next brief, does not exist for
creative you have not made yet, and does not exist at all until you have spent the money and
waited.

The right question is not "$100 or $1,000." It is "what does each dollar buy, and are these
substitutes or complements?"

### 2.3 The actual answer: once Soma serves, the dichotomy collapses

The $1,000 real signal is not a competing product. **It becomes Soma's own output.** Soma runs the
campaign, so the outcome label is Soma's. The brain prior is not a substitute for the real signal;
it is the **allocation policy over the test budget** — the thing that decides which arms get funded
so that fewer dollars are spent discovering losers.

The sentence to say out loud:

> You are not buying our score instead of a real test. You are buying a real test that we run for
> you, in which our score decides what gets tested — and alongside the result you get a per-second
> description of the creative that no outcome number can give you. Whether that description
> explains the outcome is the thing we are running the test to find out.

**The last clause is load-bearing and the earlier draft of this sentence did not have it.** That
draft ended "…and our read-out explains the result," which asserts that predicted cortical response
accounts for the commercial outcome — the second link in the chain, the one three separate tests at
n=29 looked for and did not find (§1.2), and the exact prescription §2.4 below refuses to license.
Putting an unearned claim in the document's designated money sentence is how a packet that is
honest everywhere else gets caught in the one place a partner is reading closely.

The honest version still converts the objection from fatal to a pricing question, and it is the
single strongest strategic reason Serve exists. It is also why Serve is not optional: without it,
the objection stands and there is no answer to it.

### 2.4 What a brain prior does that a live test structurally cannot

Three things, in descending order of confidence:

1. **It exists before the first impression.** A live test cannot rank a creative that has never
   been served. This is definitional, not empirical.
2. **It is dense in time.** A live test yields one number per asset. The encoder yields a
   per-second trajectory across networks. This is what converts *"this ad underperformed"* into a
   sentence that is arithmetic Soma can already produce today:

   > The predicted salience-network response — Schaefer-2018 SalVentAttn, 2,363 fsaverage5
   > vertices (`validation/lane_stats.json`) — falls to the bottom of this clip's own range
   > between 0:03 and 0:08: shot 4 of 11, boundary detected at 3.1 s.

   Everything in that sentence traces to shipped code: the lane and its vertex count to
   `demo/process_batch.py` ARC_ROIS and the committed lane artifact; the shot index and boundary
   to `tools/demo/build_report.py:384-395` (ffmpeg scene detection, threshold 0.28). It carries
   the badge the repo already ships on `validation/compare_cuts_dan.json`:
   **PREDICTED · RELATIVE · WITHIN-ITEM**, with that artifact's own qualifier — *"NOT an absolute
   performance prediction, NOT validated vs retention/ThruPlay. A hypothesis, not a result."*

   **What the sentence must not say is what is *on* that shot.** `[NEEDS BUILD — there is no face
   detection, no shot-content labelling and no "product card" concept anywhere in the repo, and
   OCR and ASR are off in the only shipped report (`public/preflight/batch_report.json`:
   `asrBackend: "none"`, `ocrBackend: "none"`, flags `no_asr_backend`, `no_ocr_backend`).]` Any
   version of this sentence that names what the viewer is looking at is a promise, not a
   read-out. This is the exact capability boundary a demo must not cross.
3. **It generalizes to creative that does not exist.** A live test can only compare what was
   built. A prior can score a storyboard, an animatic, or a variant nobody has cut yet.

Note carefully what (2) does and does not license. It licenses *description*. It does not license
*prescription* — "improve your salience response and the ad will perform better" asserts a causal
chain whose second link is exactly what the three backtests tested and failed to find. The single
most dangerous word in the founders' target sentence is **"improve."**

### 2.5 What would falsify Soma's value

Five falsifiers, in the order they should be tested, cheapest first.

**F1 — Customers will not hand over the ad account.** *(Cheapest. Test this week.)* If the
account-ownership conversation kills the sale, Serve is unreachable and Soma is back to selling a
$29–199/month commodity. This costs zero engineering to test: ask five prospects. It should be run
before any of the 6–10 weeks of Meta approvals described in §8.2.

**F2 — The prior adds nothing over dumb features.** If, at adequate n, the neural score does not
beat the ffmpeg baseline at predicting realized outcome after partialling, the brain layer is
decoration and Soma is an honest agency with a good chart. *Current evidence: three NULLs at
n=29.* The decisive test is described in §9 step 3 and it is the highest-priority capital
expenditure in the company.

**F3 — The diagnostic is not stable under irrelevant perturbation.** If the per-second read-out
flips under re-encode, ±1 frame shift, small crop, or a bitrate change, it is not sellable at any
price. **Nothing in the repo measures this.** Beware of substitutes: an internal-consistency
figure — spatial smoothness across vertices, or determinism across re-runs — measures the
behaviour of a deterministic model's own output and is *not* evidence of robustness. `[The first
draft quoted "split-half reliability across vertices is r=0.998+"; that number traces to nothing
in this repo and has been removed. The only split-half figures committed are the TVSum annotator
ceilings of 0.13–0.16 at `docs/reports/FIRST-REAL-RUN.md:32-34`, which are a different quantity
entirely.]` The real test is cheap — one video, five perturbations, the existing pipeline.

**F4 — The recut does not move the outcome.** If re-scoring shows the predicted response improved
but realized performance does not move against a control, IMPROVE is theater. This requires an
interventional test with n = creatives, not seconds, and it is the one falsifier that **only Serve
can run**. That is the structural argument for Serve stated as an experiment rather than a
strategy — and §4.6 is how the control arm gets paid for.

**F5 — The service does not de-headcount.** If accounts-per-operator does not rise across cohorts,
this is a ~30%-margin agency and should be priced, staffed and funded as one. Measurable from month
one; see §4.5.

A company that publishes these five and reports against them quarterly has a defensible claim to
institutional honesty that its published correlations currently cannot support on their own.

---

## 3. Analyze / Improve / Serve

### 3.1 ANALYZE — the wedge

**What it is today.** Upload 1–10 ads with a brief; a human runs the offline batch on a provisioned
GPU box (`tools/concierge/run_batch.py`); the site reads back a report with per-second lanes,
per-shot diagnosis and re-cut comparisons. Vercel has no Python, so every compute-bearing route is
default-closed and the site is a pure reader over precomputed artifacts
(`src/lib/edit-capability.ts:29-31`, `src/lib/beta-gate.ts:97-99`).

**Why it is the wedge and not the moat.** It is the only tier that works end to end today; it is
cheap to deliver (§4.1); it produces the artifact that starts the conversation. But the category
is commoditized at both ends of the price band (§1.2) and Soma's published validation is currently
behind a $29/month competitor's. **Analyze's strategic job inside the loop is qualification and
data intake** — it tells you whether this account has the creative volume and the willingness to be
measured that Serve requires, and it starts building the corpus.

**But Analyze is also a product a customer may buy and stop at, and that is not a failure mode.**
The founder's specification is explicit that analysis-only is a legitimate, supported entry point
and the near-term commercial reality (§3.4). Two consequences follow and they pull in opposite
directions, so both belong on the record. Analysis-only revenue is the only revenue available
before Serve exists, so it must be priced and delivered as a real product rather than as a loss
leader. And §1.2's price floor is exactly the reason it cannot be the company: an analysis-only
customer is buying into a band where a $29/month competitor publishes better validation. **Sell it,
staff it, do not build the plan on it.**

**One thing to fix before it is sold as a product.** Every score a customer sees is a within-batch
percentile over n=5 (`public/preflight/batch_report.json`: `scoring.nAds: 5`, `percentileGrid`,
`smallNCaveat: "Batch z-scores over n=5 are dominated by single outliers. Treat rank order as
ordinal, not the gaps between ranks."`). The dashboard refuses to sort the library by score for
exactly this reason and says so (`src/app/dashboard/page.tsx:3-8`). That is honest and correct,
and it is also a product ceiling: a score that is not comparable across runs cannot support an
account-level narrative. The corpus run in §9 step 3 fixes this as a side effect
(`docs/strategy/PLAN.md:122-127`), which is a second reason to prioritise it.

### 3.2 IMPROVE — the proof, deliberately small

**The founders' judgement, and why it is right.** "We generate your ads for you" was rejected as a
wedge. Two stated reasons: companies want to own their creative, and a real creative agency does it
better. Both hold. Two more that strengthen the case:

- **Generation destroys the training signal.** The value of a re-cut is that it is a *paired
  comparison* — same footage, same brand, same audience, one controlled difference. That is the
  cleanest label a creative model can get, and `src/components/demo2/ServiceTiers.tsx:45` already
  identifies it: tier 02 feeds *"Matched cuts of one creative — the cleanest pair the model can
  learn from."* A generated asset shares nothing with the original and is therefore an
  uncontrolled comparison. Generation is worse data, not just worse positioning.
- **The market is occupied and priced at zero.** AdCreative.ai and Pencil are there, at $39/month,
  claiming 90%+ accuracy. Competing there means competing on a claim Soma's discipline forbids it
  from making.

**Why "small" is a margin decision.** YC states the failure mode directly: *"humans in the loop
should scale nonlinearly. If revenue scales just in line with the number of humans you add, you'll
have major problems"*
(https://www.ycombinator.com/library/Rk-how-to-build-an-ai-native-services-company). A human editor
cutting video per client is precisely the headcount-linear risk. Keeping Improve to a bounded,
mechanical edit space — remove a shot, trim the head, re-order, add an audio cue — is what makes it
automatable later. Full editorial judgement is not. It is also what makes the per-recut fee in
§4.2 pricable: a bounded operation has a knowable cost, an editorial judgement does not.

**Where it stands today.** The edit space is real: shot detection, bounded operations, real ffmpeg
renders, rows in `edit_cuts` with an `est`/`measured` honesty flag enforced at three layers
(`tools/edit/ops.py:44-47`, migration `0008`, `src/lib/edit-cuts.ts:15-20`). But the candidate set
in the only working ingest path *is not a search*: `scripts/ingest_partner_ad.py:242-286` says so
explicitly — "a deterministic spread of edits, chosen WITHOUT an arc … this cannot be a search
result and does not pretend to be one." Making it arc-driven is the obvious next increment and it
is small.

**Partnering out heavy editing is correct** — and note that this makes the agency a *supplier*, not
a channel and not a second market side. See §5 and §6.

### 3.3 SERVE — the moat

**What it is.** Soma runs the campaigns on the client's ad account, passes media through at cost,
and charges a flat fee for the intelligence layer.

**Why it is the moat and not merely a service line.** Not because placing media is hard — it is
four POSTs plus a video upload, roughly 5–8 engineer-days
(https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview). It is the moat
because **holding the ad account is the only mechanism that produces outcome labels**, and outcome
labels are the only thing that can promote a regional diagnostic from an observation into advice
(§7). Without them, F4 above is untestable forever, and IMPROVE is permanently unfalsifiable.

**The dependency structure, stated plainly:**

| Tier | Alone it is… | With the others it is… |
|---|---|---|
| Analyze | a commodity score, price floor ~$29/mo | the qualification and intake step |
| Improve | an unfalsifiable claim that an edit helped | the interventional arm of the experiment |
| Serve | an agency with a 30% margin | the label generator that makes the other two true |

That table is also the answer to "why won't someone unbundle you." Each piece is individually
weak. The loop is the product.

**The current state is zero.** There is no code anywhere in the repo that creates, manages or reads
a campaign, ad set, ad account, placement or spend on any platform. The only Meta code targets the
public Ad Library READ archive (`ad_fetch_bb.py:809`, the `ads_archive` endpoint; `:790` shows
`ads_read` is the only scope requested). There is no `outcomes` table; `docs/strategy/PLAN.md:170-183`
specified one and it was never built. There is no fee, invoice or billing entity either (§4.7).
Soma has no head start here whatsoever.

### 3.4 The Serve specification, as the founder wrote it

This subsection is founder-authored product direction and is authoritative on **what the product
is**. It is not evidence about what has been built. Every step below is written in the future
tense on purpose: against §3.3's "the current state is zero," present tense would be a false
statement about a commercial capability, which is the §8.5 failure mode.

**What Serve means.** Instead of handing a customer an attention score and telling them to go buy
ads on Meta themselves, Soma will manage distribution across channels — Meta, TikTok, Google.

**The loop, in order:**

1. The customer uploads an existing ad or an ad concept.
2. Soma analyzes attention and identifies weak moments. *(Ships today, per §3.1 — with the
   PREDICTED · RELATIVE · WITHIN-ITEM badge and the positional-only constraint of §2.4.)*
3. Soma suggests or applies small improvements — stronger hook, cuts, audio changes. *(Partial:
   the bounded edit space is real, the candidate set is not yet a search — §3.2.)*
4. The customer chooses a budget and a campaign goal. `[NEEDS BUILD]`
5. Soma places and tests the ad across platforms. `[NEEDS BUILD]`
6. Soma collects performance data and feeds it back, so future scoring and recommendations
   improve. `[NEEDS BUILD]`

**Step 6 is the whole commercial argument and it must not be written as a result.** It connects
predicted attention to realized campaign outcomes instead of leaving the company resting on a
pre-launch score, and it lets Soma run its own A/B tests across versions of one ad. But the
predicted-response → outcome link is precisely what three tests at n=29 failed to find (§1.2). **So
step 6 is the mechanism by which that link would be *earned*. Write it as the reason the loop is
worth building; never as a description of a link that exists.** Everything in §4.6, §7.1 and §7.4
is an elaboration of that one distinction.

**The customer flow, before and after:**

| Today, without Soma | With Soma, once the loop exists |
|---|---|
| Make the ad internally | Upload the creative |
| Send it to Meta and spend money to find out whether it works | Receive an attention analysis, heatmap and overall score before spending |
| Receive platform analytics, which are less directly actionable for improving the creative | See the specific parts of the video the read-out flags — as a window, not a second (§1.4) |
| Fragmented iteration: edit, relaunch, wait, repeat | Use the improvement layer for bounded fixes — cuts, hooks, audio. Heavier generation is optional and explicitly not the wedge (§3.2) |
| — | Launch through Soma across channels `[NEEDS BUILD]` |
| — | Monitor results in one dashboard `[NEEDS BUILD]` |
| — | Keep updating the ad against live performance feedback `[NEEDS BUILD]` |

**The before/after demo, and the constraint that governs it.** The demo asset is a side-by-side:

| Without Soma | With Soma |
|---|---|
| Customer launches an original ad via Meta | Customer uploads the same ad to Soma |
| Meta campaign/dashboard view | Soma analysis: heatmap, attention signals, overall score |
| Platform metrics and campaign cost | Soma's recommended changes and the revised creative |
| Results from the original version | A/B test or comparison against the improved version |
| Limited creative feedback loop | Ongoing feedback: analyze → improve → serve → learn |

Presentation assets: a reference Meta dashboard and a Soma dashboard mockup, plus an original and
an improved version of the same ad. The metric story compares **spend, impressions and performance
outcomes** while showing that Soma gives more direct creative guidance. The worked example uses a
fictionalized client and roughly **$1K/month** of illustrative ad spend.

**MANDATORY labelling constraint — this is not a style note.** A fictionalized client and an
illustrative spend figure are legitimate presentation devices. This repository also has a
documented history of exactly this failure mode: `docs/strategy/PLAN.md` §0.3 catalogues invented
design-partner counts and a logo wall of non-customers. So:

- **The client must be visibly fictional on the artifact itself**, not merely known to be fictional
  by whoever is presenting it. Label it in the frame: *"Illustrative example — not a customer."*
- **The $1K/month spend and every downstream metric** in the comparison must be marked illustrative
  and must never be presented as a measured result or as a Soma outcome.
- **The "With Soma" performance column must not show a fabricated lift.** Either leave the outcome
  cells explicitly empty pending a real campaign, or show only what is real — the analysis output
  and the recut, both of which exist.
- **If a real corpus ad is used as the creative** — e.g. `data/ads/videos/tt_09.mp4`, an
  *unattributed* corpus spot: its manifest note is `tt7663558279403405333;ctr_0.25;dur_25.3s`
  and carries **no `brand_` tag**, so any brand attribution comes from reading the burned-in
  captions rather than from the corpus. Only 179 of 1,359 manifest rows carry a brand tag at all,
  and the row tagged `brand_cozey` is `tt_322` (CA, 47.9 s). The brand must therefore be
  anonymised, or the frame must state that the brand is not a Soma customer and did not
  participate. Do not pair a real brand's footage with an invented spend story.

**And the strongest version of this demo is the one that obeys the constraint**, not the one that
tolerates it: left column real (a real ad and its real platform-side reality), right column real
(the real analysis and the real recut), outcome row honestly marked *"pending first live
campaign."* A YC partner who asks for the artifact gets a document that survives the asking. A
fabricated lift does not survive one follow-up question, and the follow-up question always comes.

**One tension to resolve before the demo is built, not after.** The illustrative spend is
~$1K/month; §4.3's economics only work at $200k/month, and the $50k footnote case is already
marginal. A demo that anchors a partner on a $1K advertiser is showing the segment §4.3 explicitly
declines to sell to. Either raise the illustrative spend to the ICP, or state in the frame that the
$1K figure is a scale-independent walkthrough of the loop and not a unit-economics claim.
`[NEEDS DECISION — illustrative spend figure for the demo, and whether it is the ICP figure.]`

---

## 4. Unit economics and pricing

### 4.1 Marginal compute cost per ad scored

Derived from the pipeline's own figures, not assumed:

- TRIBE feature extraction: **~2.5 min/ad** (`docs/strategy/PLAN.md:109`).
- One ad end to end including CPU stages: **~4 min** (`demo/README.md:83`).
- A100 rental: **~$1–2/hr** (`docs/GTM/YC-APPLICATION.md:318`, RunPod/Lambda/Vast).

At $1.50/hr, 4 minutes of whole-box time = **$0.10 per ad scored.** Extraction alone is $0.06.
Storage is noise, but **the unit is the scored clip, not the ad**, and this document previously got
that wrong. Persisting the irreversible full float16 vertex map is roughly 1.1 MB gzipped per 30 s
*scored clip* `[ESTIMATE — gzip ratio measured locally on one preds file under gitignored /data/,
with no committed artifact; fold it into a committed benchmark before it is quoted anywhere else]`.
Every rendered re-cut gets its own read-out, so at four re-cuts per ad and 1,000 ads/month that is
~5,000 clips ≈ **6 GB/month**, not 1 GB. Still noise — but anyone quoting a per-ad storage figure
must say whether they mean the ad or the ad plus its cuts.

Even multiplying by 10× for retries, idle box time, orchestration and re-scores, the marginal cost
of the intelligence is **~$1.00 per ad.** `[ESTIMATE — derived from the two repo timings above and
a public rental rate; not measured on a production box.]`

**The consequence is the whole economic story: the intelligence is functionally free, and the
entire cost structure is human.** That is simultaneously the best and the worst fact about this
business.

### 4.2 The pricing model: a bundled weekly price per campaign (superseded: flat fee)

**Decision (founder, 2026-08-07, superseding the flat-fee decision below): the
onboarding brief — reach, duration, platforms, goal — returns a single all-inclusive
weekly price per campaign. That price bundles media spend across every chosen network
plus Soma's margin, default 20% on serving costs. One number, one bill; the client
never manages per-platform finances. Campaigns renew weekly until paused.** Implemented
in migration `0016_campaign_pricing.sql` and `tools/serve/pricing.py` /
`src/lib/pricing.ts` (parity-gated); renewals are scheduled by `tools/serve/renewals.py`
and refuse to execute while the licence gate stands. The buyer-facing sentence is now:
*"one weekly price, everything included, pause any time."*

**The superseded decision, kept as argument history.** The prior revision charged a flat
monthly platform fee with media at cost, because a fee indexed to spend has the
incentive gradient this document condemns in agencies: if the client doubles spend on a
losing creative, the vendor's revenue doubles. That argument was real and it has a real
cost now that the model is bundled — Soma's margin grows with managed spend, so the
incentive-alignment claim in §1.3 Mechanism B and §1.5 **cannot be asserted in its old
form and has been retired**. What can be said honestly instead: the client sees one
number before committing, the holdout arm is still Soma-funded (§4.6), and the model's
recommendations are still measured against a random control — alignment by
*instrumentation*, not by fee structure. A pitch that quietly kept the old sentence on
top of the new model is a pitch that gets caught.

Note that flat pricing has precedent in the adjacent category: Motion, the creative-analytics
incumbent, bills a flat monthly fee with a spend *tier boundary* rather than a spend *rate*.

**Percentage bands stay in the document only as a sanity-check against Soma’s bundled 20%,
never as the billing basis.** Dated sources: `PRICING-COMPS.md` (fetched 2026-08-07). The
older Motion $750/$1,050 row is **stale** and must not be quoted; Motion’s public Starter
list price in 2026 recaps is $250/mo (analytics, not serving).

| Reference | Rate | Includes execution? | Source quality |
|---|---|---|---|
| Motion (creative analytics) | Public Starter recap **$250/mo** / $50k spend cap; Pro+ quote-only | No | [rule1 recap](https://rule1.ai/articles/motion-pricing) via `PRICING-COMPS.md` · fetched 2026-08-07 · still not a first-party page fetch |
| Smartly.io (automation + serving) | Custom; commonly **~2–4% of managed spend** + minimums; **no public price page** | Yes | Third-party 2026 reviews — see `PRICING-COMPS.md` |
| Performance agencies | **10–20% of spend** *or* a multi-thousand monthly retainer, **on top of** media | Yes | Industry blogs 2026 — `PRICING-COMPS.md`; still no named agency rate card |

**The buyer-facing sentence must lead with the structure, not with the rate.** A percentage spoken
first is the number the buyer remembers and anchors on. Say it in this order:

> *"One weekly price, everything included, pause any time. Media across your platforms plus our
> margin (20% today) is a single number. If you want to sanity-check it against an agency: they
> commonly take a mid-teens percent of spend, or a multi-thousand monthly retainer, on top of
> media you still pay the platforms. We take 20% inside one bill so you never manage
> per-platform finances."*

**If a spend-linked component that *increases* the fee ever proves commercially unavoidable,** cap
it in absolute dollars per account per month, say so in the MSA, and downgrade §1.5 to the weaker
true claim: *"our fee is capped, so above the cap we are paid nothing extra for your spend."* Do
not leave the strong sentence standing over a weak contract.

**On the terminal structure, and the one construction under which a performance share is not the
same problem.** YC is explicit:
*"Cost plus pricing caps your upside permanently. Don't do it. Straight line undercutting makes
your work seem cheap and potentially low quality. Price on value."* Passing **media** through at
cost is not cost-plus pricing of Soma's work — media is not Soma's COGS to mark up. It is a
conflict-removal device and should be framed as one. But the *fee* must be priced on value, and
"we're cheaper than the agency" is the same trap as the dead pre-test pitch.

The terminal structure is probably **flat fee + performance share** — but only under a construction
this document has to specify, because the obvious construction fails.

**A performance share must be indexed to an efficiency *rate*, never to an absolute outcome
total.** The natural version — a share of attributed revenue or conversion value — has exactly the
gradient we are refusing: at constant efficiency, doubling spend doubles attributed revenue and
therefore doubles Soma's fee. That is a percentage of spend wearing a different name. The version
that works is indexed to **measured CPA or ROAS improvement against the randomly-assigned control
arm** (§4.6): the share pays Soma more when the client's money works *better*, and pays nothing
extra when the client simply spends *more*. Denominated that way it is a genuinely different object
and should be named as such so it does not read as the same problem returning.

**If it cannot be defined that way, it is a percentage of spend under another label, and §1.5's
sentence changes the day it is signed.** It is also unavailable today on both legs: defining
"performance" requires the outcome labels Soma does not yet have, and indexing to an improvement
*against a control arm* requires the control arm, which is §4.6 and does not exist either.

### 4.3 Worked example — the primary case, a $200k/month brand

**Assumptions, all hypothetical and none observed:**

| Assumption | Value | Why this value |
|---|---|---|
| Managed spend | $200,000/mo | The segment where a flat fee clears an operator's cost at low N — see the footnote case below |
| Creative volume | 40 creatives scored + 5 recuts delivered/mo | `[ESTIMATE]` |
| Platform fee | $7,500/mo per managed brand | `[ESTIMATE — the founders have not named a price; this is an illustrative figure chosen to land near 5% of the primary case's spend]` |
| Per creative scored | $50 | `[ESTIMATE]` |
| Per recut delivered | $500 | `[ESTIMATE]` — bounded edit + render + verify re-score |
| Random-arm holdout | 10% of spend, rebated (§4.6) | `[ESTIMATE — the target fraction must be written down before client #1]` |
| Fully-loaded operator cost | $10,000/mo | `[ESTIMATE — needs a real salary + overhead figure]` |

**Revenue per client-month:**

| Line | Amount |
|---|---|
| Platform fee | $7,500 |
| 40 creatives scored × $50 | $2,000 |
| 5 recuts delivered × $500 | $2,500 |
| **Gross fee** | **$12,000** |
| Less holdout rebate (§4.6), h = 0.10, g = 0 | −$1,200 |
| **Net revenue R** | **$10,800/mo** |

That is **5.4% of a $200k spend** — and, critically, **$10,800 whether the client spends $200k or
$500k.** At $500k of spend it is 2.2%. The fee tracks managed brands and creative volume; it does
not track money.

**Direct COGS per client-month:**

| Line | Cost |
|---|---|
| Compute (~50 scoring runs × $0.10, recuts re-scored) | ~$5 |
| Storage (full vertex maps) | <$0.10 |
| Infra amortised (Supabase, Vercel, box idle) | ~$50 `[ESTIMATE]` |
| **Non-human COGS** | **~$55** |
| Human COGS | $10,000 ÷ N |

Gross margin is therefore, to a good approximation:

> **GM ≈ 1 − C / (N × R)** where C = operator cost/mo, N = accounts per operator, R = net
> revenue/account/mo

At C = $10,000 and R = $10,800:

| N | Human COGS/account | Gross margin | Revenue per operator |
|---|---|---|---|
| 1 | $10,000 | **7%** | $10,800/mo |
| 2 | $5,000 | **54%** ← YC's stated bar | $21,600/mo |
| 3 | $3,333 | **69%** | $32,400/mo |
| 4 | $2,500 | **77%** | $43,200/mo |
| 6 | $1,667 | **85%** | $64,800/mo |
| 8 | $1,250 | **88%** | $86,400/mo |

Three founders fully deployed as operators at N=4 is ~$1.6M of annual revenue; at N=8, ~$3.1M.
That is a business worth building at its own target, which the $50k configuration below is not.

**Footnote — the $50k/month segment, and why we are not selling to it.** Under flat pricing a
$50k spender buys a smaller package: $3,000 platform + 15 scores + 2 recuts = $4,750 gross,
$4,275 net after rebate (8.6% of spend — barely under the agency band, so the hard-dollar saving
that closes the sale in §1.3 mostly disappears).

| N | Gross margin | Revenue per operator |
|---|---|---|
| 2 | **−17%** (loss-making) | $8,550/mo |
| 3 | **22%** | $12,825/mo |
| 5 | **53%** | $21,375/mo |
| 8 | **71%** | $34,200/mo |
| 12 | **81%** | $51,300/mo |

Break-even is N ≈ 2.3 and YC's bar needs N ≈ 5. **Same business, same product, and it needs more
than twice the accounts per operator to reach the same margin, while the sale is harder because
the fee saving against an agency is thin.** The economics say: fewer, larger accounts, always.
This aligns with YC's *"early demand trap … cap your first pilot customers to a small handful"*
and with `docs/strategy/PLAN.md:343-345`'s existing concierge posture. It is also what §7.4 W3
will probably say independently, once the cost per clean label is measured.

**The honest headline:** *at the primary configuration Soma is profitable at one account per
operator and clears YC's bar at two — but N today is effectively 1–2 and the delivery is manual.*
A human runs `tools/concierge/run_batch.py` per batch, and the concierge README documents no
reaper and no stale-claim recovery.

### 4.4 The denominator nobody has stated

The margin table above is meaningless without a comparison, and the comparison is missing from
every document in this packet: **how many accounts does an account manager at a boutique
performance agency carry?** `[NEEDS EVIDENCE — accounts per account-manager at a boutique
paid-social agency, and the revenue per head that implies; sourced, not remembered. This is hours
of desk research and it is the denominator the entire operating-leverage argument divides by.]`

Here is the claim it would test, stated in the open so it can be attacked:

> At $200k/month of managed spend, a performance agency at 15% bills $30,000/month per account.
> Soma bills $10,800 — roughly a third — while delivering *more*: scoring, recutting, media
> operations, and a funded randomised holdout. **To match an agency's revenue per head at a third
> of their fee, we have to run roughly three times as many accounts per person.** Everything we
> are building for operating leverage exists to close that specific gap, and N per operator per
> cohort is the number we will publish quarterly.

If the agency denominator comes back and the gap is four or five times rather than three, that is
a real finding and it changes the staffing model. It should be found now, not in month nine.

### 4.5 Why this is software and not headcount — three mechanisms, none yet measured

YC's bar: *"Traditional services firms top out around 30% margins … the bet is AI operating
leverage gets you closer to software margins, say 50% plus … You don't need to be there right away.
But the trajectory has to be believable."* So the deliverable is not a margin claim, it is a
believable trajectory for N. Three mechanisms, each tied to something concrete:

**M1 — The population baseline removes a human interpretation step.** Today every score is a
within-batch percentile over five ads, which is *why* a human must read every report and *why* the
library cannot sort by score. The corpus run in §9 step 3 replaces the within-batch percentile with
a population distribution (`docs/strategy/PLAN.md:124-128`).

**One run, one number, and say which corpus.** The run §9 step 3 specifies is the **673 usable
TikTok ads**: at `PLAN.md:109`'s ~2.5 min/ad that is **~28 GPU-hours ≈ $30–60** of rented A100 time
at `docs/GTM/YC-APPLICATION.md:318`'s $1–2/hr. `[ESTIMATE — derived from two committed repo
figures, not measured on a box.]` Sweeping the **full corpus** instead — the ~1,330 of 1,359 ads
that have no TRIBE features yet — is the ~55 GPU-hours ≈ $55–110 that `PLAN.md:104-118` prices, and
it is a different and larger job that also delivers the ~1,300-ad population baseline
`PLAN.md:124-128` describes. **The 673-ad TikTok run is the cheaper decisive one; the full sweep is
the completionist one. Pick one and say which.** A previous
draft of this section quoted the full-sweep hours against the TikTok-run description, which is the
kind of mismatch that makes a reader stop trusting the arithmetic rather than the sentence.

Either way it permanently deletes a per-account human step, it is the cheapest operating-leverage
purchase available to this company by several orders of magnitude, and it doubles as the F2
falsification test. **The experiment that decides whether Soma's science is real costs about fifty
dollars and has not been run.** Do it first.

**M2 — Outcome labels turn a creative decision into a review decision.** Today the recut candidate
set is a deterministic even spread, not a search
(`scripts/ingest_partner_ad.py:242-286`). With outcome labels, candidate ranking becomes a learned
policy and the editor stops choosing and starts approving. `[NEEDS EVIDENCE — I would guess a
5–10× throughput difference per human, but I have no measurement and this number should not be
used until one exists.]`

**M3 — Failure modes become a catalogue, and a catalogue is a template.** YC: *"Variance is the
existential problem … Customers will fire you for variance faster than they will fire you for being
a bit slower or a bit more expensive."* A per-second regional read-out is a natural taxonomy, but
**today the taxonomy can only be indexed by position, not by content**: "salience response sits at
the bottom of the clip's range across shots 3–5, in the 3–8 s window" is a pattern Soma can
already name and match across clients. "…because the product card replaced the face" is
`[NEEDS BUILD]` — see §2.4. A named, catalogued pattern with a known fix is not judgement, and
non-judgement work is what raises N. The positional version of the catalogue is buildable now and
is worth building before the content version.

**The honest summary: none of M1–M3 has been measured.** What Soma has is a mechanism for each, not
evidence for any. The right thing to publish is **N per operator per cohort per quarter**, starting
from the first account. An investor who is shown a rising N across three cohorts has seen the
argument; one who is shown a projected margin has not.

### 4.6 The random arm, and who pays for it

The flywheel only produces interpretable labels if some variants are assigned **at random** rather
than by score. Without a random arm, every outcome Soma observes is conditioned on Soma's own
prior, and no calibration number computed from it means anything — which, incidentally, is true of
every competitor's outcome data as well. This is the single most valuable structural property
available to a company that both scores creative and buys media.

**But under the §4.8 architecture the media is the client's money.** So the naive version of the
plan is: spend the client's budget on creative Soma's own model predicts will lose, in order to
generate a proprietary training asset Soma owns and the client does not. That is an undisclosed
conflict of interest and the precise inverse of the claim in §1.3 and §1.5. Soma would be the only
party in the chain that profits from *that* specific waste. A seed investor who has funded adtech
will ask "whose money funds the holdout" inside two minutes; an enterprise procurement team will
find it in the MSA review. Discovering it in diligence is far worse than declaring it.

**Decision: Soma pays for its own science, in the contract and in the pitch.**

The rebate rule, written into the MSA and computed by committed code from the outcomes table:

> **Rebate = h × F  +  h × S × g**, capped at F
>
> where *h* = the holdout fraction of spend, *F* = the month's gross fee, *S* = managed spend, and
> *g* = the measured proportional performance gap between score-selected and randomly-assigned
> arms, taken from Soma's own dated calibration artifact.

**Say the arithmetic, because the shorthand is wrong in a way that matters.** "The fee is rebated
by the holdout fraction of spend" reads as *Rebate = h × S* — at h = 0.10 on $200k of spend that is
$20,000 against a $12,000 gross fee, a rebate 1.67× the entire fee. That is not the rule. **The
first term is h × F: the fee is reduced by the same percentage as the holdout fraction. A 10%
holdout means a 10% lower fee** — $1,200 on the §4.3 configuration, every month, forever,
unconditionally and auditably, because Soma is running an experiment inside the client's account.

**The second term, h × S × g, is the only spend-linked component anywhere in Soma's contract, and
it can only ever reduce Soma's fee.** It is the part that scales with what the experiment actually
costs the client, so it has to be denominated in their money rather than in ours. It is capped at
F, so in the worst case Soma works the month for nothing; it can never make the month cost the
client more. That asymmetry is what lets §1.5 say "our fee never rises when your budget rises" and
is why that sentence does not say "does not move." Name the linkage in the pitch rather than
leaving a diligence reader to find it — a reader who finds a spend-linked term you did not mention
assumes there are others.

**And here is the part that is worth saying out loud in a pitch:** *g* is **zero today**, because
Soma cannot demonstrate that its score-selected arms outperform random ones — that is exactly what
the three backtests in §1.2 failed to find. So today the holdout has **no demonstrated cost to the
client**, and claiming otherwise would be claiming the very edge we have publicly failed to
measure. The moment the edge is demonstrated, the holdout acquires a real expected cost and Soma
starts paying it. **The cost of the experiment scales with the demonstrated value of the thing
being tested, and it is borne by the party that owns the resulting asset.**

The line for the pitch:

> We deliberately spend a fixed fraction of every campaign on variants our own model says will
> lose. We pay for that fraction ourselves, out of our fee. It is the only reason our calibration
> numbers will ever mean anything — every competitor's outcome data is conditioned on their own
> prior and is therefore uninterpretable.

**Four things this structure requires, and one residual conflict it does not remove:**

- **Name the number before client #1.** The target *h* must be written down, not discovered. It
  is a founder decision. `[NEEDS DECISION — target holdout fraction h.]`
- **Make it auditable, not asserted.** The build plan needs a `holdout_funded_by` column on
  `served_ads` alongside `assignment`, so the accounting is a query rather than a claim.
- **The schema needs two numbers, not one.** A single `holdout_rebate_pct` on the fee table cannot
  express *Rebate = h × F + h × S × g* — it collapses a two-term rule into one, and the invoice it
  produces will not be the invoice the MSA promises. Store *h* and *g* separately (or store the
  rule and its version), with *g* carrying the identifier of the dated calibration artifact it came
  from. This is the §4.7 requirement restated as a contract obligation.
- **Offer the choice at onboarding.** A *research tier* (funded holdout, discounted fee, client
  receives the calibration report) and a *production tier* (no holdout, full fee, no unbiased
  labels) makes the trade explicit and lets a client who genuinely cannot afford the variance opt
  out. Some will; that is fine, and it is better than surprising them.
- **The residual conflict, named:** the second rebate term gives Soma a financial reason to
  *under-report g*. Mitigation is structural, not moral — *g* is computed by committed code from
  the outcomes table, published in a dated artifact, and delivered to the client. It should be
  disclosed as a known conflict with a named control, in the same paragraph as the rebate. A
  reader who finds it themselves has found a problem; a reader who is handed it has been shown a
  process.

### 4.7 The fee has to exist in the schema, not just in this document

There is currently no fee, invoice, rate table or billing period anywhere in the repo, and no
derivation of billable amounts from spend or asset counts. The entire margin argument in §4.3–4.5
runs on a number the schema cannot produce. Four requirements follow, and they belong in the
build plan:

- A `billing_periods` / `brand_fees` table keyed to brand and period, with the **fee basis and
  rate recorded per period** so a rate change is dated rather than retroactive — and with **both
  rebate parameters stored, *h* and *g*, not a single rebate percentage.** §4.6's rule has two
  terms; one column cannot compute it, and the failure is silent: the invoice is simply wrong in
  Soma's favour the moment *g* stops being zero.
- Billable quantities derived from the `outcomes` view (assets scored, recuts delivered, holdout
  spend) rather than stored, so the rebate in §4.6 is recomputable and auditable.
- **Currency normalisation.** Outcome rows and ad accounts each carry their own currency; a fee
  is one number. FX policy and rate source must be decided once, not per invoice.
- **Meta Developer Policy 10.6 (effective 2027-02-03)** requires that, on request, Soma disclose
  spend separately from its fees and the associated fee structure. That report is trivial to
  produce if the fee model is in the schema and expensive to retrofit if it is not. Make it a
  named deliverable with the compliance date attached. Flat pricing makes this *easier* than a
  percentage would: there is no per-spend markup to reconcile, only a fee schedule and a rebate.

### 4.8 Principal vs agent — the accounting decision that is not an engineering decision

If Soma fronts the media cash, Soma is a media reseller: it carries credit risk and chargeback
exposure and **grosses up revenue** under an ASC 606 principal-vs-agent determination. At $200k
spend and a $10,800 fee, reported revenue would be $210,800 with $200,000 of COGS — a 5.1%
reported gross margin for economically identical work. That is a disastrous thing to put in front
of an investor for no benefit.

**Recommendation: client owns the ad account and the payment method; Soma takes partner access.**
This is also the only structure compatible with Meta policy 10.5, which forbids combining multiple
end advertisers in one ad account (https://developers.facebook.com/devpolicy/). It gives agent
accounting (revenue = fee only), no float, no chargeback exposure, and instant client revocability
— which is a trust feature, not a weakness, for a buyer who is being asked to hand over an account.
It is also what makes §8.2a scenario (3) survivable.

The mechanism: client's Business Manager grants Soma's BM partner access with tasks via
`POST /act_<ID>/assigned_users`, and Soma authenticates with a system-user token. Reject the
agency-owned child-Business-Manager structure — Meta's own docs note *"your clients don't have
access to the new child Business Manager and its ad account, unless you explicitly grant them
access,"* which is lock-in, and lock-in is a poor look for a company selling to brands who
explicitly want to own their own creative.

*This is not accounting or legal advice and the determination must come from a qualified
professional.*

---

## 5. Is it a marketplace?

**No. Say so, and stop saying otherwise.**

A two-sided marketplace connects two interdependent groups and does not sell anything itself
(https://www.sharetribe.com/how-to-build/two-sided-marketplace/). Under Analyze/Improve/Serve,
Soma **sells the work** to one group (advertisers) and **buys inventory** from suppliers (Meta,
TikTok, Google). Suppliers you buy from are a supply chain, not a second side.

The claim also fails on the thing that makes marketplaces valuable: **there is no cross-side network
effect.** Meta does not need Soma to find advertisers. There is no chicken-and-egg problem Soma
would have solved, and therefore none of the defensibility a partner would price in. Claiming
marketplace both overstates the moat and loses the room on the first follow-up question.

**The correct framing: a single-sided, vertically integrated services company with a proprietary
data loop.** The defensibility argument is not network effects; it is a data asset that accrues
only to whoever holds the ad account. That is a weaker-sounding claim and a stronger real one.

**Kill the two-sided idea on the record.** The only genuinely two-sided variant available is
advertisers on one side and creative agencies/editors on the other, with Soma matching and scoring
— and the founders have already rejected it by choosing to *partner out* heavy editing, which is
subcontracting, i.e. supply. `docs/strategy/PLAN.md:340-342` is the only place "two-sided" appears
in the repo; it should be amended explicitly so the idea does not resurface.

---

## 6. Agencies: partner or prey?

**Recommendation: prey on the Serve line, suppliers on the Improve line, customers on the Analyze
line — and never the GTM channel for Serve.**

### 6.1 Why they cannot be the channel

Serve competes for the same 10–20% of spend the agency takes, and displaces the agency's client
relationship. You cannot recruit a channel you are eating. An agency that understands Soma's model
will not send clients; one that does not understand it yet will send them once and then stop. That
is not a channel, it is a one-time harvest.

This is a live problem, not a hypothetical: `docs/GTM/YC-APPLICATION.md:485-499` makes boutique
paid-social agencies the primary first-users plan precisely because *"they talk to each other
constantly — one happy contact hands you five more."* That property cuts exactly as hard in the
other direction the moment one of them works out what Serve is.

**And §4.3 sharpens the conflict rather than softening it.** If the ICP is brands spending
$200k+/month, boutique paid-social agencies are neither the channel nor the customer — they are the
incumbent being displaced from exactly those accounts. **That GTM paragraph does not need
annotating, it needs rewriting**, and it must be rewritten alongside the positioning rather than
after it.

### 6.2 What an agency would genuinely get from Soma (Analyze only)

1. **A per-second regional diagnostic nobody else sells them.** VidCognition has explicitly vacated
   this ground in its own words: *"If you want region-level cortical detail, VidCognition is not
   the tool for that — a research platform is"* (https://vidcognition.com/science). Neurons sells
   attention heatmaps, not per-second network trajectories. This is real, unclaimed territory.
2. **A reason to charge for a creative round.** A written, timestamped diagnostic is a billable
   deliverable and makes the agency look rigorous to its client.
3. **Pre-launch triage that reduces variants built.** Same arm-reduction claim as §1.3, same NULL
   caveat — must be sold as a hypothesis, not a result.

Offer it white-label, so the agency presents the read-out as its own, on a licence that explicitly
permits Soma to use the creative-plus-outcome pairs for model training (required anyway by Meta
policy 10.8, which obliges flow-down of Meta's terms to clients).

### 6.3 The relationship that is actually clean

**Agencies as the IMPROVE subcontractor.** Soma sends editing work; the agency does not send
clients. No channel conflict, because the direction of value is unambiguous. This matches the
founders' instinct to partner out heavier editing and is the one agency relationship that is stable
under Serve. Note that the per-recut fee in §4.2 is what makes this priceable: a bounded edit has a
cost that can be passed through with a margin, and an editorial judgement does not.

### 6.4 Be honest about the two-facedness

Selling Analyze to agencies while going direct to brands with Serve is a real tension. The market is
small and talkative. Mitigations: (a) never pitch Serve into an agency's client; (b) be openly
transparent that Soma also serves direct — an agency that discovers it later is a burned and vocal
relationship; (c) accept that the agency channel has a finite life and do not build the plan on it
lasting.

### 6.5 The segment we are deliberately not selling to yet

**Brands running paid social in-house.** For them Soma is not a substitution, it is an addition:
total cost goes up by the full fee, and the only justification is the prior. That is a sale that
requires the science to be true, and the science is currently three nulls. **Deprioritise this
segment until F2 returns**, and revisit it the week it does. Selling into it now means making
exactly the claim §2.1 says not to make, to the buyer least able to absorb it being wrong.

---

## 7. The moat

### 7.1 What the asset actually is

A corpus of triples: **{creative asset × per-second predicted cortical response × realized
commercial outcome}**, at ad level — which on Meta *is* creative level, since `/{ad-id}/insights`
is a first-class edge with breakdowns by placement, platform position, device, age, gender, country
and hour. With a randomised holdout (§4.6), a known fraction of those triples is **unconditioned on
Soma's own prior**, which is what makes any calibration computed from them mean something.

Nothing like this exists publicly. `validation/ad_backtest.json` (n=29) is the largest such thing
Soma has, and it is small enough to be an anecdote — and, as §9 step 3 explains, all 29 carry a
longevity proxy (`days_running`) rather than a performance-ranked label. Note that even the
corpus's best available label, TikTok's `ctr_index`, is a relative index over an already-curated
showcase of strong ads, not a winner-versus-loser outcome — **there is no true outcome label
anywhere in this repository, and Serve is the only mechanism that produces one.**

### 7.2 Why it compounds

1. **Collection is free once you serve.** Labels arrive as a byproduct of work the client is already
   paying for. Every competitor has to *ask* for this data; Soma would already have it.
2. **The Improve tier produces matched pairs.** Original vs recut, same brand, same audience, same
   budget window, one controlled difference. That is the cleanest possible training signal for a
   creative model, and producing it requires *both* making the edit *and* running the media. Almost
   nobody can do both.
3. **The expensive half is already paid for and reusable.** TRIBE extraction is deterministic and
   cached to `preds_*.npy` (`demo/process_batch.py:509-556`), and the full (T, 20484) tensor
   survives at roughly 1.1 MB gzipped float16 per 30 s scored clip — the clip, not the ad; see
   §4.1 `[ESTIMATE]`. **Every future read-out head
   can be retrained over the entire historical corpus without re-running a single GPU-hour.** That
   is a genuine compounding property and it argues strongly for persisting the full vertex map from
   day one: parcels can always be re-derived from vertices, never the reverse.
4. **It is the only thing that improves the product without new headcount** — i.e. it is the
   mechanism behind M2 in §4.5, and therefore behind the margin trajectory.

### 7.3 Why it is hard to copy

Copying requires holding the ad account *and* running an fMRI encoder. The claim is that nobody
currently has both — and that claim needs to be sourced, because the entire non-copyability
argument rests on two universal negatives about nine named third parties.

`[NEEDS EVIDENCE — the check is: fetch each company's own product and pricing pages, record the
URL and the fetch date, and record whether media placement (or ad-account access) is advertised.
That check has not been performed for this document; the first draft asserted "verified" with no
URL, no date and no method, which `docs/strategy/PRODUCT.md:100` forbids. Note also what the check
can and cannot yield: the strongest true form is "none of them advertises media placement," which
is absence of a public claim, not proof of absence.]`

- **Creative analytics** — VidMob, Motion, AdCreative.ai, Pencil. Expected finding: none place
  media. `[NEEDS EVIDENCE, as above.]`
- **Neuro/biometric testing** — Neurons, Adverteyes/Realeyes, Affectiva/Smart Eye, Nielsen,
  Immersion. Expected finding: none hold an ad account; Neurons positions explicitly as separate
  from media buying. `[NEEDS EVIDENCE, as above.]` The related claim that *"realeyes.ai has
  pivoted to human verification and the ad business runs as adverteyes.ai"* is a factual assertion
  about a named third party with no source at all — `[VERIFY — two URLs and a fetch date, or
  delete it.]`
- **Media automation** — Smartly.io serves, but has no brain prior.
- **Attention-driven buying** — Adelaide AU in Amazon and Yahoo DSPs, Lumen aCPM. Real, live, and
  on the **placement** axis, not the creative axis. The IAB's own attention playbook states that
  in *"CTV and walled gardens, third-party data signal attention measurement alone is
  insufficient"* — Meta and TikTok are exactly the walled gardens where the existing loop
  structurally cannot reach.

**Required qualifier:** the claim is *"nobody closes the loop from creative-level neural prediction
to buying."* Not *"nobody closes the loop."* The unqualified version is false and a sharp listener
will break it with Adelaide.

Plus a time barrier: 6–10 weeks to a first programmatically-served client ad, of which only ~3–4
weeks is engineering; the rest is Business Verification, App Review, and paperwork. That is a real
head start for whoever moves first, and Soma's is currently zero.

### 7.4 Weaknesses — the part that matters

**W1 — It may be prohibited as described.** Meta Developer Policy 10.7b: *"Only use data from an
end-advertiser's campaign to optimize or measure the performance of that end-advertiser's Meta
campaign."* 10.7d: *"Don't mix data obtained from us with advertising campaigns on different
platforms."* 10.7g: keep each advertiser's data separate (https://developers.facebook.com/devpolicy/,
last updated 2026-02-03). **The pooled cross-client, cross-platform training set is the specific
activity these clauses name.**

**And there is no written-approval escape hatch, contrary to what an earlier draft of this document
asserted.** Section 10.7 contains exactly one qualifier — *"unless the terms for that product allow
it explicitly"* (10.7a and 10.7d). The phrase *"as otherwise approved by Meta in writing"* is in
**10.5**, which governs the combination of multiple end advertisers in one ad account, not data
use; the earlier draft imported it across sections and then built a mitigation on it. 10.7a's only
exception is aggregate-and-anonymous use *"only to assess the performance and effectiveness of the
end advertiser's campaigns"* — which on its face does not reach pooled cross-client model training,
because training a prior that will be applied to *other* advertisers' creative is not assessing
*this* advertiser's campaigns. `[NEEDS EVIDENCE — no published route from 10.7 to a pooled corpus
has been identified. If one exists, it has not been found, and the search should be recorded.]`

**This correction makes the moat's legal position materially worse than the previous revision
implied, and it is the right direction to be wrong in.** A misattributed clause is the failure a
diligence lawyer breaks in five minutes, and the mitigation that rested on it is gone rather than
weakened.

This is the **single highest-value open question in the entire strategy**, it is adverse, and it
costs one email to Meta's partner team plus a lawyer's hour to ask. **Ask before writing code.** It
is cheap to ask and expensive to discover in month six. See §8.2a scenario (2) for what happens if
the answer is no — the honest version of that answer is better than it sounds.

**W2 — It accrues slowly and in small n.** A client-month yields perhaps 20–60 labelled creatives.
Reaching n in the thousands via serving alone takes years. The public-corpus route (§9 step 3) is
far faster and **must not be abandoned because Serve exists**. The correct division of labour:
*corpus for the prior, serving for the causal test.*

**W3 — The labels are confounded, and the clean subset is not free.** Realized outcome depends on
audience, budget, bid, timing and Meta's delivery optimization far more than on creative. Meta
actively reallocates impressions within an ad set, so observed per-creative outcome is partly a
measurement of Meta's delivery decisions. Getting a clean creative effect requires forced splits
with matched audiences and budgets — which cost more than simply running the campaign well.
**The moat data is only free in its dirty form.**

The missing number has a name and a definition: **cost per clean label** = the total incremental
spend required to produce one variant-group comparison at the platform's minimum split-test budget
and duration, divided by the number of usable comparisons it yields. **Until that number exists we
do not know how many clean labels a client-month can afford, and therefore we do not know the true
rate at which the causal corpus grows. It is the first thing the first campaign will tell us** — it
is a byproduct of running the campaign, not extra work — and it should be published in the same
dated artifact as the calibration numbers. If it comes back high, the honest conclusion is that the
causal arm is only affordable on large accounts, which is an independent argument for the ICP in
§4.3 and should be stated as one rather than discovered later.

**W4 — Label quality just degraded for exactly Soma's strongest case.** As of 2026-01-12, across all
API versions, 7-day and 28-day view-through attribution windows return no data. View-through is the
natural channel for a brain-response-to-video signal on brand and upper-funnel creative. The long
windows that would have carried Soma's effect are gone.

**W5 — The prediction half may be worthless.** Two separate things, and the first draft conflated
them:

- **The output space is settled.** fsaverage5 surface, 20,484 vertices, `[lh; rh]` order —
  `docs/strategy/ROADMAP.md:114-136` is headed "RESOLVED 2026-07-30" and states that the apparent
  conflict with the Algonauts paper's "Schaefer-1000 MNI" *"dissolves on inspection"*; the same
  item is marked CLEARED at PLAN gate 1. The sentence *"nothing we have produced has ever been in
  it"* (`ROADMAP.md:136`) refers narrowly to `build_roi_mask.py`'s unused `--n-units 1000` path,
  not to an open problem. The first draft cited it as if it corroborated a space mismatch. It does
  not.
- **Per-parcel accuracy is NOT settled, and that is the real risk.** The only accuracy figure
  anywhere in the repo is ~0.21 mean Pearson in the Algonauts Schaefer-1000 benchmark
  (`docs/pipeline/INFERENCE-PIPELINE.md:58`) — and **it has no primary citation anywhere in our
  tree**: every occurrence (`INFERENCE-PIPELINE.md:58`, `STRATEGY-PROPRIETARY-MODEL.md:23` and
  `:99`, `YC-APPLICATION.md:26`) points at another of our own documents. `[NEEDS EVIDENCE — link
  the number to Meta's published result, or stop quoting it. It is currently quoted to a partner
  in the YC killer answers.]` Zero validation exists for the four shipped ROIs, and the default
  lane shares a mean **59.3% of its variance with the visual lane across the 19 non-ad stimuli in
  `data/arcs/`** (`validation/lane_stats.json`, `sets.across_four_shipped_lanes.visual_drive`; the
  uncommitted ad fold puts it higher — §1.4). If the encoder's association-cortex predictions are
  near noise, the moat is a dataset linking a noise variable to outcomes.

**W6 — Churn and deletion.** A departing client takes future labels and may contractually require
deletion of past ones. Meta policy 10.7g plus a standard DPA could make the historical corpus
deletable on request. The MSA must obtain each client's explicit, separate permission to retain and
use campaign outcomes for model training — and even that may not satisfy 10.7 (see W1).

**W7 — A brutal cross-check on the label mapping.** `tools/demo/build_report.py:13-16` labels its
Destrieux arousal mask as "Yeo SalVentAttn." Per `validation/lane_stats.json`
(`legacy_roi_masks.masks.arousal`), its Dice overlap with the real Schaefer SalVentAttn is
**0.207**, and its Dice with Default is 0.142 — which works out to roughly **43% of its 831
vertices sitting in Schaefer's Default network**. Two different atlases currently carry the same
customer-facing word ("Surprise"). And it is not the worst case in the set: `roi_mask_memory`'s
largest overlap with any Yeo-7 network is **visual cortex** (Dice 0.242), which would invalidate
any claim built on a "memory-encoding" lane. Every legacy mask whose name asserts a network does
pick that network as its best overlap, so the names are directionally right — but the agreement is
weak everywhere (max Dice 0.535 anywhere in the set) and **no legacy mask is interchangeable with
the Schaefer lane of the same name.** **Fix this before validating anything**, or the thing
validated will not be the thing shipped.

---

## 8. Risks

### 8.1 The licence — the most under-priced risk in the plan

`docs/strategy/STRATEGY-PROPRIETARY-MODEL.md:80-94` is unambiguous: **both the `facebook/tribev2`
weights and code are CC-BY-NC-4.0.** They "can power research, validation, and the demo, but **not
the paid/revenue pipeline.**" Meta publishes no commercial-licensing path, so "ask Meta in writing"
is "a hope Meta may decline, not a documented option."

**Serve makes this strictly worse.** Charging a monthly fee for a managed service whose core
differentiator is the model's output is a *more* direct commercial use than selling a one-off
report — and note that flat pricing does not help here at all: the commerciality is in the charging,
not in the basis. A second licence sits underneath: the Llama-3.2-3B text branch carries the Llama
3.2 Community License — commercial use is permitted but requires "Built with Llama" attribution, a
"Llama" name prefix on derivative models, AUP compliance, and a separate licence above 700M MAU. A
hypothetical commercial TRIBE licence would not clear the text branch on its own.

`docs/strategy/PLAN.md:326-330` already lists gate 4 — *"Named fallback backbone with a cost —
before quoting anyone a price."* **Under Serve that gate becomes strictly blocking**, because Serve
is a priced product by definition.

**And note the concentration.** Meta occupies **five distinct roles** in this business
simultaneously: model licensor (CC-BY-NC-4.0 weights and code), ad platform, policy authority over
the data moat (10.7), source of every outcome label, and — by the YC killer-question answer's own
concession — the party best placed to ship a good-enough version inside Ads Manager for free.
**Every structural dependency routes through one counterparty who can revoke any of them
independently.** That should be stated in any investor conversation before it is discovered in one,
and it should be priced rather than merely disclosed — which is what §8.2a does.

Mitigations in order of controllability: (1) name a permissively-licensed fallback backbone and cost
the swap — the only mitigation entirely within Soma's control, and it should be done now, not when a
price is quoted; (2) ask Meta in writing and log the answer, never presenting it as an existing
route; (3) note that a read-out head trained on Soma's own outcome data is Soma's IP regardless —
but it reads out *from* the encoder, so it does not clear the encoder's terms.

### 8.2 Platform dependency and policy risk

- **10.5 — no pooling.** Multiple end advertisers cannot share one ad account. This forecloses the
  simplest "Soma owns the account and resells" architecture and forces the client-owned structure
  in §4.8.
- **10.4 — decay.** "Standard and Advanced Ads API access may be downgraded to Development access
  after 30 days of non-use." Hard-won access rots between design partners. Needs a scheduled
  heartbeat job against a house ad account from day one.
- **10.6 — transparency, effective 2027-02-03.** On request, Soma must disclose spend separately
  from its fees and the associated fee structure. This is *favourable* to a flat fee with at-cost
  pass-through — there is nothing to hide and the disclosure is a selling point — but the billing
  system must be able to produce that breakdown by that date (§4.7).
- **Rate limits with product consequences.** Ad set budgets may be changed only 4 times per hour
  (error 613, subcode 1487632) — that directly caps any automated budget-reallocation loop and
  should shape the design before it is built. Full access requires ≥500 Marketing API calls in 15
  days with <15% error rate; multiple developers report the upgrade option failing to appear
  despite meeting the criteria, so budget for support friction.
- **No published SLA** for App Review or Business Verification. The 6–10 week estimate is an
  estimate and must not appear in a deck as a fact.
- **The de-risking move is to skip the write API for client #1.** Have a human create the campaign
  in Ads Manager and use the API read-only with `ads_read` for per-creative outcomes. That yields a
  live campaign plus real training labels in days rather than weeks, tests F1 before spending 6–10
  weeks on approvals, and starts farming the 500 calls the Full tier requires.

### 8.2a What happens if Meta says no

Naming the dependency is not pricing it. Four scenarios, each with a response that exists today:

**(1) App Review is denied.** Note the elevated probability nobody has stated: Soma would be asking
Meta for `ads_management` while its core differentiator is Meta's own non-commercially-licensed
research model. **Response: fall back permanently to the human-operated Ads Manager plus `ads_read`
path in §8.2's last bullet, which needs no review and already yields labels.** Treat that path as
the **base case, not the contingency** — build client #1 on it regardless. Then denial costs
automation and margin, not the company.

**(2) The 10.7 answer is no.** Response: the pooled cross-client training set dies, but **the
per-brand calibration product still ships** — each client's own creative-plus-outcome history,
used to optimise that client's own campaigns, which is exactly what 10.7b permits. The schema
should be structured per-brand from the first migration so that this requires no restructuring,
only a policy flag. This is a genuinely good answer and it should be said out loud rather than
buried in a build document. What is lost is the cross-client prior; what survives is the product.

**(3) Access is revoked mid-flight.** Because clients own their accounts and their payment methods
(§4.8), **campaigns keep running and only Soma's automation stops.** The client is not harmed by
Soma's outage, which is the strongest possible argument for the client-owned structure. Two things
must exist before this can be claimed: a written manual-operation runbook, and a notification SLA
to clients. `[NEEDS DECISION — notification SLA on loss of platform access.]`

**(4) The TRIBE licence is enforced.** Response: the fallback backbone — **the only mitigation
fully inside Soma's control, and still empty.** §9 step 6.

**And a portfolio target, which is the part that turns disclosure into pricing.** State a maximum
share of revenue permitted to sit on Meta-served accounts, with a date by which it must hold.
`[NEEDS DECISION — maximum share of revenue on Meta-served accounts, and the date.]` The
diversification argument that answers "why won't Meta just build this" rests entirely on TikTok and
Google — **and their data-use terms are an unfilled slot in the YC document.** The load-bearing
mitigation is currently unverified. Reading those two clause sets is hours of work and it is
promoted to §9 step 2b for that reason.

### 8.3 Signal-validity risk

Restating from §2.1 as a business risk rather than a scientific one: three NULLs at n=29 on the
only outcome tests that exist; zero validation for the four shipped ROIs; the shipped default lane
sharing a mean 59.3% of its variance with the visual lane across the 19 non-ad stimuli in
`data/arcs/`, with no committed fold over ads at all; effective temporal resolution a 3–5 s window
against copy that claims a second; and a $29/month competitor publishing better validation on a
better label at 7× the n.

**The specific commercial exposure:** Soma is positioning on institutional honesty while carrying
worse published numbers than the competitor it is honest about. Honesty is a wedge only if the
numbers eventually arrive. If the corpus run also returns null, the honest move is to reposition
the diagnostic as descriptive (per-second regional read-out under the PREDICTED · RELATIVE ·
WITHIN-ITEM badge, which is defensible and unclaimed) and let Serve's value rest on incentive
alignment and execution — a smaller company, but a real one. **That branch should be pre-committed
in writing before the result is seen**, exactly as this repo's own discipline requires.

### 8.4 The services-margin trap

Covered quantitatively in §4.3–4.5. The three specific traps:

- **Below break-even N the business loses money per account** and no amount of narrative fixes it.
  At the primary configuration that threshold is below one account; at the $50k configuration it is
  N ≈ 2.3, which is why the segment choice is an economic decision and not a taste one.
- **Variance is existential.** YC: customers fire you for variance faster than for being slower or
  more expensive. Soma's shipped scorer uses hand-picked constants and within-batch-of-five
  percentiles — that is a variance generator, and it is a product risk, not just a science one.
- **Improve is the headcount-linear part.** Every hour of unbounded editorial judgement caps N. The
  bounded edit space is the margin defence, and the per-recut fee is what prices it honestly.

### 8.5 Institutional-honesty risk, elevated by Serve

`docs/strategy/PLAN.md:73-88` catalogues the claims the site made that no artifact supported. Two are
still live in code: `src/components/demo2/DemoScrollPage.tsx:1149` renders an "Already running
ads through the beta" marquee, and `:894` still reads "Scored before you spend a dollar."

**Serve raises the stakes on this from marketing puff to a representation about a commercial
relationship**, made to a counterparty who is about to hand over an ad account and a budget. A false
design-partner count told to someone considering granting you `ADVERTISE` task access on their
Business Manager is a different category of statement than the same words on a landing page.

**The nearest live instance of this risk is the before/after demo in §3.4.** It uses a fictionalized
client and an illustrative ~$1K/month spend, which is a legitimate presentation device and is also
the exact shape of the failure `PLAN.md` §0.3 catalogues. The labelling constraint in §3.4 is
therefore not a preference: the client must be marked fictional **on the artifact**, the spend and
every downstream metric must be marked illustrative, the "With Soma" outcome column must show no
fabricated lift, and a real corpus ad used as footage must be anonymised or accompanied by a
statement that the brand is not a customer. A demo that obeys all four is the one that survives a
partner asking to see it.

Fix `PLAN.md` 0.3 — including the `PRODUCT.md:188-193` block flagged at the top of this document —
**before** Serve ships, not after.

---

## 9. Sequencing — what the argument implies you should do

Ordered by (cheapness × decisiveness), not by excitement.

| # | Action | Cost | What it settles |
|---|---|---|---|
| 1 | Ask five prospects whether they would grant partner access to their ad account | days, $0 | **F1.** If no, the whole strategy is void — find out now |
| 2 | Email Meta's partner team on policy 10.7 cross-client model training; brief a lawyer. **Go in knowing 10.7 has no written-approval clause** (§7.4 W1) — the ask is for a product term, not a waiver | days, one lawyer-hour | **W1.** The moat's legality. Adverse answer changes everything — but see §8.2a(2) |
| 2b | Read the TikTok and Google data-use clauses and record what they permit | hours | The diversification argument in §8.2a currently rests on this and it is unverified |
| 3 | **Score the 673 usable TikTok ads and re-run the backtest against `ctr_index`** | ~28 GPU-hours ≈ **$30–60** — `[ESTIMATE]` from PLAN.md:109's 2.5 min/ad over 673 ads at YC-APPLICATION.md:318's $1–2/hr; not measured on a box | **F2** and the population baseline (**M1**) in one spend — see below |
| 4 | Perturbation-stability test (re-encode, ±1 frame, crop, bitrate) on one video | hours | **F3.** A diagnostic that flips on a re-encode is unsellable |
| 5 | Fix the atlas/label mismatch (`build_report.py:13-16`), change the default arc lane off dorsattn, and commit the ad-corpus lane artifact (`lane_stats.py --preds-dir data/ads/arcs`) | small code change | **W7**; the 59.3% visual-drive defect *as measured over the 19 non-ad stimuli in `data/arcs/`*; and the fact that **no committed lane figure describes an ad at all** (§1.4) |
| 6 | Name a permissively-licensed fallback backbone and cost the swap | days | **§8.1**, **§8.2a(4)**. Blocking gate before any price is quoted |
| 7 | Source the third-party claims in §4.2 and §7.3 (agency rates, the two universal negatives, Realeyes/adverteyes), with URLs and fetch dates | hours | Removes every `[NEEDS EVIDENCE]` on which the non-copyability argument rests |
| 8 | Client #1 human-run campaign + `ads_read` reporting; build the `outcomes` table specified at `PLAN.md:170-183` and the fee/billing tables in §4.7 | ~1 week | First real labels; cost-per-clean-label (W3); starts the 500-call clock |
| 9 | Rewrite the positioning docs listed in §10 | days | Stops the repo arguing against the company |
| 10 | Only then: Meta write path, Business Verification, App Review | 6–10 weeks | Serve, programmatically |

**Step 3 deserves its own paragraph, because it is the most important item in the plan and both
earlier drafts described its label wrongly.** `data/ads/` holds **1,359 ad videos with outcome
labels** and 1,359 baseline extractions, but **only 29 have been scored by TRIBE**
(`data/ads/arcs/`: 29 `preds_meta_*.npy`) — and **all 29 are Meta ads whose outcome column is
literally `days_running`**, an ad-longevity proxy (verified: `primary_label == days_running` for
655/655 Meta rows in `data/ads/ad_performance.csv`). The TikTok half of the corpus is the
unexploited asset.

**What the TikTok label actually is — this is the correction that matters most in this document.**
The 704 TikTok rows carry `ctr_index`: a relative click-through **index** in [0,1], 97 distinct
values on a 0.01 grid from 0.01 to 0.99, which *varies across ads* where `days_running` only tracks
longevity. The repo's own scraper says in capitals that it is **not** a raw click rate
(`ad_performance.py:14-17`), and its HONESTY block is blunter still: *"this whole corpus is
TikTok's Top Ads showcase — an already-curated set of strong performers. So a label here means 'how
strong AMONG strong ads', not 'winner vs loser'"* (`:34-38`). The companion column `ctr_percentile`
is **degenerate** — 0.99 on every row that carries a value (529 of 704) and empty on the rest — zero discriminative power, exactly as the docstring says at `:24-27`. **Every "real CTR" and "actual performance measure" phrasing in
earlier drafts of this packet was a public-surface claim that committed code refutes**, which is
the `PLAN.md` §0.3 failure mode reproduced in the document arguing against it.

**And the usable n is ~673, not 704.** `data/ads/ad_manifest_tiktok.csv` has 673 rows;
`ad_performance.csv` carries 31 TikTok exclusions — 28 `long_form_*` above 180 s and 3 `silent`
(verified by count). Footage for the usable subset is **7.79 hours**; the 12.0-hour figure an
earlier draft quoted is all 704 rows including the excluded long-form ones, and it should be
retired or always labelled with which set it describes.

**So the honest statement of the decisive experiment is this:** scoring the TikTok half takes n
from **29 to about 673** and swaps a longevity proxy for a **performance-ranked** one, in a single
~$30–60 job. That is materially better, and it is not clean — a corpus of already-strong ads can
tell you whether the score ranks *within* winners; it cannot tell you whether the score separates
winners from losers, because the losers were never in the showcase. The scraper says the same
thing and names the remedy: *"For a real winner/loser test you want ads that failed too, which this
source does not expose — a design partner's own CPA on their own ads remains the gold standard"*
(`ad_performance.py:39-40`). **That is the strategic argument for Serve, already written into the
repo by the person who built the scraper.** Step 3 is still the right next spend, and it buys a
better test rather than a settled question.

It also delivers the population baseline that kills the percentile-within-batch-of-five problem
(§3.1, M1) — 673 scored ads is a population, though note that `PLAN.md:124-128` describes that
unlock against the full ~1,300-ad sweep, which is the larger job priced in §4.5 M1.

Two operational notes that make this a long-lead item rather than an afternoon:
`docs/strategy/PLAN.md:108-112` says explicitly **"Do not run it on the concierge box … Rent a
second box"**, which means it is externally provisioned and calendar-consuming, so it should start
**day one, in parallel with Meta verification**, not after it. And any screen that shows predicted
score next to realized outcome is **blocked** on this run, not merely improved by it — you cannot
put a within-batch-of-five percentile (`public/preflight/batch_report.json`: `scoring.nAds: 5`)
next to a `ctr_index` rank or a realized ROAS across brands and call it a comparison.

Note that steps 1–7 cost under $200 of compute and about two weeks, and that **three of them can
return an answer that kills the plan.** That is the correct shape for a pivot of this size.

---

## 10. Documents this contradicts, and which must be amended

Silent contradiction is the failure mode this repo was built to prevent. Each of these should be
edited on the record:

1. **`docs/strategy/PRODUCT.md:188-193`** — the founder-attested block. Highest risk. Resolve or
   delete before anything else, per §8.5.
2. **`docs/GTM/YC-APPLICATION.md`** `:145`, `:162`, `:204`, `:240`, `:447-451`, `:579-583`,
   `:601-607`, `:485-499` — every pre-test / before-you-spend construction, the panel-margin half
   of the Realeyes answer (keep `:583-587`, per §1.1), and the agency-channel GTM paragraph (§6.1).
3. **`docs/strategy/PLAN.md:340-342`** — "Campaign management / ad serving" must move from "what we
   are deliberately not doing" to the spine, with the reversal argued rather than deleted. Same
   passage is the only place "two-sided" appears; kill that on the record too (§5).
4. **`docs/strategy/COMPETITORS.md`** — the VidCognition section (`:143-183`) is factually wrong on
   all three of its "real forks"; the Realeyes section (`:78-94`) is stale `[VERIFY — see §7.3]`;
   the whole document is organised around signal source, an axis that stops mattering once Soma
   holds the ad account.
5. **`docs/strategy/OPPORTUNITIES.md:102-181`** — resolve two direct conflicts: the creator-tools
   "true beachhead (ahead of ads)" ranking, and the prohibition on absolute cross-ad scores, which
   placement decisions require. Both need an explicit kill or an explicit carve-out.
6. **`docs/strategy/VISION.md:69-83`** — the YC RFS claim is unsupported (the document itself says
   to verify the wording before quoting it), and "why cheaper" uses the wrong denominator
   post-Serve.
7. **`src/components/site/PitchDeck.tsx`** `:73`, `:214`, `:241-242` and
   **`src/components/demo2/DemoScrollPage.tsx`** `:894`, `:1149` — live middleware framing, the
   per-seat/per-video SaaS pricing that §4.2 supersedes, and the unsupported marquee.

---

## 11. Where this argument is weakest

Stated plainly, because a strategy document that does not do this is a pitch.

1. **The central science claim is unsupported and every test that exists is adverse.** Everything
   in §1.3 Mechanism A, and the entire "prior decides what to test" pitch, rests on a link that
   came back null three times at n=29, on three different scores — and on the one metric with a
   chance baseline, the learned head's top-9 precision of 0.222 sits **below** the 9/29 ≈ 0.310
   chance line. If the TikTok run confirms it, the honest business is "aligned-incentive managed
   media with a good creative diagnostic" — real, but much smaller than the founders' framing. And
   note what the TikTok run can and cannot confirm (§9 step 3): a null there would be decisive, a
   pass there would still be a pass *within an already-curated set of strong ads*.
2. **The moat may be illegal as described, and the previous draft of this section overstated the
   way out.** Meta 10.7b/d as literally written prohibits the pooled cross-client, cross-platform
   training set that is the entire stated reason Serve is valuable. **10.7 contains no
   written-approval escape hatch at all** — that language is in 10.5 and governs ad-account
   combination, not data use (§7.4 W1). 10.7's only qualifier is "unless the terms for that product
   allow it explicitly," and 10.7a's aggregate-and-anonymous exception is confined to assessing
   *the end advertiser's own* campaigns. §8.2a(2) is a real fallback, but it is a smaller product
   than the one this document argues for.
3. **The margin trajectory is a mechanism, not a measurement.** N is 1–2 today. M1–M3 in §4.5 are
   plausible and each is tied to something concrete, but zero of them have been measured, and the
   agency denominator they would be compared against has not been collected either (§4.4). An
   investor is entitled to discount all three to zero until a second cohort exists.
4. **The licence question could invalidate pricing entirely**, and the only mitigation fully within
   Soma's control (a named fallback backbone) has not been done.
5. **The flat fee is a decision, not a validated price point.** Every figure in §4.3 is an estimate
   and the founders have not named a price. The *structure* is defensible on first principles; the
   *level* has never been tested against a buyer, and the first five conversations may say the
   platform fee is half or double what §4.3 assumes. That would change every margin number in this
   document without changing a single argument in it — which is the right way round, but it should
   be said.
6. **Serve is 6–10 weeks and mostly not engineering**, which means the first real outcome label is
   further away than the excitement implies — and W2 says the corpus route reaches statistical power
   far sooner. There is a real risk of over-rotating onto Serve and under-funding the TikTok run
   that would settle F2 for **$30–60** (§4.5 M1, §9 step 3).
7. **The competitive honesty position is currently losing on numbers.** Until validation improves,
   "we're the honest ones" is a claim about process, not results, and a sophisticated buyer will
   notice the difference.
8. **The cost of the science is not yet known.** §4.6 commits Soma to funding the random arm and
   §7.4 W3 says the cost per clean label has never been measured. If it comes back high, the
   holdout is affordable only on large accounts and the rebate eats a real share of the fee. That
   is a knowable number and the first campaign produces it — but today it is a promise with an
   unpriced liability attached, and that should be conceded rather than glossed.

The strongest version of this strategy is not "we have a better signal." It is: *"We are the only
party in your chain that does not profit from waste — our fee never rises when your budget rises,
and we pay for our own experiments out of it. We can see inside the asset in a way nobody selling
you media can. And we are building the one dataset that would make creative prediction real — while
telling you exactly which parts of that are true today and which are not yet."* That version is
defensible right now, and every falsifier in §2.5 either strengthens it or ends it cleanly.
