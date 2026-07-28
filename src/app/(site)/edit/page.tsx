import type { Metadata } from "next";

import EditBeta from "@/components/edit/EditBeta";
import { loadDemoReport } from "@/lib/demo-report";
import { loadBatchEditPreset } from "@/lib/edit-source";

export const metadata: Metadata = {
  title: "soma — edit beta",
  description:
    "A narrow, honest edit beta: search the best re-cut of a campaign ad, rank the candidates, and verify them when the scorer is available.",
  robots: { index: false, follow: false },
};

export default async function EditPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; ad?: string }>;
}) {
  const report = loadDemoReport();
  const demoVariants = report.campaign.variants.map((variant) => ({
    id: variant.id,
    title: variant.title,
  }));
  const defaultDemoAdId = report.campaign.dipId ?? demoVariants[0]?.id ?? "";

  const { batch, ad } = await searchParams;
  const preset = batch ? await loadBatchEditPreset(batch) : null;
  const batchPreset = preset
    ? {
        ...preset,
        defaultAdId:
          ad && preset.options.some((option) => option.id === ad) ? ad : preset.defaultAdId,
      }
    : null;

  return (
    <EditBeta
      demoVariants={demoVariants}
      defaultDemoAdId={defaultDemoAdId}
      batchPreset={batchPreset}
    />
  );
}
