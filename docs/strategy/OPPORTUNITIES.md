# Soma — Use Cases & Market Opportunities

*Where a "digital fMRI from the file" is worth money. Same read-out engine, many
surfaces. This doc is the opportunity surface; the beachhead is ads, the rest are
expansion along the exact same signal.*

---

## The reframe that sizes the market

TRIBE v2 is not an "emotion model" — it is a **perception + attention +
comprehension simulator**: it predicts, second by second, how a human brain
*sees, hears, and understands* an audiovisual stream. It is razor-sharp in the
visual / auditory / language / attention cortex and blind in the reward/emotion
cortex (see `docs/science/` and the reachability audits). So the addressable
market is **anything where holding attention and landing a message = money** —
which is most of content marketing, not just paid ads.

**The common edge across every use case below:** predicted *from the file*, no
panel, no webcam, no survey — minutes not days, cheap enough to test *every*
variant instead of only the one you can afford to panel.

**The honest constraint (applies to all):**
- Strong, defensible lanes: **attention / engagement** (visual + dorsal-attention
  cortex) and **message/semantic comprehension** (language cortex — unlocked by the
  trimodal text branch).
- The **arousal/intensity** lane is real only when validated to beat dumb
  loudness/motion features (else it's re-deriving "the ad is loud and fast").
- **Emotion/valence and absolute cross-content performance are NOT claims** — see
  `VISION.md` status ladder. Every vertical below still needs its own validation
  gate against a real behavioral outcome (retention / drop-off) before a hard claim.
- **Sell *relative*, not absolute:** ranking a customer's own variants ("which cut
  wins, where each loses them") is statistically far easier and more defensible than
  predicting absolute performance across all content.

---

## The opportunities

*Founder shortlist. The opportunity-map audit (below) **re-orders these** — creator
tools is the true beachhead, ad pre-testing survives only as a relative ranker, and
trailer testing is demoted to longer-term.*

| # | Opportunity | What Soma extracts | Buyer | TRIBE fit / honest status |
|---|---|---|---|---|
| 1 | **Ad / creative pre-testing** *(beachhead)* | attention-hold + hook strength + per-second weak spots across an ad's cuts | DTC brands, performance-marketing teams | **Strong lane** (attention). Realeyes/System1/Neurons territory — but *from the file, no panel*. Validation gate: predicted winner beats an A/B on real retention/ThruPlay. |
| 2 | **Trailer / streaming / promo testing** | where a trailer holds vs. sheds attention; hook + payoff beats | studios, streamers ("Netflix-likes"), promo teams | **Strong lane.** Same read-out, higher-budget content. Gate: predicted attention arc tracks real completion/skip data. |
| 3 | **Creator tools — YouTube/TikTok hook optimization** | first-3s neural hook + retention curve of a cut *(huge, underserved)* | creators, MCNs, social agencies | **Strong lane**, closest to a real public label (most-replayed / audience-retention). Best data-flywheel entry. Gate: predicts most-replayed above the ffmpeg + global-signal baseline. |
| 4 | **E-learning / training — disengagement prediction** | where learners' attention drops in a lesson video | ed-tech, L&D / corporate training teams | **Strong lane**, different vertical. Gate: predicted drop-points match real learner drop-off / completion. |
| 5 | **Video editing copilot** *(the surgical-edit loop)* | per-second "cut here — the brain's gone," then score → edit → re-score | editors, agencies, in-house creative | **Strong lane + product loop** incumbents don't have. Gate: edited-per-Soma cuts beat originals on a real engagement metric. |

---

## Notes per opportunity

**1. Ad / creative pre-testing — the beachhead.** Realeyes/System1/Neurons sell
panel-based pre-testing (thousands of dollars, days per ad). Soma's wedge is the
*signal source* (predicted cortical response from the file) + the *honesty line*
(visible validated-vs-hypothesis boundary) + the proprietary ad×outcome flywheel a
public-encoder rival can't scrape. Start here; everything else reuses the read-out.

**2. Trailer / streaming / promo testing.** Same attention read-out, applied to
longer-form entertainment marketing. Higher content budgets, fewer buyers, longer
sales cycle — an expansion, not a first move.

**3. Creator tools (YouTube/TikTok hooks).** The most underserved and the closest to
a *real* public label: YouTube "most-replayed" and Studio audience-retention curves
are genuine retention proxies at scale (see `docs/pipeline/` Mr.HiSum retention
pipeline). This is likely the strongest data-flywheel entry point — high volume,
self-serve, and the label needed to *validate* the whole thesis is native to it.

**4. E-learning / training.** Attention-drop prediction for lesson videos; buyers
(ed-tech, corporate L&D) already care about completion and instrument it, so the
validation label exists in-house.

**5. Video editing copilot.** The surgical-edit loop: per-second weak-spot callouts
→ suggested cuts → re-score the new edit. A closed optimization loop the panel
incumbents structurally can't offer (they can't re-test a hypothetical cut for free).

---

## Cross-cutting product mechanic (shared by all five)

- **Relative comparison first:** "upload N variants → ranked by predicted
  attention-hold + each one's weak spots." Cancels the between-item confounds that
  make absolute prediction hard.
- **Multi-lane per-second read-out**, each badged by validation status:
  **attention** (strong) · **message/semantic** (strong, needs trimodal text branch)
  · **arousal/intensity** (real only when validated vs loudness/motion).
- **Score → edit → re-score loop** as the retention hook.

---

## Ranked matrix — opportunity-map audit (2026-07-21)

*Adversarial ranking of the full opportunity space by TRIBE-actual-fit × real buyer ×
defensibility (the encoder is public) × validation path. This re-orders the shortlist
above, adds a differentiator, and — importantly — names what NOT to build.*

