// PredictedVsRealized — the honest Serve v0 comparison.
//
// The three labels that cannot disappear are assignment, review_status and scorer-version
// staleness. Without assignment the table implies Soma chose every winner; without review
// status a rejected ad looks like a loser; without the version line a frozen launch-time
// score can be mistaken for today's report.

import type { Outcome, ServedAd } from "@/lib/serve";

function predictionScore(prediction: Record<string, unknown>): number | null {
  const direct = prediction.score ?? prediction.soma ?? prediction.preflight;
  if (typeof direct === "number") return direct;
  const scores = prediction.scores;
  if (scores && typeof scores === "object") {
    const bag = scores as Record<string, unknown>;
    const nested = bag.preflight ?? bag.soma ?? bag.score;
    if (typeof nested === "number") return nested;
  }
  return null;
}

function fmtInt(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function fmtMoney(micros: number | null, currency: string | null): string {
  if (micros == null || !Number.isFinite(micros)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(micros / 1_000_000);
}

function pct(numerator: number | null, denominator: number | null): string {
  if (numerator == null || denominator == null || denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function summarize(outcomes: Outcome[]) {
  return outcomes.reduce(
    (acc, row) => ({
      impressions: acc.impressions + (row.impressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
      spendMicros: acc.spendMicros + (row.spendMicros ?? 0),
      conversions: acc.conversions + (row.conversions ?? 0),
      currency: acc.currency ?? row.currency,
      windows: acc.windows + 1,
    }),
    {
      impressions: 0,
      clicks: 0,
      spendMicros: 0,
      conversions: 0,
      currency: null as string | null,
      windows: 0,
    },
  );
}

function versionLine(ad: ServedAd): string {
  const current = ad.currentScorerVersion ?? "unknown";
  return `This prediction is from scorer_version ${ad.scorerVersion}. The current report for this creative is ${current}.`;
}

export default function PredictedVsRealized({
  ads,
  outcomesByServedAd,
}: {
  ads: ServedAd[];
  outcomesByServedAd: Record<string, Outcome[]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {ads.map((ad) => {
        const outcomes = outcomesByServedAd[ad.id] ?? [];
        const realized = summarize(outcomes);
        const score = predictionScore(ad.prediction);
        const hasOutcomes = realized.windows > 0;
        return (
          <article key={ad.id} className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
                  {ad.platform} · {ad.externalAdId ?? "unserved candidate"}
                </div>
                <h2 className="mt-1 truncate text-section text-ink">
                  {ad.adId ?? ad.editCutId ?? ad.id}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.1em]">
                <span className="rounded-full border border-line bg-fill px-2.5 py-1 text-ink-2">
                  assignment: {ad.assignment}
                </span>
                <span className="rounded-full border border-line bg-fill px-2.5 py-1 text-ink-2">
                  review_status: {ad.reviewStatus ?? "unknown"}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-fill p-4">
                <div className="text-[11px] uppercase tracking-[0.1em] text-ink-3">
                  Predicted
                </div>
                <div className="mt-2 tabular-nums text-[34px] leading-none text-ink">
                  {score == null ? "—" : Math.round(score)}
                </div>
                <p className="mt-3 text-meta text-ink-3">
                  selection_rule {ad.selectionRule}, p={Number.isFinite(ad.selectionP) ? ad.selectionP : "?"}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-fill p-4">
                <div className="text-[11px] uppercase tracking-[0.1em] text-ink-3">
                  Realized
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-meta">
                  <div>
                    <dt className="text-ink-3">Impressions</dt>
                    <dd className="tabular-nums text-ink">
                      {fmtInt(hasOutcomes ? realized.impressions : null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Clicks</dt>
                    <dd className="tabular-nums text-ink">
                      {fmtInt(hasOutcomes ? realized.clicks : null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">CTR</dt>
                    <dd className="tabular-nums text-ink">
                      {pct(hasOutcomes ? realized.clicks : null, hasOutcomes ? realized.impressions : null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Spend</dt>
                    <dd className="tabular-nums text-ink">
                      {fmtMoney(hasOutcomes ? realized.spendMicros : null, realized.currency)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-meta text-ink-3">
                  {realized.windows ? `${realized.windows} current window(s)` : "No outcome rows yet."}
                </p>
              </div>
            </div>

            <p className="mt-4 text-meta text-ink-3">{versionLine(ad)}</p>
          </article>
        );
      })}
    </div>
  );
}
