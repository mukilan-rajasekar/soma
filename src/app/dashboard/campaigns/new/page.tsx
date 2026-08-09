// /dashboard/campaigns/new — the campaign onboarding brief.
//
// The dashboard layout already establishes the signed-in user; this page only decides
// whether there is a brand to price for. Brands read through the session loader, so a
// user outside brand_members gets the explanation below rather than a form whose submit
// can only ever come back "brand not found". The static /new segment wins over the
// [servedGroupId] route next to it, so this address never collides with a group id.

import CampaignBriefForm from "@/components/dashboard/CampaignBriefForm";
import CreateBrandForm from "@/components/dashboard/CreateBrandForm";
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
            Tell us the goal, platforms, and reach. We recommend a weekly media amount;
            the number you get back bundles that media and our margin into a single
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
            Campaigns are priced per brand. Name yours here and this page turns into a
            short brief that comes back as a single weekly price.
          </p>
          <div className="mt-6">
            <CreateBrandForm />
          </div>
        </div>
      )}
    </div>
  );
}
