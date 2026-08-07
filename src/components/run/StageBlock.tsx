// StageBlock — one pipeline stage, exactly as recorded.
//
// A SKIPPED STAGE RENDERS AS LOUDLY AS A COMPLETED ONE, and that is the whole design.
// The tempting version of this page collapses the stages that did not run into a footnote
// and leads with the ones that did, which is how a reader ends up believing a GPU was
// involved when none was. So: same width, same type size, same position in the sequence,
// and the reason printed in full rather than behind a tooltip.

import { fmtBytes, fmtMs, STAGE_TITLES, type Stage } from "@/lib/run-capture";

const DOT: Record<string, string> = {
  ok: "bg-pos",
  skipped: "bg-ink-3",
  failed: "bg-neg",
};

const WORD: Record<string, string> = {
  ok: "ran",
  skipped: "did not run",
  failed: "failed",
};

export default function StageBlock({ stage, index }: { stage: Stage; index: number }) {
  const muted = stage.status === "skipped";

  return (
    <li className="border-t border-line py-8 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular-nums text-[11px] uppercase tracking-[0.12em] text-ink-3">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className={`text-[17px] ${muted ? "text-ink-3" : "text-ink"}`}>{stage.title}</h3>
        <span className="ml-auto inline-flex items-center gap-2 text-meta text-ink-3">
          <span className={`inline-block h-2 w-2 rounded-full ${DOT[stage.status] ?? "bg-ink-3"}`} />
          {WORD[stage.status] ?? stage.status}
          <span className="tabular-nums">{fmtMs(stage.elapsedMs)}</span>
        </span>
      </div>

      {STAGE_TITLES[stage.key] ? (
        <p className="mt-2 max-w-[70ch] text-pretty text-meta text-ink-3">
          {STAGE_TITLES[stage.key]}
        </p>
      ) : null}

      {stage.reason ? (
        <p
          className={`mt-3 max-w-[70ch] text-pretty border-l-2 pl-4 text-body ${
            stage.status === "failed" ? "border-neg text-neg" : "border-line-2 text-ink-2"
          }`}
        >
          {stage.reason}
        </p>
      ) : null}

      {stage.facts.length ? (
        <dl className="mt-5 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-5 gap-y-1.5 text-meta">
          {stage.facts.map((f, i) => (
            <div key={`${f.k}-${i}`} className="contents">
              <dt className="truncate text-ink-3">{f.k}</dt>
              <dd className="break-words font-mono text-[12px] text-ink-2">{String(f.v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {stage.artifacts.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[12px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                <th className="border-b border-line py-1.5 pr-4 font-normal">artifact</th>
                <th className="border-b border-line py-1.5 pr-4 font-normal">size</th>
                <th className="border-b border-line py-1.5 font-normal">sha256</th>
              </tr>
            </thead>
            <tbody className="font-mono text-ink-2">
              {stage.artifacts.map((a) => (
                <tr key={a.path}>
                  <td className="border-b border-line py-1.5 pr-4 align-top">
                    <span className="break-all">{a.path}</span>
                    {a.label ? (
                      <span className="ml-2 font-sans text-ink-3">{a.label}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap border-b border-line py-1.5 pr-4 align-top tabular-nums">
                    {a.present ? fmtBytes(a.bytes) : "missing"}
                  </td>
                  <td className="border-b border-line py-1.5 align-top text-ink-3">
                    {a.sha256 ? a.sha256.slice(0, 16) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {stage.log.length ? (
        <div className="mt-5">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-3">
            tool output
            {stage.logTruncated > 0 ? ` · last ${stage.log.length} of ${stage.log.length + stage.logTruncated} lines` : null}
          </div>
          <pre className="max-h-[22rem] overflow-auto rounded-xl border border-line bg-fill p-4 text-[12px] leading-[1.65] text-ink-2">
            {stage.log.map((l) => l.text).join("\n")}
          </pre>
        </div>
      ) : null}
    </li>
  );
}
