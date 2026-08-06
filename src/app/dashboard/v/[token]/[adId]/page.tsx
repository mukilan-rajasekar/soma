// /dashboard/v/<batch token>/<ad id> — one video's read-out.
//
// ADDRESSED BY (token, adId) because that pair is already how the edit flow resolves a
// cut (src/lib/edit-source.ts: loadBatchEditSource). Introducing a synthetic video id here
// would mean a second addressing scheme and a translation layer between them.
//
// THE TOKEN IN THIS URL IS NOT THE AUTHORIZATION. On /r/<token> it is — that is a
// capability URL and holding it is the whole permission model. Here the check is
// ownership: loadVideo() reads through the cookie-scoped client, so migration 0008's RLS
// decides whether this row is visible, and a token belonging to someone else returns null
// exactly like a token that does not exist. Both become the same notFound().
//
// Multi-ad runs also have /dashboard/runs/<token>, which mounts the full ResultReport
// instruments. This page stays the cut-deep-dive: thesis-first score, player, components,
// hook, comprehension, weak spots, takeaways, brief, limits, then the edit hand-off.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BriefEcho from "@/components/dashboard/BriefEcho";
import ComprehensionPins from "@/components/dashboard/ComprehensionPins";
import HookCallout from "@/components/dashboard/HookCallout";
import PlainTakeaways from "@/components/dashboard/PlainTakeaways";
import RunLimits from "@/components/dashboard/RunLimits";
import ScoreBreakdown from "@/components/dashboard/ScoreBreakdown";
import ShotDiagnosisStrip from "@/components/dashboard/ShotDiagnosisStrip";
import WeakSpots from "@/components/dashboard/WeakSpots";
import PlayerPanel from "@/components/preflight/PlayerPanel";
import { loadVideo } from "@/lib/dashboard";
import { loadEditRuns } from "@/lib/edit-cuts";
import { RANKING_FLOOR } from "@/lib/batch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function VideoPage({
  params,
}: {
  params: Promise<{ token: string; adId: string }>;
}) {
  const { token, adId } = await params;
  const decodedAdId = decodeURIComponent(adId);
  const detail = await loadVideo(token, decodedAdId);
  if (!detail) notFound();

  const { video, ad, report } = detail;
  const editRuns = await loadEditRuns(token, decodedAdId);
  const editRun =
    editRuns.find((r) => r.status === "done" && (r.cuts.length > 0 || r.shots.length > 0)) ??
    null;

  return (
    <div className="mx-auto max-w-[980px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(24px,4vw,36px)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/dashboard"
          className="text-meta text-ink-3 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
        >
          ← All videos
        </Link>
        {video.ofN >= 2 ? (
          <Link
            href={`/dashboard/runs/${video.token}?ad=${encodeURIComponent(video.adId)}`}
            className="text-meta text-ink-3 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
          >
            Full run · {video.ofN} cuts
          </Link>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
            {video.batchName}
            {video.scale === "within_item" || video.ofN < 2
              ? " · scored on its own"
              : ` · ranked ${video.rank} of ${video.ofN}`}
          </div>
          <h1 className="mt-2 max-w-[22ch] text-balance text-hero text-ink">
            Where this cut earns{" "}
            <span className="font-serif font-normal italic">attention</span>.
          </h1>
          <p className="mt-3 truncate text-body text-ink-2">{video.title}</p>
        </div>

        <div className="shrink-0 text-right">
          <div className="tabular-nums text-[42px] leading-none text-ink">
            {Math.round(video.score)}
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.1em] text-ink-3">
            Soma score
          </div>
        </div>
      </div>

      <section className="mt-10 border-t border-line pt-8">
        <PlayerPanel ad={ad} report={report} active />
      </section>

      <PlainTakeaways ad={ad} report={report} />

      <ScoreBreakdown scores={ad.scores} weights={report.weights} />

      <HookCallout
        scores={ad.scores}
        weight={report.weights?.hook ?? 0.4}
        ofN={video.ofN}
      />

      <ComprehensionPins ad={ad} report={report} />

      <WeakSpots spots={ad.weakSpots} durationS={ad.durationS} />

      {editRun ? (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
            Per-shot diagnosis
          </h2>
          <p className="mt-3 max-w-[62ch] text-pretty text-body text-ink-2">
            What the score does when each removable shot is dropped, from the edit candidates
            already scored for this cut. Positive means cutting it raises the score: that beat
            is dragging the film down.
          </p>
          <div className="mt-6">
            <ShotDiagnosisStrip
              shots={editRun.shots}
              cuts={editRun.cuts}
              candidates={editRun.candidates}
              baseScore={editRun.baseScore}
              title={video.title}
            />
          </div>
        </section>
      ) : null}

      <BriefEcho report={report} />

      <RunLimits ad={ad} report={report} />

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="text-section text-ink">
          Now <span className="font-serif font-normal italic">re-cut</span> it.
        </h2>
        <p className="mt-3 max-w-[60ch] text-pretty text-body text-ink-2">
          Soma searches the edit space around this film — every single-shot removal, every
          adjacent pair, every hoist to the front, two head trims — scores each one against
          the arc above, and renders the best few so you can watch them.
        </p>
        <Link
          href={`/dashboard/v/${video.token}/${encodeURIComponent(video.adId)}/edit`}
          className="mt-6 inline-block cursor-pointer rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85"
        >
          Search the edit space
        </Link>
      </section>

      <p className="mt-12 max-w-[64ch] text-pretty text-meta text-ink-3">
        {video.scale === "within_item" || video.ofN < 2
          ? `This ad was scored against itself — how its opening seconds rank among its own, and how much of it holds attention. It is not a percentile against other ads, and it is not comparable to a score from a run of ${RANKING_FLOOR} or more.`
          : `This score is a percentile against the other ads in ${video.batchName}, not an absolute rating.`}{" "}
        The curve is a model prediction of where attention goes, not a measurement of your
        audience.
      </p>
    </div>
  );
}
