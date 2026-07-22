import Link from "next/link";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/science", label: "Science" },
  { href: "/compare", label: "Compare" },
  { href: "/faq", label: "FAQ" },
  { href: "/", label: "Request access" },
] as const;

// Shared footer for the scrolling content routes.
export default function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[920px] border-t border-[#e2e2e2] px-[clamp(16px,4vw,24px)] pb-16 pt-10">
      <div className="mb-4 flex flex-wrap gap-4 font-mono text-[12px]">
        {LINKS.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="text-[#6b6b6b] hover:text-[#0a0a0a]"
          >
            {l.label}
          </Link>
        ))}
      </div>
      <p className="font-mono text-[11px] leading-[1.9] tracking-[0.02em] text-[#8a8a8a]">
        Soma &middot; neural ad pre-testing &mdash; a predicted brain response to
        your ad, from the file.
        <br />
        Built on Meta&rsquo;s public TRIBE v2 encoder. The encoder is validated;
        the read-out on top is ours, and under test.
      </p>
    </footer>
  );
}
