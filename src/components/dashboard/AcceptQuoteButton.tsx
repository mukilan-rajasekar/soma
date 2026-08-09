"use client";

// AcceptQuoteButton — the yes, and only the yes.
//
// The accepted copy is written to be true while licence gate 4 is open: an acceptance is
// recorded, nothing is charged, nothing goes live. The words "invoice", "payment" and
// "charge" appear only to deny them — see /api/campaigns/quote/accept for why the route
// is built the same way.
//
// Two homes, two shapes. In CampaignBriefForm's done state this is the screen's one ink
// button and success replaces it with the confirmation block. In the serve page's quote
// rows it is compact and secondary (that card's ink button is "New campaign"), and
// success leans on router.refresh() — the row's status pill re-reads as 'accepted'
// through RLS, which is better evidence than anything client state could claim.

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AcceptQuoteButton({
  quoteId,
  compact,
}: {
  quoteId: string;
  compact?: boolean;
}) {
  const router = useRouter();

  const [state, setState] = useState<"idle" | "busy" | "accepted">("idle");
  const [error, setError] = useState("");

  const accept = async () => {
    setError("");
    setState("busy");
    try {
      const res = await fetch("/api/campaigns/quote/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(body.error ?? "Could not accept this quote.");
        setState("idle");
        return;
      }

      setState("accepted");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
      setState("idle");
    }
  };

  if (state === "accepted") {
    if (compact) {
      return (
        <span role="status" className="text-meta text-ink-2">
          Accepted.
        </span>
      );
    }
    return (
      <div role="status" className="rounded-xl border border-line bg-paper p-4">
        <p className="text-ui font-medium text-ink">Accepted.</p>
        <p className="mt-1.5 max-w-[58ch] text-pretty text-meta text-ink-2">
          We have your yes at this price. Nothing is charged and nothing goes live until
          platform access clears — we tell you before a single dollar moves.
        </p>
      </div>
    );
  }

  return (
    <span className={compact ? "inline-flex items-center gap-2" : "block"}>
      <button
        type="button"
        onClick={accept}
        disabled={state === "busy"}
        className={
          compact
            ? "cursor-pointer rounded-xl border border-line-2 bg-paper px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            : "cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {state === "busy" ? "Accepting…" : "Accept this price"}
      </button>
      {error ? (
        <span role="alert" className={compact ? "text-[12px] text-error" : "mt-2 block text-meta text-error"}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
