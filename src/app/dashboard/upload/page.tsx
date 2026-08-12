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
import { listBrandsForUser } from "@/lib/serve";
import { requireUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "soma · send a batch",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardUploadPage() {
  // The session already knows who this is and what brands they own; the form should
  // never ask a signed-in person to retype either. /upload (the anonymous front door)
  // keeps rendering BatchUpload prop-less and is unchanged by this.
  const user = await requireUser("/dashboard/upload");
  const brands = await listBrandsForUser();

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-16 pt-[clamp(28px,5vw,44px)]">
      <h1 className="text-balance text-hero text-ink">
        Send a <span className="font-serif font-normal italic">batch</span>.
      </h1>
      <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
        Upload the cuts, name the brand and the offer, and the run lands in your library
        when scoring finishes — same intake as the public form, owned by this account.
      </p>
      <div className="mt-10">
        <BatchUpload
          initialEmail={user.email ?? undefined}
          brands={brands.map((b) => b.name)}
        />
      </div>
    </div>
  );
}
