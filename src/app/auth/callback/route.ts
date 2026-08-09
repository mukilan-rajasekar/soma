// /auth/callback — where Supabase's emailed links land.
//
// Password-recovery and email-confirmation links cannot end on a page: turning the link's
// one-time credential into a session cookie is a write, and it has to happen before any
// render reads the user. This route does that one exchange and 303s away.
//
// TWO CREDENTIAL SHAPES, ONE HANDLER. @supabase/ssr 0.12 defaults both clients to PKCE,
// so the default email templates ({{ .ConfirmationURL }}) arrive here as `?code=…`, which
// exchangeCodeForSession() redeems against the code-verifier cookie written when the flow
// started. That cookie only exists in the browser that started the flow — a link opened
// elsewhere has nothing to verify against. The fix is the `?token_hash=…&type=…` shape,
// which verifyOtp() redeems with no cookie at all; Supabase emits it once the email
// template is switched to {{ .TokenHash }}. Supporting both means the default template
// works today and the template switch later is a console toggle, not a code change.
//
// THE COOKIE ADAPTER BINDS TO THE REDIRECT RESPONSE, NOT cookies(). Same both-halves
// discipline as src/proxy.ts: the session cookies the exchange mints are written straight
// onto the response the browser is about to follow, so nothing depends on how Next
// flushes a mutable cookie store into a hand-built NextResponse.
//
// NOT IN src/proxy.ts's MATCHER, on purpose. The proxy's getUser() would run before the
// exchange and find nothing — a wasted auth round-trip on the one route whose whole job
// is to create the session the proxy would be looking for.
//
// ERRORS REDIRECT WITH A FIXED SLUG, never reflected text. /sign-in maps `link` and
// `config` to sentences; forwarding Supabase's error_description would let the query
// string put words on our sign-in page.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

import { safeNext } from "@/lib/auth-redirect";

const OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const toSignIn = (slug: "link" | "config") => {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("error", slug);
    return NextResponse.redirect(url, { status: 303 });
  };

  // Supabase reports a dead link (expired, already used) as error params on the redirect.
  if (params.get("error") || params.get("error_description")) return toSignIn("link");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return toSignIn("config");

  const next = safeNext(params.get("next"));
  const success = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  success.headers.set("Cache-Control", "no-store");

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items) {
        for (const { name, value, options } of items) {
          success.cookies.set(name, value, options);
        }
      },
    },
  });

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? toSignIn("link") : success;
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    return error ? toSignIn("link") : success;
  }

  return toSignIn("link");
}
