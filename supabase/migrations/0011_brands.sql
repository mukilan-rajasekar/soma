-- ============================================================================
-- Soma — brands: the advertiser is a company, not a user.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor → Run, or apply via your migration runner.
-- migration 0011 — schema v11 — last changed 2026-08-07
--
-- WHAT THIS ADDS.
--
-- Stage 4 of the full-service plan needs a stable customer identity above auth.users:
-- an advertiser has several people, several scored batches, several edit runs, and soon
-- outcome rows. A single owner uuid cannot represent "the media buyer, the founder and
-- the creative director all see this account", so every sensitive Serve table reads
-- through brand_members.
--
-- WHAT THIS REFUSES TO ADD.
--
-- No direct writes for authenticated users. Creating brands, fee rows and brand-linked
-- runs remains a service_role operation until there is a UI and an approval flow for it.
-- The browser gets SELECT only, enforced by RLS, exactly like migration 0008's dashboard
-- ownership policies.
--
-- No spend-percentage fee. brand_fees records flat fees and the one downward-only holdout
-- rebate term. media_markup_pct exists only to assert zero, because invoicing media at a
-- markup would contradict the full-service positioning.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Brand identity and membership.
--
--    Meta Developer Policy 10.7g requires advertiser data separation. The schema therefore
--    records training consent per brand and never treats membership as an owner shortcut.
-- ----------------------------------------------------------------------------
create table if not exists public.brands (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,

  training_consent        boolean not null default false,
  training_consent_source text,
  training_consent_at     timestamptz,

  created_at    timestamptz not null default now()
);

create table if not exists public.brand_members (
  brand_id      uuid not null references public.brands(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member',
  created_at    timestamptz not null default now(),
  primary key (brand_id, user_id)
);

alter table public.brand_members drop constraint if exists brand_members_role_check;
alter table public.brand_members
  add constraint brand_members_role_check check (role in ('owner', 'member', 'viewer'));

create index if not exists brand_members_user_idx
  on public.brand_members (user_id, created_at desc);

create index if not exists brands_created_idx
  on public.brands (created_at desc);


-- ----------------------------------------------------------------------------
-- 2) Existing run tables get the brand pointer, nullable for the same reason 0008 made
--    user_id nullable: old concierge rows and share-token-only rows must keep working.
-- ----------------------------------------------------------------------------
alter table public.batches
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

alter table public.edit_runs
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists batches_brand_idx
  on public.batches (brand_id, created_at desc) where brand_id is not null;

create index if not exists edit_runs_brand_idx
  on public.edit_runs (brand_id, created_at desc) where brand_id is not null;


-- ----------------------------------------------------------------------------
-- 3) Fees. This table is allowed by schema, but not by the licence gate while PLAN.md
--    gate 4 is open. tools/serve/check_licence_gate.py enforces the fixture side.
-- ----------------------------------------------------------------------------
create table if not exists public.brand_fees (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null references public.brands(id) on delete cascade,
  monthly_platform_fee_micros bigint not null,
  per_asset_fee_micros        bigint not null,
  per_recut_fee_micros        bigint not null,
  media_markup_pct            numeric not null default 0,
  holdout_rebate_pct          numeric not null default 0,
  holdout_gap_g               numeric not null default 0,
  currency              text not null,
  effective_from        date not null,
  msa_reference         text,
  created_at            timestamptz not null default now()
);

alter table public.brand_fees drop constraint if exists brand_fees_no_markup;
alter table public.brand_fees
  add constraint brand_fees_no_markup check (media_markup_pct = 0);

alter table public.brand_fees drop constraint if exists brand_fees_nonnegative_check;
alter table public.brand_fees
  add constraint brand_fees_nonnegative_check check (
    monthly_platform_fee_micros >= 0
    and per_asset_fee_micros >= 0
    and per_recut_fee_micros >= 0
    and holdout_rebate_pct >= 0
    and holdout_gap_g >= 0
  );

create index if not exists brand_fees_brand_idx
  on public.brand_fees (brand_id, effective_from desc);


-- ----------------------------------------------------------------------------
-- 4) RLS: SELECT only, through brand_members.
--
--    The EXISTS shape is repeated instead of hidden in application code so membership is a
--    database boundary. Service_role bypasses these policies for concierge/admin writes.
-- ----------------------------------------------------------------------------
alter table public.brands enable row level security;
alter table public.brand_members enable row level security;
alter table public.brand_fees enable row level security;

drop policy if exists "members read their brands" on public.brands;
create policy "members read their brands"
  on public.brands for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = brands.id
        and m.user_id = (select auth.uid())
    )
  );

-- A self-referential EXISTS policy on brand_members can recurse in Postgres, so this table's
-- read boundary is the row that proves membership. Every other table uses that row.
drop policy if exists "members read their own memberships" on public.brand_members;
create policy "members read their own memberships"
  on public.brand_members for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "members read their brand fees" on public.brand_fees;
create policy "members read their brand fees"
  on public.brand_fees for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = brand_fees.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read their brand batches" on public.batches;
create policy "members read their brand batches"
  on public.batches for select
  to authenticated
  using (
    brand_id is not null
    and exists (
      select 1 from public.brand_members m
      where m.brand_id = batches.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read their brand edit runs" on public.edit_runs;
create policy "members read their brand edit runs"
  on public.edit_runs for select
  to authenticated
  using (
    brand_id is not null
    and exists (
      select 1 from public.brand_members m
      where m.brand_id = edit_runs.brand_id
        and m.user_id = (select auth.uid())
    )
  );
