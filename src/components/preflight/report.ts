import fs from "node:fs";
import path from "node:path";

import type { ArcScale, PreflightAd, PreflightArc, PreflightReport } from "./types";

// Server-only. Reads the artifact demo/process_batch.py produces and hands it to the
// page. Imported ONLY by src/app/preflight/page.tsx.
//
// This NEVER THROWS. /demo's loader (src/app/demo/page.tsx:18-21) does a bare
// readFileSync with no try/catch, so a missing report.json would break `next build`.
// This route must not inherit that: the artifact is generated on a rented GPU box and
// legitimately won't exist on a fresh clone. Every failure path returns null, the page
// renders PreflightEmpty at 200, and the reason lands in the build log.

const REPORT_PATH = ["public", "preflight", "batch_report.json"];
const SUPPORTED_SCHEMA = "batch-1.0";
/** Mirrors process_batch.py's --video-url-prefix default (demo/process_batch.py:1299). */
const VIDEO_URL_PREFIX = "/preflight/videos";

function warn(reason: string): null {
  console.warn(`[preflight] ${path.join(...REPORT_PATH)}: ${reason}`);
  return null;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isFiniteArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every(isFiniteNumber);

/** Reject anything that isn't a same-origin absolute path. A generated file must never
 *  be able to inject a remote script or a `javascript:` src into the video element. */
function safeVideoPath(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return null;
  return v;
}

/** `video`/`poster` are only populated when process_batch.py runs with --web-videos
 *  (demo/process_batch.py:1534-1540); without it both are null and the only pointer to
 *  the media is `filename`, the basename of the source mp4. Resolve that against the
 *  public dir so a report generated without the transcode step still plays.
 *
 *  Basename only — a filename carrying a separator, a traversal segment, or a scheme
 *  would escape the videos dir, and this file is generated off-box. */
function safeVideoFilename(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  if (!name || name.startsWith(".") || name.includes("/") || name.includes("\\")) return null;
  return `${VIDEO_URL_PREFIX}/${encodeURIComponent(name)}`;
}

function validateArc(raw: unknown, n: number, label: string): PreflightArc | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (!isFiniteArray(a.raw) || a.raw.length !== n) {
    console.warn(`[preflight] ${label}: arc.raw is not ${n} finite numbers — dropping the lane`);
    return null;
  }
  const psc = isFiniteArray(a.psc) && a.psc.length === n ? a.psc : a.raw;
  const mag = isFiniteArray(a.mag) && a.mag.length === n ? a.mag : undefined;
  return { raw: a.raw, psc, mag, stats: a.stats as PreflightArc["stats"] };
}

