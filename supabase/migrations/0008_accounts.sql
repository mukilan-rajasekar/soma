-- ============================================================================
-- Soma — accounts: give every run an owner, without breaking the share links.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor → Run, or apply via your migration runner.
-- migration 0008 — schema v8 — last changed 2026-08-06
--
-- WHAT THIS ADDS, AND WHAT IT REFUSES TO CHANGE.
--
-- Until now identity was two things, neither of them a person: a free-text `email`
-- column that nothing verified, and a 32-hex `share_token` that anyone holding could
-- read. That was the right shape for a concierge product where a human hands someone a
-- link (migration 0003 argues the case at length, and the argument still holds).
--
-- It cannot answer "show me my previous runs", because there is no `me`. This migration
-- adds one: a nullable `user_id` referencing auth.users on every run-shaped table.
--
-- NULLABLE IS THE WHOLE DESIGN, not a shortcut.
--   * Every row that exists today has no owner. A NOT NULL column would need a
--     back-fill that invents one, and inventing an owner for a customer's unreleased
--     creative is worse than leaving it unowned.
--   * The concierge path still creates batches for people who have never signed in.
--     That is a supported flow, not a legacy one.
--   * A NULL owner means exactly one thing: "reachable only by its share token."
--     Which is precisely how the product behaved before this file existed.
--
-- SO THERE ARE TWO ADDRESSES FOR ONE RUN, on purpose:
--   /r/<share_token>   capability URL. No session. Unchanged, still service_role,
--                      still the link you send to a colleague who has no account.
--   /dashboard         session. Lists the rows where user_id = auth.uid().
-- Adding the second does not weaken the first, and removing an owner does not break a
-- link that was already sent.
--
-- WHY RLS POLICIES AT ALL, when every Route Handler currently uses service_role and
-- bypasses them. Because the dashboard does not: it reads through a cookie-scoped client
-- (src/lib/supabase/session.ts) where auth.uid() is a real value. These policies are what
-- make "your runs are yours" a database guarantee rather than a WHERE clause someone can
-- forget to write. The service_role paths are unaffected — that key bypasses RLS by
-- definition, which is why /r/<token> keeps working for signed-out visitors.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ownership columns.
--
--    ON DELETE SET NULL, not CASCADE. Deleting an account must not destroy the
--    scored artifacts: the share links that were already handed out keep working,
--    and the row degrades to exactly the unowned state every pre-0008 row is in.
--    CASCADE here would make "delete my login" silently mean "delete a customer's
--    delivered report", which is not what anyone pressing that button intends.
-- ----------------------------------------------------------------------------
alter table public.batches
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.uploads
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.edit_runs
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.generation_runs
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- The dashboard's only query shape: "my rows, newest first." Partial, because the
-- rows this index exists to serve are by definition the ones with an owner, and the
-- unowned concierge backlog should not be paying for the index.
create index if not exists batches_user_idx
  on public.batches (user_id, created_at desc) where user_id is not null;

create index if not exists uploads_user_idx
  on public.uploads (user_id, created_at desc) where user_id is not null;

create index if not exists edit_runs_user_idx
  on public.edit_runs (user_id, created_at desc) where user_id is not null;

create index if not exists generation_runs_user_idx
  on public.generation_runs (user_id, created_at desc) where user_id is not null;


-- ----------------------------------------------------------------------------
-- 2) Read policies for the signed-in user.
--
--    SELECT ONLY, and that is not an oversight. Creating a run means spending minutes
--    of a GPU box, so it goes through a Route Handler that validates a brief, checks
--    every storage object exists, and builds the pipeline manifest itself
--    (src/app/api/batches/create/route.ts). Handing `authenticated` a direct INSERT
--    would route around all of it and let a caller write a manifest the Python
--    executes. Writes stay server-side with service_role.
--
--    `user_id is not null` is restated in every USING clause even though auth.uid()
--    is never null for the `authenticated` role, because a policy that reads
--    `user_id = auth.uid()` would match every unowned row the moment anything grants
--    this role to an unauthenticated context.
-- ----------------------------------------------------------------------------
drop policy if exists "owners read their batches" on public.batches;
create policy "owners read their batches"
  on public.batches for select
  to authenticated
  using (user_id is not null and user_id = (select auth.uid()));

