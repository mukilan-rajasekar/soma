"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/console", label: "Console" },
  { href: "/science", label: "Science" },
  { href: "/compare", label: "Compare" },
  { href: "/faq", label: "FAQ" },
] as const;

// Shared top bar for the scrolling content routes. Sticky within the (site) scroll
// container. usePathname highlights the current section, so this is a client island.
// Minimal system: wordmark · restrained inter-page text links · one primary CTA.
export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-6 border-b border-line bg-paper/85 px-[clamp(16px,4vw,26px)] py-[14px] backdrop-blur-md">
      <Link href="/" className="text-wordmark text-ink">
        soma
      </Link>
      <nav className="flex flex-wrap items-center justify-end gap-x-[22px] gap-y-2">
        <div className="flex flex-wrap items-center gap-x-[22px] gap-y-2">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`text-[14px] tracking-[-0.01em] transition-colors ${
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
        <Link
          href="/"
          className="rounded-xl bg-ink px-[15px] py-[9px] text-[14px] font-medium tracking-[-0.01em] text-paper transition-colors hover:bg-ink/85"
        >
          Request access
        </Link>
      </nav>
    </header>
  );
}
