#!/usr/bin/env python3
"""
batch_extract.py — run TRIBE v2 on a folder of clips and cache per-second arcs.

This is the .py runbook for the rented A100 box (NOT Colab — Colab session
fragility is the #1 schedule killer). Run under tmux/nohup so a dropped SSH
session doesn't kill a 45-minute batch.

It replaces the notebook's single-upload cell. Per clip it writes:
  <out>/preds_<id>.npy   the raw (n_timesteps, 20484) prediction (deterministic;
                         cache it once, never re-run at analysis time)
  <out>/arc_<id>.csv     columns: t_sec, global_mag, roi_mag
                         -> global_mag = mean_v |preds[t, v]|         (all vertices)
                         -> roi_mag    = mean_v |preds[t, v in ROI]|  (a-priori ROI)
  <out>/arc_<id>.json    the demo-ready arc (normalized 0..1 + weak-spot spans)

Two PRE-REGISTERED features are computed (see PREREGISTRATION.md):
  global : whole-cortex magnitude. The documented likely-NULL baseline — a global
           TRIBE drive is already published NOT to predict YouTube replay.
  roi    : mean magnitude within an a-priori region (default: DMN, from
           build_roi_mask.py). The distinct, still-open test.

CRITICAL SCALE NOTE (this fixes a real bug):
  TRIBE predictions are z-scored, SIGNED BOLD values (~[-1, +1]; negatives are
  real deactivations), NOT 0..1 probabilities. The old notebook's
  `active_area_ratio = mean(preds > 0.6)` is therefore wrong: 0.6 is ~0.6 SD
  above a vertex's session mean, and the cutoff silently discards every
  deactivation. This script prints the actual distribution so you can confirm,
  and uses magnitude (|preds|) + a within-clip percentile for any thresholding.

USAGE (on the GPU box, after the model + weights are cached):
  # default 'av' = audio+video, the VERIFIED notebook config (fastest to a result):
  python batch_extract.py --video-dir ./clips --out ./data/arcs \
      --roi-mask ./data/roi_mask_dmn.npy

  # 'trimodal' adds the text branch - only once gated LLaMA-3.2 access is confirmed:
  python batch_extract.py --video-dir ./clips --out ./data/arcs \
      --roi-mask ./data/roi_mask_dmn.npy --modality trimodal
"""
import argparse
import errno
import glob
import json
import os
import sys
import traceback
from datetime import datetime

import numpy as np

# Weak-spot detection knobs (F-CONSTANTS): surfaced here so they're auditable.
WEAK_SPOT_N_STD = 1.25       # flag runs >= this many robust SD below the clip's own median
WEAK_SPOT_MIN_LEN_SEC = 3    # ignore dips shorter than this


def _load_checkpoint(path):
    """Return the set of already-completed video ids from the ledger, or empty set."""
    try:
        with open(path) as f:
            return set(json.load(f)["completed"])
    except (FileNotFoundError, KeyError, ValueError):
        return set()


def _mark_done(path, vid):
    """Atomically add vid to the completion ledger (write tmp then os.replace)."""
    done = _load_checkpoint(path)
    done.add(vid)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"completed": sorted(done), "updated": datetime.now().isoformat()},
                  f, indent=2)
    os.replace(tmp, path)


def _log_clip_error(err_log, vid, exc):
    """Append the full traceback for a failed clip; print a one-line notice."""
    with open(err_log, "a") as f:
        f.write(f"\n=== {vid} @ {datetime.now().isoformat()} ===\n"
                f"{traceback.format_exc()}\n")
    print(f"    [ERROR] {vid}: {exc!r} — full traceback in {err_log}; batch continues")


def build_events(video_path):
    """The working manual event-build path from the notebook (no transcription).

    Contract for the ``neuralset.events.transforms`` pipeline (pinned so a
    neuralset bump can't silently change the event schema):

    INPUT  — a single-row events df describing the whole clip:
             ``{type: 'Video', filepath: <str>, start: 0, timeline: 'default',
             subject: 'default'}`` (standardized via ``standardize_events``).
    STEPS  — ``ExtractAudioFromVideo`` adds Audio events derived from the video,
             then ``ChunkEvents`` splits the Audio and Video streams into
             ~30-60s spans (max_duration=60, min_duration=30).
    OUTPUT — a standardized events df (re-run through ``standardize_events``) of
             the chunked Audio+Video spans, ready for ``model.predict``.

    The EXACT output columns can be captured from the events smoke test
    (``tests/test_build_events.py``); pin them there rather than assuming here.
    """
    import pandas as pd
    from neuralset.events.utils import standardize_events
    from neuralset.events.transforms import ExtractAudioFromVideo, ChunkEvents

    transforms = [
        ExtractAudioFromVideo(),
        ChunkEvents(event_type_to_chunk="Audio", max_duration=60, min_duration=30),
        ChunkEvents(event_type_to_chunk="Video", max_duration=60, min_duration=30),
    ]
    initial = {
        "type": "Video",
        "filepath": str(video_path),
        "start": 0,
        "timeline": "default",
        "subject": "default",
    }
    df = standardize_events(pd.DataFrame([initial]))
    for t in transforms:
        df = t(df)
    return standardize_events(df)


