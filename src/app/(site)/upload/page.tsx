import type { Metadata } from "next";
import BatchUpload from "@/components/upload/BatchUpload";

// /upload — batch intake, and the front door of the delivery loop:
//
//   /upload -> batches (queued) -> tools/concierge/run_batch.py -> /r/<token>
//
// In the (site) group so it inherits the scroll container, the header and the footer.
// The landing page's one-click UploadDialog is a different and continuing path: it takes
// a single ad with no brief for a look, and it does not produce a ranked read-out,
// because a percentile within a batch of one is not a number.
//
// Not indexed. Not because it is secret, but because the batch flow is currently sold in
// a conversation: we point specific people at it. Drop `robots` when it goes self-serve.
export const metadata: Metadata = {
  title: "soma — send a batch",
  description:
    "Send 2 to 10 cuts of the same campaign. Soma reads how a brain watches each one, ranks them against each other, and returns the timestamps where attention leaks.",
  robots: { index: false, follow: false },
};

export default function UploadPage() {
  return <BatchUpload />;
}
