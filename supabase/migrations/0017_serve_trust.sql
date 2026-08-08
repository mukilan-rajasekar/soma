-- ============================================================================
-- Soma - Trust surfaces: serve reports and advisory action approvals.
-- Idempotent migration. Safe to re-run: converges the DB to this schema from any
-- state. Paste into Supabase SQL Editor -> Run, or apply via your migration runner.
-- migration 0017 - schema v17 - last changed 2026-08-07
--
-- WHY THIS EXISTS.
--
-- The autopilot (tools/serve/autopilot.py) already writes cycle reports as JSON
-- artifacts on the operator box; client reports, validation runs and spend statements
-- are heading the same way. A trust surface means the customer can read those same
-- artifacts, verbatim, from the dashboard - so serve_reports stores each one as an
-- opaque payload with a kind, and RLS decides who may look. serve_action_approvals
-- lets a brand member record approve/reject on an action the report planned
-- (a pause, an activation referral) - one decision per action per report, by
-- construction (unique index below).
--
-- WHAT THIS REFUSES TO DO.
--
-- No authenticated writes (SELECT-only RLS through brand_members, same as 0012-0016);
-- rows arrive via service_role only - the operator pipeline for reports, the
-- /api/serve/actions route for approvals, after its own membership check. An approval
-- row is an advisory artifact, not a trigger: execution happens through the operator
-- CLI (launch.py / autopilot), never because a row appeared here. A report with
-- brand_id null is operator-internal; the membership EXISTS can never match a null
-- brand_id, so browsers simply never see it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Reports: what the serve pipeline wrote, verbatim.
-- ----------------------------------------------------------------------------
create table if not exists public.serve_reports (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references public.brands(id),

  kind          text not null,                    -- cycle | client_report | validation | spend_statement
  period_label  text,
  payload       jsonb not null,

  created_at    timestamptz not null default now()
);

alter table public.serve_reports drop constraint if exists serve_reports_kind_check;
alter table public.serve_reports
  add constraint serve_reports_kind_check
  check (kind in ('cycle','client_report','validation','spend_statement'));

create index if not exists serve_reports_brand_idx
  on public.serve_reports (brand_id, created_at desc);

create index if not exists serve_reports_kind_idx
  on public.serve_reports (kind, created_at desc);


-- ----------------------------------------------------------------------------
-- 2) Approvals: one advisory decision per planned action per report.
--
--    decided_by is the auth user id, stored plainly rather than as a foreign key into
--    auth.users - an approval must survive an account deletion, because it is part of
--    the audit trail of what the brand told us, not part of the account.
-- ----------------------------------------------------------------------------
create table if not exists public.serve_action_approvals (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.serve_reports(id),

  action_key    text not null,
  decision      text not null,                    -- approved | rejected
  decided_by    uuid not null,

  created_at    timestamptz not null default now()
);

alter table public.serve_action_approvals drop constraint if exists serve_action_approvals_decision_check;
alter table public.serve_action_approvals
  add constraint serve_action_approvals_decision_check
  check (decision in ('approved','rejected'));

-- One decision per action per report. The unique index is the constraint; the
-- /api/serve/actions route surfaces its 23505 as a 409 rather than overwriting.
create unique index if not exists serve_action_approvals_report_action_idx
  on public.serve_action_approvals (report_id, action_key);


-- ----------------------------------------------------------------------------
-- 3) RLS: SELECT only through brand_members.
-- ----------------------------------------------------------------------------
alter table public.serve_reports enable row level security;
alter table public.serve_action_approvals enable row level security;

drop policy if exists "members read their serve reports" on public.serve_reports;
create policy "members read their serve reports"
  on public.serve_reports for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_members m
      where m.brand_id = serve_reports.brand_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "members read approvals on their reports" on public.serve_action_approvals;
create policy "members read approvals on their reports"
  on public.serve_action_approvals for select
  to authenticated
  using (
    exists (
      select 1
      from public.serve_reports r
      join public.brand_members m on m.brand_id = r.brand_id
      where r.id = serve_action_approvals.report_id
        and m.user_id = (select auth.uid())
    )
  );
