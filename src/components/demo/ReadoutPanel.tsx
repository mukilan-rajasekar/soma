// The ad-producer read-out panel: comprehension / recall / purchase-intent — the three
// product dimensions an ad producer asks about, read per-second from the cortical
// response (readout_extract.py).

import type { Arc } from "@/lib/arc";

type LaneSpec = {
  key: "comprehension" | "recall" | "purchase_intent";
  label: string;
  blurb: string;
  signed?: boolean;
};

const LANES: LaneSpec[] = [
  { key: "comprehension", label: "Comprehension", blurb: "how hard the language system works — is the message landing" },
  { key: "recall", label: "Recall", blurb: "cortical encoding — what viewers are likely to remember" },
  { key: "purchase_intent", label: "Purchase intent", blurb: "the brain's value signal — a positive lean means it's building a reason to buy", signed: true },
];

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

// A compact sparkline for a per-second lane (0..1 for unit lanes; signed lanes are
// mapped to 0..1 around a centre line for display only).
function Spark({ values, signed }: { values: number[]; signed?: boolean }) {
  if (!values.length) return null;
  const n = values.length;
  const y = (v: number) => {
    const u = signed ? (v + 1) / 2 : v; // signed [-1,1] -> [0,1]
    return 22 - Math.max(0, Math.min(1, u)) * 20 - 1;
  };
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (n - 1)) * 100).toFixed(2)},${y(v).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
      {signed ? <line x1="0" y1="11" x2="100" y2="11" stroke="var(--color-line)" strokeWidth="0.5" /> : null}
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function ReadoutPanel({ arc }: { arc: Arc }) {
  const r = arc.readout;
  if (!r) return null;
  const present = LANES.filter((l) => Array.isArray(r[l.key]) && (r[l.key] as number[]).length);
  if (!present.length) return null;

  return (
    <div className="rounded-2xl border border-line bg-fill p-3.5">
      <div className="mb-2.5 flex items-center justify-between text-[10px] uppercase tracking-[0.13em] text-ink-3">
        <span>Ad read-outs</span>
        <span>comprehension · recall · intent</span>
      </div>

      <div className="flex flex-col gap-3">
        {present.map((l) => {
          const values = r[l.key] as number[];
          // Headline number = the clip-level ROI magnitude (comparable across ads).
          // The per-second arrays are min-max normalised per clip, so their mean is
          // ~0.5 for every ad — useless as a summary; the level actually differentiates.
          const lvl = r[`${l.key}_level`];
          const display = typeof lvl === "number" ? lvl : mean(values);
          return (
            <div key={l.key} className="border-t border-line pt-2.5 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold tracking-[-0.01em]">{l.label}</span>
                <span className="text-[11px] tabular-nums text-ink-2">
                  {display.toFixed(2)}
                  <span className="text-ink-3"> level</span>
                </span>
              </div>
              <div className="mb-1 text-[10px] leading-tight tracking-[0.02em] text-ink-3">
                {l.blurb}
              </div>
              <Spark values={values} signed={l.signed} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
