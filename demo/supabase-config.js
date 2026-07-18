/* Soma — Supabase config.
 * FILL THESE IN after creating your project (Supabase dashboard → Settings → API).
 *
 * The anon / public key is SAFE to commit and expose in the browser: every table
 * is protected by row-level security (see ../supabase/schema.sql). With the anon
 * key a visitor can only INSERT a waitlist row and READ public arcs — nothing else.
 *
 * ⚠️ NEVER put the service_role / "secret" key here — that one bypasses RLS and
 *    must stay server-side (the Python pipeline reads it from an env var).
 *
 * Until both fields are filled, the site falls back to its offline behaviour
 * (the waitlist stores to localStorage, exactly as before).
 */
window.SOMA_SUPABASE = {
  url: "",       // e.g. "https://abcdefghijkl.supabase.co"
  anonKey: ""    // the "anon" "public" key — a long token starting with "eyJ..."
};
