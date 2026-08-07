// /dashboard/campaigns/new — the campaign onboarding brief.
//
// The dashboard layout already establishes the signed-in user; this page only decides
// whether there is a brand to price for. Brands read through the session loader, so a
// user outside brand_members gets the explanation below rather than a form whose submit
// can only ever come back "brand not found". The static /new segment wins over the
// [servedGroupId] route next to it, so this address never collides with a group id.

import Link from "next/link";

import CampaignBriefForm from "@/components/dashboard/CampaignBriefForm";
import { listBrandsForUser } from "@/lib/serve";

export default async function NewCampaignPage() {
  const brands = await listBrandsForUser();

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <h1 className="text-balance text-hero text-ink">
        One weekly <span className="font-serif font-normal italic">price</span>.
      </h1>

      {brands.length > 0 ? (
        <>
          <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
            Tell us where to run and what a week of media should spend. The number you get
            back bundles the media across your platforms and our margin into a single
            weekly price that renews until you pause it — no line items arriving later.
          </p>
          <div className="mt-11">
            <CampaignBriefForm brands={brands.map((b) => ({ id: b.id, name: b.name }))} />
          </div>
        </>
      ) : (
        <div className="mt-11 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">A brand comes first.</h2>
          <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
            Campaigns are priced per brand, and a brand appears here after a service-role
            process creates it and adds your user to brand_members. Once you belong to
            one, this page turns a short brief into a single weekly price.
          </p>
          <Link
            href="/dashboard/brands"
            className="mt-6 inline-block rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
          >
            See brands
          </Link>
        </div>
      )}
    </div>
  );
}
