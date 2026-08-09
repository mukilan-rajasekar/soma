"use client";

// ForgotPasswordForm — one field, and the same answer no matter what.
//
// THE NOTICE NEVER VARIES. Whether the address has an account, has none, or the request
// was rate-limited, the screen says the same sentence. Any difference in the response is
// an oracle that confirms which emails have accounts here — the classic enumeration bug
// in exactly this form — so the result of resetPasswordForEmail() is deliberately not
// consulted for the UI.
//
// THE LINK LANDS ON /auth/callback with next=/update-password: the callback turns the
// emailed credential into a session, and the update screen behind requireUser() does the
// rest. See src/app/auth/callback/route.ts for the two credential shapes it accepts.

import Link from "next/link";
import { useState } from "react";

import { browserClient } from "@/lib/supabase/browser";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const supabase = browserClient();
    if (!supabase) {
      setError(
        "Accounts are not configured on this deployment: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are unset.",
      );
      return;
    }

    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fupdate-password`,
      });
    } catch {
      // Ignored on purpose — the notice below is the same either way. See the header.
    } finally {
      setSent(true);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-[420px] flex-col justify-center px-[clamp(18px,5vw,24px)] py-[clamp(48px,12vh,110px)]">
      <Link href="/" className="text-wordmark text-ink">
        soma
      </Link>

      <h1 className="mt-8 text-balance text-hero text-ink">
        Reset your <span className="font-serif font-normal italic">password</span>.
      </h1>
      <p className="mt-4 text-pretty text-body text-ink-2">
        Tell us the address on the account and we email you a link that lets you choose a
        new one.
      </p>

      {sent ? (
        <p role="status" className="mt-9 rounded-2xl border border-line bg-fill p-5 text-body text-ink-2">
          If that address has an account, a reset link is on its way. The link works once
          and expires in an hour.
        </p>
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
            {busy ? "Sending…" : "Email me a reset link"}
          </button>
        </form>
      )}

      <p className="mt-7 text-meta text-ink-3">
        Remembered it?{" "}
        <Link
          href="/sign-in"
          prefetch={false}
          className="text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
