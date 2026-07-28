"use client";

// The waiting room's clock. Polls /api/batches/<token>/status and, the moment the run
// leaves the state the page was rendered in, calls router.refresh() so the server
// re-renders the segment — which is what swaps this panel for the real read-out without
// the customer touching anything.
//
// WHY router.refresh() RATHER THAN FETCHING THE REPORT. The report is large and is
// rendered by a Server Component that also mints signed media URLs. Pulling it into the
// client would mean a second copy of that logic, the signing moved somewhere it cannot
// safely go, and the whole artifact crossing the wire. Refreshing lets the existing
// server path do it once, correctly.
//
// The poll is deliberately unhurried. A scoring run is minutes-to-hours of GPU work, so
// a tight interval buys nothing and turns an idle tab into a stream of requests; the
// interval also backs off as the wait gets long, because a batch still running after an
// hour is not about to finish in the next six seconds.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "queued" | "processing" | "done" | "failed";

/** Poll interval by elapsed wait: brisk for the first minute (a small batch really can
 *  land that fast), then progressively calmer. Capped at a minute. */
function intervalFor(elapsedMs: number): number {
  if (elapsedMs < 60_000) return 6_000;
  if (elapsedMs < 10 * 60_000) return 15_000;
  if (elapsedMs < 60 * 60_000) return 30_000;
  return 60_000;
}

export default function BatchStatus({
  token,
  initialStatus,
  startedAtMs,
}: {
  token: string;
  initialStatus: Status;
  /** created_at as epoch ms, from the server. Used for the elapsed readout and to pace
   *  the poll — NOT Date.now() at mount, which would restart the clock on every refresh. */
  startedAtMs: number;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAtMs);
  // Ref, not state: the poll loop reads it to decide whether anything changed, and it
  // must not itself cause a render.
  const seen = useRef<Status>(initialStatus);

  // The elapsed readout. Its own second-resolution timer, independent of the poll.
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startedAtMs), 1_000);
    return () => clearInterval(t);
  }, [startedAtMs]);

  useEffect(() => {
    // A terminal state never changes again, so there is nothing to poll for.
    if (initialStatus === "done" || initialStatus === "failed") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(`/api/batches/${token}/status`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { status?: Status };
          if (!cancelled && body.status && body.status !== seen.current) {
            seen.current = body.status;
            // Server re-render: queued → processing updates the copy in place, and
            // → done replaces this whole component with the read-out.
            router.refresh();
          }
        }
      } catch {
        // A failed poll is not worth surfacing — the next one is seconds away, and an
        // error banner on a page whose entire job is to say "still working" would read
        // as the RUN having failed rather than one request.
      }
      if (!cancelled) timer = setTimeout(tick, intervalFor(Date.now() - startedAtMs));
    };

    timer = setTimeout(tick, intervalFor(Date.now() - startedAtMs));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, initialStatus, router, startedAtMs]);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-3">
      <span className="inline-flex items-center gap-2">
        {/* The one moving thing on the page, so "working" is legible without reading. */}
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent-2 opacity-75" />
          <span className="relative inline-block h-2 w-2 rounded-full bg-accent-2" />
        </span>
        {initialStatus === "processing" ? "Scoring" : "Queued"}
      </span>
      <span className="tabular-nums">{formatElapsed(elapsed)} elapsed</span>
      <span>This page updates itself. Nothing to refresh.</span>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}
