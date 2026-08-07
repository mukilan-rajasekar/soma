-- ============================================================================
-- Soma - Campaign briefs, bundled weekly quotes, and renew-until-paused subscriptions.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor -> Run, or apply via your migration runner.
-- migration 0016 - schema v16 - last changed 2026-08-07
--
-- WHY THIS EXISTS.
--
-- Founder decision (Aug 2026, after the Serve expansion): pricing is a single
-- all-inclusive weekly price per campaign - bundled media spend across networks plus a
-- margin (default 20%) on serving costs, renewing weekly until paused. This SUPERSEDES
-- the flat-fee stance recorded in BUILD-PLAN §0.5 and encoded by 0011's
-- brand_fees.media_markup_pct = 0 check. brand_fees is legacy as of this migration: its
-- constraint stands untouched for the old shape, and the new model's margin lives here,
-- on the quote, where the customer saw it. The supersession and its trade-offs are
-- written up in BUILD-PLAN §0.5; this header only records that the decision was made.
--
-- WHAT THIS REFUSES TO DO.
--
-- No authenticated writes (SELECT-only RLS through brand_members, same as 0012-0015).
-- No invoice table and no payment state: a subscription row is scheduling truth, not
-- billing truth. Invoicing anything remains blocked by the PLAN.md licence gate
-- (tools/serve/check_licence_gate.py), and renewals.py refuses to execute while that
-- gate is open.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Briefs: what the advertiser asked for, in their terms.
-- ----------------------------------------------------------------------------
create table if not exists public.campaign_briefs (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  user_id       uuid,

  platforms     text[] not null,
  goal          text not null,                    -- aggressive_conversions | low_cost_testing
  weekly_spend_micros bigint not null,
  currency      text not null default 'USD',
  duration_weeks integer,
  reach_note    text,

  status        text not null default 'draft',    -- draft | quoted | archived
  created_at    timestamptz not null default now()
);

alter table public.campaign_briefs drop constraint if exists campaign_briefs_goal_check;
alter table public.campaign_briefs
  add constraint campaign_briefs_goal_check
  check (goal in ('aggressive_conversions','low_cost_testing'));

alter table public.campaign_briefs drop constraint if exists campaign_briefs_status_check;
alter table public.campaign_briefs
  add constraint campaign_briefs_status_check
  check (status in ('draft','quoted','archived'));

alter table public.campaign_briefs drop constraint if exists campaign_briefs_spend_check;
alter table public.campaign_briefs
  add constraint campaign_briefs_spend_check check (weekly_spend_micros > 0);

alter table public.campaign_briefs drop constraint if exists campaign_briefs_platforms_check;
alter table public.campaign_briefs
  add constraint campaign_briefs_platforms_check check (cardinality(platforms) >= 1);

alter table public.campaign_briefs drop constraint if exists campaign_briefs_duration_check;
alter table public.campaign_briefs
  add constraint campaign_briefs_duration_check
  check (duration_weeks is null or duration_weeks >= 1);

create index if not exists campaign_briefs_brand_idx
  on public.campaign_briefs (brand_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 2) Quotes: the one number, and everything it bundles, frozen at quote time.
--
--    weekly_price_micros = weekly_spend_micros + margin_micros, and the check makes
--    that arithmetic a schema fact rather than an application habit. platform_split and
--    playbook are the pricing engine's outputs (tools/serve/pricing.py is canonical;
--    src/lib/pricing.ts mirrors it and scripts/check-pricing-parity.mts keeps them
--    honest), stored verbatim so a quote can be audited after the constants move.
-- ----------------------------------------------------------------------------
create table if not exists public.campaign_quotes (
  id            uuid primary key default gen_random_uuid(),
  brief_id      uuid not null references public.campaign_briefs(id) on delete cascade,
  brand_id      uuid not null references public.brands(id) on delete cascade,

  weekly_spend_micros bigint not null,
  margin_pct    numeric not null,
  margin_micros bigint not null,
  weekly_price_micros bigint not null,
  currency      text not null default 'USD',

  platform_split jsonb not null,
  playbook      jsonb not null,

  status        text not null default 'quoted',   -- quoted | accepted | expired
  valid_until   date,
  created_at    timestamptz not null default now()
);

alter table public.campaign_quotes drop constraint if exists campaign_quotes_status_check;
alter table public.campaign_quotes
  add constraint campaign_quotes_status_check
  check (status in ('quoted','accepted','expired'));

alter table public.campaign_quotes drop constraint if exists campaign_quotes_margin_check;
alter table public.campaign_quotes
  add constraint campaign_quotes_margin_check
  check (margin_pct >= 0 and margin_pct <= 50);

alter table public.campaign_quotes drop constraint if exists campaign_quotes_price_check;
alter table public.campaign_quotes
  add constraint campaign_quotes_price_check
  check (weekly_price_micros = weekly_spend_micros + margin_micros);

create index if not exists campaign_quotes_brand_idx
  on public.campaign_quotes (brand_id, created_at desc);

create index if not exists campaign_quotes_brief_idx
  on public.campaign_quotes (brief_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 3) Subscriptions: renew weekly until paused.
--
--    Scheduling truth only. current_period_end advances in whole weeks; renewals
--    counts how many times it has. Nothing here says "paid" because nothing may:
--    the licence gate blocks invoicing, and when it resolves, billing state gets its
--    own table with its own audit trail rather than columns bolted on here.
-- ----------------------------------------------------------------------------
create table if not exists public.campaign_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  quote_id      uuid not null references public.campaign_quotes(id) on delete cascade,

  status        text not null default 'active',   -- active | paused | canceled
  weekly_price_micros bigint not null,
  currency      text not null default 'USD',

  current_period_start date not null,
  current_period_end   date not null,
  renewals      integer not null default 0,

  created_at    timestamptz not null default now(),
  paused_at     timestamptz,
  canceled_at   timestamptz
);

alter table public.campaign_subscriptions drop constraint if exists campaign_subscriptions_status_check;
alter table public.campaign_subscriptions
  add constraint campaign_subscriptions_status_check
  check (status in ('active','paused','canceled'));

alter table public.campaign_subscriptions drop constraint if exists campaign_subscriptions_period_check;
alter table public.campaign_subscriptions
  add constraint campaign_subscriptions_period_check
  check (current_period_end > current_period_start);

alter table public.campaign_subscriptions drop constraint if exists campaign_subscriptions_renewals_check;
alter table public.campaign_subscriptions
  add constraint campaign_subscriptions_renewals_check check (renewals >= 0);

create index if not exists campaign_subscriptions_brand_idx
  on public.campaign_subscriptions (brand_id, created_at desc);

create index if not exists campaign_subscriptions_due_idx
  on public.campaign_subscriptions (current_period_end) where status = 'active';


-- ----------------------------------------------------------------------------
-- 4) RLS: SELECT only through brand_members.
-- ----------------------------------------------------------------------------
alter table public.campaign_briefs enable row level security;
alter table public.campaign_quotes enable row level security;
alter table public.campaign_subscriptions enable row level security;

drop policy if exists "members read their campaign briefs" on public.campaign_briefs;
create policy "members read their campaign briefs"
  on public.campaign_briefs for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = campaign_briefs.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read their campaign quotes" on public.campaign_quotes;
create policy "members read their campaign quotes"
  on public.campaign_quotes for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = campaign_quotes.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read their campaign subscriptions" on public.campaign_subscriptions;
create policy "members read their campaign subscriptions"
  on public.campaign_subscriptions for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = campaign_subscriptions.brand_id
        and m.user_id = (select auth.uid())
    )
  );
