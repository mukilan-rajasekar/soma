-- ============================================================================
-- Soma — persisted edit run source metadata.
-- migration 0006 — schema v6 — last changed 2026-07-28
-- ============================================================================

alter table public.edit_runs
  add column if not exists source_kind text not null default 'demo',
  add column if not exists source_title text,
  add column if not exists batch_share_token text;

alter table public.edit_runs drop constraint if exists edit_runs_source_kind_check;
alter table public.edit_runs
  add constraint edit_runs_source_kind_check
  check (source_kind in ('demo','batch'));

create index if not exists edit_runs_source_kind_idx
  on public.edit_runs (source_kind, created_at desc);
