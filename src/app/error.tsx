"use client";

// The route-level error boundary — what an unhandled render error shows instead of
// Next's default white page. Client component by the framework's contract.
//
// unstable_retry ?? reset: this Next version documents unstable_retry (added 16.2.0,
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md) as
// the preferred re-render hook, with reset still present. Typing both optional and
// preferring the new one means a Next minor dropping either prop cannot break the one
// page whose job is to survive breakage.
//
// The digest goes to the console, not the screen: it is the correlation id for server
// logs, and a visitor can do nothing with it.

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error("render error", error.digest ?? "", error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <div className="mx-auto flex min-h-full max-w-[560px] flex-col justify-center px-[clamp(18px,5vw,24px)] py-[clamp(48px,12vh,110px)]">
        <Link href="/" className="text-wordmark text-ink">
          soma
        </Link>

        <h1 className="mt-8 text-balance text-hero text-ink">
          Something <span className="font-serif font-normal italic">broke</span>.
        </h1>
        <p className="mt-4 max-w-[48ch] text-pretty text-body text-ink-2">
          Not your fault, and nothing you entered was lost to it. Trying again usually
          works; if it keeps happening, we want to know.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-5">
          {retry ? (
            <button
              type="button"
              onClick={() => retry()}
              className="cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
            >
              Try again
            </button>
          ) : null}
          <Link
            href="/"
            className="text-ui text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
          >
            Back to the start
          </Link>
        </div>
      </div>
    </main>
  );
}
