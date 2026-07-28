import type { Metadata } from "next";
import DemoScrollPage from "@/components/demo2/DemoScrollPage";
import { loadDemoReport } from "@/lib/demo-report";
import { loadPreflightReport } from "@/components/preflight/report";

// /demo is the recording surface: eight beats, scrolled by hand and narrated live at about
// three minutes. Hero → the science → hook scoring → the read-out → the batch → "Did the
// brand actually land?" → generation → editing → the database → CTA. This cut lived at
// /demo-short until it took this URL over; the long-form page that was here is still in the
// component behind `fullOnly`, one word on the last line of this file away.
//
// EIGHT, up from seven: the comprehension beat is back on this route. It shows what the
// comprehension signal is measured from (text recognition off the screen, speech recognition
// out of the audio, both against the language lane), which no other live beat does — the
// batch chart above it ranks cuts ON comprehension without ever showing the mechanism. Budget
// roughly fifteen extra seconds of narration for it.
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
// repeat something the walkthrough has already shown or already said out loud. The silent-ad
// beat in particular is now MORE redundant than it was, not less: the comprehension beat
// above renders the same MessageTrack component, so on this route the two would run back to
// back on two different clips.
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
      "Eight beats: measure the cut, rank the batch, read the words on screen and out loud, generate against the read, edit in a sentence.",
  },
  twitter: {
    card: "summary_large_image",
    title: "soma · the walkthrough",
    description:
      "Eight beats: measure the cut, rank the batch, read the words on screen and out loud, generate against the read, edit in a sentence.",
  },
};

export default function DemoPage() {
  return <DemoScrollPage report={loadDemoReport()} preflight={loadPreflightReport()} variant="short" />;
}
