// /dashboard/v/<token>/<adId>/edit — the editor.
//
// NOTHING ON THIS PATH SPAWNS A PROCESS. The edit search needs Python, numpy, ffmpeg and
// ffprobe with a full clone of this repo as its cwd (src/lib/edit-runner.ts execFiles
// `python3 -m tools.edit.search` with `cwd: process.cwd()`), and the site deploys to
// Vercel, which has none of it. So this screen reads cuts that were rendered somewhere
// with the stack on it — scripts/ingest_partner_ad.py — and the request path only signs
// URLs. That is also what docs/strategy/PLAN.md § 0.2 asks for.
//
// THE THREE STATES ARE ALL REAL SCREENS. A video with no edit run yet is the common case
// and gets an explanation rather than an empty panel; a failed run says what the pipeline
// said; a finished run is the workbench.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import EditWorkbench from "@/components/dashboard/EditWorkbench";
import { loadEditRuns } from "@/lib/edit-cuts";
import { loadVideo } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function EditPage({
  params,
}: {
  params: Promise<{ token: string; adId: string }>;
}) {
  const { token, adId } = await params;
  const decodedAdId = decodeURIComponent(adId);

  const detail = await loadVideo(token, decodedAdId);
  if (!detail) notFound();

  const runs = await loadEditRuns(token, decodedAdId);
  // Newest run that actually delivered film. A finished run with zero cuts is not a
  // workbench, so it falls through to the empty state rather than rendering a player
  // with nothing in it.
  const run = runs.find((r) => r.status === "done" && r.cuts.length > 0) ?? null;
  const failed = runs.find((r) => r.status === "failed") ?? null;
  const inFlight = runs.find((r) => r.status === "queued" || r.status === "processing") ?? null;

  const { video } = detail;
  const back = `/dashboard/v/${video.token}/${encodeURIComponent(video.adId)}`;

  return (
    <div className="mx-auto max-w-[1080px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(24px,4vw,36px)]">
      <Link
        href={back}
        className="text-meta text-ink-3 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
      >
        ← {video.title}
      </Link>

      <h1 className="mt-5 max-w-[24ch] text-balance text-hero text-ink">
        Every way to <span className="font-serif font-normal italic">re-cut</span> it.
      </h1>
      <p className="mt-4 max-w-[64ch] text-pretty text-body text-ink-2">
        Soma enumerates a bounded edit space — drop one shot, drop an adjacent pair, hoist a
        shot to the front, trim the head — scores every candidate against this film&rsquo;s
        own arc, and renders the best few so you can watch them side by side.
      </p>

      {run ? (
        <EditWorkbench
          run={run}
          sourceTitle={video.title}
          sourceUrl={detail.videoUrl}
          sourcePoster={video.posterUrl}
          sourceDurationS={video.durationS}
          sourceScore={video.score}
        />
      ) : (
        <div className="mt-9 rounded-2xl border border-line bg-fill p-6">
          {failed ? (
            <>
              <h2 className="text-section text-ink">That search didn&rsquo;t finish.</h2>
              <p className="mt-3 max-w-[58ch] text-pretty text-body text-ink-2">
                The pipeline stops rather than deliver cuts it cannot score. Nothing is
                wrong with your footage as far as you need to care.
              </p>
              {failed.error ? (
                <div className="mt-5 rounded-xl border border-line bg-paper p-4">
                  <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
                    What the run said
                  </div>
                  <p className="mt-2 text-meta leading-[1.65] text-ink-2">{failed.error}</p>
                </div>
              ) : null}
            </>
          ) : inFlight ? (
            <>
              <h2 className="text-section text-ink">Searching the edit space.</h2>
              <p className="mt-3 max-w-[58ch] text-pretty text-body text-ink-2">
                Every candidate is estimated against the arc, and the best few are rendered
                for real. Reload in a few minutes — the cuts land here when they are done.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-section text-ink">No cuts searched yet.</h2>
              <p className="mt-3 max-w-[60ch] text-pretty text-body text-ink-2">
                Rendering an edit spends real time on a real machine — the search enumerates
                roughly four candidates per shot, scores all of them, and encodes the
                winners. It runs on the scorer box rather than in your browser, and the
                results appear here.
              </p>
            </>
          )}
        </div>
      )}

      <p className="mt-12 max-w-[66ch] text-pretty text-meta text-ink-3">
        {/* The {" "} after each </b> is load-bearing, not clutter. JSX strips the
            whitespace between an element and the text that follows it on the same line,
            so `</b> was` renders as "estimatewas". It was doing exactly that here. */}
        A delta labelled <b className="font-medium text-ink-2">estimate</b>{" "}
        was computed by re-slicing the unedited film&rsquo;s arc; one labelled{" "}
        <b className="font-medium text-ink-2">measured</b>{" "}
        came from running the rendered cut back through the encoder. Only the second is a
        score of the film you are watching.
      </p>
    </div>
  );
}
