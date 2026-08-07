#!/usr/bin/env python3
"""
ad_head.py — a TRAINED read-out from frozen TRIBE v2 activations to real ad performance.

WHAT THIS IS
    demo/process_batch.py emits a FROZEN, hand-weighted, batch-relative score
    (0.40*Hook + 0.35*Processing + 0.25*Clarity, each a percentile within one 5-ad
    batch). Those weights were committed before any outcome data was seen and have never
    been fit against a real performance number. It ranks; it does not predict.

    This script replaces the guessed weights with LEARNED ones: a small ridge read-out on
    top of frozen TRIBE v2 features, trained against real ad outcomes. Meta's encoder
    stays frozen — the read-out is ours.

STANDALONE ON PURPOSE
    Every helper is rewritten in this file; it imports nothing from the rest of the repo.
    Sources of the inlined arithmetic (copy, do not re-derive):
      demo/process_batch.py   probe_video, build_stimulus, tail_pad_for, sha1_file,
                              fingerprint, load_parcel_names, mask_for, window_masks,
                              preds_stats, per_run_zscore_test, timepoint_onsets
      batch_extract.py        build_events (av branch), describe_preds
      baseline_extract.py     audio_loudness_per_sec, video_features_per_sec, 0..1 norm
      train_head.py           ridge_fit, ALPHAS
      honest_corr_timeseries  _rankdata, pearson, spearman, resample_to_grid
      incremental_validity.py _residualize, partial_spearman

TWO CORPUS FACTS THAT DRIVE THE DESIGN (measured, not assumed)
    1. rho(ad age, days_running) = +0.54, and log(age) alone explains 29% of the variance
       in log1p(days_running). Stop dates pile up at the collection date. The strongest
       "predictor" of the meta label is the CALENDAR, and it is an artifact. So log_age is
       both a model covariate (the neural weights cannot absorb it) and a partialled-out
       control (the headline metric cannot credit it).
    2. 82% of the variance in log1p(days) is BETWEEN advertiser, only 18% within. So
       advertiser is a CV grouping key and NEVER a feature.

WHY NO LSTM
    The target is one number per ad, so the independent unit is the ad: 40 timepoints x
    620 ads is 620 samples with a 40-point covariate, not 24,800 samples. Frame-to-frame
    dependence is handled by feature engineering that stays linear in the parameters — a
    duration-invariant shape basis plus a one-parameter leaky integrator (h[t] = lam*h[t-1]
    + (1-lam)*x[t], which is what an LSTM is before the gates). At n=619 the detectable
    effect floor is |r| ~ 0.13 while the ffmpeg comparator sits at 0.115, so a recurrent
    net could not be SHOWN to have helped even if it did.

USAGE
    python ad_head.py features --video ads/meta_00.mp4
    python ad_head.py train    --corpus ~/Downloads/soma-corpus-meta --target meta
    python ad_head.py predict  --video new_ad.mp4 --model data/ad_head/ad_head_meta.json

    Probes (no GPU, no weights, no network beyond the atlas download):
    python ad_head.py list-tags
    python ad_head.py features --video X.mp4 --probe-stimulus
    python ad_head.py features --video X.mp4 --fake-preds     # synthetic, for tests

Research / non-commercial use only (TRIBE v2 weights are CC BY-NC 4.0).
"""
import argparse
import csv
import datetime as dt
import glob
import hashlib
import json
import math
import os
import re
import subprocess
import sys

import numpy as np

# ---- STIMULUS CONSTANTS — must match demo/process_batch.py exactly ---------------
# Training features and inference features have to come from the SAME padded stimulus,
# so these are copied verbatim rather than re-chosen. Changing any of them changes the
# feature definition; the cache fingerprint covers them so a change invalidates rather
# than silently serving stale preds.
LEAD_PAD_S = 5.0             # black/silence before content
TAIL_PAD_S = 8.0             # black/silence after content
BASELINE_LEAD_SKIP_S = 1.0   # drop the first second of the lead pad (onset transient)
BASELINE_TAIL_SKIP_S = 3.0   # drop 3 s after content ends (residual smear guard)
BASELINE_TAIL_SPAN_S = TAIL_PAD_S - BASELINE_TAIL_SKIP_S   # 5.0, BOUNDED
HOOK_WINDOW_S = 3.0          # first 3 s of the ad = the hook, in ABSOLUTE seconds
AUDIO_RATE = 48000
TR_SECONDS = 1.0             # TRIBE v2 emits ~1 timepoint / second
DEFAULT_MIN_STIMULUS_S = 35.0
HF_MODEL = "facebook/tribev2"
N_VERTICES = 20484
SCHEMA_VERSION = "adhead-1.0"

# ---- FEATURE CONSTANTS ----------------------------------------------------------
# The 7 Yeo networks, as they are spelled in the Schaefer-400/7Networks parcel labels.
YEO_TAGS = ("Vis", "SomMot", "DorsAttn", "SalVentAttn", "Limbic", "Cont", "Default")
N_BASIS_BINS = 16            # normalized-time grid for the shape basis
LAMBDAS = (0.0, 0.5, 0.8, 0.95)              # leaky-integrator grid, chosen in-fold
ALPHAS = (0.1, 1.0, 10.0, 100.0, 1000.0)     # ridge grid (train_head.py:55)
CONTROL_FEATURES = ("loudness", "cuts", "luminance", "motion")
BLOCK_ORDER = ("mean", "shape", "leaky")     # cumulative ladder
NAN_DROP_FRAC = 0.05         # drop a feature NaN in more than this fraction of ads

# ---- HONESTY CONSTANTS ----------------------------------------------------------
# The datasheet's power statement: at n=1359 a test at conventional power detects
# |r| >= 0.09. Scale by 1/sqrt(n) for a smaller half, and never go below the repo-wide
# MIN_EFFECT_R of 0.10 (honest_corr_timeseries.py:78).
CORPUS_N_REF, CORPUS_R_REF, MIN_EFFECT_R = 1359.0, 0.09, 0.10

_CBIG = ("https://raw.githubusercontent.com/ThomasYeoLab/CBIG/master/"
         "stable_projects/brain_parcellation/Schaefer2018_LocalGlobal/"
         "Parcellations/FreeSurfer5.3/fsaverage5/label")
ANNOT = {h: f"{_CBIG}/{h}.Schaefer2018_400Parcels_7Networks_order.annot"
         for h in ("lh", "rh")}

