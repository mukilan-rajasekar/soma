// Pure helpers for the chart. No React, no DOM — so they're trivially checkable.

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Value of a series at an arbitrary time, LINEARLY INTERPOLATED between the bracketing
 * samples.
 *
 * ArcPlot.tsx:219 rounds to the nearest sample index instead. At the 1 Hz sampling this
 * data actually uses, that makes the playhead dot detach from the curve and hop between
 * whole seconds — very visible on a 30-point arc.
 */
export function sampleAt(timestamps: number[], values: number[], t: number): number {
  const n = Math.min(timestamps.length, values.length);
  if (n === 0) return 0;
  if (t <= timestamps[0]) return values[0];
  if (t >= timestamps[n - 1]) return values[n - 1];
  // Linear scan is fine: n is ~30 and this runs once per frame at most.
  let i = 1;
  while (i < n && timestamps[i] < t) i++;
  const t0 = timestamps[i - 1];
  const t1 = timestamps[i];
  const span = t1 - t0;
  if (span <= 0) return values[i];
  const f = (t - t0) / span;
  return values[i - 1] + (values[i] - values[i - 1]) * f;
}

/** 1/2/5 x 10^k tick step covering `span` in roughly `target` steps. */
export function niceStep(span: number, target: number): number {
  if (!(span > 0)) return 1;
  const rough = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return mult * mag;
}

/**
 * Y-axis ticks across [lo, hi], with ZERO ALWAYS INCLUDED — the zero line is the whole
 * point of a baseline-subtracted chart, so it never gets skipped by tick arithmetic.
 */
export function niceTicks(lo: number, hi: number, target = 4): { ticks: number[]; step: number } {
  const step = niceStep(hi - lo, target);
  const ticks: number[] = [];
  const first = Math.ceil(lo / step) * step;
  for (let v = first; v <= hi + step * 1e-6; v += step) {
    ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  }
  if (lo <= 0 && hi >= 0 && !ticks.some((v) => Math.abs(v) < step * 1e-6)) ticks.push(0);
  ticks.sort((a, b) => a - b);
  return { ticks, step };
}

/** X-axis tick spacing in seconds. */
export function niceTimeStep(span: number): number {
  if (span <= 12) return 2;
  if (span <= 45) return 5;
  if (span <= 120) return 10;
  return 30;
}

/**
 * Map the video element's currentTime into chart time.
 *
 * The chart's x-domain is ALWAYS the JSON duration — that is what the arc was computed
 * against. The element's duration is used only to rescale, and only when the two have
 * genuinely drifted, which means the artifact and the served mp4 disagree and somebody
 * needs to know.
 */
export function mapTime(videoT: number, videoDur: number, jsonDur: number): number {
  if (!Number.isFinite(videoDur) || videoDur <= 0) return clamp(videoT, 0, jsonDur);
  if (Math.abs(videoDur - jsonDur) <= 0.25) return clamp(videoT, 0, jsonDur);
  return clamp(videoT * (jsonDur / videoDur), 0, jsonDur);
}

/** Inverse of mapTime: chart seconds -> video seconds. Scrubbing reads a time off the
 *  x-axis, which is in report units, and has to hand the <video> its own clock back. */
export function unmapTime(jsonT: number, videoDur: number, jsonDur: number): number {
  if (!Number.isFinite(videoDur) || videoDur <= 0) return clamp(jsonT, 0, jsonDur);
  if (Math.abs(videoDur - jsonDur) <= 0.25) return clamp(jsonT, 0, videoDur);
  return clamp(jsonT * (videoDur / jsonDur), 0, videoDur);
}
