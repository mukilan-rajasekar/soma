// proxy.ts — session refresh on the way in.
//
// THIS FILE IS NOT NAMED middleware.ts, AND THAT IS NOT A TYPO. Next.js 16 renamed
// Middleware to Proxy (node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md:
// "Starting with Next.js 16, Middleware is now called Proxy"). Every Supabase auth guide
// on the internet tells you to write `middleware.ts`. In this repo that file would be
// dead code that never executes, and the failure is silent: sessions would simply stop
// refreshing and users would be logged out at token expiry with nothing in the logs.
//
// WHAT IT DOES, AND ONLY THIS. It calls getUser() so @supabase/ssr rotates an expiring
// access token and writes the refreshed cookies onto the response. That is what lets
// src/lib/supabase/session.ts swallow the "cannot set cookies in a Server Component"
// error — by the time a page renders, the cookies are already current.
//
// WHAT IT DELIBERATELY DOES NOT DO: authorize. The Next docs are explicit that Proxy
// "should not be used as a full session management or authorization solution", and the
// reason is architectural rather than stylistic — a proxy runs before routing and cannot
// see what a page is about to read. So the redirect below is an OPTIMISTIC one: it saves
// a signed-out visitor a pointless render of a page that is going to bounce them anyway.
// The real check is requireUser() inside the dashboard layout, and that check is the one
// that is load-bearing. If this file were deleted tomorrow, nothing would become
// readable that is not readable now.
//
// THE MATCHER IS AN ALLOWLIST, NOT A DENYLIST. It names /dashboard and the auth routes.
// It does NOT name /r, /g or /e: those are capability URLs whose authorization is the
// 128-bit token in the path, they must keep working for someone who has never signed in,
// and running an auth round-trip on them would add latency to buy nothing.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Where a signed-out visitor is sent, carrying where they were going. */
function toSignIn(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  const from = request.nextUrl.pathname + request.nextUrl.search;
  if (from && from !== "/dashboard") url.searchParams.set("next", from);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Unconfigured: pass everything through untouched. The dashboard layout renders its own
  // "not configured" state, which is a better error than a redirect loop to a sign-in page
  // that also cannot work.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items) {
        // Both halves are required. The request copy is what a downstream render reads;
        // the response copy is what the browser stores. Writing only one is the classic
        // way to end up with a session that works for exactly one request.
        for (const { name, value } of items) request.cookies.set(name, value);
        for (const { name, value, options } of items) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith("/dashboard") || path === "/update-password")) {
    return toSignIn(request);
  }

  // Already signed in: /sign-in, /sign-up and /forgot-password have nothing to offer.
  // /update-password is deliberately NOT in this list — a recovery session arriving from
  // /auth/callback IS signed in, and that page is exactly where it belongs.
  if (user && (path === "/sign-in" || path === "/sign-up" || path === "/forgot-password")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/update-password",
  ],
};
