// The ad-producer read-out panel: comprehension / recall / purchase-intent.
//
// These are the three product-facing dimensions an ad producer asks about, each an
// a-priori ROI PROXY-HYPOTHESIS derived from frozen-TRIBE preds (readout_extract.py) —
// NOT validated decoders. So this panel is deliberately separated from the validated
// "where it lights up" CorticalProfile: every lane here wears an amber hypothesis badge,
// and recall/purchase-intent additionally state the SUBCORTICAL CEILING (the hippocampus
// and nucleus accumbens are subcortical and absent from TRIBE's cortical output). This is
// how we display the dimension honestly today, upgradable to a trained head later.

import type { Arc } from "@/lib/arc";

type LaneSpec = {
  key: "comprehension" | "recall" | "purchase_intent";
  label: string;
  blurb: string;
  signed?: boolean;
};

const LANES: LaneSpec[] = [
  { key: "comprehension", label: "Comprehension", blurb: "how hard the language system works — is the message landing" },
  { key: "recall", label: "Recall", blurb: "predicted cortical encoding — what viewers are likely to remember" },
  { key: "purchase_intent", label: "Purchase intent", blurb: "cortical value signal — the predicted buy-lean", signed: true },
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
        <span className="rounded-sm border border-amber-500/40 px-1.5 py-0.5 text-amber-600">
          ◆ proxy&nbsp;hypotheses
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {present.map((l) => {
          const values = r[l.key] as number[];
          const badge = r[`${l.key}_badge`] as string | undefined;
          const m = mean(values);
          const display = l.signed ? m : m; // both already display-scaled
          return (
            <div key={l.key} className="border-t border-line pt-2.5 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold tracking-[-0.01em]">{l.label}</span>
                <span className="text-[11px] tabular-nums text-ink-2">
                  {l.signed ? (display >= 0 ? "+" : "") : ""}
                  {display.toFixed(2)}
                  <span className="text-ink-3">{l.signed ? " lean" : " avg"}</span>
                </span>
              </div>
              <div className="mb-1 text-[10px] leading-tight tracking-[0.02em] text-ink-3">
                {l.blurb}
              </div>
              <Spark values={values} signed={l.signed} />
              {badge ? (
                <div className="mt-1 text-[9.5px] leading-[1.5] tracking-[0.01em] text-amber-700/90">
                  {badge}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 border-t border-line pt-2 text-[9.5px] leading-[1.55] tracking-[0.02em] text-ink-3">
        A-priori ROI arithmetic over frozen-TRIBE preds. Comprehension = language network;
        recall = cortical memory-encoding cortex (no subcortical hippocampus); purchase
        intent = vmPFC value (no subcortical nucleus accumbens). Proxies, not validated
        decoders.
      </div>
    </div>
  );
}
