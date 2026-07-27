import type { Metadata } from "next";
import DemoScrollPage from "@/components/demo2/DemoScrollPage";
import { loadDemoReport } from "@/lib/demo-report";

// /demo-short is the recording surface: the same page as /demo with seven beats instead of
// twelve, scrolled by hand and narrated live at about three minutes. Hero → the science →
// hook scoring → comprehension → generation → editing → watch it live → the database → CTA.
//
// The page does not scroll itself. One control (IntroCue) decides when the first animation
// happens, so the take can open on the headline arriving rather than on a page that finished
// building during hydration; after that every figure fires on its own arrival in frame, at
// whatever pace the voiceover wants. Pausing on a beat, scrolling back, or moving fast
// through a section cannot desynchronise anything.
//
// It is NOT a trimmed copy of the component. Both routes render DemoScrollPage; this one
// passes variant="short", which filters the `fullOnly` sections out of the single section
// list. Section numbers and the act-strip targets are derived from what survives, so the two
// pages number themselves correctly without anyone maintaining two sets of figures.
//
// What /demo has and this does not: the silent-ad message track, the read-out recap, the
// service ladder, the buyer's checklist. None of them is cut for time any more — each would
// repeat something the walkthrough has already shown or already said out loud. If you are
// sending this link to someone who will read it rather than watch it, send /demo instead.
//
// noindex: this is one page's worth of content at two URLs, and /demo is the canonical one.
// Without this the two would compete in search and split their own ranking.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.usesoma.work"),
  title: "soma · the walkthrough",
  description:
    "The short cut: how a brain watches an ad (hook, attention, comprehension), then generation and editing scored against that read.",
  alternates: { canonical: "/demo" },
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    url: "/demo-short",
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

export default function DemoShortPage() {
  return <DemoScrollPage report={loadDemoReport()} variant="short" />;
}
