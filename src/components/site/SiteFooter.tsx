import Link from "next/link";

// prefetch={false} on the auth links: both are in src/proxy.ts's matcher, so a viewport
// prefetch costs an auth round-trip for pages most visitors never open. Everything else
// prefetches as normal.
// Exported: Landing renders these same links as its bottom strip, so the landing and
// the content routes can never drift over which pages exist.
export const SITE_LINKS = [
  { href: "/demo", label: "Demo", prefetch: undefined },
  { href: "/audit", label: "Free audit", prefetch: undefined },
  { href: "/science", label: "Science", prefetch: undefined },
  { href: "/compare", label: "Compare", prefetch: undefined },
  { href: "/sign-in", label: "Sign in", prefetch: false },
  { href: "/sign-up", label: "Create account", prefetch: false },
] as const;

// Shared footer for the scrolling content routes.
export default function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] pb-16 pt-12">
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-3 text-[13px] tracking-[-0.01em]">
        {SITE_LINKS.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            prefetch={l.prefetch}
            className="text-ink-2 transition-colors hover:text-ink"
          >
            {l.label}
          </Link>
        ))}
      </div>
      <p className="max-w-[62ch] text-meta leading-[1.7] text-ink-3">
        Soma &middot; neural ad pre-testing &mdash; the brain&rsquo;s response to
        your ad, read straight from the file.
        <br />
        Built on Meta&rsquo;s Algonauts-winning TRIBE v2 encoder.
      </p>
    </footer>
  );
}
