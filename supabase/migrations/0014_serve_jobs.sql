-- ============================================================================
-- Soma - Serve jobs and spend guards.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor -> Run, or apply via your migration runner.
-- migration 0014 - schema v14 - last changed 2026-08-07
--
-- WHY THIS EXISTS.
--
-- Stage 5 is the first stage that can touch an ad platform. It gets its own queue and
-- guard tables so request paths can enqueue work, while the scorer/serve box is the only
-- process that holds platform credentials and can claim jobs. Every table carries brand_id
-- because brand_members is the customer data boundary introduced in migration 0011.
--
-- WHAT THIS REFUSES TO DO.
--
-- No authenticated writes. Creating, activating or pausing platform objects spends money
-- or prevents spend, so those requests pass through server code and service_role. Browser
-- clients get SELECT only through RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Platform job queue.
-- ----------------------------------------------------------------------------
create table if not exists public.serve_jobs (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  served_ad_id  uuid references public.served_ads(id) on delete set null,

  kind          text not null,                    -- create | activate | pause | poll_status
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued',   -- queued | processing | done | failed

  claimed_at    timestamptz,
  attempts      integer not null default 0,
  error         text,
  run_log       text,

  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

alter table public.serve_jobs drop constraint if exists serve_jobs_kind_check;
alter table public.serve_jobs
  add constraint serve_jobs_kind_check
  check (kind in ('create','activate','pause','poll_status'));

alter table public.serve_jobs drop constraint if exists serve_jobs_status_check;
alter table public.serve_jobs
  add constraint serve_jobs_status_check
  check (status in ('queued','processing','done','failed'));

alter table public.serve_jobs drop constraint if exists serve_jobs_attempts_check;
alter table public.serve_jobs
  add constraint serve_jobs_attempts_check check (attempts >= 0);

alter table public.serve_jobs drop constraint if exists serve_jobs_failed_error_check;
alter table public.serve_jobs
  add constraint serve_jobs_failed_error_check check (status <> 'failed' or error is not null);

create index if not exists serve_jobs_status_idx
  on public.serve_jobs (status, created_at);

create index if not exists serve_jobs_brand_idx
  on public.serve_jobs (brand_id, created_at desc);

create index if not exists serve_jobs_served_ad_idx
  on public.serve_jobs (served_ad_id, created_at desc) where served_ad_id is not null;


-- ----------------------------------------------------------------------------
-- 2) Spend caps.
--
--    A null external_campaign_id means "brand-wide". Caps are stored in micros to match
--    the outcomes table and avoid decimal money arithmetic.
-- ----------------------------------------------------------------------------
create table if not exists public.spend_guards (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  external_campaign_id text,

  daily_cap_micros    bigint,
  lifetime_cap_micros bigint,
  currency      text not null,

  created_at    timestamptz not null default now()
);

alter table public.spend_guards drop constraint if exists spend_guards_cap_check;
alter table public.spend_guards
  add constraint spend_guards_cap_check check (
    (daily_cap_micros is null or daily_cap_micros >= 0)
    and (lifetime_cap_micros is null or lifetime_cap_micros >= 0)
    and (daily_cap_micros is not null or lifetime_cap_micros is not null)
  );

create index if not exists spend_guards_brand_idx
  on public.spend_guards (brand_id, created_at desc);

create index if not exists spend_guards_campaign_idx
  on public.spend_guards (external_campaign_id) where external_campaign_id is not null;


-- ----------------------------------------------------------------------------
-- 3) Guard events.
--
--    This is an audit trail, not the source of truth for caps. Repeated would_pause rows
--    are allowed: they prove the guard kept firing while the platform remained over cap.
-- ----------------------------------------------------------------------------
create table if not exists public.guard_events (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  served_ad_id  uuid references public.served_ads(id) on delete set null,

  action        text not null,                    -- paused | would_pause | cap_raised
  observed_spend_micros bigint,
  cap_micros    bigint,
  detail        jsonb,

  created_at    timestamptz not null default now()
);

alter table public.guard_events drop constraint if exists guard_events_action_check;
alter table public.guard_events
  add constraint guard_events_action_check
  check (action in ('paused','would_pause','cap_raised'));

alter table public.guard_events drop constraint if exists guard_events_amount_check;
alter table public.guard_events
  add constraint guard_events_amount_check check (
    (observed_spend_micros is null or observed_spend_micros >= 0)
    and (cap_micros is null or cap_micros >= 0)
  );

create index if not exists guard_events_brand_idx
  on public.guard_events (brand_id, created_at desc);

create index if not exists guard_events_served_ad_idx
  on public.guard_events (served_ad_id, created_at desc) where served_ad_id is not null;


-- ----------------------------------------------------------------------------
-- 4) RLS: SELECT only through brand_members.
-- ----------------------------------------------------------------------------
alter table public.serve_jobs enable row level security;
alter table public.spend_guards enable row level security;
alter table public.guard_events enable row level security;

drop policy if exists "members read their serve jobs" on public.serve_jobs;
create policy "members read their serve jobs"
  on public.serve_jobs for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = serve_jobs.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read their spend guards" on public.spend_guards;
create policy "members read their spend guards"
  on public.spend_guards for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = spend_guards.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read their guard events" on public.guard_events;
create policy "members read their guard events"
  on public.guard_events for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = guard_events.brand_id
        and m.user_id = (select auth.uid())
    )
  );
