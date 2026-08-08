# BUILD PLAN — Revenue (bundled weekly price)

Written 2026-08-07. **Living commercial engineering + GTM plan** for turning the founder
pricing decision into something that can be quoted, invoiced, and said to investors
without contradicting the repo.

Companion: `BUILD-PLAN-FULL-SERVICE.md` (Serve stages S0–S6), `STRATEGY-FULL-SERVICE.md`
(§4.2 decision record), `SERVE-ACCESS.md` (calendar/legal gates),
`PRICING-COMPS.md` (dated competitor/agency sources). Product “what to build next” for
**Serve write path** stays on the full-service plan. **This file owns** pricing copy,
onboarding brief → quote, research, and the invoice boundary.

**What this document is.** A build order for the revenue model the 2026-08 investor /
partner update is about: one all-inclusive weekly number, renew-until-paused, not
charging until serving + licence gates clear.

**What this document is not.** It is not a licence to invent TAM, partner counts, or
agency fee rates. Figures without a dated source are `[NEEDS EVIDENCE]`. A quote is not
an invoice.

```
R0  honesty: investor copy + kill stale "flat fee" sentences
R1  comps: dated agency + AI-agency pricing appendix
R2  onboarding: recommended spend tiers (not a raw budget box)
R3  recommended-tier → stored brief (reach_note + tier id)
R4  gate 4: name fallback backbone WITH a cost in PLAN.md     (founder)
R5  counsel: prepaid-week / money transmission / CC BY-NC      (calendar)
R6  Stripe + invoice rows  (blocked on R4 + R5; do not start early)
R7  Google as a priced platform (blocked on a real Google client)
```

**R0–R2 shipped this pass.** R3 is optional (reach already stored in `reach_note`). R4–R7 are not engineering-first.

---

## The product this plan sells

Founder-supplied, 2026-08-07 (Shawn Kung / angel update + internal revenue-model call):

> Client hands over intent (reach, duration, platforms, goal). Soma returns **one weekly
> all-inclusive price** — media across chosen networks plus a margin (default 20%) —
> that **renews until paused**. The client never manages per-platform finances. Neural
> testing is the hook; full-service serving is what retains.

**Not charging yet is a feature, not a delay to hide.** Paid pilots are paused while
Meta BV / TikTok app / App Review are in flight (`SERVE-ACCESS.md`). Quotes may exist.
`renewals.py --execute` and any invoice path refuse while PLAN.md gate 4
(“Named fallback backbone with a cost”) is still in the document.

Buyer-facing sentence (the only one allowed on surfaces):

> *One weekly price, everything included, pause any time.*

Retired everywhere: *“our fee never rises when your budget rises.”* False under this
model (`BUILD-PLAN-FULL-SERVICE.md` §0.5).

---

## Today vs the transcript

| Transcript claim | In the repo 2026-08-07 |
|---|---|
| Bundled weekly = media + 20% | **Yes.** `tools/serve/pricing.py`, `src/lib/pricing.ts`, migration `0016`. Identity checked in schema + parity gate. |
| Renew until paused | **Scheduler only.** `tools/serve/renewals.py` dry-run; `--execute` licence-blocked. |
| One number; client never sees platform costs | **Partial.** Buyer total is one number; quote still stores the split (needed for prepaid-week caps). Preview shows the margin line on purpose. |
| Onboarding: filters → recommended tier | **R2 done.** `/dashboard/campaigns/new` recommends weekly media from goal + platforms + reach; custom budget is a disclosure. |
| Google Ads in the allocation | **No.** `PLATFORMS = (meta, tiktok)`. Google is not in this plan until a client exists (R7). |
| Invoice / Stripe | **No, by design.** Quote `billing_note` says so. |
| Agency / AI-agency comps | **R1 started.** `PRICING-COMPS.md` (fetched 2026-08-07). AI-native row still empty. `COMPETITORS.md` stays the neural-tester SoT. |
| Investor memo from Granola | **Founder.** R0 writes the outline into this file; the email/deck is not a code artifact. |

