-- ============================================================================
-- Soma - The holdout rebate, on the table where the margin actually lives.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor -> Run, or apply via your migration runner.
-- migration 0018 - schema v18 - last changed 2026-08-09
--
-- WHY THIS EXISTS.
--
-- STRATEGY-FULL-SERVICE.md §4.6 commits Soma to paying for its own science:
--
--     Rebate = h × F + h × S × g,  capped at F
--
-- with h the holdout fraction, F the period's gross fee, S managed spend, and g the
-- measured proportional gap between score-selected and randomly-assigned arms. Under
-- the §4.2 bundled weekly price F = margin_micros and S = weekly_spend_micros, so the
-- rule reads h × S × (0.20 + g) capped at the week's whole margin.
--
-- Both parameters had columns only on brand_fees (holdout_rebate_pct, holdout_gap_g) -
-- the flat-fee table migration 0016 superseded, and whose media_markup_pct = 0 check
-- forbids the very model that shipped. campaign_quotes carried no rebate representation
-- at all, so the rebate existed in prose and in a legacy table and nowhere a quote could
-- reach. This migration puts it where the margin is.
--
-- §4.7's rule is the reason both parameters get their own column: "both rebate
-- parameters stored, h and g, not a single rebate percentage. §4.6's rule has two terms;
-- one column cannot compute it, and the failure is silent: the invoice is simply wrong
-- in Soma's favour the moment g stops being zero."
--
-- WHY rebate_micros IS STORED RATHER THAN DERIVED.
--
-- It is derivable from h, g and the quote - and it is stored anyway, with a check that
-- re-derives it. A rebate is a number the client was told; recomputing it later from
-- constants that have since moved would silently restate history. The check makes
-- agreement a schema fact at write time, exactly as 0016 does for the price identity.
--
-- WHAT THIS REFUSES TO DO.
--
-- No authenticated writes (SELECT-only RLS through brand_members, same as 0012-0017).
-- No invoice table and no payment state: this records what a rebate WOULD be, and
-- invoicing anything stays blocked by the PLAN.md licence gate
-- (tools/serve/check_licence_gate.py). A rebate row is not a credit note.
--
-- g DEFAULTS TO ZERO AND THAT IS A CLAIM, NOT A PLACEHOLDER. §4.6: g is zero because
-- Soma cannot demonstrate that score-selected arms outperform random ones - the three
-- backtests in §1.2 failed to find it. A non-zero g must trace to a dated calibration
-- artifact, which is why calibration_ref exists and why the check below requires it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) The rebate, one row per quote per period.
-- ----------------------------------------------------------------------------
create table if not exists public.campaign_holdout_rebates (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references public.campaign_quotes(id) on delete cascade,
  brand_id      uuid not null references public.brands(id) on delete cascade,

  period        text not null,                     -- e.g. 2026-W32, matches spend_statement

  -- §4.6 parameters, stored separately. h is the realised holdout fraction of spend for
  -- the period, not the planned one: serve_experiments.holdout_pct is the plan, and a
  -- rebate owed is computed from what actually ran.
  holdout_fraction_h numeric not null,
  holdout_gap_g      numeric not null default 0,
  calibration_ref    text,                         -- dated artifact backing a non-zero g

  -- The two terms, kept apart so an invoice can show its work.
  margin_waiver_micros bigint not null,            -- h × F
  gap_term_micros      bigint not null default 0,  -- h × S × g
  rebate_micros        bigint not null,            -- min(sum, F)
  capped               boolean not null default false,

  currency      text not null default 'USD',
  created_at    timestamptz not null default now()
);

-- One rebate per quote per period. A second row for the same week is a restatement,
-- and a restatement must replace rather than accumulate.
create unique index if not exists campaign_holdout_rebates_quote_period_idx
  on public.campaign_holdout_rebates (quote_id, period);

create index if not exists campaign_holdout_rebates_brand_idx
  on public.campaign_holdout_rebates (brand_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 2) Constraints: the rule, in the schema.
-- ----------------------------------------------------------------------------

