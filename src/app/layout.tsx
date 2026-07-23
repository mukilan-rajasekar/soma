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

export const metadata: Metadata = {
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
