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
  // sound: rendered only for cuts that actually have footage, since there is nothing to
  // hear otherwise. Muted is the default everywhere — this is the opt-in.
  showMute?: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
};

export default function Transport({
  playing,
  onToggle,
  onScrub,
  scrubRef,
  clockRef,
  showMute = false,
  muted = true,
  onToggleMute,
}: Props) {
  return (
    <div className="mt-1 flex items-center gap-3.5 px-1 pb-0.5 pt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper transition-transform hover:scale-[1.02] active:scale-[0.98]"
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

      {showMute ? (
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? "Turn ad sound on" : "Turn ad sound off"}
          aria-pressed={!muted}
          title={muted ? "Sound off" : "Sound on"}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
        >
          {muted ? (
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[15px] w-[15px]">
              <path d="M3 6h2.2L8.5 3.2v9.6L5.2 10H3z" fill="currentColor" />
              <path
                d="M10.6 6.4l3 3.2M13.6 6.4l-3 3.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[15px] w-[15px]">
              <path d="M3 6h2.2L8.5 3.2v9.6L5.2 10H3z" fill="currentColor" />
              <path
                d="M10.8 5.9a3 3 0 0 1 0 4.2M12.7 4.3a5.4 5.4 0 0 1 0 7.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      ) : null}

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

      <span className="min-w-[92px] text-right text-[12px] tabular-nums text-ink-3">
        <span ref={clockRef}>0:00 / 0:00</span>
      </span>
    </div>
  );
}
