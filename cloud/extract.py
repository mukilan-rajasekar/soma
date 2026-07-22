#!/usr/bin/env python3
"""Standalone TRIBE v2 extractor for a headless GPU box (RunPod / Vast / Lambda).

A faithful port of colab_overnight.ipynb Cells 2C / 3 / 4. It writes the SAME
artifacts the notebook does:

    preds_<id>.npy   (n_sec, 20484)  z-scored SIGNED BOLD, fsaverage5
    arc_<id>.csv     t_sec,global_mag,dan_mag,language_mag
    arc_<id>.json    normalized demo arc + weak-spot callouts

The ONLY difference from Colab is --workers. On Colab you get ~2 CPU cores, so
the dataloader that decodes video frames starves the GPU (the ~8 h wall). On a
many-core box we lift that cap. predict() runs the FROZEN model in eval mode
with shuffle=False, so the (n_sec, 20484) preds are BIT-IDENTICAL regardless of
worker count -- --workers changes wall-clock, never a validated number. We do
NOT touch fps / resolution / chunk size / precision (those WOULD move the number).

Usage:
    python extract.py --clips clips/mrhisum --out out/arcs_mrhisum --feature av
    python extract.py --clips clips/talk_ad --out out/arcs_talk_trimodal --feature trimodal

Resume-safe (skips clips whose preds_<id>.npy already exist) and one bad clip
never kills the batch.
"""
import argparse
import importlib
import json
import os
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import pandas as pd

FSAVERAGE5_N = 20484  # cortical surface vertices ([lh; rh], 10242/hemi)

# a-priori region substrings -- COPIED VERBATIM from build_roi_mask.py / notebook Cell 2C so
# the cloud box, the .py, and the notebook agree. DAN = attention lane; LANGUAGE = message lane.
NETWORK_REGIONS = {
    "dan": [                            # dorsal-attention network (ATTENTION lane)
        "S_intrapariet_and_P_trans",    # intraparietal sulcus
        "G_precentral",                 # frontal eye fields vicinity (precentral)
        "S_precentral-sup-part",
        "G_parietal_sup",
    ],
    "language": [                       # language / semantic-association network (MESSAGE lane)
        "G_front_inf-Triangul",         # IFG pars triangularis (Broca)
        "G_front_inf-Opercular",        # IFG pars opercularis (Broca)
        "Pole_temporal",                # temporal pole / anterior temporal lobe
        "S_temporal_sup",               # superior temporal sulcus (lexico-semantic)
        "G_temporal_middle",            # posterior middle temporal gyrus
        "G_pariet_inf-Angular",         # angular gyrus (semantic-integration hub)
    ],
}


# --------------------------------------------------------------------------------------
# ROI masks (fsaverage5 SURFACE via Destrieux) -- identical to notebook Cell 2C
# --------------------------------------------------------------------------------------
def build_surface_mask(regions):
    from nilearn import datasets
    atlas = datasets.fetch_atlas_surf_destrieux()
    labels = [l.decode() if isinstance(l, bytes) else str(l) for l in atlas["labels"]]

    def hemi(map_arr):
        m = np.zeros(len(map_arr), bool)
        for i, name in enumerate(labels):
            if any(r.lower() in name.lower() for r in regions):
                m |= (np.asarray(map_arr) == i)
        return m

    mask = np.concatenate([hemi(atlas["map_left"]), hemi(atlas["map_right"])])  # [lh; rh]
    if mask.shape[0] != FSAVERAGE5_N:
        raise SystemExit(f"mask length {mask.shape[0]} != {FSAVERAGE5_N} -- check nilearn atlas res")
    if mask.sum() == 0:
        raise SystemExit("ROI matched 0 vertices -- Destrieux substrings didn't hit; print atlas['labels'].")
    return mask


