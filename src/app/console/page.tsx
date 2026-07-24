import type { Metadata } from "next";
import DemoConsole from "@/components/demo/DemoConsole";

// The interactive arc player, moved here from /demo when /demo became the scroll
// narrative. Same fixed-viewport console (it manages its own layout like the landing
// hero), so it is NOT wrapped in the scrolling (site) group. Client component; this
// segment stays a Server Component so it can export metadata.
export const metadata: Metadata = {
  title: "soma — live neural read-out console",
  description:
    "Pick any ad and watch its attention arc, comprehension, and whole-cortex activation play back on one shared timeline — read straight from the file, no panel.",
};

export default function ConsolePage() {
  return <DemoConsole />;
}
