"use client";

import Link from "next/link";
import { useState } from "react";
import BrainField from "./BrainField";
import UploadDialog from "./UploadDialog";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!/.+@.+\..+/.test(email)) {
      setError("Enter a valid email.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not join waitlist.");
      }
    } catch {
      setError("Could not join waitlist.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-paper">
      <BrainField />

      {/* The wordmark and the demo link are ONE flex row, not two absolutely-positioned
          boxes. Two absolute elements at 23px and 13px do not share a centre line unless
          someone works the offset out by hand, and that number goes stale the moment either
          type size moves. Inset symmetrically on left-11, which is the wordmark's own margin
          and the only gutter this page has established.

          pointer-events-none on the row, auto on the link. The row spans the full width now,
          and BrainField's canvas takes pointerdown/pointermove drags underneath it — left
          solid, this strip would quietly kill the drag along the whole top of the page. */}
      <div className="pointer-events-none absolute inset-x-11 top-[34px] z-[2] flex items-center justify-between">
        <span className="text-[23px] font-medium tracking-[-0.01em]">soma</span>
        {/* A button, at the founder's call, reversing the note that used to sit here: this was
            an underlined text link on the reasoning that a pill would read as a second call to
            action beside the waitlist form. The hierarchy argument still holds and is answered
            by the VARIANT rather than by the element — outlined, not filled, so the ink-filled
            submit in the form is still the only solid button on the page and still the thing
            being asked for. What the text link could not answer is that it sat over a moving
            point cloud with nothing behind it, at 13px, in the one corner every visitor looks
            at first.
            Geometry is SiteHeader's button, to the pixel (rounded-xl, px-[15px] py-[9px], 14px
            medium, -0.01em), so the two bars match on any route where a visitor sees both. The
            radius picks up globals.css's quintic superellipse layer for free, which is the
            house corner.
            bg-paper/80 + backdrop-blur, unlike the header's: BrainField animates underneath
            this one, and on bare transparency the points drift through the label and the
            hairline border reads as part of the cloud. */}
        <div className="flex items-center gap-6">
          {/* pointer-events-auto is load-bearing: the row is pointer-events-none so
              BrainField keeps taking drags underneath it. prefetch={false} because
              /sign-in is in src/proxy.ts's matcher — a viewport prefetch on the
              highest-traffic page would fire an auth round-trip per visitor. */}
          <Link
            href="/sign-in"
            prefetch={false}
            className="pointer-events-auto text-[14px] tracking-[-0.01em] text-[#4a4a4a] transition-colors hover:text-[#0a0a0a]"
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            className="pointer-events-auto rounded-xl border border-line-2 bg-paper/80 px-[15px] py-[9px] text-[14px] font-medium tracking-[-0.01em] text-ink backdrop-blur-sm transition-colors hover:border-ink hover:bg-paper"
          >
            Demo
          </Link>
        </div>
      </div>

      <div className="absolute right-[6vw] top-1/2 z-[2] w-[min(400px,42vw)] -translate-y-1/2">
        <h1 className="m-0 text-[clamp(30px,3.4vw,46px)] font-medium leading-[1.04] tracking-[-0.02em] text-balance">
          Find the ad that
          <br />
          wins <span className="font-serif font-normal italic">attention</span>.
        </h1>
        <p className="mb-[34px] mt-[22px] max-w-[340px] text-[16px] leading-[1.5] text-pretty text-[#4a4a4a]">
          You can&rsquo;t sugarcoat brain activity. Soma uses real fMRI data to
          read how your ad earns attention, so you launch the one that wins.
        </p>

        {submitted ? (
          <div className="max-w-[360px] border-t border-[#e2e2e2] py-[13px] text-[15px] text-[#0a0a0a]">
            You&rsquo;re on the list. We&rsquo;ll be in touch.
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="relative flex max-w-[360px] gap-2"
          >
            <button
              type="submit"
              disabled={pending}
              className="cursor-pointer whitespace-nowrap rounded-xl border border-[#0a0a0a] bg-[#0a0a0a] px-5 py-[13px] text-[15px] font-medium text-paper transition-colors hover:border-[#333] hover:bg-[#333]"
            >
              {pending ? "Joining..." : "Join waitlist"}
            </button>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              className="min-w-0 flex-1 rounded-xl border border-[#d8d8d8] bg-paper px-[15px] py-[13px] text-[15px] text-[#0a0a0a] outline-none"
            />
            {error ? (
              <div className="absolute top-full mt-2 text-[13px] text-[#b42318]">
                {error}
              </div>
            ) : null}
          </form>
        )}

        <div className="mt-8 max-w-[360px] text-[13px] leading-[1.5] text-[#4a4a4a]">
          Have an ad already?{" "}
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="cursor-pointer font-medium text-[#0a0a0a] underline underline-offset-2 hover:text-[#333]"
          >
            Upload an MP4
          </button>{" "}
          and we&rsquo;ll analyze it.
        </div>

        <div className="mt-2 max-w-[360px] text-[13px] leading-[1.5] text-[#4a4a4a]">
          No invite needed &mdash;{" "}
          <Link
            href="/sign-up"
            prefetch={false}
            className="cursor-pointer font-medium text-[#0a0a0a] underline underline-offset-2 hover:text-[#333]"
          >
            create an account
          </Link>
          .
        </div>
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        initialEmail={email}
      />
    </main>
  );
}
