import Link from "next/link";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/science", label: "Science" },
  { href: "/compare", label: "Compare" },
  { href: "/", label: "Request access" },
] as const;

// Shared footer for the scrolling content routes.
export default function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] pb-16 pt-12">
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-3 text-[13px] tracking-[-0.01em]">
        {LINKS.map((l) => (
          <Link
            key={l.label}
            href={l.href}
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
