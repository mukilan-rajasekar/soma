import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
