# Colab walkthrough — extract everything for Compare-Your-Cuts + retention validation

Two GPU runs. Everything downstream (the ranking, the retention head) I run on your
laptop once you drop the outputs in Downloads. You only run the extraction.

| Run | What | Modality | Cost | Produces |
|---|---|---|---|---|
| **RUN 1** | the 5 variant cuts | **TRIMODAL** (A100) | ~15 min | attention **and** message lanes → Compare Your Cuts |
| **RUN 2** | 40 Mr.HiSum videos | **AV** (T4/A100) | ~1–2 h | attention lane → retention validation |

Do **RUN 1 first** — it's the fast win and you see the product. RUN 2 is the overnight science job.

---

## Before you start (once)

1. **Runtime:** Runtime ▸ Change runtime type ▸ **A100**, High-RAM.
2. **HuggingFace:** be logged in with **accepted access to `meta-llama/Llama-3.2-3B`** (the trimodal text branch needs it; RUN 1 only).
3. **Upload to your Drive** (`MyDrive/soma/`):
   - the 5 variants `data/ads/variants/demo_ad/*.mp4` → `MyDrive/soma/clips/variants/`
   - `data/mrhisum/sample_ids.txt` → `MyDrive/soma/mrhisum/sample_ids.txt`
   - open **`colab_run.ipynb`** in Colab (upload it or open from Drive)

Every clip emits `preds_<id>.npy` + `arc_<id>.csv` (`t_sec,global_mag,dan_mag,language_mag`)
into an isolated Drive `soma` folder — exactly what `compare_cuts.py` / `retention_head.py` consume.

---

## RUN 1 — Compare Your Cuts (variants · TRIMODAL · ~15 min)

Notebook **run-order (b)**:

1. **Cell 1** — install deps → then **Runtime ▸ Restart runtime** (required after the install).
2. **Cell T1** — trimodal deps + HF login. Wait for the `[OK]` before moving on.
3. **Cell 2B** — mount Drive; set `CLIP_DIRS = ["/content/drive/MyDrive/soma/clips/variants"]`.
4. **Cell 2C** — build the **DAN** (attention) + **LANGUAGE** (message) masks.
5. **Cell T3** — load the trimodal model.
6. **Cell T4** — extract → `arcs_trimodal/` (preds + two-lane arcs).
7. **Cell 5** — zip + download `arcs_trimodal`.

> Skip Cell 2 and Cells 3–4 in this run. Trimodal is what makes `language_mag` a real
> message lane (the text branch drives language cortex); AV would leave it under-driven.

---

## RUN 2 — Retention validation (Mr.HiSum · AV · ~1–2 h)

Use a **fresh runtime** (or Restart after RUN 1 to free the trimodal model). Notebook
**run-order (a)**, with one custom cell inserted:

1. **Cell 1** — install → **Restart runtime**.
2. **Cell 2B** — mount Drive.
3. **Cell 2C** — build masks (we need `roi_mask_dan.npy`).
4. **[PASTE the Mr.HiSum download cell below]** — downloads the 40 videos into `MyDrive/soma/clips/mrhisum/`.
5. Set `CLIP_DIRS = ["/content/drive/MyDrive/soma/clips/mrhisum"]`.
6. **Cell 3** — load the AV model.
7. **Cell 4** — extract → `arcs/` (preds + attention arc).
8. **Cell 5** — zip + download.

### Mr.HiSum download cell (paste as a new cell after Cell 2C)

```python
# === Mr.HiSum: download the 40 sampled videos into the Drive clips folder ===
!pip -q install yt-dlp
import os
CLIP_DIR = "/content/drive/MyDrive/soma/clips/mrhisum"
os.makedirs(CLIP_DIR, exist_ok=True)
ids = open("/content/drive/MyDrive/soma/mrhisum/sample_ids.txt").read().split()
print(f"downloading {len(ids)} videos → {CLIP_DIR}")
for vid in ids:
    if os.path.exists(f"{CLIP_DIR}/{vid}.mp4"):
        continue
    # name each file by its YouTube id so preds_<id>.npy matches retention_<id>.csv
    os.system(
        f'yt-dlp -q --no-warnings -f "mp4[height<=360]/best[height<=480]" '
        f'-o "{CLIP_DIR}/%(id)s.%(ext)s" "https://youtu.be/{vid}"'
    )
got = [f for f in os.listdir(CLIP_DIR) if f.endswith(".mp4")]
print(f"downloaded {len(got)}/{len(ids)} (some may be private/removed — that's fine)")
```

Filenames are the YouTube id, so `preds_<id>.npy` lines up with the staged
`retention_<id>.csv` labels automatically.

---

## Then hand it back to me

Drop **both** zips (`arcs_trimodal` from RUN 1, `arcs` from RUN 2) in your **Downloads**. I then run, on your laptop:

- **`compare_cuts.py`** on the 5 variant preds → the real *"which cut holds attention + lands the message best, and where each loses them"* — attention **and** message lanes, genuine within-item comparison.
- **`retention_head.py`** on the Mr.HiSum preds + staged labels → the first honest retention read: does TRIBE's attention signal predict `most-replayed`, beating the global-drive baseline **and** ffmpeg? A clean result *or* a clean null — either is real.

---

## Honest notes (keep these attached to any output)

- The 5 variants are **real cuts of one creative** → a genuine within-item comparison. The ranking is **predicted + relative**, never an absolute "this ad will win."
- Mr.HiSum `most-replayed` is a **retention PROXY** (rewatch ≠ not-leaving), and a *global* TRIBE signal is known **not** to predict it — so the head must beat global + ffmpeg to count.
- Both lanes (attention on a TVSum proxy, message with zero comprehension validation) stay **hypothesis-badged** until a real behavioral label validates them.
