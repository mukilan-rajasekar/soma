import { loadBatchEditSource } from "@/lib/edit-source";
import { runEditSearch } from "@/lib/edit-runner";
import { isShareToken } from "@/lib/batch";
import { editSearchAvailable } from "@/lib/edit-capability";
import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!isShareToken(token)) {
    return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  }

  // Checked before anything else, and before any work: this route spawns Python and
  // ffmpeg, and on a host without them every call did a database read and a storage
  // signing round trip only to fail at the exec. ResultReport already hides the block
  // that calls this, so reaching here means a direct request; answer it plainly rather
  // than by failing deep in the runner.
  if (!editSearchAvailable()) {
    return Response.json(
      { error: "Edit search does not run on this host." },
      { status: 501, headers: noStore },
    );
  }

  const ad = new URL(request.url).searchParams.get("ad")?.trim() ?? "";
  if (!ad) {
    return Response.json({ error: "Pick a cut." }, { status: 400, headers: noStore });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Not configured." }, { status: 500, headers: noStore });
  }

  const source = await loadBatchEditSource(token, ad);
  if (!source) {
    return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  }

  const { data, error } = await supabase.storage
    .from("uploads")
    .createSignedUrl(source.storagePath, 15 * 60);
  if (error || !data?.signedUrl) {
    return Response.json(
      { error: "Could not load that cut for edit preview." },
      { status: 500, headers: noStore },
    );
  }

  try {
    const payload = await runEditSearch({
      kind: "batch",
      ad,
      top: 12,
      verify: false,
      estimateOnly: true,
      sourceTitle: source.ad.title,
      batchName: source.batchName,
      downloadUrl: data.signedUrl,
      durationS: source.ad.durationS,
      arc: source.ad.arc,
      lanes: source.ad.lanes,
      features: source.ad.features,
      transcript: source.ad.media?.transcript ?? [],
      message: source.message,
    });
    return Response.json(payload, { headers: noStore });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not compute the edit preview for this cut.";
    return Response.json({ error: message }, { status: 500, headers: noStore });
  }
}
