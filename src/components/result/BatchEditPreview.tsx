"use client";

import { useEffect, useState } from "react";

type Candidate = {
  kind: string;
  label: string;
  est_score: number;
  est_delta: number;
  confidence: string;
  removed?: [number, number][];
};

type Payload = {
  baseScore?: number;
  candidates?: Candidate[];
  error?: string;
};

function fmtT(t: number): string {
  const secs = Math.max(0, Math.floor(t));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export default function BatchEditPreview({
  batchToken,
  adId,
  adTitle,
}: {
  batchToken: string;
  adId: string;
  adTitle: string;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/batches/${batchToken}/edit-preview?ad=${encodeURIComponent(adId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as Payload | null;
        if (cancelled) return;
        if (!res.ok) {
          setPhase("error");
          setPayload(body);
          return;
        }
        setPhase("ready");
        setPayload(body);
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [adId, batchToken]);

  if (phase === "loading") {
    return (
      <div className="rounded-2xl border border-line bg-fill p-5 text-[13.5px] leading-[1.6] text-ink-2">
        Computing a first-pass shot diagnosis for <span className="font-medium text-ink">{adTitle}</span>.
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-2xl border border-line bg-fill p-5 text-[13.5px] leading-[1.6] text-ink-2">
        Soma could not compute a shot diagnosis for this cut on this machine.
        {payload?.error ? ` ${payload.error}` : ""}
      </div>
    );
  }

  const candidates = (payload?.candidates ?? [])
    .filter((candidate) => candidate.kind === "remove" || candidate.kind === "remove_pair")
    .slice(0, 6);

  if (!candidates.length) {
    return (
      <div className="rounded-2xl border border-line bg-fill p-5 text-[13.5px] leading-[1.6] text-ink-2">
        No removable shot beat surfaced clearly enough to print for this cut.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      {candidates.map((candidate, i) => (
        <div
          key={`${candidate.kind}-${candidate.label}`}
          className={`flex flex-col gap-3 bg-paper p-5 ${i > 0 ? "border-t border-line" : ""}`}
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <div className="text-ui font-medium text-ink">{candidate.label}</div>
            <div className="ml-auto flex items-baseline gap-3 text-[13px] tabular-nums text-ink">
              <span>{Math.round(candidate.est_score)}</span>
              <span className={candidate.est_delta >= 0 ? "text-ink" : "text-neg"}>
                {candidate.est_delta >= 0 ? "+" : ""}
                {Math.round(candidate.est_delta)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px] uppercase tracking-[0.07em] text-ink-3">
            <span>{candidate.confidence}</span>
            {candidate.removed?.length ? (
              <>
                <span>·</span>
                <span>
                  {candidate.removed
                    .map(([start, end]) => `${fmtT(start)} to ${fmtT(end)}`)
                    .join(", ")}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
