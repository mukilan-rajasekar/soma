import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SiteHeader from "@/components/site/SiteHeader";
import { loadDemoReport } from "@/lib/demo-report";
import { isShareToken } from "@/lib/batch";
import { serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Candidate = {
  kind: string;
  label: string;
  est_score: number;
  est_delta: number;
  result_s: number;
  measured: boolean;
  confidence: string;
};

type EditResult = {
  adId?: string;
  baseScore?: number;
  verified?: boolean;
  candidates?: Candidate[];
};

type RunRow = {
  share_token: string;
  ad_id: string;
  status: "queued" | "processing" | "done" | "failed";
  result: EditResult | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

async function loadRun(token: string): Promise<RunRow | null> {
  if (!isShareToken(token)) return null;
  const supabase = serviceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("edit_runs")
    .select("share_token, ad_id, status, result, error, created_at, completed_at")
    .eq("share_token", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as RunRow;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const run = await loadRun(token);
  return {
    title: `soma · ${run?.ad_id ?? "edit beta"} edit`,
    description: "A Soma edit beta run.",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function EditRunPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const run = await loadRun(token);
  if (!run) notFound();

  const report = loadDemoReport();
  const adTitle =
    report.campaign.variants.find((variant) => variant.id === run.ad_id)?.title ?? run.ad_id;
  const result = run.result;

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <SiteHeader />
      <div className="mx-auto max-w-[980px] px-[clamp(18px,5vw,40px)] pb-32 pt-[clamp(28px,6vh,64px)]">
        <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
          Edit beta
          {run.completed_at
            ? ` · ${new Date(run.completed_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
            : ""}
        </div>
        <h1 className="mt-3 max-w-[20ch] text-balance text-hero text-ink">{adTitle}</h1>

        {run.status === "done" && result ? (
          <>
            <p className="mt-5 max-w-[60ch] text-pretty text-body text-ink-2">
              Base score:{" "}
              <span className="font-medium tabular-nums text-ink">
                {Math.round(result.baseScore ?? 0)}
              </span>
              .{" "}
              {result.verified
                ? "These edit candidates were verified."
                : "These edit candidates are still estimate-first; verification depends on the scorer box."}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4">
              {(result.candidates ?? []).slice(0, 6).map((candidate, i) => (
                <article key={`${candidate.kind}-${candidate.label}`} className="rounded-2xl border border-line bg-fill p-[18px]">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <div className="text-ui font-medium text-ink">
                      {String(i + 1).padStart(2, "0")} · {candidate.label}
                    </div>
                    <div className="ml-auto flex items-baseline gap-3 text-[14px] tabular-nums text-ink">
                      <span>{Math.round(candidate.est_score)}</span>
                      <span className={candidate.est_delta >= 0 ? "text-ink" : "text-neg"}>
                        {candidate.est_delta >= 0 ? "+" : ""}
                        {Math.round(candidate.est_delta)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[12px] uppercase tracking-[0.07em] text-ink-3">
                    <span>{candidate.kind}</span>
                    <span>·</span>
                    <span>{candidate.confidence}</span>
                    <span>·</span>
                    <span>{candidate.result_s.toFixed(1)}s result</span>
                    {candidate.measured ? (
                      <>
                        <span>·</span>
                        <span className="text-ink">verified</span>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : run.status === "failed" ? (
          <>
            <p className="mt-5 max-w-[60ch] text-pretty text-body text-ink-2">
              This edit run did not finish.
            </p>
            {run.error ? (
              <div className="mt-6 rounded-2xl border border-line bg-fill p-4">
                <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">What the run said</div>
                <p className="mt-2 font-mono text-[12.5px] leading-[1.65] text-ink-2">
                  {run.error}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-5 max-w-[60ch] text-pretty text-body text-ink-2">
            This run is still processing.
          </p>
        )}
      </div>
    </main>
  );
}