function validateAd(raw: unknown, i: number): PreflightAd | null {
  if (!raw || typeof raw !== "object") return warn(`ads[${i}] is not an object`);
  const a = raw as Record<string, unknown>;
  const id = typeof a.id === "string" && a.id ? a.id : null;
  if (!id) return warn(`ads[${i}] has no id`);

  if (!isFiniteArray(a.timestamps) || a.timestamps.length < 2) {
    return warn(`${id}: timestamps must be >= 2 finite numbers`);
  }
  for (let k = 1; k < a.timestamps.length; k++) {
    if (a.timestamps[k] <= a.timestamps[k - 1]) {
      return warn(`${id}: timestamps are not strictly ascending at index ${k}`);
    }
  }
  if (!isFiniteNumber(a.durationS) || a.durationS <= 0) {
    return warn(`${id}: durationS must be a positive number`);
  }

  const s = (a.scores ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (isFiniteNumber(v) ? v : 0);

  // A failed arc is survivable — the ad still ranks, it just has no curve to draw.
  const arc = validateArc(a.arc, a.timestamps.length, id);

  const weakSpots = Array.isArray(a.weakSpots)
    ? (a.weakSpots as Record<string, unknown>[])
        .filter((w) => isFiniteNumber(w?.start) && isFiniteNumber(w?.end) && w.end > w.start)
        .map((w) => ({
          start: w.start as number,
          end: w.end as number,
          secs: num(w.secs),
          depth: num(w.depth),
        }))
    : [];

  const lanes: PreflightAd["lanes"] = {};
  if (a.lanes && typeof a.lanes === "object") {
    // process_batch.py:121 emits snake_case lane keys; earlier reports used camelCase.
    // Read either, store camelCase — `higher_order` was silently dropped before this.
    const laneKeys = [
      ["salventattn", "salventattn"],
      ["higherOrder", "higher_order"],
      ["visual", "visual"],
    ] as const;
    for (const [key, emitted] of laneKeys) {
      const src = a.lanes as Record<string, unknown>;
      const lane = validateArc(src[emitted] ?? src[key], a.timestamps.length, `${id}.${key}`);
      if (lane) lanes[key] = lane;
    }
  }

  return {
    id,
    title: typeof a.title === "string" && a.title ? a.title : id,
    rank: isFiniteNumber(a.rank) ? a.rank : i + 1,
    durationS: a.durationS,
    video: safeVideoPath(a.video) ?? safeVideoFilename(a.filename),
    poster: safeVideoPath(a.poster),
    timestamps: a.timestamps,
    arc,
    lanes,
    weakSpots,
    scores: {
      preflight: num(s.preflight),
      hook: num(s.hook),
      processing: num(s.processing),
      clarity: num(s.clarity),
    },
    features: a.features as PreflightAd["features"],
    clarity: a.clarity as PreflightAd["clarity"],
    media: a.media as PreflightAd["media"],
    diagnostics: a.diagnostics as PreflightAd["diagnostics"],
    flags: Array.isArray(a.flags) ? (a.flags as string[]) : [],
  };
}

function validateDomain(raw: unknown, fallbackFrom: PreflightAd[], scale: ArcScale):
  [number, number] | null {
  if (Array.isArray(raw) && raw.length === 2 && isFiniteNumber(raw[0]) && isFiniteNumber(raw[1])
    && raw[1] > raw[0]) {
    // Force the zero line on-canvas. A yDomain computed before baseline subtraction
    // would push it off, and a chart whose baseline isn't visible is lying about
    // where the baseline is.
    return [Math.min(0, raw[0]), Math.max(0, raw[1])];
  }
  // Derive from the data rather than reject — a usable chart beats an empty page.
  let lo = 0;
  let hi = 0;
  for (const ad of fallbackFrom) {
    const vals = ad.arc?.[scale];
    if (!vals) continue;
    for (const v of vals) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (hi <= lo) return null;
  const pad = 0.08 * (hi - lo);
  return [lo - pad, hi + pad];
}

function validate(raw: unknown): PreflightReport | null {
  if (!raw || typeof raw !== "object") return warn("top level is not an object");
  const r = raw as Record<string, unknown>;

  if (r.schemaVersion !== SUPPORTED_SCHEMA) {
    return warn(`schemaVersion ${String(r.schemaVersion)}, expected ${SUPPORTED_SCHEMA}`);
  }
  if (!Array.isArray(r.ads) || r.ads.length === 0) return warn("ads is empty or missing");

  const ads: PreflightAd[] = [];
  for (let i = 0; i < r.ads.length; i++) {
    const ad = validateAd(r.ads[i], i);
    if (!ad) return null;
    ads.push(ad);
  }
  ads.sort((a, b) => a.rank - b.rank);

  const chartRaw = (r.chart ?? {}) as Record<string, unknown>;
  const yRaw = (chartRaw.yDomain ?? {}) as Record<string, unknown>;
  const yDomainRaw = validateDomain(yRaw.raw, ads, "raw");
  const yDomainPsc = validateDomain(yRaw.psc, ads, "psc");
  if (!yDomainRaw || !yDomainPsc) {
    return warn("chart.yDomain is unusable and could not be derived from the arcs");
  }

  const maxT = Math.max(...ads.map((a) => a.durationS));
  const xd = chartRaw.xDomain;
  const xDomain: [number, number] =
    Array.isArray(xd) && xd.length === 2 && isFiniteNumber(xd[0]) && isFiniteNumber(xd[1])
      && xd[1] > xd[0]
      ? [xd[0], xd[1]]
      : [0, maxT];

  const byId = new Map(ads.map((a) => [a.id, a]));
  // Repair rather than reject: rank order already says who won.
  const bestId = typeof r.bestId === "string" && byId.has(r.bestId) ? r.bestId : ads[0].id;
  const worstId =
    typeof r.worstId === "string" && byId.has(r.worstId) ? r.worstId : ads[ads.length - 1].id;
  const order =
    Array.isArray(r.order) && r.order.length === ads.length
      && (r.order as unknown[]).every((id) => typeof id === "string" && byId.has(id))
      ? (r.order as string[])
      : ads.map((a) => a.id);

  const scale: ArcScale = chartRaw.defaultScale === "psc" ? "psc" : "raw";
  const w = (r.weights ?? {}) as Record<string, unknown>;

  return {
    schemaVersion: SUPPORTED_SCHEMA,
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
    generator: r.generator as PreflightReport["generator"],
    license: typeof r.license === "string" ? r.license : undefined,
    claim: r.claim as PreflightReport["claim"],
    batch: {
      ...((r.batch ?? {}) as PreflightReport["batch"]),
      name: (r.batch as Record<string, unknown>)?.name as string || "Untitled batch",
      nAds: ads.length,
    },
    weights: {
      hook: isFiniteNumber(w.hook) ? w.hook : 0.4,
      processing: isFiniteNumber(w.processing) ? w.processing : 0.35,
      clarity: isFiniteNumber(w.clarity) ? w.clarity : 0.25,
    },
    scoring: r.scoring as PreflightReport["scoring"],
    chart: {
      arcRoiLabel:
        typeof chartRaw.arcRoiLabel === "string"
          ? chartRaw.arcRoiLabel
          : "Dorsal attention network",
      defaultScale: scale,
      units: (chartRaw.units ?? { raw: "Δ vs baseline", psc: "baseline SD" }) as Record<
        ArcScale,
        string
      >,
      xDomain,
      yDomain: { raw: yDomainRaw, psc: yDomainPsc },
      fpsArc: isFiniteNumber(chartRaw.fpsArc) ? chartRaw.fpsArc : 1,
      zeroLine: 0,
    },
    bestId,
    worstId,
    order,
    ads,
    comparability: r.comparability as PreflightReport["comparability"],
    sanity: r.sanity as PreflightReport["sanity"],
    warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
  };
}

export function loadPreflightReport(): PreflightReport | null {
  const file = path.join(process.cwd(), ...REPORT_PATH);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    return warn(
      code === "ENOENT"
        ? "not found — run demo/process_batch.py and drop batch_report.json here"
        : `unreadable (${code ?? String(e)})`,
    );
  }
  try {
    return validate(JSON.parse(text));
  } catch (e) {
    return warn(`invalid JSON (${(e as Error).message})`);
  }
}
