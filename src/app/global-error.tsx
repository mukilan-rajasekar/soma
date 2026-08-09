"use client";

// The boundary of last resort: it replaces the ROOT LAYOUT when the layout itself
// throws, so it must render its own <html> and <body> and import the stylesheet the
// missing layout would have provided. Kept short enough to need no scroll container.
// React's <title> is used because a client component cannot export metadata.

import "./globals.css";

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const retry = unstable_retry ?? reset;
  console.error("root render error", error.digest ?? "", error);

  return (
    <html lang="en">
      <body className="bg-paper text-ink">
        <title>soma · error</title>
        <main className="fixed inset-0 flex items-center justify-center px-6">
          <div className="max-w-[480px]">
            <div className="text-wordmark text-ink">soma</div>
            <h1 className="mt-6 text-balance text-hero text-ink">
              Something <span className="font-serif font-normal italic">broke</span>.
            </h1>
            <p className="mt-4 text-pretty text-body text-ink-2">
              The whole page failed to render. Reloading is the fix for almost all of
              these.
            </p>
            <div className="mt-8">
              {/* A hard navigation, not <Link>: this file renders because the root
                  layout — and with it the router — failed. window.location is the one
                  escape hatch that owes nothing to the tree that just died. */}
              <button
                type="button"
                onClick={() => (retry ? retry() : window.location.assign("/"))}
                className="cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
              >
                {retry ? "Try again" : "Back to the start"}
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
