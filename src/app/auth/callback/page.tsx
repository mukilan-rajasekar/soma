// /auth/callback — where Supabase's emailed links land.
//
// A PAGE, NOT A ROUTE HANDLER. Turning the one-time credential into a session is a
// cookie write. Next 16 Route Handlers that return a 303 drop Set-Cookie (recovery
// exchanged successfully in memory, then src/proxy.ts bounced /update-password to
// /sign-in). The browser client is the same adapter sign-in already uses, so the
// cookies actually stick. JS is already required for every other auth form.
//
// TWO CREDENTIAL SHAPES. Default email templates ({{ .ConfirmationURL }}) arrive as
// `?code=…` (PKCE; the verifier cookie exists only in the browser that started the
// flow). `?token_hash=…&type=…` is the {{ .TokenHash }} shape and needs no cookie.
// The client tries whichever is present.
//
// NOT IN src/proxy.ts's MATCHER. The proxy's getUser() would run before this page's
// effect and find nothing.
//
// ERRORS REDIRECT WITH A FIXED SLUG. /sign-in maps `link` and `config`; the query
// string is not allowed to put its own words on that page.

import type { Metadata } from "next";

import AuthCallbackClient from "@/components/auth/AuthCallbackClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "soma · signing in",
  robots: { index: false, follow: false },
};

export default function AuthCallbackPage() {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <AuthCallbackClient />
    </main>
  );
}
