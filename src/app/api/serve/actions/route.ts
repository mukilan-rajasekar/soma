// POST /api/serve/actions
//
// Records one advisory decision — approved or rejected — on one planned action from a
// serve report. Advisory is the whole design: migration 0017 makes serve_reports and
// serve_action_approvals SELECT-only for browsers, and this route is the single door an
// approval row enters through. Nothing downstream watches this table for triggers;
// execution happens through the operator CLI (launch.py / autopilot), never because a
// row appeared here.
//
// WHO MAY DECIDE. The caller must be signed in and a member of the report's brand. The
// check runs on the service client — read the report, then look for the caller in
// brand_members — because the insert itself needs service_role (there is no INSERT
// policy, deliberately). A report the caller cannot decide on is answered "report not
// found", indistinguishable from one that does not exist, same posture as the quote
// route's brand check. A brand_id-null report is operator-internal: no membership can
// match it, so it 404s for everyone.
//
// ONE DECISION PER ACTION. The unique index on (report_id, action_key) is the law here;
// a duplicate insert comes back as Postgres 23505 and leaves the first decision
// standing. That surfaces as a 409 — changing a recorded decision is an operator
// conversation, not a second click.

import { serviceClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/supabase/session";

type Incoming = {
  reportId?: unknown;
  actionKey?: unknown;
  decision?: unknown;
};

type ApprovalRow = {
  id: string;
  report_id: string;
  action_key: string;
  decision: string;
  decided_by: string;
  created_at: string;
};

export async function GET() {
  return Response.json(
    { error: "Use POST. Approvals are recorded here; they are read through the dashboard loaders." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(request: Request) {
  // An approval is a named person's decision, so an anonymous request has nothing this
  // route could legitimately do with it.
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Sign in to record a decision." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Incoming;
  const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
  const actionKey = typeof body.actionKey === "string" ? body.actionKey.trim() : "";
  const decision = typeof body.decision === "string" ? body.decision : "";

  if (!reportId || !actionKey) {
    return Response.json({ error: "reportId and actionKey are required." }, { status: 400 });
  }
  // The schema check would reject anything else anyway; failing here keeps the error a
  // sentence instead of a constraint name.
  if (decision !== "approved" && decision !== "rejected") {
    return Response.json(
      { error: "decision must be 'approved' or 'rejected'." },
      { status: 400 },
    );
  }

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Approvals are not configured." }, { status: 500 });
  }

  // ── the report, and whether it is theirs ─────────────────────────────────────
  // A malformed uuid errors inside Postgres rather than in application code; that error
  // collapses into the same "report not found" as a missing row, which is the point.
  const { data: report, error: reportError } = await supabase
    .from("serve_reports")
    .select("id, brand_id")
    .eq("id", reportId)
    .maybeSingle();

  const brandId = (report as { id: string; brand_id: string | null } | null)?.brand_id ?? null;
  if (reportError || !report || !brandId) {
    return Response.json({ error: "report not found" }, { status: 404 });
  }

  const { data: membership, error: memberError } = await supabase
    .from("brand_members")
    .select("brand_id")
    .eq("brand_id", brandId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !membership) {
    return Response.json({ error: "report not found" }, { status: 404 });
  }

  // ── the decision ─────────────────────────────────────────────────────────────
  const { data: row, error } = await supabase
    .from("serve_action_approvals")
    .insert({
      report_id: reportId,
      action_key: actionKey,
      decision,
      decided_by: user.id,
    })
    .select("id, report_id, action_key, decision, decided_by, created_at")
    .single();

  if (error || !row) {
    if (error?.code === "23505") {
      return Response.json(
        {
          error:
            "This action already has a recorded decision for this report. The first decision stands — refresh to see it.",
        },
        { status: 409 },
      );
    }
    return Response.json({ error: "Could not record this decision." }, { status: 500 });
  }

  const saved = row as ApprovalRow;
  return Response.json({
    ok: true,
    approval: {
      id: saved.id,
      reportId: saved.report_id,
      actionKey: saved.action_key,
      decision: saved.decision,
      decidedBy: saved.decided_by,
      createdAt: saved.created_at,
    },
  });
}
