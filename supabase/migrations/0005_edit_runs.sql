-- ============================================================================
-- Soma — persisted edit beta runs.
-- migration 0005 — schema v5 — last changed 2026-07-28
-- ============================================================================

create table if not exists public.edit_runs (
  id            uuid primary key default gen_random_uuid(),
  share_token   text not null unique default encode(gen_random_bytes(16), 'hex'),
  ad_id         text not null,
  status        text not null default 'queued',   -- queued | processing | done | failed
  result        jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

alter table public.edit_runs drop constraint if exists edit_runs_status_check;
alter table public.edit_runs
  add constraint edit_runs_status_check
  check (status in ('queued','processing','done','failed'));

alter table public.edit_runs drop constraint if exists edit_runs_terminal_check;
alter table public.edit_runs
  add constraint edit_runs_terminal_check
  check (
    (status <> 'done'   or result is not null) and
    (status <> 'failed' or error  is not null)
  );

alter table public.edit_runs enable row level security;

create index if not exists edit_runs_created_idx
  on public.edit_runs (created_at desc);

create index if not exists edit_runs_status_idx
  on public.edit_runs (status, created_at);
