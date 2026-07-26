// A named cortical network: a swatch that matches its curve on the charts, the ROI
// shorthand, and one line of plain English. Lived inside DemoScrollPage until /preflight
// needed the same two cards for the same section, which is the moment to share it rather
// than paste it.

export default function RegionCard({
  title,
  tag,
  body,
  tone,
}: {
  title: string;
  tag: string;
  body: string;
  tone: "ink" | "accent";
}) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone === "accent" ? "bg-accent-2" : "bg-ink"}`} />
        <span className="text-ui font-medium text-ink">{title}</span>
      </div>
      <div className="mt-1 text-[9.5px] uppercase tracking-[0.08em] text-ink-3">{tag}</div>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-2">{body}</p>
    </div>
  );
}
