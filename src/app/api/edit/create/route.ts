import { acquireRunSlot, betaAccessDenied } from "@/lib/beta-gate";
import { loadBatchEditSource } from "@/lib/edit-source";
import { serviceClient } from "@/lib/supabase/server";
import { runEditSearch, validateEditInput, type EditRunInput } from "@/lib/edit-runner";

type Incoming = {
  ad?: unknown;
  top?: unknown;
  sourceKind?: unknown;
  batchToken?: unknown;
};

export async function POST(request: Request) {
  // Gated before anything else: this route also takes a customer batch token and signs
  // their footage out of private storage, so an unauthenticated caller must not even
  // reach the point of resolving one.
  const denied = betaAccessDenied(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Incoming;
  const { ad, top } = validateEditInput({ ad: body.ad, top: body.top });
  const sourceKind = body.sourceKind === "batch" ? "batch" : "demo";

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Edit beta is not configured." }, { status: 500 });
  }

  let sourceTitle = ad;
  let batchToken: string | null = null;
  let runnerInput: EditRunInput | null = null;

  if (sourceKind === "batch") {
    batchToken = typeof body.batchToken === "string" ? body.batchToken : "";
    if (!ad || !batchToken) {
      return Response.json({ error: "Pick a scored customer cut to edit." }, { status: 400 });
    }
    runnerInput = await resolveBatchInput(batchToken, ad, top);
    if (!runnerInput) {
      return Response.json(
        { error: "Could not load that customer cut for editing." },
        { status: 400 },
      );
    }
    sourceTitle = runnerInput.sourceTitle;
  } else {
    if (!ad) {
      return Response.json({ error: "Pick a demo cut to edit." }, { status: 400 });
    }
    runnerInput = { kind: "demo", ad, top };
  }

  const { data: run, error: insertError } = await supabase
    .from("edit_runs")
    .insert({
      ad_id: ad,
      source_kind: sourceKind,
      source_title: sourceTitle,
      batch_share_token: batchToken,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .select("id, share_token")
    .single();

  if (insertError || !run) {
    return Response.json({ error: "Could not start edit beta." }, { status: 500 });
  }
  if (!runnerInput) {
    return Response.json({ error: "Could not prepare edit beta." }, { status: 500 });
  }

  const slot = acquireRunSlot(request);
  if (slot instanceof Response) {
    // The row was already inserted as `processing`, and nothing is going to move it. Mark
    // it failed rather than leaving a run that claims to be working forever.
    await supabase
      .from("edit_runs")
      .update({
        status: "failed",
        error: "The box was already busy with another beta run.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return slot;
  }

  try {
    const result = await runEditSearch(runnerInput);
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
  } finally {
    slot.release();
  }
}

async function resolveBatchInput(batchToken: string, ad: string, top: number) {
  const supabase = serviceClient();
  if (!supabase) return null;

  const source = await loadBatchEditSource(batchToken, ad);
  if (!source) return null;

  const { data, error } = await supabase.storage
    .from("uploads")
    .createSignedUrl(source.storagePath, 60 * 60);
  if (error || !data?.signedUrl) return null;

  return {
    kind: "batch" as const,
    ad,
    top,
    sourceTitle: source.ad.title,
    batchName: source.batchName,
    downloadUrl: data.signedUrl,
    durationS: source.ad.durationS,
    arc: source.ad.arc,
    lanes: source.ad.lanes,
    features: source.ad.features,
    transcript: source.ad.media?.transcript ?? [],
    message: source.message,
  };
}
