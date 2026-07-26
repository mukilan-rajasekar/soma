"use client";

// The service ladder. Four ways to work with us, ordered by how much of the work we take
// on — from "you upload, we read it back" to "we train a head on your outcomes."
//
// Deliberately no prices. Every tier here is sold in a conversation right now, and a
// typed price would be the kind of number the disclosure rule calls a bug. When pricing
// is set it comes from one committed source, not from this file.
//
// The ladder is also the corpus strategy: each rung further down produces more matched
// pairs (creative + real outcome) than the one above it. Custom modeling is the highest
// margin and the highest ingestion rate at the same time, which is why it sits last and
// not as an afterthought.

type Tier = {
  n: string;
  name: string;
  lede: string;
  points: string[];
  /** What this rung gives back to the model. The reason the ladder exists. */
  feeds: string;
};

const TIERS: Tier[] = [
  {
    n: "01",
    name: "Managed analysis",
    lede: "You send the creative. We run it and read it back to you.",
    points: [
      "Full read-out per asset, with the weak stretches pinned to clip time",
      "Written recommendations, not just flagged timestamps",
      "Turnaround measured in hours, not a research cycle",
    ],
    feeds: "One creative, one read-out.",
  },
  {
    n: "02",
    name: "Re-cut and edit",
    lede: "We produce the recommended cut, not just the note that says to make one.",
    points: [
      "New cuts delivered back, edited against the read-out",
      "Before and after run through the same pipeline, side by side",
      "The comparison is the deliverable — you see whether the edit moved anything",
    ],
    feeds: "Matched cuts of one creative — the cleanest pair the model can learn from.",
  },
  {
    n: "03",
    name: "Account partner",
    lede: "Every creative in the account, pre-tested, tracked against what actually happened.",
    points: [
      "Ongoing pre-launch read on everything before it ships",
      "Real outcomes fed back in once the campaign has run",
      "A house baseline for your brand, so the read is against you, not an average",
    ],
    feeds: "Creative paired with real performance, continuously.",
  },
  {
    n: "04",
    name: "Custom modeling",
    lede: "A read-out head trained on your outcome data, for your audience.",
    points: [
      "Fitted on your campaigns, not a generic corpus",
      "Held-out evaluation you can inspect, including where it fails",
      "You see the baseline it had to beat, and by how much",
    ],
    feeds: "A labeled corpus in your vertical — the thing a public model cannot buy.",
  },
];

export default function ServiceTiers({ revealed = true }: { revealed?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-2">
      {TIERS.map((t, i) => (
        <article
          key={t.name}
          className="flex flex-col bg-paper p-[clamp(18px,3vw,26px)]"
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? "none" : "translateY(8px)",
            transition: `opacity .5s ${0.08 * i}s, transform .5s ${0.08 * i}s`,
          }}
        >
          <div className="flex items-baseline gap-2.5 text-[12px] uppercase tracking-[0.1em] text-ink-3">
            <span className="tabular-nums">{t.n}</span>
            <span className="h-px w-5 bg-line-2" />
          </div>
          <h3 className="mt-2.5 text-[19px] leading-[1.25] text-ink">{t.name}</h3>
          <p className="mt-2 max-w-[46ch] text-body text-pretty text-ink-2">{t.lede}</p>
          <ul className="mt-4 space-y-1.5">
            {t.points.map((p) => (
              <li key={p} className="flex gap-2 text-[14px] leading-[1.55] text-ink-2">
                <span aria-hidden className="mt-[9px] h-px w-2.5 shrink-0 bg-line-2" />
                <span className="text-pretty">{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-4 text-[13px] leading-[1.5] text-ink-3">
            <span className="font-serif italic">Back to the model:</span> {t.feeds}
          </p>
        </article>
      ))}
    </div>
  );
}
