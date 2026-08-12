// Shared batch-intake constants + helpers. PURE and environment-agnostic, exactly like
// src/lib/upload.ts: imported by the client form (`/upload`) AND by the server Route
// Handler that writes the row. It must never import server-only modules or `node:*`.
//
// ── THIS FILE MIRRORS demo/process_batch.py ─────────────────────────────────────
//
// Every constant below has a counterpart in the pipeline, named here next to it. The
// pipeline is the source of truth; this is a copy that exists so a customer finds out
// about a bad batch in the browser in under a second, instead of twenty minutes into a
// GPU run that then exits with a message only we will ever read.
//
//   MESSAGE_FIELDS       process_batch.py:129   six fields; Clarity is 25% of the score
//                                               and CANNOT be computed without them
//   COMPARABILITY_KEYS   process_batch.py:131   five keys that must agree across the batch
//   DURATION_BUCKETS     process_batch.py:106   length is a confound; one bucket per batch
//   HOOK_WINDOW_S        process_batch.py:85    an ad shorter than this has no hook to score
//
// If you change one of these, change it in BOTH places in the same commit. The runner
// re-validates server-side regardless (validate_batch() runs on the box and is what
// actually gates a run) — this copy is a courtesy, never the enforcement.

// ── the six message fields ──────────────────────────────────────────────────────
//
// Named exactly as process_batch.py reads them, so `manifest` can be handed to the
// pipeline verbatim with no mapping step. The label/hint pairs are what the form shows;
// they are here rather than in the component because the validator and the form must
// agree about what "missing" means.

export const MESSAGE_FIELDS = [
  "brand_name",
  "product_name",
  "primary_problem",
  "primary_benefit",
  "offer",
  "desired_cta",
] as const;

export type MessageField = (typeof MESSAGE_FIELDS)[number];

export const MESSAGE_FIELD_COPY: Record<
  MessageField,
  { label: string; hint: string; placeholder: string }
> = {
  brand_name: {
    label: "Brand",
    hint: "The name a viewer would recognise. We check whether it actually registers.",
    placeholder: "Kova",
  },
  product_name: {
    label: "Product",
    hint: "What is being sold in these cuts.",
    placeholder: "Whey Isolate",
  },
  primary_problem: {
    label: "The problem it solves",
    hint: "In your customer's words, not marketing's.",
    placeholder: "protein powder that makes you bloated",
  },
  primary_benefit: {
    label: "The promise",
    hint: "The one thing the ad has to land.",
    placeholder: "clean protein without the bloat",
  },
  offer: {
    label: "The offer",
    hint: "Discount, trial, bundle — whatever the ad asks them to take.",
    placeholder: "20% off your first order",
  },
  desired_cta: {
    label: "The call to action",
    hint: "The exact words on the button or in the voiceover.",
    placeholder: "tap the link in bio",
  },
};

// ── the five comparability keys ─────────────────────────────────────────────────
//
// process_batch.py refuses a batch whose ads disagree on any of these, because a
// ranking that mixes creative jobs is meaningless. We collect them ONCE for the whole
// batch rather than per ad, which makes disagreement structurally impossible instead of
// merely validated against.
//
// `product` is not asked for separately — it is product_name, and asking twice invites
// the two to differ.

export const COMPARABILITY_KEYS = [
  "platform",
  "placement",
  "objective",
  "product",
  "audience",
] as const;

export const PLATFORMS = ["meta", "tiktok", "youtube", "other"] as const;
export const PLACEMENTS = ["reels", "feed", "stories", "shorts", "in-stream", "other"] as const;
export const OBJECTIVES = ["conversions", "traffic", "awareness", "app installs", "other"] as const;

// ── batch size ──────────────────────────────────────────────────────────────────
//
// ONE ad is the floor, and it used to be two.
//
// The old floor was a correct statement about percentiles smuggled in as a product rule:
// every component is a percentile WITHIN the run, so one ad has nothing to be a
// percentile of. True — and it meant someone with a single ad was turned away at the form
// rather than told what we could and could not tell them about it.
//
// demo/process_batch.py:within_item_scores() now scores a run of one or two against the
// clip's OWN timeline instead: how the first three seconds rank among the ad's own
// seconds, how much of it holds above baseline, whether the message lands. A real review,
// a different quantity, and the artifact says which one it carries (`scoring.scale`).
//
// What one ad still does NOT get is a ranking, because there is nothing to rank. The
// upload form says that up front rather than letting someone discover it in the report.
//
// TEN remains the ceiling: the product claims it, and it is roughly a 30-minute run on
// one box. At n=5 each component can only take the values 10/30/50/70/90, so rank order
// is ordinal and the gaps between ranks are not meaningful — that caveat travels in the
// artifact itself (`scoring.smallNCaveat`) and the result page renders it.
export const MIN_BATCH_ADS = 1;
export const MAX_BATCH_ADS = 10;

