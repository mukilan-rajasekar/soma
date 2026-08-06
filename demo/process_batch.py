#!/usr/bin/env python3
"""
process_batch.py — comparative preflight score + a per-second attention arc, for one
apples-to-apples batch of ads. Runs on the GPU box; emits one JSON the /preflight page
renders verbatim, plus an auditable CSV.

WHAT THIS IS
    A *comparative* ranking within one batch, from three components (weights FROZEN):
      Hook Capture (H)          40%  first-3s dorsal-attention + salience/ventral-attention
      Message Processing (P)    35%  higher-order (temporal/IFG/lateral-PFC/control) vs occipital
      Communication Clarity (C) 25%  ASR/OCR checks against the customer's stated message
      S_i = 0.40*H_i + 0.35*P_i + 0.25*C_i
    Every component is a percentile *within this batch*. With n=5 that means each one can
    only take the values 10/30/50/70/90. An 84 is not "84% chance of success".

    ...plus, and this is the part preflight.py does not have, a PER-TIMEPOINT ARC:
      arc[t] = mean(preds[t, DorsAttn]) - baseline_scalar
    where baseline_scalar is the same ROI averaged over the black-screen padding. Zero
    therefore means "no different from the model's response to a black screen", which is
    what lets five different ads share one honest y-axis.

LINEAGE — what came from where, and why
    * The three-component score, the padded stimuli, the content-minus-baseline contrast
      and the Schaefer ROI masks are ported from soma-dev/preflight.py, close to verbatim.
    * The TRIBE invocation is NOT preflight.py's. That path (`from tribev2 import
      TribeModel` + `get_events_dataframe`) passes no config_update, so the checkpoint
      loads with its default feature set — which includes the TEXT branch and needs gated
      meta-llama/Llama-3.2-3B plus `uvx whisperx`. It would pull ~1 GB of weights and then
      die at predict(). This module uses batch_extract.py's path instead: the one that has
      actually produced every prediction file in this repo.
    * detect_weak_spots is copied verbatim from tools/demo/build_report.py:183 so a dip
      means exactly the same thing on /preflight as it does on /demo.

    Governing rule: IMPORT what is coupled to a fragile external API (build_events pins
    the neuralset transform chain — duplicating it defeats the point); COPY what is pure
    arithmetic (detect_weak_spots has no external contract at all).

HONESTY CHECKS — the reason to trust any of the numbers. All cheap, all reach the JSON.
    A1  describe_preds per ad/mode      catches preds bounded [0,1] instead of signed
    A2  per-run z-score test            catches TRIBE z-scoring per run, which would make
                                        cross-ad LEVELS meaningless (auto-switches to psc)
    A3  baseline spread across ads      bounds per-clip drift vs real creative difference
    A4  full_visual > 0 for every ad    catches the [LH;RH] vertex-order assumption, a bad
                                        mask, or content/baseline misalignment. A moving
                                        video vs a black screen MUST drive occipital
                                        cortex; if it doesn't, nothing else is trustworthy
    A5  mean(arc) == full contrast      catches the arc and the score disagreeing about
                                        which timepoints count as content

USAGE — see --help. Run the probes first; they need no GPU and no weights:
    python demo/process_batch.py m.json vids --list-tags
    python demo/process_batch.py m.json vids --probe-events 16    # the risky case
    python demo/process_batch.py m.json vids --probe-events 35    # the mitigation
    python demo/process_batch.py m.json vids --probe-stimuli
    python demo/process_batch.py m.json vids --only ad_01 --allow-n    # go/no-go
    python demo/process_batch.py m.json vids --out-dir out --web-videos out/web

Research / non-commercial use only (TRIBE v2 weights are CC BY-NC 4.0).
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import pickle
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# ---- FROZEN SCORING CONSTANTS -------------------------------------------------
# Committed BEFORE running customer ads. These are hypotheses, not learned truth.
# Do NOT retune them after seeing which ads performed well — that is the whole point.
WEIGHTS = {"hook": 0.40, "processing": 0.35, "clarity": 0.25}
CLARITY_WEIGHTS = {"early_identity": 0.40, "early_meaning": 0.35, "action_clarity": 0.25}
EARLY_IDENTITY_S = 3.0       # brand/product must land within 3 s
EARLY_MEANING_S = 5.0        # problem/benefit must land within 5 s
ACTION_FRACTION = 2.0 / 3.0  # offer/CTA must appear in the final third
HOOK_WINDOW_S = 3.0          # first 3 s of the ad = the hook stimulus
# Weak spots — verbatim from tools/demo/build_report.py:167 / batch_extract.py:56.
WEAK_N_STD, WEAK_MIN_LEN = 1.25, 3
# -------------------------------------------------------------------------------

SCHEMA_VERSION = "batch-1.0"
DEFAULT_BATCH_SIZE = 5
HF_MODEL = "facebook/tribev2"
TR_SECONDS = 1.0             # TRIBE v2 emits ~1 timepoint / second
LEAD_PAD_S = 5.0             # black/silence before content
TAIL_PAD_S = 8.0             # black/silence after content
BASELINE_LEAD_SKIP_S = 1.0   # drop the first second of the lead pad (onset transient)
BASELINE_TAIL_SKIP_S = 3.0   # drop 3 s after content ends (residual smear guard)
# Bound the tail baseline to the span an 8 s pad would give. preflight.py:484 leaves it
# unbounded, which is fine at exactly TAIL_PAD_S=8 but silently changes the contrast the
# moment the pad is extended — and --min-stimulus-s extends it on every short stimulus.
# Bounding keeps the arithmetic identical to preflight's for the default padding, and
# also fixes a latent inconsistency where the hook and full stimuli would otherwise get
# differently-composed baselines.
BASELINE_TAIL_SPAN_S = TAIL_PAD_S - BASELINE_TAIL_SKIP_S   # 5.0
AUDIO_RATE = 48000
DURATION_BUCKETS = ((10.0, "<=10s"), (20.0, "11-20s"), (35.0, "21-35s"),
                    (60.0, "36-60s"), (float("inf"), ">60s"))

ROOT = Path(__file__).resolve().parent.parent

# --- ROI groups (Schaefer 400 / 7-network label substrings, delimited) ----------
# Hook: attentional orienting. Visual is a DIAGNOSTIC only — never rewarded, because a
# high occipital response is equally consistent with a compelling hook and with
# meaningless sensory intensity.
HOOK_ROIS = {"dorsattn": ("DorsAttn",), "salventattn": ("SalVentAttn",)}
# Higher-order message processing: middle/lateral temporal, ventral (inferior) frontal,
# lateral PFC and frontoparietal control. Salience frontal-operculum is excluded on
# purpose — it already carries the hook term.
HIGHER_ORDER_TAGS = ("Default_Temp", "Default_PFCv", "Cont_PFCl", "Cont_Temp", "Cont_Par")
VISUAL_TAGS = ("Vis",)
ARC_ROIS = {"dorsattn": HOOK_ROIS["dorsattn"], "salventattn": HOOK_ROIS["salventattn"],
            "higher_order": HIGHER_ORDER_TAGS, "visual": VISUAL_TAGS}

_CBIG = ("https://raw.githubusercontent.com/ThomasYeoLab/CBIG/master/"
         "stable_projects/brain_parcellation/Schaefer2018_LocalGlobal/"
         "Parcellations/FreeSurfer5.3/fsaverage5/label")
ANNOT = {h: f"{_CBIG}/{h}.Schaefer2018_400Parcels_7Networks_order.annot" for h in ("lh", "rh")}

MESSAGE_FIELDS = ("brand_name", "product_name", "primary_problem",
                  "primary_benefit", "offer", "desired_cta")
COMPARABILITY_KEYS = ("platform", "placement", "objective", "product", "audience")

STOPWORDS = frozenset("""a an the and or but if of for to in on at by with from as is are was
were be been being it its this that these those you your we our they their he she i me my not
no so than then there here what which who whom how when where why all any both each few more
most other some such only own same too very can will just do does did done has have had get
gets got""".split())


# ================================================================================
# import the PROVEN TRIBE event path from the repo root
# ================================================================================
def _import_batch_extract():
    """batch_extract.build_events pins the exact neuralset transform chain and kwargs;
    its docstring says so explicitly, so it is imported rather than duplicated. The module
    is side-effect free at import (stdlib + numpy + two float constants; the tribev2 /
    neuralset imports are all deferred inside functions), so this costs nothing on a box
    without the GPU stack."""
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    try:
        from batch_extract import build_events, describe_preds
        return build_events, describe_preds
    except ImportError as e:
        sys.exit(
            f"Cannot import batch_extract from {ROOT}: {e}\n\n"
            "process_batch.py deliberately reuses batch_extract.build_events — it is the\n"
            "only TRIBE event-construction path in this project that has ever produced an\n"
            "output. Copy BOTH files to the box, preserving the layout:\n"
            "    <workdir>/batch_extract.py\n"
            "    <workdir>/demo/process_batch.py\n"
        )


# ================================================================================
# data types
# ================================================================================
@dataclass
class Ad:
    filename: str
    path: Path
    ad_id: str
    title: str
    comparability: dict
    width: int = 0
    height: int = 0
    fps: float = 30.0
    duration: float = 0.0
    has_audio: bool = False
    flags: list = field(default_factory=list)


@dataclass
class TribeResult:
    preds: np.ndarray          # (T, 20484) signed z-scored BOLD
    onsets: np.ndarray         # (T,) stimulus-time seconds for each row
    timing_source: str         # how `onsets` was derived (auditable)
    content_start: float
    content_end: float
    total_duration: float
    tail_pad: float
    stats: dict = field(default_factory=dict)


@dataclass
class ContentResult:
    asr: list = field(default_factory=list)   # [(start_s, end_s, text)]
    ocr: list = field(default_factory=list)   # [(t_s, text)]
    asr_backend: str = "none"
    ocr_backend: str = "none"


@dataclass
class ArcResult:
    raw: np.ndarray
    psc: np.ndarray
    mag: np.ndarray
    times: np.ndarray
    baseline_scalar: float
    baseline_scalar_lead: float
    baseline_sd: float
    weak_spots: list


# ================================================================================
# 1. validate_batch
# ================================================================================
def validate_batch(manifest_path, videos_dir, batch_size, allow_n=False, force=False):
    """Require a comparable batch and the customer message fields."""
    manifest_path, videos_dir = Path(manifest_path), Path(videos_dir)
    try:
        manifest = json.loads(manifest_path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        sys.exit(f"Cannot read manifest {manifest_path}: {e}")

    missing = [f for f in MESSAGE_FIELDS if not str(manifest.get(f, "")).strip()]
    if missing:
        sys.exit("Manifest is missing required customer message fields: "
                 + ", ".join(missing)
                 + "\nClarity cannot be scored without them; it is 25% of the score.")

    batch_defaults = manifest.get("batch", {})
    missing_cmp = [k for k in COMPARABILITY_KEYS if not str(batch_defaults.get(k, "")).strip()]
    if missing_cmp:
        _fail(force, "Manifest `batch` is missing: " + ", ".join(missing_cmp)
              + "\nWithout these you cannot claim the ads share a creative job.")

    entries = manifest.get("ads") or []
    if not entries:
        sys.exit("Manifest has no `ads` entries.")
    if len(entries) != batch_size:
        msg = (f"Batch size is {len(entries)}, not {batch_size}. Percentile ranks over a "
               f"different n are not comparable to a {batch_size}-ad batch.")
        if allow_n:
            print(f"  ! WARNING: {msg} (--allow-n given, proceeding)")
        else:
            sys.exit(msg + "\nPass --allow-n to override.")

    ads = []
    seen_ids = set()
    for e in entries:
        fn = str(e.get("filename", "")).strip()
        if not fn:
            sys.exit(f"Manifest ad entry has no filename: {e!r}")
        path = videos_dir / fn
        if not path.exists():
            sys.exit(f"Video not found: {path}")
        ad_id = str(e.get("id") or Path(fn).stem).strip()
        if ad_id in seen_ids:
            sys.exit(f"Duplicate ad id {ad_id!r} in the manifest — ids must be unique.")
        seen_ids.add(ad_id)
        cmp_vals = {k: str(e.get(k, batch_defaults.get(k, ""))).strip().lower()
                    for k in COMPARABILITY_KEYS}
        ads.append(Ad(filename=fn, path=path, ad_id=ad_id,
                      title=str(e.get("title") or ad_id), comparability=cmp_vals))

    for ad in ads:
        spec = probe_video(ad.path)
        ad.width, ad.height, ad.fps = spec["width"], spec["height"], spec["fps"]
        ad.duration, ad.has_audio = spec["duration"], spec["has_audio"]
        if ad.duration <= 0:
            sys.exit(f"ffprobe could not read a duration for {ad.filename}.")
        if ad.duration < HOOK_WINDOW_S:
            ad.flags.append("shorter_than_hook_window")
        if not ad.has_audio:
            ad.flags.append("no_audio_track")

    for key in COMPARABILITY_KEYS:
        vals = {ad.comparability[key] for ad in ads}
        if len(vals) > 1:
            _fail(force, f"Ads disagree on `{key}`: {sorted(vals)}. "
                         "Ranking mixes different creative jobs.")

    buckets = {ad.filename: duration_bucket(ad.duration) for ad in ads}
    if len(set(buckets.values())) > 1:
        _fail(force, "Ads span multiple duration categories: "
              + ", ".join(f"{k}={v}" for k, v in sorted(buckets.items()))
              + ". Length is a confound; length-match the batch.")

    print(f"Batch validated: {len(ads)} ads, "
          f"{', '.join(f'{k}={batch_defaults.get(k, '?')}' for k in COMPARABILITY_KEYS)}, "
          f"duration category {sorted(set(buckets.values()))[0]}.")
    return ads, manifest


def _fail(force, message):
    if force:
        print(f"  ! WARNING (--force): {message}")
    else:
        sys.exit(message + "\nPass --force to downgrade this to a warning.")


def duration_bucket(seconds):
    for upper, label in DURATION_BUCKETS:
        if seconds <= upper:
            return label
    return DURATION_BUCKETS[-1][1]


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
    spec["width"] = max(2, spec["width"] - (spec["width"] % 2))    # ffmpeg needs even dims
    spec["height"] = max(2, spec["height"] - (spec["height"] % 2))
    return spec


# ================================================================================
# 2. build_stimulus
# ================================================================================
def tail_pad_for(content_dur, min_stimulus_s):
    """Extend the TAIL so the stimulus clears `min_stimulus_s`.

    WHY THIS EXISTS — the single biggest run-killing risk in this script. build_events
    chunks with ChunkEvents(max_duration=60, min_duration=30). preflight's hook stimulus
    is 5 + 3 + 8 = 16 s. Whether min_duration merely prevents splitting off a short
    remainder (fine) or FILTERS OUT sub-30 s spans (empty events dataframe, dead batch
    40 minutes in) is not determinable without running neuralset, and there is no
    tests/test_build_events.py in this repo to pin it. Rather than bet on the benign
    reading, pad past the threshold — it costs ~20 s of extra video across 10 inferences.

    Only the tail grows, and BASELINE_TAIL_SPAN_S bounds the baseline window, so the
    extra timepoints are never used and the contrast is numerically unchanged.
    Run --probe-events 16 to learn the real semantics.
    """
    return max(TAIL_PAD_S, min_stimulus_s - LEAD_PAD_S - content_dur)


def content_duration(ad, mode):
    return min(HOOK_WINDOW_S, ad.duration) if mode == "hook" else ad.duration


def build_stimulus(video_path, mode, output_path, ad, tail_pad, baseline_audio="silence"):
    """The standardized hook or full-ad stimulus with baseline padding.

    mode="hook": LEAD_PAD_S black/silence + first 3 s of ad + tail_pad black/silence
    mode="full": LEAD_PAD_S black/silence + the whole ad    + tail_pad black/silence

    Ported from preflight.py:285-335; the only changes are the parameterized tail and
    the optional dithered pad.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    content_dur = content_duration(ad, mode)
    w, h, fps = ad.width, ad.height, ad.fps
    vpad = f"color=c=black:s={w}x{h}:r={fps}"
    if baseline_audio == "dither":
        # Digital silence is a zero-variance window. If the audio front-end does
        # per-utterance mean/var normalization that is a 0/0 -> NaN waiting to happen.
        # This is inaudible (below the 16-bit LSB at normal levels) but non-degenerate.
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
    if not ad.has_audio:
        cmd += ["-f", "lavfi", "-t", f"{content_dur}", "-i", apad]   # 5 silent content audio

    vtrim = f"trim=0:{content_dur}," if mode == "hook" else ""
    atrim = f"atrim=0:{content_dur}," if mode == "hook" else ""
    audio_src = "[5:a]" + afmt if not ad.has_audio else f"[0:a]{atrim}asetpts=PTS-STARTPTS,{afmt}"

    graph = (
        f"[0:v]{vtrim}setpts=PTS-STARTPTS,fps={fps},scale={w}:{h},setsar=1,format=yuv420p[vc];"
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
            "-movflags", "+faststart", str(output_path)]
    try:
        subprocess.run(cmd, capture_output=True, check=True, text=True)
    except subprocess.CalledProcessError as e:
        output_path.unlink(missing_ok=True)
        sys.exit(f"ffmpeg failed building {mode} stimulus for {ad.filename}:\n{e.stderr}")
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


