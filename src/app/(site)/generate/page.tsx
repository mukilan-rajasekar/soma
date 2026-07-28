import type { Metadata } from "next";

import GenerateBeta from "@/components/generate/GenerateBeta";

export const metadata: Metadata = {
  title: "soma — generation beta",
  description:
    "A narrow, honest generation beta: one brief in, several deliberately different candidate openings out, ranked when the scorer is available.",
  robots: { index: false, follow: false },
};

export default function GeneratePage() {
  return <GenerateBeta />;
}
