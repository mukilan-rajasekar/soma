-- ============================================================================
-- Soma — Supabase backend, migration 0002 (waitlist.source default fix)
-- The live waitlist route always supplies source='landing', but the column and the
-- join_waitlist() RPC still defaulted to 'waitlist.html' — a page that no longer
-- exists in this repo, so any direct/service-role insert that omitted source recorded
-- misleading provenance. Converge the default to 'landing'.
-- Idempotent. Safe to re-run. Does NOT rewrite existing rows (only the default for
-- future inserts). Paste into Supabase SQL Editor → Run, or apply via your runner.
-- migration 0002 — schema v1.1 — last changed 2026-07-23
-- ============================================================================

-- 1) Column default for future inserts that omit `source`.
alter table public.waitlist alter column source set default 'landing';

-- 2) join_waitlist RPC — same default + coalesce fallback. CREATE OR REPLACE keeps
--    existing privileges, but re-assert the revoke/grant to stay idempotent from any
--    state (mirrors 0001). Body is otherwise identical to 0001's function.
create or replace function public.join_waitlist(
  email      text,
  company    text default null,
  source     text default 'landing',
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
    coalesce(join_waitlist.source, 'landing'),
    join_waitlist.user_agent
  )
  on conflict (email) do nothing;
end;
$$;

revoke all on function public.join_waitlist(text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text) to anon;
