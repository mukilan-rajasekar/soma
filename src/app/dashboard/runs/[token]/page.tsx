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

  // ONE DIAGNOSIS PER AD, not one per run. Ad selection inside ResultReport is client
  // state, so a single server-rendered strip stayed pinned to whichever ad was loaded
  // here while the player and charts moved — the diagnosis then described the wrong cut.
  // Rendering all of them up front keeps selection instant and needs no re-fetch.
  //
  // Bounded fan-out: src/lib/batch.ts caps a run at 10 ads, and each of these is a single
  // indexed read against edit_runs. Parallel rather than sequential so the page cost is
  // one round-trip, not ten.
  const diagnoses = await Promise.all(
    run.report.ads.map(async (ad) => {
      const editRuns = await loadEditRuns(token, ad.id);
      const editRun =
        editRuns.find(
          (r) => r.status === "done" && (r.cuts.length > 0 || r.shots.length > 0),
        ) ?? null;
      if (!editRun) return null;
      return [
        ad.id,
        <ShotDiagnosisStrip
          key={ad.id}
          shots={editRun.shots}
          cuts={editRun.cuts}
          candidates={editRun.candidates}
          baseScore={editRun.baseScore}
          title={ad.title}
        />,
      ] as const;
    }),
  );

  const shotDiagnosisByAd = Object.fromEntries(
    diagnoses.filter((d): d is NonNullable<typeof d> => d !== null),
  );

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
      editHrefTemplate={`/dashboard/v/${run.token}/{ad}/edit`}
      shotDiagnosisByAd={shotDiagnosisByAd}
    />
  );
}
