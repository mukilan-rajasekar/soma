// sitemap.xml, generated. ONLY the public, indexable routes belong here — everything
// that declares robots noindex (auth screens, betas, /pitch, the dashboard, capability
// URLs) is excluded on purpose, because a sitemap naming a noindex page is the two
// signals arguing with each other. Keep this list in step with robots.ts.

import type { MetadataRoute } from "next";

const ORIGIN = "https://www.usesoma.work";

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/demo",
  "/science",
  "/compare",
  "/audit",
  "/preflight",
  "/run",
  "/console",
  "/story",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${ORIGIN}${path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
