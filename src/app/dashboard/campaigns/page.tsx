// /dashboard/campaigns — served variant groups across brands, with spend to date.
//
// Stage 4.5's list surface. Detail lives at /dashboard/campaigns/<variant_group>; this
// page is the index brands and the serve status page both need so a partner can find a
// campaign without knowing its group id. Read-only through session loaders — same RLS
// boundary as /dashboard/brands. Money is micros / 1e6 with the currency from outcomes
// when present; no symbol is invented when currency is null.

import Link from "next/link";

import { listCampaignGroupsForUser, type CampaignGroupSummary } from "@/lib/serve";

function money(micros: number, currency: string | null): string {
  if (!Number.isFinite(micros) || micros === 0) return currency ? `0.00 ${currency}` : "0.00";
  const major = (micros / 1e6).toFixed(2);
  return currency ? `${major} ${currency}` : major;
}

function ctr(impressions: number, clicks: number): string {
  if (!impressions) return "—";
  return `${((clicks / impressions) * 100).toFixed(2)}%`;
}

function GroupRow({ group }: { group: CampaignGroupSummary }) {
  return (
    <Link
      href={`/dashboard/campaigns/${encodeURIComponent(group.id)}`}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-paper px-5 py-4 transition-colors hover:border-line-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
          {group.brand.name} · {group.platform}
        </div>
        <div className="mt-1 truncate text-ui text-ink">{group.id}</div>
        <div className="mt-1 text-meta text-ink-3">
          {group.ads.length} {group.ads.length === 1 ? "variant" : "variants"}
          {group.outcomeWindows
            ? ` · ${group.outcomeWindows} outcome window${group.outcomeWindows === 1 ? "" : "s"}`
            : " · no outcomes yet"}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-meta sm:text-right">
        <div>
          <dt className="text-ink-3">Impressions</dt>
          <dd className="tabular-nums text-ink">
            {group.impressions ? group.impressions.toLocaleString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">CTR</dt>
          <dd className="tabular-nums text-ink">{ctr(group.impressions, group.clicks)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Spend</dt>
          <dd className="tabular-nums text-ink">
            {group.outcomeWindows ? money(group.spendMicros, group.currency) : "—"}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

export default async function DashboardCampaignsPage() {
  const groups = await listCampaignGroupsForUser();

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-balance text-hero text-ink">
          Served <span className="font-serif font-normal italic">campaigns</span>.
        </h1>
        {/* The one door into /dashboard/campaigns/new from the nav's own section — until
            this button existed, the brief form was only reachable through Serve. */}
        <Link
          href="/dashboard/campaigns/new"
          className="inline-block shrink-0 rounded-xl bg-ink px-3.5 py-2 text-meta font-medium text-white transition-colors hover:bg-ink/85"
        >
          New campaign
        </Link>
      </div>
      <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
        Every variant group linked to a brand you belong to, with spend rolled up from the
        latest outcome windows. Predictions stay frozen at launch; open a row for the
        predicted-vs-realized detail.
      </p>

      {groups.length > 0 ? (
        <section className="mt-11">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
              Variant groups
            </h2>
            <span className="text-meta text-ink-3">
              {groups.length} {groups.length === 1 ? "group" : "groups"}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {groups.map((group) => (
              <GroupRow key={group.id} group={group} />
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-11 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">No served campaigns yet.</h2>
          <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
            A campaign appears here after a served_ads row is linked to one of your brands
            — usually from a CSV outcome ingest or a dry-run launch against a test account.
            Analysis-only runs still live under Videos.
          </p>
          {/* Secondary on purpose: "New campaign" beside the heading is this screen's
              one solid ink button. */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard/brands"
              className="inline-block rounded-xl border border-line-2 bg-paper px-5 py-[13px] text-ui font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
            >
              Brands
            </Link>
            <Link
              href="/dashboard/serve"
              className="inline-block rounded-xl border border-line-2 bg-paper px-5 py-[13px] text-ui font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
            >
              Serve status
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
