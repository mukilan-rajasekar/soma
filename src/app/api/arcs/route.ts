// GET /api/arcs — public arcs for the /demo picker + A/B compare.
//
// Reads server-side through the service_role client so Supabase creds never reach the
// browser (the new-app convention: the client fetches /api/arcs, never PostgREST). GET
// Route Handlers are dynamic/uncached by default in Next 16; we keep it that way so a
// freshly published arc shows up without a redeploy.
//
// Gracefully returns an empty list (never a 500) when Supabase is not configured or the
// query errors, so /demo always renders with its local sample arcs as the baseline.

import { serviceClient } from "@/lib/supabase/server";

// Explicit for intent (GET is already dynamic by default here): every request reflects
// the current arcs table, no build-time snapshot.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = serviceClient();
  // Not configured (no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY) → empty list, not
  // a 500. The page must never break because live arcs are unavailable.
  if (!supabase) return Response.json([]);

  // service_role bypasses RLS, so filter is_public here to reproduce the anon read
  // policy (is_public = true) — a private/unpublished arc must never leak through.
  const { data, error } = await supabase
    .from("arcs")
    .select("ad_id,title,arc,meta")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (error) return Response.json([]);
  return Response.json(data ?? []);
}