def fingerprint(stimulus_path, mode, tail_pad, baseline_audio, modality):
    """Cache key that actually covers the inputs.

    preflight.py:929 keys its preds cache on f"{filename}.{mode}" alone — no dependence
    on the padding constants or the stimulus bytes. Change TAIL_PAD_S, re-run, and it
    silently reuses predictions for a stimulus that no longer exists. That is the worst
    kind of stale result, because the numbers still look plausible.
    """
    parts = [sha1_file(stimulus_path), mode, f"{LEAD_PAD_S}", f"{tail_pad}",
             baseline_audio, modality, SCHEMA_VERSION]
    return hashlib.sha1("|".join(parts).encode()).hexdigest()


# ================================================================================
# 3. run_tribe  —  the PROVEN path (see the lineage note at the top of this file)
# ================================================================================
def load_tribe_model(hf_cache, modality):
    try:
        from tribev2.demo_utils import TribeModel
    except ImportError as e:
        sys.exit(
            f"Cannot import tribev2.demo_utils: {e}\n\n"
            "This is the GPU-inference stack (requirements.txt GROUP A) and it is not\n"
            "pinned in any tracked file — reproduce it from the box it lives on:\n"
            "  pip install 'numpy>=1.26,<2.1'   # HARD pin; >=2.1 segfaults neuralset\n"
            "  pip install torch --index-url <matching the box's CUDA>\n"
            "  pip install neuralset tribev2 huggingface_hub transformers nibabel\n"
            "  huggingface-cli login            # facebook/tribev2 weights are gated\n\n"
            "The probes (--list-tags, --probe-events, --probe-stimuli) do not need it."
        )
    features = {"av": ["audio", "video"], "video": ["video"]}[modality]
    print(f"Loading TRIBE v2 ({HF_MODEL}, features={features}) ...")
    return TribeModel.from_pretrained(
        HF_MODEL, cache_folder=Path(hf_cache),
        config_update={"data": {"features_to_use": features}},
    )


