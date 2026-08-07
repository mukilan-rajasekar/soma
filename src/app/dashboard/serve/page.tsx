// /dashboard/serve — what the serve pipeline is doing, brand by brand.
//
// Three read-only feeds per brand: the platform job queue (did the box pick the work up),
// the spend-guard audit trail (did the guard have to act), and the experiments with their
// budget arms (what is being tested against what). Everything reads through the
// session-scoped loaders in src/lib/serve.ts, so brand_members — not application code —
// decides which rows exist for this user; migrations 0014/0015 give browsers SELECT and
// nothing else, which is why this page has no buttons.
//
// Money renders as major units at two decimals (micros / 1e6) with no currency symbol:
// guard_events does not carry a currency — that lives on spend_guards — and stamping "$"
// on a EUR brand's cap would be a small lie in the one place this page must not tell any.

import Link from "next/link";

import {
  listBrandsForUser,
  listExperimentsForBrand,
  listGuardEventsForBrand,
  listServeJobsForBrand,
  type GuardEvent,
  type ServeExperiment,
  type ServeJob,
} from "@/lib/serve";

type BrandServeStatus = {
  id: string;
  name: string;
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

export default async function DashboardServePage() {
  const brands = await listBrandsForUser();
  const cards: BrandServeStatus[] = await Promise.all(
    brands.map(async (brand) => {
      const [jobs, guardEvents, experiments] = await Promise.all([
        listServeJobsForBrand(brand.id),
        listGuardEventsForBrand(brand.id),
        listExperimentsForBrand(brand.id),
      ]);
      return { id: brand.id, name: brand.name, jobs, guardEvents, experiments };
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
            Serve status appears once you belong to a brand — a service-role process
            creates the brand and adds your user to brand_members. Until then, your work
            lives under Videos.
          </p>
          <Link
            href="/dashboard/brands"
            className="mt-6 inline-block rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
          >
            See brands
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
