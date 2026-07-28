import { acquireRunSlot, betaAccessDenied } from "@/lib/beta-gate";
import { serviceClient } from "@/lib/supabase/server";
import { runGeneratePipeline, toGenerateBrief, validateGenerateInput } from "@/lib/generate-runner";

type Incoming = {
  brief?: unknown;
  n?: unknown;
  duration?: unknown;
  aspect?: unknown;
  provider?: unknown;
};

export async function POST(request: Request) {
  const denied = betaAccessDenied(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Incoming;
  const brief = toGenerateBrief(body.brief);
  const { problems, input } = validateGenerateInput({
    brief,
    n: body.n,
    duration: body.duration,
    aspect: body.aspect,
    provider: body.provider,
  });
  if (problems.length) {
    return Response.json({ error: problems[0], problems }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Generation beta is not configured." }, { status: 500 });
  }

  const { data: run, error: insertError } = await supabase
    .from("generation_runs")
    .insert({
      provider: input.provider,
      brief: input.brief,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .select("id, share_token")
    .single();

  if (insertError || !run) {
    return Response.json({ error: "Could not start generation beta." }, { status: 500 });
  }

  const slot = acquireRunSlot(request);
  if (slot instanceof Response) {
    // The row says `processing` and nothing is coming to move it. Close it out rather
    // than leaving a run that claims to be working forever.
    await supabase
      .from("generation_runs")
      .update({
        status: "failed",
        error: "The box was already busy with another beta run.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return slot;
  }

  try {
    const result = await runGeneratePipeline(input);
    const { error: updateError } = await supabase
      .from("generation_runs")
      .update({
        status: "done",
        result,
        error: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    if (updateError) {
      return Response.json({ error: "Generation ran, but could not be saved." }, { status: 500 });
    }

    return Response.json({ ok: true, token: run.share_token });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Generation beta is unavailable on this machine. It needs Python tooling plus ffmpeg.";
    await supabase
      .from("generation_runs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return Response.json({ ok: false, token: run.share_token, error: message }, { status: 500 });
  } finally {
    slot.release();
  }
}
