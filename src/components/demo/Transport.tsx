"use client";

// The transport bar: play/pause button, scrubber, MM:SS clock. Presentational — the
// shared clock lives in DemoConsole (a single rAF loop must own one time source), so
// the scrubber + clock are UNCONTROLLED: the loop writes `scrubRef.value` /
// `--val` / `clockRef.textContent` each frame, and user input calls back to seek.

import type { RefObject } from "react";

type Props = {
  playing: boolean;
  onToggle: () => void;
  // pct is the range value 0..100; DemoConsole maps it to seek(pct/100 * duration).
  onScrub: (pct: number) => void;
  scrubRef: RefObject<HTMLInputElement | null>;
  clockRef: RefObject<HTMLSpanElement | null>;
};

export default function Transport({
  playing,
  onToggle,
  onScrub,
  scrubRef,
  clockRef,
}: Props) {
  return (
    <div className="mt-1 flex items-center gap-3.5 px-1 pb-0.5 pt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[#1C1C1F] text-[#F5F5F7] transition-transform hover:scale-[1.04] hover:border-[#BFE0EC] active:scale-[0.97]"
      >
        {playing ? (
          <svg viewBox="0 0 12 12" className="h-[13px] w-[13px] fill-current">
            <rect x="2" y="1.5" width="3" height="9" />
            <rect x="7" y="1.5" width="3" height="9" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" className="ml-0.5 h-[13px] w-[13px] fill-current">
            <polygon points="2,1 11,6 2,11" />
          </svg>
        )}
      </button>

      <input
        ref={scrubRef}
        type="range"
        min={0}
        max={100}
        defaultValue={0}
        step={0.1}
        onInput={(e) => onScrub(Number((e.target as HTMLInputElement).value))}
        aria-label="Timeline scrubber"
        className="demo-scrub min-w-0 flex-1"
      />

      <span className="min-w-[92px] text-right font-mono text-[12px] tabular-nums text-[#ADADB2]">
        <span ref={clockRef}>0:00 / 0:00</span>
      </span>
    </div>
  );
}
