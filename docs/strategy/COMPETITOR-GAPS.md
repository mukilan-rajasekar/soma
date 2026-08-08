# Competitor capability gaps — what the new pool has that Soma doesn't

Researched 2026-08-07 (four parallel sourced sweeps, committed under
[`research-2026-08/`](research-2026-08/)). Read with
[`COMPETITORS.md`](COMPETITORS.md) (positioning SoT — this file is capability
inventory, not positioning), [`PRICING-COMPS.md`](PRICING-COMPS.md) /
[`../GTM/PRICING-LANDSCAPE.md`](../GTM/PRICING-LANDSCAPE.md) (fees), and
[`BUILD-PLAN-FULL-SERVICE.md`](BUILD-PLAN-FULL-SERVICE.md) /
[`BUILD-PLAN-REVENUE.md`](BUILD-PLAN-REVENUE.md) (which own build order — this file
feeds them and decides nothing).

**Why the pool changed.** Soma stopped being a neural-testing tool the day the offer
became "hand it off": the competition is now (a) enterprise creative+media platforms
(Smartly, Hunch, Skai), (b) the 2024–26 AI-native pack (Creatify, Omneky, Madgicx,
AdAmigo, Icon, Pencil...), and (c) the $2–15k/month human agency the bundled week
replaces. Every claim below carries a source in the research files; evidence rules are
PRICING-COMPS's (no URL, no deck).

---

## 1. The hook is no longer unique — the erosion facts first

"Predict before you spend" is now claimed, shipping, or published by:

| Who | What they ship | Since |
|---|---|---|
| **Smartly** | Creative Predictive Potential — pre-flight attention/sentiment scoring (CV + eye-tracking models), inside the platform enterprise buyers already use | Nov 2025 |
| **Pencil** (Brandtech) | "Know what performs before you spend... billions of data points" — near-verbatim our pitch, enterprise-only | live |
| **AdCreative.ai** (Appier) | CNN "Creative Scoring AI," claims 90%+ accuracy, self-serve from $39/mo — the cheap anchor for what "AI ad scoring" costs | live |
| Attention-science class (Neurons, Junbi, EyeQuant, Dragonfly) | Attention prediction with **published external benchmarks** (MIT Saliency 0.87–0.89; "90–95% of human eye-tracking") | years |
| Panel-based (System1, Kantar) | In-market validation programs: 250+ published validations, "48% of brand growth," STSL | years |

Two things NOBODY in any tier does (the flank that is still open):
1. **Close the loop per client per ad** — a standing predicted-vs-actual page where every
   prediction is scored against realized outcomes weekly. Our frozen-prediction
   architecture (`served_ads` predictions carry `scorer_version` + `encoder_rev`, gated
   by `check_frozen.py`) plus the outcomes table IS this machine; nobody else built one.
2. **The bundle** — pre-flight scoring + video improvement + serving + human hand-off in
   one bill. Creatify is judged one "pre-flight score" feature away; watch them.

Consequence, not optional: the category norm is a numeric validation claim against an
external referent. A brain-based score with **no published validation number** now reads
as *worse* than a CV score with one. Stage 1 (PLAN.md) stopped being just science the
day Smartly shipped CPP — it is the marketing artifact too.

---

## 2. Gap inventory by front

Grading: **HAVE** (shipped in repo) · **PARTIAL** (mechanism exists, not the product) ·
**GAP** (nothing).

### 2.1 vs enterprise platforms (Smartly/Hunch/Skai table stakes)

| Capability (their table stakes) | Soma |
|---|---|
| Feed/catalog ingestion + enrichment, catalog ads | **GAP** |
| Template-based creative scaling (Figma/PSD in, thousands of on-brand variants out) | **GAP** |
| DCO / dynamic personalization (geo, language, weather, promo) | **GAP** |
| Video automation (image-to-video, catalog product video) | **PARTIAL** — edit/re-score loop improves existing video; generates nothing |
| Automation rules/triggers (pause/scale on conditions) | **PARTIAL** — `autopilot.py` pauses on guard breach / lost arms; no user-authored rules, no scale-up actions |
| Predictive budget allocation across channels | **GAP** — A/B split + funded caps is allocation *discipline*, not allocation *intelligence* |
| Custom optimization goals from client data (GA4, MMP, LTV, offline) | **GAP** — outcomes ingestion exists; no external data connectors |
| Cross-channel reporting dashboard, scheduled/shareable reports | **PARTIAL** — internal dashboard; nothing scheduled, exportable, or client-shareable |
| Creative-level insight tagging ("why it works") | **PARTIAL** — lane readouts/windows are richer than tags but aren't surfaced as client-facing creative insights |
| Experimentation + incrementality as optimization signal | **PARTIAL** — honest A/B evaluator; no lift studies, no incrementality anywhere |
| Rapid native-format support (ASC, PMax, Demand Gen) as Business Partner | **GAP** — no partner status, no format velocity |
| Enterprise wrapper: CSM, managed tier, SOC 2/ISO, API, academy | **GAP** (SOC 2 matters the day a mid-market brand asks) |

