# PIPELINE.md — Day-2 runbook (no Imran, 0 → pitch/MVP)

Two tracks run in parallel. Track A is the honest validation signal; Track B is
the demo. The GPU is only needed to *generate* arcs — once cached, everything
downstream (stats, demo) is CPU/browser only.

Owners (suggested): **F1** = GPU/inference · **F2** = TVSum + validation ·
**F3** = hero clips + demo frontend.

---

## 0. Before you touch data — pre-register (15 min, all founders)
Read and lock `PREREGISTRATION.md`. It fixes the two features (`global` baseline +
`roi` open test), the DMN region, first-differencing, the circular-shift null, the
LOAO ceiling, and the "report every video" rule. **Do not change it after seeing
results.**

---

## Track A — the honest validation signal

### A1. Provision the GPU (F1)
Full trimodal (video+audio+text) needs ~28–32 GB VRAM → **A100-40GB** (or L40S).
Rent by the hour on RunPod / Lambda / Vast (~$1–2/hr). Trimodal also needs (a) gated
**`meta-llama/Llama-3.2-3B`** (the *base* model — the exact text embedder the checkpoint was
trained with) access on Hugging Face — request it now at
<https://huggingface.co/meta-llama/Llama-3.2-3B>; and (b) `pip install -U uv` (the text branch
transcribes dialogue itself via `uvx whisperx` — no transcript needed). **Full trimodal how-to +
provenance: see `TRIMODAL.md`.**
```bash
# on the box, ONCE:
pip install -U "numpy>=1.26,<2.1" scipy pandas nilearn   # neuralset needs numpy<2.1
export HF_HUB_DOWNLOAD_TIMEOUT=300
# pre-download all weights to the persistent volume, then run under tmux/nohup
```

### A1b. Smoke-test the neuralset/tribev2 API + pin versions (F1) — do this FIRST
Before spending GPU time on any long batch, run the fast API smoke test **on the box**:
```bash
python -m pytest tests/test_build_events.py -q   # ~10s
```
This catches a **neuralset / tribev2 API break in ~10 seconds** instead of at minute 1 of a
multi-hour batch — the model download + extraction is the expensive part, so you don't want to
discover a breaking upstream change after paying for it. If it passes, **pin what you just
resolved** so the box is reproducible: record the exact **tribev2 commit** and the **resolved
neuralset version** into `requirements-gpu.txt`.
```bash
pip freeze | grep -iE 'neuralset|tribe' >> requirements-gpu.txt   # capture resolved versions
# + note the pinned facebook/tribev2 commit SHA alongside it in requirements-gpu.txt
```

### A2. Get TRIBE running on ONE clip + confirm the scale (F1)
```bash
# prove the VERIFIED audio+video config first (default; fastest to a result):
python batch_extract.py --video-dir ./one_clip --out ./data/arcs   # --modality av
```
Watch the printed `[preds ...]` line: it must be **z-scored, signed (~[-1,+1]),
with a real fraction < 0**. If it looks bounded [0,1], stop and investigate before
trusting anything. (This is the day's #1 de-risk: if the model doesn't run, nothing
else matters.)

