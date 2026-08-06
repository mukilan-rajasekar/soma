// PendingRunRow — a run that has no read-out yet.
//
// These matter more than they look. A scored batch takes real time on a real machine, and
// the difference between "a product with a queue" and "a page that did nothing" is
// entirely whether the queue is visible. /r/<token> already makes this argument at length
// and renders three lit states; this is the same information compressed to one library row.
//
// A failed run stays in the list rather than being hidden. It links to its own page, which
// prints what the pipeline said in its own words.

import Link from "next/link";

import type { DashboardPendingRun } from "@/lib/dashboard";

const STATE: Record<DashboardPendingRun["status"], { label: string; dot: string; body: string }> = {
  queued: {
    label: "Queued",
    dot: "bg-line-2",
    body: "In the queue, in order.",
  },
  processing: {
    label: "Scoring",
    dot: "bg-accent-2",
    body: "On the box now: encoder, then the three components.",
  },
  failed: {
    label: "Did not finish",
    dot: "bg-neg",
    body: "The run stopped rather than publish numbers it cannot stand behind.",
  },
};

export default function PendingRunRow({ run }: { run: DashboardPendingRun }) {
  const state = STATE[run.status];

  return (
    <Link
      href={`/r/${run.token}`}
      className="flex items-start gap-3 rounded-xl border border-line bg-paper px-3.5 py-3 transition-colors hover:border-line-2 hover:bg-fill"
    >
      <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${state.dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui text-ink">
          {run.batchName}
          {run.adCount ? (
            <span className="text-ink-3">
              {" · "}
              {run.adCount} {run.adCount === 1 ? "cut" : "cuts"}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-meta text-ink-3">
          {run.status === "failed" && run.error ? run.error : state.body}
        </span>
      </span>
      <span className="shrink-0 pt-[3px] text-[11px] uppercase tracking-[0.1em] text-ink-3">
        {state.label}
      </span>
    </Link>
  );
}
