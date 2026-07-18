-- ============================================================================
-- Soma — Supabase schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query →
-- paste this whole file → Run. Safe to re-run (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) waitlist — early-access signups from demo/waitlist.html
--    The browser uses the public "anon" key, which can ONLY insert here.
--    There is deliberately NO select policy for anon, so the email list can
--    never be scraped with the public key. Read it from the Supabase dashboard
--    (Table editor) or with the service_role key server-side.
-- ----------------------------------------------------------------------------
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  company     text,
  source      text default 'waitlist.html',
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist"
  on public.waitlist for insert
  to anon
  with check (true);
-- (no select / update / delete policy for anon → write-only from the browser)


-- ----------------------------------------------------------------------------
-- 2) arcs — stored ad-analysis results (predicted per-second arcs), shared
--    across the team. Public READ so the demo can fetch them; WRITES require
--    the service_role key (used server-side by the pipeline), never the
--    browser's anon key.
-- ----------------------------------------------------------------------------
create table if not exists public.arcs (
  id          uuid primary key default gen_random_uuid(),
  ad_id       text not null unique,
  title       text,
  arc         jsonb not null,          -- per-second arc: attention / valence / arousal / callouts
  meta        jsonb,                   -- model, dataset, run id, evidence tier, etc.
  is_public   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.arcs enable row level security;

drop policy if exists "public can read arcs" on public.arcs;
create policy "public can read arcs"
  on public.arcs for select
  to anon
  using (is_public = true);
-- (no insert / update policy for anon → only the service_role key, used
--  server-side by the pipeline, can write. service_role bypasses RLS.)

create index if not exists arcs_created_idx on public.arcs (created_at desc);
