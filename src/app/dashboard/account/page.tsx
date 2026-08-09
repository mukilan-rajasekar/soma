// /dashboard/account — the person behind the session.
//
// The dashboard layout has already established the user; requireUser() here re-reads it
// because this page renders identity fields and must not trust a stale prop. Everything
// on this screen writes through the browser client (auth metadata and password are
// Supabase Auth's, not rows of ours), so there is no route handler behind it.
//
// Sign out appears here as well as in the shell chrome: a settings page that cannot end
// the session sends people hunting through the header for the exit.

import type { Metadata } from "next";

import UpdatePasswordForm from "@/components/auth/UpdatePasswordForm";
import DisplayNameForm from "@/components/dashboard/DisplayNameForm";
import { displayName, requireUser } from "@/lib/supabase/session";

export const metadata: Metadata = {
  title: "soma · account",
};

export default async function AccountPage() {
  const user = await requireUser("/dashboard/account");

  const meta = user.user_metadata as { full_name?: unknown } | null;
  const storedName = typeof meta?.full_name === "string" ? meta.full_name : "";
  const since = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <h1 className="text-balance text-hero text-ink">
        Your <span className="font-serif font-normal italic">account</span>.
      </h1>
      <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
        The name the studio greets you by, the address you sign in with, and the password
        that guards both.
      </p>

      <section className="mt-11">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Who you are</h2>
        <dl className="mt-3 rounded-2xl border border-line bg-paper p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <dt className="text-meta text-ink-3">Signs in as</dt>
            <dd className="min-w-0 truncate text-ui text-ink">{user.email ?? "—"}</dd>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line pt-3">
            <dt className="text-meta text-ink-3">Greeted as</dt>
            <dd className="min-w-0 truncate text-ui text-ink">{displayName(user)}</dd>
          </div>
          {since ? (
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line pt-3">
              <dt className="text-meta text-ink-3">Here since</dt>
              <dd className="text-ui tabular-nums text-ink">{since}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 max-w-[420px]">
          <DisplayNameForm initial={storedName} />
        </div>
      </section>

      <section className="mt-11 border-t border-line pt-9">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Password</h2>
        <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
          Changing it here signs nothing out — it simply applies from the next sign-in.
        </p>
        <div className="mt-5 max-w-[420px]">
          <UpdatePasswordForm />
        </div>
      </section>

      <section className="mt-11 border-t border-line pt-9">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Session</h2>
        <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
          Signing out ends this session on this browser. Result links you have been sent —{" "}
          <span className="tabular-nums">/r/…</span> — keep working without it.
        </p>
        <form action="/api/auth/sign-out" method="post" className="mt-5">
          <button
            type="submit"
            className="cursor-pointer rounded-xl border border-line-2 bg-paper px-[15px] py-[9px] text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
