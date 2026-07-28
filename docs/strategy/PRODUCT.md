# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary — advertisers (DTC brand and performance-marketing leads).** They send a
  video ad through the waitlist / free trial and get a read-out back. Their job to be
  done: see what an ad does to a viewer second by second, and know which stretch to
  re-cut. They are the moat's mechanism as well as its customer — every ad they send
  is an ingestion event (see Positioning).
- **Secondary — investors and design-partner prospects** (YC partners, angels). They
  arrive skeptical, technical, and time-poor, testing two things at once: "is this real
  science?" and "is this defensible?"
- **Context:** desktop first — a pitch, a shared link, a laptop demo — but it must hold
  up on a phone passed across a table. Often viewed live while a founder narrates.

## Product Purpose

Soma predicts an average viewer's second-by-second cortical response to a video ad
(via Meta's public TRIBE v2 encoder), then reads an **attention arc**, a
**comprehension / language-load** lane, and **weak-spot callouts** off it — from the
file, no human panel.

The product being built on top of that is the **trained layer that translates cortical
output into advertising outcomes** (CTR, retention, engagement). Success is an
advertiser pointing at a timestamp and knowing what to change.

## Positioning

The encoder is not the moat. TRIBE v2 is public; anyone can run it and produce a score,
and a raw score is not defensible.

Two things are:

1. **The corpus.** Customer ad videos paired with that ad's real performance metrics,
   assembled through the trial and waitlist. More signups produce more videos, which
   produce better training data. A public-model competitor cannot scrape this pairing.
2. **The translation layer the corpus makes possible.** TRIBE v2, as used here, reads a
   **cortical surface** (fsaverage5) and does not resolve **subcortical** structures. The
   single strongest neural predictor of real-world ad-market response — the ventral
   striatum — is subcortical, so a raw TRIBE read is blind to it (see Evidence on Hand
   for the sources). A competitor running TRIBE raw therefore cannot read the
   best-established outcome signal directly; it has to be learned from a corpus. **Framing
   caution:** the defensible claim is "the strongest single predictor is subcortical and
   out of TRIBE's reach," NOT "cortical signal is useless" — a cortical region (MPFC) is
   itself an established predictor of campaign outcome. Do not overstate this publicly.

So: **Soma is not TRIBE v2. Soma is the trained layer between the cortical map and the
outcome.** The corpus is what makes that layer trainable, and the trial is what builds
the corpus.

## Operating Context

- Advertisers arrive via waitlist or free trial, submit an ad, and receive a read-out.
  The trial is an **ingestion mechanism**, not only an acquisition channel; the flow
  should be designed with that dual job in mind.
- Real performance metrics for submitted ads come from the customer's Meta Ads Library.
- The pipeline is `video → TRIBE v2 cortical arc → trained read-out → arc_<id>.json`.
  Arcs reach the site either bundled (`public/arcs/*.json`) or published live through
  Supabase, so a new arc appears without a redeploy.
- Public surfaces: `/` (landing), `/demo` (read-out console), `/science`, `/compare`,
  `/faq`, `/pitch`, `/story`. `/brain-lab` is internal and noindex.

## Capabilities and Constraints

**Shipping today:** attention arc, comprehension / language-load lane, weak-spot
callouts, cortical profile, A/B compare, cross-lineup compare.

**In training, not validated:** the cortical→performance translation layer. Early
results exist; nothing is validated. It **may** ship on a public surface, labeled, under
the disclosure rule below. What it may not do is appear unlabeled, or be quoted as a
measured result.

**The disclosure rule.** Every model-derived figure on a public surface carries one of
four provenance states, and the state is visible on the surface itself — not in a
tooltip, not in a footnote:

| State | Means | Example |
|---|---|---|
| `measured` | Comes from the encoder, or from committed code over real data | attention arc, comprehension lane, corpus counts |
| `modeled` | A trained or fitted output that has not cleared validation | retention curve, any outcome prediction |
| `proxy` | Stands in for something the encoder cannot resolve | purchase intent, recall — both subcortical |
| `decoration` | Illustrative, not bound to model output | the cortex visuals |

**Why the line sits here, and not at "validated only."** The earlier doctrine forbade
shipping the translation layer outright while permitting the attention arc, the
comprehension lane, and the weak-spot callouts — all equally unvalidated. That line was
not "validated vs not"; it was arbitrary, and a competitor could say so.

The real distinction is **falsifiability at the point of use.** A per-second arc makes no
checkable claim about the future — a buyer cannot catch it being wrong. A predicted CTR
does, and the buyer will check it. So an outcome figure may ship, but it ships labeled
`modeled`, and never as a bare number the way a measured figure can.

**Numbers must be reproducible.** Any figure quoted on a public surface has to trace to
committed code or committed data. A number typed into a component is a bug, not a
placeholder. This is the constraint with no exceptions: it is what makes every other
label worth anything. It also protects the wedge — Soma's argument is that buyers should
ask any vendor for accuracy *minus the baseline*, and that question only carries if
Soma's own figures survive it.

**Constraints:**

- The TRIBE v2 encoder is frozen and Meta's. The read-out weights are Soma's.
- The encoder is CC-BY-NC-4.0. Pipeline output cannot be sold under that licence; the
  commercial request and its answer should be public once there is one.
- Emotion lanes (valence / arousal) stay off public surfaces until they clear more than
  n=4 — not because the result is bad, but because there is no power behind it either way.
- Decoration and model output must remain visually separable, and decoration is labeled.
- No claim about a named third party — customer, partner, or logo — without a signed
  relationship behind it.

**Explicitly undecided:** whether, where, and how forcefully to disclose the null
pre-registered result publicly (see Evidence on Hand). This is deliberately open, not
forgotten — it should be revisited, not silently dropped.

**Terminology:** an *arc* is a second-by-second lane; a *weak spot* is a flagged
attention dip pinned to clip time; a *read-out* is a lane derived from the arc.

## Brand Commitments

- **Name:** Soma. The wordmark is lowercase `soma`.
- **Three words:** clinical, honest, alive.
- **Voice:** a scientific instrument that talks straight. Confident about what's proven,
  plainly labeled about what isn't. No hype adjectives, no fake urgency, no fabricated
  numbers — where "fabricated" means untrue, not merely unaccompanied by a file in this
  repo. Founder-attested figures are publishable; see *Founder-attested figures* below.
- **Emotional goal:** the calm authority of a well-made measuring device. The visitor
  should feel they are looking at a real lab tool, not a pitch skin.
- **Anti-references:**
  - *Generic AI-SaaS* — neon-blue gradient hero, gradient-clipped headline text, glass
    cards, a tiny tracked uppercase eyebrow above every section. Soma must not read as
    another AI wrapper landing page. Big-number stat cards are fine where the number is
    real — §10 of `/demo` is the sanctioned use.
  - *Overclaiming neuro-marketing incumbents* (Realeyes / System1 "trust our black box").
    The edge is doing the validation honestly, so the design must reflect that discipline
    rather than an opaque score.
  - *A fractured multi-template feel.* One system, everywhere.

## Evidence on Hand

- **Ad corpus — 733 ads paired with real performance metrics.**
  `data/ads/ad_manifest.csv` (733 rows) and `data/ads/ad_performance.csv` (733 rows,
  all non-empty), carrying `ctr_percentile`, `ctr_index`, `engagement_total`,
  `cost_index`, `days_running`, `industry_key`, `objective`, `country`.
  `data/ads/advertiser_summary.csv` holds 917 advertiser rows.
  **Publishable.** Note: the figure quoted in conversation was ~800; the traceable count
  is **733 ads**. Use 733. (917 is advertisers, not ads — a likely source of the drift.)
  Note also that CTR is stored as percentile and index, not absolute rate.
- **The primary pre-registered test came back NULL** — raw TRIBE arc vs. human attention
  on TVSum (n=15). Locked in `docs/science/PREREGISTRATION.md` and its addendum.
  Under the current positioning this result *supports* the thesis: raw cortical signal
  does not predict outcome, which is why the translation layer exists.
- **The trained read-out head is not a validated win.**
  `validation/head_incremental.csv`: `median_raw=0.1719 median_partial=0.1784 adds=2/15
  stouffer_p=0.0005` — a combined Stouffer p of 0.0005, but only 2 of 15 clips
  individually beat a plain ffmpeg baseline. A head arc on a new video is
  out-of-distribution from the training proxy: a hypothesis, not a result.
- **Subcortical claim — sourced, with a framing correction.** Verified against the
  journals themselves:
  - *Venkatraman et al. (2015), "Predicting Advertising Success Beyond Traditional
    Measures", Journal of Marketing Research, 52(4), 436–452* (DOI 10.1509/jmr.13.0593).
    Across six methods (self-report, implicit, eye-tracking, biometrics, EEG, fMRI), fMRI
    explained the most variance in ad elasticity, and — exact abstract wording —
    "activity in the ventral striatum is the strongest predictor of real-world,
    market-level response to advertising." The ventral striatum is subcortical. This is
    the load-bearing citation.
  - *Genevsky, Yoon & Knutson (2017), "When Brain Beats Behavior: Neuroforecasting
    Crowdfunding Outcomes", Journal of Neuroscience, 37(36), 8625–8634.* Only nucleus
    accumbens (subcortical) activity generalized to forecast aggregate market outcomes;
    the sample's own behavioural measures did not.
  - **Counter-evidence, must not be ignored:** *Falk et al. (2015), "Functional brain
    imaging predicts public health campaign success", SCAN, 11(2), 204–214.* MPFC — a
    **cortical** region, within TRIBE's reach — predicts population-level campaign success
    beyond self-report. So the honest claim is narrow: the *strongest single* outcome
    predictor is subcortical and out of TRIBE's reach; cortical signal is NOT useless.
  - **Linch­pin, grounded in this repo:** TRIBE-as-used runs on the fsaverage5
    cortical surface (README, `build_roi_mask.py`), which is cortical-only by construction.
  - Any public copy must use the narrow framing above. The overstated version
    ("subcortical is the direct signal, cortical is far behind") is not supported.
- **Demo arcs:** 13 in `public/arcs/`. 10 of 13 carry no `weak_spots`. Footage is gated
  per card by `hasFootage()`; the flagship `real2` deliberately has none.
- **Founder-attested figures — true, evidence held outside this repo.** Prediction accuracy
  92% against a 75% baseline; 500 ads in the live database from design partners; 100+ founders
  and companies on the waitlist. These are real and cleared for public copy. The absence of a
  backing file under `validation/` is *not* evidence against them: do not flag them as
  fabricated, do not gate them behind a repo artifact, and do not strip them from public
  surfaces. If provenance is needed, ask — do not infer it from the filesystem.
- **Absences future work must not fabricate:** no customer testimonials, no named
  customers, no pricing.

## Product Principles

1. **Honesty is the interface.** Show plainly what the model shows; never dress a
   hypothesis as a result. This is the positioning, not a disclaimer on it.
2. **The corpus compounds.** Every trial is an ingestion event. Flows that bring ads in
   are product surface, not just funnel.
3. **Name the boundary.** What the model measures — cortical — and what it does not —
   subcortical — is the argument for the translation layer. State it; don't bury it.
4. **The instrument, not the skin.** Chrome, labels, and the read-out console should feel
   like a real scientific tool. Restraint reads as rigor.
5. **Decoration is fenced from data.** The cortex visuals are labeled decoration; only
   the console is bound to model output. The separation is a feature.

## Accessibility & Inclusion

- **Target WCAG 2.1 AA.** Body text ≥4.5:1, large/label text ≥3:1 — verified, not assumed.
  `--color-ink-3` is `#727272` (4.81:1 on paper, 4.61:1 on fill), corrected from `#8a8a8a`
  which failed. **Known open failure:** `--color-accent-2` `#5f8b99` is 3.72:1 and is used
  as small text in roughly 16 places; it is legal as chart geometry, not as text.
- **Full `prefers-reduced-motion` support.** Implemented in `BrainField.tsx`, all three
  `brainlab/` treatments, and `public/story.html`. **Gap:** `DemoConsole.tsx` has none —
  though its playback is user-initiated and pausable, so it does not violate WCAG 2.2.2.
- **Keyboard operability** for transport, picker, and forms, with visible focus rings.
  **Known gap:** three inputs use `outline-none` with no replacement indicator
  (`Landing.tsx:84`, `UploadDialog.tsx:281`, `:290`).
- **`aria-live` on status and callout regions.** The weak-spot callout carries
  `role="status"`; the scrubber announces elapsed time via `aria-valuetext`.
