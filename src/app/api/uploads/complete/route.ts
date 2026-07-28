// POST /api/uploads/complete
//
// Records the concierge intake row AFTER the browser has PUT the file to Storage.
// Runs with the service_role key, which bypasses RLS, so `status` falls to its
// 'queued' default. A duplicate storage_path (UNIQUE) is tolerated exactly like the
// waitlist route tolerates a duplicate email.
//
// This endpoint is unauthenticated and its insert bypasses RLS, so `path` is NEVER taken
// on trust: otherwise anyone could POST fabricated paths and flood the concierge queue
// with rows pointing at objects that were never uploaded, which the pipeline would then
// have to fetch, fail on, and reconcile by hand. Two gates stop that — the path must have
// the exact shape buildStoragePath mints, and the object must already exist in the
// bucket. Writing under queued/ requires a signed URL that only /sign can mint, so a
// forged path cannot satisfy the second gate.

import { serviceClient } from "@/lib/supabase/server";
import { sendSingleUploadQueuedEmail } from "@/lib/notify";
import { isStoragePath, isValidEmail } from "@/lib/upload";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { email, filename, sizeBytes, contentType, path, note } = body;

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Uploads are not configured." }, { status: 500 });
  }

  if (typeof path !== "string" || !isStoragePath(path)) {
    return Response.json({ error: "Missing upload reference." }, { status: 400 });
  }

  // Same bar as /sign, which already refuses to mint a URL without one: an intake row
  // with no reachable address is not actionable by the concierge pipeline.
  if (typeof email !== "string" || !isValidEmail(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  // The bytes must actually be in the bucket before we queue anything. This is the gate
  // that makes a forged path inert rather than merely well-formed.
  const { data: uploaded, error: existsError } = await supabase.storage
    .from("uploads")
    .exists(path);

  if (existsError || !uploaded) {
    return Response.json({ error: "Upload not found in storage." }, { status: 400 });
  }

  const { error } = await supabase.from("uploads").insert({
    email: email.trim().toLowerCase(),
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

  try {
    await sendSingleUploadQueuedEmail({
      email: email.trim().toLowerCase(),
      filename: typeof filename === "string" && filename ? filename : null,
    });
  } catch (err) {
    console.error("single upload queued email failed", err);
  }

  return Response.json({ ok: true });
}
