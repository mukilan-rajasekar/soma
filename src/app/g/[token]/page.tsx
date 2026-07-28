import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RunStatus from "@/components/result/RunStatus";
import SiteHeader from "@/components/site/SiteHeader";
import { isShareToken } from "@/lib/batch";
import { serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Candidate = {
  id: string;
  label: string;
  direction: string;
  why: string;
  prompt: string;
  rank?: number;
  scores?: { preflight?: number };
};

type GenerationResult = {
  provider?: string;
  scored?: boolean;
  candidates?: Candidate[];
};

type RunRow = {
  share_token: string;
  provider: string;
  brief: { brand_name?: string; product_name?: string } | null;
  status: "queued" | "processing" | "done" | "failed";
  result: GenerationResult | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

async function loadRun(token: string): Promise<RunRow | null> {
  if (!isShareToken(token)) return null;
  const supabase = serviceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("generation_runs")
    .select("share_token, provider, brief, status, result, error, created_at, completed_at")
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
  const name = run?.brief?.brand_name ?? "generation beta";
  return {
    title: `soma · ${name} generation`,
    description: "A Soma generation beta run.",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function GenerationRunPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const run = await loadRun(token);
  if (!run) notFound();

  const name = [run.brief?.brand_name, run.brief?.product_name].filter(Boolean).join(" · ") || "Generation beta";
  const result = run.result;

  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <SiteHeader />
      <div className="mx-auto max-w-[980px] px-[clamp(18px,5vw,40px)] pb-32 pt-[clamp(28px,6vh,64px)]">
        <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
          Generation beta
          {run.completed_at
            ? ` · ${new Date(run.completed_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
            : ""}
        </div>
        <h1 className="mt-3 max-w-[20ch] text-balance text-hero text-ink">{name}</h1>

        {run.status === "done" && result ? (
          <>
            <p className="mt-5 max-w-[60ch] text-pretty text-body text-ink-2">
              Provider: {result.provider ?? run.provider}.{" "}
              {result.scored
                ? "These candidates were scored through the same path as uploaded ads."
                : "These candidates were generated, but the scorer did not complete on this machine, so they are not yet ranked authoritatively."}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4">
              {(result.candidates ?? []).map((candidate, i) => (
                <article key={candidate.id} className="rounded-2xl border border-line bg-fill p-[18px]">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <div className="text-ui font-medium text-ink">
                      {candidate.rank ? `#${candidate.rank} · ` : `${String(i + 1).padStart(2, "0")} · `}
                      {candidate.label}
                    </div>
                    {typeof candidate.scores?.preflight === "number" ? (
                      <div className="ml-auto text-[14px] font-medium tabular-nums text-ink">
                        {Math.round(candidate.scores.preflight)}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 text-[12px] uppercase tracking-[0.07em] text-ink-3">
                    {candidate.direction}
                  </div>
                  <p className="mt-3 text-[14px] leading-[1.55] text-ink-2">{candidate.why}</p>
                  <p className="mt-3 rounded-xl border border-line bg-paper px-4 py-3 text-[13px] leading-[1.6] text-ink-2">
                    {candidate.prompt}
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : run.status === "failed" ? (
          <>
            <p className="mt-5 max-w-[60ch] text-pretty text-body text-ink-2">
              This generation run did not finish.
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
          <>
            <p className="mt-5 max-w-[60ch] text-pretty text-body text-ink-2">
              This run is still processing.
            </p>
            <RunStatus
              endpoint={`/api/generate/${token}/status`}
              initialStatus={run.status}
              startedAtMs={new Date(run.created_at).getTime()}
              queuedLabel="Queued"
              processingLabel="Generating"
            />
          </>
        )}
      </div>
    </main>
  );
}
