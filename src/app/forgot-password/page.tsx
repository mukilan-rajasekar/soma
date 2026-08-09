// /forgot-password — outside the (site) group for the same reason /sign-in is: the
// marketing chrome has nothing to offer someone mid-recovery. Needs its own scroll
// container — globals.css pins html/body to `overflow: hidden` for the fixed landing
// hero. See docs/DESIGN-SYSTEM.md § "Layout note (scrolling)".

import type { Metadata } from "next";

import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "soma · reset password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <ForgotPasswordForm />
    </main>
  );
}
