"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/science", label: "Science" },
  { href: "/compare", label: "Compare" },
  { href: "/faq", label: "FAQ" },
] as const;

// Shared top bar for the scrolling content routes. Sticky within the (site) scroll
// container. usePathname highlights the current section, so this is a client island.
export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#ececec] bg-white/85 px-[clamp(16px,4vw,26px)] py-3 backdrop-blur-md">
      <Link
        href="/"
        className="text-[19px] font-medium tracking-[-0.02em] text-[#0a0a0a]"
      >
        soma
      </Link>
      <nav className="flex flex-wrap items-center justify-end gap-1">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-[6px] font-mono text-[12px] transition-colors ${
                active
                  ? "bg-[#f0f0f0] text-[#0a0a0a]"
                  : "text-[#6b6b6b] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        <Link
          href="/"
          className="ml-1 rounded-full border border-[#d8d8d8] px-3 py-[6px] font-mono text-[12px] text-[#0a0a0a] transition-colors hover:border-[#0a0a0a]"
        >
          Request access
        </Link>
      </nav>
    </header>
  );
}
