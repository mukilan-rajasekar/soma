import { acquireRunSlot, betaAccessDenied } from "@/lib/beta-gate";
import { runEditSearch, validateEditInput } from "@/lib/edit-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Incoming = {
  ad?: unknown;
  top?: unknown;
};

export async function POST(request: Request) {
  const denied = betaAccessDenied(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Incoming;
  const { ad, top } = validateEditInput({ ad: body.ad, top: body.top });
  if (!ad) {
    return Response.json({ error: "Pick a demo cut to edit." }, { status: 400 });
  }

  const slot = acquireRunSlot(request);
  if (slot instanceof Response) return slot;

  try {
    const payload = await runEditSearch({ kind: "demo", ad, top });
    return Response.json({ ok: true, ...payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not run edit beta.";
    return Response.json(
      {
        error:
          "Edit beta is unavailable on this machine. It needs Python tooling plus ffmpeg, and measured verification only completes on a fully configured scorer box.",
        detail: msg,
      },
      { status: 500 },
    );
  } finally {
    slot.release();
  }
}
