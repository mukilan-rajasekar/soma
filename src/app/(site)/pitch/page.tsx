import type { Metadata } from "next";
import PitchDeck from "@/components/site/PitchDeck";

// Unlisted investor narrative — kept out of search indexes.
export const metadata: Metadata = {
  title: "soma — pitch deck",
  description:
    "Soma investor narrative: the problem, the public-model wedge, the product, the science, the roadmap and moat, market, team, and the ask.",
  robots: { index: false, follow: false },
};

// Server segment (exports metadata); the keyboard-driven deck is a client island.
export default function PitchPage() {
  return <PitchDeck />;
}
