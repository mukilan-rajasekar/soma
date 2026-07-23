"use client";

import { useState } from "react";
import BrainSignalSweep from "@/components/brainlab/BrainSignalSweep";
import BrainPointFiring from "@/components/brainlab/BrainPointFiring";
import BrainPulseDrift from "@/components/brainlab/BrainPulseDrift";
import BrainField from "@/components/BrainField";

/**
 * /brain-lab — an internal, orphaned comparison bench for the three candidate cortical
 * treatments. One brain fills the viewport at a time; a hairline tab switcher swaps the
 * active treatment. Pure-white Swiss/editorial shell, so the eye judges the motion alone.
 *
 * Only the selected variant is mounted, so exactly one WebGL context lives at a time — each
 * component tears down (dispose) on unmount when you switch tabs. Not linked from anywhere and
 * marked noindex (rendered <meta>, hoisted to <head> by React), so it stays off the sitemap.
 */

type TabId = "fusion" | "sweep" | "firing" | "pulse";

const TABS: {
  id: TabId;
  label: string;
  caption: string;
  Component: () => React.JSX.Element;
}[] = [
  {
    id: "fusion",
    label: "Fusion (hero)",
    caption:
      "Fusion — the hero brain: point-cloud firing (dominant) with folded-in drift + breathing, scrubbable by scroll.",
    // No progressRef in the lab → BrainField self-listens to wheel/touch so scroll is testable.
    Component: () => <BrainField />,
  },
  {
    id: "sweep",
    label: "Signal Sweep",
    caption:
      "Signal Sweep — a single luminous activation front propagating across the cortex.",
    Component: BrainSignalSweep,
  },
  {
    id: "firing",
    label: "Point Firing",
    caption:
      "Point Firing — a point-cloud cortex whose neurons fire in expanding ripples.",
    Component: BrainPointFiring,
  },
  {
    id: "pulse",
    label: "Pulse & Drift",
    caption:
      "Pulse & Drift — scattered regions breathing under a slow, organic tumble.",
    Component: BrainPulseDrift,
  },
];

export default function BrainLabPage() {
  const [active, setActive] = useState<TabId>("fusion");
  const current = TABS.find((t) => t.id === active) ?? TABS[0];
  const ActiveBrain = current.Component;

  return (
    <main className="relative h-full w-full overflow-hidden bg-paper text-ink">
      {/* noindex — hoisted into <head> by React so this orphan route stays unlisted */}
      <meta name="robots" content="noindex, nofollow" />

      {/* the treatment under test — only the active one is mounted (one WebGL context) */}
      <div className="absolute inset-0">
        <ActiveBrain />
      </div>

      {/* top tab switcher — pointer-events only on the control cluster, brain stays untouched */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-[clamp(20px,5vw,56px)] pt-[clamp(20px,4vw,40px)]">
        <div className="pointer-events-auto inline-flex flex-col">
          <span className="text-meta uppercase tracking-[0.2em] text-ink-3">
            Brain lab
          </span>

          <nav
            aria-label="Cortical treatment"
            className="mt-4 flex flex-wrap items-center gap-x-[clamp(20px,3vw,40px)] gap-y-3"
          >
            {TABS.map((tab) => {
              const isActive = tab.id === active;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActive(tab.id)}
                  className={`-mb-px border-b pb-2 text-meta uppercase tracking-[0.14em] transition-colors ${
                    isActive
                      ? "border-ink text-ink"
                      : "border-transparent text-ink-3 hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <p className="mt-4 max-w-[46ch] text-meta leading-[1.5] text-ink-3">
            {current.caption}
          </p>
        </div>
      </header>
    </main>
  );
}