/** True when a run of this size gets a ranking. Below it, scoring is within-item. */
export const RANKING_FLOOR = 3;

// ── duration ────────────────────────────────────────────────────────────────────
//
// Verbatim from process_batch.py:106. Length is a confound: a 9s cut and a 45s cut are
// not competing at the same job, so the pipeline hard-fails a batch that spans buckets
// (downgradeable only with --force, which the runner never passes).
export const DURATION_BUCKETS: readonly (readonly [number, string])[] = [
  [10, "≤10s"],
  [20, "11-20s"],
  [35, "21-35s"],
  [60, "36-60s"],
  [Infinity, ">60s"],
] as const;

export function durationBucket(seconds: number): string {
  for (const [upper, label] of DURATION_BUCKETS) if (seconds <= upper) return label;
  return DURATION_BUCKETS[DURATION_BUCKETS.length - 1][1];
}

/** An ad shorter than the hook window has no hook to score. process_batch.py:85. */
export const HOOK_WINDOW_S = 3;

// ── shapes ──────────────────────────────────────────────────────────────────────

export type Brief = {
  batch_name: string;
  platform: string;
  placement: string;
  objective: string;
  audience: string;
  brand_aliases: string[];
  product_aliases: string[];
} & Record<MessageField, string>;

/** One ad, after its bytes are in storage. `path` is the object key /sign minted. */
export type BatchAd = {
  path: string;
  filename: string;
  title: string;
  /** Seconds, as the browser's <video> element reported it. Used for the bucket check. */
  durationS: number;
};

export function emptyBrief(): Brief {
  return {
    batch_name: "",
    brand_name: "",
    product_name: "",
    primary_problem: "",
    primary_benefit: "",
    offer: "",
    desired_cta: "",
    platform: "meta",
    placement: "reels",
    objective: "conversions",
    audience: "",
    brand_aliases: [],
    product_aliases: [],
  };
}

// ── validation ──────────────────────────────────────────────────────────────────
//
// Returns a list of human-readable problems, empty when the batch is runnable. Shared
// so the form's inline errors and the API's 400 body can never disagree about what is
// wrong — the single most common way a two-sided validator drifts.

/** Fields the brief validator can blame. Used by the form to pin errors to inputs. */
export type BriefField = MessageField | "audience" | "platform" | "placement" | "objective";

/** Per-field problems, short form — the string that belongs NEXT TO the input. The
 *  form renders these inline; validateBrief() composes the same map into the summary
 *  list, so the two can never disagree about what is missing. */
export function briefFieldProblems(brief: Partial<Brief>): Partial<Record<BriefField, string>> {
  const problems: Partial<Record<BriefField, string>> = {};
  for (const f of MESSAGE_FIELDS) {
    if (!String(brief[f] ?? "").trim()) {
      problems[f] = `${MESSAGE_FIELD_COPY[f].label} is required.`;
    }
  }
  if (!String(brief.audience ?? "").trim()) {
    problems.audience = "Audience is required.";
  }
  for (const k of ["platform", "placement", "objective"] as const) {
    if (!String(brief[k] ?? "").trim()) problems[k] = `${k} is required.`;
  }
  return problems;
}

