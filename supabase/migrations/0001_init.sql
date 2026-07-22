-- ============================================================================
-- Soma — Supabase backend (waitlist + arcs + uploads intake + storage bucket)
-- Idempotent migration. Safe to re-run: converges the DB to this schema from
-- any state. Paste into Supabase SQL Editor → Run, or apply via your migration
-- runner. Bump the version line + log a changelog row on every change.
-- migration 0001 — schema v1 — last changed 2026-07-18
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) waitlist — early-access signups.
--    Browser writes ONLY through join_waitlist() (never a direct insert): a
--    direct anon insert + UNIQUE(email) leaks 201-vs-409, an email-enumeration
--    oracle. No anon SELECT → list is unreadable with the public key.
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

-- Drop the legacy direct-insert policy so re-running stays idempotent.
drop policy if exists "anon can join waitlist" on public.waitlist;
-- (no anon insert/select/update/delete → writable ONLY via join_waitlist(),
--  readable only with the service_role key.)

-- SECURITY DEFINER RPC — the ONLY way the browser writes a signup. Dedups
-- silently (on conflict do nothing) and returns void, so there is no
-- new-vs-duplicate signal a caller can probe.
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

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; lock down and hand to anon.
revoke all on function public.join_waitlist(text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text) to anon;


-- ----------------------------------------------------------------------------
-- 2) arcs — stored ad-analysis results. Public READ (is_public = true);
--    WRITES require the service_role key (pipeline, server-side).
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
-- (no insert/update policy for anon → only the service_role key can write.)

create index if not exists arcs_created_idx on public.arcs (created_at desc);


-- ----------------------------------------------------------------------------
-- 3) uploads — concierge intake queue ("Upload your own ad").
--    Write-only for anon (no select) — the queue can't be scraped with the
--    public key. anon may only file a QUEUED row.
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

-- Keep status within the queue lifecycle. No ADD CONSTRAINT IF NOT EXISTS for
-- CHECK, so drop-then-add for idempotency.
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
-- anon may only file a QUEUED row (client omits status → default 'queued'
-- applies → check passes). Cannot self-mark done/processing. No select/update/delete.

create index if not exists uploads_created_idx on public.uploads (created_at desc);


-- ----------------------------------------------------------------------------
-- 4) storage bucket `uploads` — raw video bytes. PRIVATE (public=false).
--    150 MB cap, video mime-types only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads', 'uploads', false, 157286400,   -- 150 MB
  array['video/mp4','video/quicktime','video/webm','video/x-msvideo','video/x-matroska']
)
on conflict (id) do update
  set public             = excluded.public,          -- re-assert private on re-run
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- anon may only INSERT (upload) under uploads/queued/ — no select/list/update/delete.
drop policy if exists "anon can upload an ad" on storage.objects;
create policy "anon can upload an ad"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'uploads' and name like 'queued/%');
-- NOTE: allowed_mime_types matches the client-supplied Content-Type (spoofable);
-- real content validation + rate-limiting are an infra follow-up, NOT RLS.
