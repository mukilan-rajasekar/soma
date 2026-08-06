import type { Metadata } from "next";
import BatchUpload from "@/components/upload/BatchUpload";

// /upload — batch intake, and the front door of the delivery loop:
//
//   /upload -> batches (queued) -> tools/concierge/run_batch.py -> /r/<token>
//
// In the (site) group so it inherits the scroll container, the header and the footer.
// The landing page's one-click UploadDialog is a different and continuing path: it takes
// a single ad with no brief for a look. It still does not produce a RANKED read-out — a
// percentile within a run of one is not a number — but since
// process_batch.py:within_item_scores() a single ad sent through THIS form does get a
// full review, scored against its own timeline. The difference is the brief: Clarity is
// 25% of the score and cannot be computed without one.
//
// Not indexed. Not because it is secret, but because the batch flow is currently sold in
// a conversation: we point specific people at it. Drop `robots` when it goes self-serve.
export const metadata: Metadata = {
  title: "soma — send your ads",
  description:
    "Send one ad or up to ten. Soma reads how a brain watches every second, returns the timestamps where attention leaks, and ranks them against each other when there are three or more.",
  robots: { index: false, follow: false },
};

export default function UploadPage() {
  return <BatchUpload />;
}
