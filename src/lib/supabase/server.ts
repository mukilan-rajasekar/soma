// Server-only Supabase client factory.
//
// Uses the service_role / secret key (SUPABASE_SECRET_KEY), which BYPASSES RLS and
// must NEVER reach the browser. Import this only from server code — Route Handlers
// (`src/app/api/*/route.ts`) or Server Components — never from a "use client" file.
// SUPABASE_SECRET_KEY is not `NEXT_PUBLIC_*`, so it is never inlined into the client
// bundle; on the client it would be `undefined` and getSupabaseAdmin() would throw.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client authenticated with the service_role secret key.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY at call time. Throws a clear,
 * actionable error when either is missing so misconfiguration fails loudly rather than
 * silently no-oping. Session persistence is disabled — there is no user session on the
 * server; this is a stateless privileged client.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY " +
        "in .env.local (and in your Vercel project env). The repo .env only defines the " +
        "Python pipeline names (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), which the Next " +
        "app does not read.",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Returns a service_role Supabase client, or `null` when the env is not configured.
 *
 * The graceful-null sibling of getSupabaseAdmin(): instead of throwing on missing
 * env, it lets a Route Handler respond with a plain "not configured" 500 — mirroring
 * the waitlist route. Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY at call
 * time; the secret key is server-only and is never inlined into the client bundle.
 */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