---

## R0 — Honesty: investor copy + stale flat-fee sentences

**Done 2026-08-07.** STRATEGY §4.2 buyer quote rewritten. `src/` has no “never rises”
/ “flat fee.” Investor paragraph below is paste-ready.

### 0.1 Investor / partner paragraph (paste-ready)

Use this, not a warmer paraphrase that implies serving is live or that invoices exist:

> We’re not charging yet — Meta Business Verification, TikTok app approval, and App
> Review are still in flight, and we won’t invoice for a serving path that cannot spend.
> Beta partners are on analysis and improvement; they share creative and outcomes, we
> return read-outs and recuts. The commercial model is decided: one weekly all-inclusive
> price per campaign (media across the networks they pick, plus our margin, 20% today),
> renewing until paused. A quote is not a bill. Invoices stay blocked until we name a
> permissively licensed fallback encoder with a cost (PLAN.md gate 4) and counsel clears
> the prepaid-week / money-transmission questions. Neural testing is how people find us;
> full-service serving is what we want them to stay for.

### 0.2 Code / docs to fix

| File | Defect | Status 2026-08-07 |
|---|---|---|
| `STRATEGY-FULL-SERVICE.md` §4.2 | Buyer-facing block quote said *“It is a flat fee…”* after the supersession banner | **Done.** Quote rewritten; percentage table is a sanity check citing `PRICING-COMPS.md` |
| `docs/GTM/*` / public TSX | Any leftover “never rises” / flat-fee claim | `src/` is clean. STRATEGY historical sections still argue the *superseded* flat-fee model on purpose — do not silently rewrite them into the new model |

**Verification:** `rg -n "It is a flat fee" docs/strategy/STRATEGY-FULL-SERVICE.md` is empty.
`rg -n "never rises" src/` is empty.

---

## R1 — Dated comps (agencies + AI / automated agencies)

**Started 2026-08-07.** Agency / Motion / Smartly rows have dated URLs. AI-native row
still empty — do not claim “AI ad agencies charge X” until it exists.

Live file: `docs/strategy/PRICING-COMPS.md`. Rules:

- Every row has a **URL + fetch date**. No date → `[NEEDS EVIDENCE]`, not deck-eligible.
- Third-party blogs are labelled as such. Vendor marketing pages beat blogs.
- `COMPETITORS.md` stays the neural-tester SoT; it **links here** for fee structures.
- Do not put unverified Smartly/Motion numbers back into STRATEGY §4.2 until this file
  promotes them.

**Minimum viable table (R1 done when all four rows have dated URLs):**

1. Performance / paid-social **agency** — % of spend vs retainer vs hybrid
2. Motion (creative analytics, not serving) — public list price + spend tier
3. Smartly.io (automation + serving) — % of managed spend; note “no public price page”
4. One AI-native / autonomous buyer (AdCreative.ai, Pencil, or similar) — SaaS vs % 

**Verification:** `PRICING-COMPS.md` has `Fetched:` dates; STRATEGY §4.2 table either
cites this file or stays `[VERIFY]`.

---

## R2 — Recommended spend tiers

**Done 2026-08-07.** Transcript: filters/toggles → recommended weekly cost, not “type a
raw budget.”

### 2.1 Engine

Canonical: `tools/serve/pricing.py` `recommend_spend()`. TS mirror: `src/lib/pricing.ts`
`recommendSpend()`. Same integer-micro discipline as `quote()`. Parity corpus:
`tools/serve/fixtures/recommend_cases.json`, checked by `test_serve_pricing.py` and
`scripts/check-pricing-parity.mts`.

Inputs (all already on the brief, except reach):

