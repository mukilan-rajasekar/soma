// /dashboard/runs/<token> — the owned batch read-out.
//
// Same instruments as /r/<token> (ResultReport), addressed by session ownership rather than
// the capability URL. Edit hand-offs stay inside Studio. Live BatchEditPreview is skipped
// on purpose: Vercel has no Python; precomputed edit_cuts feed ShotDiagnosisStrip instead.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ShotDiagnosisStrip from "@/components/dashboard/ShotDiagnosisStrip";
import ResultReport from "@/components/result/ResultReport";
import { loadRun } from "@/lib/dashboard";
import { loadEditRuns } from "@/lib/edit-cuts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ad?: string }>;
}) {
  const { token } = await params;
  const { ad: adParam } = await searchParams;
  const run = await loadRun(token);
  if (!run) notFound();

  const initialAdId =
    adParam && run.report.ads.some((a) => a.id === adParam) ? adParam : undefined;

  const focusId = initialAdId ?? run.report.bestId;
  const editRuns = await loadEditRuns(token, focusId);
  const editRun =
    editRuns.find((r) => r.status === "done" && (r.cuts.length > 0 || r.shots.length > 0)) ??
    null;
  const focusAd = run.report.ads.find((a) => a.id === focusId);

  return (
    <ResultReport
      report={run.report}
      batchName={run.batchName}
      generatedAt={run.generatedAt}
      batchToken={run.token}
      editsAvailable={false}
      preferPrecomputedEdits
      initialAdId={initialAdId}
      backHref="/dashboard"
      editHrefForAd={(adId) =>
        `/dashboard/v/${run.token}/${encodeURIComponent(adId)}/edit`
      }
      shotDiagnosis={
        editRun && focusAd ? (
          <ShotDiagnosisStrip
            shots={editRun.shots}
            cuts={editRun.cuts}
            candidates={editRun.candidates}
            baseScore={editRun.baseScore}
            title={focusAd.title}
          />
        ) : null
      }
    />
  );
}