def describe_preds(preds, tag=""):
    """Print the distribution so the z-scored/signed scale is confirmed, not assumed."""
    p = np.asarray(preds, float)
    pct = np.percentile(p, [1, 50, 90, 99])
    print(f"  [preds {tag}] shape={p.shape} min={p.min():.3f} max={p.max():.3f} "
          f"mean={p.mean():.3f} std={p.std():.3f}")
    print(f"           pct(1/50/90/99)={pct[0]:.3f}/{pct[1]:.3f}/{pct[2]:.3f}/"
          f"{pct[3]:.3f}  frac<0={np.mean(p < 0):.2%}  frac>0.6={np.mean(p > 0.6):.2%}")
    if p.min() >= 0 and p.max() <= 1:
        print("           WARNING: values look bounded [0,1] - verify this really is "
              "z-scored BOLD, not a probability, before trusting any threshold.")


def arc_from_preds(preds, roi_mask=None):
    """
    Reduce (T, 20484) -> per-second scalars.
      global_mag(t) = mean over ALL vertices of |preds[t, v]|
      roi_mag(t)    = mean over ROI vertices of |preds[t, v]|   (None if no mask)
    Magnitude (not signed mean, not a fixed threshold) so the scale bug can't
    resurface; direction is handled downstream by Spearman + first-differencing.
    """
    p = np.abs(np.asarray(preds, float))
    global_mag = p.mean(axis=1)
    roi_mag = None
    if roi_mask is not None:
        m = np.asarray(roi_mask, bool)
        if m.shape[0] != p.shape[1]:
            raise ValueError(f"ROI mask length {m.shape[0]} != n_vertices {p.shape[1]}")
        roi_mag = p[:, m].mean(axis=1)
    return global_mag, roi_mag


def detect_weak_spots(arc, fps=1.0, min_len_sec=WEAK_SPOT_MIN_LEN_SEC,
                      n_std=WEAK_SPOT_N_STD):
    """
    A weak spot = a sustained run where the (smoothed) arc sits at least
    ``n_std`` robust (MAD-based) standard deviations below the clip's OWN
    median. FALSIFIABLE: a flat/steady arc yields ZERO spots (no forced bottom
    quartile). Labeled a model PREDICTION, never measured behavior.
    """
    a = np.asarray(arc, float)
    if len(a) < 5:
        return []
    k = max(1, int(round(fps)))
    kernel = np.ones(k) / k
    sm = np.convolve(a, kernel, mode="same")
    med = np.median(sm)
    mad = 1.4826 * np.median(np.abs(sm - med))
    if mad < 1e-9:
        return []
    z = (sm - med) / mad
    low = z <= -n_std
    spots, i, n = [], 0, len(a)
    min_len = int(round(min_len_sec * fps))
    while i < n:
        if low[i]:
            j = i
            while j < n and low[j]:
                j += 1
            if (j - i) >= min_len:
                secs = round((j - i) / fps)
                zmin = float(z[i:j].min())
                spots.append({"start": round(i / fps, 2),
                              "end": round(j / fps, 2),
                              "label": f"predicted dip (hypothesis — not yet "
                                       f"validated vs attention) — {secs}s, "
                                       f"{abs(zmin):.1f}sd below baseline"})
            i = j
        else:
            i += 1
    return spots


