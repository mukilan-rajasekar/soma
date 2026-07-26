"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/console", label: "Console" },
  { href: "/science", label: "Science" },
  { href: "/compare", label: "Compare" },
] as const;

// Shared top bar for the scrolling content routes. Sticky within the (site) scroll
// container. usePathname highlights the current section, so this is a client island.
// Minimal system: wordmark · restrained inter-page text links · one primary CTA.
export default function SiteHeader() {
  const pathname = usePathname();
  // bg-paper/85 let 34px section headlines smear through the bar as grey ghosts as they
  // scrolled under it — very visible in a screen recording. /95 keeps the blurred depth
  // without the text bleeding through.
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-6 border-b border-line bg-paper/95 px-[clamp(16px,4vw,26px)] py-[14px] backdrop-blur-md">
      <Link href="/" className="text-wordmark text-ink">
        soma
      </Link>
      <nav className="flex flex-wrap items-center justify-end gap-x-[22px] gap-y-2">
        {/* Hidden below `sm`: at 390px the four text links wrapped to a second row, which
            made the header two lines tall and pushed the wordmark off the top row. The
            wordmark and the one primary CTA are what a phone needs; the section links are
            reachable by scrolling, which is the whole page. */}
        <div className="hidden flex-wrap items-center gap-x-[22px] gap-y-2 sm:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
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
