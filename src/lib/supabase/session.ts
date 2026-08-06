// session.ts — the Supabase client that carries a USER, as opposed to server.ts's
// service_role client that carries a machine.
//
// TWO CLIENTS, AND THE DIFFERENCE MATTERS. src/lib/supabase/server.ts mints a
// service_role client: it bypasses RLS entirely and is how every token-addressed page
// (/r, /g, /e) has always read its row. That path is unchanged and stays unchanged — a
// share token IS the authorization there, and migration 0003 says so at length.
//
// This file is the other half: a client bound to the request's auth cookies, so
// `auth.uid()` is a real value inside Postgres and RLS can express "your runs are yours".
// Anything under /dashboard reads through here. The rule is simple and worth keeping:
//
//     addressed by share token  -> serviceClient()   (server.ts)
//     addressed by "me"         -> sessionClient()   (this file)
//
// WHY getUser() AND NEVER getSession(). getSession() reads the cookie and trusts it.
// The cookie is attacker-controllable, so on the server it proves nothing. getUser()
// round-trips to Supabase Auth and validates the JWT signature. Every authorization
// decision in this app goes through currentUser() below, which uses getUser().
//
// COOKIE WRITES FROM A SERVER COMPONENT. Next forbids setting cookies while rendering a
// Server Component, and @supabase/ssr will attempt exactly that when it refreshes an
// expired token. The setAll() below swallows that specific failure, which is correct
// ONLY because src/proxy.ts refreshes the session on every matched request before the
// render begins — so by the time a Server Component runs, the cookies are already fresh.
// Remove the proxy and this silently starts logging people out.

import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/** The publishable (anon) key. Safe in the browser — RLS is what protects the data. */
export function publicSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/**
 * A Supabase client scoped to the signed-in user, or `null` when auth env is absent.
 *
 * Null rather than throw, matching serviceClient(): an unconfigured environment should
 * render a signed-out page, not a stack trace. Callers that need a user use
 * currentUser()/requireUser() instead of null-checking this themselves.
 */
export async function sessionClient(): Promise<SupabaseClient | null> {
  const config = publicSupabaseConfig();
  if (!config) return null;

  const store = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(items) {
        try {
          for (const { name, value, options } of items) {
            store.set(name, value, options);
          }
        } catch {
          // Server Component render — see the header note. src/proxy.ts already
          // refreshed these cookies on the way in.
        }
      },
    },
  });
}

/** The signed-in user, verified against Supabase Auth, or null. Never throws. */
export async function currentUser(): Promise<User | null> {
  const supabase = await sessionClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * The signed-in user, or a redirect to /sign-in carrying where they were going.
 *
 * THIS IS THE REAL AUTHORIZATION CHECK. src/proxy.ts also redirects signed-out visitors
 * away from /dashboard, but a proxy runs before routing and the Next docs are explicit
 * that it is not an authorization layer — it is there to refresh cookies and to save a
 * pointless render. Every authenticated page reaches its user through this function, so
 * deleting the proxy would cost a redirect, not a boundary.
 */
export async function requireUser(nextPath: string): Promise<User> {
  const user = await currentUser();
  if (user) return user;

  const target =
    nextPath && nextPath !== "/dashboard"
      ? `/sign-in?next=${encodeURIComponent(nextPath)}`
      : "/sign-in";
  redirect(target);
}

/** The display name we show in the dashboard chrome. Falls back to the email local part. */
export function displayName(user: User): string {
  const meta = user.user_metadata as { full_name?: unknown; name?: unknown } | null;
  const named = [meta?.full_name, meta?.name].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  if (named) return named.trim();
  const email = user.email ?? "";
  const local = email.split("@")[0] ?? "";
  return local || "your account";
}
