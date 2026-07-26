import fs from "node:fs";
import path from "node:path";
import type { Report } from "@/components/demo2/types";

// The frozen demo report, shared by /demo and /demo-short so the two routes can never
// render different data. public/demo/report.json is produced by tools/demo/build_report.py
// from real frozen-TRIBE output over real ads; nothing here computes or adjusts it.
//
// Read synchronously at render time on the server, which is what lets both routes prerender
// as static HTML — a reader with JS disabled still gets the whole page.
export function loadDemoReport(): Report {
  const p = path.join(process.cwd(), "public", "demo", "report.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as Report;
}
