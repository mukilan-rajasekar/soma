# BRANCH D — Close the #1 beachhead (Mr.HiSum retention head): Colab work-list

**Verdict:** The #1 gate is **purely GPU-blocked**. Everything recoverable from disk is
already staged. The ONLY missing artifact is `data/mrhisum/preds/preds_<id>.npy` for the 40
labeled videos (+ an ffmpeg `baseline_<id>.csv` for gate 3, see §4). Both require the Colab/GPU
TRIBE extractor. No further hunting on disk will recover them.

- Labels: **DONE** — 40 × `data/mrhisum/retention_<id>.csv` (`t_sec,most_replayed∈[0,1]`,
  min-maxed), derived from the staged `data/mrhisum/mr_hisum.h5` (148 MB) + `metadata.csv`.
- ID list: **DONE** — `data/mrhisum/sample_ids.txt` is byte-identical to the 40 retention IDs
  (`diff` empty).
- ROI mask: **DONE** — `data/roi_mask_dan.npy` present (also rebuilt by notebook Cell 2C).
- Preds: **MISSING** — `data/mrhisum/preds/` does not exist; 0 of the 40 IDs appear in any
  `~/Downloads/*.zip` or in `data/arcs/` (verified by exact fixed-string cross-match, 738
  archive+local entries scanned, 0 matches).
- Clips: **NOT staged** — 0 Mr.HiSum `.mp4` on disk; downloaded on Colab (yt-dlp cell below).

---

## 1. The 40 YouTube IDs (== `data/mrhisum/sample_ids.txt`)

```
LmuqbIMWuKM XHMFp84xo64 eGk2XZr7QsE pDsXyhr0Yp8 djHfi0JZ2e0 gb8XTzeLQfw wYYJlqpSEs4 wgquFBy5A78
-aaq0ipT7DM 2QEm9fTmfG4 QAylDns--IY Er-YRiZ379E ieuZnBHeTlI n6mB4l2odsg wCsSzZU-sQ4 Bxid2FlP_50
C7UMtzxyHnw abWx8RTg8kY l1Ii1W4seuU H5bon-Rmcb4 Qx3Q12SqbNY YzjZbCB2U68 ZGn9M9TQhIw aLUgW1c5NiU
dxdBcTuLnFA kGKtyGUZFoU ngmwBMzurXE oclE0oYo3Jo 2mf-ZXaUXQA CTT65Qvt5TE Dxrx8PGtwOU eII8Nws0kfQ
9g0qflm00b8 IkCX6UpWwzo JPC9RLaJjko RqNRJbqLCP8 zPzuoyR3a7U 0WrlV1i__fc UBVjY3MXDA4 XsJ0ZEwShZ4
```

Labels cover ~126 s/video (min 121, max 132; total ≈ 5064 video-seconds). Clip filenames MUST
be the YouTube id so `preds_<id>.npy` lines up with `retention_<id>.csv` automatically.

---

## 2. Colab RUN (AV extraction — notebook `colab_run.ipynb`, run-order (a))

Use a fresh A100/T4 runtime, High-RAM. Verified: `colab_run.ipynb` contains all referenced
cells (Cell 2C / Cell 3 / Cell 4 / Cell 5, `roi_mask_dan`, `CLIP_DIRS`, `batch_extract`).

**Before you start:** upload `data/mrhisum/sample_ids.txt` to `MyDrive/soma/mrhisum/sample_ids.txt`.

Cell order:
1. **Cell 1** — install deps → **Runtime ▸ Restart runtime**.
2. **Cell 2B** — mount Drive.
3. **Cell 2C** — build masks (produces `roi_mask_dan.npy`, the attention ROI the head uses).
4. **[PASTE download cell — §3 below]** — yt-dlp the 40 videos into `MyDrive/soma/clips/mrhisum/`.
5. Set `CLIP_DIRS = ["/content/drive/MyDrive/soma/clips/mrhisum"]`.
6. **[PASTE baseline cell — §4 below]** — CPU ffmpeg covariates → `baseline_<id>.csv` (gate 3).
7. **Cell 3** — load the **AV** model (attention lane; NOT trimodal — retention needs AV only).
8. **Cell 4** — extract → `arcs/` : `preds_<id>.npy` (n_sec, 20484) + `arc_<id>.csv`
   (`t_sec,global_mag,roi_mag`).
9. **Cell 5** — zip + download `arcs` (and the `baseline` folder from §4).

> AV, not trimodal: the retention head reads the attention/DAN lane. Trimodal (RUN 1) is only
> for the Compare-Cuts message lane and is a separate job.

---

## 3. Mr.HiSum download cell (paste as a new cell after Cell 2C)

