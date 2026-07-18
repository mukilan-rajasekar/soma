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


-- ----------------------------------------------------------------------------
-- 3) uploads — concierge intake queue for "Upload your own ad" (demo console).
--    The browser (anon key) uploads the video to the private `uploads` storage
--    bucket below, then inserts ONE row here so we have a queue to process.
--    Write-only for anon (no select policy) — the queue can't be scraped with
--    the public key; read it from the dashboard or with the service_role key.
-- ----------------------------------------------------------------------------
create table if not exists public.uploads (
  id            uuid primary key default gen_random_uuid(),
  email         text,
  filename      text,
  size_bytes    bigint,
  content_type  text,
  storage_path  text not null unique,   -- object key in the `uploads` bucket
  note          text,
  status        text not null default 'queued',   -- queued | processing | done | failed
  user_agent    text,
  created_at    timestamptz not null default now()
);

alter table public.uploads enable row level security;

drop policy if exists "anon can queue an upload" on public.uploads;
create policy "anon can queue an upload"
  on public.uploads for insert
  to anon
  with check (true);
-- (no select / update / delete for anon → write-only intake from the browser)

create index if not exists uploads_created_idx on public.uploads (created_at desc);


-- ----------------------------------------------------------------------------
-- 4) storage bucket `uploads` — holds the raw video bytes the demo sends.
--    PRIVATE (public=false): raw ad footage is never publicly listable/readable.
--    The founder reads it server-side with the service_role key to run the
--    pipeline. Size/type caps keep the free tier + abuse in check.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads', 'uploads', false, 157286400,   -- 150 MB
  array['video/mp4','video/quicktime','video/webm','video/x-msvideo','video/x-matroska']
)
on conflict (id) do update
  set file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- anon may only INSERT (upload) into this bucket — no select/list/update/delete,
-- so a visitor can drop a file in but can never read anyone else's upload.
drop policy if exists "anon can upload an ad" on storage.objects;
create policy "anon can upload an ad"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'uploads');
