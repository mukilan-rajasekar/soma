"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "queued" | "processing" | "done" | "failed";

function intervalFor(elapsedMs: number): number {
  if (elapsedMs < 60_000) return 6_000;
  if (elapsedMs < 10 * 60_000) return 15_000;
  if (elapsedMs < 60 * 60_000) return 30_000;
  return 60_000;
}

export default function RunStatus({
  endpoint,
  initialStatus,
  startedAtMs,
  queuedLabel = "Queued",
  processingLabel = "Processing",
}: {
  endpoint: string;
  initialStatus: Status;
  startedAtMs: number;
  queuedLabel?: string;
  processingLabel?: string;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAtMs);
  const seen = useRef<Status>(initialStatus);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startedAtMs), 1_000);
    return () => clearInterval(t);
  }, [startedAtMs]);

  useEffect(() => {
    if (initialStatus === "done" || initialStatus === "failed") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { status?: Status };
          if (!cancelled && body.status && body.status !== seen.current) {
            seen.current = body.status;
            router.refresh();
          }
        }
      } catch {
        // The next poll is close; avoid turning a transient request failure into a fake run error.
      }
      if (!cancelled) timer = setTimeout(tick, intervalFor(Date.now() - startedAtMs));
    };

    timer = setTimeout(tick, intervalFor(Date.now() - startedAtMs));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [endpoint, initialStatus, router, startedAtMs]);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-3">
      <span className="inline-flex items-center gap-2">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent-2 opacity-75" />
          <span className="relative inline-block h-2 w-2 rounded-full bg-accent-2" />
        </span>
        {initialStatus === "processing" ? processingLabel : queuedLabel}
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
