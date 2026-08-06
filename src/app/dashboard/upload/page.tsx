// /dashboard/upload — the same intake, inside the shell.
//
// IT RENDERS THE SAME COMPONENT AS /upload, deliberately. BatchUpload is the whole flow —
// signing an upload URL per file, PUTting the bytes, then POSTing the brief to
// /api/batches/create — and a second copy tuned for the dashboard would be a second place
// for the manifest contract to drift from src/lib/batch.ts. What changes is not the form
// but who is on the other end of it: /api/batches/create now reads the session and stamps
// `user_id` on the batch, so a run started from here lands in this library instead of
// being reachable only by its share token.
//
// /upload STAYS OPEN AND ANONYMOUS. It is the concierge front door, it has a Playwright
// smoke floor, and PLAN.md keeps it noindex-but-reachable until intake email, the reaper
// and accounts all land. This route sits beside it rather than replacing it.

import type { Metadata } from "next";

import BatchUpload from "@/components/upload/BatchUpload";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "soma · send a batch",
  robots: { index: false, follow: false, nocache: true },
};

export default function DashboardUploadPage() {
  return <BatchUpload />;
}
