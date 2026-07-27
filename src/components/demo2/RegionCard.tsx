"use client";

// A named cortical network: a swatch that matches its curve on the charts, the ROI
// shorthand, and one line of plain English. Lived inside DemoScrollPage until /preflight
// needed the same two cards for the same section, which is the moment to share it rather
// than paste it — except the paste was never deleted, so DemoScrollPage kept rendering a
// private copy that had grown a reveal delay, a ping and a larger type scale while this file
// stayed behind. One copy now, with the richer behaviour behind optional props so /preflight
// (which passes neither) renders exactly as before.

export default function RegionCard({
  title,
  tag,
  body,
  tone,
  revealed = true,
  delay = 0,
  ping = false,
}: {
  title: string;
  tag: string;
  body: string;
  tone: "ink" | "accent";
  // Fade-and-rise on reveal, mirroring DemoScrollPage's Rise primitive. Inlined rather than
  // imported so this file stays standalone for /preflight.
  revealed?: boolean;
  delay?: number;
  // The dot rings out once as the card lands, the same way the region it names scales up in
  // the figure beside it. Only the demo page has that figure animating in step, so it opts in.
  ping?: boolean;
}) {
  const dot = tone === "accent" ? "bg-accent-2" : "bg-ink";
  return (
    <div
      className="h-full"
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? "none" : "translateY(9px)",
        transition: `opacity .55s ${delay}ms, transform .55s ${delay}ms`,
      }}
    >
      <div className="h-full rounded-2xl border border-line bg-paper p-4">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
            {ping ? (
              <span
                className={`absolute inset-0 rounded-full ${dot}`}
                // Base opacity 0 with no fill-mode, so the ring is invisible through the delay
                // and invisible again after the single pass; the keyframes own the visible part.
                style={{
                  opacity: 0,
                  animation: revealed ? `somaPing 1.1s ${delay + 120}ms ease-out 1` : "none",
                }}
              />
            ) : null}
            <span className={`relative inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
          </span>
          <span className="text-ui font-medium text-ink">{title}</span>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-ink-3">{tag}</div>
        <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-2">{body}</p>
      </div>
    </div>
  );
}
