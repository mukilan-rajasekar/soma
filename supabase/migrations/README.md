# Supabase migrations

Apply in filename order (or paste into the SQL editor in order). Every file is written
to be idempotent where practical (`if not exists`, `drop policy if exists`).

## Applied sequence on main

| File | Purpose |
|---|---|
| `0001_init.sql` | Core waitlist / arcs bootstrap |
| `0002_waitlist_source_default.sql` | Waitlist source default |
| `0003_batches.sql` | Batches, uploads, share tokens |
| `0004_generation_runs.sql` | Generation beta runs |
| `0005_edit_runs.sql` | Edit runs |
| `0006_edit_run_sources.sql` | Edit source linkage |
| `0007_result_posters.sql` | Poster MIME / storage |
| `0008_accounts.sql` | `user_id` ownership + SELECT RLS |
| `0010_rescore_jobs.sql` | Rescore job queue (+ reaper columns) |
| `0011_brands.sql` | Brands, members, fees; `brand_id` on batches/edit_runs |
| `0012_outcomes.sql` | `served_ads`, `outcomes`, `outcomes_current` |
| `0014_serve_jobs.sql` | `serve_jobs`, `spend_guards`, `guard_events` |
| `0015_serve_experiments.sql` | `serve_experiments`, `serve_experiment_arms` (A/B splits) |
| `0016_campaign_pricing.sql` | `campaign_briefs`, `campaign_quotes`, `campaign_subscriptions` (bundled weekly pricing) |

## Intentional gaps — do not invent these numbers

| Missing number | Planned file (not in tree yet) | Why deferred |
|---|---|---|
| **0009** | `0009_readout.sql` | Stage 2 diagnostic persistence (`ad_readouts` / windows). Spec lives in `docs/strategy/BUILD-PLAN-FULL-SERVICE.md` §2.3. |
| **0013** | `0013_serve_connections.sql` | OAuth / platform connections. Deferred until client #2 needs automated insights pull (BUILD-PLAN §4.0 / §4.3). |

If you need those capabilities, implement the named migration from the BUILD-PLAN — do
**not** reuse `0009` / `0013` for unrelated schema. Do **not** renumber `0010`–`0014`;
they may already be applied on shared projects.

## Related

- Access / Meta gates: `docs/strategy/SERVE-ACCESS.md`
- Living engineering plan: `docs/strategy/BUILD-PLAN-FULL-SERVICE.md`
