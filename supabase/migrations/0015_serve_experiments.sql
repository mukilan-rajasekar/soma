-- ============================================================================
-- Soma - Serve experiments: A/B splits with a budget plan and an audit trail.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor -> Run, or apply via your migration runner.
-- migration 0015 - schema v15 - last changed 2026-08-07
--
-- WHY THIS EXISTS.
--
-- "Serve and test" needs a first-class record of what was tested against what. An
-- experiment is a named budget split across served ads; the platform delivers each arm
-- and the outcomes table scores them. Without this table an A/B test is a naming
-- convention in campaign titles, which is how tests silently stop being tests.
--
-- WHAT THIS REFUSES TO DO.
--
-- No authenticated writes (same boundary as 0012/0014: server code and service_role
-- only; browsers get SELECT through brand_members). No winner column: a winner is a
-- computed claim with thresholds, and it lives in tools/serve/ab.py output artifacts,
-- not in a mutable cell someone can set by hand.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Experiments.
-- ----------------------------------------------------------------------------
create table if not exists public.serve_experiments (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,

  name          text not null,
  hypothesis    text,
  platform      text not null,                    -- meta | tiktok
  status        text not null default 'draft',    -- draft | running | stopped

  daily_budget_micros bigint not null,
  currency      text not null,
  holdout_pct   numeric not null default 0,

  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  stopped_at    timestamptz
);

alter table public.serve_experiments drop constraint if exists serve_experiments_platform_check;
alter table public.serve_experiments
  add constraint serve_experiments_platform_check
  check (platform in ('meta','tiktok'));

alter table public.serve_experiments drop constraint if exists serve_experiments_status_check;
alter table public.serve_experiments
  add constraint serve_experiments_status_check
  check (status in ('draft','running','stopped'));

alter table public.serve_experiments drop constraint if exists serve_experiments_budget_check;
alter table public.serve_experiments
  add constraint serve_experiments_budget_check check (daily_budget_micros > 0);

alter table public.serve_experiments drop constraint if exists serve_experiments_holdout_check;
alter table public.serve_experiments
  add constraint serve_experiments_holdout_check
  check (holdout_pct >= 0 and holdout_pct < 1);

create index if not exists serve_experiments_brand_idx
  on public.serve_experiments (brand_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 2) Arms.
--
--    budget_share is the planned fraction of the post-holdout budget; the integer
--    micros actually sent to the platform come from tools/serve/ab.py plan output,
--    which owns the rounding. external_adset_id is the platform object that carries
--    the split (Meta ad set / TikTok ad group), recorded after create.
-- ----------------------------------------------------------------------------
create table if not exists public.serve_experiment_arms (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.serve_experiments(id) on delete cascade,
  served_ad_id  uuid not null references public.served_ads(id) on delete cascade,

  arm_key       text not null,
  is_control    boolean not null default false,
  budget_share  numeric not null,
  external_adset_id text,

  created_at    timestamptz not null default now()
);

alter table public.serve_experiment_arms drop constraint if exists serve_experiment_arms_share_check;
alter table public.serve_experiment_arms
  add constraint serve_experiment_arms_share_check
  check (budget_share > 0 and budget_share <= 1);

create unique index if not exists serve_experiment_arms_key_uniq
  on public.serve_experiment_arms (experiment_id, arm_key);

create unique index if not exists serve_experiment_arms_ad_uniq
  on public.serve_experiment_arms (experiment_id, served_ad_id);

-- One control per experiment. Zero is allowed (a draft may not have picked one yet);
-- two is a contradiction.
create unique index if not exists serve_experiment_arms_control_uniq
  on public.serve_experiment_arms (experiment_id) where is_control;

create index if not exists serve_experiment_arms_experiment_idx
  on public.serve_experiment_arms (experiment_id, created_at);


-- ----------------------------------------------------------------------------
-- 3) RLS: SELECT only through brand_members.
-- ----------------------------------------------------------------------------
alter table public.serve_experiments enable row level security;
alter table public.serve_experiment_arms enable row level security;

drop policy if exists "members read their experiments" on public.serve_experiments;
create policy "members read their experiments"
  on public.serve_experiments for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = serve_experiments.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read their experiment arms" on public.serve_experiment_arms;
create policy "members read their experiment arms"
  on public.serve_experiment_arms for select
  to authenticated
  using (
    exists (
      select 1 from public.serve_experiments e
      join public.brand_members m on m.brand_id = e.brand_id
      where e.id = serve_experiment_arms.experiment_id
        and m.user_id = (select auth.uid())
    )
  );
