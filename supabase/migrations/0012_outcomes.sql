-- ============================================================================
-- Soma — Serve read-only outcomes: frozen predictions beside platform results.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor → Run, or apply via your migration runner.
-- migration 0012 — schema v12 — last changed 2026-08-07
--
-- WHY THESE TABLES EXIST.
--
-- Serve is not allowed to imply "Soma predicts commercial outcomes" until real platform
-- outcomes sit beside the predictions that were frozen at launch. Recomputing a score
-- after a weight change would rewrite what we claim we knew. This schema stores the
-- launch-time prediction in served_ads and every later pull in outcomes.
--
-- WHY OUTCOMES ARE APPEND-ONLY.
--
-- Platform metrics backfill. A re-pull of the same window can legitimately change
-- conversions or spend, so an upsert would erase the measurement history. The current
-- value is a view, not an overwrite.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) What Soma predicted and why this creative got spend.
-- ----------------------------------------------------------------------------
create table if not exists public.served_ads (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,

  batch_id      uuid references public.batches(id) on delete set null,
  ad_id         text,
  edit_cut_id   uuid references public.edit_cuts(id) on delete set null,

  platform      text not null,
  external_ad_account_id text not null,
  external_campaign_id   text,
  external_adset_id      text,
  external_ad_id         text,

  variant_group text,
  generation    integer not null default 1,

  prediction    jsonb not null,
  scorer_version text not null,
  encoder       text not null,
  encoder_rev   text,
  atlas         text,

  assignment    text not null,
  selection_rule        text not null,
  selection_rule_params jsonb not null,
  selection_p           numeric not null check (selection_p > 0 and selection_p <= 1),

  review_status   text,
  review_feedback jsonb,

  launched_at   timestamptz,
  paused_at     timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.served_ads drop constraint if exists served_ads_generation_check;
alter table public.served_ads
  add constraint served_ads_generation_check check (generation >= 1);

alter table public.served_ads drop constraint if exists served_ads_assignment_check;
alter table public.served_ads
  add constraint served_ads_assignment_check check (assignment in ('model', 'random', 'client'));

alter table public.served_ads drop constraint if exists served_ads_selection_rule_check;
alter table public.served_ads
  add constraint served_ads_selection_rule_check
  check (selection_rule in ('softmax_topk', 'epsilon_greedy', 'client'));

alter table public.served_ads drop constraint if exists served_ads_review_status_check;
alter table public.served_ads
  add constraint served_ads_review_status_check
  check (review_status is null or review_status in ('pending', 'approved', 'rejected', 'limited'));

create index if not exists served_ads_brand_idx
  on public.served_ads (brand_id, created_at desc);

create index if not exists served_ads_variant_group_idx
  on public.served_ads (variant_group, created_at desc) where variant_group is not null;

create index if not exists served_ads_batch_ad_idx
  on public.served_ads (batch_id, ad_id) where batch_id is not null and ad_id is not null;

create unique index if not exists served_ads_external_uidx
  on public.served_ads (platform, external_ad_id) where external_ad_id is not null;


-- ----------------------------------------------------------------------------
-- 2) Outcome pulls. Rates are deliberately absent: CTR/CVR/ROAS are query-time divisions.
-- ----------------------------------------------------------------------------
create table if not exists public.outcomes (
  id              uuid primary key default gen_random_uuid(),
  served_ad_id    uuid not null references public.served_ads(id) on delete cascade,

  window_start    date not null,
  window_end      date not null,

  attribution     text,

  impressions     bigint,
  reach           bigint,
  frequency       numeric,
  spend_micros    bigint,
  currency        text,
  clicks          bigint,
  video_p25       bigint,
  video_p50       bigint,
  video_p75       bigint,
  video_p100      bigint,
  thruplays       bigint,
  conversions     bigint,
  conversion_value_micros bigint,

  source          text not null,
  pulled_at       timestamptz not null default now(),
  revision        integer not null default 1,

  raw             jsonb,

  unique (served_ad_id, window_start, window_end, attribution, source, pulled_at)
);

alter table public.outcomes drop constraint if exists outcomes_window_check;
alter table public.outcomes
  add constraint outcomes_window_check check (window_end >= window_start);

alter table public.outcomes drop constraint if exists outcomes_revision_check;
alter table public.outcomes
  add constraint outcomes_revision_check check (revision >= 1);

alter table public.outcomes drop constraint if exists outcomes_nonnegative_check;
alter table public.outcomes
  add constraint outcomes_nonnegative_check check (
    (impressions is null or impressions >= 0)
    and (reach is null or reach >= 0)
    and (frequency is null or frequency >= 0)
    and (spend_micros is null or spend_micros >= 0)
    and (clicks is null or clicks >= 0)
    and (video_p25 is null or video_p25 >= 0)
    and (video_p50 is null or video_p50 >= 0)
    and (video_p75 is null or video_p75 >= 0)
    and (video_p100 is null or video_p100 >= 0)
    and (thruplays is null or thruplays >= 0)
    and (conversions is null or conversions >= 0)
    and (conversion_value_micros is null or conversion_value_micros >= 0)
  );

create index if not exists outcomes_served_ad_idx
  on public.outcomes (served_ad_id, window_start desc, window_end desc, pulled_at desc);

create index if not exists outcomes_source_idx
  on public.outcomes (source, pulled_at desc);

-- The current value is a view so settling curves remain reconstructable from raw rows.
create or replace view public.outcomes_current
with (security_invoker = true)
as
select distinct on (served_ad_id, window_start, window_end, attribution, source) *
  from public.outcomes
 order by served_ad_id, window_start, window_end, attribution, source, pulled_at desc;


-- ----------------------------------------------------------------------------
-- 3) RLS: SELECT only, scoped through brand_members.
-- ----------------------------------------------------------------------------
alter table public.served_ads enable row level security;
alter table public.outcomes enable row level security;

drop policy if exists "members read their served ads" on public.served_ads;
create policy "members read their served ads"
  on public.served_ads for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = served_ads.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read their outcomes" on public.outcomes;
create policy "members read their outcomes"
  on public.outcomes for select
  to authenticated
  using (
    exists (
      select 1
      from public.served_ads s
      join public.brand_members m on m.brand_id = s.brand_id
      where s.id = outcomes.served_ad_id
        and m.user_id = (select auth.uid())
    )
  );
