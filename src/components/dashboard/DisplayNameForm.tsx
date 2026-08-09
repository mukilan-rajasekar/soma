"use client";

// DisplayNameForm — the write that makes displayName() mean something.
//
// The name lives in auth user_metadata (full_name), not in a table of ours: it is chrome,
// not data, and Supabase already stores it against the user. updateUser() on the browser
// client writes it; router.refresh() re-renders the Server Components above so the shell
// chip picks the new name up on the same screen, no reload.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserClient } from "@/lib/supabase/browser";

export default function DisplayNameForm({ initial }: { initial: string }) {
  const router = useRouter();

  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    const trimmed = name.trim().replace(/\s+/g, " ");
    if (trimmed.length > 80) {
      setError("Keep the name to 80 characters or fewer.");
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
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: trimmed },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      setName(trimmed);
      setSaved(true);
      router.refresh();
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
          Display name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
          disabled={busy}
          placeholder="How the studio greets you"
          className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink disabled:opacity-60"
        />
        <span className="mt-1.5 text-meta text-ink-3">
          Blank falls back to the part of your email before the @.
        </span>
      </label>

      {error ? (
        <div role="alert" className="text-meta text-error">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div role="status" className="text-meta text-ink-2">
          Saved.
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="cursor-pointer self-start rounded-xl border border-line-2 bg-paper px-[15px] py-[9px] text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}
