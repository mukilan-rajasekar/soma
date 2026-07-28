import { runEditSearch, validateEditInput } from "@/lib/edit-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  try {
    const payload = await runEditSearch({ ad, top });
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
  }
}
