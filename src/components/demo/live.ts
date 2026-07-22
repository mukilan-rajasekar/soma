// Live Supabase arcs → picker / compare merge.
//
// Any arc published to the `arcs` table appears in the /demo picker and the A/B compare
// dropdowns on load — no redeploy. We fetch through our own GET /api/arcs route
// (server-side, so Supabase creds never reach the browser), gate every untrusted row
// with validArc (a bad row can never enter the picker, the boot pick, or the compare
// dropdown), dedupe by ad_id, and APPEND (never unshift) so the featured real run and
// the sample cards never jump under the visitor when the async fetch resolves late. The
// local sample arcs stay the baseline.

import { validArc, type Arc } from "@/lib/arc";
import type { VideoItem } from "./Picker";

// A video item carries EITHER a URL to a static sample json (`arc`) OR an inline
// in-memory arc already fetched from Supabase (`arcData`). loadArc resolves both, so a
// live card plays back through the exact same loader as the static sample cards.
export function loadArc(item: VideoItem): Promise<Arc> {
  if (item.arcData) return Promise.resolve(item.arcData);
  return fetch(item.arc).then((r) => {
    if (!r.ok) throw new Error("arc " + r.status);
    return r.json() as Promise<Arc>;
  });
}

// Deterministic near-white gradient from the id keeps live cards on the light editorial
// palette: the same ad always gets the same faint slate swatch (no random colour per
// reload), matching the static sample thumbs.
export function gradFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = 188 + (h % 42); // teal→blue band, matches the theme
  return `linear-gradient(135deg,#ffffff,hsl(${hue} 20% 95%) 60%,hsl(${hue} 16% 92%))`;
}

type LiveRow = {
  ad_id?: string;
  title?: string;
  arc?: unknown;
  meta?: { dataset?: string; source?: string } | null;
};

// Fetch /api/arcs, validate + dedupe against `existing`, and return the NEW live
// VideoItems to append. Never throws: offline / unconfigured / malformed → [] so the
// samples keep working (the route itself already returns [] when Supabase is unset).
export async function mergeLiveArcs(existing: VideoItem[]): Promise<VideoItem[]> {
  let rows: unknown;
  try {
    const res = await fetch("/api/arcs", { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    rows = await res.json();
  } catch {
    return []; // offline / not set up yet — keep the samples
  }
  if (!Array.isArray(rows) || !rows.length) return [];

  const have = new Set(existing.map((v) => v.id));
  const live: VideoItem[] = [];
  for (const row of rows as LiveRow[]) {
    const id = row && row.ad_id;
    const arcVal: unknown = row && row.arc;
    // skip dupes AND malformed rows: gate the untrusted arc with validArc so a bad row
    // never enters the picker, the boot pick, or the compare dropdown.
    if (!id || have.has(id) || !validArc(arcVal)) continue;
    have.add(id);
    const tag = row.meta && (row.meta.dataset || row.meta.source);
    live.push({
      id,
      title: row.title || id,
      src: "live · " + (tag || "Supabase"),
      arc: "",
      arcData: arcVal,
      grad: gradFor(id),
    });
  }
  return live;
}
