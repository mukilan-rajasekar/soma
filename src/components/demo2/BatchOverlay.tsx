"use client";

// /preflight's OverlayPanel, borrowed by /demo's comprehension beat.
//
// The two pages were built separately and ended up with two implementations of the same
// figure: demo2's VariantOverlay and preflight's DeltaChart, both plotting N cuts on one
// shared axis with rank-coloured curves. Preflight's is the better one — series style
// arrives as data rather than as a pile of boolean props, which is why one component there
// serves both the single-ad player and the batch overlay — and it carries a lane picker,
// which is the thing the comprehension beat actually needs: the same five cuts re-read as
// attention, surprise or comprehension answers the heading above it on screen.
//
// This wrapper exists for two reasons and does nothing else. OverlayPanel is a controlled
// component — /preflight owns the selection because a click there also drives the player in
// the section above it — and on /demo there is nothing else to drive, so the selection lives
// here. And the panel has to fire on its OWN arrival: it sits well below its section's top
// edge, so on the section's gate it would draw five arcs while still under the fold and be
// finished by the time it was framed.

import { useState } from "react";
import OverlayPanel from "../preflight/OverlayPanel";
import type { PreflightReport } from "../preflight/types";
import { ON_SCREEN, useReveal } from "./useReveal";

export default function BatchOverlay({ report, active }: { report: PreflightReport; active: boolean }) {
  // Opens on the batch's best cut, which is also the cut the rest of the page follows.
  const [selectedId, setSelectedId] = useState(report.bestId ?? report.order[0]);
  const [ref, framed] = useReveal<HTMLDivElement>(ON_SCREEN);
  return (
    <div ref={ref}>
      <OverlayPanel
        report={report}
        selectedId={selectedId}
        onSelect={setSelectedId}
        active={active && framed}
        defaultMetric="comprehension"
        // Legend, not a second ranking: see OverlayPanel's showScore. The board in the
        // generation beat is where this page states what won, and it scores off a different
        // artifact, so two sets of numbers for the same five cuts would just be the page
        // disagreeing with itself on camera.
        showScore={false}
      />
    </div>
  );
}
