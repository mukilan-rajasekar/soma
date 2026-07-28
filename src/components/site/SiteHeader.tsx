"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Deliberately one entry. /console, /science and /compare are all still built and still
// reachable by URL — nothing about them was deleted — they are just not advertised in the
// bar any more. Re-adding one is a line here and nothing else.
const LINKS = [
  { href: "/demo", label: "Demo" },
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
        {/* Hidden below `sm`. It mattered more when this was four links wrapping to a second
            row at 390px; with one link it is close to free, and it is kept because the rule
            it encodes is still right: the wordmark and the one primary CTA are what a phone
            needs, and it survives the list growing back. */}
        <div className="hidden flex-wrap items-center gap-x-[22px] gap-y-2 sm:flex">
          {links.map((l) => {
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
        {recording ? null : (
          <Link
            href="/"
            className="rounded-xl bg-ink px-[15px] py-[9px] text-[14px] font-medium tracking-[-0.01em] text-paper transition-colors hover:bg-ink/85"
          >
            Request access
          </Link>
        )}
      </nav>
    </header>
  );
}
