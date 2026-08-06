"use client";

// The one client island in the dashboard chrome. usePathname needs the browser, and
// isolating it here keeps DashboardShell — and therefore every page that renders inside
// it — a Server Component.

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();

  // /dashboard must not light up while you are inside /dashboard/upload, but it SHOULD
  // stay lit on /dashboard/v/<token>/<ad>, which is a video — a child of the library.
  // So: exact match for the root, prefix match for everything else.
  const active =
    href === "/dashboard"
      ? pathname === "/dashboard" || pathname.startsWith("/dashboard/v/")
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-my-[6px] py-[6px] text-[14px] tracking-[-0.01em] transition-colors md:-mx-2 md:my-0 md:rounded-xl md:px-2 md:py-[7px] ${
        active
          ? "font-medium text-ink md:bg-fill"
          : "text-ink-2 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
