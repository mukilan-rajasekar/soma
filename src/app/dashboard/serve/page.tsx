// /dashboard/serve — what the serve pipeline is doing, brand by brand.
//
// Four read-only feeds per brand: the priced campaigns (quotes and the subscriptions
// they turned into), the platform job queue (did the box pick the work up), the
// spend-guard audit trail (did the guard have to act), and the experiments with their
// budget arms (what is being tested against what). Everything reads through the
// session-scoped loaders in src/lib/serve.ts, so brand_members — not application code —
// decides which rows exist for this user; migrations 0014/0015/0016 give browsers SELECT
// and nothing else, which is why the only button here is a link to the brief form.
//
// Money renders as major units at two decimals (micros / 1e6) with no currency symbol:
// guard_events does not carry a currency — that lives on spend_guards — and stamping "$"
// on a EUR brand's cap would be a small lie in the one place this page must not tell any.
// Campaign rows are the exception, and deliberately: migration 0016 stamps a currency on
// every quote and subscription, so their prices can say "$" when it is dollars.

import Link from "next/link";

import AcceptQuoteButton from "@/components/dashboard/AcceptQuoteButton";
import {
  listBrandsForUser,
  listCampaignQuotesForBrand,
  listCampaignSubscriptionsForBrand,
  listExperimentsForBrand,
  listGuardEventsForBrand,
  listServeJobsForBrand,
  type CampaignQuote,
  type CampaignSubscription,
  type GuardEvent,
  type ServeExperiment,
  type ServeJob,
} from "@/lib/serve";

type BrandServeStatus = {
  id: string;
  name: string;
  quotes: CampaignQuote[];
  subscriptions: CampaignSubscription[];
  jobs: ServeJob[];
  guardEvents: GuardEvent[];
  experiments: ServeExperiment[];
};

function money(micros: number | null): string {
  if (micros === null || !Number.isFinite(micros)) return "—";
  return (micros / 1e6).toFixed(2);
}

/** Guard events and jobs can repeat within a day, so the date alone would render
 *  indistinguishable rows; the time is what makes the audit trail readable. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${Math.round(fraction * 100)}%`;
}

/** Campaign money carries its currency (migration 0016), so unlike the guard rows it may
 *  say "$" — but only when it is actually dollars. Anything else keeps the code. */