**The Marin lesson** (dissolved Apr 2025, Ch. 11 Jul 2025): a thin cross-channel
rules+reporting layer with no creative manufacturing and no proprietary signal got
commoditized to death by free native tools. Survivors own creative production
(Smartly/Hunch) or proprietary data (Skai). Soma's moat must stay: proprietary signal
(brain data) + creative manufacturing (edit loop, and eventually generation) — never
the workflow layer alone.

### 2.2 vs the AI-native pack

| Capability (their table stakes) | Soma |
|---|---|
| AI image/video generation, UGC avatars (700–1,000+ actor libraries) | **GAP** — we edit, we don't create; Icon's retreat to human creators says quality ceiling is real, hybrid > pure-AI |
| Batch variant generation from one brief | **GAP** |
| Brand-kit ingestion / brand LLM guardrails | **GAP** |
| Channel breadth: Meta+TikTok+Google minimum; pack adds Snap/LinkedIn/Reddit/Pinterest/OpenAI Ads | **PARTIAL** — 3 clients built (Google unpriced); we are still the narrowest footprint in the set |
| Audit → daily recommendations → approve-or-autopilot toggle (the emerging control surface) | **PARTIAL** — autopilot cycle report is the engine of exactly this; there is no product surface on it |
| Fatigue detection + automatic creative rotation | **GAP** — nothing watches delivery decay |
| Competitor ad-library mining → cloneable campaigns | **GAP** — no competitor intelligence anywhere |
| Minutes-to-value onboarding (2–5 min, no card) | **GAP** — our onboarding produces a quote, not a connected account with first insights |
| Landing-page generation paired with ads | **GAP** — open ground for everyone (only Uplane) |

### 2.3 vs the human agency (the retention stack — "12 things missed on day one")

