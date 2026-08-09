// robots.txt, generated. The disallow list is the set of routes that are per-user,
// per-token, or deliberately unlisted — each of them also carries its own noindex
// metadata, so this file is the belt to that suspenders: a crawler that respects either
// signal stays out. The canonical origin carries the www (AGENTS.md).

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/auth/",
          "/r/",
          "/g/",
          "/e/",
          "/sign-in",
          "/sign-up",
          "/forgot-password",
          "/update-password",
          "/pitch",
          "/upload",
          "/edit",
          "/generate",
          "/brain-lab",
        ],
      },
    ],
    sitemap: "https://www.usesoma.work/sitemap.xml",
  };
}