def preds_stats(preds):
    """The numbers describe_preds prints, in a form that can go in the JSON. A1."""
    p = np.asarray(preds, float)
    pct = np.percentile(p, [1, 50, 90, 99])
    return {
        "shape": list(p.shape),
        "min": round(float(p.min()), 4), "max": round(float(p.max()), 4),
        "mean": round(float(p.mean()), 5), "std": round(float(p.std()), 5),
        "pct": [round(float(v), 4) for v in pct],
        "fracLtZero": round(float(np.mean(p < 0)), 4),
        "fracGt06": round(float(np.mean(p > 0.6)), 4),
        "looksBounded01": bool(p.min() >= 0 and p.max() <= 1),
    }


def per_run_zscore_test(preds):
    """A2 — decisive. If TRIBE z-scores per inference run then, per vertex over time, the
    mean is ~0 and the SD is ~1. If that holds, five ads' arcs are NOT on one ruler and
    only their shapes are comparable."""
    p = np.asarray(preds, float)
    vm = p.mean(axis=0)
    vs = p.std(axis=0)
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


def run_tribe(model, build_events, describe_preds, stimulus_path, cache_key, ad, mode,
              n_vertices, tail_pad, cache_dir, modality, baseline_audio, force=False):
    """(T, 20484) predictions with aligned onsets, cached under <cache>/preds."""
    pred_dir = Path(cache_dir) / "preds"
    pred_dir.mkdir(parents=True, exist_ok=True)
    npy = pred_dir / f"{cache_key}.npy"
    pkl = pred_dir / f"{cache_key}.segments.pkl"
    meta = pred_dir / f"{cache_key}.meta.json"

    fp = fingerprint(stimulus_path, mode, tail_pad, baseline_audio, modality)
    cached = False
    if npy.exists() and meta.exists() and not force:
        try:
            old = json.loads(meta.read_text())
            if old.get("fingerprint") == fp:
                cached = True
            else:
                print(f"  cache MISS for {cache_key}: fingerprint changed "
                      f"({old.get('fingerprint', '?')[:8]} -> {fp[:8]}) — recomputing")
        except (OSError, json.JSONDecodeError):
            pass

    if cached:
        preds = np.load(npy)
        segments = None
        if pkl.exists():
            try:
                with open(pkl, "rb") as f:
                    segments = pickle.load(f)
            except Exception:                                   # noqa: BLE001
                segments = None
    else:
        events = build_events(str(stimulus_path), trimodal=False)
        n_rows = len(events) if hasattr(events, "__len__") else -1
        if n_rows == 0:
            sys.exit(
                f"build_events returned an EMPTY dataframe for {ad.ad_id} ({mode}, "
                f"{stimulus_path.stat().st_size} bytes, "
                f"{LEAD_PAD_S + content_duration(ad, mode) + tail_pad:.1f}s).\n"
                "This is the ChunkEvents(min_duration=30) failure mode. Raise\n"
                "--min-stimulus-s, and run `--probe-events 16` to see the real semantics."
            )
        preds, segments = model.predict(events=events)
        preds = np.asarray(preds)
        np.save(npy, preds.astype(np.float32))
        try:
            with open(pkl, "wb") as f:
                pickle.dump(segments, f)
        except (pickle.PicklingError, TypeError):
            pkl.write_bytes(pickle.dumps(None))
        meta.write_text(json.dumps({
            "fingerprint": fp, "mode": mode, "tailPad": tail_pad,
            "T": int(preds.shape[0]), "schema": SCHEMA_VERSION,
            # `segments`' real shape is unverified in BOTH repos. Record it once so the
            # next person doesn't have to guess.
            "segmentsType": type(segments).__name__,
            "segmentsColumns": (list(segments.columns)
                                if hasattr(segments, "columns") else None),
        }, indent=1))

    if preds.ndim != 2 or preds.shape[1] != n_vertices:
        sys.exit(f"vertex mismatch for {cache_key}: preds has shape {preds.shape}, atlas "
                 f"has {n_vertices}. Revisit the LH/RH vertex-order assumption.")
    if not np.isfinite(preds).all():
        sys.exit(f"{cache_key}: predictions contain NaN or Inf. The most likely cause is "
                 "the digitally-silent padding hitting a zero-variance normalization in "
                 "the audio front-end. Retry with --baseline-audio dither.")

    describe_preds(preds, tag=f"{ad.ad_id}.{mode}")             # A1, stdout audit trail
    onsets, source = timepoint_onsets(preds, segments)
    content_dur = content_duration(ad, mode)
    return TribeResult(preds=preds, onsets=onsets, timing_source=source,
                       content_start=LEAD_PAD_S,
                       content_end=LEAD_PAD_S + content_dur,
                       total_duration=LEAD_PAD_S + content_dur + tail_pad,
                       tail_pad=tail_pad, stats=preds_stats(preds))


def timepoint_onsets(preds, segments):
    """Stimulus-time onset (s) per prediction row, from `segments` when usable.

    TRIBE already compensates the 5 s hemodynamic lag internally — we never shift again
    (soma-dev/FINDINGS.md; rank.py's HRF_ONSET_S=5.0 was a double-compensation bug).
    Falls back to the documented 1 Hz grid, and SAYS SO, rather than guessing silently.
    """
    n = preds.shape[0]
    for name in ("onset", "start", "start_time", "time", "t"):
        vals = _column(segments, name)
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


def _column(segments, name):
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
# atlas / ROI masks
# ================================================================================
def load_parcel_names(cache_dir):
    """Length-20484 array of Schaefer parcel names, one per fsaverage5 vertex."""
    try:
        import nibabel as nib
    except ImportError as e:
        sys.exit(f"nibabel is required to read the Schaefer .annot files: {e}\n"
                 "  pip install nibabel\n"
                 "(This project's other ROI path uses nilearn's Destrieux atlas, but "
                 "Destrieux is anatomical — it cannot express the Yeo-7 network tags "
                 "DorsAttn / SalVentAttn / Cont_* that this score is defined on.)")
    d = Path(cache_dir) / "atlas"
    d.mkdir(parents=True, exist_ok=True)
    out = []
    for hemi in ("lh", "rh"):
        path = d / Path(ANNOT[hemi]).name
        if not path.exists():
            import urllib.request
            print(f"  downloading {path.name} ...")
            urllib.request.urlretrieve(ANNOT[hemi], path)
        vert_labels, _, names = nib.freesurfer.read_annot(str(path))
        parcel = [n.decode() if isinstance(n, bytes) else n for n in names]
        out.extend(parcel[v] for v in vert_labels)   # label 0 = medial wall
    return np.array(out)


def mask_for(parcel_names, tags, label):
    """Boolean vertex mask over any of `tags`, with per-tag counts reported."""
    strs = parcel_names.astype(str)
    mask = np.zeros(strs.shape[0], dtype=bool)
    counts = {}
    for t in tags:
        hit = np.char.find(strs, f"_{t}_") >= 0
        counts[t] = int(hit.sum())
        mask |= hit
    zero = [t for t, c in counts.items() if c == 0]
    if zero:
        print(f"  ! WARNING: ROI '{label}' — no vertices matched {zero}. "
              "Check the Schaefer label spellings (--list-tags).")
    if not mask.any():
        sys.exit(f"ROI '{label}' is empty: none of {tags} matched any parcel. "
                 "Run --list-tags to see the available label spellings.")
    print(f"  ROI {label:<14} {int(mask.sum()):>6} vertices  "
          + " ".join(f"{t}={c}" for t, c in counts.items()))
    return mask


def list_tags(parcel_names):
    tags = set()
    for name in set(parcel_names.astype(str).tolist()):
        parts = name.split("_")
        if len(parts) >= 4:                       # 7Networks_LH_<Net>_<Sub>_<idx>
            tags.add("_".join(parts[2:-1]))
            tags.add(parts[2])
    for t in sorted(tags):
        print(t)


# ================================================================================
# 4. contrasts + the arc
# ================================================================================
def window_masks(result):
    """(content, baseline, lead_only) boolean masks over timepoints.

    Baseline = lead pad after a 1 s settling skip, plus a BOUNDED 5 s slice of the tail
    after a 3 s smear skip. See BASELINE_TAIL_SPAN_S.
    """
    t = result.onsets
    end = result.content_end
    content = (t >= result.content_start) & (t < end)
    lead = (t >= BASELINE_LEAD_SKIP_S) & (t < result.content_start)
    tail = (t >= end + BASELINE_TAIL_SKIP_S) & (t < end + BASELINE_TAIL_SKIP_S
                                                + BASELINE_TAIL_SPAN_S)
    return content, (lead | tail), lead


def extract_roi_contrasts(result, atlas_masks):
    """Content-minus-baseline contrast per ROI group. SIGNED, deliberately.

    NOT batch_extract.arc_from_preds, which takes |preds| so a historical sign bug can't
    resurface. Magnitude would be wrong here: a delta only means "above/below a black
    screen" if it keeps its sign, and zero only has meaning in the signed version.
    """
    content, baseline, _ = window_masks(result)
    if content.sum() == 0 or baseline.sum() == 0:
        sys.exit(f"Empty contrast window (content={int(content.sum())} tp, "
                 f"baseline={int(baseline.sum())} tp) with timing from "
                 f"{result.timing_source}. The stimulus padding or the segment alignment "
                 "is wrong — do not trust any score built on this.")
    content_mean = result.preds[content].mean(axis=0)
    baseline_mean = result.preds[baseline].mean(axis=0)
    delta = content_mean - baseline_mean
    out = {name: float(delta[mask].mean()) for name, mask in atlas_masks.items()}
    out["_n_content_tp"] = int(content.sum())
    out["_n_baseline_tp"] = int(baseline.sum())
    return out


