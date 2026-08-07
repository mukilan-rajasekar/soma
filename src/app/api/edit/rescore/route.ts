import { acquireRunSlot, betaAccessDenied } from "@/lib/beta-gate";
import { serviceClient } from "@/lib/supabase/server";
import { currentUser, sessionClient } from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Incoming = {
  editRunId?: unknown;
  batchId?: unknown;
  adId?: unknown;
  cutIds?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CUTS = 20;

function asUuid(value: unknown): string {
  return typeof value === "string" && UUID_RE.test(value.trim()) ? value.trim() : "";
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cutIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.map(asUuid).filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_CUTS);
}

export async function POST(request: Request) {
  const user = await currentUser();
  // Rescore is Studio-only: enqueue needs a session. The shared beta token is not enough
  // on its own because the job is owned through edit_runs.user_id / RLS.
  const denied = betaAccessDenied(request, { signedIn: !!user });
  if (denied) return denied;
  if (!user) {
    return Response.json({ error: "Sign in to enqueue a rescore." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Incoming;
  const editRunId = asUuid(body.editRunId);
  if (!editRunId) {
    return Response.json({ error: "editRunId is required." }, { status: 400 });
  }

  const session = await sessionClient();
  const supabase = serviceClient();
  if (!session || !supabase) {
    return Response.json({ error: "Rescore queue is not configured." }, { status: 500 });
  }

  const { data: run, error: runError } = await session
    .from("edit_runs")
    .select("id")
    .eq("id", editRunId)
    .maybeSingle();
  if (runError || !run) {
    return Response.json({ error: "Edit run not found." }, { status: 404 });
  }

  const cutIds = cutIdsFrom(body.cutIds);
  if (Array.isArray(body.cutIds) && cutIds.length === 0) {
    return Response.json({ error: "cutIds must be UUIDs." }, { status: 400 });
  }

  if (cutIds.length > 0) {
    const { data: cuts, error: cutsError } = await session
      .from("edit_cuts")
      .select("id")
      .eq("edit_run_id", editRunId)
      .in("id", cutIds);
    if (cutsError || !cuts || cuts.length !== cutIds.length) {
      return Response.json({ error: "One or more cuts do not belong to that edit run." }, { status: 400 });
    }
  }

  // Temporary in-memory enqueue limiter. The worker is still external; this route only
  // inserts a queue row and returns.
  const slot = acquireRunSlot(request);
  if (slot instanceof Response) return slot;

  try {
    const { data: job, error } = await supabase
      .from("rescore_jobs")
      .insert({
        user_id: user.id,
        edit_run_id: editRunId,
        batch_id: asUuid(body.batchId) || null,
        ad_id: asOptionalString(body.adId),
        cut_ids: cutIds,
        status: "queued",
      })
      .select("id, status")
      .single();

    if (error || !job) {
      return Response.json({ error: "Could not enqueue rescore." }, { status: 500 });
    }

    return Response.json({ ok: true, jobId: job.id, status: job.status });
  } finally {
    slot.release();
  }
}
