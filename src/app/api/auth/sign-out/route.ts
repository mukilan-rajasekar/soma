// POST /api/auth/sign-out — end the session and land back on the marketing site.
//
// A Route Handler rather than a client-side signOut() call, for one reason: it works as a
// plain <form method="post"> with no JavaScript, so the only control in the dashboard that
// can strand a person in a half-authenticated state cannot be broken by a bundle that
// failed to load.
//
// POST-ONLY, DELIBERATELY. A GET sign-out is a CSRF footgun and worse, a link-prefetcher
// footgun: any crawler, chat client, or browser that speculatively fetches a URL in the
// page would log the user out for them. Supabase's auth cookies are SameSite=Lax, which
// means a cross-site POST does not carry them, so a forged POST signs out nobody.
//
// 303, not 302. It forces the browser to follow with GET; a 302 after a POST leaves the
// method up to the client and some will re-POST to the destination.
//
// COOKIES ARE WRITTEN ON THIS REDIRECT. sessionClient() uses cookies() from next/headers,
// which attaches Set-Cookie to an implicit response. Returning NextResponse.redirect
// replaces that response, so a sign-out that only called sessionClient().signOut() left
// the browser holding a session the server had already revoked.

import { type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { cookieJar, redirectWithCookies } from "@/lib/supabase/auth-cookies";
import { publicSupabaseConfig } from "@/lib/supabase/session";

export async function POST(request: NextRequest) {
  const config = publicSupabaseConfig();
  if (!config) {
    return redirectWithCookies(request, "/", new Map());
  }

  const { jar, setAll } = cookieJar();
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll,
    },
  });
  await supabase.auth.signOut();
  return redirectWithCookies(request, "/", jar);
}
