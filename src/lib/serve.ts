// serve.ts — session-scoped loaders for the Serve dashboard.
//
// These read through sessionClient(), never service_role. The tables hold external ad
// account ids, spend and outcome rows, so RLS through brand_members is the authorization
// boundary. A missing row, a row in someone else's brand, and an unconfigured Supabase env
// all collapse to empty/null at the loader boundary.

import "server-only";

import { sessionClient } from "@/lib/supabase/session";

export type Brand = {
  id: string;
  name: string;
  trainingConsent: boolean;
  trainingConsentSource: string | null;
  trainingConsentAt: string | null;
  createdAt: string;
};

export type ServedAd = {
  id: string;
  brandId: string;
  batchId: string | null;
  adId: string | null;
  editCutId: string | null;
  platform: string;
  externalAdAccountId: string;
  externalCampaignId: string | null;
  externalAdsetId: string | null;
  externalAdId: string | null;
  variantGroup: string | null;
  generation: number;
  prediction: Record<string, unknown>;
  scorerVersion: string;
  encoder: string;
  encoderRev: string | null;
  atlas: string | null;
  assignment: "model" | "random" | "client" | string;
  selectionRule: string;
  selectionRuleParams: Record<string, unknown>;
  selectionP: number;
  reviewStatus: "pending" | "approved" | "rejected" | "limited" | null | string;
  reviewFeedback: Record<string, unknown> | null;
  launchedAt: string | null;
  pausedAt: string | null;
  createdAt: string;
  currentScorerVersion: string | null;
};

export type Outcome = {
  id: string;
  servedAdId: string;
  windowStart: string;
  windowEnd: string;
  attribution: string | null;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
  spendMicros: number | null;
  currency: string | null;
  clicks: number | null;
  videoP25: number | null;
  videoP50: number | null;
  videoP75: number | null;
  videoP100: number | null;
  thruplays: number | null;
  conversions: number | null;
  conversionValueMicros: number | null;
  source: string;
  pulledAt: string;
  revision: number;
  raw: Record<string, unknown> | null;
};

export type ServedVariantGroup = {
  id: string;
  brand: Brand;
  ads: ServedAd[];
  outcomesByServedAd: Record<string, Outcome[]>;
};

const BRAND_COLUMNS =
  "id, name, training_consent, training_consent_source, training_consent_at, created_at";

const SERVED_AD_COLUMNS =
  "id, brand_id, batch_id, ad_id, edit_cut_id, platform, external_ad_account_id, external_campaign_id, external_adset_id, external_ad_id, variant_group, generation, prediction, scorer_version, encoder, encoder_rev, atlas, assignment, selection_rule, selection_rule_params, selection_p, review_status, review_feedback, launched_at, paused_at, created_at";

const OUTCOME_COLUMNS =
  "id, served_ad_id, window_start, window_end, attribution, impressions, reach, frequency, spend_micros, currency, clicks, video_p25, video_p50, video_p75, video_p100, thruplays, conversions, conversion_value_micros, source, pulled_at, revision, raw";

type BrandRow = {
  id: string;
  name: string;
  training_consent: boolean;
  training_consent_source: string | null;
  training_consent_at: string | null;
  created_at: string;
};

type ServedAdRow = {
  id: string;
  brand_id: string;
  batch_id: string | null;
  ad_id: string | null;
  edit_cut_id: string | null;
  platform: string;
  external_ad_account_id: string;
  external_campaign_id: string | null;
  external_adset_id: string | null;
  external_ad_id: string | null;
  variant_group: string | null;
  generation: number;
  prediction: Record<string, unknown> | null;
  scorer_version: string;
  encoder: string;
  encoder_rev: string | null;
  atlas: string | null;
  assignment: string;
  selection_rule: string;
  selection_rule_params: Record<string, unknown> | null;
  selection_p: number | string;
  review_status: string | null;
  review_feedback: Record<string, unknown> | null;
  launched_at: string | null;
  paused_at: string | null;
  created_at: string;
};

type OutcomeRow = {
  id: string;
  served_ad_id: string;
  window_start: string;
  window_end: string;
  attribution: string | null;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
  spend_micros: number | null;
  currency: string | null;
  clicks: number | null;
  video_p25: number | null;
  video_p50: number | null;
  video_p75: number | null;
  video_p100: number | null;
  thruplays: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  source: string;
  pulled_at: string;
  revision: number;
  raw: Record<string, unknown> | null;
};

type BatchReportRow = {
  id: string;
  report: {
    scorer_version?: unknown;
    scorerVersion?: unknown;
    scoring?: {
      scorer_version?: unknown;
      scorerVersion?: unknown;
      version?: unknown;
    };
  } | null;
};

function brandFrom(row: BrandRow): Brand {
  return {
    id: row.id,
    name: row.name,
    trainingConsent: row.training_consent,
    trainingConsentSource: row.training_consent_source,
    trainingConsentAt: row.training_consent_at,
    createdAt: row.created_at,
  };
}

