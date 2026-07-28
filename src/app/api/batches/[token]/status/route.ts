// GET /api/batches/<share_token>/status
//
// The one endpoint the result page polls while a run is in flight. Deliberately tiny: a
// status word, how many cuts are in the batch, and — only once it has failed — the
// English reason. It never returns the report. The report is rendered server-side by
// /r/[token], so shipping it here would mean maintaining a second copy of the same
// contract and sending the whole artifact down the wire every few seconds to answer a
// question that fits in one word.
//
// THE TOKEN IS THE AUTHORIZATION. There is no account system: holding the URL is what
// entitles you to the run. That is the right trade for a concierge product where the
// customer is emailed a link, and it is only safe because the token is 16 random bytes
// (migration 0003) and the shape is checked before it reaches a query.
//
// Cache-Control: no-store. A status that a CDN or the browser can hold is a status page
// that shows "processing" after the run has finished.

import { isShareToken } from "@/lib/batch";
import { serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(_req: Request, ctx: RouteContext<"/api/batches/[token]/status">) {
  const { token } = await ctx.params;

  // Rejected before any round-trip, so a malformed path costs nothing and the column is
  // never queried with something that isn't the exact shape it stores.
  if (!isShareToken(token)) {
    return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Not configured." }, { status: 500, headers: noStore });
  }

  const { data, error } = await supabase
    .from("batches")
    .select("status, manifest, error, created_at, started_at, completed_at")
    .eq("share_token", token)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Could not read status." }, { status: 500, headers: noStore });
  }
  // Same 404 for "no such token" as for "malformed token": a distinguishable response
  // would turn this into an oracle for probing which tokens exist.
  if (!data) {
    return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  }

  const ads = (data.manifest as { ads?: unknown[] } | null)?.ads;

  return Response.json(
    {
      status: data.status,
      adCount: Array.isArray(ads) ? ads.length : 0,
      // Only on the terminal failure state. There is nothing useful to say about an
      // error mid-run, and a half-written one would leak pipeline internals.
      error: data.status === "failed" ? data.error : null,
      createdAt: data.created_at,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    },
    { headers: noStore },
  );
}
