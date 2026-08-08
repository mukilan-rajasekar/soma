// /dashboard/reports — the client reports, rendered verbatim.
//
// A client report is written by the operator pipeline as markdown (payload.markdown)
// and stored in serve_reports untouched. This page renders that string preformatted —
// no markdown library, no summarising layer — because the trust surface is "you read
// exactly what we wrote", and a renderer that reflows or drops a line would quietly
// break that. Tailwind's base styles already give <pre> the mono stack; wrapping and a
// scroll guard are the only styling this needs, and a dependency is not.

import { listBrandsForUser, loadClientReports } from "@/lib/serve";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ReportsPage() {
  const brands = await listBrandsForUser();
  const reports = await loadClientReports(brands.map((b) => b.id));

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <h1 className="text-balance text-hero text-ink">
        Your <span className="font-serif font-normal italic">reports</span>.
      </h1>
      <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
        Each report below is rendered exactly as the pipeline wrote it — the same text
        the operator read, newest first, nothing paraphrased in between.
      </p>

      {reports.length > 0 ? (
        <div className="mt-11 flex flex-col gap-6">
          {reports.map((report) => {
            const markdown =
              typeof report.payload.markdown === "string" ? report.payload.markdown : null;
            return (
              <article key={report.id} className="rounded-2xl border border-line bg-fill p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="text-ui font-medium text-ink">
                    {report.periodLabel ?? "Client report"}
                  </h2>
                  <span className="text-meta text-ink-3">{when(report.createdAt)}</span>
                </div>

                {markdown ? (
                  <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 text-[12.5px] leading-[1.65] text-ink-2">
                    {markdown}
                  </pre>
                ) : (
                  <p className="mt-4 max-w-[56ch] text-pretty text-meta text-ink-3">
                    This report carries no markdown body — the pipeline wrote it in a
                    shape this page does not render yet.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-11 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">No reports yet.</h2>
          <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
            Client reports land here once the serve pipeline writes one for a brand you
            belong to — a plain account of the period, in the same words the operator
            saw.
          </p>
        </div>
      )}
    </div>
  );
}
