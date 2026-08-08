# Measurement & Creative-Analytics Stack Around Soma's Competitors (2025–2026)

Research question: what do clients/agencies consider **credible proof of ad performance** when they can't (or won't) rely on platform dashboards — and which vendors set those expectations. Compiled 2026-08-07. Claims carry source URLs; items marked **UNVERIFIED** come from a single secondary source or vendor self-claims.

---

## 1. Attribution / analytics platforms DTC brands use

### Triple Whale
- **What it measures:** First-party pixel ("Triple Pixel") MTA with 7 models (Linear All/Paid, Triple Attribution — mimics platform self-crediting, Total Impact — AI model blending first-party pixel data + zero-party post-purchase survey data, Clicks, Deterministic Views), plus **MMM, MTA, and incrementality unified in one system ("Compass")**, blended MER dashboards, cohort/LTV views. Post-purchase surveys are built into attribution — a key trust mechanism because customers self-report discovery channel. Sources: https://www.triplewhale.com/attribution ; https://kb.triplewhale.com/en/articles/7128379-the-total-impact-attribution-model ; https://www.triplewhale.com/blog/triple-whale-vs-northbeam
- **Pricing:** Free plan; paid tiers scale with store size; MTA from ~$129/mo, mid-tier ~$1,129/mo (per Ruler Analytics comparison — **UNVERIFIED** exact figures); advanced attribution + Compass + Moby AI from ~$1,000 MRR. Sources: https://www.ruleranalytics.com/blog/uncategorised/ruler-analytics-vs-triple-whale/ ; https://www.triplewhale.com/blog/triple-whale-vs-northbeam
- **Positioning:** Brands $1M–$500M+ revenue; ~470+ G2 reviews — by far the widest SMB/mid-market adoption of the four. Source: https://www.triplewhale.com/blog/triple-whale-vs-northbeam
- **Caveat from practitioners:** clients following the Triple Pixel over platform data can be led astray too — the pixel is another model, not ground truth. Source (practitioner thread): https://www.reddit.com/r/PPC/comments/16su1q7/does_anybody_have_clients_who_completely/

