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

import { authErrorMessage } from "@/lib/auth-errors";
import { emailProblem, MIN_PASSWORD, passwordProblem } from "@/lib/auth-password";
import { hrefWithNext } from "@/lib/auth-redirect";
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
    altPath: "/sign-up",
  },
  "sign-up": {
    heading: "Start with one",
    accent: "ad",
    blurb: "Upload a cut, get it scored second by second, and search the edit space around it.",
    action: "Create account",
    pending: "Creating…",
    altPrompt: "Already have an account?",
    altLabel: "Sign in",
    altPath: "/sign-in",
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
  // Non-empty after a sign-up that needs email confirmation: the address the link went
  // to. It REPLACES the form rather than annotating it — a one-line notice above a
  // still-live "Create account" button reads as "nothing happened", and the first real
  // signup missed it exactly that way.
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // noValidate means these run instead of the browser's. Catching them here keeps
    // Supabase's "missing email or phone" (a field we do not have) off the page.
    const trimmedEmail = email.trim();
    const emailIssue = emailProblem(trimmedEmail);
    if (emailIssue) {
      setError(emailIssue);
      return;
    }
    // Sign-in only needs non-empty: the password already exists. Sign-up shares the
    // minimum with /update-password via passwordProblem().
    const passwordIssue =
      mode === "sign-up"
        ? passwordProblem(password)
        : password
          ? null
          : "Enter a password.";
    if (passwordIssue) {
      setError(passwordIssue);
      return;
    }

    const supabase = browserClient();
    if (!supabase) {
      setError(
        "Accounts are not configured on this deployment: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are unset.",
      );
      return;
    }

    setBusy(true);
    try {
      const { data, error: authError } =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
          : await supabase.auth.signUp({
              email: trimmedEmail,
              password,
              options: {
                // With email confirmation ON, the confirmation link needs somewhere to
                // land that can turn it into a session. /auth/callback is that place.
                // `next` is already safeNext'd by the page — encodeURIComponent so a
                // path with its own query string survives the round-trip.
                emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
              },
            });

      if (authError) {
        setError(authErrorMessage(authError));
        return;
      }

      // Sign-up with email confirmation ON returns a user but no session. Swap the form
      // for the check-your-inbox card — a redirect to a dashboard that bounces straight
      // back here would be worse, and a quiet notice under the password field is missed.
      if (!data.session) {
        setSentTo(email);
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

      {sentTo ? (
        <div role="status" className="mt-9 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">Now check your inbox.</h2>
          <p className="mt-3 text-pretty text-body text-ink-2">
            We sent a confirmation link to{" "}
            <span className="font-medium text-ink">{sentTo}</span>. Click it and you land
            in the studio, signed in — there is nothing more to do on this page.
          </p>
          <p className="mt-3 text-pretty text-meta text-ink-3">
            Nothing arriving? Check spam, or the address above for a typo.
          </p>
          <button
            type="button"
            onClick={() => setSentTo("")}
            className="mt-5 cursor-pointer rounded-xl border border-line-2 bg-paper px-[15px] py-[9px] text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            Use a different address
          </button>
        </div>
      ) : (
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
                href={hrefWithNext("/forgot-password", next)}
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

        <button
          type="submit"
          disabled={busy}
          className="mt-2 cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? copy.pending : copy.action}
        </button>
      </form>
      )}

      <p className="mt-7 text-meta text-ink-3">
        {copy.altPrompt}{" "}
        {/* prefetch={false} for the same reason the dashboard link carries it. Both
            /sign-in and /sign-up are named in src/proxy.ts's matcher, so prefetching the
            opposite page fires an auth round-trip to Supabase for a page most visitors
            never open — and the request is then cancelled when they navigate or close the
            tab, which surfaces as an aborted RSC fetch. These are two small forms; there
            is nothing here worth pre-loading at the cost of a session lookup.
            hrefWithNext keeps a guarded destination across the hop so someone who hit
            /dashboard/upload, bounced here, and then creates an account still lands back
            on upload rather than the library root. */}
        <Link
          href={hrefWithNext(copy.altPath, next)}
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
