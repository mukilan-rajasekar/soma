import "server-only";

import type { PreflightAd, PreflightReport } from "@/components/preflight/types";
import { isShareToken } from "@/lib/batch";
import { serviceClient } from "@/lib/supabase/server";

export type EditBatchOption = {
  id: string;
  title: string;
  score: number;
};

export type BatchEditPreset = {
  token: string;
  batchName: string;
  options: EditBatchOption[];
  defaultAdId: string;
};

export type BatchEditSource = {
  batchId: string;
  batchName: string;
  token: string;
  message: PreflightReport["batch"]["message"] | null;
  ad: PreflightAd;
  storagePath: string;
};

type BatchRow = {
  id: string;
  batch_name: string | null;
  status: "queued" | "processing" | "done" | "failed";
  report: PreflightReport | null;
};

type UploadRow = {
  ad_id: string;
  storage_path: string;
};

function orderedAds(report: PreflightReport): PreflightAd[] {
  return report.order
    .map((id) => report.ads.find((ad) => ad.id === id))
    .filter(Boolean) as PreflightAd[];
}

async function loadBatch(token: string): Promise<BatchRow | null> {
  if (!isShareToken(token)) return null;
  const supabase = serviceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("batches")
    .select("id, batch_name, status, report")
    .eq("share_token", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as BatchRow;
}

export async function loadBatchEditPreset(token: string): Promise<BatchEditPreset | null> {
  const batch = await loadBatch(token);
  if (!batch || batch.status !== "done" || !batch.report) return null;

  const options = orderedAds(batch.report).map((ad) => ({
    id: ad.id,
    title: ad.title,
    score: ad.scores.preflight,
  }));
  if (!options.length) return null;

  return {
    token,
    batchName: batch.batch_name ?? batch.report.batch?.name ?? "Your batch",
    options,
    defaultAdId: options[0].id,
  };
}

export async function loadBatchEditSource(
  token: string,
  adId: string,
): Promise<BatchEditSource | null> {
  const batch = await loadBatch(token);
  if (!batch || batch.status !== "done" || !batch.report) return null;

  const ad = batch.report.ads.find((row) => row.id === adId);
  if (!ad) return null;

  const supabase = serviceClient();
  if (!supabase) return null;

  const { data: upload, error } = await supabase
    .from("uploads")
    .select("ad_id, storage_path")
    .eq("batch_id", batch.id)
    .eq("ad_id", adId)
    .maybeSingle();

  if (error || !upload) return null;

  return {
    batchId: batch.id,
    batchName: batch.batch_name ?? batch.report.batch?.name ?? "Your batch",
    token,
    message: batch.report.batch?.message ?? null,
    ad,
    storagePath: (upload as UploadRow).storage_path,
  };
}
