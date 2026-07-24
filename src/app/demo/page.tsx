import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import DemoScrollPage from "@/components/demo2/DemoScrollPage";
import type { Report } from "@/components/demo2/types";

// /demo is the scroll-through product narrative (the YC product link). It reads the
// pre-computed report public/demo/report.json — every number in it comes from
// tools/demo/build_report.py over real frozen-TRIBE output — and renders it server-side,
// so a reader with JS disabled still gets the full page. The old interactive console
// moved to /console. Server Component so it can read the file + export metadata.
export const metadata: Metadata = {
  title: "soma — find the ad that wins",
  description:
    "Anyone can make a hundred ads; nobody knows which one wins. Soma reads how a brain watches each cut — hook, attention, comprehension — and finds the winner.",
};

function loadReport(): Report {
  const p = path.join(process.cwd(), "public", "demo", "report.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as Report;
}

export default function DemoPage() {
  return <DemoScrollPage report={loadReport()} />;
}