/** "Brand" / "Brand and Product" / "Brand, Product and The offer". */
function formatLabelList(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function validateBrief(brief: Partial<Brief>): string[] {
  const field = briefFieldProblems(brief);
  const problems: string[] = [];

  // One line for the message fields, however many are missing — the old version
  // repeated the same 25%-clause per field, which read as six copies of one sentence.
  const missing = MESSAGE_FIELDS.filter((f) => field[f]);
  if (missing.length) {
    const labels = formatLabelList(missing.map((f) => MESSAGE_FIELD_COPY[f].label));
    problems.push(
      missing.length === 1
        ? `${labels} is required — clarity is 25% of the score and cannot be computed without it.`
        : `${labels} are required — clarity is 25% of the score and cannot be computed without them.`,
    );
  }
  if (field.audience) {
    problems.push("Audience is required — it is one of the five keys that make a batch comparable.");
  }
  for (const k of ["platform", "placement", "objective"] as const) {
    if (field[k]) problems.push(`${k} is required.`);
  }
  return problems;
}

export function validateAds(ads: BatchAd[]): string[] {
  const problems: string[] = [];

  if (ads.length < MIN_BATCH_ADS) {
    problems.push("Add at least one ad.");
  }
  if (ads.length > MAX_BATCH_ADS) {
    problems.push(`A run takes at most ${MAX_BATCH_ADS} ads.`);
  }

  // The bucket check, done here so it costs a second rather than a GPU run.
  const buckets = new Map<string, string[]>();
  for (const a of ads) {
    if (!Number.isFinite(a.durationS) || a.durationS <= 0) continue;
    const b = durationBucket(a.durationS);
    buckets.set(b, [...(buckets.get(b) ?? []), a.filename]);
  }
  if (buckets.size > 1) {
    const spread = [...buckets.entries()]
      .map(([b, names]) => `${b} (${names.join(", ")})`)
      .join(" and ");
    problems.push(
      `These cuts span more than one length category: ${spread}. Length is a confound, so the batch has to be length-matched before it can be ranked.`,
    );
  }

  for (const a of ads) {
    if (Number.isFinite(a.durationS) && a.durationS > 0 && a.durationS < HOOK_WINDOW_S) {
      problems.push(`${a.filename} is under ${HOOK_WINDOW_S}s, which is shorter than the hook window — there is no hook in it to score.`);
    }
  }

  const titles = ads.map((a) => a.title.trim()).filter(Boolean);
  if (new Set(titles).size !== titles.length) {
    problems.push("Two cuts share a name. Give each one something you'll recognise in the ranking.");
  }
  return problems;
}

// ── the manifest ────────────────────────────────────────────────────────────────
//
// The ONE place a manifest is constructed, and it emits exactly the JSON
// demo/process_batch.py reads off disk (demo/manifest.example.json). Stored verbatim in
// batches.manifest, written verbatim to the workdir by tools/concierge/run_batch.py.
// There is no mapping layer between the form and the pipeline, so there is nothing in
// between to drift.
//
// AD IDS ARE MINTED, NOT TAKEN. ad_01…ad_10 in submission order, and `filename` is
// `<id>.mp4` rather than whatever the customer's file was called. The runner downloads
// each storage object to that exact name, which means the manifest never depends on a
// customer filename surviving sanitizeName(), and two files called "final_FINAL_v2.mp4"
// cannot collide.

export function adIdFor(index: number): string {
  return `ad_${String(index + 1).padStart(2, "0")}`;
}

export type Manifest = {
  batch_name: string;
  brand_aliases: string[];
  product_aliases: string[];
  batch: Record<string, string>;
  ads: { filename: string; id: string; title: string }[];
} & Record<MessageField, string>;

export function buildManifest(brief: Brief, ads: BatchAd[]): Manifest {
  const message = Object.fromEntries(
    MESSAGE_FIELDS.map((f) => [f, String(brief[f] ?? "").trim()]),
  ) as Record<MessageField, string>;

  return {
    batch_name: brief.batch_name.trim() || `${message.brand_name} batch`,
    ...message,
    brand_aliases: normaliseAliases(brief.brand_aliases),
    product_aliases: normaliseAliases(brief.product_aliases),
    // Collected once for the whole batch, so the ads cannot disagree. `product` is
    // product_name rather than a second field asking the same question.
    batch: {
      platform: brief.platform.trim().toLowerCase(),
      placement: brief.placement.trim().toLowerCase(),
      objective: brief.objective.trim().toLowerCase(),
      product: message.product_name,
      audience: brief.audience.trim().toLowerCase(),
    },
    ads: ads.map((a, i) => ({
      filename: `${adIdFor(i)}.mp4`,
      id: adIdFor(i),
      title: a.title.trim() || `Cut ${i + 1}`,
    })),
  };
}

/** "kova, kovafit" → ["kova","kovafit"]. Lowercased, deduped, blanks dropped. */
export function normaliseAliases(input: string[] | string): string[] {
  const raw = Array.isArray(input) ? input : String(input).split(",");
  return [...new Set(raw.map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

// ── the share token ─────────────────────────────────────────────────────────────
//
// 16 random bytes as 32 lowercase hex chars — the shape
// `encode(gen_random_bytes(16),'hex')` mints in migration 0003. Validated before it
// reaches a query so a malformed path is a 404 from the edge of the app rather than a
// database round-trip, and so the column can never be probed with a wildcard.
const SHARE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function isShareToken(token: string): boolean {
  return SHARE_TOKEN_PATTERN.test(token);
}

/** results/<batch_id>/<ad_id>.<ext> — written by the runner with service_role, served
 *  to the customer as a short-lived signed URL. Under the SAME private `uploads` bucket:
 *  see the storage note at the bottom of migration 0003 for why not a second bucket. */
export function resultStoragePath(batchId: string, adId: string, ext: string): string {
  return `results/${batchId}/${adId}.${ext.replace(/^\./, "")}`;
}