| What the agency delivers | Soma |
|---|---|
| Named human who answers; weekly call; Slack same-day answers | **GAP** — founder-led today, unpriced and unpromised; Icon and Hunch both prove "expert in the loop" scales as product |
| Annotated narrative report (what changed, why, what's next) — 8–12 agency-hours/week | **GAP** — the cycle report contains the raw truth; nobody turns it into client prose |
| Fresh creative arriving unasked (15–40 statics + 3–10 videos/mo at $5–12k tier, UGC sourcing incl. rights) | **GAP** — largest hard-cost gap; creative volume is the #1 thing a buying-only tool can't fake |
| Budget pacing babysitting (daily checks, runaway-weekend catches) | **PARTIAL** — spend guard would-pause + autopilot is *stronger* mechanically; no alerting, no human acknowledgment |
| Tracking quietly kept fixed (pixel/CAPI/GA4/feeds) | **GAP** — we do no tracking setup at all; also the day-one setup deliverable |
| Promo/seasonal execution on the client's calendar (BFCM builds, front-loading) | **GAP** |
| Optimization log / audit trail | **HAVE** — capture recorder + cycle reports + refusal-first design IS an audit trail agencies hand-write; needs client-visible surface |
| Proactive strategy TO the client (QBRs, auction intel, media plans) | **GAP** |
| Cross-domain diagnosis ("your landing page is the problem") + scope flex | **GAP** |
| Accountability artifacts: partner badges, Clutch reviews, case studies, free audit as sales weapon, 30-day out | **GAP** — zero badges, zero public case studies; free audit maps naturally onto our analyze tier |
| Commercial norms: client owns accounts/pixel/history; agency works via access | **CONFLICT** — principal model inverts the trust default; the exit story (data export, account/audience portability) must be written before prospects ask (LocaliQ's reputation is the warning) |

### 2.4 The trust stack a bundled-spend platform must carry

Because the client never sees Ads Manager, every default trust anchor is gone. The
market has already defined the substitutes:

| Trust component | SMB incumbent | Soma |
|---|---|---|
| Blended MER computed from a revenue feed the client owns (Shopify/Stripe/GA4) | Triple Whale (from free) | **GAP** — non-negotiable anchor, table stakes |
| Post-purchase survey second witness | Fairing, Triple Whale | **GAP** |
| Independent incrementality at SMB price | **nobody** (Meta lift is free ≥100 conv/wk but self-graded) | **GAP — open wedge**; our stats honesty (floors, permutation, Holm) is exactly the muscle |
| Creative diagnostics at Motion parity (hook/hold rates, leaderboards, benchmarks, guest views) | Motion $750/mo, Atria $19/mo | **PARTIAL** — heatmaps/readouts exist; hook-rate-style delivery metrics and shareable reports don't. Shipping less than a $19/mo tool shows is disqualifying for a creative-intelligence company |
| Published prediction validation + per-ad predicted-vs-actual | System1/Kantar publish; nobody closes per-client loop | **PARTIAL → our biggest weapon** (§1) |
| Spend-delivery attestation ("spend billed = spend delivered") | **nobody at any price** | **GAP — wide open**; guard decisions, funded-cap checks, and dry-run recorders are attestation artifacts already; missing is the client-facing statement + eventually third-party attestation. First CFO question under principal billing |

---

## 3. What Soma has that nobody in any tier has

1. **Neural ground truth.** Everyone else predicts from CV proxies, eye-tracking
   correlates, or platform history. Only Soma's score is grounded in brain response —
   *if* Stage 1 validates it. Without the number, this is a liability (§1).
2. **The frozen-prediction ledger.** Predictions that cannot be quietly rewritten
   (`check_frozen.py`) + outcomes ingestion = the per-ad validation loop no competitor
   can bolt on without rebuilding their scoring path.
3. **Refusal-first honesty as machinery, not copy.** Floors before winners, Bonferroni,
   licence gate blocking invoices, activation refusing unfunded quotes, autopilot that
   can stop spend but never start it. Every competitor *claims* trustworthy automation;
   ours is enforced in code that a due-diligence engineer can read.
4. **The prepaid week with code-enforced funded caps.** Disclosed margin + margin never
   spendable + spend ceiling derived from the quote — no bundled competitor (AdRoll,
   LocaliQ, principal desks) discloses, and none enforces in code.
5. **The bundle itself** — scoring + improvement + serving + hand-off in one weekly
   price. Confirmed unoccupied across all four sweeps.

---

## 4. Severity, and where each gap should land

Not a build order — BUILD-PLAN owns that. This is triage for the two plans to absorb.

**Tier 0 — existential, already scheduled:** published validation (Stage 1 → a standing
validation page; per-ad predicted-vs-actual in every client report). The science plan
and the marketing plan are now the same plan.

**Tier 1 — retention, felt in week one of any full-service client:** creative
production capacity (hybrid human+AI, per Icon's pivot — candidate for the service
layer, not just software); client-facing reporting (Motion-parity creative metrics +
the annotated narrative the cycle report almost writes); the named-human ritual layer
(calls, Slack, same-day answers — price it into the margin); tracking setup as a
deliverable (pixel/CAPI/GA4).

**Tier 2 — credibility of principal billing (before the first renewal invoice ever
executes):** MER from client-owned revenue feeds; post-purchase survey integration;
spend-delivery statements (start with what guard + insights already produce);
quarterly Meta Conversion Lift (free ≥100 conv/wk) reported with our own CIs, including
nulls; the account-ownership exit story in the MSA.

**Tier 3 — platform table stakes, sequenced as clients demand them:** channel breadth
(google pricing = BUILD-PLAN-REVENUE R7, then Snap/LinkedIn by pull); recommendation
feed + approve/autopilot toggle as a product surface over `autopilot.py`; fatigue
detection/rotation; catalog/feed ads; competitor ad-library intelligence; automation
rules; budget-allocation intelligence; landing pages (open ground); partner badges +
case studies + free-audit funnel; SOC 2 when mid-market knocks.

**Standing constraint (the Marin lesson):** any quarter spent building only the
workflow layer — rules, dashboards, connectors — while signal and creative stand still
is a quarter spent becoming Marin.
