// /dashboard/brands — Serve v0 account list.
//
// The dashboard layout already establishes the signed-in user. This page only reads through
// session-scoped loaders, so a user outside brand_members sees an empty list rather than a
// row filtered in application code.

import Link from "next/link";

import { listBrandsForUser, listServedAdsForBrand, type ServedAd } from "@/lib/serve";

type BrandCard = {
  id: string;
  name: string;
  trainingConsent: boolean;
  groups: { id: string; ads: ServedAd[] }[];
};

function groupServedAds(ads: ServedAd[]): BrandCard["groups"] {
  const order: string[] = [];
  const map = new Map<string, ServedAd[]>();
  for (const ad of ads) {
    const id = ad.variantGroup ?? ad.id;
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
    }
    map.get(id)!.push(ad);
  }
  return order.map((id) => ({ id, ads: map.get(id)! }));
}

export default async function DashboardBrandsPage() {
  const brands = await listBrandsForUser();
  const cards: BrandCard[] = await Promise.all(
    brands.map(async (brand) => ({
      id: brand.id,
      name: brand.name,
      trainingConsent: brand.trainingConsent,
      groups: groupServedAds(await listServedAdsForBrand(brand.id)),
    })),
  );

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <h1 className="text-balance text-hero text-ink">
        Your <span className="font-serif font-normal italic">brands</span>.
      </h1>
      <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
        Serve v0 links frozen predictions to platform outcomes. Brand membership decides what
        spend and outcome rows you can read.
      </p>

      {cards.length > 0 ? (
        <section className="mt-11">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
              Brands
            </h2>
            <span className="text-meta text-ink-3">
              {cards.length} {cards.length === 1 ? "brand" : "brands"}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-4">
            {cards.map((brand) => (
              <article key={brand.id} className="rounded-2xl border border-line bg-paper p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-section text-ink">{brand.name}</h3>
                    <p className="mt-1 text-meta text-ink-3">
                      training_consent: {brand.trainingConsent ? "yes" : "no"}
                    </p>
                  </div>
                  <span className="rounded-full border border-line bg-fill px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-ink-3">
                    {brand.groups.reduce((sum, group) => sum + group.ads.length, 0)} served ads
                  </span>
                </div>

                {brand.groups.length > 0 ? (
                  <div className="mt-5 flex flex-col gap-2">
                    {brand.groups.map((group) => (
                      <Link
                        key={group.id}
                        href={`/dashboard/campaigns/${encodeURIComponent(group.id)}`}
                        className="flex items-center justify-between gap-4 rounded-xl border border-line bg-fill px-3.5 py-3 transition-colors hover:border-line-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-ui text-ink">{group.id}</span>
                          <span className="mt-0.5 block text-meta text-ink-3">
                            {group.ads.length} {group.ads.length === 1 ? "variant" : "variants"}
                          </span>
                        </span>
                        <span className="shrink-0 text-meta text-ink-3">Open</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 rounded-xl border border-line bg-fill p-4 text-body text-ink-2">
                    No served variants have been linked to this brand yet.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-11 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">No brands yet.</h2>
          <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
            A brand appears here after a service-role process creates it and adds your user
            to brand_members. Analysis-only runs still live under Videos.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
          >
            Back to videos
          </Link>
        </div>
      )}
    </div>
  );
}
