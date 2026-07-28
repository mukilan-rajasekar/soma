import type { Metadata } from "next";

import EditBeta from "@/components/edit/EditBeta";
import { loadDemoReport } from "@/lib/demo-report";

export const metadata: Metadata = {
  title: "soma — edit beta",
  description:
    "A narrow, honest edit beta: search the best re-cut of a campaign ad, rank the candidates, and verify them when the scorer is available.",
  robots: { index: false, follow: false },
};

export default function EditPage() {
  const report = loadDemoReport();
  const variants = report.campaign.variants.map((variant) => ({
    id: variant.id,
    title: variant.title,
  }));
  const defaultAdId = report.campaign.dipId ?? variants[0]?.id ?? "";
  return <EditBeta variants={variants} defaultAdId={defaultAdId} />;
}
