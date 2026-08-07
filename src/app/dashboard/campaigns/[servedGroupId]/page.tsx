// /dashboard/campaigns/<servedGroupId> — one served variant group.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PredictedVsRealized from "@/components/dashboard/PredictedVsRealized";
import { getVariantGroup } from "@/lib/serve";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardCampaignPage({
  params,
}: {
  params: Promise<{ servedGroupId: string }>;
}) {
  const { servedGroupId } = await params;
  const group = await getVariantGroup(servedGroupId);
  if (!group) notFound();

  return (
    <div className="mx-auto max-w-[960px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
            {group.brand.name}
          </div>
          <h1 className="mt-1 text-balance text-hero text-ink">
            Predicted vs <span className="font-serif font-normal italic">realized</span>.
          </h1>
        </div>
        <div className="rounded-full border border-line bg-fill px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-ink-3">
          {group.ads.length} {group.ads.length === 1 ? "variant" : "variants"}
        </div>
      </div>

      <p className="mt-4 max-w-[64ch] text-pretty text-body text-ink-2">
        Variant group <span className="tabular-nums">{group.id}</span>. Predictions are the
        frozen launch-time rows from served_ads; realized metrics are the latest current
        outcome rows for each reporting window.
      </p>

      <p className="mt-3">
        <Link
          href="/dashboard/campaigns"
          className="text-meta text-ink-3 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
        >
          ← All campaigns
        </Link>
      </p>

      <section className="mt-10">
        <PredictedVsRealized ads={group.ads} outcomesByServedAd={group.outcomesByServedAd} />
      </section>
    </div>
  );
}