def write_demo_json(out_dir, vid, arc, weak_spots, feature_name, fps=1.0):
    a = np.asarray(arc, float)
    lo, hi = np.percentile(a, 2), np.percentile(a, 98)
    norm = np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)
    payload = {
        "schema_version": "1.0",
        "video_id": vid,
        "fps_arc": fps,
        "duration_sec": round(len(a) / fps, 2),
        "feature": feature_name,
        "precomputed": True,
        "claim": {
            "validated": "video -> brain activation (Meta TRIBE v2, public model, "
                         "benchmarked vs real fMRI)",
            "hypothesis": "activation -> engagement (our downstream inference; "
                          "tested, not asserted)"
        },
        "timestamps": [round(i / fps, 2) for i in range(len(a))],
        "activation": [round(float(x), 4) for x in norm],
        "weak_spots": weak_spots,
    }
    path = os.path.join(out_dir, f"arc_{vid}.json")
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video-dir", required=True)
    ap.add_argument("--out", default="./data/arcs")
    ap.add_argument("--roi-mask", default=None,
                    help="boolean .npy of length 20484 from build_roi_mask.py")
    ap.add_argument("--modality", choices=["av", "trimodal", "video"], default="av",
                    help="av = audio+video (the VERIFIED notebook config; default). "
                         "trimodal = audio+video+text (needs gated LLaMA-3.2 access; "
                         "use once that's confirmed). video = video-only, drops audio "
                         "(max de-risk).")
    ap.add_argument("--demo-feature", choices=["global", "roi"], default="roi",
                    help="which feature drives the demo arc.json")
    ap.add_argument("--glob", default="*.mp4")
    ap.add_argument("--force", action="store_true",
                    help="re-extract clips even if they're in the completion ledger "
                         "(default off: a re-run resumes and skips finished videos).")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)

    # Resume/resilience ledgers (F-BATCH-RESUME / F-BATCH-ERRLOG).
    ckpt = os.path.join(args.out, "extraction_checkpoint.json")
    progress = os.path.join(args.out, "extraction_progress.log")
    err_log = os.path.join(args.out, "extraction_errors.log")
    done = _load_checkpoint(ckpt)
    roi_mask = np.load(args.roi_mask) if args.roi_mask else None
    if roi_mask is None:
        print("[note] no --roi-mask given: computing GLOBAL only. Build the DMN mask "
              "with build_roi_mask.py to run the a-priori ROI test.")

    # Heavy imports deferred so --help works without a GPU env.
    from pathlib import Path
    from tribev2.demo_utils import TribeModel
    print(f"[load] TRIBE v2 ({args.modality}) ...")
    # API matches the working notebook: features are selected via
    # config_update["data"]["features_to_use"], NOT a `modalities=` kwarg. The
    # notebook's VERIFIED config is ["audio","video"] (text/LLaMA path disabled).
    # The average-subject map is correct: per-subject TRIBE outputs are
    # deterministic transforms of the same stimulus (synthetic ISC ~1.0, meaningless).
    features = {
        "av": ["audio", "video"],                 # verified working (default)
        "trimodal": ["audio", "video", "text"],   # needs gated LLaMA-3.2 access
        "video": ["video"],                       # max de-risk, audio dropped
    }[args.modality]
    model = TribeModel.from_pretrained(
        "facebook/tribev2",
        cache_folder=Path("./cache"),
        config_update={"data": {"features_to_use": features}},
    )

    videos = sorted(glob.glob(os.path.join(args.video_dir, args.glob)))
    if not videos:
        sys.exit(f"No videos match {os.path.join(args.video_dir, args.glob)!r}")
    print(f"[batch] {len(videos)} clips -> {args.out}")

    printed_scale = False
    for i, vp in enumerate(videos):
        vid = os.path.splitext(os.path.basename(vp))[0]
        if vid in done and not args.force:
            print(f"  [skip-done] {vid}")
            continue
        npy = os.path.join(args.out, f"preds_{vid}.npy")
        try:
            if os.path.exists(npy):
                print(f"  [skip-cached] {vid}")
                preds = np.load(npy)
            else:
                print(f"  [predict] {vid} ...")
                events = build_events(vp)
                preds, _segments = model.predict(events=events)
                preds = np.asarray(preds, float)
                np.save(npy, preds.astype(np.float32))  # float32 halves disk/IO; z-scored BOLD needs no more (matches Colab Cell 4)
            if not printed_scale:
                describe_preds(preds, tag=vid)   # confirm z-scored/signed scale ONCE
                printed_scale = True

            global_mag, roi_mag = arc_from_preds(preds, roi_mask)
            T = len(global_mag)
            with open(os.path.join(args.out, f"arc_{vid}.csv"), "w") as f:
                has_roi = roi_mag is not None
                f.write("t_sec,global_mag" + (",roi_mag\n" if has_roi else "\n"))
                for t in range(T):
                    if has_roi:
                        f.write(f"{t},{global_mag[t]:.6f},{roi_mag[t]:.6f}\n")
                    else:
                        f.write(f"{t},{global_mag[t]:.6f}\n")

            demo_arc = roi_mag if (args.demo_feature == "roi" and roi_mag is not None) \
                else global_mag
            spots = detect_weak_spots(demo_arc, fps=1.0)
            write_demo_json(args.out, vid, demo_arc, spots,
                            feature_name=args.demo_feature)
            _mark_done(ckpt, vid)
            with open(progress, "a") as f:
                f.write(f"{datetime.now().isoformat()} [{i+1}/{len(videos)}] {vid} ok\n")
            print(f"    ok: T={T}s  weak_spots={len(spots)}")
        except MemoryError:
            raise
        except OSError as e:
            if e.errno == errno.ENOSPC:
                raise
            _log_clip_error(err_log, vid, e)
        except Exception as e:  # noqa: BLE001 - one bad clip must not kill the batch
            _log_clip_error(err_log, vid, e)

    print("\n[done] arcs cached. Next: tvsum_prep.py (human arcs) then "
          "honest_corr_timeseries.py.")


if __name__ == "__main__":
    main()
