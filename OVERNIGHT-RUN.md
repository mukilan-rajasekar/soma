# Overnight run — step by step

Goal for tonight: get **real TRIBE brain data** on ~15 ad clips, run the honest arc
validation (global + ROI), and train our read-out head on real data. Whatever it says —
signal or null — is our first real result.

I already did the local prep for you:
- **~15 trimmed clips** staged at `data/clips_trimmed/` (first 2 min each, downscaled).
- **4 ROI masks** at `data/roi_mask_{dmn,dan,valence,arousal}.npy` (a-priori, for the head).
- The annotations are already local at `data/ydata-tvsum50.mat`.

So you only need to do three things: **upload → click through Colab → morning analysis.**

---

## PART 1 — Upload to Google Drive (2 minutes, on your laptop)

In Google Drive, create the folder `MyDrive/soma/` and upload:

1. The **whole `data/clips_trimmed/` folder's contents** → `MyDrive/soma/clips/`
   (all the `.mp4` files — this is what Colab reads).
2. The one file `data/roi_mask_dmn.npy` → `MyDrive/soma/roi_mask_dmn.npy`
   (the a-priori ROI = Default Mode Network, our pre-registered primary region).

That's it for uploads. Everything else stays on your laptop.

---

## PART 2 — Colab (click through; Cell 4 is the long unattended part)

Open `colab_run.ipynb` in Colab. Then, top to bottom:

1. **Runtime ▸ Change runtime type ▸ T4 GPU.**
2. **Cell 1** (install). When it finishes it tells you to restart →
   **Runtime ▸ Restart session.** (Required.)
3. **Cell 2B** — the light Drive path. **Before running it, edit ONE line** so it also
   produces the ROI arc (the real hypothesis test), not just global:
   ```python
   ROI_MASK_PATH = Path("/content/drive/MyDrive/soma/roi_mask_dmn.npy")
   ```
   Leave `CLIP_DIR` and `OUT_DIR` as they are. Run it — it should print
   `N clips … 0 already done -> N to run`.
   *(Skip Cell 2 — that's the heavy all-in-Colab path you don't want.)*
4. **Cell 3** — load the model (first run downloads ~1 GB).
5. **Cell 4** — the extraction. **This is the long part that runs while you sleep.**
   It prints the preds distribution once (confirm it's z-scored, ~[-1,1], not 0..1), then
   grinds through the clips. Leave the tab open.
   - **If Colab disconnects or hits its limit:** don't worry. `OUT_DIR` is on Drive, so
     finished clips are saved. Just reconnect and **re-run Cell 4** — it skips what's done
     and continues. No lost work.
6. **Cell 5** — zip + download `soma_arcs.zip`. (It's also already in your Drive.)

---

## PART 3 — Morning, on your laptop (5 minutes)

1. **Run the arc validation + report:**
   ```bash
   make ingest ZIP=~/Downloads/soma_arcs.zip
   ```
   This builds the human-interest arcs from TVSum, aligns them to the brain arcs, runs the
   circular-shift test for **both** `global` (the likely-null baseline) and `roi` (the open
   test), and writes `validation/report.html`. **Open it** — that's your honest
   signal-or-null verdict for the attention arc.

2. **Train the read-out head on the real data:**
   ```bash
   make head
   ```
   This trains the ridge head (leave-one-video-out) on the real preds + your ROI masks and
   prints the honest result: does the trained head track human interest, and does it beat
   the untrained arc? With ~15 videos it's underpowered — a null is an expected, honest
   outcome, and it will say so plainly.

---

## What to expect (so a null doesn't feel like failure)

- **`global` will very likely be null** — that's the documented baseline; a global brain
  drive is already published NOT to predict replay. That's the honest control.
- **`roi` is the real open test.** It may show signal or null. Either is a real result.
- **The head** on ~15 public-proxy videos may only tie the arithmetic arc. That's fine and
  expected for v0 — the head's real test comes with proprietary ad-outcome data later.

Nothing here fabricates a number. If it's null, we say null. If `roi` survives the
circular-shift null across videos, that's a genuine, distinct signal worth building on.

## Optional (only if you want the "beats ffmpeg baseline" number too)

That test needs the dumb-baseline features extracted from the clips first:
```bash
.venv/bin/python baseline_extract.py --video-dir data/clips_trimmed --out data/baseline --glob '*.mp4'
make pipeline            # re-runs the chain, now including incremental-validity
```
Heads-up: I fixed two real bugs in that test today, but it should be run and eyeballed on
real data before you quote the "beats ffmpeg" number anywhere.
