#!/usr/bin/env python3
"""
make_synthetic_data.py — fabricate a full set of pipeline inputs with a KNOWN
planted signal, so the whole analysis pipeline can be dry-run and asserted without
a GPU or real data.

Writes into tests/synth/:
  preds_<id>.npy         fake TRIBE output (T, 20484), z-scored, with signal planted
                         ONLY in an ROI vertex block (global stays ~null by design)
  roi_dmn.npy / roi_valence.npy / roi_arousal.npy   boolean masks (length 20484)
  ydata-tvsum50.mat      synthetic TVSum .mat (per-FRAME 20-annotator importance)
  liris_<id>.csv         fake per-second valence/arousal ground truth
  synth_clip.mp4         tiny real video (for the baseline extractor)
  MANIFEST.json          which videos carry signal vs are null controls

Design so tests can assert correctness:
  - "signal" videos: ROI magnitude tracks a latent interest L(t); human importance
    is L(t)+noise  ->  honest_corr_timeseries should find ROI ~ human (positive),
    while global stays ~null (nothing planted globally).
  - "null" video: no planted signal anywhere -> everything should read as noise.
"""
import json
import os

import numpy as np

V = 20484           # fsaverage5 vertices
FPS = 30
SHOT_SEC = 2.0
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "synth")

# vertex blocks used as "ROIs"
DMN = slice(0, 2000)
VAL = slice(2000, 2500)
ARO = slice(2500, 3000)


def latent(T, rng, kind="interest"):
    """A smooth 0..1 latent arc over T seconds."""
    t = np.arange(T)
    base = 0.5 + 0.35 * np.sin(2 * np.pi * t / (T / (2.5 + rng.random())))
    bumps = sum(np.exp(-((t - c) ** 2) / (2 * (2 + 3 * rng.random()) ** 2))
                for c in rng.integers(5, T - 5, size=3))
    a = base + 0.5 * bumps / (bumps.max() + 1e-9)
    a = (a - a.min()) / (a.max() - a.min() + 1e-9)
    return a


def make_preds(T, L, rng, signal=True):
    """(T,V) z-scored noise; if signal, ROI magnitude tracks L(t)."""
    p = rng.standard_normal((T, V)).astype(np.float32)
    if signal:
        # shift ROI-vertex means by alpha*L(t): higher L -> larger |activation|
        p[:, DMN] += (1.4 * L[:, None]).astype(np.float32)
        p[:, VAL] += (1.1 * (L - 0.5)[:, None]).astype(np.float32)   # signed (valence)
        p[:, ARO] += (1.2 * L[:, None]).astype(np.float32)
    return p


def make_mat(entries):
    """Write a TVSum-shaped .mat: struct array 'tvsum50' with per-frame user_anno."""
    from scipy.io import savemat
    recs = []
    for e in entries:
        recs.append({
            "video": e["id"], "category": "synthetic",
            "length": float(e["T"]), "nframes": int(e["T"] * FPS),
            "user_anno": e["user_anno"].astype(np.float64),  # (nframes, 20)
        })
    # struct array as object array of dicts
    arr = np.empty((1, len(recs)), dtype=object)
    for i, r in enumerate(recs):
        arr[0, i] = r
    savemat(os.path.join(OUT, "ydata-tvsum50.mat"), {"tvsum50": recs}, do_compression=True)


def make_video(path, T=6):
    """Tiny real mp4 with a scene cut + brightness change (for baseline features)."""
    import imageio.v2 as imageio
    w, h = 128, 72
    frames = []
    for i in range(T * FPS):
        val = 40 if i < (T * FPS) // 2 else 200          # hard brightness cut at midpoint
        jitter = int(30 * np.sin(i / 4.0))
        frame = np.full((h, w, 3), np.clip(val + jitter, 0, 255), np.uint8)
        frames.append(frame)
    imageio.mimwrite(path, frames, fps=FPS, codec="libx264", quality=6,
                     ffmpeg_log_level="error")


def main():
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(42)
    videos = [
        {"id": "synth_sig1", "T": 120, "signal": True},
        {"id": "synth_sig2", "T": 90,  "signal": True},
        {"id": "synth_null", "T": 100, "signal": False},
    ]
    manifest, mat_entries = [], []
    for v in videos:
        T = v["T"]
        L = latent(T, rng)
        preds = make_preds(T, L, rng, signal=v["signal"])
        np.save(os.path.join(OUT, f"preds_{v['id']}.npy"), preds)

        # per-frame 20-annotator importance = upsampled L + noise (signal videos);
        # pure noise for the null control
        nframes = T * FPS
        Lf = np.interp(np.linspace(0, T - 1, nframes), np.arange(T), L)
        anno = np.zeros((nframes, 20))
        for a in range(20):
            if v["signal"]:
                anno[:, a] = np.clip(1 + 4 * Lf + rng.normal(0, 0.8, nframes), 1, 5)
            else:
                anno[:, a] = np.clip(3 + rng.normal(0, 1.0, nframes), 1, 5)
        mat_entries.append({"id": v["id"], "T": T, "user_anno": anno})

        # fake LIRIS per-second valence/arousal (valence ~ L-0.5, arousal ~ L)
        val = np.clip((L - 0.5) * 1.6 + rng.normal(0, 0.15, T), -1, 1)
        aro = np.clip(L + rng.normal(0, 0.1, T), 0, 1)
        with open(os.path.join(OUT, f"liris_{v['id']}.csv"), "w") as f:
            f.write("t_sec,valence,arousal\n")
            for t in range(T):
                f.write(f"{t},{val[t]:.4f},{aro[t]:.4f}\n")
        manifest.append({"id": v["id"], "T": T, "signal": v["signal"]})

    # masks
    for name, sl in [("dmn", DMN), ("valence", VAL), ("arousal", ARO)]:
        m = np.zeros(V, bool); m[sl] = True
        np.save(os.path.join(OUT, f"roi_{name}.npy"), m)

    make_mat(mat_entries)
    make_video(os.path.join(OUT, "synth_clip.mp4"))
    json.dump({"videos": manifest, "fps": FPS, "shot_sec": SHOT_SEC},
              open(os.path.join(OUT, "MANIFEST.json"), "w"), indent=2)
    print(f"[synth] wrote {len(videos)} videos + masks + .mat + video to {OUT}")
    print("  signal videos: synth_sig1, synth_sig2  | null control: synth_null")


if __name__ == "__main__":
    main()