function price(micros: number, currency: string): string {
  const major = (micros / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "USD" ? `$${major}` : `${major} ${currency}`;
}

/** current_period_end and valid_until are dates, not timestamps; parse the parts rather
 *  than let Date treat "2026-08-07" as UTC midnight and render yesterday west of it. */
function day(dateOnly: string): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  if (!y || !m || !d) return dateOnly;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The goal is stored as the pricing enum; render it as the words the form used. */
function goalLabel(goal: string): string {
  if (goal === "aggressive_conversions") return "aggressive conversions";
  if (goal === "low_cost_testing") return "low-cost testing";
  return goal.replace(/_/g, " ");
}

export default async function DashboardServePage() {
  const brands = await listBrandsForUser();
  const cards: BrandServeStatus[] = await Promise.all(
    brands.map(async (brand) => {
      const [quotes, subscriptions, jobs, guardEvents, experiments] = await Promise.all([
        listCampaignQuotesForBrand(brand.id),
        listCampaignSubscriptionsForBrand(brand.id),
        listServeJobsForBrand(brand.id),
        listGuardEventsForBrand(brand.id),
        listExperimentsForBrand(brand.id),
      ]);
      return { id: brand.id, name: brand.name, quotes, subscriptions, jobs, guardEvents, experiments };
    }),
  );

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <h1 className="text-balance text-hero text-ink">
        What serve is <span className="font-serif font-normal italic">doing</span>.
      </h1>
      <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
        The job queue, the spend guard and the experiments, per brand. This page is a
        read-only account of what the serve box has done or refused to do — nothing here
        can spend money.
      </p>

      {cards.length === 0 ? (
        <div className="mt-11 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">Nothing is serving yet.</h2>
          <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
            Serve status appears once you belong to a brand. Create one under Brands and
            this page fills in as campaigns start moving. Until then, your work lives
            under Videos.
          </p>
          <Link
            href="/dashboard/brands"
            className="mt-6 inline-block rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
          >
            Create a brand
          </Link>
        </div>
      ) : (
        cards.map((brand) => (
          <section key={brand.id} className="mt-12 border-t border-line pt-8">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
              {brand.name}
            </h2>

            <div className="mt-5 flex flex-col gap-4">
              <article className="rounded-2xl border border-line bg-fill p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-ui font-medium text-ink">Campaigns</h3>
                  <Link
                    href="/dashboard/campaigns/new"
                    className="inline-block rounded-xl bg-ink px-3.5 py-2 text-meta font-medium text-white transition-colors hover:bg-ink/85"
                  >
                    New campaign
                  </Link>
                </div>

                {brand.quotes.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-3">
                    {brand.quotes.map((q) => (
                      <li
                        key={q.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                      >
                        <span className="text-ui text-ink">
                          <span className="tabular-nums">
                            {price(q.weeklyPriceMicros, q.currency)}
                          </span>
                          <span className="text-ink-3"> / week</span>
                        </span>
                        <span className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-meta text-ink-3">
                          <span>{q.platforms.join(" + ") || "—"}</span>
                          <span>{goalLabel(q.goal)}</span>
                          <span>{when(q.createdAt)}</span>
                          <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em]">
                            {q.status}
                          </span>
                          {q.status === "quoted" ? (
                            <AcceptQuoteButton quoteId={q.id} compact />
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 max-w-[56ch] text-pretty text-body text-ink-2">
                    No campaign has been priced for this brand yet. A short brief at{" "}
                    <Link
                      href="/dashboard/campaigns/new"
                      className="text-ink underline decoration-line-2 underline-offset-2 transition-colors hover:decoration-ink"
                    >
                      New campaign
                    </Link>{" "}
                    turns a weekly media budget into one all-inclusive weekly price.
                  </p>
                )}

                {brand.subscriptions.length > 0 ? (
                  <div className="mt-5 border-t border-line pt-4">
                    <h4 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
                      Subscriptions
                    </h4>
                    <ul className="mt-3 flex flex-col gap-2">
                      {brand.subscriptions.map((sub) => (
                        <li
                          key={sub.id}
                          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-meta"
                        >
                          <span className="text-ink">
                            <span className="uppercase tracking-[0.08em]">{sub.status}</span>
                            {" — "}
                            <span className="tabular-nums">
                              {price(sub.weeklyPriceMicros, sub.currency)}
                            </span>{" "}
                            / week
                          </span>
                          <span className="shrink-0 text-ink-3">
                            period ends {day(sub.currentPeriodEnd)} ·{" "}
                            <span className="tabular-nums">{sub.renewals}</span>{" "}
                            {sub.renewals === 1 ? "renewal" : "renewals"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>

              <article className="rounded-2xl border border-line bg-fill p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-ui font-medium text-ink">Platform jobs</h3>
                  <span className="text-meta text-ink-3">
                    {brand.jobs.length} {brand.jobs.length === 1 ? "job" : "jobs"}
                  </span>
                </div>

                {brand.jobs.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-3">
                    {brand.jobs.map((job) => (
                      <li key={job.id} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-ui text-ink">{job.kind}</span>
                          <span className="shrink-0 text-meta text-ink-3">
                            <span className="uppercase tracking-[0.08em]">{job.status}</span>
                            {" · "}
                            {when(job.createdAt)}
                          </span>
                        </div>
                        {job.error ? (
                          <p className="max-w-[62ch] text-pretty text-meta text-error">
                            {job.error}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 max-w-[56ch] text-pretty text-body text-ink-2">
                    No platform work has been queued for this brand. A job appears the
                    moment server code asks the serve box to create, activate, pause or
                    poll an ad.
                  </p>
                )}
              </article>

              <article className="rounded-2xl border border-line bg-fill p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-ui font-medium text-ink">Spend guard</h3>
                  <span className="text-meta text-ink-3">
                    {brand.guardEvents.length}{" "}
                    {brand.guardEvents.length === 1 ? "event" : "events"}
                  </span>
                </div>

                {brand.guardEvents.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-3">
                    {brand.guardEvents.map((event) => (
                      <li
                        key={event.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-meta"
                      >
                        <span className="text-ink">
                          <span className="uppercase tracking-[0.08em]">{event.action}</span>
                          {" — "}
                          <span className="tabular-nums">
                            {money(event.observedSpendMicros)}
                          </span>{" "}
                          observed against a{" "}
                          <span className="tabular-nums">{money(event.capMicros)}</span> cap
                        </span>
                        <span className="shrink-0 text-ink-3">{when(event.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 max-w-[56ch] text-pretty text-body text-ink-2">
                    The spend guard has not had to act for this brand. That is the good
                    outcome — an event is written only when observed spend runs up against
                    a cap.
                  </p>
                )}
              </article>

              <article className="rounded-2xl border border-line bg-fill p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-ui font-medium text-ink">Experiments</h3>
                  <span className="text-meta text-ink-3">
                    {brand.experiments.length}{" "}
                    {brand.experiments.length === 1 ? "experiment" : "experiments"}
                  </span>
                </div>

                {brand.experiments.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-3">
                    {brand.experiments.map((experiment) => (
                      <li
                        key={experiment.id}
                        className="rounded-xl border border-line bg-paper px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className="text-ui text-ink">{experiment.name}</span>
                          <span className="text-meta text-ink-3">
                            {experiment.platform} ·{" "}
                            <span className="uppercase tracking-[0.08em]">
                              {experiment.status}
                            </span>{" "}
                            · <span className="tabular-nums">{pct(experiment.holdoutPct)}</span>{" "}
                            holdout
                          </span>
                        </div>

                        {experiment.arms.length > 0 ? (
                          <ul className="mt-2 flex flex-col gap-1">
                            {experiment.arms.map((arm) => (
                              <li
                                key={arm.id}
                                className="flex items-baseline justify-between gap-4 text-meta"
                              >
                                <span className="text-ink-2">
                                  {arm.armKey}
                                  {arm.isControl ? (
                                    <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-ink-3">
                                      control
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 tabular-nums text-ink-3">
                                  {pct(arm.budgetShare)} of budget
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-meta text-ink-3">
                            No arms recorded yet — a split that has not had ads assigned
                            to it.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 max-w-[56ch] text-pretty text-body text-ink-2">
                    No experiments for this brand yet. An A/B split shows up here the
                    moment it is planned as arms with budget shares, so a test never has
                    to live as a naming convention in campaign titles.
                  </p>
                )}
              </article>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
