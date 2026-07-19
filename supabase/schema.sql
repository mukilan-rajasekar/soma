-- ============================================================================
-- Soma — Supabase schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query →
-- paste this whole file → Run. Safe to re-run (idempotent).
-- schema v1 — last changed 2026-07-18. Re-paste to apply (idempotent). Changelog: supabase/README.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) waitlist — early-access signups from demo/waitlist.html
--    The browser signs up ONLY through the join_waitlist() RPC below — never a
--    direct insert. (A direct anon insert + UNIQUE(email) would leak 201-vs-409,
--    an email-enumeration oracle.) There is also NO anon select policy, so the
--    list can't be read with the public key. Read it from the Supabase dashboard
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

-- A direct anon insert + UNIQUE(email) leaks 201 (new) vs 409 (duplicate) — an
-- email-enumeration oracle for anyone holding the public key. Signups now go through
-- public.join_waitlist() below, which swallows duplicates and always reports success.
-- Drop the legacy insert policy so re-running this file stays idempotent:
drop policy if exists "anon can join waitlist" on public.waitlist;
-- (no anon insert/select/update/delete → writable ONLY via join_waitlist(),
--  readable only with the service_role key.)

-- SECURITY DEFINER RPC — the ONLY way the browser writes a signup. Dedups silently
-- (on conflict do nothing) and returns void, so there is no new-vs-duplicate signal a
-- caller can probe. Args match demo/waitlist.html's joinWaitlist() payload.
create or replace function public.join_waitlist(
  email      text,
  company    text default null,
  source     text default 'waitlist.html',
  user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(join_waitlist.email), '') is null then
    return;                       -- nothing to insert; still report success
  end if;
  insert into public.waitlist (email, company, source, user_agent)
  values (
    lower(btrim(join_waitlist.email)),
    join_waitlist.company,
    coalesce(join_waitlist.source, 'waitlist.html'),
    join_waitlist.user_agent
  )
  on conflict (email) do nothing;
end;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; lock that down and hand it to
-- anon only. (revoke also strips authenticated/service_role — fine today: neither calls
-- this RPC; the pipeline inserts directly with the service_role key.)
revoke all on function public.join_waitlist(text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text) to anon;


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

-- Keep status within the queue lifecycle (defense-in-depth; anon is further pinned to
-- 'queued' below). Idempotent: there is no ADD CONSTRAINT IF NOT EXISTS for CHECK, so
-- drop-then-add.
alter table public.uploads drop constraint if exists uploads_status_check;
alter table public.uploads
  add constraint uploads_status_check
  check (status in ('queued','processing','done','failed'));

alter table public.uploads enable row level security;

drop policy if exists "anon can queue an upload" on public.uploads;
create policy "anon can queue an upload"
  on public.uploads for insert
  to anon
  with check (status = 'queued');
-- anon may only file a QUEUED row (the client omits status, so the column default
-- 'queued' applies and this check passes); it cannot self-mark a row done/processing
-- to hide it from the founder's "status = queued" queue view. (still no select/update/delete.)

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
  set public             = excluded.public,          -- re-assert private (public=false) on re-run
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- anon may only INSERT (upload) into this bucket — no select/list/update/delete,
-- so a visitor can drop a file in but can never read anyone else's upload.
drop policy if exists "anon can upload an ad" on storage.objects;
create policy "anon can upload an ad"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'uploads' and name like 'queued/%');
-- anon may only drop bytes under uploads/queued/ (where the client writes — supabase.js).
-- NOTE: allowed_mime_types matches the client-supplied Content-Type, which is spoofable;
-- real content validation + rate-limiting/CAPTCHA are an infra follow-up (an edge function
-- issuing signed upload URLs), NOT something RLS can enforce. See supabase/README.md.
