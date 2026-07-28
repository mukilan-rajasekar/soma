import { acquireRunSlot, betaAccessDenied } from "@/lib/beta-gate";
import { runGeneratePipeline, toGenerateBrief, validateGenerateInput } from "@/lib/generate-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Taken only once the request is known to be well-formed, so a malformed body cannot
  // burn a caller's daily quota.
  const slot = acquireRunSlot(request);
  if (slot instanceof Response) return slot;

  try {
    const payload = await runGeneratePipeline(input);
    return Response.json({ ok: true, ...payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not run generation.";
    return Response.json(
      {
        error:
          "Generation beta is unavailable on this machine. It needs Python tooling plus ffmpeg, and scoring only ranks candidates on a fully configured scorer box.",
        detail: msg,
      },
      { status: 500 },
    );
  } finally {
    slot.release();
  }
}