-- h is a fraction of spend. 1.0 would mean the entire week is a control arm, which is
-- an experiment rather than a campaign - excluded, matching 0015's holdout_pct check.
alter table public.campaign_holdout_rebates
  drop constraint if exists campaign_holdout_rebates_h_check;
alter table public.campaign_holdout_rebates
  add constraint campaign_holdout_rebates_h_check
  check (holdout_fraction_h >= 0 and holdout_fraction_h < 1);

-- g is a proportional performance gap and cannot be negative: a negative g would mean
-- the random arm beat the score-selected one, which is a finding to publish, not a
-- charge to levy. §4.6's term can only ever reduce Soma's fee.
alter table public.campaign_holdout_rebates
  drop constraint if exists campaign_holdout_rebates_g_check;
alter table public.campaign_holdout_rebates
  add constraint campaign_holdout_rebates_g_check
  check (holdout_gap_g >= 0);

-- A non-zero g must name the dated artifact it came from. This is the committed control
-- on the residual conflict §4.6 names: Soma has a financial reason to under-report g,
-- so g may not be a number someone typed.
alter table public.campaign_holdout_rebates
  drop constraint if exists campaign_holdout_rebates_g_provenance_check;
alter table public.campaign_holdout_rebates
  add constraint campaign_holdout_rebates_g_provenance_check
  check (holdout_gap_g = 0 or (calibration_ref is not null and length(calibration_ref) > 0));

alter table public.campaign_holdout_rebates
  drop constraint if exists campaign_holdout_rebates_nonneg_check;
alter table public.campaign_holdout_rebates
  add constraint campaign_holdout_rebates_nonneg_check
  check (
    margin_waiver_micros >= 0
    and gap_term_micros >= 0
    and rebate_micros >= 0
  );

-- The rebate is the capped sum of its two terms, and `capped` agrees with the
-- arithmetic. Stated as one check so a row cannot claim a cap that did not bind.
alter table public.campaign_holdout_rebates
  drop constraint if exists campaign_holdout_rebates_sum_check;
alter table public.campaign_holdout_rebates
  add constraint campaign_holdout_rebates_sum_check
  check (
    (capped and rebate_micros < margin_waiver_micros + gap_term_micros)
    or (not capped and rebate_micros = margin_waiver_micros + gap_term_micros)
  );

-- ----------------------------------------------------------------------------
-- 3) The cap is the quote's own margin: a rebate can zero the fee, never invert it.
--    §4.6: "capped at F, so in the worst case Soma works the month for nothing; it can
--    never make the month cost the client more."
-- ----------------------------------------------------------------------------
create or replace function public.campaign_holdout_rebate_within_margin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_margin bigint;
begin
  select margin_micros into quote_margin
    from public.campaign_quotes
   where id = new.quote_id;

  if quote_margin is null then
    raise exception 'quote % not found; a rebate cannot precede its quote', new.quote_id;
  end if;

  if new.rebate_micros > quote_margin then
    raise exception
      'rebate % exceeds the quote margin % - §4.6 caps the rebate at F',
      new.rebate_micros, quote_margin;
  end if;

  if new.margin_waiver_micros > quote_margin then
    raise exception
      'margin waiver % exceeds the quote margin %', new.margin_waiver_micros, quote_margin;
  end if;

  return new;
end;
$$;

drop trigger if exists campaign_holdout_rebates_cap on public.campaign_holdout_rebates;
create trigger campaign_holdout_rebates_cap
  before insert or update on public.campaign_holdout_rebates
  for each row execute function public.campaign_holdout_rebate_within_margin();

-- ----------------------------------------------------------------------------
-- 4) RLS: SELECT only through brand_members, same as 0012-0017.
--    The client can read what they are owed. Nobody writes from the browser.
-- ----------------------------------------------------------------------------
alter table public.campaign_holdout_rebates enable row level security;

drop policy if exists "members read their holdout rebates" on public.campaign_holdout_rebates;
create policy "members read their holdout rebates"
  on public.campaign_holdout_rebates for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = campaign_holdout_rebates.brand_id
        and m.user_id = (select auth.uid())
    )
  );