function outcomeFrom(row: OutcomeRow): Outcome {
  return {
    id: row.id,
    servedAdId: row.served_ad_id,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    attribution: row.attribution,
    impressions: row.impressions,
    reach: row.reach,
    frequency: row.frequency,
    spendMicros: row.spend_micros,
    currency: row.currency,
    clicks: row.clicks,
    videoP25: row.video_p25,
    videoP50: row.video_p50,
    videoP75: row.video_p75,
    videoP100: row.video_p100,
    thruplays: row.thruplays,
    conversions: row.conversions,
    conversionValueMicros: row.conversion_value_micros,
    source: row.source,
    pulledAt: row.pulled_at,
    revision: row.revision,
    raw: row.raw,
  };
}

function currentVersionFromReport(report: BatchReportRow["report"]): string | null {
  const candidates = [
    report?.scorer_version,
    report?.scorerVersion,
    report?.scoring?.scorer_version,
    report?.scoring?.scorerVersion,
    report?.scoring?.version,
  ];
  const version = candidates.find((v): v is string => typeof v === "string" && v.trim() !== "");
  return version?.trim() ?? null;
}

function currentVersionFromPrediction(prediction: Record<string, unknown>): string | null {
  const candidates = [
    prediction.current_scorer_version,
    prediction.currentScorerVersion,
    prediction.report_scorer_version,
  ];
  const version = candidates.find((v): v is string => typeof v === "string" && v.trim() !== "");
  return version?.trim() ?? null;
}

function servedAdFrom(row: ServedAdRow, reportVersions: Map<string, string | null>): ServedAd {
  const prediction = row.prediction ?? {};
  return {
    id: row.id,
    brandId: row.brand_id,
    batchId: row.batch_id,
    adId: row.ad_id,
    editCutId: row.edit_cut_id,
    platform: row.platform,
    externalAdAccountId: row.external_ad_account_id,
    externalCampaignId: row.external_campaign_id,
    externalAdsetId: row.external_adset_id,
    externalAdId: row.external_ad_id,
    variantGroup: row.variant_group,
    generation: row.generation,
    prediction,
    scorerVersion: row.scorer_version,
    encoder: row.encoder,
    encoderRev: row.encoder_rev,
    atlas: row.atlas,
    assignment: row.assignment,
    selectionRule: row.selection_rule,
    selectionRuleParams: row.selection_rule_params ?? {},
    selectionP: typeof row.selection_p === "number" ? row.selection_p : Number(row.selection_p),
    reviewStatus: row.review_status,
    reviewFeedback: row.review_feedback,
    launchedAt: row.launched_at,
    pausedAt: row.paused_at,
    createdAt: row.created_at,
    currentScorerVersion:
      currentVersionFromPrediction(prediction) ??
      (row.batch_id ? reportVersions.get(row.batch_id) ?? null : null),
  };
}

async function reportVersionsFor(batchIds: string[]): Promise<Map<string, string | null>> {
  const versions = new Map<string, string | null>();
  const ids = [...new Set(batchIds.filter(Boolean))];
  if (ids.length === 0) return versions;

  const supabase = await sessionClient();
  if (!supabase) return versions;

  const { data, error } = await supabase.from("batches").select("id, report").in("id", ids);
  if (error || !data) return versions;

  for (const row of data as BatchReportRow[]) {
    versions.set(row.id, currentVersionFromReport(row.report));
  }
  return versions;
}

export async function listBrandsForUser(): Promise<Brand[]> {
  const supabase = await sessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("brands")
    .select(BRAND_COLUMNS)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as BrandRow[]).map(brandFrom);
}

export async function getBrand(brandId: string): Promise<Brand | null> {
  const supabase = await sessionClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("brands")
    .select(BRAND_COLUMNS)
    .eq("id", brandId)
    .maybeSingle();

  if (error || !data) return null;
  return brandFrom(data as BrandRow);
}

export async function listServedAdsForBrand(brandId: string): Promise<ServedAd[]> {
  const supabase = await sessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("served_ads")
    .select(SERVED_AD_COLUMNS)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  const rows = data as ServedAdRow[];
  const versions = await reportVersionsFor(rows.map((r) => r.batch_id).filter((id): id is string => !!id));
  return rows.map((row) => servedAdFrom(row, versions));
}

export async function getOutcomesForServedAd(servedAdId: string): Promise<Outcome[]> {
  const supabase = await sessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("outcomes_current")
    .select(OUTCOME_COLUMNS)
    .eq("served_ad_id", servedAdId)
    .order("window_start", { ascending: false })
    .order("pulled_at", { ascending: false });

  if (error || !data) return [];
  return (data as OutcomeRow[]).map(outcomeFrom);
}

export async function getVariantGroup(servedGroupId: string): Promise<ServedVariantGroup | null> {
  const supabase = await sessionClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("served_ads")
    .select(SERVED_AD_COLUMNS)
    .eq("variant_group", servedGroupId)
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) return null;
  const rows = data as ServedAdRow[];

  const brand = await getBrand(rows[0].brand_id);
  if (!brand) return null;

  const versions = await reportVersionsFor(rows.map((r) => r.batch_id).filter((id): id is string => !!id));
  const ads = rows.map((row) => servedAdFrom(row, versions));
  const pairs = await Promise.all(ads.map(async (ad) => [ad.id, await getOutcomesForServedAd(ad.id)] as const));

  return {
    id: servedGroupId,
    brand,
    ads,
    outcomesByServedAd: Object.fromEntries(pairs),
  };
}
