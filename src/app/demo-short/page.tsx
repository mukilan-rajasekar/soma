import type { Metadata } from "next";
import DemoScrollPage from "@/components/demo2/DemoScrollPage";
import { loadDemoReport } from "@/lib/demo-report";

// /demo-short is the recording surface: the same page as /demo with six beats instead of
// twelve, sized to be scrolled top-to-bottom in a 60-second screen capture. Hero → the
// science → hook scoring → the ranked batch → generation → editing → the database → CTA.
//
// It is NOT a trimmed copy of the component. Both routes render DemoScrollPage; this one
// passes variant="short", which filters the `fullOnly` sections out of the single section
// list. Section numbers and the act-strip targets are derived from what survives, so the two
// pages number themselves correctly without anyone maintaining two sets of figures.
//
// What /demo has and this does not: comprehension, the silent-ad message track, the read-out
// recap, "watch it live", the service ladder, the buyer's checklist. Each was cut for time
// alone — if you are sending this link to someone who will actually read it rather than
// watch it, send /demo instead.
//
// noindex: this is one page's worth of content at two URLs, and /demo is the canonical one.
// Without this the two would compete in search and split their own ranking.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.usesoma.work"),
  title: "soma — the 60-second read-out",
  description:
    "The short cut: how a brain watches an ad — hook, attention, comprehension — then generation and editing scored against that read.",
  alternates: { canonical: "/demo" },
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    url: "/demo-short",
    siteName: "soma",
    title: "soma — the 60-second read-out",
    description:
      "Six beats: measure the cut, rank the batch, generate against the read, edit in a sentence.",
  },
  twitter: {
    card: "summary_large_image",
    title: "soma — the 60-second read-out",
    description:
      "Six beats: measure the cut, rank the batch, generate against the read, edit in a sentence.",
  },
};

export default function DemoShortPage() {
  return <DemoScrollPage report={loadDemoReport()} variant="short" />;
}
