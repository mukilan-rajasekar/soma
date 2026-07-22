import type { ReactNode } from "react";

// The evidence-tier badge, ported from the old console key. Four tiers, honest by design:
//   validated  (green)  — proven, e.g. the TRIBE encoder vs real fMRI
//   validating (amber)  — a hypothesis under an open, pre-registered test
//   hypothesis (red)    — a labeled hypothesis / disclosed null, not validated
//   neutral    (grey)   — descriptive, no claim attached
export type TierVariant = "validated" | "validating" | "hypothesis" | "neutral";

const VARIANTS: Record<TierVariant, { pill: string; dot: string }> = {
  validated: {
    pill: "border-[#b8e0cd] bg-[#eefaf3] text-[#0a7d55]",
    dot: "bg-[#12a06a]",
  },
  validating: {
    pill: "border-[#ecd9a8] bg-[#fdf6e6] text-[#8a5e00]",
    dot: "bg-[#e0a52a]",
  },
  hypothesis: {
    pill: "border-[#f0c9c4] bg-[#fdeeec] text-[#b42318]",
    dot: "bg-[#e0503f]",
  },
  neutral: {
    pill: "border-[#e2e2e2] bg-[#f6f6f6] text-[#6b6b6b]",
    dot: "bg-[#9a9a9a]",
  },
};

export default function Tier({
  variant,
  children,
}: {
  variant: TierVariant;
  children: ReactNode;
}) {
  const v = VARIANTS[variant];
  return (
    <span
      className={`inline-flex items-center gap-[6px] whitespace-nowrap rounded-full border px-[9px] py-[3px] align-middle font-mono text-[10.5px] uppercase leading-none tracking-[0.05em] ${v.pill}`}
    >
      <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${v.dot}`} />
      {children}
    </span>
  );
}