def detect_weak_spots(arc, fps=1.0, min_len_sec=WEAK_MIN_LEN, n_std=WEAK_N_STD):
    """VERBATIM from tools/demo/build_report.py:183 (itself copied from
    batch_extract.py:188), so a dip means the same thing on /preflight as on /demo.

    A weak spot is a sustained run where the smoothed arc sits at least n_std robust
    (MAD-based) SD below the clip's OWN median. FALSIFIABLE: a flat arc yields zero spots
    — there is no forced bottom quartile. MAD-normalized, hence invariant to positive
    scaling, so `raw` and `psc` give identical spots and this runs once.
    """
    a = np.asarray(arc, float)
    if len(a) < 5:
        return []
    k = max(1, int(round(fps)))
    sm = np.convolve(a, np.ones(k) / k, mode="same")
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
                spots.append({
                    "start": round(i / fps, 2),
                    "end": round(j / fps, 2),
                    "secs": round((j - i) / fps),
                    "depth": round(abs(float(z[i:j].min())), 2),
                })
            i = j
        else:
            i += 1
    return spots


def build_arc(result, mask, fps=1.0):
    """The per-timepoint lane. This is the piece preflight.py does not have."""
    content, baseline, lead = window_masks(result)
    p = result.preds
    base_tp = p[baseline][:, mask]
    baseline_scalar = float(base_tp.mean())
    base_series = base_tp.mean(axis=1)
    baseline_sd = float(base_series.std(ddof=0))
    lead_scalar = float(p[lead][:, mask].mean()) if lead.sum() else baseline_scalar

    raw = p[content][:, mask].mean(axis=1) - baseline_scalar
    if baseline_sd > 1e-6:
        psc = raw / baseline_sd
    else:
        psc = raw.copy()
    # Magnitude lane. Diagnostic only, and the hedge for a real risk: a signed mean over
    # ~2,000 vertices, roughly half negative at any moment, can cancel to near-noise. If
    # sd(raw) << sd(mag) the signed arc is noise and the chart should switch lanes —
    # having both here avoids a second 30-minute GPU run to find out.
    absp = np.abs(p)
    mag = absp[content][:, mask].mean(axis=1) - float(absp[baseline][:, mask].mean())

    times = result.onsets[content] - result.content_start
    return ArcResult(
        raw=raw, psc=psc, mag=mag, times=times,
        baseline_scalar=baseline_scalar, baseline_scalar_lead=lead_scalar,
        baseline_sd=baseline_sd, weak_spots=detect_weak_spots(raw, fps),
    )


def arc_stats(a, times):
    a = np.asarray(a, float)
    if a.size == 0:
        return {}
    return {
        "mean": round(float(a.mean()), 5), "sd": round(float(a.std()), 5),
        "min": round(float(a.min()), 5), "max": round(float(a.max()), 5),
        "peakT": round(float(times[int(np.argmax(a))]), 2),
        "troughT": round(float(times[int(np.argmin(a))]), 2),
        "fracAboveZero": round(float(np.mean(a > 0)), 3),
    }


# ================================================================================
# 5. content  (ASR + OCR)
# ================================================================================
def extract_content(video_path, ad, cache_dir, asr_model, asr_device,
                    no_asr=False, no_ocr=False, force=False):
    """Transcript + on-screen text, cached.

    preflight.py re-runs whisper and tesseract on every invocation — ~10 minutes wasted
    on 5 ads every time a weight is tweaked. The cache file matches the shape
    tools/demo/media_text.py writes, so the two are interchangeable: run media_text.py
    locally on a Mac (Vision OCR is markedly better on low-contrast ad text) and drop its
    JSON in here.
    """
    d = Path(cache_dir) / "media"
    d.mkdir(parents=True, exist_ok=True)
    cache = d / f"{ad.ad_id}.json"
    if cache.exists() and not force:
        try:
            j = json.loads(cache.read_text())
            return ContentResult(
                asr=[(s["t"], s["end"], s["text"]) for s in j.get("speech", [])],
                ocr=[(f["t"], " ".join(ln["text"] for ln in f.get("lines", [])))
                     for f in j.get("screen", [])],
                asr_backend=j.get("asrBackend", "cache"),
                ocr_backend=j.get("ocrBackend", "cache"),
            )
        except (OSError, json.JSONDecodeError, KeyError, TypeError):
            print(f"  ! media cache for {ad.ad_id} unreadable — recomputing")

    res = ContentResult()
    if not no_asr:
        res.asr, res.asr_backend = _transcribe(video_path, asr_model, asr_device)
    if not no_ocr:
        res.ocr, res.ocr_backend = _ocr_windows(video_path, ad)

    cache.write_text(json.dumps({
        "id": ad.ad_id, "duration": ad.duration,
        "speech": [{"t": round(s, 2), "end": round(e, 2), "text": t} for s, e, t in res.asr],
        "screen": [{"t": round(t, 2), "lines": [{"text": tx}]} for t, tx in res.ocr],
        "asrBackend": res.asr_backend, "ocrBackend": res.ocr_backend,
    }, indent=1))
    return res


def _transcribe(video_path, model_size="small", device="auto"):
    """[(start, end, text)] via faster-whisper, then openai-whisper, else nothing."""
    try:
        from faster_whisper import WhisperModel
        if not hasattr(_transcribe, "_fw"):      # load once, not once per ad
            dev = device if device in ("cuda", "cpu") else "cpu"
            ctype = "float16" if dev == "cuda" else "int8"
            _transcribe._fw = WhisperModel(model_size, device=dev, compute_type=ctype)
        segs, _ = _transcribe._fw.transcribe(str(video_path), word_timestamps=False)
        return [(float(s.start), float(s.end), s.text.strip()) for s in segs], "faster-whisper"
    except ImportError:
        pass
    except Exception as e:                       # noqa: BLE001
        print(f"  ! faster-whisper failed on {Path(video_path).name}: {e}")
    try:
        import whisper
        if not hasattr(_transcribe, "_w"):
            _transcribe._w = whisper.load_model("base")
        out = _transcribe._w.transcribe(str(video_path))
        return ([(float(s["start"]), float(s["end"]), s["text"].strip())
                 for s in out.get("segments", [])], "openai-whisper")
    except ImportError:
        return [], "none"
    except Exception as e:                       # noqa: BLE001
        print(f"  ! whisper failed on {Path(video_path).name}: {e}")
        return [], "none"


def _ocr_windows(video_path, ad):
    """OCR only the windows clarity actually reads: [0, 5) s and the final third."""
    if not shutil.which("tesseract"):
        return [], "none"
    late_start = ad.duration * ACTION_FRACTION
    windows = [(0.0, min(EARLY_MEANING_S, ad.duration), 2.0),
               (late_start, max(0.1, ad.duration - late_start), 1.0)]
    hits = []
    for start, dur, fps in windows:
        if dur <= 0:
            continue
        hits.extend(_ocr_window(video_path, start, dur, fps))
    return hits, "tesseract"