Your Day-2 decision was **full trimodal** (adds the text/LLaMA branch). Add
`--modality trimodal` **once gated Llama-3.2-3B access is confirmed** — do it as an
upgrade after `av` is proven end-to-end, not as the first thing you fight on the
box. Write it to a **separate** `--out ./data/arcs_trimodal` so you can compare av vs
trimodal on the same clips (they're both per-second `(T,20484)` → line up second-by-second;
report **both**, don't cherry-pick). `--modality trimodal` pre-flights `uvx` + Llama access at
startup and builds the real text events (fixed 2026-07-20 — it used to set the text feature but
still build AV-only events). `--modality video` (audio dropped) is the last-resort de-risk on a
24 GB card. Colab equivalent: the **T1/T3/T4** trimodal cells in `colab_run.ipynb`.

### A2b. Weight & code durability (F1) — snapshot on this first session
The first successful GPU run downloads the **~1 GB `facebook/tribev2` checkpoint into `./cache`**.
Upstream can vanish (repos get pulled or re-gated), so protect the run while the box is already up:
- **Snapshot the weights.** `tar` the checkpoint and upload it to a **private** store — a private
  Supabase `models` bucket / a private HF mirror repo / R2 / S3 — and record its **sha256**. This
  should **piggyback on this first GPU session at ~zero cost** (the box + the files are already there).
  ```bash
  tar -czf tribev2-cache.tgz ./cache
  shasum -a 256 tribev2-cache.tgz        # record this hash next to the upload
  # then upload tribev2-cache.tgz to the private bucket / mirror
  ```
- **Fork the source.** Fork the **tribev2** (and note **neuralset**) source to a **private repo** so
  the package survives upstream deletion.
- **Fallback / restore.** If upstream ever disappears: restore the tarball into `./cache`, then
  ```bash
  export HF_HUB_OFFLINE=1
  python batch_extract.py ...            # runs unchanged, fully offline from ./cache
  ```

### A3. Build the a-priori ROI mask (F1/F2)
```bash
python build_roi_mask.py --network dmn --out ./data/roi_mask_dmn.npy
```

### A4. Get TVSum + build the human arcs (F2, parallel with A1–A3)
```bash
git clone https://github.com/yalesong/tvsum        # annotations in ydata-tvsum50.mat
python tvsum_prep.py --mat ./tvsum/ydata-tvsum50.mat --out ./data/tvsum --shot-sec 2.0
```

### A5. Batch TRIBE over 10–20 TVSum clips (F1)
```bash
python batch_extract.py --video-dir ./tvsum/videos --out ./data/arcs \
    --roi-mask ./data/roi_mask_dmn.npy          # add --modality trimodal once LLaMA access is confirmed
```
Deterministic → cached `preds_*.npy`; never re-run at analysis time.

### A6. Run the honest test (F2)
```bash
python honest_corr_timeseries.py \
    --model-glob "./data/arcs/arc_*.csv" \
    --human-dir  ./data/tvsum \
    --feature both --n-perm 5000 --out ./validation/tvsum_run
```
Read the forest table + Stouffer/Fisher combined p **per feature**. The honest
result: does `roi` survive the circular-shift null across videos while `global` is
null? Report all rows. A null is a legitimate pre-registered outcome.

### A7 (secondary, optional). Between-video retention test
Only if you have any real per-video retention: fill `engagement.csv`
(`id,retention_pct`) and run `python honest_corr.py --outcomes retention_pct`.
Expect underpowered; report transparently.

### A8. COGNIMUSE affect track — the leave-one-movie-out affect head (F2)
The attention track above (A4–A6) validates `roi`/`global` against TVSum. The **affect** head
(valence/arousal) is validated separately on **COGNIMUSE**, now **7 films**: batch-1 CHI/FNE/GLA +
batch-2 BMI/CRA/DEP/LOR (more movies → a stronger leave-one-movie-out test).

```bash
# 1. Build the human targets from the COGNIMUSE .dat annotations (once):
make cognimuse COG="path/to/Emotion Annotation"      # -> data/cognimuse/human_affect_<code>.csv

# 2. Cut each film to its annotation window. CRITICAL: pass --story-end so the clip ENDS at the
#    last STORY frame, not the file's end (the file's tail is 3-9 min of end credits the
#    annotation never rated -> a silent per-second misalignment). Values: data/cognimuse/story_end.csv.
#    `make cognimuse-films` hardcodes --out data/clips_cognimuse AND omits --story-end, so call the
#    script directly, once per batch:
.venv/bin/python cognimuse_films.py --films-dir ~/cog_films_batch1 --affect-dir data/cognimuse \
    --out data/clips_cognimuse        --story-end "CHI=6345,FNE=5538,GLA=9845"
.venv/bin/python cognimuse_films.py --films-dir ~/cog_films_batch2 --affect-dir data/cognimuse \
    --out data/clips_cognimuse_batch2 --story-end "BMI=7718,CRA=6628,DEP=8687,LOR=11535"
# Verify each clip's LAST frame is a story shot, not a credit card. See COGNIMUSE-ALIGNMENT-FIX.md.
```

3. **Upload all 7 clips to `MyDrive/soma/clips`** (same flat folder Cell 2B reads; delete any stale
   same-named clip first — Drive allows dup names). Run the Colab notebook → `preds_<code>.npy`.
4. Drop `preds_<code>.npy` into `data/arcs/`, then fit the head:
```bash
make affect-head-save TARGET=data/cognimuse   # leave-one-movie-out valence/arousal head
```
Report every movie, including a null — same honesty rule as A6. (Note: GLA's source is the Extended
cut; CHI/CRA have soft story/credit boundaries — see the caveats in COGNIMUSE-ALIGNMENT-FIX.md.)

---

## Track B — the MVP demo

### B1. Pick 3–5 hero ad clips (F3) — needs founder sign-off
Rights-clean, public DTC/brand ads with a clean "hook → dead zone → offer" story.
Brand/optics matter; the "you lose them at 0:12" callout is a **prediction**, label
it so.

### B2. Generate their arcs (F1)
```bash
python batch_extract.py --video-dir ./hero_clips --out ./demo/arcs \
    --roi-mask ./data/roi_mask_dmn.npy --demo-feature roi
```
Writes `arc_<id>.json` straight into the demo.

### B3. Run the demo (F3)
```bash
cd demo && python3 -m http.server 8000     # http://localhost:8000/?arc=arcs/arc_<id>.json
```
Set `"video_src"` in each arc JSON to sync real footage. Deploy with `vercel`.
Keep a screen-recorded backup. The "upload your own ad" button is a marked stub —
wire it to a real Modal/Replicate job later (never a fake progress bar).

---

## The claim you can honestly make by end of Day 2
> "Video → brain activation is validated against real fMRI (Meta TRIBE v2, public,
> Algonauts-2025 winner). On N videos, the predicted per-second activation in
> [ROI] tracks a 20-annotator human interest curve at r = X, surviving an
> autocorrelation-controlled null (p = Y) — early, needs replication. Activation →
> engagement is our tested hypothesis, not a claim. The global signal doesn't
> predict replay (known), which is why we test a specific region."

If the signal is null, say that instead and lead with the machine + the honest
methodology. Never dress up a null.
