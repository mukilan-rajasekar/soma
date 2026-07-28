import { serviceClient } from "@/lib/supabase/server";
import { runEditSearch, validateEditInput } from "@/lib/edit-runner";

type Incoming = {
  ad?: unknown;
  top?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Incoming;
  const { ad, top } = validateEditInput({ ad: body.ad, top: body.top });
  if (!ad) {
    return Response.json({ error: "Pick a demo cut to edit." }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Edit beta is not configured." }, { status: 500 });
  }

  const { data: run, error: insertError } = await supabase
    .from("edit_runs")
    .insert({
      ad_id: ad,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .select("id, share_token")
    .single();

  if (insertError || !run) {
    return Response.json({ error: "Could not start edit beta." }, { status: 500 });
  }

  try {
    const result = await runEditSearch({ ad, top });
    const { error: updateError } = await supabase
      .from("edit_runs")
      .update({
        status: "done",
        result,
        error: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    if (updateError) {
      return Response.json({ error: "Edit search ran, but could not be saved." }, { status: 500 });
    }

    return Response.json({ ok: true, token: run.share_token });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Edit beta is unavailable on this machine. It needs Python tooling plus ffmpeg.";
    await supabase
      .from("edit_runs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return Response.json({ ok: false, token: run.share_token, error: message }, { status: 500 });
  }
}
