import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// Site sans. Geist is a clean neo-grotesque — the "system grotesque" the design system
// asks for, self-hosted by next/font (no runtime request, no layout shift). It fills the
// --font-sans slot the tokens reference; the serif accent stays Georgia.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

// metadataBase belongs here rather than per-route: it is what turns every relative URL in a
// metadata export (og:url, twitter:image, canonical, the generated opengraph-image routes)
// into an absolute one. Without it `next build` falls back to http://localhost:3000, so a
// link to any route previews against a dead host wherever it is pasted. /demo and
// /demo-short each set their own copy; every other route had none.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.usesoma.work"),
  title: "soma — videos that earn attention",
  description:
    "Soma scores your footage, generates new cuts from a prompt, and edits with AI — all tuned to how your audience actually watches.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${geist.variable}`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