drop policy if exists "owners read their uploads" on public.uploads;
create policy "owners read their uploads"
  on public.uploads for select
  to authenticated
  using (user_id is not null and user_id = (select auth.uid()));

drop policy if exists "owners read their edit runs" on public.edit_runs;
create policy "owners read their edit runs"
  on public.edit_runs for select
  to authenticated
  using (user_id is not null and user_id = (select auth.uid()));

drop policy if exists "owners read their generation runs" on public.generation_runs;
create policy "owners read their generation runs"
  on public.generation_runs for select
  to authenticated
  using (user_id is not null and user_id = (select auth.uid()));


-- ----------------------------------------------------------------------------
-- 3) edit_cuts — the rendered re-cuts, which until now did not survive their own run.
--
--    THE BUG THIS TABLE FIXES. tools/edit/search.py renders real mp4s into --out-dir.
--    src/lib/edit-runner.ts pointed --out-dir at an mkdtemp() and rm -rf'd it in a
--    `finally` immediately after reading the JSON. So every edit run produced actual
--    edited video and then deleted it, and `edit_runs.result.rendered[].file` recorded
--    absolute paths on a machine, to files that no longer existed. /e/<token> could
--    only ever show numbers, which is why the edit product had no video in it.
--
--    One row per delivered cut, with the storage key of the mp4 that a person can
--    actually press play on.
--
--    `measured` is the honesty bit and it is NOT decoration: false means the delta
--    beside it is an estimate re-sliced off the unedited arc, true means the rendered
--    file was run back through the encoder. tools/edit/ops.py refuses to set it and
--    only the verify stage may. The UI must label the two differently.
-- ----------------------------------------------------------------------------
create table if not exists public.edit_cuts (
  id            uuid primary key default gen_random_uuid(),
  edit_run_id   uuid not null references public.edit_runs(id) on delete cascade,

  -- Rank within the run, 1-based. The order the search returned them in.
  position      integer not null,

  kind          text not null,                    -- remove | remove_pair | hoist | trim_head
  label         text not null,                    -- the edit in words, from Candidate.label
  confidence    text not null default 'estimate',  -- estimate | weak estimate

  -- Object keys in the private `uploads` bucket, under edits/<edit_run_id>/.
  -- Keys and not URLs, for the same reason batches.report stores keys: the bucket is
  -- private, so any URL is stale the moment it is written. Signed per request at render.
  storage_path  text not null,
  poster_path   text,

  duration_s    numeric,
  est_score     numeric,
  est_delta     numeric,

  -- False until the rendered file has been through the encoder. See the note above.
  measured      boolean not null default false,

  created_at    timestamptz not null default now()
);

alter table public.edit_cuts drop constraint if exists edit_cuts_position_check;
alter table public.edit_cuts
  add constraint edit_cuts_position_check check (position >= 1);

-- One cut per position per run. A retry that re-inserts without clearing would
-- otherwise silently double the filmstrip.
create unique index if not exists edit_cuts_run_position_uidx
  on public.edit_cuts (edit_run_id, position);

create index if not exists edit_cuts_run_idx on public.edit_cuts (edit_run_id);

alter table public.edit_cuts enable row level security;

-- Ownership is inherited from the run rather than duplicated onto every cut: one
-- owner column, one place to be wrong. The EXISTS re-uses the edit_runs policy shape.
drop policy if exists "owners read their edit cuts" on public.edit_cuts;
create policy "owners read their edit cuts"
  on public.edit_cuts for select
  to authenticated
  using (
    exists (
      select 1 from public.edit_runs r
      where r.id = edit_cuts.edit_run_id
        and r.user_id is not null
        and r.user_id = (select auth.uid())
    )
  );


-- ----------------------------------------------------------------------------
-- 4) Storage: rendered cuts live beside the footage they came from.
--
--    Same private `uploads` bucket, under edits/<edit_run_id>/, for the reason 0003
--    gives for results/: the bucket is already private, already size-capped, and 0007
--    already widened its MIME list to cover the poster frames the renderer emits. A
--    second bucket would be a second policy set to keep correct for no benefit.
--
--    anon's only policy on storage.objects is scoped to `queued/%`, so nothing here is
--    readable or writable with the public key. The renderer writes with service_role;
--    the dashboard hands out short-lived signed URLs.
--
--    Nothing to create. This comment is the decision, written down.
-- ----------------------------------------------------------------------------
