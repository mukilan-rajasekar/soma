-- ============================================================================
-- Soma - rescore jobs: make measured edit readouts requestable.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor -> Run, or apply via your migration runner.
-- migration 0010 - schema v10 - last changed 2026-08-07
--
-- WHY THIS EXISTS.
--
-- A rendered edit can be scored only on the scorer box: it needs Python, ffmpeg and the
-- TRIBE weights. A Route Handler must therefore enqueue work and stop, not spawn a GPU
-- process from Vercel. This table is the missing queue between "customer asked to rescore
-- these cuts" and the watcher that will eventually claim that work.
--
-- The queue uses the same terminal states as batches and edit_runs. The two reaper columns
-- are included here because a worker that dies mid-claim otherwise leaves the row
-- processing forever.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Existing batch queue gets the same claim metadata new queues use.
-- ----------------------------------------------------------------------------
alter table public.batches
  add column if not exists claimed_at timestamptz;

alter table public.batches
  add column if not exists attempts integer not null default 0;

alter table public.batches drop constraint if exists batches_attempts_check;
alter table public.batches
  add constraint batches_attempts_check check (attempts >= 0);


-- ----------------------------------------------------------------------------
-- 2) Rescore jobs.
--
--    Ownership is stamped for audit, but authorization is inherited from edit_runs in
--    the SELECT policy below. Writes stay service_role: authenticated users enqueue
--    through src/app/api/edit/rescore/route.ts, where the request shape can be bounded.
-- ----------------------------------------------------------------------------
create table if not exists public.rescore_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  edit_run_id   uuid not null references public.edit_runs(id) on delete cascade,
  batch_id      uuid references public.batches(id) on delete cascade,
  ad_id         text,
  cut_ids       uuid[] not null default '{}',

  status        text not null default 'queued',   -- queued | processing | done | failed
  claimed_at    timestamptz,
  attempts      integer not null default 0,

  error         text,
  run_log       text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

alter table public.rescore_jobs drop constraint if exists rescore_jobs_status_check;
alter table public.rescore_jobs
  add constraint rescore_jobs_status_check
  check (status in ('queued','processing','done','failed'));

alter table public.rescore_jobs drop constraint if exists rescore_jobs_attempts_check;
alter table public.rescore_jobs
  add constraint rescore_jobs_attempts_check check (attempts >= 0);

alter table public.rescore_jobs drop constraint if exists rescore_jobs_failed_error_check;
alter table public.rescore_jobs
  add constraint rescore_jobs_failed_error_check
  check (status <> 'failed' or error is not null);

create index if not exists rescore_jobs_status_idx
  on public.rescore_jobs (status, created_at);

create index if not exists rescore_jobs_edit_run_idx
  on public.rescore_jobs (edit_run_id, created_at desc);

create index if not exists rescore_jobs_user_idx
  on public.rescore_jobs (user_id, created_at desc) where user_id is not null;

alter table public.rescore_jobs enable row level security;

drop policy if exists "owners read their rescore jobs" on public.rescore_jobs;
create policy "owners read their rescore jobs"
  on public.rescore_jobs for select
  to authenticated
  using (
    exists (
      select 1
      from public.edit_runs r
      where r.id = rescore_jobs.edit_run_id
        and r.user_id is not null
        and r.user_id = (select auth.uid())
    )
  );


-- ----------------------------------------------------------------------------
-- 3) edit_cuts.readout_id.
--
--    Stage 2's ad_readouts table is not in this checkout yet. The column can still land
--    now so writers have a stable slot; the foreign key is attached automatically when a
--    future migration has created public.ad_readouts.
-- ----------------------------------------------------------------------------
alter table public.edit_cuts
  add column if not exists readout_id uuid;

do $$
begin
  if to_regclass('public.ad_readouts') is not null then
    alter table public.edit_cuts drop constraint if exists edit_cuts_readout_id_fkey;
    alter table public.edit_cuts
      add constraint edit_cuts_readout_id_fkey
      foreign key (readout_id) references public.ad_readouts(id) on delete set null;
  end if;
end $$;

create index if not exists edit_cuts_readout_idx
  on public.edit_cuts (readout_id) where readout_id is not null;
