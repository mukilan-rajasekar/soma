"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { safeNext } from "@/lib/auth-redirect";
import { browserClient } from "@/lib/supabase/browser";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

export default function AuthCallbackClient() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("error") || params.get("error_description")) {
        router.replace("/sign-in?error=link");
        return;
      }

      const supabase = browserClient();
      if (!supabase) {
        router.replace("/sign-in?error=config");
        return;
      }

      const next = safeNext(params.get("next"));
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      const { data, error } = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : tokenHash && isEmailOtpType(type)
          ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
          : { data: { session: null }, error: { message: "missing credential" } };

      if (cancelled) return;
      if (error || !data.session) {
        router.replace("/sign-in?error=link");
        return;
      }

      router.refresh();
      router.replace(next);
    };

    run().catch(() => {
      if (!cancelled) {
        setMessage("Could not complete that. Try again.");
        router.replace("/sign-in?error=link");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-full max-w-[420px] flex-col justify-center px-[clamp(18px,5vw,24px)] py-[clamp(48px,12vh,110px)]">
      <Link href="/" className="text-wordmark text-ink">
        soma
      </Link>
      <p role="status" className="mt-8 text-body text-ink-2">
        {message}
      </p>
    </div>
  );
}
