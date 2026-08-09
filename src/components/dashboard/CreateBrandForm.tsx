"use client";

// CreateBrandForm — a name and a consent flag, nothing else.
//
// This is the first thing a new account is asked to do, and every extra field here is a
// form standing between someone and their first upload. A brand IS a name plus a training
// decision; platforms, budgets and goals all belong to later screens that already exist.
//
// CONSENT DEFAULTS OFF and the label says what it actually changes: what we may train on
// — never who can see the work. Pre-ticking it would turn a legal record into a dark
// pattern, and the server only honours a literal `true` anyway.
//
// router.refresh() after success re-renders the Server Components above through RLS, so
// the new brand appears on the same screen without a reload. redirectTo is for the
// first-run card, which wants to walk the person forward rather than re-render in place.

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateBrandForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Give the brand a name.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/brands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), trainingConsent: consent }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(body.error ?? "Could not create this brand.");
        return;
      }

      router.refresh();
      if (redirectTo) router.push(redirectTo);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-[420px] flex-col gap-4" noValidate>
      <label className="flex flex-col">
        <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
          Brand name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          autoComplete="organization"
          disabled={busy}
          placeholder="Northwind Coffee"
          className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink disabled:opacity-60"
        />
      </label>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={busy}
          className="mt-[3px] size-4 shrink-0 accent-ink"
        />
        <span className="text-meta text-ink-2">
          Let Soma learn from this brand&rsquo;s ads.
          <span className="mt-0.5 block text-ink-3">
            Off by default. It changes what we may train on — never who can see your work.
          </span>
        </span>
      </label>

      {error ? (
        <div role="alert" className="text-meta text-error">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-2 cursor-pointer self-start rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create brand"}
      </button>
    </form>
  );
}
