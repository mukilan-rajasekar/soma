// /forgot-password — outside the (site) group for the same reason /sign-in is: the
// marketing chrome has nothing to offer someone mid-recovery. Needs its own scroll
// container — globals.css pins html/body to `overflow: hidden` for the fixed landing
// hero. See docs/DESIGN-SYSTEM.md § "Layout note (scrolling)".

import type { Metadata } from "next";

import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { safeNext } from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "soma · reset password",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <ForgotPasswordForm next={safeNext(next)} />
    </main>
  );
}
