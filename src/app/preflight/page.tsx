import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";

import PreflightEmpty from "@/components/preflight/PreflightEmpty";
import PreflightView from "@/components/preflight/PreflightView";
import { loadPreflightReport } from "@/components/preflight/report";

// /preflight reads public/preflight/batch_report.json — produced by demo/process_batch.py
// on a GPU box — and renders it server-side, so a reader with JS disabled still gets the
// whole page. Same contract as /demo: the JSON is read at build time, so a new artifact
// needs a rebuild.
//
// Unlike /demo, the load is fault-tolerant (see components/preflight/report.ts): a
// missing or malformed artifact renders the empty state at 200 instead of throwing
// during `next build`.
export const metadata: Metadata = {
  title: "soma — find the ad that wins",
  description:
    "Anyone can make a hundred ads; nobody knows which one wins. Soma reads how a brain watches each cut — attention, surprise, comprehension — against one shared baseline, and finds the winner.",
};

/** The corpus counters live in /demo's report so the two pages quote one set of numbers.
 *  Nothing on this page depends on them, so a missing or malformed file just drops the two
 *  stat tiles rather than failing the build. */
function loadCorpus(): { ads: number; advertisers: number } | null {
  try {
    const p = path.join(process.cwd(), "public", "demo", "report.json");
    const c = (JSON.parse(fs.readFileSync(p, "utf8")) as {
      corpus?: { ads?: unknown; advertisers?: unknown };
    }).corpus;
    if (typeof c?.ads !== "number" || typeof c?.advertisers !== "number") return null;
    return { ads: c.ads, advertisers: c.advertisers };
  } catch {
    return null;
  }
}

export default function PreflightPage() {
  const report = loadPreflightReport();
  return report
    ? <PreflightView report={report} corpus={loadCorpus()} />
    : <PreflightEmpty />;
}
