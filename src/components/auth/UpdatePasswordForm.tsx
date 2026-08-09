"use client";

// UpdatePasswordForm — the two fields that set a password, and nothing around them.
//
// Used twice: /update-password (the recovery landing, which passes redirectTo so a
// finished reset lands in the studio) and /dashboard/account (which passes nothing and
// shows the inline confirmation instead). The page owns the heading and the framing;
// this component owns only the write, so both screens enforce the same rule from
// src/lib/auth-password.ts.
//
// updateUser() runs on the browser client for the same reason AuthForm's calls do: the
// session cookie handling is @supabase/ssr's, and a hand-rolled endpoint would re-implement
// it for nothing.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MIN_PASSWORD, passwordProblem } from "@/lib/auth-password";
import { browserClient } from "@/lib/supabase/browser";

export default function UpdatePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDone(false);

    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
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
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) {
        setError(authError.message);
        return;
      }

      if (redirectTo) {
        // Same order as AuthForm: refresh so the next server render sees the session,
        // then navigate.
        router.refresh();
        router.push(redirectTo);
        return;
      }

      setPassword("");
      setConfirm("");
      setDone(true);
    } catch {
      setError("Could not reach the authentication service. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col">
        <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
          New password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          disabled={busy}
          className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui text-ink outline-none transition-colors focus:border-ink disabled:opacity-60"
        />
        <span className="mt-1.5 text-meta text-ink-3">
          At least {MIN_PASSWORD} characters.
        </span>
      </label>

      <label className="flex flex-col">
        <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
          Same password, again
        </span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          disabled={busy}
          className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui text-ink outline-none transition-colors focus:border-ink disabled:opacity-60"
        />
      </label>

      {error ? (
        <div role="alert" className="text-meta text-error">
          {error}
        </div>
      ) : null}
      {done ? (
        <div role="status" className="text-meta text-ink-2">
          Password updated.
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-2 cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
