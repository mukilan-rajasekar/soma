# Docs index

One map for humans and agents. If two docs disagree, this file picks the winner.

## Start here

1. [`../README.md`](../README.md) — what the repo is, how to run site + pipeline.
2. [`../AGENTS.md`](../AGENTS.md) — agent map + gotchas.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) — site / scorer box / Supabase / entrypoints.
4. **What to build next (product):**
   [`strategy/BUILD-PLAN-FULL-SERVICE.md`](strategy/BUILD-PLAN-FULL-SERVICE.md)
   (Analyze → Improve → Serve, staged S0–S6).
   **Revenue / pricing:** [`strategy/BUILD-PLAN-REVENUE.md`](strategy/BUILD-PLAN-REVENUE.md)
   (bundled weekly price, onboarding tiers, invoice gates).
5. Ship gate: `../scripts/verify.sh` (`npm run verify`).

## Living vs historical

| Doc | Status | Use for |
|---|---|---|
| `strategy/BUILD-PLAN-FULL-SERVICE.md` | **Living product engineering plan** | Stages, schemas, Serve path |
| `strategy/BUILD-PLAN-REVENUE.md` | **Living commercial / pricing plan** | Weekly bundled price, onboarding, invoice boundary |
| `strategy/PRICING-COMPS.md` | Living comps appendix (dated fetches) | Agency + automated-platform fee structures |
| `strategy/COMPETITOR-GAPS.md` | Living capability-gap inventory (2026-08-07 research) | What the full-service pool has that Soma doesn't; trust-stack requirements |
| `strategy/STRATEGY-FULL-SERVICE.md` | Living strategy companion | Business / flywheel argument |
| `strategy/SERVE-ACCESS.md` | Living checklist | Meta / legal access gates (all Pending until marked Done) |
| `strategy/PLAN.md` | Living for science + GTM Tracks A/C (2026-07-30) | GPU backtest, partners, narrative honesty |
| `strategy/VISION.md` / `PRODUCT.md` / `ROADMAP.md` | Living product framing | Pitch, principles, science ladder |
| `strategy/WEEK-PLAN.md` | **Historical** (deadline Jul 27 2026 passed) | Do not schedule from this |
| `BUILD-SPEC.md` | **Historical** Next scaffold for an old branch | Conventions only; not “single source of truth” |
| `reports/*` | Historical session logs | Context, not contracts |

`PLAN.md` already reversed the old “do not build Serve” deferral and points at the
BUILD-PLAN. Prefer the BUILD-PLAN for file-level engineering tasks.

## Demo names

The word “demo” appears in six places. They are not the same thing:

| Path | Job |
|---|---|
| `demo/` | **GPU batch scorer package** — canonical entry `demo/process_batch.py` |
| `tools/demo/` | Build/check scripts for the marketing `/demo` page (`build_report.py`, `check_coherence.py`, `check_claims.py`) |
| `public/demo/` | Static assets for that page (`report.json`, media) |
| `src/app/demo/` | Next route for the arc console / scroll narrative |
| `src/components/demo/` | Arc console UI (player, live arcs) |
| `src/components/demo2/` | Marketing scroll narrative (`DemoScrollPage`) used by `/demo` and `/demo-short` |
| `docs/demo/` | Recording / voiceover notes |

When someone says “the demo,” ask which row. Default scorer = `demo/process_batch.py`.
Default marketing page = `src/components/demo2/DemoScrollPage.tsx`.

## Strategy & GTM

- `strategy/VISION.md` — north star pitch + honesty ladder
- `strategy/PRODUCT.md` — users, purpose, disclosure rules (see claims policy below)
- `strategy/ROADMAP.md` — science rungs
- `strategy/COMPETITORS.md`, `OPPORTUNITIES.md`, `PRICING-COMPS.md`
- `strategy/STRATEGY-PROPRIETARY-MODEL.md` — encoder licence / fallback
- `GTM/YC-APPLICATION.md`, `GTM/YC-UPDATE-FULL-SERVICE.md`
- `GTM/PRICING-LANDSCAPE.md` — agency + AI-native pricing research (fills `PRICING-COMPS.md` §4)

### Claims policy (product surfaces)

Numeric marketing claims on live TSX are gated by `tools/demo/check_claims.py`.
Figures without a `validation/` or committed public artifact **must not** ship on gated
surfaces. See `PRODUCT.md` Evidence on Hand — founder-attested external numbers are not
a licence to bypass the gate.

## Science

- `science/PREREGISTRATION.md` (+ addenda, affect, head, ads-ctr, serve)
- Artifacts: `../validation/*.json`, `../validation/*.csv`

## Pipeline & design

- `pipeline/INFERENCE-PIPELINE.md` — walkthrough
- `../pipeline/README.md` — **role catalog** for root / `demo/` / `tools/` Python
- `DESIGN-SYSTEM.md` — visual SoT for the site

## Serve / Improve tooling status

| Module | Status |
|---|---|
| `tools/serve/*` | Scaffold: CSV ingest, Meta dry-run/PAUSED client, guards, calibration fixtures |
| `tools/readout/windows.py` | Implemented; used by tests; scorer still uses inlined `detect_weak_spots` — see package README |
| `src/lib/readout-phrase.ts` | Wired into dashboard weak-spot copy where spots exist |
| `tools/capture/*` | Live for `/run` honesty page |

## Migrations

See [`../supabase/migrations/README.md`](../supabase/migrations/README.md). Gaps at
`0009` and `0013` are intentional deferrals, not missing files to invent.
