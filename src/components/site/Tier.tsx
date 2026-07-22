import type { ReactNode } from "react";

// The evidence-tier badge, ported from the old console key. Four tiers, honest by design.
// The badge is the ONE place semantic colour lives — the surrounding UI stays monochrome
// + one accent, so the tier reads at a glance without tinting whole cards:
//   validated  (green)  — proven, e.g. the TRIBE encoder vs real fMRI
//   validating (amber)  — a hypothesis under an open, pre-registered test
//   hypothesis (red)    — a labeled hypothesis / disclosed null, not validated
//   neutral    (grey)   — descriptive, no claim attached (tokenised: line/fill/ink-3)
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
    pill: "border-line bg-fill text-ink-3",
    dot: "bg-ink-3",
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
      className={`inline-flex items-center gap-[6px] whitespace-nowrap rounded-full border px-[9px] py-[3px] align-middle text-[10.5px] font-medium uppercase leading-none tracking-[0.06em] ${v.pill}`}
    >
      <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${v.dot}`} />
      {children}
    </span>
  );
}