def load_or_build_masks(masks_dir):
    masks_dir = Path(masks_dir)
    masks_dir.mkdir(parents=True, exist_ok=True)
    out = {}
    for net, regions in NETWORK_REGIONS.items():
        p = masks_dir / f"roi_mask_{net}.npy"
        if p.is_file():
            m = np.asarray(np.load(p), bool)
            print(f"[mask] {net:9s} loaded {p.name}: {int(m.sum())}/{m.shape[0]} vertices")
        else:
            print(f"[mask] {net:9s} building from Destrieux (first run downloads the atlas) ...")
            m = build_surface_mask(regions)
            np.save(p, m)
            print(f"       wrote {p}  ({int(m.sum())}/{m.shape[0]} vertices, {m.mean():.1%} of cortex)")
        out[net] = m
    return out


# --------------------------------------------------------------------------------------
# whisperx int8 patch -- ONLY for trimodal. uvx-whisperx can land on a CPU-only isolated
# env; CTranslate2 then dies on "Requested float16 compute type not supported". Sed
# compute_type float16 -> int8 across the installed tribev2/neuralset .py files. Harmless
# no-op if nothing matches (e.g. whisperx uses the GPU). Mirrors notebook Cell 2(c).
# --------------------------------------------------------------------------------------
def patch_whisperx_int8(pkg_name):
    try:
        mod = importlib.import_module(pkg_name)
    except Exception as e:
        print(f"[int8-patch] {pkg_name}: not importable ({e!r}) - skipped")
        return
    base = os.path.dirname(mod.__file__)
    hits = []
    for root, _dirs, files in os.walk(base):
        for fn in files:
            if not fn.endswith(".py"):
                continue
            fp = os.path.join(root, fn)
            try:
                txt = open(fp, "r", encoding="utf-8").read()
            except Exception:
                continue
            if "float16" not in txt or "compute_type" not in txt:
                continue
            out, n = [], 0
            for line in txt.splitlines(keepends=True):
                if "compute_type" in line and "float16" in line:
                    line = line.replace("float16", "int8")
                    n += 1
                out.append(line)
            if n:
                open(fp, "w", encoding="utf-8").write("".join(out))
                hits.append((os.path.relpath(fp, base), n))
    if hits:
        print(f"[int8-patch] {pkg_name}: compute_type float16 -> int8 in:")
        for rel, n in hits:
            print(f"             {rel}  ({n} line(s))")
    else:
        print(f"[int8-patch] {pkg_name}: no compute_type float16 found - nothing to do")


# --------------------------------------------------------------------------------------
# preds -> arcs (verbatim helpers from the notebook)
# --------------------------------------------------------------------------------------
def describe_preds(preds, tag=""):
    p = np.asarray(preds, float)
    pct = np.percentile(p, [1, 50, 90, 99])
    print(f"  [preds {tag}] shape={p.shape} min={p.min():.3f} max={p.max():.3f} "
          f"mean={p.mean():.3f} std={p.std():.3f}")
    print(f"           pct(1/50/90/99)={pct[0]:.3f}/{pct[1]:.3f}/{pct[2]:.3f}/{pct[3]:.3f}"
          f"  frac<0={np.mean(p < 0):.2%}")
    if p.min() >= 0 and p.max() <= 1:
        print("           WARNING: values look bounded [0,1] - verify it's z-scored BOLD, not a prob.")


def arc_from_preds_multi(preds, lane_masks):
    p = np.abs(np.asarray(preds, float))
    global_mag = p.mean(axis=1)
    lanes = {}
    for name, m in lane_masks.items():
        m = np.asarray(m, bool)
        if m.shape[0] != p.shape[1]:
            raise ValueError(f"lane {name!r} mask length {m.shape[0]} != n_vertices {p.shape[1]}")
        lanes[name] = p[:, m].mean(axis=1)
    return global_mag, lanes


def detect_weak_spots(arc, fps=1.0, min_len_sec=3, drop_pctl=25):
    a = np.asarray(arc, float)
    if len(a) < 5:
        return []
    k = max(1, int(round(fps)))
    sm = np.convolve(a, np.ones(k) / k, mode="same")
    thr = np.percentile(sm, drop_pctl)
    low = sm <= thr
    spots, i, n = [], 0, len(a)
    min_len = int(round(min_len_sec * fps))
    while i < n:
        if low[i]:
            j = i
            while j < n and low[j]:
                j += 1
            if (j - i) >= min_len:
                spots.append({"start": round(i / fps, 2), "end": round(j / fps, 2),
                              "label": f"predicted dip - {round((j - i) / fps)}s low-activation stretch"})
            i = j
        else:
            i += 1
    return spots


