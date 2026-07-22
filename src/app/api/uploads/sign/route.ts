// POST /api/uploads/sign
//
// Mints a short-lived Supabase Storage signed UPLOAD URL for the private `uploads`
// bucket, so the browser can PUT the raw MP4 bytes straight to Storage. The bytes
// never pass through this function (Vercel caps serverless request bodies at ~4.5 MB;
// a 150 MB ad would 413). No Supabase key ever reaches the browser — the URL is minted
// with the service_role secret and carries only a scoped, expiring token.

import { serviceClient } from "@/lib/supabase/server";
import {
  MAX_UPLOAD_BYTES,
  buildStoragePath,
  isAllowedMime,
  isValidEmail,
} from "@/lib/upload";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { filename, contentType, sizeBytes, email } = body;

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Uploads are not configured." }, { status: 500 });
  }

  // Validate: mp4 only, 0 < size <= 150 MB, valid email.
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return Response.json({ error: "That file looks empty." }, { status: 400 });
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That file is over 150 MB." }, { status: 400 });
  }
  if (typeof contentType !== "string" || !isAllowedMime(contentType)) {
    return Response.json({ error: "Only MP4 video files." }, { status: 400 });
  }
  if (typeof email !== "string" || !isValidEmail(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const name =
    typeof filename === "string" && filename.trim() ? filename : "video.mp4";
  const path = buildStoragePath(name);

  const { data, error } = await supabase.storage
    .from("uploads")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return Response.json({ error: "Could not start upload." }, { status: 500 });
  }

  // Absolute URL so the client can PUT with zero deps. `new URL(x, base)` returns x
  // unchanged when x is already absolute (current supabase-js returns absolute), and
  // resolves against the project URL if a future version returns a relative path.
  const signedUrl = new URL(
    data.signedUrl,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  ).toString();

  return Response.json({ path, token: data.token, signedUrl });
}
