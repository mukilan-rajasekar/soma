/* Soma — tiny Supabase REST client.
 * No library, no CDN — just fetch() against Supabase's PostgREST endpoint, so it
 * fits the demo's "everything vendored, no build step" constraint. Reads config
 * from window.SOMA_SUPABASE (see supabase-config.js). If unconfigured, `enabled`
 * is false and callers fall back gracefully (no errors, no broken UI).
 */
(function () {
  var CFG = window.SOMA_SUPABASE || {};
  var BASE = (CFG.url || "").replace(/\/+$/, "");
  var KEY = CFG.anonKey || "";
  var enabled = !!(BASE && KEY);

  function headers(extra) {
    // New sb_publishable_ keys authenticate via the `apikey` header ONLY. Passing the
    // publishable key as an Authorization: Bearer token makes the gateway reject it
    // (that slot is for a user's JWT), so we omit it for anon access.
    var h = { apikey: KEY, "Content-Type": "application/json" };
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

  // Fetch shared, public ad-analysis arcs (newest first). Returns [] if unconfigured.
  async function fetchArcs() {
    if (!enabled) return [];
    var res = await fetch(BASE + "/rest/v1/arcs?select=ad_id,title,arc,meta&order=created_at.desc", {
      headers: headers()
    });
    if (!res.ok) throw new Error("arcs fetch failed: " + res.status);
    return res.json();
  }

  window.Soma = window.Soma || {};
  window.Soma.supabase = { enabled: enabled, joinWaitlist: joinWaitlist, fetchArcs: fetchArcs };
})();