def write_demo_json(out_dir, vid, arc, weak_spots, feature_name, modality, fps=1.0):
    a = np.asarray(arc, float)
    lo, hi = np.percentile(a, 2), np.percentile(a, 98)
    norm = np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)
    validated = ("video+audio+text -> brain activation (Meta TRIBE v2, public model, "
                 "benchmarked vs real fMRI)" if modality == "trimodal"
                 else "video -> brain activation (Meta TRIBE v2, public model, benchmarked vs real fMRI)")
    payload = {
        "video_id": vid, "fps_arc": fps, "duration_sec": round(len(a) / fps, 2),
        "feature": feature_name, "precomputed": True, "modality": modality,
        "claim": {"validated": validated,
                  "hypothesis": "activation -> engagement (our downstream inference; tested, not asserted)"},
        "timestamps": [round(i / fps, 2) for i in range(len(a))],
        "activation": [round(float(x), 4) for x in norm],
        "weak_spots": weak_spots,
    }
    (out_dir / f"arc_{vid}.json").write_text(json.dumps(payload, indent=2))


# --------------------------------------------------------------------------------------
# event builders (verbatim from the notebook -- AV manual path, trimodal shipped path)
# --------------------------------------------------------------------------------------
def build_events_av(video_path):
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


def build_events_trimodal(video_path):
    from tribev2.demo_utils import get_audio_and_text_events
    df = pd.DataFrame([{"type": "Video", "filepath": str(video_path), "start": 0,
                        "timeline": "default", "subject": "default"}])
    return get_audio_and_text_events(df, audio_only=False)


