import type { Metadata } from "next";
import DemoScrollPage from "@/components/demo2/DemoScrollPage";
import { loadDemoReport } from "@/lib/demo-report";
import { loadPreflightReport } from "@/components/preflight/report";

// /demo is the LONG-FORM product narrative — the link pasted into a YC application, and the
// page someone in diligence reads with no video to guide them. It renders every section,
// including the service ladder and the buyer's checklist, which are the two most useful
// things here for a sceptical reader and the two worst things to put in a 60-second video.
// The recordable six-beat cut is a separate route, /demo-short; both render the same
// component with a different `variant`, so nothing can drift between them.
//
// Server Component so it can read the report and export metadata; renders server-side, so a
// reader with JS disabled still gets the whole page. The old interactive console is /console.
// This route is the link that gets pasted into a YC application, a DM and a deck, so the
// social card matters as much as the page. It previously had only a title + description:
// no OG tags, no Twitter card, no canonical and no metadataBase, which meant every share
// of the product link previewed as a bare URL. opengraph-image.tsx in this folder generates
// the card; metadataBase is what lets Next resolve it to an absolute URL.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.usesoma.work"),
  title: "soma — find the ad that wins",
  description:
    "Anyone can make a hundred ads; nobody knows which one wins. Soma reads how a brain watches each cut — hook, attention, comprehension — and finds the winner.",
  alternates: { canonical: "/demo" },
  openGraph: {
    type: "website",
    url: "/demo",
    siteName: "soma",
    title: "soma — find the ad that wins",
    description:
      "Soma reads how a brain watches each cut — hook, attention, comprehension — then builds and edits against that read.",
  },
  twitter: {
    card: "summary_large_image",
    title: "soma — find the ad that wins",
    description:
      "Soma reads how a brain watches each cut — hook, attention, comprehension — then builds and edits against that read.",
  },
};

export default function DemoPage() {
  return <DemoScrollPage report={loadDemoReport()} preflight={loadPreflightReport()} variant="full" />;
}