```python
# === Mr.HiSum: download the 40 sampled videos into the Drive clips folder ===
!pip -q install yt-dlp
import os
CLIP_DIR = "/content/drive/MyDrive/soma/clips/mrhisum"
os.makedirs(CLIP_DIR, exist_ok=True)
ids = open("/content/drive/MyDrive/soma/mrhisum/sample_ids.txt").read().split()
print(f"downloading {len(ids)} videos -> {CLIP_DIR}")
for vid in ids:
    if os.path.exists(f"{CLIP_DIR}/{vid}.mp4"):
        continue
    # name each file by its YouTube id so preds_<id>.npy matches retention_<id>.csv
    os.system(
        f'yt-dlp -q --no-warnings -f "mp4[height<=360]/best[height<=480]" '
        f'-o "{CLIP_DIR}/%(id)s.%(ext)s" "https://youtu.be/{vid}"'
    )
got = [f for f in os.listdir(CLIP_DIR) if f.endswith(".mp4")]
print(f"downloaded {len(got)}/{len(ids)} (some may be private/removed -- that's fine)")
```

---

## 4. ffmpeg baseline cell — REQUIRED for gate 3 (paste after §3, before Cell 3)

The RUN-2 recipe in `COLAB-WALKTHROUGH.md` produces preds only. `retention_head.py` gate 3
(**beat ffmpeg** — mandatory per `docs/strategy/OPPORTUNITIES.md`) needs `baseline_<id>.csv`.
Cheapest path: run the repo's CPU extractor on the same clips **on Colab**, zip alongside preds.
(Without it, `retention_head.py` still runs but silently SKIPS gate 3 — an incomplete #1.)

```python
# === ffmpeg baseline (loudness/cuts/luminance/motion) for the gate-3 covariates ===
# assumes the repo is available on Colab (git clone / Drive copy); adjust REPO path.
REPO = "/content/soma"   # dir containing baseline_extract.py
!python {REPO}/baseline_extract.py \
    --video-dir /content/drive/MyDrive/soma/clips/mrhisum \
    --out /content/drive/MyDrive/soma/mrhisum_baseline --glob "*.mp4"
# -> baseline_<id>.csv (t_sec,loudness,cuts,luminance,motion). Zip this folder too (Cell 5).
```

Alternative (no repo on Colab): also download the `clips/mrhisum` folder to `~/Downloads` and
run `baseline_extract.py` locally against it before the final command in §6.

---

## 5. Hand back — where to drop the output

Drop into `~/Downloads/`:
- `arcs` zip from Cell 5 → contains `preds_<id>.npy` + `arc_<id>.csv` for the 40.
- `mrhisum_baseline` zip → contains `baseline_<id>.csv` for the 40.

Stage locally:
```bash
cd "/Users/mukilan/Projects/Brain Project" && source .venv/bin/activate
mkdir -p data/mrhisum/preds data/mrhisum/baseline
unzip -o ~/Downloads/<arcs_zip>.zip          -d /tmp/mrh_arcs
unzip -o ~/Downloads/<mrhisum_baseline>.zip  -d /tmp/mrh_base
cp /tmp/mrh_arcs/**/preds_*.npy   data/mrhisum/preds/
cp /tmp/mrh_base/**/baseline_*.csv data/mrhisum/baseline/
# sanity: confirm fsaverage5 (20484), not Schaefer-1000:
python check_preds_space.py data/mrhisum/preds/preds_*.npy | head
```

---

## 6. The ONE local command → the #1 validation number

```bash
cd "/Users/mukilan/Projects/Brain Project" && source .venv/bin/activate
python retention_head.py \
  --preds-dir data/mrhisum/preds \
  --retention-dir data/mrhisum \
  --masks-dir data --roi dan \
  --baseline-dir data/mrhisum/baseline \
  --features roi \
  --out      validation/recheck/D-hunt-colab-worklist/retention_head.csv \
  --json-out validation/recheck/D-hunt-colab-worklist/retention_head.json \
  --save     validation/recheck/D-hunt-colab-worklist/head_retention.json
```

Reads the 3-gate verdict from stdout / the JSON:
- **gate 1** beats circular-shift perm null (Stouffer p<0.05, median r≥0.10),
- **gate 2** beats the nested GLOBAL baseline (paired sign-flip p<0.05),
- **gate 3** beats ffmpeg (partial-Spearman after loudness/cuts/luminance/motion).

Exploratory add-on (report side-by-side, Holm-corrected, never quoted because it beat `roi`):
rerun with `--features roi+temporal`. Primary pre-registered set is `--features roi`.

**Honesty caveat that never comes off:** most-replayed is a RETENTION PROXY (rewatch ≠
not-leaving); n = **videos** (40), not seconds; a clean NULL here is a real, reportable result.

---

## 7. Honest cost / effort to close #1

- **Blocker:** GPU only. Nothing more is recoverable from local disk.
- **Videos:** 40 (labels + IDs + masks already staged; only preds + baseline missing).
- **GPU time:** ~5064 video-seconds. At TRIBE's ~2:45 per 29 s clip (~5.7 GPU-s/video-s):
  **≈ 8 h on a T4, ≈ 3–4 h on an A100** (the walkthrough's "1–2 h" is optimistic for these
  ~2-min clips). Framing: an overnight A100 job.
- **Human wall-clock:** ~30–60 min of hands-on (upload ids, run cells, download zips, stage,
  one local command); the rest is unattended GPU.
- **Risk:** some of the 40 YouTube ids may be private/removed at download time → fewer than 40
  preds. n drops but the test still runs on whatever downloaded; re-sample from
  `data/mrhisum/metadata.csv` if n falls too low for power.
