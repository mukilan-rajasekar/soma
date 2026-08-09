// /update-password — where a recovery link finishes.
//
// /auth/callback has already turned the emailed credential into a session by the time
// anyone arrives here, so requireUser() is the only gate this page needs: a signed-in
// visitor (recovered or otherwise) may set a new password, and a signed-out one is
// bounced to /sign-in like any other guarded route. That is also why src/proxy.ts does
// NOT redirect signed-in users away from this path the way it does for /sign-in — a
// recovery session IS signed in, and this page is exactly where it belongs.
//
// Outside the (site) group, so it mounts its own scroll container (globals.css pins
// html/body to `overflow: hidden`). docs/DESIGN-SYSTEM.md § "Layout note (scrolling)".

import type { Metadata } from "next";
import Link from "next/link";

import UpdatePasswordForm from "@/components/auth/UpdatePasswordForm";
import { requireUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "soma · new password",
  robots: { index: false, follow: false },
};

export default async function UpdatePasswordPage() {
  await requireUser("/update-password");

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <div className="mx-auto flex min-h-full max-w-[420px] flex-col justify-center px-[clamp(18px,5vw,24px)] py-[clamp(48px,12vh,110px)]">
        <Link href="/" className="text-wordmark text-ink">
          soma
        </Link>

        <h1 className="mt-8 text-balance text-hero text-ink">
          Choose a new <span className="font-serif font-normal italic">password</span>.
        </h1>
        <p className="mt-4 text-pretty text-body text-ink-2">
          You are signed in through the emailed link. Set the new password and you land
          back in the studio.
        </p>

        <div className="mt-9">
          <UpdatePasswordForm redirectTo="/dashboard" />
        </div>
      </div>
    </main>
  );
}
