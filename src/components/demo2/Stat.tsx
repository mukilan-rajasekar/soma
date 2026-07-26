// One number, big, with a label above and a caption below — the stat tile used by the
// hook section, the moat section and /preflight's hook comparison. Shared rather than
// duplicated so the count-in timing and the bar treatment stay identical everywhere.

export default function Stat({
  value,
  suffix,
  label,
  sub,
  tone,
  active,
  big,
}: {
  value: number;
  suffix: string;
  label: string;
  sub: string;
  tone?: "ink" | "accent" | "pos" | "neg";
  active: boolean;
  big?: boolean;
}) {
  const bar =
    tone === "accent" ? "bg-accent-2"
    : tone === "pos" ? "bg-pos"
    : tone === "neg" ? "bg-neg"
    : "bg-ink";
  return (
    <div className="rounded-2xl border border-line bg-fill p-5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={`font-medium tabular-nums leading-none text-ink ${big ? "text-[40px]" : "text-[28px]"}`}
          style={{ opacity: active ? 1 : 0.15, transition: "opacity .6s" }}
        >
          {value.toLocaleString()}
        </span>
        <span className="text-[15px] text-ink-3">{suffix}</span>
      </div>
      <div className={`mt-2 h-1 w-full overflow-hidden rounded-full bg-line ${big && tone ? "" : "hidden"}`}>
        {/* grow via transform: scaleX (compositor-only) rather than animating width, which
            would trigger layout on every frame. transform-origin left so it fills L→R. */}
        <div
          className={`h-full w-full rounded-full ${bar}`}
          style={{ transform: active ? `scaleX(${Math.min(100, value) / 100})` : "scaleX(0)", transformOrigin: "left", transition: "transform .9s" }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-ink-3">{sub}</div>
    </div>
  );
}