### Pursue — the top 3

**#1 · Creator pre-publish within-video retention** — *the true beachhead (ahead of ads).*
- **Wedge:** a pre-publish, per-second predicted attention + comprehension curve + an
  A/B hook/edit ranker for a creator's **own** variants — "the retention graph you
  don't have yet, before you upload." Complements YouTube's post-hoc curve; never an
  absolute score.
- **Why it wins:** the one place all four axes converge — strong cortex
  (attention + visual + language), the statistically-easy within-item regime, and a
  **free, abundant, genuinely behavioral label** (a creator's own YouTube Studio
  audience-retention curves). 200M+ creators; incumbents (OpusClip, vidIQ, TubeBuddy)
  only read the *post*-publish curve — nobody predicts it pre-upload from the file.
  Low WTP ($10–40/mo) offset by volume — and it's the cheapest, cleanest thing to
  validate.
- **Validation gate:** within-channel, leave-one-video-out over a back catalog →
  predicted per-second dips localize the real drop-off seconds AND a pre-publish A/B
  hook pick beats a coin-flip on realized 3s/30s retention, both beating the ffmpeg
  loudness/motion/cuts baseline. Clear it → "predicts retention" becomes a claim.

**#2 · "Compare Your Cuts" — within-brand ad/creative variant ranker** — *(= shortlist #1, made relative-only).*
- **Wedge:** rank a brand's **own** cuts/variants of one creative by predicted
  attention-hold + comprehension, flag the dead seconds — a pre-flight that narrows
  what enters the paid A/B. Relative, never absolute.
- **Why it wins:** same strong constructs, higher WTP (agencies/DTC ship 15–30
  variants/mo, creative drives ~half of ad effectiveness). Within-item ranking cancels
  the between-item confounds that made the absolute cross-ad test NULL. Every customer
  A/B (predicted rank vs realized ThruPlay) becomes a proprietary calibration pair —
  the real moat over the public encoder.
- **Validation gate:** ≥30–50 within-brand A/B pairs with measured ThruPlay/retention
  deltas; primary = within-pair rank/sign concordance, must beat the ffmpeg baseline.

**#3 · Neural-grounded semantic-comprehension / message-clarity load** — *the differentiator (needs the trimodal text branch).*
- **Wedge:** a per-second "where the message stops being processed / gets hard to
  follow" arc from the language cortex — a badged lane inside #1/#2, and a standalone
  copy-test / edtech / corporate-comms diagnostic.
- **Why it wins:** the **only** construct with genuinely high incremental validity over
  cheap CV/ASR word-rate — saliency-trained incumbents (Neurons, Attention Insight)
  structurally can't produce it. It's the moat layer that lifts #1/#2 above "from-file,
  no-panel" parity.
- **Validation gate:** language-cortex arc flags the segment humans rate confusing /
  fail a recall quiz, over and above ASR word-rate, within-item and held-out. (No
  comprehension validation exists yet — amber.)

### How this re-orders the shortlist above
- **Creator tools → promoted to the beachhead (#1).** Cleanest free behavioral label
  (Studio retention) = the fastest path to actually *validating* the thesis.
- **Ad pre-testing → survives only as relative "Compare Your Cuts."** Never an absolute
  "this ad will win" score.
- **Trailer / streaming testing → demoted to longer-term.** What studios chase
  (emotional payoff, box office, subscriber lift) is TRIBE's blind zone and is
  effectively un-validatable at their sample sizes / long sales cycles. Not a wedge.
- **E-learning → folds into the comprehension diagnostic (#3)** as a vertical (buyers
  already instrument completion, so the label exists in-house).
- **Editing copilot → a mechanic** (score → edit → re-score) inside #1/#2, not a
  standalone line.

### Do NOT build (killed as hype — building these forfeits the honesty moat)
- **Absolute "this ad will win" score, or any emotion/valence/persuasion read** — NULL
  where tested (cross-ad partial r=−0.13, n=29); requires TRIBE's dead zone (OFC/vmPFC
  ~0, reward/amygdala off-surface).
- **Synthetic-fMRI as a neuromarketing-panel replacement** — loses head-to-head to
  Neurons (trained on real eye-tracking/EEG); the emotion version sells the dead zone.
- **Programmatic creative-scoring API at scale** — needs an absolute per-asset score
  (the NULL axis); public encoder → CreativeX/VidMob/Adobe bolt it on themselves.
- **Neural-grounded video-embeddings API** — no demonstrated lift over behavior +
  CLIP/Marengo (competes head-on with TwelveLabs Marengo).
- **Memory / "stickiness" proxy** — the hub (hippocampus) is subcortical/off-surface;
  brand-recall claims are the most dangerous overclaim in the set.
- **Perceptual-intensity / "arousal from the file"** — recoverable from free ffmpeg
  loudness/motion; **must never be sold as arousal.**
- **Static UX / cognitive-load, photosensitive-epilepsy QC, cross-modal surprise** —
  bad fit or solved more cheaply by deterministic/CV tools.

### The absolute constraint
Everything ships **within-item and relative.** Refuse every absolute-score, brand-lift,
emotion, reward, and memory-prediction request on contact — those are exactly the
directions two audits showed are NULL or physically off TRIBE's cortical surface, and
conceding one forfeits the only durable asset. **The moat is never the weights**
(facebook/tribev2 is public; VidCognition ships the same shape) — it is
validation-against-the-buyer's-own-behavioral-label, the from-the-file/no-panel/seconds
workflow, the outcome flywheel, and radical honesty in a market full of unverifiable
"90–95% accurate" claims.
