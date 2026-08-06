// /dashboard — the library. YouTube Studio's Content tab, in this design system.
//
// ORDERING IS BY DATE, NEVER BY SCORE, and that is a correctness decision rather than a
// taste one. Every score here is a percentile computed against the other cuts in its own
// batch (demo/process_batch.py:1004), so the numbers are not on a shared scale. Sorting
// the library by them would draw a league table out of measurements that were never
// comparable — the single most misleading thing this screen could do. Newest first is the
// only ordering the data actually supports.
//
// FOUR STATES, each a real screen: unconfigured, empty, runs-in-flight, and the library.
// The first is separated from the last on purpose. "You have no videos" and "this
// deployment has no database" look identical to a visitor and mean completely different
// things to whoever has to fix it.

import Link from "next/link";

import PendingRunRow from "@/components/dashboard/PendingRunRow";
import VideoRow from "@/components/dashboard/VideoRow";
import { loadLibrary } from "@/lib/dashboard";

export default async function DashboardPage() {
  const { videos, pending, unconfigured } = await loadLibrary();

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <h1 className="text-balance text-hero text-ink">
        Your <span className="font-serif font-normal italic">videos</span>.
      </h1>
      <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
        Every cut you have had scored, newest first. Open one to see where it earns
        attention second by second — and to search the edit space around it.
      </p>

      {unconfigured ? (
        <div className="mt-10 rounded-2xl border border-line bg-fill p-5">
          <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
            Not configured
          </div>
          <p className="mt-2 max-w-[60ch] text-pretty text-body text-ink-2">
            This deployment has no Supabase credentials, so there is nothing to read. Set{" "}
            <span className="tabular-nums">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="tabular-nums">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> and reload.
          </p>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section className="mt-11">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">In flight</h2>
          <div className="mt-3 flex flex-col gap-2">
            {pending.map((run) => (
              <PendingRunRow key={run.token} run={run} />
            ))}
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="mt-11">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Scored</h2>
            <span className="text-meta text-ink-3">
              {videos.length} {videos.length === 1 ? "video" : "videos"}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {videos.map((video) => (
              <VideoRow key={`${video.token}:${video.adId}`} video={video} />
            ))}
          </div>

          <p className="mt-7 max-w-[62ch] text-pretty text-meta text-ink-3">
            Scores are percentiles inside the run a cut was scored in, so a number is only
            comparable to the other cuts beside it in that run — not across the library.
            That is why this list is ordered by date.
          </p>
        </section>
      ) : null}

      {!unconfigured && videos.length === 0 && pending.length === 0 ? (
        <div className="mt-11 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">Nothing scored yet.</h2>
          <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
            Send us a cut and it comes back scored second by second, with the edits worth
            trying ranked underneath it.
          </p>
          <Link
            href="/dashboard/upload"
            className="mt-6 inline-block cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
          >
            Upload a cut
          </Link>
        </div>
      ) : null}
    </div>
  );
}
