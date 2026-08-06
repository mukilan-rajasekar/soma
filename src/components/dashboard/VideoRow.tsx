// VideoRow — one video in the library.
//
// LIFTED FROM THE DEMO, DELIBERATELY. The founder's brief was "use the demo as the
// baseline for how I want them to look", and the demo already contains this exact row:
// GenerateStudio.tsx's RunnerRow is a poster thumbnail, a title, a score bar, and a
// right-aligned tabular number, as one full-width clickable control. That is also, almost
// line for line, YouTube Studio's content row. So this is a re-host of a component that
// already reads correctly rather than a new pattern — same 38×31 poster at `rounded-xl`
// with a hairline, same 1px `bg-line` track with an ink fill, same `tabular-nums`.
//
// WHAT IS DROPPED: RunnerRow's staggered entrance transition. On the demo that stagger is
// the point — it is a beat in a scripted animation being recorded. In a library of
// arbitrary length it becomes a wave of movement every time you navigate back, which is
// exactly the "no transforms on scroll-in" rule in docs/DESIGN-SYSTEM.md § Motion.
//
// THE SCORE CARRIES ITS BATCH, always. Every component out of demo/process_batch.py is a
// percentile against the other cuts in the SAME run, so a bare number implies a
// cross-library ranking that does not exist. Rank-within-batch is printed beside it.

import Link from "next/link";

import type { DashboardVideo } from "@/lib/dashboard";

function duration(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "—";
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function scoredOn(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function VideoRow({ video }: { video: DashboardVideo }) {
  return (
    <Link
      href={`/dashboard/v/${video.token}/${encodeURIComponent(video.adId)}`}
      className="flex items-center gap-4 rounded-xl border border-line bg-paper px-3 py-3 transition-colors hover:border-line-2 hover:bg-fill"
    >
      {video.posterUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={video.posterUrl}
          alt=""
          className="block h-[54px] w-[44px] shrink-0 rounded-xl border border-line object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="block h-[54px] w-[44px] shrink-0 rounded-xl border border-line bg-fill"
        />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-medium text-ink">{video.title}</span>
        <span className="mt-0.5 block truncate text-meta text-ink-3">
          {video.batchName}
          {video.scoredAt ? ` · ${scoredOn(video.scoredAt)}` : ""}
          {` · ${duration(video.durationS)}`}
        </span>
        <span className="mt-[7px] block h-1 w-full max-w-[260px] overflow-hidden rounded-full bg-line">
          <span
            className="block h-full rounded-full bg-ink"
            style={{ width: `${Math.max(0, Math.min(100, video.score))}%` }}
          />
        </span>
      </span>

      {/* The qualifier under the number is not decoration. A within-item score and a
          batch score are different quantities, and "1 OF 1" — which is what a run of one
          used to print — reads as a ranking that does not exist. */}
      <span className="shrink-0 text-right">
        <span className="block tabular-nums text-[19px] leading-none text-ink">
          {Math.round(video.score)}
        </span>
        <span className="mt-1.5 block text-[11px] uppercase tracking-[0.1em] text-ink-3">
          {video.scale === "within_item" || video.ofN < 2
            ? "On its own"
            : `${video.rank} of ${video.ofN}`}
        </span>
      </span>
    </Link>
  );
}
