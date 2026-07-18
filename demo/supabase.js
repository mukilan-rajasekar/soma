/* Soma — tiny Supabase REST client.
 * No library, no CDN — just fetch() against Supabase's PostgREST + Storage
 * endpoints, so it fits the demo's "everything vendored, no build step"
 * constraint. Reads config from window.SOMA_SUPABASE (see supabase-config.js).
 * If unconfigured, `enabled` is false and callers fall back gracefully.
 */
(function () {
  var CFG = window.SOMA_SUPABASE || {};
  var BASE = (CFG.url || "").replace(/\/+$/, "");
  var KEY = CFG.anonKey || "";
  var enabled = !!(BASE && KEY);

  // PostgREST auth: new sb_publishable_ keys authenticate via the `apikey`
  // header ONLY. Passing the publishable key as Authorization: Bearer makes the
  // gateway reject it (that slot is for a user's JWT), so we omit it here.
  function headers(extra) {
    var h = { apikey: KEY, "Content-Type": "application/json" };
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  // Storage auth: unlike PostgREST, the Storage gateway DOES accept the
  // publishable key in Authorization: Bearer (verified against the live project)
  // and uses it to resolve the anon role for RLS. supabase-js sends it too, so
  // we mirror that to make the `to anon` storage policy apply reliably.
  function storageHeaders(extra) {
    var h = { apikey: KEY, Authorization: "Bearer " + KEY };
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  // Insert one early-access signup. A repeat email hits the UNIQUE constraint and
  // returns 409 — we treat that as success (already on the list), not an error.
  // NB: we deliberately do NOT use resolution=ignore-duplicates — that upsert path
  // needs to READ the conflicting row, which anon can't do (waitlist is write-only),
  // so it'd fail RLS. A plain insert + catching 409 is the correct write-only pattern.
  async function joinWaitlist(rec) {
    if (!enabled) throw new Error("supabase-not-configured");
    var res = await fetch(BASE + "/rest/v1/waitlist", {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(rec)
    });
    if (!res.ok && res.status !== 409) throw new Error("waitlist insert failed: " + res.status);
    return true;
  }

  // Fetch shared, public ad-analysis arcs (newest first). Returns [] if
  // unconfigured. Each row: { ad_id, title, arc (the full arc json), meta }.
  async function fetchArcs() {
    if (!enabled) return [];
    var res = await fetch(BASE + "/rest/v1/arcs?select=ad_id,title,arc,meta&order=created_at.desc", {
      headers: headers()
    });
    if (!res.ok) throw new Error("arcs fetch failed: " + res.status);
    return res.json();
  }

  // Concierge intake: upload a video to the PRIVATE `uploads` storage bucket,
  // then record a write-only row in the `uploads` table so the founder has a
  // queue to process (run the pipeline → publish_to_supabase.py → it appears
  // live). The browser can only write; it can't list or read other uploads.
  async function uploadVideo(file, email, note) {
    if (!enabled) throw new Error("supabase-not-configured");
    if (!file) throw new Error("no-file");
    // sanitise to URL-safe chars so the object path never needs encoding
    var safe = (file.name || "video").replace(/[^\w.\-]+/g, "_").replace(/^_+/, "").slice(-80) || "video";
    var path = "queued/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "-" + safe;

    // 1) push the bytes to Storage (private bucket `uploads`)
    var up = await fetch(BASE + "/storage/v1/object/uploads/" + path, {
      method: "POST",
      headers: storageHeaders({
        "Content-Type": file.type || "application/octet-stream",
        "cache-control": "3600",
        "x-upsert": "false"
      }),
      body: file
    });
    if (!up.ok) {
      var msg = "upload failed: " + up.status;
      try { var j = await up.json(); if (j && (j.message || j.error)) msg += " — " + (j.message || j.error); } catch (e) {}
      throw new Error(msg);
    }

    // 2) record the intake row (write-only, same anon pattern as the waitlist)
    var rec = {
      email: (email || "").trim() || null,
      filename: file.name || null,
      size_bytes: (typeof file.size === "number" ? file.size : null),
      content_type: file.type || null,
      storage_path: path,
      note: (note || "").trim() || null,
      user_agent: (navigator && navigator.userAgent) || null
    };
    var meta = await fetch(BASE + "/rest/v1/uploads", {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(rec)
    });
    // A duplicate storage_path (astronomically unlikely) would 409 — treat as ok.
    if (!meta.ok && meta.status !== 409) throw new Error("intake insert failed: " + meta.status);
    return { path: path };
  }

  window.Soma = window.Soma || {};
  window.Soma.supabase = {
    enabled: enabled,
    joinWaitlist: joinWaitlist,
    fetchArcs: fetchArcs,
    uploadVideo: uploadVideo
  };
})();
