"use client";

// Section 6 companion — shot-level diagnosis, not just one number. The dip ad's shots as
// a filmstrip; each thumbnail carries what happens to the Soma score when that shot is
// cut. A shot whose removal RAISES the score is dragging the ad down (tinted red); a shot
// whose removal DROPS the score is load-bearing (neutral). This is the spec's "full ad vs
// versions with specific shots removed" — computed leave-one-shot-out over the real arc.

import { fmtT, type ShotDiagnosis as Diag } from "./types";

export default function ShotDiagnosis({ diag, active }: { diag: Diag; active: boolean }) {
  const worst = diag.shots.reduce((a, b) => (b.delta > a.delta ? b : a), diag.shots[0]);
  const thumbs: (string | null)[] = (diag as unknown as { thumbs?: (string | null)[] }).thumbs ?? [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
        <span>
          <span className="text-ink">{diag.title}</span> · base score{" "}
          <span className="tabular-nums text-ink">{diag.base}</span>
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-error/70" /> drags it down</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-ink" /> carries it</span>
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {diag.shots.map((s, i) => {
          const drag = s.delta > 0; // cutting it raises the score → it drags
          const mag = Math.min(1, Math.abs(s.delta) / 5);
          return (
            <div
              key={i}
              className="relative flex-1 min-w-[62px]"
              style={{
                opacity: active ? 1 : 0,
                transform: active ? "none" : "translateY(6px)",
                transition: `opacity .4s ${i * 55}ms, transform .4s ${i * 55}ms`,
              }}
            >
              <div className={`overflow-hidden rounded-md border ${drag && s.delta >= 3 ? "border-error/50" : "border-line"}`}>
                {thumbs[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs[i] as string} alt="" className="block h-[74px] w-full object-cover" />
                ) : (
                  <div className="h-[74px] w-full bg-fill" />
                )}
                <div
                  className="h-1"
                  style={{ background: drag ? `rgba(180,35,24,${0.25 + mag * 0.6})` : `rgba(10,10,10,${0.2 + mag * 0.6})` }}
                />
              </div>
              <div className="mt-1.5 text-center text-[11px] tabular-nums text-ink-3">{fmtT(s.start)}</div>
              <div className={`text-center text-[13px] font-medium tabular-nums ${drag ? "text-error" : "text-ink"}`}>
                {s.delta > 0 ? `+${s.delta}` : s.delta}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 max-w-[60ch] text-[13px] leading-[1.55] text-ink-2">
        Cut the opening{" "}
        <span className="text-ink">{fmtT(worst.start)}–{fmtT(worst.end)}</span> shot and the score climbs to{" "}
        <span className="font-medium text-ink tabular-nums">{worst.without}</span> — that shot is
        dragging the whole ad down. The shots in the middle carry it: remove them and the score falls.
        This is diagnosis at the shot, not a single grade.
      </p>
    </div>
  );
}
