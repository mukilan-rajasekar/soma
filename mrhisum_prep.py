#!/usr/bin/env python3
"""
mrhisum_prep.py — turn the Mr.HiSum "most-replayed" labels into per-video RETENTION
arcs the read-out head can be trained against.

WHAT MR.HISUM IS (and the honesty caveat baked in)
--------------------------------------------------
Mr.HiSum (Sul et al., NeurIPS 2023 Datasets & Benchmarks; GitHub MRHiSum/MR.HiSum) is
31,892 YouTube videos, each with a per-second "most-replayed" heatmap normalized over
50k+ viewers/video. It is the largest public per-second engagement label that exists.

It is a **RETENTION PROXY, not retention.** A high most-replayed value means many
viewers *re-watched* that second — it is correlated with, but NOT equal to, "people
kept watching instead of leaving." Rewatch spikes on punchlines, drops, and reference
moments; leaving is a different behavior. Every downstream claim must say "most-replayed
(a retention proxy)", never "retention." The code carries that label; keep it.

DOCUMENTED NEGATIVE PRIOR TO BEAT: arXiv 2607.01400 reports that a *global* TRIBE drive
signal does NOT predict most-replayed. So a read-out head has to beat (i) that global
signal and (ii) the dumb ffmpeg covariates — both gates are wired into retention_head.py.

WHAT THIS MODULE DOES
---------------------
Parses Mr.HiSum labels into `retention_<vid>.csv` with columns:
    t_sec, most_replayed          most_replayed in [0, 1] (min-max normalized per video)

Two entry points:
  * load_real_mrhisum(...)   — reads the REAL archive (mr_hisum.h5 + metadata.csv). The
                               archive is ~ tens of GB and is NOT downloadable in this
                               environment, so this is a documented PLUG-IN POINT: it is
                               written faithfully to the published HDF5 layout but is only
                               exercised once you `pip install h5py` and drop the file in.
  * make_synthetic_mrhisum() — fabricates a tiny synthetic sample IN-CODE (stdlib+numpy,
                               no network) so the parser + the whole pipeline are testable
                               with zero data. This is NOT real engagement data and must
                               never be presented as a result.

Only hard dependency is numpy (h5py is lazily imported ONLY inside load_real_mrhisum).

USAGE:
  # generate a tiny synthetic sample (no network, for tests / smoke):
  python mrhisum_prep.py --synth --out data/mrhisum --n-videos 6

  # parse the real archive (after you download it + `pip install h5py`):
  python mrhisum_prep.py --h5 data/mrhisum/mr_hisum.h5 \
      --metadata data/mrhisum/metadata.csv --out data/mrhisum
"""
import argparse
import csv
import os

import numpy as np


# -----------------------------------------------------------------------------
# normalization + resampling helpers (numpy only)
# -----------------------------------------------------------------------------
def normalize01(x):
    """Min-max a per-video arc to [0, 1], NaN-safe. A flat arc maps to all-zeros.

    Mr.HiSum's gtscore is already loosely normalized, but its scale varies per video;
    min-maxing per video makes 'most_replayed' comparable across the corpus and matches
    the [0, 1] contract the head + demo expect."""
    a = np.asarray(x, float)
    finite = a[np.isfinite(a)]
    if finite.size == 0:
        return np.zeros_like(a)
    lo, hi = float(finite.min()), float(finite.max())
    if hi - lo < 1e-12:
        return np.where(np.isfinite(a), 0.0, np.nan)
    out = (a - lo) / (hi - lo)
    return np.clip(np.where(np.isfinite(a), out, np.nan), 0.0, 1.0)


def frames_to_seconds(frame_scores, fps):
    """Average a per-FRAME score into per-SECOND bins.

    Mr.HiSum's gtscore is already ~1 Hz (one value per sampled frame ≈ one per second),
    so for the real archive this is usually a no-op; it exists so a caller with a
    denser frame-rate heatmap can still land on the per-second grid the head trains on.
    """
    a = np.asarray(frame_scores, float)
    if fps is None or fps <= 1.0 + 1e-9:
        return a
    n_sec = int(np.ceil(len(a) / fps))
    return np.array([np.nanmean(a[int(round(s * fps)):int(round((s + 1) * fps))])
                     if len(a[int(round(s * fps)):int(round((s + 1) * fps))]) else np.nan
                     for s in range(n_sec)], float)


# -----------------------------------------------------------------------------
# writer (the retention arc contract)
# -----------------------------------------------------------------------------
def write_retention_csv(out_dir, vid, most_replayed):
    """Write retention_<vid>.csv (t_sec, most_replayed in [0,1]). Returns the path."""
    arc = normalize01(most_replayed)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"retention_{vid}.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["t_sec", "most_replayed"])
        for t, v in enumerate(arc):
            w.writerow([t, "" if not np.isfinite(v) else f"{v:.4f}"])
    return path


