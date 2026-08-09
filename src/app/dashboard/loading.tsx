// The dashboard's loading boundary. One file at the layout level covers every child
// route: DashboardShell renders in the layout, so the chrome appears instantly and this
// skeleton fills the content pane while a force-dynamic page (Serve runs five loader
// queries per brand) streams in.
//
// STATIC BLOCKS, NO PULSE. The design system's motion rule is transition-colors and
// opacity only — no decorative motion — and a skeleton that shimmers would be the first
// thing on the site that does. Hairline boxes at the heights of the real rows say
// "content belongs here" without the disco.

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <span className="sr-only">Loading</span>
      <div aria-hidden className="flex flex-col">
        {/* heading + blurb */}
        <div className="h-[38px] w-[min(320px,60%)] rounded-xl bg-fill" />
        <div className="mt-5 h-[17px] w-[min(460px,85%)] rounded-md bg-fill" />
        <div className="mt-2 h-[17px] w-[min(380px,70%)] rounded-md bg-fill" />

        {/* rows */}
        <div className="mt-12 flex flex-col gap-3">
          <div className="h-[72px] rounded-2xl border border-line bg-fill" />
          <div className="h-[72px] rounded-2xl border border-line bg-fill" />
          <div className="h-[72px] rounded-2xl border border-line bg-fill" />
        </div>
      </div>
    </div>
  );
}
