import type { Metadata } from "next";
import DemoConsole from "@/components/demo/DemoConsole";

// The arc player is its own fixed-viewport console (it manages its own layout like the
// landing hero), so it is NOT wrapped in the scrolling (site) group — it renders full
// screen and scrolls internally. DemoConsole is a client component; this segment stays
// a Server Component so it can export metadata.
export const metadata: Metadata = {
  title: "soma — live neural read-out",
  description:
    "Watch a video ad's predicted attention arc, valence and arousal, and whole-cortex activation play back on one shared timeline — from the file, no panel.",
};

export default function DemoPage() {
  return <DemoConsole />;
}
