"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Deliberately one entry. /console, /science and /compare are all still built and still
// reachable by URL — nothing about them was deleted — they are just not advertised in the
// bar any more. Re-adding one is a line here and nothing else.
const LINKS = [
  { href: "/demo", label: "Demo", prefetch: undefined },
  { href: "/pricing", label: "Pricing", prefetch: undefined },
  // The door into the logged-in product. It is a plain link rather than a session-aware
  // control on purpose: making this bar know whether you are signed in would turn a
  // Server Component rendered on every marketing page into one that must await an auth
  // round-trip first. /dashboard redirects a signed-out visitor to /sign-in and carries
  // them back afterwards, so the link is correct either way.
  //
  // prefetch={false} IS LOAD-BEARING, and the smoke pass is what found it. Next prefetches
  // a Link's RSC payload when it enters the viewport; /dashboard answers with a redirect,
  // and the aborted prefetch surfaces as a failed request on every page carrying this bar
  // (scripts/smoke.mjs flagged /preflight and /upload). Prefetching a route that exists to
  // bounce you is wasted work regardless — the flag removes the fetch, not a feature.
  { href: "/dashboard", label: "Studio", prefetch: false },
] as const;

// Shared top bar for the scrolling content routes. Sticky within the (site) scroll
// container. usePathname highlights the current section, so this is a client island.
// Minimal system: wordmark · restrained inter-page text links · one primary CTA.
export default function SiteHeader() {
  const pathname = usePathname();
  // /demo-short is the recording surface, and a link labelled "Demo" on it points at a second
  // copy of the page you are already reading.
  //
  // The CTA goes too, and only there. This bar is sticky, so on the recording it is not one
  // frame with a button in it — it is a black pill in the top-right corner of EVERY frame, for
  // three minutes, over every figure the page is trying to get looked at. The page already ends
  // on "Request access" at full size with the address under it, which is the ask, made once,
  // where a viewer is ready for it. Every other route keeps the bar exactly as it was.
  const recording = pathname === "/demo";
  const links = recording ? [] : LINKS;
  // bg-paper/85 let 34px section headlines smear through the bar as grey ghosts as they
  // scrolled under it — very visible in a screen recording. /95 keeps the blurred depth
  // without the text bleeding through.
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-6 border-b border-line bg-paper/95 px-[clamp(16px,4vw,26px)] py-[14px] backdrop-blur-md">
      <Link href="/" className="text-wordmark text-ink">
        soma
      </Link>
      <nav className="flex flex-wrap items-center justify-end gap-x-[22px] gap-y-2">
        {/* Hidden below `sm`. The inter-page links wrap into a second row at 390px, so a
            phone gets the three controls that matter — wordmark · Sign in · Create
            account — and the section links stay desktop-only. "Sign in" lives OUTSIDE
            this div for exactly that reason: hiding it left a phone with no door into
            the product at all. */}
        <div className="hidden flex-wrap items-center gap-x-[22px] gap-y-2 sm:flex">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                prefetch={l.prefetch}
                aria-current={active ? "page" : undefined}
                // The links rendered 21px tall, well under the 44px minimum touch target.
                // Padding plus an equal negative margin grows the hit area to ~45px without
                // changing the header's layout height or the 68px anchor scroll-margin.
                className={`-my-[12px] py-[12px] text-[14px] tracking-[-0.01em] transition-colors ${
                  active
                    ? "font-medium text-ink"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        {/* prefetch={false} on both auth links: /sign-in and /sign-up are in
            src/proxy.ts's matcher, so a viewport prefetch fires an auth round-trip for
            pages most visitors never open — the same reasoning as the Studio link. */}
        {recording ? null : (
          <Link
            href="/sign-in"
            prefetch={false}
            className="-my-[12px] py-[12px] text-[14px] tracking-[-0.01em] text-ink-2 transition-colors hover:text-ink"
          >
            Sign in
          </Link>
        )}
        {recording ? null : (
          <Link
            href="/sign-up"
            prefetch={false}
            className="rounded-xl bg-ink px-[15px] py-[9px] text-[14px] font-medium tracking-[-0.01em] text-paper transition-colors hover:bg-ink/85"
          >
            Create account
          </Link>
        )}
      </nav>
    </header>
  );
}