# -----------------------------------------------------------------------------
# REAL loader — documented plug-in point (needs the downloaded archive + h5py)
# -----------------------------------------------------------------------------
def load_real_mrhisum(h5_path, metadata_csv=None, out_dir="data/mrhisum",
                      video_ids=None, gtscore_key="gtscore", limit=None):
    """Parse the real Mr.HiSum HDF5 into retention_<id>.csv files. PLUG-IN POINT.

    Published layout (MRHiSum/MR.HiSum): `mr_hisum.h5` is a group-per-video HDF5. Each
    group (e.g. 'video_1') holds:
        features   (n_sec, 1024)  GoogLeNet frame features @ ~1 Hz
        gtscore    (n_sec,)       the per-second most-replayed importance (our LABEL)
        change_points, n_frames, picks, gtsummary, ...
    `metadata.csv` maps the internal video_id -> the real YouTube id (`youtube_id`).

    We take gtscore (already ~1 Hz), min-max it to [0, 1], name each file by its YouTube
    id when metadata is available (else the internal id), and write retention_<id>.csv.
    IMPORTANT: gtscore is the most-replayed proxy — the output is a retention PROXY arc.

    This function is deliberately untested in-repo (the archive isn't downloadable here);
    it is the seam where real data plugs in. It lazily imports h5py so the module's only
    hard dependency stays numpy.
    """
    try:
        import h5py
    except ImportError as e:
        raise SystemExit(
            "load_real_mrhisum needs h5py to read mr_hisum.h5 — `pip install h5py`. "
            "(The synthetic path in make_synthetic_mrhisum needs no such dependency.)"
        ) from e
    if not os.path.exists(h5_path):
        raise SystemExit(
            f"{h5_path} not found. Download the Mr.HiSum archive first — see "
            "docs/pipeline/MRHISUM-RETENTION.md (GitHub MRHiSum/MR.HiSum, gated by a "
            "Google-Form request). This env cannot fetch it for you.")

    id_map = {}
    if metadata_csv and os.path.exists(metadata_csv):
        with open(metadata_csv, newline="") as f:
            for row in csv.DictReader(f):
                internal = row.get("video_id") or row.get("id")
                yt = row.get("youtube_id") or row.get("youtube") or internal
                if internal:
                    id_map[internal] = yt

    written = []
    with h5py.File(h5_path, "r") as h5:
        keys = list(h5.keys()) if video_ids is None else list(video_ids)
        if limit is not None:
            keys = keys[:limit]
        for key in keys:
            grp = h5[key]
            if gtscore_key not in grp:
                print(f"[mrhisum] {key}: no '{gtscore_key}' dataset — skipped")
                continue
            gt = np.asarray(grp[gtscore_key][()], float).ravel()
            vid = id_map.get(key, key)
            written.append(write_retention_csv(out_dir, vid, gt))
    print(f"[mrhisum] wrote {len(written)} real retention arcs -> {out_dir}")
    return written


# -----------------------------------------------------------------------------
# SYNTHETIC sample — no network, no h5py, testable
# -----------------------------------------------------------------------------
def synth_retention_arc(n_sec, rng):
    """A plausible synthetic most-replayed arc in [0,1]: an early rewatch 'hook' spike,
    slow decay, plus a couple of interior replay peaks. NOT real data — a shape for
    testing the parser + head plumbing only."""
    t = np.arange(n_sec, dtype=float)
    hook = np.exp(-t / max(1.0, 0.15 * n_sec))                    # early rewatch spike
    lo, hi = max(3, int(0.2 * n_sec)), max(4, int(0.9 * n_sec))
    centers = rng.integers(lo, hi, size=2)
    peaks = sum(np.exp(-((t - c) ** 2) / (2 * (0.03 * n_sec + 2.0) ** 2)) for c in centers)
    arc = (0.20
           + 0.55 * hook / (hook.max() + 1e-9)
           + 0.70 * peaks / (peaks.max() + 1e-9)
           + rng.normal(0, 0.03, n_sec))
    return normalize01(arc)


def make_synthetic_mrhisum(out_dir, n_videos=6, seconds=None, seed=0):
    """Fabricate a tiny Mr.HiSum-shaped sample: retention_<id>.csv + a metadata.csv.

    Stdlib+numpy only; no network, no h5py. Returns the list of written arc paths. The
    metadata.csv mirrors the real one's shape (video_id, youtube_id, n_sec, split)."""
    rng = np.random.default_rng(seed)
    if seconds is None:
        seconds = [90, 120, 75, 110, 100, 85, 130, 95][:n_videos]
        while len(seconds) < n_videos:
            seconds.append(int(rng.integers(70, 140)))
    os.makedirs(out_dir, exist_ok=True)
    meta_rows, written = [], []
    for i in range(n_videos):
        n_sec = int(seconds[i])
        vid = f"synthmrh_{i:02d}"
        arc = synth_retention_arc(n_sec, rng)
        written.append(write_retention_csv(out_dir, vid, arc))
        split = "train" if i < max(1, int(0.7 * n_videos)) else "val"
        meta_rows.append(dict(video_id=vid, youtube_id=vid, n_sec=n_sec, split=split))
    with open(os.path.join(out_dir, "metadata.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["video_id", "youtube_id", "n_sec", "split"])
        w.writeheader()
        for r in meta_rows:
            w.writerow(r)
    print(f"[mrhisum] wrote {len(written)} SYNTHETIC retention arcs + metadata.csv -> {out_dir}")
    print("  NOTE: synthetic labels — a plumbing fixture, NEVER a result. Real labels need "
          "the Mr.HiSum download (see docs/pipeline/MRHISUM-RETENTION.md).")
    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="data/mrhisum", help="output dir for retention_<id>.csv")
    ap.add_argument("--synth", action="store_true",
                    help="generate a tiny SYNTHETIC sample (no network / no h5py)")
    ap.add_argument("--n-videos", type=int, default=6, help="synthetic sample size")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--h5", default=None, help="path to the real mr_hisum.h5 archive")
    ap.add_argument("--metadata", default=None, help="path to the real metadata.csv (id map)")
    ap.add_argument("--limit", type=int, default=None, help="cap number of real videos parsed")
    args = ap.parse_args()

    if args.h5:
        load_real_mrhisum(args.h5, args.metadata, args.out, limit=args.limit)
    elif args.synth:
        make_synthetic_mrhisum(args.out, n_videos=args.n_videos, seed=args.seed)
    else:
        raise SystemExit("pass --synth for the in-code sample, or --h5 PATH for the real "
                         "archive. See docs/pipeline/MRHISUM-RETENTION.md.")


if __name__ == "__main__":
    main()
