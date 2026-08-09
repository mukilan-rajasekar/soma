"use client";

// AuthForm — sign in and sign up, one component, because they differ by four strings and
// a single Supabase call. Two files would drift.
//
// DESIGN. Straight out of docs/DESIGN-SYSTEM.md: hairline inputs on paper, one black
// primary button, `text-error` for validation, and exactly ONE serif-italic accent word in
// the heading. No card, no shadow, no second colour — a sign-in page is the least
// interesting screen in a product and dressing it up would be the first thing on the site
// that looks like someone else's template.
//
// WHY THE BROWSER CLIENT AND NOT A ROUTE HANDLER. signInWithPassword() on the browser
// client writes the auth cookies through @supabase/ssr's adapter, so the very next server
// render already sees the session. Posting to our own endpoint would mean hand-rolling
// that cookie write for nothing.
//
// router.refresh() BEFORE push(). The dashboard is a Server Component that reads the user
// during render. Without the refresh, Next can serve a cached signed-out render of
// /dashboard and the person who just typed their password lands back on the sign-in page.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MIN_PASSWORD } from "@/lib/auth-password";
import { browserClient } from "@/lib/supabase/browser";

type Mode = "sign-in" | "sign-up";

// Sentences for the fixed slugs /auth/callback redirects with. Slugs rather than text so
// the query string can never put its own words on this page.
const SLUG_ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Ask for a new one.",
  config:
    "Accounts are not configured on this deployment: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are unset.",
};

const COPY = {
  "sign-in": {
    heading: "Welcome",
    accent: "back",
    blurb: "Your scored cuts, your edits, and everything you have run through Soma.",
    action: "Sign in",
    pending: "Signing in…",
    altPrompt: "No account yet?",
    altLabel: "Create one",
    altHref: "/sign-up",
  },
  "sign-up": {
    heading: "Start with one",
    accent: "ad",
    blurb: "Upload a cut, get it scored second by second, and search the edit space around it.",
    action: "Create account",
    pending: "Creating…",
    altPrompt: "Already have an account?",
    altLabel: "Sign in",
    altHref: "/sign-in",
  },
} as const;

export default function AuthForm({
  mode,
  next,
  errorSlug,
}: {
  mode: Mode;
  next: string;
  errorSlug?: string;
}) {
  const copy = COPY[mode];
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(errorSlug ? (SLUG_ERRORS[errorSlug] ?? "") : "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    const supabase = browserClient();
    if (!supabase) {
      setError(
        "Accounts are not configured on this deployment: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are unset.",
      );
      return;
    }

    if (mode === "sign-up" && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    try {
      const { data, error: authError } =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                // With email confirmation ON, the confirmation link needs somewhere to
                // land that can turn it into a session. /auth/callback is that place.
                emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fdashboard`,
              },
            });

      if (authError) {
        setError(authError.message);
        return;
      }

      // Sign-up with email confirmation ON returns a user but no session. Saying so is
      // better than a redirect to a dashboard that bounces straight back here.
      if (!data.session) {
        setNotice("Check your email to confirm the address, then sign in.");
        return;
      }

      router.refresh();
      router.push(next);
    } catch {
      setError("Could not reach the authentication service. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-[420px] flex-col justify-center px-[clamp(18px,5vw,24px)] py-[clamp(48px,12vh,110px)]">
      <Link href="/" className="text-wordmark text-ink">
        soma
      </Link>

      <h1 className="mt-8 text-balance text-hero text-ink">
        {copy.heading} <span className="font-serif font-normal italic">{copy.accent}</span>.
      </h1>
      <p className="mt-4 text-pretty text-body text-ink-2">{copy.blurb}</p>

      <form onSubmit={submit} className="mt-9 flex flex-col gap-4" noValidate>
        <label className="flex flex-col">
          <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            disabled={busy}
            placeholder="you@brand.com"
            className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col">
          <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "sign-up" ? MIN_PASSWORD : undefined}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            disabled={busy}
            className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui text-ink outline-none transition-colors focus:border-ink disabled:opacity-60"
          />
          {mode === "sign-up" ? (
            <span className="mt-1.5 text-meta text-ink-3">
              At least {MIN_PASSWORD} characters.
            </span>
          ) : (
            <span className="mt-1.5 text-meta">
              {/* prefetch={false}: /forgot-password is in src/proxy.ts's matcher, so a
                  prefetch costs an auth round-trip for a page most sign-ins never open. */}
              <Link
                href="/forgot-password"
                prefetch={false}
                className="text-ink-3 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
              >
                Forgot your password?
              </Link>
            </span>
          )}
        </label>

        {error ? (
          <div role="alert" className="text-meta text-error">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="text-meta text-ink-2">
            {notice}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? copy.pending : copy.action}
        </button>
      </form>

      <p className="mt-7 text-meta text-ink-3">
        {copy.altPrompt}{" "}
        {/* prefetch={false} for the same reason the dashboard link carries it. Both
            /sign-in and /sign-up are named in src/proxy.ts's matcher, so prefetching the
            opposite page fires an auth round-trip to Supabase for a page most visitors
            never open — and the request is then cancelled when they navigate or close the
            tab, which surfaces as an aborted RSC fetch. These are two small forms; there
            is nothing here worth pre-loading at the cost of a session lookup. */}
        <Link
          href={copy.altHref}
          prefetch={false}
          className="text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
        >
          {copy.altLabel}
        </Link>
      </p>

      <p className="mt-10 text-meta text-ink-3">
        A result link you were sent — <span className="tabular-nums">/r/…</span> — keeps
        working without an account. Signing in is how you get all of them in one place.
      </p>
    </div>
  );
}
