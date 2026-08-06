// POST /api/batches/create
//
// Turns N already-uploaded objects plus a brief into one queued, scoreable batch, and
// returns the address the customer watches it at.
//
// SHAPE OF THE FLOW. The browser has already PUT each file straight to Storage via a
// signed URL from /api/uploads/sign (the bytes never pass through a Function — Vercel
// caps request bodies around 4.5 MB and an ad is up to 150 MB). This route is the single
// call that lands afterwards: it verifies every object is really in the bucket, builds
// the manifest, writes the batch, and links the upload rows to it.
//
// IT DOES NOT USE /api/uploads/complete. That route stays exactly as it is, serving the
// landing page's one-off dialog, and this one does the batch equivalent in a single
// round trip instead of N. Two paths writing the same tables is a real cost, and it is
// paid deliberately: the one-off intake is a different product (no brief, no ranking, no
// result page) and folding it in here would have meant forcing a six-field brief onto a
// one-click "upload an MP4".
//
// THE CLIENT NEVER SENDS A MANIFEST. It sends a brief and a list of objects; the server
// builds the manifest with buildManifest(). That matters because the manifest is
// executed — tools/concierge/run_batch.py writes it to disk and process_batch.py reads
// it — so accepting one from an unauthenticated caller would let anyone put arbitrary
// keys into a file our pipeline parses.

import { serviceClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/supabase/session";
import {
  MAX_BATCH_ADS,
  adIdFor,
  buildManifest,
  emptyBrief,
  normaliseAliases,
  validateAds,
  validateBrief,
  type BatchAd,
  type Brief,
} from "@/lib/batch";
import { sendBatchQueuedEmail } from "@/lib/notify";
import { isStoragePath, isValidEmail } from "@/lib/upload";

type Incoming = {
  email?: unknown;
  brief?: unknown;
  ads?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Incoming;

  const supabase = serviceClient();
  if (!supabase) {
    return Response.json({ error: "Uploads are not configured." }, { status: 500 });
  }

  // ── email ────────────────────────────────────────────────────────────────────
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  // ── the brief ────────────────────────────────────────────────────────────────
  // Rebuilt field by field onto a known-shaped object rather than spread from the
  // request: an unknown key in `brief` must not survive into the manifest.
  const raw = (body.brief ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const brief: Brief = {
    ...emptyBrief(),
    batch_name: str("batch_name"),
    brand_name: str("brand_name"),
    product_name: str("product_name"),
    primary_problem: str("primary_problem"),
    primary_benefit: str("primary_benefit"),
    offer: str("offer"),
    desired_cta: str("desired_cta"),
    platform: str("platform") || "meta",
    placement: str("placement") || "reels",
    objective: str("objective") || "conversions",
    audience: str("audience"),
    brand_aliases: normaliseAliases((raw.brand_aliases as string[] | string) ?? []),
    product_aliases: normaliseAliases((raw.product_aliases as string[] | string) ?? []),
  };

  const briefProblems = validateBrief(brief);
  if (briefProblems.length) {
    return Response.json({ error: briefProblems[0], problems: briefProblems }, { status: 400 });
  }

  // ── the ads ──────────────────────────────────────────────────────────────────
  if (!Array.isArray(body.ads) || body.ads.length === 0) {
    return Response.json({ error: "No cuts in this batch." }, { status: 400 });
  }
  // Bound the loop before doing any per-item work, so a caller cannot make us issue
  // thousands of storage round-trips by posting a long array.
  if (body.ads.length > MAX_BATCH_ADS) {
    return Response.json(
      { error: `A batch takes at most ${MAX_BATCH_ADS} cuts.` },
      { status: 400 },
    );
  }

  const ads: BatchAd[] = [];
  for (const entry of body.ads as Record<string, unknown>[]) {
    const path = typeof entry?.path === "string" ? entry.path : "";
    if (!isStoragePath(path)) {
      return Response.json({ error: "Missing upload reference." }, { status: 400 });
    }
    ads.push({
      path,
      filename: typeof entry.filename === "string" && entry.filename ? entry.filename : "video.mp4",
      title: typeof entry.title === "string" ? entry.title : "",
      durationS: typeof entry.durationS === "number" ? entry.durationS : NaN,
    });
  }

  const adProblems = validateAds(ads);
  if (adProblems.length) {
    return Response.json({ error: adProblems[0], problems: adProblems }, { status: 400 });
  }

  // ── every object must actually be in the bucket ──────────────────────────────
  //
  // Same gate, and the same reasoning, as /api/uploads/complete: this endpoint is
  // unauthenticated and inserts with service_role (bypassing RLS), so a well-formed path
  // is not evidence of an upload. Writing under queued/ requires a signed URL only
  // /sign can mint, so a forged path cannot satisfy this.
  const missing: string[] = [];
  await Promise.all(
    ads.map(async (a) => {
      const { data, error } = await supabase.storage.from("uploads").exists(a.path);
      if (error || !data) missing.push(a.filename);
    }),
  );
  if (missing.length) {
    return Response.json(
      { error: `Upload not found in storage: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // ── write ────────────────────────────────────────────────────────────────────
  const manifest = buildManifest(brief, ads);

  // OWNERSHIP IS STAMPED ONLY IF THERE IS A REAL SESSION, and its absence is not an error.
  // /upload is the concierge intake and stays open to people who have never signed in
  // (migration 0008: a null user_id means "reachable only by its share token", which is
  // how every row created before accounts existed already behaves). When someone IS signed
  // in, this is what makes the run appear in their dashboard.
  //
  // Taken from the verified session rather than from `email` in the body: that field is
  // unvalidated free text, so trusting it would let any caller file a run into anyone
  // else's library by typing their address.
  const owner = await currentUser();

  const { data: batch, error: batchError } = await supabase
    .from("batches")
    .insert({
      email,
      batch_name: manifest.batch_name,
      manifest,
      ...(owner ? { user_id: owner.id } : {}),
    })
    .select("id, share_token")
    .single();

  if (batchError || !batch) {
    return Response.json({ error: "Could not queue this batch." }, { status: 500 });
  }

  // The upload rows, linked and ad-id'd in the SAME order buildManifest numbered them.
  // adIdFor(i) is called from the one place for both, so manifest.ads[i].id and
  // uploads.ad_id cannot disagree — which is what lets the runner pair a storage object
  // to a manifest entry without trusting a filename.
  const rows = ads.map((a, i) => ({
    email,
    filename: a.filename,
    content_type: "video/mp4",
    storage_path: a.path,
    batch_id: batch.id,
    ad_id: adIdFor(i),
    ad_title: manifest.ads[i].title,
    user_agent: request.headers.get("user-agent"),
    ...(owner ? { user_id: owner.id } : {}),
  }));

  const { error: uploadsError } = await supabase.from("uploads").insert(rows);

  if (uploadsError) {
    // A batch with no ads attached is not runnable and would sit in the queue as a
    // permanent puzzle. Delete it (uploads cascade) so a retry is clean rather than
    // leaving a half-written run for someone to diagnose later.
    await supabase.from("batches").delete().eq("id", batch.id);
    return Response.json({ error: "Could not queue this batch." }, { status: 500 });
  }

  // Queueing the batch is the main side effect. Email is best-effort: if delivery is
  // unconfigured or the provider errors, the batch still exists and the browser already
  // has the capability URL to watch it.
  try {
    await sendBatchQueuedEmail({
      email,
      batchName: manifest.batch_name,
      token: batch.share_token,
    });
  } catch (err) {
    console.error("batch queued email failed", err);
  }

  return Response.json({ ok: true, token: batch.share_token, adCount: ads.length });
}
