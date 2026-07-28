-- ============================================================================
-- Soma — batches: the concierge delivery loop.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from
-- any state. Paste into Supabase SQL Editor → Run, or apply via your runner.
-- migration 0003 — schema v3 — last changed 2026-07-27
--
-- WHAT THIS ADDS, and why it is a table rather than more columns on `uploads`.
--
-- `uploads` (0001) is a one-off intake queue: one row per file, no grouping, no
-- result, no way for the person who sent it to see anything back. That is the
-- right shape for the landing page's single-MP4 dialog and it keeps working
-- exactly as it did.
--
-- A SCORED BATCH IS A DIFFERENT OBJECT. demo/process_batch.py ranks ads
-- *within one batch* — every component is a percentile against the other ads in
-- the same run — so the batch, not the file, is the unit that has a manifest, a
-- status, a result, and an address. Hence: one `batches` row, N `uploads` rows
-- pointing at it.
--
-- THE MANIFEST IS STORED IN THE PIPELINE'S OWN FORMAT. `manifest` holds exactly
-- the JSON demo/process_batch.py reads from disk (see demo/manifest.example.json
-- and demo/README.md). The runner writes it out verbatim — no mapping layer, no
-- second schema to keep in step. If the pipeline's manifest shape changes, the
-- intake form changes with it and nothing in between has to be found and fixed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) batches — one scored run.
--
--    NO anon policy at all, deliberately, and this differs from `uploads`.
--    `uploads` carries an "anon can queue an upload" INSERT policy that the app
--    does not actually use (it inserts through /api/uploads/complete with the
--    service key). Every write here goes through a server Route Handler holding
--    service_role, which bypasses RLS — so granting anon nothing costs the app
--    nothing and removes a writable surface. RLS stays ENABLED so that posture
--    is enforced rather than merely intended: with RLS on and no policy, anon
--    gets deny-all.
--
--    Reads are by share_token through the server, never by id, and never by the
--    anon key — so the queue cannot be enumerated or scraped.
-- ----------------------------------------------------------------------------
create table if not exists public.batches (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  batch_name    text,

  -- Exactly what demo/process_batch.py expects on disk. Validated at the API
  -- boundary (src/lib/batch.ts), not by a CHECK: the six message fields are a
  -- product contract that will move, and a schema migration is the wrong place
  -- to relearn it every time the form gains a field.
  manifest      jsonb not null,

  status        text not null default 'queued',   -- queued | processing | done | failed

  -- The customer's address for this run. 16 random bytes → 32 hex chars, which
  -- is unguessable at any rate a public endpoint will serve. This is a
  -- capability URL: holding it IS the authorization, which is why there is no
  -- account system and no login on the result page.
  share_token   text not null unique default encode(gen_random_bytes(16), 'hex'),

  -- batch.json, verbatim, exactly as /preflight already renders it. Storing the
  -- artifact rather than parsed columns means the result page and the static
  -- /preflight page render the SAME shape through the SAME components, and a
  -- pipeline that adds a field needs no migration to surface it.
  report        jsonb,

  run_log       text,                              -- the tail of run.log, for diligence
  error         text,                              -- why a failed run failed, in English

  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

-- Idempotent CHECK (no ADD CONSTRAINT IF NOT EXISTS for CHECK → drop then add).
alter table public.batches drop constraint if exists batches_status_check;
alter table public.batches
  add constraint batches_status_check
  check (status in ('queued','processing','done','failed'));

-- A done batch must carry a report, and a failed one must say why. Without this
-- the result page has a fourth state nobody designed: "done, nothing to show."
alter table public.batches drop constraint if exists batches_terminal_check;
alter table public.batches
  add constraint batches_terminal_check
  check (
    (status <> 'done'   or report is not null) and
    (status <> 'failed' or error  is not null)
  );

alter table public.batches enable row level security;
-- (no anon policies → deny-all for the public key; all access is server-side.)

create index if not exists batches_created_idx on public.batches (created_at desc);
create index if not exists batches_status_idx  on public.batches (status, created_at);


-- ----------------------------------------------------------------------------
-- 2) uploads.batch_id — links a file to its run.
--
--    NULLABLE on purpose. A null batch_id is the landing page's one-off intake,
--    which is a real and continuing path, not a legacy one. Non-null means the
--    file is one ad inside a scored batch.
--
--    ON DELETE CASCADE: deleting a batch should not leave orphan rows pointing
--    at an id that no longer exists.
-- ----------------------------------------------------------------------------
alter table public.uploads
  add column if not exists batch_id uuid references public.batches(id) on delete cascade;

-- Which ad this file is inside its batch. Mirrors manifest.ads[].id, so the
-- runner can pair a storage object to a manifest entry without relying on the
-- filename surviving sanitizeName().
alter table public.uploads
  add column if not exists ad_id text;

alter table public.uploads
  add column if not exists ad_title text;

-- One ad id per batch. Two files claiming ad_03 would silently drop one from the
-- manifest and score a batch the customer did not send.
create unique index if not exists uploads_batch_ad_uidx
  on public.uploads (batch_id, ad_id)
  where batch_id is not null;

create index if not exists uploads_batch_idx on public.uploads (batch_id);


-- ----------------------------------------------------------------------------
-- 3) storage — results live in the SAME private `uploads` bucket, under
--    results/<batch_id>/.
--
--    A second bucket would need a second set of policies to keep correct for no
--    benefit: the bucket is already private, already size-capped, and already
--    video-typed. The existing anon INSERT policy is scoped to `queued/%`, so
--    anon still cannot write (or read) anything under results/ — those objects
--    are written by the runner with service_role and served to the customer as
--    short-lived signed URLs minted by the result page.
--
--    Nothing to create here; this comment is the documentation of that decision
--    so the next person does not add a bucket and a policy set they don't need.
-- ----------------------------------------------------------------------------
