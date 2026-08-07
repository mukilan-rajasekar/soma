# Architecture

How the three runtimes fit together. For “what to build next,” use
[`strategy/BUILD-PLAN-FULL-SERVICE.md`](strategy/BUILD-PLAN-FULL-SERVICE.md). For a file
map, use [`INDEX.md`](INDEX.md) and [`../pipeline/README.md`](../pipeline/README.md).

```
┌─────────────────────────────┐     share token / session      ┌──────────────────────┐
│  Next.js site (Vercel)      │◄──────────────────────────────►│  Supabase            │
│  src/app, src/components    │   batches, auth, storage        │  Postgres + Storage  │
│  src/proxy.ts (sessions)    │                                 │  migrations 0001–…   │
└──────────────┬──────────────┘                                 └──────────▲───────────┘
               │ enqueue / read report                                      │
               │                                                            │ service_role
               ▼                                                            │
┌─────────────────────────────┐     process_batch / ingest      ┌──────────┴───────────┐
│  Operator / concierge box   │────────────────────────────────►│  GPU scorer          │
│  tools/concierge/run_batch  │     demo/process_batch.py       │  TRIBE v2 + ffmpeg   │
│  scripts/ingest_partner_ad  │                                 └──────────────────────┘
└─────────────────────────────┘
```

## Site (Next.js 16)

- **Routes:** marketing under `src/app/(site)/`; product under `/upload`, `/r/<token>`,
  `/dashboard`, `/edit`, `/generate`, `/run`, Serve read UI under `/dashboard/brands`.
- **Auth:** Supabase Auth; session refresh in **`src/proxy.ts`** (not `middleware.ts`).
- **Clients:** `serviceClient()` for capability URLs; `sessionClient()` for dashboard
  (RLS). Mixing them is a tenancy bug — see README.
- **Env:** `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SECRET_KEY`. Python uses different names
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) in `.env` only.

## Scorer box (Python)

- **Canonical batch scorer:** `demo/process_batch.py`.
- **Worker:** `tools/concierge/run_batch.py` claims queued batches.
- **Partner one-shot:** `scripts/ingest_partner_ad.py` (render → score → publish).
- **Gate:** `scripts/verify.sh` — build, eslint, pytest, coherence, capture, lane_stats,
  claims, licence, frozen predictions, smoke.
- **Invoke map:** `pipeline/README.md` + `python -m pipeline.<name>`.

## Database

- Migrations in `supabase/migrations/` (see that folder’s README).
- Intentional skips: **0009** (readout tables), **0013** (platform OAuth) — deferred in
  the BUILD-PLAN, not missing work to invent.
- Serve v0: brands + `served_ads` + `outcomes` (CSV ingest); write path is CLI/scaffold
  behind `SOMA_SERVE_LIVE=1` and spend guards.

## Product loop (target)

Analyze (upload → report) → Improve (edit search / recuts) → Serve (place + outcomes) →
learn. Analysis-only is a supported entry without an ad account. Access checklist:
[`strategy/SERVE-ACCESS.md`](strategy/SERVE-ACCESS.md).

## Honesty surfaces

| Surface | Provenance |
|---|---|
| `/demo` | `public/demo/report.json` + `tools/demo/check_coherence.py` / `check_claims.py` |
| `/run` | Derived from a captured `run.jsonl` via `tools/capture/summarize.py --check` |
| `/r/<token>` | Batch report from the scorer |
| Strategy numbers | Prefer `validation/*.json` over prose |