| Input | Values | Effect |
|---|---|---|
| `goal` | `aggressive_conversions` / `low_cost_testing` | Base media: **$1,250 / $500 per week** |
| `platforms` | subset of `{meta, tiktok}` | 1.00× one network; +0.25× per extra network |
| `reach` | `local` / `national` / `broad` | 0.60× / 1.00× / 1.60× |
| `duration_weeks` | optional int | ≤2 weeks: 0.85× (short test); else 1.00× |

Bases are **media**, not price. At default 20% margin, national + one platform:

- Conversion push → **$1,500 / week all-in** (the transcript’s psychological number)
- Testing → **$600 / week all-in**

Round the recommended media to the nearest dollar (1e6 micros), then `quote()`.

**Do not invent Google here.** Unknown platforms still raise in `quote()`.

### 2.2 UI

`CampaignBriefForm`: reach toggle + two goal playbooks + platforms. Default path is
**recommended**; “Custom weekly media” is a disclosure, not the first field. Submit still
POSTs `weekly_spend_micros` (recommended or custom) to `/api/campaigns/quote`. Store
reach in `campaign_briefs.reach_note` (already a text column).

**Verification:** pytest + parity gate green; `/dashboard/campaigns/new` can produce a
quote with an empty custom budget field.

---

## R3 — Persist the tier on the brief

**Partial 2026-08-07.** The form already POSTs `reach_note` (`local` / `national` /
`broad`) and the quote route stores it on `campaign_briefs`. Optionally add
`campaign_briefs.tier` later (`testing` / `conversion`) — **not a new migration in R2**.
If a column is needed, next free number after 0016; do not invent 0009/0013.

---

## R4 — PLAN.md gate 4 (founder)

Gate line: *“Named fallback backbone with a cost — before quoting anyone a price.”*

`SERVE-ACCESS.md` already records founder direction (2026-08-07): an in-house
TRIBE-v2-class encoder **is** the intended fallback, and the gate flips only when
PLAN.md names it **with a cost estimate** (training compute + data + time). Until then
`check_licence_gate.licence_blocked()` stays true and `renewals.py --execute` refuses.

**This plan does not invent the cost.** Founder fills PLAN.md. Engineering only checks
that the gate line disappearing is what unblocks invoices.

---

## R5 — Counsel (calendar)

Same pass as `SERVE-ACCESS.md`:

- CC BY-NC on TRIBE v2 for paid pilots
- Prepaid-week: gross vs net, money transmission, platform ToS on managed spend

No invoice schema until this returns.

---

## R6 — Stripe / invoices

**Blocked on R4 + R5.** When unblocked:

- Payment rows separate from `campaign_subscriptions` (subscriptions stay scheduling
  truth; invoices are billing truth — 0016 header already says this)
- Checkout collects the **weekly price**, not the media split
- Spend guards still cap on **media only** (`funded_caps()`)

Do not scaffold Stripe “just in case.” An unused Stripe integration is a surface that
looks like we can charge.

---

## R7 — Google as a priced platform

**Blocked on a real Google Ads client**, not on TAM slides. When unblocked: add
`google` to `PLATFORMS` in **both** pricing modules, regenerate parity fixtures, extend
the onboarding checkbox. Serving write for Google is not in the Serve build plan yet;
do not pretend a priced checkbox is a Google campaign.

---

## Verification (whole plan)

| Stage | Check |
|---|---|
| R0 | Stale flat-fee buyer quote gone; investor paragraph in §0.1 |
| R1 | `PRICING-COMPS.md` dated rows |
| R2 | `pytest test_serve_pricing.py` + `node --experimental-strip-types scripts/check-pricing-parity.mts` |
| R4–R7 | `SERVE-ACCESS.md` / PLAN.md, not this file |

`npm run verify` remains the ship gate. Pricing parity is already wired into it.

---

## Explicitly out of scope

- Changing the default margin without a founder decision (20% stands)
- Putting partner counts or TAM on this document
- Claiming serving is live
- Performance-share / rebate math (`BUILD-PLAN-FULL-SERVICE.md` §6.3 is `[NEEDS REWORK]`)
