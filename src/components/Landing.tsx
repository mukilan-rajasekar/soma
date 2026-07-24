"use client";

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

      <div className="absolute left-11 top-[34px] z-[2] text-[23px] font-medium tracking-[-0.01em]">
        soma
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
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        initialEmail={email}
      />
    </main>
  );
}
