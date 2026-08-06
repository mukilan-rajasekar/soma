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

import { NextResponse, type NextRequest } from "next/server";

import { sessionClient } from "@/lib/supabase/session";

export async function POST(request: NextRequest) {
  const supabase = await sessionClient();
  // Best effort. If auth is unconfigured there is no session to end, and the redirect
  // below is still the right answer.
  if (supabase) await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/", request.url), {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}
