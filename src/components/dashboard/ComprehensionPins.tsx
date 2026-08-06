// ComprehensionPins — did the brand land, on screen or out loud.
//
// Demo ComprehensionPanel uses brandMentions from tools/demo/build_report.py (speech +
// timed OCR). Customer artifacts do NOT carry brandMentions: OCR frames are discarded at
// score time and only clarity.windows strings survive. Pins here are therefore:
//   speech  — transcript turns that mention batch.message brand/product
//   screen  — at most an untimed note when a clarity window still contains those names
// When channels are blind (flags), the section refuses to render rather than draw an empty
// timeline that looks like a failed load.

import { fmtT, type PreflightAd, type PreflightReport } from "@/components/preflight/types";

type Pin = { t: number; text: string; source: "speech" | "screen" };

function pinsFor(ad: PreflightAd, report: PreflightReport): Pin[] {
  const message = report.batch?.message ?? {};
  const needles = [message.brandName, message.productName]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().toLowerCase());

  const out: Pin[] = [];
  // Without a brief there is nothing to match against; do not pin every ASR turn and
  // pretend it is brand landing.
  if (!needles.length) return out;

  for (const turn of ad.media?.transcript ?? []) {
    if (!turn?.text || !Number.isFinite(turn.t)) continue;
    const hay = turn.text.toLowerCase();
    const hit = needles.find((n) => hay.includes(n));
    if (!hit) continue;
    out.push({
      t: turn.t,
      text: hit,
      source: "speech",
    });
  }

  // Timed OCR pins are not in the customer artifact yet. Non-empty clarity windows still
  // mean something was recovered; surface them as a single "named" note at t=0 rather than
  // inventing timestamps.
  const windows = ad.clarity?.windows ?? {};
  const named = Object.values(windows).find((v) => typeof v === "string" && v.trim());
  if (named && needles.some((n) => named.toLowerCase().includes(n))) {
    out.push({ t: 0, text: named.trim().slice(0, 32), source: "screen" });
  }

  return out;
}

function isBlind(ad: PreflightAd): boolean {
  const flags = ad.flags ?? [];
  return (
    flags.includes("no_asr_backend") ||
    flags.includes("no_ocr_backend") ||
    flags.includes("no_content_extracted")
  );
}

export default function ComprehensionPins({
  ad,
  report,
}: {
  ad: PreflightAd;
  report: PreflightReport;
}) {
  if (isBlind(ad)) return null;
  const pins = pinsFor(ad, report);
  if (!pins.length) return null;

  const duration = ad.durationS > 0 ? ad.durationS : 1;
  const spoken = pins.filter((p) => p.source === "speech");
  const screen = pins.filter((p) => p.source === "screen");

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
        Did the brand land
      </h2>
      <p className="mt-3 max-w-[62ch] text-pretty text-body text-ink-2">
        Mentions recovered from speech recognition
        {screen.length ? " and on-screen type" : ""}, checked against the brief. Clarity is{" "}
        <span className="tabular-nums">{Math.round((report.weights?.clarity ?? 0.25) * 100)}%</span>{" "}
        of the score.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-paper px-4 pb-6 pt-4">
        {(
          [
            { label: "Spoken · speech recognition", items: spoken, ring: false },
            { label: "On screen · text recognition", items: screen, ring: true },
          ] as const
        )
          .filter((row) => row.items.length > 0)
          .map((row) => (
            <div key={row.label} className="mb-8 last:mb-0">
              <div className="mb-2.5 text-[12px] uppercase tracking-[0.08em] text-ink-3">
                {row.label}
              </div>
              <div className="relative h-8 rounded-xl bg-fill">
                <div className="absolute inset-x-4 inset-y-0">
                  {row.items.map((m, i) => {
                    const pct = Math.max(0, Math.min(100, (m.t / duration) * 100));
                    const anchor = pct < 14 ? "0" : pct > 86 ? "-100%" : "-50%";
                    return (
                      <div
                        key={`${m.t}-${i}`}
                        className="absolute top-1/2 h-0"
                        style={{ left: `${pct}%` }}
                      >
                        <span
                          className={`absolute top-0 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                            row.ring ? "border-2 border-accent bg-paper" : "bg-ink"
                          }`}
                        />
                        <span
                          className="absolute top-3 whitespace-nowrap text-[12px] tabular-nums text-ink-3"
                          style={{ transform: `translateX(${anchor})` }}
                        >
                          {m.text} · {fmtT(m.t)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
