-- ============================================================================
-- Soma — persisted generation beta runs.
-- migration 0004 — schema v4 — last changed 2026-07-28
--
-- The generate beta should have the same shape as the batch product: a durable run with
-- a status, a shareable address, a terminal result, and an English failure state.
-- ============================================================================

create table if not exists public.generation_runs (
  id            uuid primary key default gen_random_uuid(),
  share_token   text not null unique default encode(gen_random_bytes(16), 'hex'),
  provider      text not null default 'stub',
  brief         jsonb not null,
  status        text not null default 'queued',   -- queued | processing | done | failed
  result        jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

alter table public.generation_runs drop constraint if exists generation_runs_status_check;
alter table public.generation_runs
  add constraint generation_runs_status_check
  check (status in ('queued','processing','done','failed'));

alter table public.generation_runs drop constraint if exists generation_runs_terminal_check;
alter table public.generation_runs
  add constraint generation_runs_terminal_check
  check (
    (status <> 'done'   or result is not null) and
    (status <> 'failed' or error  is not null)
  );

alter table public.generation_runs enable row level security;

create index if not exists generation_runs_created_idx
  on public.generation_runs (created_at desc);

create index if not exists generation_runs_status_idx
  on public.generation_runs (status, created_at);
