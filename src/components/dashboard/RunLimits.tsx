// RunLimits — honesty fields for a single-ad Studio page (ResultReport's limits, trimmed).

import { HOOK_SECONDS } from "@/components/preflight/lanes";
import type { PreflightAd, PreflightReport } from "@/components/preflight/types";

const FLAG_COPY: Record<string, string> = {
  no_asr_backend:
    "No speech recognition ran, so nothing spoken in this cut was checked against the message.",
  no_ocr_backend:
    "No text recognition ran, so on-screen type in this cut was not read.",
  no_content_extracted: "No words were recovered from this cut, by either channel.",
  no_identity_text: "The brand name was not found in the opening seconds.",
  shorter_than_hook_window: `This cut is shorter than the ${HOOK_SECONDS}s hook window, so it has no hook to score.`,
  no_audio_track: "This cut has no audio track.",
};

export default function RunLimits({
  ad,
  report,
}: {
  ad: PreflightAd;
  report: PreflightReport;
}) {
  const flags = ad.flags ?? [];
  const blind =
    flags.includes("no_asr_backend") ||
    flags.includes("no_ocr_backend") ||
    flags.includes("no_content_extracted");

  const hasAnything =
    blind ||
    flags.length > 0 ||
    !!report.scoring?.smallNCaveat ||
    !!report.comparability ||
    !!report.sanity ||
    (report.warnings ?? []).length > 0;

  if (!hasAnything) return null;

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
        What this run can and cannot tell you
      </h2>
      <div className="mt-5 flex flex-col gap-3">
        {blind ? (
          <Limit label="Comprehension may not have measured anything">
            Speech or text recognition was missing or empty on this cut, so the clarity
            component may be carrying little or no information. Attention and surprise are
            unaffected.
          </Limit>
        ) : null}
        {report.scoring?.smallNCaveat ? (
          <Limit label="How to read these numbers">{report.scoring.smallNCaveat}</Limit>
        ) : null}
        {(report.warnings ?? []).map((w) => (
          <Limit key={w} label="Warning from the run">
            {w}
          </Limit>
        ))}
        {report.comparability ? (
          <Limit
            label={
              report.comparability.crossAdLevelsTrustworthy
                ? "Cuts are comparable to each other"
                : "Cross-cut levels are not trustworthy on this run"
            }
          >
            {report.comparability.note}
          </Limit>
        ) : null}
        {flags.map((f) => (
          <Limit key={f} label="Note on this cut">
            {FLAG_COPY[f] ?? f}
          </Limit>
        ))}
      </div>
    </section>
  );
}

function Limit({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-fill p-4">
      <div className="text-ui font-medium text-ink">{label}</div>
      <div className="mt-2 max-w-[76ch] text-[13.5px] leading-[1.6] text-ink-2">{children}</div>
    </div>
  );
}
