// browser.ts — the Supabase client the sign-in form uses.
//
// Only the publishable (anon) key ever reaches here, which is the whole point: it is
// designed to be public, and RLS is what actually protects the rows. The service_role
// key lives in src/lib/supabase/server.ts and must never be imported from a "use client"
// file — it is not NEXT_PUBLIC_*, so a stray import yields `undefined` and a thrown
// error rather than a leak, but the rule stands on its own.
//
// WHY THE BROWSER SIGNS IN RATHER THAN A ROUTE HANDLER. signInWithPassword() on the
// browser client writes the auth cookies through @supabase/ssr's cookie adapter, so the
// session is immediately visible to the next server render. Posting credentials to our
// own Route Handler would mean re-implementing that cookie write by hand for no gain.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * The browser Supabase client, or `null` when public env is missing.
 *
 * Memoized: createBrowserClient() installs cookie listeners, and a fresh client per
 * render would stack them up on every keystroke in a controlled form.
 */
export function browserClient(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  cached = createBrowserClient(url, key);
  return cached;
}
