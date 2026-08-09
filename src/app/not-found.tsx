// The 404 every bad URL lands on. Wrapped only by the root layout, which gives it no
// scroll container — globals.css pins html/body to `overflow: hidden` for the fixed
// landing hero, so this page mounts its own or it cannot scroll on a short viewport.
// docs/DESIGN-SYSTEM.md § "Layout note (scrolling)".
//
// Three exits, and no more: home, the demo, sign in. A 404 is where typos, dead
// bookmarks and revoked links end up, so the page's whole job is to hand the visitor
// back to something that exists.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "soma · not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <div className="mx-auto flex min-h-full max-w-[560px] flex-col justify-center px-[clamp(18px,5vw,24px)] py-[clamp(48px,12vh,110px)]">
        <Link href="/" className="text-wordmark text-ink">
          soma
        </Link>

        <h1 className="mt-8 text-balance text-hero text-ink">
          Nothing lives at this{" "}
          <span className="font-serif font-normal italic">address</span>.
        </h1>
        <p className="mt-4 max-w-[48ch] text-pretty text-body text-ink-2">
          The link may be old, mistyped, or pointing at something that was never shared
          with this account. Result links — <span className="tabular-nums">/r/…</span> —
          only answer for exactly the token they were minted with.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-5">
          <Link
            href="/"
            className="inline-block rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
          >
            Back to the start
          </Link>
          <Link
            href="/demo"
            className="text-ui text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
          >
            See the demo
          </Link>
          <Link
            href="/sign-in"
            prefetch={false}
            className="text-ui text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