# --------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clips", required=True, help="dir of input .mp4 clips")
    ap.add_argument("--out", required=True, help="output dir (preds_/arc_ per clip)")
    ap.add_argument("--feature", choices=["av", "trimodal"], default="av",
                    help="av = audio+video (fast, no text); trimodal = +LLaMA text branch (message lane)")
    ap.add_argument("--workers", type=int, default=0,
                    help="dataloader workers (0 = auto = cpu_count-2). This is the speed knob; "
                         "predict() is frozen/eval/shuffle=False so preds are bit-identical.")
    ap.add_argument("--masks-dir", default=None, help="where roi_mask_*.npy live/are written (default: --out parent)")
    ap.add_argument("--roi", default="dan", help="lane that drives arc_<id>.json (dan|language|global)")
    ap.add_argument("--glob", default="*.mp4")
    ap.add_argument("--cache", default="./cache", help="HF/feature cache dir (local SSD -> fast)")
    args = ap.parse_args()

    if args.workers <= 0:
        args.workers = max(1, (os.cpu_count() or 4) - 2)
    os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "300")
    if not (os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")):
        print("[warn] no HF_TOKEN in env -- gated Llama-3.2-3B (trimodal) will 401. "
              "export HF_TOKEN=... before running trimodal.")

    clip_dir = Path(args.clips)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    masks_dir = Path(args.masks_dir) if args.masks_dir else out_dir.parent
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)

    clips = sorted(clip_dir.glob(args.glob))
    if not clips:
        raise SystemExit(f"0 clips in {clip_dir} (glob={args.glob!r}). Upload them there first.")
    print(f"clips     = {clip_dir}  ({len(clips)} found)")
    print(f"out       = {out_dir}")
    print(f"feature   = {args.feature}   workers = {args.workers}   cpu_count = {os.cpu_count()}")

    import torch
    if not torch.cuda.is_available():
        print("[warn] NO CUDA -- extraction will be painfully slow on CPU. Use a GPU box.")
    else:
        print(f"GPU OK -> {torch.cuda.get_device_name(0)}")

    lane_masks = load_or_build_masks(masks_dir)

    from tribev2.demo_utils import TribeModel
    feats = ["audio", "video", "text"] if args.feature == "trimodal" else ["audio", "video"]
    if args.feature == "trimodal":
        import tribev2  # noqa: F401
        patch_whisperx_int8("tribev2")
        patch_whisperx_int8("neuralset")
    print(f"Loading facebook/tribev2  features_to_use={feats} ...")
    model = TribeModel.from_pretrained(
        "facebook/tribev2", cache_folder=cache,
        config_update={"data": {"features_to_use": feats, "num_workers": args.workers}},
    )

    # Belt-and-suspenders: cap every DataLoader at --workers so a stray shipped default (20)
    # can't exceed the box; and floor a missing value UP to --workers so we actually use the cores.
    _orig = torch.utils.data.DataLoader.__init__
    _notified = {"done": False}

    def _capped(self, *a, num_workers=0, **k):
        num_workers = min(num_workers or args.workers, args.workers)
        _orig(self, *a, num_workers=num_workers, **k)
        if not _notified["done"]:
            print(f"[speed] DataLoader workers -> {self.num_workers} (was shipped-default 20 on 2-core Colab).")
            _notified["done"] = True

    torch.utils.data.DataLoader.__init__ = _capped
    print(f"Model loaded. modality={args.feature}.")

    build_events = build_events_trimodal if args.feature == "trimodal" else build_events_av
    demo_roi = args.roi if args.roi in lane_masks else "global"

    done = {p.stem[len("preds_"):] for p in out_dir.glob("preds_*.npy")}
    todo = [c for c in clips if c.stem not in done]
    print(f"{len(clips)} clips | {len(done)} already done -> {len(todo)} to run\n")

    printed_scale = False
    n_ok = n_fail = 0
    clip_secs = []
    left = len(todo)
    for vp in clips:
        vid = vp.stem
        npy = out_dir / f"preds_{vid}.npy"
        preds = None
        try:
            if npy.exists():
                print(f"[skip-cached] {vid}")
                preds = np.load(npy)
            else:
                print(f"[predict-{args.feature}] {vid} ... ({left} to go)")
                t0 = time.time()
                events = build_events(vp)
                preds, _seg = model.predict(events=events)
                preds = np.asarray(preds, float)
                np.save(npy, preds.astype(np.float32))
                dt = time.time() - t0
                clip_secs.append(dt)
                left -= 1
                avg = sum(clip_secs) / len(clip_secs)
                print(f"    took {dt:.0f}s | avg {avg:.0f}s/clip | ETA {left}: ~{avg * left / 60:.0f} min")
            if not printed_scale:
                describe_preds(preds, tag=vid)
                printed_scale = True

            global_mag, lanes = arc_from_preds_multi(preds, lane_masks)
            T = len(global_mag)
            lane_names = list(lanes)
            with open(out_dir / f"arc_{vid}.csv", "w") as f:
                f.write("t_sec,global_mag" + "".join(f",{n}_mag" for n in lane_names) + "\n")
                for t in range(T):
                    f.write(f"{t},{global_mag[t]:.6f}"
                            + "".join(f",{lanes[n][t]:.6f}" for n in lane_names) + "\n")

            demo_arc = lanes[demo_roi] if demo_roi in lanes else global_mag
            feat = demo_roi if demo_roi in lanes else "global"
            spots = detect_weak_spots(demo_arc)
            write_demo_json(out_dir, vid, demo_arc, spots, feature_name=feat, modality=args.feature)
            print(f"  ok: T={T}s  weak_spots={len(spots)}  feature={feat}  cols={['global'] + lane_names}")
            n_ok += 1
        except Exception as e:  # one bad clip must not kill the batch
            n_fail += 1
            print(f"  [ERROR] {vid}: {e!r} - skipping, batch continues")
            traceback.print_exc()
        try:
            import gc
            if preds is not None:
                del preds
            gc.collect()
            torch.cuda.empty_cache()
        except Exception:
            pass

    print(f"\n[batch done] ok={n_ok} failed={n_fail} -> {out_dir}")
    print("preds are z-scored SIGNED BOLD (~[-1,1]), NOT probabilities.")


if __name__ == "__main__":
    sys.exit(main())
