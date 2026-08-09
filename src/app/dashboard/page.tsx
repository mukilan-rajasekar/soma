// /dashboard — the library. YouTube Studio's Content tab, in this design system.
//
// ORDERING IS BY DATE, NEVER BY SCORE, and that is a correctness decision rather than a
// taste one. Every score here is a percentile computed against the other cuts in its own
// batch (demo/process_batch.py:1004), so the numbers are not on a shared scale. Sorting
// the library by them would draw a league table out of measurements that were never
// comparable — the single most misleading thing this screen could do. Newest first is the
// only ordering the data actually supports.
//
// Within a date-ordered list, cuts from the SAME run are grouped under one run header so
// rank-within-batch is readable next to siblings. Global order is still by the run's
// scored date, never by score.
//
// FOUR STATES, each a real screen: unconfigured, empty, runs-in-flight, and the library.
// The first is separated from the last on purpose. "You have no videos" and "this
// deployment has no database" look identical to a visitor and mean completely different
// things to whoever has to fix it.

import Link from "next/link";

import CreateBrandForm from "@/components/dashboard/CreateBrandForm";
import PendingRunRow from "@/components/dashboard/PendingRunRow";
import VideoRow from "@/components/dashboard/VideoRow";
import { loadLibrary, type DashboardVideo } from "@/lib/dashboard";
import { listBrandsForUser } from "@/lib/serve";

type RunGroup = {
  token: string;
  batchName: string;
  scoredAt: string | null;
  ofN: number;
  scale: DashboardVideo["scale"];
  videos: DashboardVideo[];
};

function groupByRun(videos: DashboardVideo[]): RunGroup[] {
  const order: string[] = [];
  const map = new Map<string, RunGroup>();
  for (const video of videos) {
    let group = map.get(video.token);
    if (!group) {
      group = {
        token: video.token,
        batchName: video.batchName,
        scoredAt: video.scoredAt,
        ofN: video.ofN,
        scale: video.scale,
        videos: [],
      };
      map.set(video.token, group);
      order.push(video.token);
    }
    group.videos.push(video);
  }
  for (const group of map.values()) {
    group.videos.sort((a, b) => a.rank - b.rank);
  }
  return order.map((t) => map.get(t)!);
}

export default async function DashboardPage() {
  const { videos, pending, unconfigured } = await loadLibrary();
  const groups = groupByRun(videos);

  // The brands read runs only when the library is genuinely empty: it decides whether
  // the empty state below is "upload a cut" (brand exists) or the two-step first run
  // (nothing exists at all). A populated library never pays for the extra query.
  const empty = !unconfigured && videos.length === 0 && pending.length === 0;
  const brands = empty ? await listBrandsForUser() : [];
  const firstRun = empty && brands.length === 0;

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

      {groups.length > 0 ? (
        <section className="mt-11">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Scored</h2>
            <span className="text-meta text-ink-3">
              {videos.length} {videos.length === 1 ? "video" : "videos"} · {groups.length}{" "}
              {groups.length === 1 ? "run" : "runs"}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-8">
            {groups.map((group) => (
              <div key={group.token}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-ui font-medium text-ink">{group.batchName}</div>
                    <div className="mt-0.5 text-meta text-ink-3">
                      {group.scale === "within_item" || group.ofN < 2
                        ? "Scored on its own"
                        : `${group.ofN} cuts, ranked inside this run`}
                    </div>
                  </div>
                  {group.ofN >= 2 ? (
                    <Link
                      href={`/dashboard/runs/${group.token}`}
                      className="shrink-0 text-meta text-ink-3 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
                    >
                      Open full run
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  {group.videos.map((video) => (
                    <VideoRow key={`${video.token}:${video.adId}`} video={video} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-7 max-w-[62ch] text-pretty text-meta text-ink-3">
            Scores are percentiles inside the run a cut was scored in, so a number is only
            comparable to the other cuts beside it in that run — not across the library.
            That is why this list is ordered by date, and grouped by run.
          </p>
        </section>
      ) : null}

      {firstRun ? (
        <div className="mt-11 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">Two steps and you are running.</h2>

          <div className="mt-6 flex flex-col gap-7">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
                1 · Name your brand
              </div>
              <p className="mt-2 max-w-[54ch] text-pretty text-body text-ink-2">
                Campaigns, spend records and outcomes all live under a brand. It takes a
                name and one decision about training.
              </p>
              <div className="mt-4">
                <CreateBrandForm />
              </div>
            </div>

            <div className="border-t border-line pt-6">
              <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
                2 · Upload a cut
              </div>
              <p className="mt-2 max-w-[54ch] text-pretty text-body text-ink-2">
                It comes back scored second by second, with the edits worth trying ranked
                underneath it.{" "}
                <Link
                  href="/dashboard/upload"
                  className="text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
                >
                  Go to upload
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {empty && !firstRun ? (
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
