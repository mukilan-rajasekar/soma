// GET /api/serve/outcomes/<served_ad_id>
//
// Read-only by construction: no POST/PUT sibling, no service_role client. The session client
// plus outcomes RLS decide whether any rows are visible for this served ad.

import { getOutcomesForServedAd } from "@/lib/serve";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ servedAdId: string }> },
) {
  const { servedAdId } = await ctx.params;
  const outcomes = await getOutcomesForServedAd(servedAdId);

  return Response.json({ outcomes }, { headers: noStore });
}
