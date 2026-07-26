"use client";

// Drives the playhead from the <video> element.
//
// The rAF loop runs ONLY WHILE PLAYING. /demo's LivePlayer.tsx:30-38 mounts a loop for
// the component's whole life and calls setState ~60x/s even while paused — a permanent
// 60 Hz React render on a static panel. This starts on `play` and cancels on
// pause/ended/unmount.

import { useCallback, useEffect, useRef, useState } from "react";

import { mapTime, unmapTime } from "./series";

export type VideoClock = {
  t: number;
  playing: boolean;
  ended: boolean;
  ready: boolean;
  error: string | null;
  videoDuration: number;
  muted: boolean;
};

export function useVideoClock(
  ref: React.RefObject<HTMLVideoElement | null>,
  jsonDuration: number,
  adId: string,
) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(NaN);
  const [muted, setMutedState] = useState(true);

  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const durRef = useRef(NaN);
  const warnedRef = useRef(false);
  // Read by the timeupdate handler. Deliberately a ref, not the `playing` state: putting
  // `playing` in the effect's dep array would re-run it on play, and the cleanup would
  // cancel the rAF loop that onPlay had just started — freezing the playhead instantly.
  const playingRef = useRef(false);

  // NOTE ON RESETTING BETWEEN ADS: this hook does not reset itself. The caller mounts
  // PlayerPanel with key={ad.id}, so switching ads remounts the panel, the <video>, and
  // this hook together — React's own answer to "reset state when a prop changes", and it
  // avoids both a stale-buffered-media class of bug in Safari and the frame of wrong
  // playhead an effect-based reset would paint.

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    const push = (raw: number) => setT(mapTime(raw, durRef.current, jsonDuration));

    const loop = () => {
      const el = ref.current;
      if (!el) return;
      const cur = el.currentTime;
      // A 30 fps clip on a 120 Hz display would otherwise fire four identical
      // setStates per video frame.
      if (Math.abs(cur - lastRef.current) >= 1 / 120) {
        lastRef.current = cur;
        push(cur);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    const onPlay = () => {
      playingRef.current = true;
      setPlaying(true);
      setEnded(false);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    const stop = () => {
      playingRef.current = false;
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
    };
    const onPause = stop;
    const onEnded = () => {
      stop();
      setEnded(true);
      // Pin to the JSON duration so the playhead lands on the right edge rather than
      // freezing a frame short of it.
      setT(jsonDuration);
    };
    const onLoaded = () => {
      const d = v.duration;
      durRef.current = d;
      setVideoDuration(d);
      setReady(true);
      setError(null);
      if (Number.isFinite(d) && Math.abs(d - jsonDuration) > 0.25 && !warnedRef.current) {
        warnedRef.current = true;
        // A mismatch means the artifact and the served mp4 have drifted. Silently
        // stretching would hide a real pipeline bug.
        console.warn(
          `[preflight] ${adId}: video duration ${d.toFixed(2)}s != report ${jsonDuration.toFixed(2)}s — playhead is being rescaled`,
        );
      }
    };
    // rAF is throttled in background tabs; timeupdate still fires at ~4 Hz. `seeked`
    // covers scrubbing while paused.
    const onTimeUpdate = () => { if (!playingRef.current) push(v.currentTime); };
    const onSeeked = () => push(v.currentTime);
    const onError = () => {
      stop();
      setReady(false);
      setError("Clip unavailable.");
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("emptied", stop);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("error", onError);

    if (v.readyState >= 1) onLoaded();

    return () => {
      cancelAnimationFrame(rafRef.current);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("emptied", stop);
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("error", onError);
    };
  }, [ref, jsonDuration, adId]);

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setError("Playback was blocked."));
    else v.pause();
  }, [ref]);

  const seek = useCallback(
    (to: number) => {
      const v = ref.current;
      if (!v) return;
      const d = Number.isFinite(durRef.current) ? durRef.current : jsonDuration;
      v.currentTime = Math.max(0, Math.min(d, to));
    },
    [ref, jsonDuration],
  );

  // Seek in CHART seconds — what a drag on the x-axis produces. `t` is set optimistically
  // so the dot tracks the pointer at pointer rate; waiting for `seeked` would make the
  // handle lag the finger by however long the decoder takes to land the frame.
  const scrub = useCallback(
    (chartT: number) => {
      const to = Math.max(0, Math.min(jsonDuration, chartT));
      setT(to);
      setEnded(false);
      const v = ref.current;
      if (v) {
        const d = Number.isFinite(durRef.current) ? durRef.current : jsonDuration;
        v.currentTime = unmapTime(to, d, jsonDuration);
      }
    },
    [ref, jsonDuration],
  );

  const setMuted = useCallback(
    (m: boolean) => {
      const v = ref.current;
      if (v) v.muted = m;
      setMutedState(m);
    },
    [ref],
  );

  return {
    t, playing, ended, ready, error, videoDuration, muted, toggle, seek, scrub, setMuted,
  };
}