_MONTHS = {m: i + 1 for i, m in enumerate(
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}


# ================================================================================
# inlined: video probing + stimulus construction   (demo/process_batch.py:310-423)
# ================================================================================
def probe_video(video_path):
    """width, height, fps, duration, has_audio via ffprobe."""
    cmd = ["ffprobe", "-v", "error", "-print_format", "json",
           "-show_streams", "-show_format", str(video_path)]
    try:
        out = subprocess.run(cmd, capture_output=True, check=True, text=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        sys.exit(f"ffprobe failed on {video_path}: {e}")
    info = json.loads(out)
    spec = {"width": 0, "height": 0, "fps": 30.0, "duration": 0.0, "has_audio": False}
    for s in info.get("streams", []):
        if s.get("codec_type") == "video" and not spec["width"]:
            spec["width"] = int(s.get("width") or 0)
            spec["height"] = int(s.get("height") or 0)
            num, _, den = (s.get("r_frame_rate") or "30/1").partition("/")
            try:
                fps = float(num) / float(den or 1)
                spec["fps"] = round(fps, 3) if 1 <= fps <= 120 else 30.0
            except (ValueError, ZeroDivisionError):
                spec["fps"] = 30.0
        elif s.get("codec_type") == "audio":
            spec["has_audio"] = True
    try:
        spec["duration"] = float(info.get("format", {}).get("duration", 0.0))
    except (TypeError, ValueError):
        spec["duration"] = 0.0
    spec["width"] = max(2, spec["width"] - (spec["width"] % 2))   # ffmpeg needs even dims
    spec["height"] = max(2, spec["height"] - (spec["height"] % 2))
    return spec


def tail_pad_for(content_dur, min_stimulus_s):
    """Extend the TAIL so the stimulus clears `min_stimulus_s`.

    build_events chunks with ChunkEvents(min_duration=30). Whether that merely prevents
    splitting off a short remainder or FILTERS OUT sub-30 s spans (empty dataframe, dead
    run) is not determinable without running neuralset, so pad past the threshold. Only
    the tail grows, and BASELINE_TAIL_SPAN_S bounds the baseline window, so the extra
    timepoints are never used and the contrast is numerically unchanged.
    """
    return max(TAIL_PAD_S, min_stimulus_s - LEAD_PAD_S - content_dur)


def build_stimulus(video_path, output_path, spec, tail_pad, baseline_audio="silence"):
    """LEAD_PAD_S black/silence + the whole ad + tail_pad black/silence."""
    output_path = str(output_path)
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    content_dur = float(spec["duration"])
    w, h, fps = spec["width"], spec["height"], spec["fps"]
    vpad = f"color=c=black:s={w}x{h}:r={fps}"
    if baseline_audio == "dither":
        # Digital silence is a zero-variance window. If the audio front-end does
        # per-utterance mean/var normalization that is a 0/0 -> NaN waiting to happen.
        # Inaudible (below the 16-bit LSB at normal levels) but non-degenerate.
        apad = "anoisesrc=amplitude=0.0002:color=white:sample_rate=%d" % AUDIO_RATE
    else:
        apad = f"anullsrc=channel_layout=stereo:sample_rate={AUDIO_RATE}"
    afmt = f"aformat=sample_fmts=fltp:sample_rates={AUDIO_RATE}:channel_layouts=stereo"

    cmd = ["ffmpeg", "-y", "-v", "error",
           "-i", str(video_path),
           "-f", "lavfi", "-t", f"{LEAD_PAD_S}", "-i", vpad,     # 1 lead video
           "-f", "lavfi", "-t", f"{LEAD_PAD_S}", "-i", apad,     # 2 lead audio
           "-f", "lavfi", "-t", f"{tail_pad}", "-i", vpad,       # 3 tail video
           "-f", "lavfi", "-t", f"{tail_pad}", "-i", apad]       # 4 tail audio
    if not spec["has_audio"]:
        cmd += ["-f", "lavfi", "-t", f"{content_dur}", "-i", apad]   # 5 silent content
    audio_src = ("[5:a]" + afmt if not spec["has_audio"]
                 else f"[0:a]asetpts=PTS-STARTPTS,{afmt}")
    graph = (
        f"[0:v]setpts=PTS-STARTPTS,fps={fps},scale={w}:{h},setsar=1,format=yuv420p[vc];"
        f"{audio_src}[ac];"
        f"[1:v]fps={fps},scale={w}:{h},setsar=1,format=yuv420p[vl];"
        f"[2:a]{afmt}[al];"
        f"[3:v]fps={fps},scale={w}:{h},setsar=1,format=yuv420p[vt];"
        f"[4:a]{afmt}[at];"
        f"[vl][al][vc][ac][vt][at]concat=n=3:v=1:a=1[v][a]"
    )
    cmd += ["-filter_complex", graph, "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", str(AUDIO_RATE), "-ac", "2",
            "-movflags", "+faststart", output_path]
    try:
        subprocess.run(cmd, capture_output=True, check=True, text=True)
    except subprocess.CalledProcessError as e:
        if os.path.exists(output_path):
            os.unlink(output_path)
        sys.exit(f"ffmpeg failed building the stimulus for {video_path}:\n{e.stderr}")
    except FileNotFoundError:
        sys.exit("ffmpeg not found on PATH — required to build padded stimuli.")
    return output_path


def sha1_file(path, chunk=1 << 20):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def fingerprint(stimulus_path, tail_pad, baseline_audio, modality):
    """Cache key that actually covers the inputs.

    preflight.py keys its preds cache on the filename alone — no dependence on the padding
    constants or the stimulus bytes. Change a pad constant, re-run, and it silently reuses
    predictions for a stimulus that no longer exists. That is the worst kind of stale
    result, because the numbers still look plausible.
    """
    parts = [sha1_file(stimulus_path), f"{LEAD_PAD_S}", f"{tail_pad}",
             baseline_audio, modality, SCHEMA_VERSION]
    return hashlib.sha1("|".join(parts).encode()).hexdigest()


# ================================================================================
# inlined: Schaefer atlas -> Yeo-7 masks   (demo/process_batch.py:638-681)
# ================================================================================
def load_parcel_names(cache_dir):
    """Length-20484 array of Schaefer parcel names, one per fsaverage5 vertex."""
    try:
        import nibabel as nib
    except ImportError as e:
        sys.exit(f"nibabel is required to read the Schaefer .annot files: {e}\n"
                 "  pip install nibabel\n"
                 "(nilearn's Destrieux atlas is anatomical — it cannot express the Yeo-7 "
                 "network tags DorsAttn / SalVentAttn / Cont that these features use.)")
    d = os.path.join(cache_dir, "atlas")
    os.makedirs(d, exist_ok=True)
    out = []
    for hemi in ("lh", "rh"):
        path = os.path.join(d, os.path.basename(ANNOT[hemi]))
        if not os.path.exists(path):
            import urllib.request
            print(f"  downloading {os.path.basename(path)} ...")
            urllib.request.urlretrieve(ANNOT[hemi], path)
        vert_labels, _, names = nib.freesurfer.read_annot(path)
        parcel = [n.decode() if isinstance(n, bytes) else n for n in names]
        out.extend(parcel[v] for v in vert_labels)   # label 0 = medial wall
    return np.array(out)


def mask_for(parcel_names, tag, quiet=False):
    """Boolean vertex mask for one Yeo network tag."""
    strs = parcel_names.astype(str)
    mask = np.char.find(strs, f"_{tag}_") >= 0
    if not mask.any():
        sys.exit(f"ROI '{tag}' is empty: no parcel matched. Run `list-tags` to see the "
                 "available label spellings.")
    if not quiet:
        print(f"  ROI {tag:<14} {int(mask.sum()):>6} vertices")
    return mask


def build_masks(cache_dir, quiet=False):
    """[(tag, mask)] for the 7 Yeo networks, plus a sha1 over the packed bits.

    The sha1 travels inside model.json and is re-verified at predict time, so the feature
    definition cannot drift between fit and apply.
    """
    names = load_parcel_names(cache_dir)
    if names.shape[0] != N_VERTICES:
        sys.exit(f"atlas has {names.shape[0]} vertices, expected {N_VERTICES}. "
                 "Revisit the fsaverage5 [LH; RH] vertex-order assumption.")
    masks, sha = [], {}
    for tag in YEO_TAGS:
        m = mask_for(names, tag, quiet=quiet)
        masks.append((tag, m))
        sha[tag] = hashlib.sha1(np.packbits(m).tobytes()).hexdigest()
    return masks, sha


def list_tags(cache_dir):
    """Print every network/subnetwork tag the atlas actually spells."""
    names = load_parcel_names(cache_dir)
    tags = set()
    for name in set(names.astype(str).tolist()):
        parts = name.split("_")
        if len(parts) >= 4:                     # 7Networks_LH_<Net>_<Sub>_<idx>
            tags.add("_".join(parts[2:-1]))
            tags.add(parts[2])
    for t in sorted(tags):
        print(t)


# ================================================================================
# inlined: the TRIBE path   (batch_extract.py build_events, av branch only)
# ================================================================================
def build_events(video_path):
    """The events df for one clip, audio+video branch.

    Mirrors tribev2.demo_utils.get_audio_and_text_events(audio_only=True) — the model
    authors' reference build. Pinned here so a neuralset/tribev2 bump cannot silently
    change the event schema. The trimodal/text branch is deliberately NOT ported: it
    needs gated meta-llama/Llama-3.2-3B plus `uvx whisperx`.
    """
    import pandas as pd
    from neuralset.events.utils import standardize_events
    from neuralset.events.transforms import ExtractAudioFromVideo, ChunkEvents

    transforms = [
        ExtractAudioFromVideo(),
        ChunkEvents(event_type_to_chunk="Audio", max_duration=60, min_duration=30),
        ChunkEvents(event_type_to_chunk="Video", max_duration=60, min_duration=30),
    ]
    initial = {"type": "Video", "filepath": str(video_path), "start": 0,
               "timeline": "default", "subject": "default"}
    df = standardize_events(pd.DataFrame([initial]))
    for t in transforms:
        df = t(df)
    return standardize_events(df)


def load_tribe_model(hf_cache, modality="av"):
    try:
        from tribev2.demo_utils import TribeModel
    except ImportError as e:
        sys.exit(
            f"Cannot import tribev2.demo_utils: {e}\n\n"
            "This is the GPU-inference stack and it is not pinned in any tracked file —\n"
            "reproduce it from the box it lives on:\n"
            "  pip install 'numpy>=1.26,<2.1'   # HARD pin; >=2.1 segfaults neuralset\n"
            "  pip install torch --index-url <matching the box's CUDA>\n"
            "  pip install neuralset tribev2 huggingface_hub transformers nibabel\n"
            "  huggingface-cli login            # facebook/tribev2 weights are gated\n\n"
            "Everything downstream of preds runs on numpy alone: point --preds-dir at a\n"
            "directory of preds_<ad_id>.npy and this script never loads the model."
        )
    features = {"av": ["audio", "video"], "video": ["video"]}[modality]
    print(f"Loading TRIBE v2 ({HF_MODEL}, features={features}) ...")
    return TribeModel.from_pretrained(
        HF_MODEL, cache_folder=hf_cache,
        config_update={"data": {"features_to_use": features}},
    )


def timepoint_onsets(preds, segments):
    """Stimulus-time onset (s) per prediction row, from `segments` when usable.

    TRIBE already compensates the ~5 s hemodynamic lag internally — never shift again.
    Falls back to the documented 1 Hz grid, and SAYS SO rather than guessing silently.
    """
    n = preds.shape[0]
    for name in ("onset", "start", "start_time", "time", "t"):
        vals = _segment_column(segments, name)
        if vals is not None and len(vals) == n:
            arr = np.asarray(vals, dtype=float)
            if np.all(np.isfinite(arr)):
                return arr, f"segments['{name}']"
    if segments is not None:
        try:
            arr = np.asarray(segments, dtype=float).squeeze()
            if arr.ndim == 1 and arr.shape[0] == n and np.all(np.isfinite(arr)):
                return arr, "segments (1-D numeric)"
            if arr.ndim == 2 and arr.shape[0] == n and np.all(np.isfinite(arr[:, 0])):
                return arr[:, 0], "segments[:, 0]"
        except (TypeError, ValueError):
            pass
    return np.arange(n, dtype=float) * TR_SECONDS, f"assumed {1 / TR_SECONDS:g} Hz grid"


def _segment_column(segments, name):
    if segments is None:
        return None
    try:                                    # pandas DataFrame
        if hasattr(segments, "columns") and name in segments.columns:
            return segments[name].to_numpy()
    except Exception:                       # noqa: BLE001
        pass
    if isinstance(segments, dict) and name in segments:
        return segments[name]
    try:                                    # structured / record array
        if getattr(segments, "dtype", None) is not None and segments.dtype.names \
                and name in segments.dtype.names:
            return segments[name]
    except Exception:                       # noqa: BLE001
        pass
    if isinstance(segments, (list, tuple)) and segments and isinstance(segments[0], dict) \
            and name in segments[0]:
        return [s.get(name) for s in segments]
    return None


# ================================================================================
# inlined: honesty checks   (A1 / A2 / A4)
# ================================================================================
def preds_stats(preds):
    """A1 — catches preds bounded [0,1] instead of signed z-scored BOLD."""
    p = np.asarray(preds, float)
    pct = np.percentile(p, [1, 50, 90, 99])
    return {
        "shape": list(p.shape),
        "min": round(float(p.min()), 4), "max": round(float(p.max()), 4),
        "mean": round(float(p.mean()), 5), "std": round(float(p.std()), 5),
        "pct": [round(float(v), 4) for v in pct],
        "fracLtZero": round(float(np.mean(p < 0)), 4),
        "looksBounded01": bool(p.min() >= 0 and p.max() <= 1),
    }


def per_run_zscore_test(preds):
    """A2 — decisive. If TRIBE z-scores per inference run then, per vertex over time, the
    mean is ~0 and the SD is ~1. If that holds, different ads' activation LEVELS are not
    on one ruler and only within-ad shape is comparable — which would invalidate the
    raw-scale cross-sectional features this script is built on."""
    p = np.asarray(preds, float)
    vm, vs = p.mean(axis=0), p.std(axis=0)
    mean_abs_max = float(np.abs(vm).max())
    std_median = float(np.median(vs))
    std_spread = float(vs.std())
    per_run = mean_abs_max < 1e-3 and abs(std_median - 1.0) < 1e-2 and std_spread < 1e-2
    return {
        "vertexMeanAbsMax": round(mean_abs_max, 6),
        "vertexStdMedian": round(std_median, 6),
        "vertexStdSpread": round(std_spread, 6),
        "verdict": "per_run_zscore_likely" if per_run else "fixed_stats_likely",
    }


def describe_preds(preds, tag=""):
    """Print the distribution so the z-scored/signed scale is confirmed, not assumed."""
    p = np.asarray(preds, float)
    pct = np.percentile(p, [1, 50, 90, 99])
    print(f"  [preds {tag}] shape={p.shape} min={p.min():.3f} max={p.max():.3f} "
          f"mean={p.mean():.3f} std={p.std():.3f}")
    print(f"           pct(1/50/90/99)={pct[0]:.3f}/{pct[1]:.3f}/{pct[2]:.3f}/{pct[3]:.3f}"
          f"  frac<0={np.mean(p < 0):.2%}")
    if p.min() >= 0 and p.max() <= 1:
        print("           WARNING: values look bounded [0,1] — verify this really is "
              "z-scored BOLD, not a probability.")


def window_masks(onsets, content_start, content_end):
    """(content, baseline) boolean masks over timepoints.

    Baseline = lead pad after a 1 s settling skip, plus a BOUNDED 5 s slice of the tail
    after a 3 s smear skip. Bounding matters because tail_pad_for extends the tail on
    every short stimulus; an unbounded tail window would silently change the contrast.
    """
    t = np.asarray(onsets, float)
    content = (t >= content_start) & (t < content_end)
    lead = (t >= BASELINE_LEAD_SKIP_S) & (t < content_start)
    tail = ((t >= content_end + BASELINE_TAIL_SKIP_S)
            & (t < content_end + BASELINE_TAIL_SKIP_S + BASELINE_TAIL_SPAN_S))
    return content, (lead | tail)


# ================================================================================
# inlined: the dumb ffmpeg control features   (baseline_extract.py:42-123)
# ================================================================================
# THE FEATURE MATH BELOW IS UNCHANGED ON PURPOSE. The corpus bundle ships 1359 baseline
# CSVs computed with it; altering the 160x90 resize, the >40 cut threshold or the 0..1
# norm would silently make newly-computed rows incomparable to those.
def _ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:                       # noqa: BLE001
        return "ffmpeg"


def audio_loudness_per_sec(video_path, sr=16000):
    """Mono PCM via ffmpeg -> RMS loudness per second."""
    cmd = [_ffmpeg_exe(), "-v", "error", "-i", str(video_path), "-ac", "1",
           "-ar", str(sr), "-f", "s16le", "-"]
    try:
        raw = subprocess.run(cmd, capture_output=True).stdout
    except Exception:                       # noqa: BLE001
        return None
    if not raw:
        return None
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    n_sec = max(1, len(x) // sr)
    x = x[: n_sec * sr].reshape(n_sec, sr)
    return np.sqrt((x ** 2).mean(axis=1) + 1e-9)


def video_features_per_sec(video_path):
    """cuts, luminance, motion per second via OpenCV."""
    try:
        import cv2
    except ImportError as e:
        sys.exit(f"opencv is required to compute control features: {e}\n"
                 "  pip install opencv-python-headless imageio-ffmpeg\n"
                 "(or pass --baseline-dir at a directory of baseline_<id>.csv, which the "
                 "corpus bundle already ships for all 1359 ads.)")
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    lum, cut, mot = {}, {}, {}
    prev, idx = None, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        sec = int(idx / fps)
        g = cv2.cvtColor(cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        lum.setdefault(sec, []).append(g.mean() / 255.0)
        if prev is not None:
            d = np.abs(g - prev)
            mot.setdefault(sec, []).append(d.mean() / 255.0)
            cut.setdefault(sec, []).append((d > 40).mean())   # fraction of changed px
        prev = g
        idx += 1
    cap.release()
    if not lum:
        return None
    n = max(lum) + 1
    agg = lambda d: np.array([np.mean(d.get(s, [0.0])) for s in range(n)])   # noqa: E731
    return agg(lum), agg(cut), agg(mot)


def control_series(video_path, baseline_dir=None, ad_id=None):
    """{feature: per-second 0..1 series}. Reads the corpus CSV when there is one."""
    if baseline_dir and ad_id:
        path = os.path.join(baseline_dir, f"baseline_{ad_id}.csv")
        if os.path.exists(path):
            cols = {f: [] for f in CONTROL_FEATURES}
            with open(path) as fh:
                for row in csv.DictReader(fh):
                    for f in CONTROL_FEATURES:
                        cols[f].append(float(row[f]))
            return {f: np.asarray(v, float) for f, v in cols.items()}, "csv"
    vf = video_features_per_sec(video_path)
    if vf is None:
        return None, "unreadable"
    lum, cut, mot = vf
    loud = audio_loudness_per_sec(video_path)
    n = len(lum)
    # A silent video is NOT a quiet one. Zeroing gives a constant column, which after
    # residualizing carries no information while still looking like a covariate.
    silent = loud is None or len(loud) == 0
    if silent:
        loud = np.zeros(n)
    if len(loud) != n:
        loud = np.interp(np.arange(n), np.linspace(0, n - 1, len(loud)), loud)
    # numpy 2.x: arr.ptp() is gone, only np.ptp(arr) works.
    norm = lambda a: (a - a.min()) / (np.ptp(a) + 1e-9)     # noqa: E731
    return ({"loudness": norm(loud), "cuts": norm(cut),
             "luminance": norm(lum), "motion": norm(mot)},
            "silent" if silent else "computed")


def control_summaries(series):
    """Per-ad numbers from the per-second control series: mean and late-minus-early trend.

    The corpus CSVs are min-max normalized PER VIDEO, so cross-ad level information is
    already gone and only shape survives — which is why `trend` carries the weight here.
    loudness_trend is precisely the meta result this model has to beat (rho = -0.115,
    p = 0.002, survives Bonferroni and duration-partialling).
    """
    out = {}
    for f in CONTROL_FEATURES:
        v = np.asarray(series[f], float) if series else np.array([])
        if v.size < 4 or not np.all(np.isfinite(v)):
            out[f"{f}_mean"] = float("nan")
            out[f"{f}_trend"] = float("nan")
            continue
        h = len(v) // 2
        out[f"{f}_mean"] = float(v.mean())
        out[f"{f}_trend"] = float(v[h:].mean() - v[:h].mean())
    return out


CONTROL_SUMMARY_NAMES = tuple(f"{f}_{s}" for f in CONTROL_FEATURES
                              for s in ("mean", "trend"))


# ================================================================================
# inlined: stats   (honest_corr_timeseries.py, incremental_validity.py, train_head.py)
# ================================================================================
def _rankdata(a):
    """Average ranks, ties handled (matches scipy.stats.rankdata 'average')."""
    a = np.asarray(a, float)
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(len(a), float)
    sa = a[order]
    i, n = 0, len(a)
    while i < n:
        j = i
        while j + 1 < n and sa[j + 1] == sa[i]:
            j += 1
        ranks[order[i:j + 1]] = 0.5 * (i + j) + 1.0     # 1-based average rank
        i = j + 1
    return ranks


def pearson(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    # Tolerance, not == 0: a residualized constant keeps ~1e-16 of rounding noise, sails
    # past an exact check, and corrcoef manufactures a plausible r out of that noise.
    if len(x) < 3 or x.std() <= 1e-10 or y.std() <= 1e-10:
        return float("nan")
    return float(np.corrcoef(x, y)[0, 1])


def spearman(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    if len(x) < 3:
        return float("nan")
    return pearson(_rankdata(x), _rankdata(y))


def _residualize(y, Z):
    """Residuals of y after regressing out the columns of Z (+ intercept)."""
    Z1 = np.column_stack([np.ones(len(y)), Z]) if Z.size else np.ones((len(y), 1))
    beta, *_ = np.linalg.lstsq(Z1, y, rcond=None)
    return y - Z1 @ beta


def partial_spearman(x, y, Z):
    """Rank-based partial correlation of x, y controlling for the columns of Z."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    Z = np.asarray(Z, float)
    if Z.size:
        Zr = np.column_stack([_rankdata(Z[:, j]) for j in range(Z.shape[1])])
    else:
        Zr = np.zeros((len(x), 0))
    return pearson(_residualize(_rankdata(x), Zr), _residualize(_rankdata(y), Zr))


def label_perm_p(x, y, Z, n_perm=5000, seed=0):
    """Permutation p for the partial correlation. Ads are independent samples, so a plain
    label shuffle is the right null here — unlike the within-video timeseries case, which
    needs circular shifts to respect autocorrelation. Honest floor = 1/(n_perm+1)."""
    r_obs = partial_spearman(x, y, Z)
    if not np.isfinite(r_obs):
        return float("nan"), r_obs
    rng = np.random.default_rng(seed)
    hits = 0
    for _ in range(n_perm):
        r = partial_spearman(x, rng.permutation(y), Z)
        if np.isfinite(r) and abs(r) >= abs(r_obs):
            hits += 1
    return (hits + 1) / (n_perm + 1), r_obs


def ridge_fit(X, y, alpha):
    """Closed-form ridge on mean-centred columns (train_head.py:154)."""
    Xm, ym = X.mean(0), y.mean()
    Xc, yc = X - Xm, y - ym
    A = Xc.T @ Xc + alpha * np.eye(Xc.shape[1])
    w = np.linalg.solve(A, Xc.T @ yc)
    return w, float(ym - Xm @ w)


def resample_to_grid(t_src, v_src, t_edges):
    """Average v_src (sampled at t_src) into the bins defined by t_edges. NaN if empty."""
    t_src, v_src = np.asarray(t_src, float), np.asarray(v_src, float)
    out = np.full(len(t_edges) - 1, np.nan)
    idx = np.digitize(t_src, t_edges) - 1
    for b in range(len(t_edges) - 1):
        m = idx == b
        if m.any():
            out[b] = np.nanmean(v_src[m])
    return out


def effect_floor(n):
    """The datasheet's power statement, scaled: |r| below this is 'could not tell'."""
    if n <= 0:
        return float("inf")
    return max(MIN_EFFECT_R, CORPUS_R_REF * math.sqrt(CORPUS_N_REF / float(n)))


# ================================================================================
# preds -> 14 lanes
# ================================================================================
def lane_names():
    return [f"{tag}|{kind}" for tag in YEO_TAGS for kind in ("mag", "sgn")]


def preds_to_lanes(preds, onsets, content_start, content_end, masks):
    """(T, 20484) -> per-second lanes over the CONTENT window only, baseline-subtracted.

    Two lanes per network: mean|preds| (the arc convention) and mean signed preds (the
    direction the |.| throws away). Each is expressed relative to the SAME ROI averaged
    over the black-screen padding, so zero means "no different from the model's response
    to a black screen" — which is what puts different ads on one ruler.
    """
    content, baseline = window_masks(onsets, content_start, content_end)
    if content.sum() == 0 or baseline.sum() == 0:
        raise ValueError(f"empty window (content={int(content.sum())} tp, "
                         f"baseline={int(baseline.sum())} tp) — the stimulus padding or "
                         "the segment alignment is wrong; no feature built on this is "
                         "trustworthy.")
    absp = np.abs(preds)
    lanes, base_scalars, base_sds = {}, {}, {}
    for tag, m in masks:
        for kind, src in (("mag", absp), ("sgn", preds)):
            name = f"{tag}|{kind}"
            base_tp = src[baseline][:, m].mean(axis=1)
            b_scalar = float(base_tp.mean())
            lanes[name] = (src[content][:, m].mean(axis=1) - b_scalar)
            base_scalars[name] = b_scalar
            base_sds[name] = float(base_tp.std(ddof=0))
    times = np.asarray(onsets, float)[content] - content_start
    return lanes, times, base_scalars, base_sds


# ================================================================================
# lanes -> the feature row
# ================================================================================
def _legendre_basis(n_bins=N_BASIS_BINS):
    """P1..P3 on a normalized-time grid. P0 is omitted on purpose: it is the content
    mean, which the `mean` block already carries, and including both makes the design
    matrix needlessly collinear."""
    x = np.linspace(-1.0, 1.0, n_bins)
    return np.column_stack([x, (3 * x ** 2 - 1) / 2.0, (5 * x ** 3 - 3 * x) / 2.0])


_LEGENDRE = _legendre_basis()


def _to_normalized_grid(series, n_bins=N_BASIS_BINS):
    """Put a content series on a fixed n_bins normalized-time grid.

    Short-ad rule: bin-averaging a 12-point series into 16 bins leaves NaN gaps (meta's
    p10 duration is 12.5 s), so below n_bins we interpolate instead. Above it we
    bin-average, which is the lossless-in-expectation choice.
    """
    s = np.asarray(series, float)
    if s.size == 0:
        return np.full(n_bins, np.nan)
    if s.size == 1:
        return np.full(n_bins, s[0])
    if s.size >= n_bins:
        edges = np.linspace(0.0, float(s.size), n_bins + 1)
        return resample_to_grid(np.arange(s.size, dtype=float) + 0.5, s, edges)
    src = np.linspace(0.0, 1.0, s.size)
    return np.interp(np.linspace(0.0, 1.0, n_bins), src, s)


def _lag1_autocorr(series):
    s = np.asarray(series, float)
    if s.size < 3:
        return float("nan")
    a, b = s[:-1], s[1:]
    if a.std() <= 1e-10 or b.std() <= 1e-10:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def _leaky(series, lam):
    """h[t] = lam*h[t-1] + (1-lam)*x[t]. One recurrence, one parameter — the linear core
    of what an LSTM does before the gates. lam=0 is plain pooling; lam=0.95 is long
    memory. The grid is searched INSIDE the CV fold, so the data picks the time constant.
    """
    s = np.asarray(series, float)
    if s.size == 0:
        return float("nan")
    if lam <= 0:
        return float(np.nanmean(s))
    h, out = 0.0, []
    for v in s:
        if not np.isfinite(v):
            continue
        h = lam * h + (1.0 - lam) * v
        out.append(h)
    return float(np.mean(out)) if out else float("nan")


def feature_row(lanes, times, covariates, blocks, lam, has_age):
    """One ad's lanes + covariates -> (values, names).

    `blocks` is a cumulative prefix of BLOCK_ORDER. Everything here is pure arithmetic on
    the stored lanes, so the whole ladder (and the lambda grid) can be re-run on a laptop
    without touching the GPU.
    """
    vals, names = [], []
    t = np.asarray(times, float)
    for name in (lane_names() if blocks else ()):
        s = np.asarray(lanes[name], float)
        if "mean" in blocks:
            vals.append(float(np.nanmean(s)) if s.size else float("nan"))
            names.append(f"{name}.mean")
            hook = s[t < HOOK_WINDOW_S]
            vals.append(float(np.nanmean(hook)) if hook.size else float("nan"))
            names.append(f"{name}.hook")
        if "shape" in blocks:
            g = _to_normalized_grid(s)
            good = np.isfinite(g)
            gc = g - np.nanmean(g) if good.any() else g
            for k in range(_LEGENDRE.shape[1]):
                b = _LEGENDRE[:, k]
                if good.sum() >= 4:
                    vals.append(float((b[good] @ gc[good]) / (b[good] @ b[good])))
                else:
                    vals.append(float("nan"))
                names.append(f"{name}.L{k + 1}")
        if "leaky" in blocks:
            vals.append(_lag1_autocorr(s))
            names.append(f"{name}.ac1")
            vals.append(_leaky(s, lam))
            names.append(f"{name}.leak")
    # covariate block — always on, never gated
    vals.append(float(covariates.get("duration_s", float("nan"))))
    names.append("cov.duration_s")
    vals.append(float(covariates.get("n_sec", float("nan"))))
    names.append("cov.n_sec")
    if has_age:
        vals.append(float(covariates.get("log_age", float("nan"))))
        names.append("cov.log_age")
    for k in CONTROL_SUMMARY_NAMES:
        vals.append(float(covariates.get(k, float("nan"))))
        names.append(f"cov.{k}")
    return np.asarray(vals, float), names


def covariate_indices(names):
    return [i for i, n in enumerate(names) if n.startswith("cov.")]


# ================================================================================
# feature extraction for one ad
# ================================================================================
def _fake_latent(ad_id):
    """Deterministic per-ad latent in [0,1] for --fake-preds. Exposed so a test can
    generate labels from the SAME latent the synthetic preds were built from."""
    h = hashlib.sha1(f"adhead-fake|{ad_id}".encode()).digest()
    return int.from_bytes(h[:4], "big") / float(2 ** 32)


def fake_preds(ad_id, n_content, masks):
    """Synthetic (T, 20484) preds with a signal planted in DorsAttn|mag.

    Machine-honesty fixture only: it proves the pooling, the feature blocks, the CV and
    the leakage control all work end to end without a GPU, weights, or a network call.
    It proves NOTHING about whether the encoder predicts ad performance.
    """
    lam = _fake_latent(ad_id)
    n_lead = int(round(LEAD_PAD_S / TR_SECONDS))
    n_tail = int(round(TAIL_PAD_S / TR_SECONDS))
    T = n_lead + n_content + n_tail
    rng = np.random.default_rng(abs(hash(ad_id)) % (2 ** 31))
    preds = rng.normal(0.0, 0.25, size=(T, N_VERTICES)).astype(np.float32)
    dors = dict(masks)["DorsAttn"]
    # content-window boost proportional to the latent, decaying over the ad
    ramp = np.linspace(1.0, 0.4, n_content)
    for i in range(n_content):
        preds[n_lead + i, dors] += 0.8 * lam * ramp[i]
    vis = dict(masks)["Vis"]
    preds[n_lead:n_lead + n_content, vis] += 0.5     # A4: content must drive occipital
    return preds


def get_preds(video_path, ad_id, spec, args, masks):
    """(preds, onsets, timing_source, provenance). Never runs TRIBE if a cache hits."""
    tail_pad = tail_pad_for(spec["duration"], args.min_stimulus_s)

    if args.fake_preds:
        n_content = max(1, int(round(spec["duration"] / TR_SECONDS)))
        preds = fake_preds(ad_id, n_content, masks)
        onsets = np.arange(preds.shape[0], dtype=float) * TR_SECONDS
        return preds, onsets, "assumed 1 Hz grid", "fake", tail_pad

    # 1. an externally-produced preds_<ad_id>.npy (batch_extract.py's output shape)
    if args.preds_dir:
        ext = os.path.join(args.preds_dir, f"preds_{ad_id}.npy")
        if os.path.exists(ext):
            preds = np.load(ext)
            onsets = np.arange(preds.shape[0], dtype=float) * TR_SECONDS
            return preds, onsets, "assumed 1 Hz grid", f"preds-dir:{ext}", tail_pad

    # 2. the fingerprinted local cache
    stim_dir = os.path.join(args.cache_dir, "stimuli")
    os.makedirs(stim_dir, exist_ok=True)
    stim = os.path.join(stim_dir, f"{ad_id}.mp4")
    if not os.path.exists(stim) or args.force:
        build_stimulus(video_path, stim, spec, tail_pad, args.baseline_audio)
    fp = fingerprint(stim, tail_pad, args.baseline_audio, args.modality)
    pred_dir = os.path.join(args.cache_dir, "preds")
    os.makedirs(pred_dir, exist_ok=True)
    npy = os.path.join(pred_dir, f"{fp}.npy")
    if os.path.exists(npy) and not args.force:
        preds = np.load(npy)
        onsets = np.arange(preds.shape[0], dtype=float) * TR_SECONDS
        return preds, onsets, "assumed 1 Hz grid", f"cache:{fp[:8]}", tail_pad

    # 3. actually run the model
    model = load_tribe_model(args.hf_cache, args.modality)
    events = build_events(stim)
    n_rows = len(events) if hasattr(events, "__len__") else -1
    if n_rows == 0:
        sys.exit(
            f"build_events returned an EMPTY dataframe for {ad_id} "
            f"({LEAD_PAD_S + spec['duration'] + tail_pad:.1f}s stimulus).\n"
            "This is the ChunkEvents(min_duration=30) failure mode — raise "
            "--min-stimulus-s.")
    preds, segments = model.predict(events=events)
    preds = np.asarray(preds)
    np.save(npy, preds.astype(np.float32))
    onsets, source = timepoint_onsets(preds, segments)
    return preds, onsets, source, f"tribe:{fp[:8]}", tail_pad


def extract_features(video_path, args, masks, ad_id=None, covariates_extra=None):
    """One video -> the feature JSON (lanes + covariates + honesty stats)."""
    ad_id = ad_id or os.path.splitext(os.path.basename(video_path))[0]
    spec = probe_video(video_path)
    if spec["duration"] <= 0:
        raise ValueError(f"{ad_id}: ffprobe could not read a duration")

    feat_dir = os.path.join(args.cache_dir, "features")
    os.makedirs(feat_dir, exist_ok=True)
    out_path = os.path.join(feat_dir, f"feat_{ad_id}.json")
    if os.path.exists(out_path) and not args.force:
        with open(out_path) as fh:
            cached = json.load(fh)
        if cached.get("schema") == SCHEMA_VERSION and cached.get("laneScale") == args.lane_scale:
            return cached, out_path

    preds, onsets, timing_source, provenance, tail_pad = get_preds(
        video_path, ad_id, spec, args, masks)
    if preds.ndim != 2 or preds.shape[1] != N_VERTICES:
        raise ValueError(f"{ad_id}: preds has shape {preds.shape}, expected "
                         f"(T, {N_VERTICES}). Revisit the LH/RH vertex-order assumption.")
    if not np.isfinite(preds).all():
        raise ValueError(f"{ad_id}: predictions contain NaN or Inf. Most likely the "
                         "digitally-silent padding hit a zero-variance normalization in "
                         "the audio front-end — retry with --baseline-audio dither.")

    content_end = LEAD_PAD_S + spec["duration"]
    lanes, times, base_scalars, base_sds = preds_to_lanes(
        preds, onsets, LEAD_PAD_S, content_end, masks)
    if args.lane_scale == "psc":
        # Divide by the baseline SD. This is the mitigation if A2 says TRIBE z-scores per
        # run: subtracting the baseline fixes an offset but not a scale, and this does.
        for k in lanes:
            sd = base_sds[k]
            if sd > 1e-6:
                lanes[k] = lanes[k] / sd

    series, control_status = control_series(
        video_path, args.baseline_dir, ad_id)
    cov = control_summaries(series)
    cov["duration_s"] = float(spec["duration"])
    cov["n_sec"] = float(len(times))
    if covariates_extra:
        cov.update(covariates_extra)

    # A4 — a moving video versus a black screen MUST drive occipital cortex. If it does
    # not, the vertex-order assumption, the mask or the content/baseline alignment is
    # wrong and no number downstream means anything.
    full_visual = float(np.nanmean(lanes["Vis|mag"]))

    out = {
        "schema": SCHEMA_VERSION,
        "adId": ad_id,
        "video": os.path.abspath(str(video_path)),
        "laneScale": args.lane_scale,
        "laneNames": lane_names(),
        "lanes": {k: [float(x) for x in v] for k, v in lanes.items()},
        "times": [float(x) for x in times],
        "baselineScalars": {k: round(v, 6) for k, v in base_scalars.items()},
        "baselineSds": {k: round(v, 6) for k, v in base_sds.items()},
        "covariates": cov,
        "controlStatus": control_status,
        "fullVisual": full_visual,
        "timingSource": timing_source,
        "provenance": provenance,
        "predsStats": preds_stats(preds),
        "perRunZscore": per_run_zscore_test(preds),
        "pad": {"lead": LEAD_PAD_S, "tail": tail_pad, "baselineLeadSkip": BASELINE_LEAD_SKIP_S,
                "baselineTailSkip": BASELINE_TAIL_SKIP_S,
                "baselineTailSpan": BASELINE_TAIL_SPAN_S,
                "minStimulusS": args.min_stimulus_s, "baselineAudio": args.baseline_audio},
        "duration_s": float(spec["duration"]),
    }
    tmp = out_path + ".part"
    with open(tmp, "w") as fh:
        json.dump(out, fh)
    os.replace(tmp, out_path)      # a killed run leaves no half-written JSON behind
    return out, out_path


# ================================================================================
# corpus labels
# ================================================================================
def parse_note(note):
    """(advertiser, start_date) out of the manifest `note` string.

    Provenance lives in this string rather than typed columns — the datasheet lists that
    as a known defect and calls the parsing fragile. It happens here, once.
    """
    advertiser, start = None, None
    m = re.search(r"page_([^;]+)", note or "")
    if m:
        advertiser = m.group(1).strip()
    m = re.search(r"start_([A-Za-z]{3})_(\d{1,2})_(\d{4})", note or "")
    if m and m.group(1) in _MONTHS:
        try:
            start = dt.date(int(m.group(3)), _MONTHS[m.group(1)], int(m.group(2)))
        except ValueError:
            start = None
    return advertiser, start


def load_labels(corpus_dir, target, as_of):
    """[{ad_id, y, advertiser, start, log_age, days}] from the per-platform manifest.

    The per-platform manifests are ALREADY filtered to the usable set (the 34 excluded
    ads are gone), so no exclusion logic is needed here.
    """
    fname = {"meta": "ad_manifest_meta.csv", "tiktok": "ad_manifest_tiktok.csv"}[target]
    path = os.path.join(corpus_dir, fname)
    if not os.path.exists(path):
        sys.exit(f"manifest not found: {path}")
    rows = []
    with open(path) as fh:
        for r in csv.DictReader(fh):
            platform = (r.get("platform") or "").strip()
            if platform and platform != target:
                # ad_performance.csv's primary_label holds two different quantities
                # depending on platform; pooling them gives a number that means nothing.
                sys.exit(f"{fname} contains platform={platform!r} rows under "
                         f"--target {target}. Refusing to pool platforms.")
            ad_id = r["ad_id"].strip()
            try:
                outcome = float(r["outcome"])
            except (KeyError, TypeError, ValueError):
                continue
            adv, start = parse_note(r.get("note", ""))
            row = {"ad_id": ad_id, "advertiser": adv, "start": start,
                   "raw_outcome": outcome}
            if target == "meta":
                # log1p because days_running spans 0..857 with a median of 32.
                row["y"] = math.log1p(outcome)
                row["days"] = outcome
                age = (as_of - start).days if start else None
                row["age_days"] = age
                row["log_age"] = math.log(max(age, 1)) if age is not None else float("nan")
            else:
                # ad_manifest_tiktok.csv carries the SIGN-CORRECTED 1 - percentile, so
                # higher is better. ad_performance.ctr_index runs backwards; reading it
                # here would flip the sign of every correlation computed downstream.
                row["y"] = outcome
                row["days"] = None
                row["age_days"] = None
                row["log_age"] = float("nan")
            rows.append(row)
    if not rows:
        sys.exit(f"no usable rows in {path}")
    return rows


def controls_only_feats(corpus_dir, labels, baseline_dir=None):
    """Covariate-only rows straight from the corpus tables — NO preds, NO atlas, NO GPU.

    This is the floor a neural score has to beat, measured on OUR splits rather than the
    datasheet's. Run it BEFORE renting the box: if duration + age + the four ffmpeg
    features already explain the label, that is worth knowing for $0.

    Duration comes from ad_media.csv (ffprobe truth, already computed for all 1359 ads)
    so this runs without the 13 GB of video present.
    """
    base = baseline_dir or os.path.join(corpus_dir, "baseline")
    durations = {}
    media = os.path.join(corpus_dir, "ad_media.csv")
    if os.path.exists(media):
        with open(media) as fh:
            for r in csv.DictReader(fh):
                try:
                    durations[r["ad_id"]] = float(r["duration_s"])
                except (KeyError, TypeError, ValueError):
                    pass
    feats = {}
    for lab in labels:
        ad_id = lab["ad_id"]
        path = os.path.join(base, f"baseline_{ad_id}.csv")
        if not os.path.exists(path):
            continue
        cols = {f: [] for f in CONTROL_FEATURES}
        with open(path) as fh:
            for row in csv.DictReader(fh):
                for f in CONTROL_FEATURES:
                    cols[f].append(float(row[f]))
        series = {f: np.asarray(v, float) for f, v in cols.items()}
        cov = control_summaries(series)
        cov["duration_s"] = durations.get(ad_id, float(len(series["loudness"])))
        cov["n_sec"] = float(len(series["loudness"]))
        feats[ad_id] = {"lanes": {}, "times": [], "covariates": cov,
                        "controlStatus": "csv", "fullVisual": None,
                        "perRunZscore": {"verdict": "n/a"}}
    return feats


def find_video(corpus_dir, ad_id):
    for ext in (".mp4", ".mov", ".webm", ".m4v"):
        p = os.path.join(corpus_dir, "videos", ad_id + ext)
        if os.path.exists(p):
            return p
    return None


# ================================================================================
# design matrix + cross-validation
# ================================================================================
def build_design(feats, labels, blocks, lam, has_age):
    """(X, y, groups, names, ad_ids) from cached feature JSONs joined to labels."""
    X, y, groups, ids, names = [], [], [], [], None
    for lab in labels:
        f = feats.get(lab["ad_id"])
        if f is None:
            continue
        cov = dict(f["covariates"])
        if has_age:
            cov["log_age"] = lab["log_age"]
        row, nm = feature_row(f["lanes"], f["times"], cov, blocks, lam, has_age)
        if names is None:
            names = nm
        X.append(row)
        y.append(lab["y"])
        # An ad with no parsed advertiser is its own group — never silently pooled with
        # the other unparsed ones, which would make a fold leak across brands.
        groups.append(lab["advertiser"] or f"__solo__{lab['ad_id']}")
        ids.append(lab["ad_id"])
    if not X:
        sys.exit("no ads have both features and a label — run `features` first.")
    return np.vstack(X), np.asarray(y, float), np.asarray(groups), names, ids


def drop_and_impute(X, names):
    """Drop columns NaN in more than NAN_DROP_FRAC of ads; report what went.

    The DROP decision looks at every ad, which is transductive — but it depends only on
    the NaN pattern, never on y, so it cannot leak label information into a fold. The
    imputation that follows is strictly train-fold-only (see _standardize).
    """
    frac = np.isnan(X).mean(axis=0)
    keep = frac <= NAN_DROP_FRAC
    dropped = [names[i] for i in range(len(names)) if not keep[i]]
    return X[:, keep], [names[i] for i in range(len(names)) if keep[i]], dropped


def group_kfold(groups, n_splits, seed=0):
    """Deterministic GroupKFold: biggest groups first, each to the smallest fold.

    Grouping by advertiser is not optional — 82% of the meta label's variance is between
    advertiser, so a random split would let the model memorise the brand and call it a
    creative effect.
    """
    uniq, counts = np.unique(groups, return_counts=True)
    order = np.argsort(-counts, kind="stable")
    fold_of, sizes = {}, np.zeros(n_splits, dtype=int)
    for i in order:
        f = int(np.argmin(sizes))
        fold_of[uniq[i]] = f
        sizes[f] += counts[i]
    assign = np.array([fold_of[g] for g in groups])
    return [(np.where(assign != f)[0], np.where(assign == f)[0]) for f in range(n_splits)]


def _standardize(X_tr, X_te):
    """Fit the scaler on the TRAINING fold only, then impute NaN to the train mean."""
    mu = np.nanmean(X_tr, axis=0)
    mu = np.where(np.isfinite(mu), mu, 0.0)
    sd = np.nanstd(X_tr, axis=0)
    sd = np.where(np.isfinite(sd) & (sd > 1e-9), sd, 1.0)
    f = lambda A: (np.where(np.isnan(A), mu, A) - mu) / sd     # noqa: E731
    return f(X_tr), f(X_te), mu, sd


def _fit_eval(X, y, train, test, alpha):
    Xtr, Xte, _, _ = _standardize(X[train], X[test])
    w, b = ridge_fit(Xtr, y[train], alpha)
    return Xte @ w + b


def pick_alpha(X, y, groups, train_idx, alphas, seed=0, n_inner=4):
    """Nested group-K-fold over the TRAINING rows only — never touches the held-out fold."""
    g = groups[train_idx]
    if len(np.unique(g)) < n_inner:
        return alphas[len(alphas) // 2]
    inner = group_kfold(g, n_inner, seed)
    best_a, best_s = alphas[0], -np.inf
    for a in alphas:
        preds, trues = [], []
        for itr, ite in inner:
            if len(itr) < 5 or len(ite) < 3:
                continue
            p = _fit_eval(X[train_idx], y[train_idx], itr, ite, a)
            preds.append(p)
            trues.append(y[train_idx][ite])
        if not preds:
            continue
        s = spearman(np.concatenate(preds), np.concatenate(trues))
        if np.isfinite(s) and s > best_s:
            best_s, best_a = s, a
    return best_a


def cross_validate(X, y, groups, splits, alphas=ALPHAS, seed=0):
    """Out-of-fold predictions + the per-fold alpha and Spearman."""
    oof = np.full(len(y), np.nan)
    folds = []
    for k, (train, test) in enumerate(splits):
        if len(train) < 10 or len(test) < 3:
            continue
        a = pick_alpha(X, y, groups, train, alphas, seed)
        p = _fit_eval(X, y, train, test, a)
        oof[test] = p
        folds.append({"fold": k, "n_train": int(len(train)), "n_test": int(len(test)),
                      "alpha": a, "r": spearman(p, y[test])})
    return oof, folds


# ================================================================================
# training
# ================================================================================
def train(args):
    as_of = (dt.date.fromisoformat(args.as_of) if args.as_of else dt.date.today())
    labels = load_labels(args.corpus, args.target, as_of)
    has_age = args.target == "meta"
    print(f"\n{'=' * 78}\nTRAIN  target={args.target}  n_labels={len(labels)}  "
          f"as_of={as_of}\n{'=' * 78}")

    if args.controls_only:
        # No preds, no atlas, no GPU: just duration + age + the four ffmpeg features.
        # This is the floor, and it costs nothing to measure.
        masks, mask_sha = [], {}
        feats = controls_only_feats(args.corpus, labels, args.baseline_dir)
        print(f"  CONTROLS ONLY — {len(feats)}/{len(labels)} ads have a baseline CSV. "
              "No neural features in this model.")
        if not feats:
            sys.exit("no baseline_<id>.csv found — pass --baseline-dir.")
        return _run_cv(args, labels, feats, has_age, (), mask_sha, as_of)

    masks, mask_sha = build_masks(args.cache_dir, quiet=True)

    # ---- gather features (extracting any that are missing) ----------------------
    feats, missing, failed = {}, [], []
    for lab in labels:
        ad_id = lab["ad_id"]
        cached = os.path.join(args.cache_dir, "features", f"feat_{ad_id}.json")
        if os.path.exists(cached) and not args.force:
            with open(cached) as fh:
                f = json.load(fh)
            if f.get("schema") == SCHEMA_VERSION and f.get("laneScale") == args.lane_scale:
                feats[ad_id] = f
                continue
        video = find_video(args.corpus, ad_id)
        if video is None:
            missing.append(ad_id)
            continue
        try:
            f, _ = extract_features(video, args, masks, ad_id=ad_id)
            feats[ad_id] = f
        except (ValueError, OSError) as e:
            failed.append((ad_id, str(e)[:80]))
    if missing:
        print(f"  {len(missing)} ads have no cached features and no video "
              f"(e.g. {', '.join(missing[:3])}) — excluded.")
    if failed:
        print(f"  {len(failed)} ads failed feature extraction "
              f"(e.g. {failed[0][0]}: {failed[0][1]}) — excluded.")
    if not feats:
        sys.exit("No features available. Run `features` on the corpus videos first, or "
                 "point --preds-dir at a directory of preds_<ad_id>.npy.")

    # ---- honesty gates (A2, A4) --------------------------------------------------
    verdicts = [f.get("perRunZscore", {}).get("verdict") for f in feats.values()]
    per_run = any(v == "per_run_zscore_likely" for v in verdicts)
    if per_run and args.lane_scale == "raw":
        msg = ("A2: TRIBE looks like it z-scores PER RUN, so raw activation LEVELS are "
               "not on one ruler across ads and every cross-sectional feature built on "
               "them is meaningless. Re-extract with --lane-scale psc.")
        if not args.force:
            sys.exit(msg + "\nPass --force to proceed anyway (the result is not honest).")
        print(f"  ! WARNING (--force): {msg}")
    bad_visual = [i for i, f in feats.items() if not (f.get("fullVisual", 0) > 0)]
    if bad_visual:
        msg = (f"A4: {len(bad_visual)} ads have full_visual <= 0 (e.g. {bad_visual[:3]}). "
               "A moving video versus a black screen MUST drive occipital cortex; if it "
               "does not, the vertex-order assumption, the Schaefer mask or the "
               "content/baseline alignment is wrong.")
        if not args.force:
            sys.exit(msg + "\nPass --force to downgrade this to a warning.")
        print(f"  ! WARNING (--force): {msg}")

    blocks = BLOCK_ORDER[:BLOCK_ORDER.index(args.temporal) + 1]
    print(f"  features for {len(feats)}/{len(labels)} ads | blocks={list(blocks)} | "
          f"lane_scale={args.lane_scale}")
    return _run_cv(args, labels, feats, has_age, blocks, mask_sha, as_of)


def _run_cv(args, labels, feats, has_age, blocks, mask_sha, as_of):
    """CV + report + save. Shared by the neural and the controls-only runs."""
    # ---- select lambda on the FULL design, in-fold ------------------------------
    results = {}
    best = None
    for lam in (LAMBDAS if "leaky" in blocks else (0.0,)):
        X, y, groups, names, ids = build_design(feats, labels, blocks, lam, has_age)
        X, names, dropped = drop_and_impute(X, names)
        splits = group_kfold(groups, args.folds, args.seed)
        oof, folds = cross_validate(X, y, groups, splits, seed=args.seed)
        s = spearman(oof[~np.isnan(oof)], y[~np.isnan(oof)])
        results[lam] = s
        if best is None or (np.isfinite(s) and s > best["s"]):
            best = {"lam": lam, "s": s, "X": X, "y": y, "groups": groups, "names": names,
                    "ids": ids, "oof": oof, "folds": folds, "splits": splits,
                    "dropped": dropped}
    if "leaky" in blocks:
        print("  lambda grid (held-out rho): "
              + "  ".join(f"{k:g}={v:+.3f}" for k, v in results.items())
              + f"  -> lam={best['lam']:g}")

    X, y, groups, names = best["X"], best["y"], best["groups"], best["names"]
    ids, oof, folds = best["ids"], best["oof"], best["folds"]
    n = int(np.sum(~np.isnan(oof)))
    if best["dropped"]:
        print(f"  dropped {len(best['dropped'])} all-NaN features "
              f"(e.g. {', '.join(best['dropped'][:3])})")

    # ---- the covariate-only comparator ------------------------------------------
    cov_idx = covariate_indices(names)
    Xc = X[:, cov_idx]
    oof_c, folds_c = cross_validate(Xc, y, groups, best["splits"], seed=args.seed)

    # ---- headline: partial Spearman controlling the covariates -------------------
    Z = np.column_stack([X[:, i] for i in cov_idx]) if cov_idx else np.zeros((len(y), 0))
    ok = ~np.isnan(oof)
    p_val, r_partial = label_perm_p(oof[ok], y[ok], Z[ok], n_perm=args.n_perm,
                                    seed=args.seed)
    r_plain = spearman(oof[ok], y[ok])
    okc = ~np.isnan(oof_c)
    r_comp = partial_spearman(oof_c[okc], y[okc], Z[okc])
    r_comp_plain = spearman(oof_c[okc], y[okc])

    # ---- leakage control: the label shuffle MUST collapse ------------------------
    rng = np.random.default_rng(args.seed + 991)
    y_sh = rng.permutation(y)
    oof_sh, _ = cross_validate(X, y_sh, groups, best["splits"], seed=args.seed)
    oksh = ~np.isnan(oof_sh)
    r_shuffle = partial_spearman(oof_sh[oksh], y_sh[oksh], Z[oksh])

    floor = effect_floor(n)
    deltas = [f["r"] - c["r"] for f, c in zip(folds, folds_c)
              if np.isfinite(f["r"]) and np.isfinite(c["r"])]
    med_delta = float(np.median(deltas)) if deltas else float("nan")
    # ONE-SIDED on purpose. A shuffled target reliably produces a NEGATIVE partial here
    # and that is not leakage: the out-of-fold model is fit to noise, so after both series
    # are residualized on Z what survives in the prediction is a shrinkage artifact that
    # is anti-correlated with the held-out truth. On pure synthetic data with no leakage
    # whatsoever this statistic sits near -0.25. Leakage means the shuffled model still
    # scores POSITIVELY, so only that direction may condemn a run.
    poisoned = np.isfinite(r_shuffle) and r_shuffle >= floor
    if not np.isfinite(r_partial) or abs(r_partial) < floor:
        verdict = "could-not-tell"
    elif p_val < 0.05 and np.isfinite(med_delta) and med_delta > 0:
        verdict = "signal"
    else:
        verdict = "null"
    if poisoned:
        verdict = "poisoned"

    # ---- report ------------------------------------------------------------------
    print(f"\n{'-' * 78}\nHELD-OUT (grouped by advertiser, {len(folds)} folds)\n{'-' * 78}")
    print(f"{'fold':>5}{'n_test':>8}{'alpha':>9}{'r_head':>9}{'r_cov':>9}{'delta':>9}")
    for f, c in zip(folds, folds_c):
        d = f["r"] - c["r"] if np.isfinite(f["r"]) and np.isfinite(c["r"]) else float("nan")
        print(f"{f['fold']:>5}{f['n_test']:>8}{f['alpha']:>9g}"
              f"{f['r']:>9.3f}{c['r']:>9.3f}{d:>9.3f}")
    print(f"\n  n scored                {n}")
    print(f"  features                {X.shape[1]}  (of which {len(cov_idx)} covariates)")
    print(f"  rho (plain)             {r_plain:+.3f}   comparator {r_comp_plain:+.3f}")
    print(f"  rho (partial, headline) {r_partial:+.3f}   comparator {r_comp:+.3f}")
    print(f"  perm p                  {p_val:.4f}   (floor 1/{args.n_perm + 1})")
    print(f"  median per-fold delta   {med_delta:+.3f}   (head minus covariate-only)")
    print(f"  label-shuffle control   {r_shuffle:+.3f}   (leakage only if >= +{floor:.3f}; "
          "negative is normal)")
    print(f"  detectable floor        {floor:.3f}   (0.09 * sqrt(1359/n), min 0.10)")
    print(f"\n  VERDICT: {verdict.upper()}")
    if not blocks:
        print("    CONTROLS-ONLY run: the model IS the covariates, so the delta is 0 and\n"
              "    the partial is biased NEGATIVE by construction — neither carries any\n"
              "    information here. The number to read is rho (plain) above: that is the\n"
              "    floor a neural score has to beat, and the reason it is not zero is\n"
              "    duration plus the calendar artifact, not creative quality.")
    elif verdict == "could-not-tell":
        print("    |r| is below the floor this n can resolve. That is 'could not tell',\n"
              "    NOT 'no effect' — do not write it up as the latter.")
    elif verdict == "null":
        print("    The neural blocks do not beat the covariate-only comparator.")
    elif verdict == "signal":
        print("    Incremental over duration + age + the ffmpeg controls. Still a\n"
              "    hypothesis: the outcome label is a proxy, not a spend result.")
    elif verdict == "poisoned":
        print("    The shuffled-label control did NOT collapse. There is leakage in the\n"
              "    split or the features. Fix that before reading any other number.")

    extras = secondary_readouts(args, labels, feats, oof, ids, y, has_age)

    # ---- forward time split (meta only) -----------------------------------------
    time_split = None
    if has_age:
        time_split = forward_time_split(X, y, groups, labels, ids, Z, args)

    # ---- fit on everything and save ---------------------------------------------
    alpha = pick_alpha(X, y, groups, np.arange(len(y)), ALPHAS, args.seed)
    Xs, _, mu, sd = _standardize(X, X)
    w, b = ridge_fit(Xs, y, alpha)
    model = {
        "schema": SCHEMA_VERSION,
        "target": args.target,
        "blocks": list(blocks),
        "lambda": best["lam"],
        "alpha": alpha,
        "laneScale": args.lane_scale,
        "hasAge": has_age,
        "featureNames": names,
        "weights": [float(v) for v in w],
        "intercept": float(b),
        "featureMean": [float(v) for v in mu],
        "featureSd": [float(v) for v in sd],
        "yardstick": ("log1p(days_running)" if has_age else "ctr percentile (1 - raw)"),
        # log_age exists at FIT time so the neural weights cannot absorb the calendar
        # artifact. It does not exist at PREDICT time — a new ad has never run — so
        # predict substitutes this median and says so.
        "covariateMedians": {nm: float(np.nanmedian(X[:, i]))
                             for i, nm in enumerate(names) if nm.startswith("cov.")},
        "maskSha1": mask_sha,
        "yeoTags": list(YEO_TAGS),
        "pad": {"lead": LEAD_PAD_S, "tail": TAIL_PAD_S,
                "minStimulusS": args.min_stimulus_s},
        "stamp": {
            "n": n, "nFolds": len(folds), "verdict": verdict,
            "rPartial": None if not np.isfinite(r_partial) else round(r_partial, 4),
            "rPlain": None if not np.isfinite(r_plain) else round(r_plain, 4),
            "rComparator": None if not np.isfinite(r_comp) else round(r_comp, 4),
            "medianFoldDelta": None if not np.isfinite(med_delta) else round(med_delta, 4),
            "permP": None if not np.isfinite(p_val) else round(p_val, 5),
            "shuffleControl": None if not np.isfinite(r_shuffle) else round(r_shuffle, 4),
            "floor": round(floor, 4), "poisoned": bool(poisoned),
            "folds": [{k: (None if isinstance(v, float) and not np.isfinite(v) else v)
                       for k, v in f.items()} for f in folds],
            "timeSplit": time_split,
            "secondary": extras,
            "asOf": str(as_of),
        },
    }
    out = args.out or os.path.join(args.cache_dir, f"ad_head_{args.target}.json")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w") as fh:
        json.dump(model, fh, indent=1)
    print(f"\n  saved {out}")
    return model


def forward_time_split(X, y, groups, labels, ids, Z, args):
    """Train on ads that STARTED before a cutoff, test on the ones after.

    A second, harder split than grouping by advertiser: it is the only one that catches a
    model riding calendar drift rather than creative.
    """
    start_by_id = {lab["ad_id"]: lab["start"] for lab in labels}
    starts = [start_by_id.get(i) for i in ids]
    known = [i for i, s in enumerate(starts) if s is not None]
    if len(known) < 40:
        return None
    order = sorted(known, key=lambda i: starts[i])
    cut = int(len(order) * args.time_split_frac)
    train, test = np.array(order[:cut]), np.array(order[cut:])
    if len(train) < 20 or len(test) < 10:
        return None
    alpha = pick_alpha(X, y, groups, train, ALPHAS, args.seed)
    pred = _fit_eval(X, y, train, test, alpha)
    r = partial_spearman(pred, y[test], Z[test])
    print(f"\n  forward time split      {r:+.3f}   "
          f"(train n={len(train)} start<={starts[order[cut - 1]]}, test n={len(test)})")
    return {"r": None if not np.isfinite(r) else round(r, 4),
            "nTrain": int(len(train)), "nTest": int(len(test)),
            "cutoff": str(starts[order[cut - 1]]), "alpha": alpha}


def secondary_readouts(args, labels, feats, oof, ids, y, has_age):
    """The two product-shaped readouts. Both directional — reported, never headlined."""
    out = {}
    by_id = {i: k for k, i in enumerate(ids)}
    lab_by_id = {lab["ad_id"]: lab for lab in labels}

    if has_age:
        # "did this creative survive a month", restricted to ads that HAD a month
        # available. The restriction removes left-truncation; it does NOT remove the age
        # artifact (rho(age, binary) is still +0.35), which is why log_age stays in Z.
        H = args.horizon_days
        sel = [(by_id[i], 1.0 if lab_by_id[i]["days"] >= H else 0.0)
               for i in ids
               if lab_by_id[i]["age_days"] is not None and lab_by_id[i]["age_days"] >= H]
        idx = [k for k, _ in sel if np.isfinite(oof[k])]
        if len(idx) >= 30:
            b = np.array([v for k, v in sel if np.isfinite(oof[k])])
            r = spearman(oof[idx], b)
            out["binaryHorizon"] = {"horizonDays": H, "n": len(idx),
                                    "posRate": round(float(b.mean()), 3),
                                    "r": None if not np.isfinite(r) else round(r, 4)}
            print(f"  ran>={H}d readout        {r:+.3f}   "
                  f"(n={len(idx)}, {b.mean():.1%} positive)")

    # within-advertiser pairwise accuracy: the 18% of variance creative can actually move
    pairs, correct = 0, 0
    by_adv = {}
    for i in ids:
        adv = lab_by_id[i]["advertiser"]
        if adv:
            by_adv.setdefault(adv, []).append(i)
    for adv, members in by_adv.items():
        ks = [by_id[m] for m in members if np.isfinite(oof[by_id[m]])]
        for a in range(len(ks)):
            for b in range(a + 1, len(ks)):
                ka, kb = ks[a], ks[b]
                if y[ka] == y[kb]:
                    continue
                pairs += 1
                if (oof[ka] - oof[kb]) * (y[ka] - y[kb]) > 0:
                    correct += 1
    if pairs >= 30:
        acc = correct / pairs
        out["withinAdvertiserPairs"] = {"pairs": pairs, "accuracy": round(acc, 4),
                                        "advertisers": len(by_adv)}
        print(f"  within-advertiser pairs {acc:.3f}   ({pairs} pairs, "
              f"{len(by_adv)} advertisers; directional only)")
    return out


# ================================================================================
# predict
# ================================================================================
def predict(args):
    with open(args.model) as fh:
        model = json.load(fh)
    if model.get("schema") != SCHEMA_VERSION:
        sys.exit(f"model schema {model.get('schema')} != {SCHEMA_VERSION}")
    stamp = model.get("stamp", {})
    verdict = stamp.get("verdict")
    if verdict in ("poisoned", "null", "could-not-tell") and not args.force:
        sys.exit(
            f"refusing to score with a {verdict.upper()} model.\n"
            f"  rho(partial)={stamp.get('rPartial')}  floor={stamp.get('floor')}  "
            f"shuffle={stamp.get('shuffleControl')}\n"
            "A model that did not beat its own comparator produces a number, not a\n"
            "prediction. Pass --force if you understand that and want it anyway.")

    if not model.get("maskSha1"):
        sys.exit("this model was fit with --controls-only: it contains no neural features "
                 "and is a floor measurement, not a predictor.")
    masks, mask_sha = build_masks(args.cache_dir, quiet=True)
    if mask_sha != model.get("maskSha1"):
        sys.exit("mask sha1 mismatch — the atlas this model was fit against is not the "
                 "one on disk. The feature definition would silently differ between fit "
                 "and apply; refusing.")

    args.lane_scale = model["laneScale"]
    ad_id = args.ad_id or os.path.splitext(os.path.basename(args.video))[0]
    f, _ = extract_features(args.video, args, masks, ad_id=ad_id)

    cov = dict(f["covariates"])
    substituted = []
    if model["hasAge"]:
        # A new ad has never run, so there is no age. Hold it at the training median and
        # SAY SO: the reportable output is the creative contribution with the calendar
        # artifact held fixed, not a forecast that secretly encodes a start date.
        cov["log_age"] = model["covariateMedians"].get("cov.log_age", float("nan"))
        substituted.append("log_age")
    row, names = feature_row(f["lanes"], f["times"], cov, tuple(model["blocks"]),
                             model["lambda"], model["hasAge"])
    idx = {n: i for i, n in enumerate(names)}
    missing = [n for n in model["featureNames"] if n not in idx]
    if missing:
        sys.exit(f"feature mismatch: the model wants {len(missing)} features this build "
                 f"does not produce (e.g. {missing[:3]}).")
    x = np.array([row[idx[n]] for n in model["featureNames"]], float)
    mu = np.asarray(model["featureMean"], float)
    sd = np.asarray(model["featureSd"], float)
    med = np.array([model["covariateMedians"].get(n, np.nan) for n in model["featureNames"]])
    fill = np.where(np.isfinite(med), med, mu)
    x = np.where(np.isnan(x), fill, x)
    z = (x - mu) / sd
    score = float(z @ np.asarray(model["weights"], float) + model["intercept"])

    print(f"\n  ad                {ad_id}")
    print(f"  model             {os.path.basename(args.model)}  "
          f"(target={model['target']}, verdict={verdict})")
    print(f"  predicted         {score:.4f}   [{model['yardstick']}]")
    if model["target"] == "meta":
        print(f"  ~ days running    {math.expm1(max(score, 0.0)):.0f}")
    print(f"  track record      rho(partial)={stamp.get('rPartial')} on n={stamp.get('n')}"
          f", floor={stamp.get('floor')}")
    if substituted:
        print(f"  NOTE              {', '.join(substituted)} held at the training median "
              "— it does not exist for an ad that has not run.")
    print("  This is a LEARNED HYPOTHESIS applied out of distribution, not a validated "
          "engagement model.")
    out = {"adId": ad_id, "score": score, "target": model["target"],
           "yardstick": model["yardstick"], "verdict": verdict,
           "substitutedCovariates": substituted, "stamp": stamp}
    if args.json_out:
        with open(args.json_out, "w") as fh:
            json.dump(out, fh, indent=1)
        print(f"  wrote {args.json_out}")
    return out


# ================================================================================
# CLI
# ================================================================================
def add_common(p):
    p.add_argument("--cache-dir", default=os.path.join("data", "ad_head"),
                   help="preds / stimuli / features / atlas cache (default data/ad_head, "
                        "which is already gitignored)")
    p.add_argument("--preds-dir", help="directory of externally-produced preds_<id>.npy "
                                       "(batch_extract.py output); skips all GPU work")
    p.add_argument("--baseline-dir", help="directory of baseline_<id>.csv control "
                                          "features; the corpus bundle ships these")
    p.add_argument("--hf-cache", default="cache", help="huggingface weight cache")
    p.add_argument("--modality", choices=["av", "video"], default="av")
    p.add_argument("--baseline-audio", choices=["silence", "dither"], default="silence")
    p.add_argument("--min-stimulus-s", type=float, default=DEFAULT_MIN_STIMULUS_S)
    p.add_argument("--lane-scale", choices=["raw", "psc"], default="raw",
                   help="psc divides each lane by its baseline SD — the mitigation if the "
                        "A2 per-run z-score test fires")
    p.add_argument("--fake-preds", action="store_true",
                   help="synthetic preds with a planted DorsAttn signal; no GPU, no "
                        "weights. Machine-honesty fixture only")
    p.add_argument("--force", action="store_true", help="recompute caches / downgrade "
                                                        "honesty gates to warnings")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__.split("\n")[1],
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    pf = sub.add_parser("features", help="one video -> one cached feature row")
    pf.add_argument("--video", required=True)
    pf.add_argument("--ad-id")
    pf.add_argument("--probe-stimulus", action="store_true",
                    help="build the padded stimulus, print its timing, and stop")
    add_common(pf)

    pt = sub.add_parser("train", help="fit + validate the ridge over a labelled corpus")
    pt.add_argument("--corpus", required=True)
    pt.add_argument("--target", choices=["meta", "tiktok"], default="meta")
    pt.add_argument("--temporal", choices=list(BLOCK_ORDER), default="shape",
                    help="cumulative feature ladder: mean -> shape -> leaky")
    pt.add_argument("--folds", type=int, default=5)
    pt.add_argument("--seed", type=int, default=0)
    pt.add_argument("--n-perm", type=int, default=5000)
    pt.add_argument("--horizon-days", type=int, default=30)
    pt.add_argument("--time-split-frac", type=float, default=0.7)
    pt.add_argument("--as-of", help="YYYY-MM-DD for the age computation (default today)")
    pt.add_argument("--controls-only", action="store_true",
                    help="fit duration + age + the four ffmpeg features ALONE, straight "
                         "from the corpus tables. No preds, no atlas, no GPU — this is "
                         "the floor a neural score has to beat. Run it first")
    pt.add_argument("--out", help="model json (default <cache>/ad_head_<target>.json)")
    add_common(pt)

    pp = sub.add_parser("predict", help="score one new video with a saved model")
    pp.add_argument("--video", required=True)
    pp.add_argument("--model", required=True)
    pp.add_argument("--ad-id")
    pp.add_argument("--json-out")
    add_common(pp)

    pl = sub.add_parser("list-tags", help="print every Schaefer/Yeo tag the atlas spells")
    pl.add_argument("--cache-dir", default=os.path.join("data", "ad_head"))

    args = ap.parse_args()

    if args.cmd == "list-tags":
        list_tags(args.cache_dir)
        return

    if args.cmd == "features":
        if args.probe_stimulus:
            spec = probe_video(args.video)
            tail = tail_pad_for(spec["duration"], args.min_stimulus_s)
            total = LEAD_PAD_S + spec["duration"] + tail
            print(f"  {os.path.basename(args.video)}")
            print(f"    content   {spec['duration']:.2f}s  {spec['width']}x{spec['height']}"
                  f"  {spec['fps']}fps  audio={spec['has_audio']}")
            print(f"    lead pad  {LEAD_PAD_S:.1f}s")
            print(f"    tail pad  {tail:.1f}s")
            clears = ("CLEARS" if total >= args.min_stimulus_s else
                      "BELOW — would risk the ChunkEvents(min_duration=30) "
                      "empty-dataframe failure")
            print(f"    TOTAL     {total:.1f}s   "
                  f"(min-stimulus {args.min_stimulus_s:.0f}s: {clears})")
            print(f"    baseline  lead[{BASELINE_LEAD_SKIP_S:.0f}s..{LEAD_PAD_S:.0f}s] + "
                  f"tail[+{BASELINE_TAIL_SKIP_S:.0f}s..+"
                  f"{BASELINE_TAIL_SKIP_S + BASELINE_TAIL_SPAN_S:.0f}s]")
            return
        masks, _ = build_masks(args.cache_dir, quiet=False)
        f, path = extract_features(args.video, args, masks, ad_id=args.ad_id)
        print(f"  {f['adId']}  T={len(f['times'])}s  provenance={f['provenance']}  "
              f"timing={f['timingSource']}")
        print(f"  full_visual={f['fullVisual']:+.4f} (A4 must be > 0)  "
              f"A2={f['perRunZscore']['verdict']}  controls={f['controlStatus']}")
        print(f"  wrote {path}")
        return

    if args.cmd == "train":
        train(args)
        return

    if args.cmd == "predict":
        predict(args)
        return


if __name__ == "__main__":
    main()
