"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Variant = {
  id: string;
  title: string;
};

type Phase = "idle" | "running" | "error";

export default function EditBeta({
  variants,
  defaultAdId,
}: {
  variants: Variant[];
  defaultAdId: string;
}) {
  const router = useRouter();
  const [ad, setAd] = useState(defaultAdId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  const busy = phase === "running";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("running");
    setMessage("");

    try {
      const res = await fetch("/api/edit/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad, top: 3 }),
      });
      const body = (await res.json().catch(() => null)) as
        | ({ error?: string; detail?: string; token?: string })
        | null;
      if (!body?.token) {
        throw new Error(body?.error ?? "Could not run edit beta.");
      }
      router.push(`/e/${body.token}`);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Could not run edit beta.");
    }
  };

  return (
    <div className="mx-auto max-w-[980px] px-[clamp(16px,4vw,24px)] pb-24 pt-[clamp(26px,5vw,44px)]">
      <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-ink-3">
        <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
        Edit beta
      </div>

      <h1 className="max-w-[18ch] text-balance text-hero text-ink">
        Search the best{" "}
        <span className="font-serif font-normal italic">re-cut</span>.
      </h1>
      <p className="mt-[18px] max-w-[62ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
        This is the narrow, honest version of editing: Soma searches a bounded edit space,
        estimates which re-cuts help most, renders the top few, and verifies them when the
        scorer is available.
      </p>

      <form onSubmit={submit} className="mt-[clamp(34px,6vw,56px)] border-t border-line pt-8">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-[12px] tabular-nums tracking-[0.1em] text-ink-3">01</span>
          <h2 className="text-section text-ink">Pick the source cut</h2>
        </div>

        <label className="flex max-w-[380px] flex-col">
          <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
            Demo campaign cut
          </span>
          <select
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            disabled={busy}
            className="mt-2 w-full cursor-pointer rounded-xl border border-line bg-paper px-[15px] py-[12px] text-[15px] text-ink outline-none transition-colors focus:border-ink-3 disabled:opacity-60"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.title}
              </option>
            ))}
          </select>
          <span className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-3">
            This beta runs on the shipped demo campaign first. Customer-upload editing is the next layer.
          </span>
        </label>

        <div className="mt-10 border-t border-line pt-8">
          {message ? (
            <p className={`mb-5 text-[13.5px] leading-[1.55] ${phase === "error" ? "text-neg" : "text-ink-2"}`}>
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={busy}
              className="cursor-pointer rounded-xl bg-ink px-6 py-[14px] text-ui font-medium text-paper transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Searching…" : "Start edit run"}
            </button>
            <span className="text-[13px] text-ink-3">
              Creates a private result URL once the run finishes. Verification appears only when the scorer box is available.
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}
