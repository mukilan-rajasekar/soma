#!/usr/bin/env python3
"""
windows.py - weak-window finder for readout lanes.

This is the same weak-spot rule the demo/preflight reports already ship: a run is weak
when a smoothed lane sits at least 1.25 robust SD below the clip median for at least 3 s.
The extra work here is product-facing structure: snap edges to nearby shot boundaries,
attach the most-overlapped shot, and report how much of the dip remains after visual drive
is regressed out.
"""

from __future__ import annotations

from typing import Iterable

import numpy as np

WEAK_N_STD = 1.25
WEAK_MIN_LEN = 3.0
SNAP_TOLERANCE_S = 1.0


def _timebase(n: int, times: np.ndarray | None) -> tuple[np.ndarray, float]:
    if times is None:
        return np.arange(n, dtype=float), 1.0
    t = np.asarray(times, dtype=float)
    if t.shape != (n,):
        raise ValueError("times must be the same length as lane")
    if n < 2:
        return t, 1.0
    diffs = np.diff(t)
    positive = diffs[diffs > 0]
    if positive.size == 0:
        raise ValueError("times must be strictly increasing")
    return t, float(np.median(positive))


def _edge_time(t: np.ndarray, dt: float, idx: int) -> float:
    if idx < len(t):
        return float(t[idx])
    return float(t[-1] + dt)


def _smooth(lane: np.ndarray, dt: float) -> np.ndarray:
    fps = 1.0 / dt if dt > 0 else 1.0
    k = max(1, int(round(fps)))
    return np.convolve(lane, np.ones(k) / k, mode="same")


def _snap(value: float, boundaries: Iterable[float]) -> float:
    nearest = None
    nearest_dist = SNAP_TOLERANCE_S + 1e-9
    for b in boundaries:
        dist = abs(value - b)
        if dist <= SNAP_TOLERANCE_S and dist < nearest_dist:
            nearest = float(b)
            nearest_dist = dist
    return value if nearest is None else nearest


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def _shot_index(start: float, end: float, shot_bounds: list[tuple[float, float]] | None) -> int | None:
    if not shot_bounds:
        return None
    best_i = None
    best = 0.0
    for i, (a, b) in enumerate(shot_bounds):
        ov = _overlap(start, end, float(a), float(b))
        if ov > best:
            best = ov
            best_i = i + 1
    return best_i if best > 0 else None


def _visual_partial(lane: np.ndarray, visual_lane: np.ndarray | None, mask: np.ndarray) -> float | None:
    if visual_lane is None:
        return None
    visual = np.asarray(visual_lane, dtype=float)
    if visual.shape != lane.shape:
        raise ValueError("visual_lane must be the same length as lane")

    valid = np.isfinite(lane) & np.isfinite(visual)
    if valid.sum() < 2 or not mask.any():
        return None

    x = visual[valid]
    y = lane[valid]
    design = np.column_stack([np.ones_like(x), x])
    try:
        beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    except np.linalg.LinAlgError:
        return None

    residual = lane - (beta[0] + beta[1] * visual)
    window_residual = residual[mask & np.isfinite(residual)]
    if window_residual.size == 0:
        return None
    return float(np.mean(window_residual))


def find_windows(
    lane: np.ndarray,
    times: np.ndarray | None = None,
    shot_bounds: list[tuple[float, float]] | None = None,
    visual_lane: np.ndarray | None = None,
    lane_name: str = "attention",
) -> list[dict[str, object]]:
    """Return weak windows for one lane.

    The output keys are storage/API shaped rather than prose shaped: callers can render
    the same rows into UI copy, JSON fixtures or database inserts without parsing text.
    """

    arr = np.asarray(lane, dtype=float)
    if arr.ndim != 1:
        raise ValueError("lane must be a 1-D array")
    if arr.size < 5:
        return []

    t, dt = _timebase(arr.size, times)
    sm = _smooth(arr, dt)
    med = float(np.median(sm))
    mad = float(1.4826 * np.median(np.abs(sm - med)))
    if mad < 1e-9:
        return []

    z = (sm - med) / mad
    low = z <= -WEAK_N_STD
    boundaries = [x for shot in (shot_bounds or []) for x in shot]

    windows: list[dict[str, object]] = []
    i = 0
    n = arr.size
    while i < n:
        if not low[i]:
            i += 1
            continue

        j = i
        while j < n and low[j]:
            j += 1

        start = _edge_time(t, dt, i)
        end = _edge_time(t, dt, j)
        snapped_start = _snap(start, boundaries)
        snapped_end = _snap(end, boundaries)
        if snapped_end > snapped_start and snapped_end - snapped_start >= WEAK_MIN_LEN:
            mask = (t >= start) & (t < end)
            partial = _visual_partial(arr, visual_lane, mask) if visual_lane is not None else None
            windows.append({
                "start_s": round(snapped_start, 2),
                "end_s": round(snapped_end, 2),
                "secs": round(snapped_end - snapped_start, 2),
                "depth": round(abs(float(np.min(z[i:j]))), 3),
                "lane": lane_name,
                "shot_index": _shot_index(snapped_start, snapped_end, shot_bounds),
                "vis_partial": None if partial is None else round(partial, 6),
            })

        i = j

    return windows
