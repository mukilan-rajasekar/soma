// Shown when public/preflight/batch_report.json is absent or unusable.
//
// Rendered at 200, in-system, with the real headline — the route never looks broken and
// `next build` never fails on a fresh clone. The artifact is generated on a rented GPU
// box, so "not here yet" is a normal state, not an error.

import SiteHeader from "../site/SiteHeader";

export default function PreflightEmpty() {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-paper text-ink">
      <SiteHeader />
      <section className="px-[clamp(18px,5vw,40px)] py-[clamp(44px,8vh,88px)]">
        <div className="mx-auto max-w-[980px]">
          <div className="mb-3 text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
            soma · preflight
          </div>
          <h1 className="max-w-[18ch] text-balance text-hero text-ink">
            One batch. One shared{" "}
            <span className="font-serif font-normal italic">baseline</span>.
          </h1>
          <div className="mt-8 max-w-[62ch] rounded-2xl border border-line bg-fill p-6">
            <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-ink-3">
              No batch report yet
            </div>
            <p className="text-[13px] leading-[1.65] text-ink-2">
              Run the scorer on the GPU box and drop its output here:
            </p>
            <p className="mt-3 text-[12.5px] leading-[1.7] text-ink-2">
              <span className="text-ink">python demo/process_batch.py</span>{" "}
              batch/manifest.json batch --out-dir batch/out
              <br />
              <span className="text-ink-3">
                → copy batch.json to public/preflight/batch_report.json
              </span>
              <br />
              <span className="text-ink-3">
                → copy the web mp4s to public/preflight/videos/
              </span>
            </p>
            <p className="mt-4 text-[11.5px] leading-[1.6] text-ink-3">
              The page reads that file at build time, so rebuild after dropping it in.
              Check the build log — the loader names the exact reason it rejected a file
              rather than failing silently.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
