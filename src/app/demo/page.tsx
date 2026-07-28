import type { Metadata } from "next";
import DemoScrollPage from "@/components/demo2/DemoScrollPage";
import { loadDemoReport } from "@/lib/demo-report";
import { loadPreflightReport } from "@/components/preflight/report";

// /demo is the recording surface: seven beats, scrolled by hand and narrated live at about
// three minutes. Hero → the science → hook scoring → "Did the brand actually land?" →
// generation → editing → watch it live → the database → CTA. This cut lived at /demo-short
// until it took this URL over; the long-form twelve-beat page that was here is still in the
// component behind `fullOnly`, one word on the last line of this file away.
//
// The page does not scroll itself and has no start control. The take begins on the click
// that navigates here from the landing page; after that every figure fires on its own
// arrival in frame, at whatever pace the voiceover wants. Pausing on a beat, scrolling
// back, or moving fast through a section cannot desynchronise anything.
//
// It is NOT a trimmed copy of the component. It renders DemoScrollPage with variant="short",
// which filters the `fullOnly` sections out of the single section list. Section numbers and
// the act-strip targets are derived from what survives, so nothing is maintained twice.
//
// What the long cut has and this does not: the silent-ad message track, the read-out recap,
// the service ladder, the buyer's checklist. None of them is cut for time — each would
// repeat something the walkthrough has already shown or already said out loud.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.usesoma.work"),
  title: "soma · the walkthrough",
  description:
    "The short cut: how a brain watches an ad (hook, attention, comprehension), then generation and editing scored against that read.",
  alternates: { canonical: "/demo" },
  openGraph: {
    type: "website",
    url: "/demo",
    siteName: "soma",
    title: "soma · the walkthrough",
    description:
      "Seven beats: measure the cut, rank the batch, generate against the read, edit in a sentence, watch it score real frames.",
  },
  twitter: {
    card: "summary_large_image",
    title: "soma · the walkthrough",
    description:
      "Seven beats: measure the cut, rank the batch, generate against the read, edit in a sentence, watch it score real frames.",
  },
};

export default function DemoPage() {
  return <DemoScrollPage report={loadDemoReport()} preflight={loadPreflightReport()} variant="short" />;
}
