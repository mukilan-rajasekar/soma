// DashboardShell — the chrome every signed-in screen sits inside.
//
// THE YOUTUBE-STUDIO SHAPE, IN THIS DESIGN SYSTEM. Studio's answer is a persistent left
// rail plus a thin top bar, and that is the right structure here: the rail is where "what
// can I do" lives so a screen never has to re-explain itself. What does NOT come across is
// Studio's chrome — no icons, no coloured active state, no filled surfaces. The rail is
// hairline-separated text, the active item is `font-medium text-ink` against `text-ink-2`,
// and that is the entire visual system, exactly as SiteHeader.tsx already does it.
//
// THE RAIL COLLAPSES TO A ROW UNDER `md`, rather than into a hamburger. Two destinations
// do not earn a disclosure control, and a menu that hides half the product on a phone is
// how a dashboard starts feeling like a worse version of the website.
//
// SIGN OUT IS A FORM, NOT A LINK. It POSTs to /api/auth/sign-out, which works with no
// JavaScript and cannot be triggered by a prefetcher. See that route for why GET would be
// wrong.

import Link from "next/link";

import { NavLink } from "./NavLink";

const NAV = [
  { href: "/dashboard", label: "Videos" },
  { href: "/dashboard/brands", label: "Brands" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/serve", label: "Serve" },
  { href: "/dashboard/serve/actions", label: "Actions" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/upload", label: "Upload" },
] as const;

export default function DashboardShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    // Its own scroll container: globals.css pins html/body to `overflow: hidden` for the
    // fixed landing hero, so a route outside the (site) group that omits this cannot
    // scroll at all. docs/DESIGN-SYSTEM.md § "Layout note (scrolling)".
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-paper text-ink">
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-line bg-paper px-[clamp(16px,4vw,26px)] py-[14px]">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-wordmark text-ink">
            soma
          </Link>
          <span className="text-[12px] uppercase tracking-[0.12em] text-ink-3">Studio</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden max-w-[220px] truncate text-meta text-ink-3 sm:block">
            {email}
          </span>
          <form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              className="cursor-pointer rounded-xl border border-line-2 bg-paper px-[13px] py-[7px] text-[13px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Dashboard"
          className="flex shrink-0 gap-x-5 border-b border-line px-[clamp(16px,4vw,26px)] py-3 md:w-[184px] md:flex-col md:gap-y-1 md:border-b-0 md:border-r md:py-6"
        >
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </main>
  );
}