def _ocr_window(video_path, start, duration, fps):
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        cmd = ["ffmpeg", "-v", "error", "-ss", f"{start}", "-t", f"{duration}",
               "-i", str(video_path), "-vf", f"fps={fps},scale=iw*2:ih*2",
               str(tmp / "f_%04d.png")]
        try:
            subprocess.run(cmd, capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            return out
        for frame in sorted(tmp.glob("f_*.png")):
            idx = int(frame.stem.split("_")[1])
            t = start + (idx - 1) / fps
            try:
                r = subprocess.run(["tesseract", str(frame), "stdout", "--psm", "11"],
                                   capture_output=True, text=True, check=True)
            except (subprocess.CalledProcessError, FileNotFoundError):
                continue
            text = " ".join(r.stdout.split())
            if text:
                out.append((t, text))
    return out


# ================================================================================
# 6. score_message_clarity   (lexical only — no LLM path)
# ================================================================================
def score_message_clarity(content, manifest, ad):
    """Early identity (40%), early meaning (35%), final offer/CTA (25%).

    --reference-dir / ORB matching is deliberately NOT ported. It applied a hard
    max(early_identity, 0.6) floor from an uncalibrated threshold — 40% of clarity x 25%
    of the score, i.e. up to 6 percentile points — and with n=5 adjacent ads sit 20 points
    apart on a component, so it flips ranks on unvalidated evidence. It also injects a
    per-ad confound (the reference set matches ad 3's packaging but not ad 4's lifestyle
    shot) into a batch whose whole premise is that the ads are comparable. `brand_aliases`
    / `product_aliases` below cover the real case it was meant to catch, at no cost.
    """
    early_id = _window_text(content, 0.0, EARLY_IDENTITY_S)
    early_mean = _window_text(content, 0.0, EARLY_MEANING_S)
    late = _window_text(content, ad.duration * ACTION_FRACTION, ad.duration + 1e6)

    brands = [manifest["brand_name"]] + list(manifest.get("brand_aliases") or [])
    products = [manifest["product_name"]] + list(manifest.get("product_aliases") or [])

    parts = {
        "early_identity": max(_best_overlap(brands, early_id),
                              _best_overlap(products, early_id)),
        "early_meaning": max(_overlap(manifest["primary_problem"], early_mean),
                             _overlap(manifest["primary_benefit"], early_mean)),
        "action_clarity": max(_overlap(manifest["offer"], late),
                              _overlap(manifest["desired_cta"], late)),
    }
    parts["clarity_raw"] = sum(CLARITY_WEIGHTS[k] * parts[k] * 100 for k in CLARITY_WEIGHTS)
    # Keep the windows so a zero is visibly "we found nothing" on the page, rather than
    # silently "we scored it zero".
    parts["windows"] = {"earlyIdentity": early_id[:400],
                        "earlyMeaning": early_mean[:400], "late": late[:400]}
    return parts


def _window_text(content, t0, t1):
    chunks = [txt for s, e, txt in content.asr if s < t1 and e > t0]
    chunks += [txt for t, txt in content.ocr if t0 <= t < t1]
    return " ".join(chunks)


def _tokens(s):
    return {w for w in re.findall(r"[a-z0-9']+", (s or "").lower())
            if w not in STOPWORDS and len(w) > 1}


def _overlap(target, observed):
    """Continuous 0-1: fraction of the target's content words present in the window.
    A verbatim phrase match scores 1.0; a partial paraphrase scores proportionally."""
    tgt = _tokens(target)
    if not tgt:
        return 0.0
    obs_raw = (observed or "").lower()
    if target.strip().lower() and target.strip().lower() in obs_raw:
        return 1.0
    obs = _tokens(obs_raw)
    return float(len(tgt & obs) / len(tgt))


def _best_overlap(targets, observed):
    return max((_overlap(t, observed) for t in targets if str(t).strip()), default=0.0)


# ================================================================================
# 7/8. normalize within batch + score
# ================================================================================
def zscore(values):
    a = np.asarray(values, dtype=float)
    sd = a.std(ddof=0)
    return np.zeros_like(a) if sd < 1e-12 else (a - a.mean()) / sd


def percentile_rank(values):
    """100 * (count_below + 0.5*count_equal) / n — midrank, never 0 or 100.
    With n=5 and distinct values this yields exactly 10/30/50/70/90."""
    a = np.asarray(values, dtype=float)
    n = a.shape[0]
    d = a[:, None] - a[None, :]
    return 100.0 * ((d > 0).sum(axis=1) + 0.5 * (d == 0).sum(axis=1)) / n


def within_item_scores(feature_rows, arcs):
    """Score each ad AGAINST ITSELF, for when there is no cohort to rank it against.

    WHY THIS EXISTS. Everything above is comparative by construction: `percentile_rank` is
    a midrank over the batch, so with fewer than three ads it stops meaning anything and
    this module used to sys.exit rather than print a number it could not defend. That was
    the right call about percentiles and the wrong call about the product — a single ad
    still has an arc, still has weak spots, still has a hook that either lands or does
    not. Refusing to look at it at all threw away the review along with the ranking.

    So: same three components, same frozen weights, different reference point.

        H  the first HOOK_WINDOW_S, as a percentile against THIS clip's own timeline
        P  the share of the film whose higher-order lane holds at or above baseline
        C  clarity_raw, which was never batch-relative in the first place

    This is the scorer tools/edit/search.py:make_preflight_score_fn already uses to rank
    re-cuts of one film, so a single-ad review and its edit ladder are on one scale by
    construction rather than by coincidence.

    IT IS NOT THE SAME QUANTITY AS THE BATCH SCORE and must never be presented as though
    it were. An 80 here means "this clip's hook beats 80% of its own seconds"; an 80 in a
    batch means "better than 80% of the other ads you sent". The report carries
    `scoring.scale` so the UI can say which one it is showing.
    """
    # How much of the hook read comes from the ventral/salience lane vs the higher-order
    # one. Same split tools/edit/search.py uses, so a single-ad score and the edit ladder
    # underneath it are computed the same way rather than merely similarly.
    VENTRAL_SHARE = 0.65

    n = len(feature_rows)
    hook_tp = max(1, int(round(HOOK_WINDOW_S / TR_SECONDS)))

    def pct_rank_self(series, value):
        vals = [float(v) for v in series if v == v]      # drop NaN
        if not vals:
            return 0.5
        return float(sum(v < value for v in vals)) / float(len(vals))

    H, P, C = np.zeros(n), np.zeros(n), np.zeros(n)
    for i, row in enumerate(feature_rows):
        entry = (arcs or {}).get(row["ad_id"])
        lanes = entry[1] if entry else {}

        def series(name):
            lane = lanes.get(name)
            return list(getattr(lane, "raw", [])) if lane is not None else []

        salvent, higher = series("salventattn"), series("higher_order")

        if salvent or higher:
            v_hook = float(np.mean(salvent[:hook_tp])) if salvent else 0.0
            h_hook = float(np.mean(higher[:hook_tp])) if higher else 0.0
            H[i] = 100.0 * (VENTRAL_SHARE * pct_rank_self(salvent, v_hook)
                            + (1.0 - VENTRAL_SHARE) * pct_rank_self(higher, h_hook))
            P[i] = 100.0 * (sum(1 for v in higher if v >= 0.0) / len(higher)) if higher else 50.0
        else:
            # No lanes (--lanes primary, or a timing failure). Say 50 rather than 0: an
            # absent measurement is not a bad score, and a 0 would read as one.
            H[i], P[i] = 50.0, 50.0
        C[i] = 100.0 * float(row["clarity_raw"])

    zeros = np.zeros(n)
    return {"z_dorsattn": zeros, "z_salventattn": zeros, "z_higher_order": zeros,
            "z_visual": zeros, "h_raw": H / 100.0, "p_raw": P / 100.0, "c_raw": C / 100.0,
            "H": H, "P": P, "C": C, "scale": "within_item"}


def normalize_within_batch(feature_rows, arcs=None):
    """Batch z-scores and percentile ranks. All scores are relative to THIS batch.

    Under three ads there is no batch to be relative to, so this hands off to
    within_item_scores() rather than exiting. See its docstring for why the two are
    different quantities and why the report has to say which one it carries.
    """
    n = len(feature_rows)
    if n < 3:
        return within_item_scores(feature_rows, arcs)

    dorsattn = zscore([r["hook_dorsattn"] for r in feature_rows])
    salvent = zscore([r["hook_salventattn"] for r in feature_rows])
    h_raw = (dorsattn + salvent) / 2.0

    a = zscore([r["full_higher_order"] for r in feature_rows])       # higher-order
    v = zscore([r["full_visual"] for r in feature_rows])             # sensory
    p_raw = a - np.maximum(0.0, v - a)   # reward higher-order; penalise visual dominance

    c_raw = np.array([r["clarity_raw"] for r in feature_rows], dtype=float)

    return {
        "z_dorsattn": dorsattn, "z_salventattn": salvent,
        "z_higher_order": a, "z_visual": v,
        "h_raw": h_raw, "p_raw": p_raw, "c_raw": c_raw,
        "H": percentile_rank(h_raw), "P": percentile_rank(p_raw), "C": percentile_rank(c_raw),
    }


def compute_preflight_scores(feature_rows, arcs=None):
    """Hook, Processing, Clarity, overall score and ranks.

    Batch-relative at n>=3; within-item below that (see normalize_within_batch). The
    returned rows carry `scale` so nothing downstream has to re-derive which it got."""
    norm = normalize_within_batch(feature_rows, arcs)
    score = (WEIGHTS["hook"] * norm["H"]
             + WEIGHTS["processing"] * norm["P"]
             + WEIGHTS["clarity"] * norm["C"])
    order = np.argsort(-score, kind="stable")
    rank = np.empty(len(score), dtype=int)
    rank[order] = np.arange(1, len(score) + 1)

    rows = []
    for i, r in enumerate(feature_rows):
        rows.append({**r,
                     "rank": int(rank[i]),
                     "preflight_score": float(score[i]),
                     "hook_capture_score": float(norm["H"][i]),
                     "message_processing_score": float(norm["P"][i]),
                     "communication_clarity_score": float(norm["C"][i]),
                     "z_dorsattn": float(norm["z_dorsattn"][i]),
                     "z_salventattn": float(norm["z_salventattn"][i]),
                     "z_higher_order": float(norm["z_higher_order"][i]),
                     "z_visual": float(norm["z_visual"][i]),
                     "h_raw": float(norm["h_raw"][i]),
                     "p_raw": float(norm["p_raw"][i]),
                     # "batch" or "within_item". Travels with the row so the report, the
                     # CSV and the UI all state the same thing about what the number means
                     # instead of each inferring it from the ad count.
                     "scale": norm.get("scale", "batch"),
                     "cohort_n": len(feature_rows)})
    rows.sort(key=lambda r: r["rank"])
    return rows


# ================================================================================
# 9. audits
# ================================================================================
def comparability_audit(rows, y_lo, y_hi):
    """A3 — every stimulus opens with the SAME 5 s of black and silence, so the spread of
    the pre-content level across ads bounds how much of the between-ad difference is
    per-clip drift rather than the creative.

    A bound, not a proof: the model's temporal window is very likely non-causal, so the
    lead response can be contaminated by the content that follows it.
    """
    leads = {r["ad_id"]: r["baseline_scalar_lead"] for r in rows if "baseline_scalar_lead" in r}
    verdicts = [r.get("per_run_zscore", {}).get("verdict") for r in rows]
    per_run = any(v == "per_run_zscore_likely" for v in verdicts)
    out = {
        "baselineScalarByAd": {k: round(v, 6) for k, v in leads.items()},
        "perRunZscoreVerdict": "per_run_zscore_likely" if per_run else "fixed_stats_likely",
    }
    if len(leads) >= 2 and (y_hi - y_lo) > 0:
        spread = max(leads.values()) - min(leads.values())
        ratio = spread / (y_hi - y_lo)
        out["baselineSpread"] = round(spread, 6)
        out["baselineSpreadRatio"] = round(ratio, 4)
        verdict = "ok" if ratio < 0.15 else ("caution" if ratio <= 0.40 else "untrustworthy")
    else:
        verdict = "unknown"
    out["verdict"] = "untrustworthy" if per_run else verdict
    out["crossAdLevelsTrustworthy"] = out["verdict"] == "ok"
    out["note"] = (
        "Every stimulus opens with the same 5 s of black and silence, so the spread of "
        "the pre-content level across ads bounds how much of the between-ad level "
        "difference is per-clip drift rather than the creative. It is a bound, not a "
        "proof: the model's temporal window is likely non-causal, so the lead response "
        "can be contaminated by the content that follows."
    )
    return out


def sanity_audit(rows):
    """A4 — the single most valuable check here. A moving video versus a black screen MUST
    drive occipital cortex. If it doesn't, then the fsaverage5 [LH; RH] vertex-order
    assumption, the Schaefer mask, or the content/baseline alignment is wrong, and no
    number in the output means anything. It is the only cheap thing that can catch the
    vertex-order assumption FINDINGS.md flags as unverifiable."""
    vals = {r["ad_id"]: r["full_visual"] for r in rows}
    ok = all(v > 0 for v in vals.values()) if vals else False
    return {
        "visualPositive": bool(ok),
        "fullVisualByAd": {k: round(v, 5) for k, v in vals.items()},
        "note": ("Content minus a black screen MUST drive occipital cortex. If any value "
                 "here is <= 0, the fsaverage5 [LH; RH] vertex-order assumption, the "
                 "Schaefer mask, or the content/baseline timing alignment is wrong, and "
                 "no number in this file should be trusted."),
    }


# ================================================================================
# 10. export
# ================================================================================
def shared_y_domain(series_list, pad=0.08):
    """One domain across ALL ads — the whole reason the comparison is honest. Forced to
    span 0 so the baseline line is always on canvas."""
    vals = [v for s in series_list for v in s]
    if not vals:
        return [-1.0, 1.0]
    lo, hi = float(min(vals)), float(max(vals))
    if hi <= lo:
        hi = lo + 1e-6
    p = pad * (hi - lo)
    return [round(min(0.0, lo - p), 6), round(max(0.0, hi + p), 6)]


def transcode_web(video_path, out_path, max_px=540):
    """<=540px web copy + a poster frame. Never writes into public/ — this runs on a
    different machine; you copy the results back yourself."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    vf = (f"scale={max_px}:{max_px}:force_original_aspect_ratio=decrease,"
          "scale=trunc(iw/2)*2:trunc(ih/2)*2")
    try:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video_path),
                        "-vf", vf, "-c:v", "libx264", "-crf", "26", "-preset", "slow",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
                        "-movflags", "+faststart", str(out_path)], check=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"  ! transcode failed for {video_path}: {e}")
        return None, None
    poster = out_path.with_suffix(".jpg")
    dur = probe_video(out_path)["duration"]
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{min(1.0, dur / 2):.2f}",
                    "-i", str(out_path), "-frames:v", "1", "-q:v", "4", str(poster)],
                   check=False)
    return out_path, (poster if poster.exists() else None)


CSV_COLUMNS = [
    "rank", "ad_id", "filename", "preflight_score",
    "hook_capture_score", "message_processing_score", "communication_clarity_score",
    # the exactly-seven raw features
    "hook_dorsattn", "hook_salventattn", "full_higher_order", "full_visual",
    "early_identity", "early_meaning", "action_clarity",
    # diagnostics
    "hook_visual_diagnostic", "clarity_raw",
    "z_dorsattn", "z_salventattn", "z_higher_order", "z_visual", "h_raw", "p_raw",
    "arc_sd_raw", "arc_sd_mag", "baseline_scalar", "baseline_sd", "n_weak_spots",
    "duration_s", "asr_backend", "ocr_backend", "asr_segments", "ocr_frames",
    "timing_source_hook", "timing_source_full",
    "n_content_tp_full", "n_baseline_tp_full", "flags",
]


def export_csv(scores, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in scores:
            row = dict(r)
            for k, v in row.items():
                if isinstance(v, float):
                    row[k] = f"{v:.6f}"
            row["flags"] = ";".join(r.get("flags", [])) or ""
            w.writerow(row)
    print(f"Wrote {output_path}")


def print_table(scores):
    print("\n| Rank | Ad                   | Preflight | Hook | Processing | Clarity |")
    print("| ---: | -------------------- | --------: | ---: | ---------: | ------: |")
    for r in scores:
        print(f"| {r['rank']:>4} | {r['ad_id']:<20} | {r['preflight_score']:>9.0f} "
              f"| {r['hook_capture_score']:>4.0f} | {r['message_processing_score']:>10.0f} "
              f"| {r['communication_clarity_score']:>7.0f} |")
    print(f"\nEvery number is a percentile RELATIVE TO THIS BATCH of {len(scores)}. An 84 does")
    print("not mean an 84% chance of success, a predicted hold rate, or a validated")
    print("forecast. Use it to decide which ads to test first — not whether they will win.")


# ================================================================================
# probes  (no GPU, no weights)
# ================================================================================
def make_black_clip(path, seconds, baseline_audio="silence", w=540, h=960, fps=30):
    apad = ("anoisesrc=amplitude=0.0002:color=white:sample_rate=%d" % AUDIO_RATE
            if baseline_audio == "dither"
            else f"anullsrc=channel_layout=stereo:sample_rate={AUDIO_RATE}")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error",
         "-f", "lavfi", "-t", f"{seconds}", "-i", f"color=c=black:s={w}x{h}:r={fps}",
         "-f", "lavfi", "-t", f"{seconds}", "-i", apad,
         "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-ar", str(AUDIO_RATE), "-ac", "2", str(path)],
        check=True, capture_output=True)
    return path


def probe_events(seconds, baseline_audio):
    """Answer the ChunkEvents(min_duration=30) question empirically, in ~30 s, with no
    GPU and no weights. RUN THIS AT 16 FIRST — that is the real hook-stimulus length, and
    an empty dataframe there is exactly the failure that would otherwise surface 40
    minutes into a batch."""
    build_events, _ = _import_batch_extract()
    with tempfile.TemporaryDirectory() as tmp:
        clip = Path(tmp) / f"probe_{int(seconds)}s.mp4"
        make_black_clip(clip, seconds, baseline_audio)
        print(f"probe clip: {clip.name}  {seconds}s  {clip.stat().st_size} bytes")
        try:
            df = build_events(str(clip), trimodal=False)
        except ImportError as e:
            # NOT a chunking answer. Reporting a missing dependency as a stimulus-length
            # problem would send someone off raising --min-stimulus-s, which cannot help.
            print(f"\nbuild_events could not run: {type(e).__name__}: {e}")
            print("=> This is an ENVIRONMENT problem, not a chunking result. The probe "
                  "needs\n   neuralset (and pandas) installed. It still does NOT need "
                  "torch, the TRIBE\n   weights, or a GPU. Install the event stack and "
                  "re-run — the chunking\n   question is still unanswered.")
            return
        except Exception as e:                   # noqa: BLE001
            print(f"\nbuild_events RAISED: {type(e).__name__}: {e}")
            print(f"=> The event chain fails at {seconds}s. If it succeeds at a longer "
                  "duration,\n   raise --min-stimulus-s above this length.")
            return
        n = len(df) if hasattr(df, "__len__") else -1
        print(f"build_events returned {type(df).__name__}, rows={n}")
        if hasattr(df, "columns"):
            print(f"columns: {list(df.columns)}")
        try:
            for _, row in df.iterrows():
                print("  " + "  ".join(
                    f"{k}={row[k]!r}" for k in ("type", "start", "duration", "filepath")
                    if k in df.columns))
        except Exception:                        # noqa: BLE001
            print(f"  {df!r}"[:500])
        print()
        if n == 0:
            print("=> EMPTY. ChunkEvents FILTERS spans shorter than min_duration=30. The "
                  "--min-stimulus-s mitigation is REQUIRED; do not lower it below 30 s.")
        elif n > 0:
            print(f"=> Non-empty at {seconds}s. Chunking tolerates this length.")


def probe_stimuli(ads, cache_dir, min_stimulus_s, baseline_audio):
    """Build all stimuli and ffprobe them, so you can eyeball one before spending GPU."""
    sd = Path(cache_dir) / "stimuli"
    for ad in ads:
        for mode in ("hook", "full"):
            cd = content_duration(ad, mode)
            tp = tail_pad_for(cd, min_stimulus_s)
            out = sd / f"{ad.ad_id}.{mode}.mp4"
            build_stimulus(ad.path, mode, out, ad, tp, baseline_audio)
            spec = probe_video(out)
            want = LEAD_PAD_S + cd + tp
            ok = "ok " if abs(spec["duration"] - want) < 0.6 and spec["has_audio"] else "!! "
            print(f"{ok}{ad.ad_id}.{mode:<4} {spec['duration']:6.2f}s "
                  f"(want {want:.2f}) audio={spec['has_audio']} "
                  f"{spec['width']}x{spec['height']} lead={LEAD_PAD_S} "
                  f"content={cd:.2f} tail={tp:.2f}  -> {out}")


# ================================================================================
# main
# ================================================================================
def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("manifest", nargs="?", help="manifest.json")
    ap.add_argument("videos_dir", nargs="?", help="directory holding the ad mp4s")

    g = ap.add_argument_group("output")
    g.add_argument("--out-dir", default=None)
    g.add_argument("--json", dest="json_path", default=None)
    g.add_argument("--csv", dest="csv_path", default=None)
    g.add_argument("--web-videos", default=None,
                   help="transcode <=540px web copies here (omit = skip)")
    g.add_argument("--video-url-prefix", default="/preflight/videos")

    g = ap.add_argument_group("batch")
    g.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    g.add_argument("--allow-n", action="store_true")
    g.add_argument("--force", action="store_true",
                   help="downgrade comparability failures to warnings")
    g.add_argument("--only", default="", help="comma-separated ad ids; scores are then "
                                              "NOT batch-valid and the JSON says so")

    g = ap.add_argument_group("stimulus / model")
    g.add_argument("--min-stimulus-s", type=float, default=35.0,
                   help="pad the TAIL so every stimulus clears this (ChunkEvents "
                        "min_duration=30 mitigation). Default 35.")
    g.add_argument("--baseline-audio", choices=["silence", "dither"], default="silence")
    g.add_argument("--modality", choices=["av", "video"], default="av",
                   help="trimodal is deliberately unsupported: it needs gated "
                        "Llama-3.2-3B + uvx whisperx (see batch_extract.py:309)")
    g.add_argument("--hf-cache", default="./cache")
    g.add_argument("--cache-dir", default=str(Path(__file__).resolve().parent / ".cache"))

    g = ap.add_argument_group("arc")
    g.add_argument("--arc-roi", choices=sorted(ARC_ROIS), default="dorsattn")
    g.add_argument("--arc-scale", choices=["raw", "psc"], default="raw",
                   help="default lane; auto-switches to psc if the per-run z-score "
                        "test fires")
    g.add_argument("--lanes", choices=["all", "primary"], default="all")

    g = ap.add_argument_group("media")
    g.add_argument("--asr-model", default="small")
    g.add_argument("--asr-device", choices=["auto", "cuda", "cpu"], default="auto")
    g.add_argument("--no-asr", action="store_true")
    g.add_argument("--no-ocr", action="store_true")

    g = ap.add_argument_group("phases / caching")
    g.add_argument("--force-recompute", action="store_true")
    g.add_argument("--skip-tribe", action="store_true",
                   help="score from cached preds only; errors if any are missing")

    g = ap.add_argument_group("probes (exit after running)")
    g.add_argument("--list-tags", action="store_true")
    g.add_argument("--probe-events", type=float, nargs="?", const=35.0, default=None,
                   metavar="SECS")
    g.add_argument("--probe-stimuli", action="store_true")

    args = ap.parse_args()

    if args.probe_events is not None:
        probe_events(args.probe_events, args.baseline_audio)
        return
    if args.list_tags:
        list_tags(load_parcel_names(args.cache_dir))
        return
    if not args.manifest or not args.videos_dir:
        ap.error("manifest and videos_dir are required (unless --probe-events/--list-tags)")

    out_dir = Path(args.out_dir or (Path(args.manifest).parent / "out"))
    json_path = Path(args.json_path or out_dir / "batch.json")
    csv_path = Path(args.csv_path or out_dir / "preflight.csv")

    ads, manifest = validate_batch(args.manifest, args.videos_dir, args.batch_size,
                                   allow_n=args.allow_n, force=args.force)
    if args.only:
        keep = {s.strip() for s in args.only.split(",") if s.strip()}
        ads = [a for a in ads if a.ad_id in keep]
        if not ads:
            sys.exit(f"--only {args.only!r} matched no ads.")
        print(f"  ! --only: {len(ads)} of the batch. Percentile ranks over a subset are "
              "NOT batch-valid; the JSON is flagged partialBatch.")

    if args.probe_stimuli:
        probe_stimuli(ads, args.cache_dir, args.min_stimulus_s, args.baseline_audio)
        return

    build_events, describe_preds = _import_batch_extract()

    parcel_names = load_parcel_names(args.cache_dir)
    n_vertices = parcel_names.shape[0]
    print("\nBuilding ROI masks:")
    masks = {
        "dorsattn": mask_for(parcel_names, HOOK_ROIS["dorsattn"], "dorsattn"),
        "salventattn": mask_for(parcel_names, HOOK_ROIS["salventattn"], "salventattn"),
        "higher_order": mask_for(parcel_names, HIGHER_ORDER_TAGS, "higher_order"),
        "visual": mask_for(parcel_names, VISUAL_TAGS, "visual"),
    }
    arc_mask = mask_for(parcel_names, ARC_ROIS[args.arc_roi], f"arc:{args.arc_roi}")

    model = None
    if not args.skip_tribe:
        model = load_tribe_model(args.hf_cache, args.modality)

    stim_dir = Path(args.cache_dir) / "stimuli"
    feature_rows, arcs, warnings = [], {}, []

    for i, ad in enumerate(ads, 1):
        print(f"\n[{i}/{len(ads)}] {ad.ad_id}  ({ad.filename}, {ad.duration:.1f}s, "
              f"{ad.width}x{ad.height}@{ad.fps:g}fps)")

        results = {}
        for mode in ("hook", "full"):
            cd = content_duration(ad, mode)
            tp = tail_pad_for(cd, args.min_stimulus_s)
            total = LEAD_PAD_S + cd + tp
            if total > 55:
                warnings.append(f"{ad.ad_id}.{mode}: stimulus {total:.1f}s may split into "
                                "multiple chunks (ChunkEvents max_duration=60); chunk "
                                "ordering vs `segments` is unverified.")
                ad.flags.append("multi_chunk_possible")
            stim = build_stimulus(ad.path, mode, stim_dir / f"{ad.ad_id}.{mode}.mp4",
                                  ad, tp, args.baseline_audio)
            if args.skip_tribe and not (Path(args.cache_dir) / "preds"
                                        / f"{ad.ad_id}.{mode}.npy").exists():
                sys.exit(f"--skip-tribe but no cached preds for {ad.ad_id}.{mode}")
            results[mode] = run_tribe(
                model, build_events, describe_preds, stim, f"{ad.ad_id}.{mode}", ad, mode,
                n_vertices, tp, args.cache_dir, args.modality, args.baseline_audio,
                force=args.force_recompute)
            print(f"  {mode:<4} stimulus {results[mode].total_duration:.1f}s, "
                  f"{results[mode].preds.shape[0]} timepoints, "
                  f"timing from {results[mode].timing_source}")

        hook_c = extract_roi_contrasts(results["hook"], masks)
        full_c = extract_roi_contrasts(results["full"], masks)

        # A2 on the full run
        zt = per_run_zscore_test(results["full"].preds)

        arc = build_arc(results["full"], arc_mask, fps=1.0 / TR_SECONDS)
        lanes = {}
        if args.lanes == "all":
            for name in ("salventattn", "higher_order", "visual"):
                if name == args.arc_roi:
                    continue
                lanes[name] = build_arc(results["full"], masks[name], fps=1.0 / TR_SECONDS)

        # A5 — the arc and the score must agree about which timepoints are content
        arc_mean = float(np.mean(arc.raw)) if arc.raw.size else 0.0
        agree = abs(arc_mean - full_c[args.arc_roi]) < 1e-4
        if not agree:
            warnings.append(f"{ad.ad_id}: mean(arc)={arc_mean:.6f} != "
                            f"{args.arc_roi} contrast={full_c[args.arc_roi]:.6f}")

        # timing sanity — a wrong timepoint->second map silently mislocates every dip
        T = results["full"].preds.shape[0]
        timing_ok = abs(T - round(results["full"].total_duration)) <= 2
        if not timing_ok:
            warnings.append(f"{ad.ad_id}: {T} timepoints for a "
                            f"{results['full'].total_duration:.1f}s stimulus — arc withheld")
            ad.flags.append("timing_mismatch")

        print(f"  arc sd(raw)={arc.raw.std():.5f}  sd(mag)={arc.mag.std():.5f}  "
              f"baseline={arc.baseline_scalar:+.5f}  dips={len(arc.weak_spots)}")
        if arc.raw.std() < 0.25 * arc.mag.std():
            warnings.append(
                f"{ad.ad_id}: sd(raw) is much smaller than sd(mag) — the SIGNED arc may be "
                "cancellation noise. Consider plotting arc.mag instead.")
        print(f"  SANITY full_visual={full_c['visual']:+.5f} "
              f"{'ok' if full_c['visual'] > 0 else '<-- NOT POSITIVE, SEE A4'}")

        content = extract_content(ad.path, ad, args.cache_dir, args.asr_model,
                                  args.asr_device, no_asr=args.no_asr, no_ocr=args.no_ocr,
                                  force=args.force_recompute)
        print(f"  content: asr={content.asr_backend} ({len(content.asr)} seg), "
              f"ocr={content.ocr_backend} ({len(content.ocr)} frames)")
        if not content.asr and not content.ocr:
            ad.flags.append("no_content_extracted")
        if content.asr_backend == "none":
            ad.flags.append("no_asr_backend")
        if content.ocr_backend == "none":
            ad.flags.append("no_ocr_backend")

        clarity = score_message_clarity(content, manifest, ad)
        if clarity["early_identity"] == 0:
            ad.flags.append("no_identity_text")

        arcs[ad.ad_id] = (arc, lanes, timing_ok)
        feature_rows.append({
            "ad_id": ad.ad_id, "title": ad.title, "filename": ad.filename,
            # --- the exactly-seven raw features ---
            "hook_dorsattn": hook_c["dorsattn"],
            "hook_salventattn": hook_c["salventattn"],
            "full_higher_order": full_c["higher_order"],
            "full_visual": full_c["visual"],
            "early_identity": clarity["early_identity"],
            "early_meaning": clarity["early_meaning"],
            "action_clarity": clarity["action_clarity"],
            # --- diagnostics ---
            "hook_visual_diagnostic": hook_c["visual"],
            "clarity_raw": clarity["clarity_raw"],
            "clarity_windows": clarity["windows"],
            "arc_sd_raw": float(arc.raw.std()), "arc_sd_mag": float(arc.mag.std()),
            "baseline_scalar": arc.baseline_scalar,
            "baseline_scalar_lead": arc.baseline_scalar_lead,
            "baseline_sd": arc.baseline_sd,
            "n_weak_spots": len(arc.weak_spots),
            "per_run_zscore": zt,
            "preds_stats": {"hook": results["hook"].stats, "full": results["full"].stats},
            "arc_mean_equals_contrast": bool(agree),
            "duration_s": ad.duration,
            "asr_backend": content.asr_backend, "ocr_backend": content.ocr_backend,
            "asr_segments": len(content.asr), "ocr_frames": len(content.ocr),
            "transcript": [{"t": round(s, 2), "end": round(e, 2), "text": t}
                           for s, e, t in content.asr[:8]],
            "timing_source_hook": results["hook"].timing_source,
            "timing_source_full": results["full"].timing_source,
            "n_content_tp_full": full_c["_n_content_tp"],
            "n_baseline_tp_full": full_c["_n_baseline_tp"],
            "flags": list(ad.flags),
        })

    scores = compute_preflight_scores(feature_rows, arcs)
    by_id = {a.ad_id: a for a in ads}

    # A2 decides the default lane the page plots.
    per_run = any(r["per_run_zscore"]["verdict"] == "per_run_zscore_likely" for r in scores)
    default_scale = "psc" if per_run else args.arc_scale
    if per_run:
        print("\n" + "!" * 78)
        print("A2: per-vertex mean ~0 and SD ~1 => TRIBE looks z-scored PER RUN.")
        print("Cross-ad LEVELS are therefore not comparable; only arc SHAPES are.")
        print("Defaulting the chart to the psc lane and flagging the JSON.")
        print("!" * 78)

    y_raw = shared_y_domain([arcs[r["ad_id"]][0].raw for r in scores
                             if arcs[r["ad_id"]][2]])
    y_psc = shared_y_domain([arcs[r["ad_id"]][0].psc for r in scores
                             if arcs[r["ad_id"]][2]])

    web_dir = Path(args.web_videos) if args.web_videos else None
    ads_json = []
    for r in scores:
        aid = r["ad_id"]
        ad = by_id[aid]
        arc, lanes, timing_ok = arcs[aid]

        video_url = poster_url = None
        if web_dir:
            mp4, poster = transcode_web(ad.path, web_dir / f"{aid}.mp4")
            if mp4:
                video_url = f"{args.video_url_prefix.rstrip('/')}/{aid}.mp4"
            if poster:
                poster_url = f"{args.video_url_prefix.rstrip('/')}/{aid}.jpg"

        def lane_json(a):
            return {"raw": [round(float(v), 5) for v in a.raw],
                    "psc": [round(float(v), 4) for v in a.psc],
                    "mag": [round(float(v), 5) for v in a.mag],
                    "stats": arc_stats(a.raw, a.times)}

        ads_json.append({
            "id": aid, "title": ad.title, "filename": ad.filename,
            "rank": r["rank"], "durationS": round(ad.duration, 2),
            "video": video_url, "poster": poster_url,
            "timestamps": [round(float(t), 2) for t in arc.times],
            "arc": lane_json(arc) if timing_ok else None,
            "lanes": ({k: lane_json(v) for k, v in lanes.items()} if timing_ok else {}),
            "weakSpots": arc.weak_spots if timing_ok else [],
            "scores": {
                "preflight": round(r["preflight_score"], 1),
                "hook": round(r["hook_capture_score"], 1),
                "processing": round(r["message_processing_score"], 1),
                "clarity": round(r["communication_clarity_score"], 1),
            },
            "features": {
                "hookDorsattn": round(r["hook_dorsattn"], 5),
                "hookSalventattn": round(r["hook_salventattn"], 5),
                "fullHigherOrder": round(r["full_higher_order"], 5),
                "fullVisual": round(r["full_visual"], 5),
                "earlyIdentity": round(r["early_identity"], 3),
                "earlyMeaning": round(r["early_meaning"], 3),
                "actionClarity": round(r["action_clarity"], 3),
                "hookVisualDiagnostic": round(r["hook_visual_diagnostic"], 5),
                "clarityRaw": round(r["clarity_raw"], 2),
            },
            "clarity": {"windows": r["clarity_windows"]},
            "media": {"asrBackend": r["asr_backend"], "ocrBackend": r["ocr_backend"],
                      "transcript": r["transcript"]},
            "diagnostics": {
                "predsStats": r["preds_stats"],
                "perRunZscore": r["per_run_zscore"],
                "baselineScalar": round(r["baseline_scalar"], 6),
                "baselineScalarLead": round(r["baseline_scalar_lead"], 6),
                "baselineSd": round(r["baseline_sd"], 6),
                "arcSdRaw": round(r["arc_sd_raw"], 6),
                "arcSdMag": round(r["arc_sd_mag"], 6),
                "nContentTp": r["n_content_tp_full"], "nBaselineTp": r["n_baseline_tp_full"],
                "timingSource": {"hook": r["timing_source_hook"],
                                 "full": r["timing_source_full"]},
                "arcMeanEqualsContrast": r["arc_mean_equals_contrast"],
            },
            "flags": r["flags"],
        })

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generator": {"script": "demo/process_batch.py", "modality": args.modality,
                      "hfModel": HF_MODEL, "buildEventsFrom": "batch_extract.py",
                      "arcRoi": args.arc_roi},
        "license": "TRIBE v2 weights are CC BY-NC 4.0 — research / non-commercial use only.",
        "claim": {
            "validated": ("video -> brain activation (Meta TRIBE v2, public model, "
                          "benchmarked vs real fMRI)"),
            "hypothesis": ("activation -> attention/engagement (our downstream inference; "
                           "tested, not asserted)"),
        },
        "batch": {
            "name": manifest.get("batch_name") or Path(args.manifest).stem,
            "nAds": len(ads_json),
            **{k: manifest.get("batch", {}).get(k, "") for k in COMPARABILITY_KEYS},
            "durationBucket": duration_bucket(ads[0].duration),
            "message": {"brandName": manifest["brand_name"],
                        "productName": manifest["product_name"],
                        "primaryProblem": manifest["primary_problem"],
                        "primaryBenefit": manifest["primary_benefit"],
                        "offer": manifest["offer"], "desiredCta": manifest["desired_cta"]},
        },
        "weights": WEIGHTS,
        "scoring": {
            "nAds": len(ads_json),
            # Which reference point the numbers use. "batch" = a percentile against the
            # other ads in this run; "within_item" = against the clip's own timeline,
            # which is what a run of one or two ads gets. The two are not comparable and
            # the UI must say which it is showing — see within_item_scores().
            "scale": scores[0].get("scale", "batch") if scores else "batch",
            "cohortN": len(ads_json),
            "percentileGrid": sorted({round(float(v), 1)
                                      for v in percentile_rank(np.arange(len(ads_json)))}),
            "scoreRange": [round(100.0 * 0.5 / len(ads_json), 1),
                           round(100.0 * (len(ads_json) - 0.5) / len(ads_json), 1)],
            "partialBatch": bool(args.only),
            "smallNCaveat": (
                ("This ad was scored against ITSELF, not against other ads — there were "
                 f"only {len(ads_json)} in the run. The hook figure is a percentile "
                 "against this clip's own seconds. It is not comparable to a score from a "
                 "batch.")
                if (scores and scores[0].get("scale") == "within_item")
                else (f"Batch z-scores over n={len(ads_json)} are dominated by "
                      "single outliers. Treat rank order as ordinal, not the gaps "
                      "between ranks.")),
        },
        "chart": {
            "arcRoiLabel": {"dorsattn": "Dorsal attention network (Schaefer-400 / Yeo-7 DorsAttn)",
                            "salventattn": "Salience / ventral attention network (SalVentAttn)",
                            "higher_order": "Higher-order association cortex",
                            "visual": "Visual cortex"}[args.arc_roi],
            "defaultScale": default_scale,
            "units": {
                "raw": "TRIBE z-scored BOLD, baseline-subtracted (0 = black screen)",
                "psc": "baseline-SD units (delta / SD of the black-screen baseline)",
            },
            "xDomain": [0, round(max(a["durationS"] for a in ads_json), 2)],
            "yDomain": {"raw": y_raw, "psc": y_psc},
            "fpsArc": 1.0 / TR_SECONDS,
            "zeroLine": 0,
        },
        "bestId": ads_json[0]["id"],
        "worstId": ads_json[-1]["id"],
        "order": [a["id"] for a in ads_json],
        "ads": ads_json,
        "comparability": comparability_audit(scores, y_raw[0], y_raw[1]),
        "sanity": sanity_audit(scores),
        "warnings": warnings,
    }

    json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(json_path, "w") as f:
        json.dump(report, f, separators=(",", ":"))
    print(f"\nWrote {json_path} ({json_path.stat().st_size / 1024:.0f} KB)")
    export_csv(scores, csv_path)
    print_table(scores)

    if not report["sanity"]["visualPositive"]:
        print("\n" + "!" * 78)
        print("A4 FAILED: content-minus-black-screen did NOT drive visual cortex for every")
        print("ad. The [LH; RH] vertex-order assumption, the Schaefer mask, or the")
        print("content/baseline alignment is wrong. DO NOT TRUST ANY NUMBER ABOVE.")
        print("!" * 78)
    for w in warnings:
        print(f"  ! {w}")
    if any("no_asr_backend" in r["flags"] for r in scores):
        print("\n! No ASR backend (pip install faster-whisper). Clarity ran on OCR alone.")
    if any(r["timing_source_full"].startswith("assumed") for r in scores):
        print(f"\n  Note: segment timing fell back to the assumed {1 / TR_SECONDS:g} Hz "
              "grid. That matches the documented TRIBE v2 output, but it is an assumption.")
    print(f"\nNext: copy {json_path.name} -> public/preflight/batch_report.json"
          + (f", and {args.web_videos}/*.mp4 -> public/preflight/videos/" if web_dir else ""))


if __name__ == "__main__":
    main()