### Northbeam
- **What it measures:** Server-side MTA (Linear, Clicks-Only, Clicks + Modeled View, Clicks + Deterministic Views) on a whitelabeled Snowplow pixel, plus **MMM+** and incrementality; positions MER as the sanity-check metric. Sources: https://www.triplewhale.com/blog/triple-whale-vs-northbeam ; https://www.northbeam.io/blog/marketing-efficiency-ratio-mer-roas
- **Pricing:** ~$999–custom/mo (Triple Whale's comparison) or **Starter ~$1,500/mo, Professional custom for brands spending $250K+/mo** (Third i comparison) — **UNVERIFIED** exact tiers, but consistently four figures/month. Sources: https://www.triplewhale.com/blog/triple-whale-vs-northbeam ; https://thirdi.ai/blog/third-i-vs-northbeam-attribution-measurement-vs-action-intelligence
- **Positioning:** DTC brands $40M+ revenue / $50K+/mo ad spend with analytics teams — when "native ad platform numbers become increasingly unreliable" across Meta+TikTok+Google+influencers. Source: https://thirdi.ai/blog/third-i-vs-northbeam-attribution-measurement-vs-action-intelligence

### Hyros
- **What it measures:** Patented server-side "print tracking" — cross-device, multi-session, long-sales-cycle attribution; tracks repeat sales/subscriptions/LTV that platform pixels miss; feeds recovered conversions back to platform AIs (bi-directional). Claims "up to 50% more ad attribution than platform tracking alone" and avg +20% ad scale across 3,000+ clients (**vendor claims, UNVERIFIED**; reviewer could not independently verify the 50% figure). Sources: https://legacy-25071.hyros.com/ ; https://hyros.com/updates/power-features/what-is-hyros/ ; https://softailed.com/blog/hyros-review
- **Pricing:** Tiered by tracked revenue; ~$230/mo (annual) entry per ColdIQ, demo-gated above that (**UNVERIFIED**); reviewers say it's only economically rational above ~$10K/mo ad spend. Sources: https://coldiq.com/tools/hyros ; https://softailed.com/blog/hyros-review
- **Trust mechanism:** a **90-day head-to-head accuracy guarantee** ("run us against any other software") — notable pattern: guarantee-backed accuracy as a sales device. Source: https://legacy-25071.hyros.com/

### Rockerbox
- **What it measures:** Unified **MTA + MMM + incrementality testing** on a SOC2-certified deduplicated first-party data foundation; explicitly frames the three methods as triangulation (MTA = tactical daily, MMM = strategic budget, incrementality = causal validation). Sources: https://www.rockerbox.com/ ; https://www.rockerbox.com/testing ; https://www.rockerbox.com/multi-touch-attribution-software
- **Pricing:** ~$2,000/feature/mo scaling with data volume; enterprise ~$1,000–2,000+/mo priced by spend under management (**UNVERIFIED** secondary sources). Sources: https://www.rockerbox.com/plans ; https://www.aisystemscommerce.com/post/rockerbox-review-2026 ; https://botapolis.com/tools/rockerbox
- **Acquired by DoubleVerify (Feb 2025, ~$85M)** — verification giant buying outcomes measurement; signals convergence of "brand safety verification" and "performance attribution" into one trust stack. Source: https://www.aisystemscommerce.com/post/rockerbox-review-2026

### Why brands trust these over platform numbers (the common pattern)
- Independence: a party that doesn't sell the media grades the media ("platforms shouldn't grade their own homework"). Source: https://www.adbeacon.com/attribution-accuracy-why-platforms-shouldnt-grade-their-own-homework/
- De-duplication: platforms each claim 100% of the same conversion; third parties reconcile against actual store revenue (Shopify), so channel ROAS sums to blended truth.
- Triangulation: pixel MTA + post-purchase survey + MMM + incrementality cross-checking each other is now the standard DTC playbook. Sources: https://curtishowland.substack.com/p/8-types-of-attribution-every-dtc ; https://byteandbuy.com/blog/dtc-postpurchase-surveys-fairing-attribution-roas
- MER / blended ROAS (total revenue ÷ total ad spend) as the un-fakeable top-line: healthy DTC MER cited at ~3–5x. Sources: https://www.northbeam.io/blog/marketing-efficiency-ratio-mer-roas ; https://mhigrowthengine.com/blog/dtc-mer-guide/

---

## 2. Creative analytics platforms

### Motion (motionapp.com) — the DTC/agency standard
- **Creative-level metrics:** Thumbstop/Hook rate (3-sec plays ÷ impressions; ~30–40% cited as strong), Hold rate (6-sec/completions), Thumbnail Retention, 100% View Rate, Avg Watch Time, CTR Outbound, Thumbstop CTR, plus proprietary composite **Hook Score / Watch Score / Click Score**; side-by-side creative comparisons and benchmarks. Sources: https://motionapp.com/blog/key-creative-performance-metrics ; https://help.motionapp.com/en/articles/7730931-metrics-cheat-sheet
- **Reporting a client sees:** ad leaderboards, AI tags, daily/weekly automated reports, iteration finders, report snapshots as shareable configs, and **view-only guest accounts for clients** — i.e., the "creative report a client shares internally" is a leaderboard + hook/hold/CTR trends + benchmark context + iteration recommendations. Sources: https://motionapp.com/faq ; https://motionapp.com/pricing
- **Pricing:** Starter $750/mo (≤$50K/mo spend, unlimited seats/accounts), Pro $1,050/mo (>$50K, attribution integrations incl. Northbeam + GA), Growth custom (>$125K/mo). Source: https://motionapp.com/pricing

### VidMob
- **What it does:** Enterprise computer-vision tagging at element level ("product shot at 0:05", "red background", "CTA is discount code"; pacing, scene composition, on-screen text, sentiment, story/sound/production type), tied to Meta/Google/TikTok performance; API for creative data. Positioned for global brands with dedicated creative-analytics teams and seven-figure budgets. Sources: https://help.vidmob.com/en/articles/8411518-what-is-the-methodology-for-analytics ; https://www.omniconvert.com/nexus/compare/motion-vs-vidmob/ ; https://hawky.ai/blog/best-creative-tagging-tools
- **Pricing:** custom/enterprise (**UNVERIFIED**, not published). Source: https://vidmob.com/product

### CreativeX
- **What it does:** Computer-vision **pre-flight scoring** of creative against platform best practices + brand guidelines ("Creative Quality Score" / compliance auditing) — governance, not performance analytics; enterprise CPG/finance focus, custom pricing, 6–12 week implementations. This is the closest enterprise analog to Soma's "pre-flight scoring" but for brand compliance rather than performance prediction. Sources: https://improvado.io/blog/creative-analytics ; https://segwise.ai/blog/ad-tech-platforms-creative-optimization-2026
- **UNVERIFIED:** exact scoring methodology and pricing (not published).

### Foreplay / Atria
- **Foreplay:** swipe file + competitor tracking (Spyder) + briefs + Lens analytics; Basic $59/mo, Workflow $175/mo (15 brands tracked, 1 ad account analytics), Agency $459/mo (50 brands, 10 ad accounts). Workflow tool, not measurement. Source: https://www.gethookd.ai/learn/foreplay-vs-atria-vs-magicbrief-vs-gethookd/
- **Atria:** ad library (65M+ ads) + AI analysis; "Radar" grades creatives on ROAS, hook strength, retention and recommends next iterations; $19/$59/$149 per month. Sources: https://www.tryatria.com/blog/best-ai-ad-tools-for-creative-analysis ; https://www.gethookd.ai/learn/atria-ai-reviews-pricing-alternatives-is-this-facebook-ad-tool-legit/
- Takeaway: even $19–175/mo tools now grade hooks and recommend iterations — creative-level diagnostics are table stakes, not premium.

---

## 3. Predictive / pre-testing tools (Soma's own category)

### Neurons (Neurons Inc)
- **Predicts:** attention heatmaps, brand attention, engagement/memory scores on images & video, pre-launch. Trained on eye-tracking + EEG from a claimed 300K participants / 20 years. Sources: https://knowledge.neuronsinc.com/how-neurons-ai-works ; https://www.neuronsinc.com/neurons-ai
- **Validation claim:** ">95% accuracy" vs real eye-tracking (statistically equivalent to heatmaps from 100–150 human participants viewing 5s) — **vendor self-claim, UNVERIFIED independently**. Source: https://knowledge.neuronsinc.com/how-neurons-ai-works
- **Pricing:** Standard ~$15,000/yr for 5 seats, unlimited image/video analysis, API access (**UNVERIFIED**, via review sites). Sources: https://aichief.com/ai-marketing-tools/neurons-inc/ ; https://www.capterra.com/p/233868/Predict/
- **Workflow integration:** used by Facebook/Meta and TikTok themselves for creative guidance content; consolidating the category (acquired VisualEyes/Loceye). Source: https://techfundingnews.com/customer-behaviour-predicting-ai-used-by-facebook-and-tiktok-neurons-acquires-its-competitors/

### Junbi.ai (expoze.io engine)
- **Predicts:** frame-by-frame attention for **YouTube ads specifically**; Brand Attention, Ad Breakthrough, Cognitive Ease scores; benchmarks vs category. Source: https://junbi.ai/product/
- **Validation claim:** 0.87 on the **MIT Saliency Benchmark** ≈ "94% accuracy" vs human eye-tracking — the MIT benchmark is the category's shared external yardstick. Sources: https://www.alpha.one/products/junbi-ai ; https://support.junbi.ai/article/163-meet-junbi-ai
- **Pricing:** demo-gated, usage/API custom (**UNVERIFIED**). Source: https://www.getapp.com/marketing-software/a/junbi-ai/

### EyeQuant
- **Predicts:** attention maps + clarity/engagement scores for ads, landing pages, email, packaging in ~5 seconds; claims 90%+ of physical eye-tracking accuracy from 1.6M data points / 20K experiments. **Pricing from $97/mo** — the cheapest credible entry point in the category. Sources: https://www.eyequant.com/accuracy/ ; https://www.eyequant.com/pricing ; https://martech.zone/eyequant-visual-ux-design-ai-neuroscience/

### Dragonfly AI
- **Predicts:** saliency/attention via a **biological model of the visual cortex** (not ML-trained), claims universality across audiences; validated at **89% on the MIT Saliency Benchmark**. Source: https://dragonflyai.co/faqs ; https://attentioninsight.com/dragonfly-ai-vs-attention-insight/
- Pricing not published (**UNVERIFIED**).

### System1 ("Test Your Ad")
- **Predicts:** emotional response → Star Rating (long-term brand growth potential), Spike (short-term sales potential); human-panel-based, not pure AI.
- **Validation:** Star Rating + ESOV predicts up to **48% of brand growth** (vs 27% from media weight alone), across 264 brands / 4,000+ ads; **250+ published validations incl. with the IPA** — the gold standard for published validation in this category. Sources: https://system1group.com/methodology ; https://testyourad.system1group.com/validations ; https://system1group.com/uncategorized/our-metrics-explained
- Offers a **guarantee** program on its predictions. Source: https://system1group.com/blog/the-system1-guarantee-how-what-why
- **Pricing:** ~$11,000/test enterprise (**UNVERIFIED**, via Behavio comparison). Source: https://www.behaviolabs.com/blog/the-5-best-ad-testing-tools-in-2026

### Kantar LINK+ / Link AI
- **Predicts:** attention, emotion, brand impact, **Short-term Sales Likelihood (STSL)** — a validated measure proven to predict short-term sales share increases; Link AI predicts digital in-market performance in ~15 min, trained on **230,000+ ad tests / 30M human interactions** (world's largest normative ad database). Sources: https://www.kantar.com/north-america/inspiration/advertising-media/can-ad-testing-really-predict-sales-impact ; https://www.kantar.com/press-center/kantar-marketplace-adds-ai-powered-digital-ad-testing-to-platform ; https://www.kantar.com/marketplace/solutions/ad-testing-and-development/ad-testing
- **Pricing:** self-serve from ~$4,500/test; serviced ~$8,080–$15,000 (**UNVERIFIED**, via Behavio comparison). Source: https://www.behaviolabs.com/blog/system1-vs-behavio-a-detailed-review-of-two-ad-testing-tools

### Category pattern relevant to Soma
- Every credible player publishes a **numeric validation claim against an external referent**: MIT Saliency Benchmark (Junbi 0.87/94%, Dragonfly 89%), equivalence to N-person human studies (Neurons >95%, EyeQuant 90%), or in-market sales/growth validation (System1 48%-of-growth, 250+ validations; Kantar STSL). Pure "trust our neural net" without a published benchmark does not exist at the credible end of this market.
- Two pricing worlds: self-serve SaaS ($97/mo–$15K/yr: EyeQuant, Neurons) vs per-test enterprise ($4.5K–$15K/test: Kantar, System1). Soma bundling pre-flight scoring into a weekly fee undercuts both — but inherits the burden of publishing validation.

---

## 4. Incrementality: geo-holdouts & conversion lift

### What a credible lift claim requires (synthesis of Haus/Measured methodology docs)
1. **Randomized assignment** of geos (stratified sampling) to treatment/control — not before/after comparisons. Source: https://www.haus.io/experiments
2. **A counterfactual** built with synthetic-control methods ("what would have happened without ads"). Sources: https://www.haus.io/article/meta-incrementality-testing ; https://www.haus.io/blog/incrementality-testing-the-fundamentals
3. **Spillover control** — e.g., Haus "Commuting Zones" built from GPS mobility data so treatment users don't leak into control geos. Source: https://www.haus.io/blog/run-cleaner-more-accurate-holdout-tests-with-haus-commuting-zones
4. **Pre-test power analysis** (Haus "Power Score") so the test can actually detect the expected lift; otherwise results are noise. Source: https://www.haus.io/use-cases/incrementality
5. **Aggregate outcomes** (total sales in geo, not pixel conversions) as the dependent variable — immune to iOS/tracking loss.

### Who offers it
- **Haus:** geo-experiments across Meta, Google/YouTube, TikTok, CTV, retail media; custom annual pricing, not published (Vendr: "upon request") — mid-market/enterprise, ~$36.6M ARR 2025. Sources: https://www.haus.io/experiments ; https://www.vendr.com/marketplace/haus-analytics ; https://getlatka.com/companies/haus.io
- **Measured:** geo experiments + known-audience tests feeding **test-calibrated MMM**; enterprise contract pricing, not published; category tools cited starting ~$2,000/mo (**UNVERIFIED**). Sources: https://www.measured.com/ ; https://www.mediaplanningtool.com/measured
- **Platform-native (free tier for SMBs):** Meta **Conversion Lift** has no minimum spend but requires ~100 conversions/week during the study; Meta **Brand Lift** requires ~$30K minimum (US figures up to $120K cited — varies by country/format; **UNVERIFIED** exact thresholds). Sources: https://www.hunchads.com/blog/conversion-lift-study-on-meta ; https://madgicx.com/blog/facebook-ads-lift-measurement ; https://www.facebook.com/business/help/417527072254206
- **Gap:** no one serves true SMBs with independent (non-platform-run) incrementality — Haus/Measured are enterprise-priced; platform-native lift is free but is again "the platform grading itself." Triple Whale's Compass bundling incrementality into a DTC SaaS tier is the closest SMB offering. Source: https://www.triplewhale.com/blog/best-incrementality-testing-tools

---

## 5. The platform-reported-metrics trust problem

### Why platform ROAS is distrusted (practitioner discourse, 2025–2026)
- **Overstatement:** analysis of 200+ ecommerce brands found platforms overstate true ROAS by **~2.3x on average** vs de-duplicated verified revenue; Meta self-reported 87% of conversions as incremental vs 67% when cross-checked against GA4 (**secondary claims — UNVERIFIED methodology**). Source: https://adligator.com/blog/facebook-ads-attribution-measure-roas-2026
- **Simultaneous underreporting:** post-iOS 14.5, platform pixels miss 15–30% (sometimes 50%) of real conversions — so dashboards are wrong in *both directions* depending on funnel. Sources: https://www.cometly.com/post/facebook-ads-tracking-issues-after-ios-update ; https://hyros.com/updates/ios-14-attribution/
- **Modeled conversions:** dashboards show precise-looking numbers ($42.17 CPA) computed from partially synthetic, estimated data. Source: https://www.cometly.com/post/conversion-tracking-ios-update
- **Attribution-window truncation:** journeys longer than 7 days vanish from Meta reporting. Source: https://www.stackmatix.com/blog/facebook-ads-ios-attribution-workarounds
- **Conflict of interest framing:** "platforms shouldn't grade their own homework" is now the standard argument for third-party measurement. Source: https://www.adbeacon.com/attribution-accuracy-why-platforms-shouldnt-grade-their-own-homework/
- **Resulting norm:** platform ROAS treated as *directional*, verified against blended MER, post-purchase surveys, and periodic incrementality tests. Sources: https://curtishowland.substack.com/p/8-types-of-attribution-every-dtc ; https://www.trueroas.com/blog/mer-attribution-beyond-roas-smarter-spend

### Third-party verification norms (and who they're for)
- **MRC accreditation** = independent audit of a metric across viewability, invalid-traffic filtration, audience measurement, brand safety; it's how buyers know a number was "third-party verified." Sources: https://blog.google/products-and-platforms/products/ads/transparency-choice-ads-measurement/ ; https://doubleverify.com/hubfs/content/MRC%20PDF/DV_MRC_One-Sheet.pdf
- **IAS / DoubleVerify** = the two dominant verification vendors (viewability, IVT, brand safety) — effectively **enterprise-only** in practice (CPM-based fees on large programmatic budgets; platform partnerships like Twitter/X, TikTok); DV earned first MRC accreditation for TikTok video viewability in April 2026. Sources: https://www.adweek.com/programmatic/twitter-reaches-brand-safety-measurement-partnerships-with-doubleverify-ias/ ; (TikTok accreditation) https://www.mediapost.com/publications/article/358683/twitter-unveils-brand-safety-steps-commits-to-mrc.html — **UNVERIFIED: no SMB-priced MRC-accredited verification product found.**
- Note: even MRC/TAG oversight has taken credibility hits (2024–2026 criticism of lax enforcement) — accreditation helps but isn't unquestioned. Source: https://www.adweek.com/media/lambast-tag-mrc-damning-csam-report/
- **DoubleVerify buying Rockerbox** (Feb 2025) shows verification and outcome attribution merging into one "trust vendor" category. Source: https://www.aisystemscommerce.com/post/rockerbox-review-2026

---

## What a bundled-spend platform must show to be believed

Context: Soma bills one bundled number, runs spend as principal, and clients never see Meta/TikTok dashboards. That removes every default trust anchor (platform reporting, agency screen-shares, third-party pixel access to ad accounts). The 2025–2026 market has already defined what substitutes for it. Minimum credible set, in priority order:

1. **Blended MER against the client's own revenue source (non-negotiable anchor).**
   Total client-verified revenue (their Shopify/Stripe/GA4 — data *they* control) ÷ Soma's bundled fee. This is the one number that cannot be gamed by attribution modeling, and it's already the DTC lingua franca (healthy 3–5x). *Who provides it today:* Triple Whale, Northbeam, every MER calculator; it's the baseline everywhere. Soma must report it computed from a revenue feed the client owns, not from Soma's own counting.

2. **An independent conversion path the client can audit: post-purchase survey attribution.**
   "How did you hear about us?" data flows from the client's own checkout — zero-party, tracking-proof, and already trusted as a triangulation leg (Fairing/KnoCommerce; Triple Whale bakes it into Total Impact). Cheapest possible "second witness" for a client with no dashboard access. *Provided today by:* Triple Whale (Total Impact), Fairing/Enquire integrations.

3. **Periodic incrementality proof, not continuous attribution claims.**
   A quarterly geo-holdout or platform Conversion Lift study (free on Meta if ≥100 conversions/week) with published design: randomized geo assignment, synthetic-control counterfactual, spillover control, pre-registered power analysis, aggregate revenue as outcome. Report lift with confidence intervals, including null results. *Provided today by:* Haus/Measured (enterprise), Meta native lift (free, but self-graded), Triple Whale/Rockerbox (bundled in SaaS). **No one delivers independent incrementality at SMB price — open trust wedge for Soma.**

4. **Creative-level diagnostics at Motion parity, with benchmarks.**
   Per-ad hook rate (3-sec/impressions, ~30–40% good), hold rate, watch time, CTR, spend, CPA/ROAS by creative + creative tagging (hook type, format, angle) + category benchmarks + "what we're iterating next." This is what agency clients already forward internally (Motion leaderboards + weekly report snapshots + guest view accounts). Since Soma's pitch *is* creative intelligence, shipping less than a $750/mo Motion subscription shows would be disqualifying. *Provided today by:* Motion, Atria ($19/mo!), VidMob (enterprise).

5. **Published validation of the neural pre-flight score against outcomes.**
   The category norm: a numeric claim vs an external referent — MIT Saliency Benchmark (Junbi 0.87, Dragonfly 89%), human-study equivalence (Neurons >95%, EyeQuant 90%), or in-market validation with cumulative case count (System1: 250+ validations, 48% of brand growth; Kantar STSL). Soma needs a standing, updated "score-vs-realized-ROAS" validation page — ideally per-vertical hit rates — plus per-ad "predicted vs actual" shown retroactively in client reports. A prediction the client can score against reality every week is the strongest trust engine available. *Provided today by:* System1/Kantar (published validations), Neurons/Junbi/EyeQuant/Dragonfly (benchmark claims). None close the loop per-client per-ad — second open wedge.

6. **Spend transparency artifacts (principal-model hygiene).**
   Because clients can't see Ads Manager, Soma must substitute: delivered-spend statements per platform/period (Meta/TikTok invoice-level or API-derived), impression/click volume, and an audit right or third-party attestation (SOC 2 as Rockerbox does; MRC-style audit is enterprise-cost and not required for SMB, but an annual CPA/agreed-upon-procedures attestation of "spend billed = spend delivered" is). Precedent for guarantee-as-trust: Hyros's 90-day accuracy guarantee, System1's prediction guarantee. **UNVERIFIED:** no existing bundled-principal SMB ad platform publishing a spend-attestation standard was found — this is the piece with no incumbent template, and the one clients' CFOs will ask about first.

**Summary matrix**

| Trust component | Enterprise incumbent | SMB incumbent | Gap Soma can own |
|---|---|---|---|
| Blended MER vs client revenue | Northbeam | Triple Whale (free tier) | table stakes |
| Survey-based second witness | — | Fairing / Triple Whale | table stakes |
| Independent incrementality | Haus, Measured | none (Meta self-graded) | **open** |
| Creative diagnostics + benchmarks | VidMob, CreativeX | Motion, Atria | table stakes |
| Published prediction validation | System1, Kantar | EyeQuant ($97/mo) | **per-client closed loop open** |
| Spend delivery attestation | MRC/IAS/DV (enterprise) | none | **wide open** |
