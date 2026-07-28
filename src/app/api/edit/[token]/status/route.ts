import { isShareToken } from "@/lib/batch";
import { serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(_req: Request, ctx: RouteContext<"/api/edit/[token]/status">) {
  const { token } = await ctx.params;
  if (!isShareToken(token)) {
    return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Not configured." }, { status: 500, headers: noStore });
  }

  const { data, error } = await supabase
    .from("edit_runs")
    .select("status, error, created_at, started_at, completed_at")
    .eq("share_token", token)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Could not read status." }, { status: 500, headers: noStore });
  }
  if (!data) {
    return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  }

  return Response.json(
    {
      status: data.status,
      error: data.status === "failed" ? data.error : null,
      createdAt: data.created_at,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    },
    { headers: noStore },
  );
}
