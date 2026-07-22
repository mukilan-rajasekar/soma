// POST /api/uploads/complete
//
// Records the concierge intake row AFTER the browser has PUT the file to Storage.
// Runs with the service_role key, which bypasses RLS, so `status` falls to its
// 'queued' default. A duplicate storage_path (UNIQUE) is tolerated exactly like the
// waitlist route tolerates a duplicate email.

import { serviceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { email, filename, sizeBytes, contentType, path, note } = body;

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Uploads are not configured." }, { status: 500 });
  }

  if (typeof path !== "string" || !path) {
    return Response.json({ error: "Missing upload reference." }, { status: 400 });
  }

  const { error } = await supabase.from("uploads").insert({
    email:
      typeof email === "string" && email.trim()
        ? email.trim().toLowerCase()
        : null,
    filename: typeof filename === "string" && filename ? filename : null,
    size_bytes:
      typeof sizeBytes === "number" && Number.isFinite(sizeBytes)
        ? sizeBytes
        : null,
    content_type:
      typeof contentType === "string" && contentType ? contentType : null,
    storage_path: path, // UNIQUE
    note: typeof note === "string" && note.trim() ? note.trim() : null,
    user_agent: request.headers.get("user-agent"),
  });

  // Ignore duplicate storage_path (23505), mirroring the waitlist route.
  if (error && error.code !== "23505") {
    return Response.json({ error: "Could not queue upload." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
