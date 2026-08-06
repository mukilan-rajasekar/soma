// /sign-up — the sibling of /sign-in. See that file for why both sit outside the (site)
// route group and mount their own scroll container.

import type { Metadata } from "next";

import AuthForm from "@/components/auth/AuthForm";
import { safeNext } from "@/lib/auth-redirect";

export const metadata: Metadata = {
  title: "soma · create an account",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <AuthForm mode="sign-up" next={safeNext(next)} />
    </main>
  );
}
