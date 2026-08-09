// /sign-in — outside the (site) group on purpose.
//
// (site)/layout.tsx wraps its children in the shared header + footer, and a sign-in screen
// wants neither: the header's one CTA is "Request access", which is a strange thing to
// offer someone who is three keystrokes into having an account. It does still need its own
// scroll container — globals.css forces `overflow: hidden` on html/body for the fixed
// landing hero, so any full-page route outside (site) that does not do this cannot scroll.
// See docs/DESIGN-SYSTEM.md § "Layout note (scrolling)".

import type { Metadata } from "next";

import AuthForm from "@/components/auth/AuthForm";
import { safeNext } from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "soma · sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <AuthForm mode="sign-in" next={safeNext(next)} errorSlug={error} />
    </main>
  );
}
