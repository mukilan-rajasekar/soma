# `demo/process_batch.py` — running a batch

Scores one apples-to-apples batch of ads and emits everything `/preflight` renders.
Runs on a rented GPU box; you copy two things back.

## Install (Ubuntu + CUDA)

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg tesseract-ocr tesseract-ocr-eng
python -m venv .venv && . .venv/bin/activate
pip install "numpy>=1.26,<2.1"      # HARD pin: >=2.1 segfaults neuralset's C-ABI
pip install torch --index-url <matching the box's CUDA>
pip install neuralset tribev2 huggingface_hub transformers
pip install nibabel faster-whisper
huggingface-cli login                # facebook/tribev2 weights are gated
```

Ship exactly this tree — `batch_extract.py` is **imported at runtime** and the script
refuses to start without it:

```
workdir/
├── batch_extract.py          # from the soma repo root — REQUIRED
├── demo/process_batch.py
└── batch/  ├── manifest.json
            └── ad_01.mp4 … ad_05.mp4
```

## manifest.json

All six message fields are **required** — Clarity is 25% of the score and cannot be
computed without them. `brand_aliases` / `product_aliases` are optional and catch
stylized OCR variants ("KOVA", "kovafit").

```jsonc
{
  "batch_name": "Kova Q3 hook test",
  "brand_name": "Kova",
  "product_name": "Whey Isolate",
  "primary_problem": "protein powder that makes you bloated",
  "primary_benefit": "clean protein without the bloat",
  "offer": "20% off your first order",
  "desired_cta": "tap the link in bio",
  "brand_aliases": ["kova", "kovafit"],
  "product_aliases": ["whey", "isolate"],
  "batch": { "platform": "meta", "placement": "reels", "objective": "conversions",
             "product": "Whey Isolate", "audience": "cold_us_25_44" },
  "ads": [
    { "filename": "ad_01.mp4", "id": "ad_01", "title": "Story open" },
    { "filename": "ad_02.mp4", "id": "ad_02", "title": "Deal first" },
    { "filename": "ad_03.mp4", "id": "ad_03", "title": "Product first" },
    { "filename": "ad_04.mp4", "id": "ad_04", "title": "Urgency first" },
    { "filename": "ad_05.mp4", "id": "ad_05", "title": "Slow open" }
  ]
}
```

The five `batch` keys must agree across every ad and the clips must share a duration
bucket, or validation fails — a ranking that mixes creative jobs is meaningless.
`--force` downgrades that to a warning.

## Run, in this order. Do not skip 2 or 4.

```bash
cd workdir

# 1) Atlas + label spellings. No GPU, no weights, ~10 s.
python demo/process_batch.py batch/manifest.json batch --list-tags
#    Verified working: DorsAttn=2089, SalVentAttn=2363, Vis=2826, and higher_order=2754
#    across Default_Temp/Default_PFCv/Cont_PFCl/Cont_Temp/Cont_Par (all non-zero).
#    If any higher-order tag reports 0 vertices, STOP — that 35% component is empty.

# 2) THE CHUNKING QUESTION. No GPU, no weights, ~60 s. Run BOTH; log both.
python demo/process_batch.py batch/manifest.json batch --probe-events 16   # the risky case
python demo/process_batch.py batch/manifest.json batch --probe-events 35   # the mitigation
#    build_events chunks with ChunkEvents(min_duration=30) and the hook stimulus is
#    naturally 16 s. If 16 returns an EMPTY dataframe, --min-stimulus-s 35 (the default)
#    is what saves the run. If 16 works, you may lower it.

# 3) Stimuli only — eyeball one before spending GPU time.
python demo/process_batch.py batch/manifest.json batch --probe-stimuli

# 4) ONE ad end to end (~4 min). The real go/no-go. Read, in order:
python demo/process_batch.py batch/manifest.json batch --only ad_01 --allow-n
```

At step 4, read these four lines before doing anything else:

| Line | What you need to see | If not |
|---|---|---|
| `[preds …]` | signed, roughly ±1, `frac<0` near 50% | if it warns "values look bounded [0,1]", **stop** — the whole signed-delta design is invalid |
| `arc sd(raw)` vs `sd(mag)` | same order of magnitude | if `sd(raw) << sd(mag)` the signed arc is cancellation noise; plot `arc.mag` instead (it's already in the JSON — no second GPU run needed) |
| `SANITY full_visual` | **positive** | if not, the `[LH; RH]` vertex-order assumption, the Schaefer mask, or the content/baseline alignment is wrong and **no number is trustworthy** |
| `perRunZscore` verdict | `fixed_stats_likely` | `per_run_zscore_likely` means TRIBE z-scores per run, so cross-ad *levels* aren't comparable — the script auto-switches the chart to the `psc` lane and flags the JSON |

```bash
# 5) The full batch, under tmux (~20-30 min for 10 inferences).
tmux new -s batch
python demo/process_batch.py batch/manifest.json batch \
    --out-dir batch/out --web-videos batch/out/web 2>&1 | tee batch/out/run.log
```

## Bring back

```bash
scp gpu:workdir/batch/out/batch.json     → public/preflight/batch_report.json
scp gpu:workdir/batch/out/web/*.mp4 *.jpg → public/preflight/videos/
scp gpu:workdir/batch/out/preflight.csv  → keep (the audit trail)
scp gpu:workdir/batch/out/run.log        → keep
```

Then `npm run build` — `/preflight` reads the JSON at build time.

Skip the mp4 copy when the batch scored footage the site already ships. The current
`batch_report.json` is the five welding cuts, byte-identical to
`public/campaign/v0[1-5]*.mp4`, so its `video` fields were pointed there by hand and
`public/preflight/videos/` does not exist. Copying the transcodes in as well would put
the same 6.4 MB in the repo twice, which is what it used to do.

`--video-url-prefix` can't express that on its own: `--web-videos` names each transcode
by ad id (`ad_01.mp4`), not by the source cut, so the prefix only ever yields
`<prefix>/ad_0N.mp4`. Re-running *this* batch means re-pointing those five `video`
fields again. A batch of genuinely new footage takes the default path above and needs
none of this.

Also worth keeping `demo/.cache/preds/*.npy`: they're deterministic and expensive, and
this repo's history shows not bringing raw preds back from a GPU run is a recurring
regret (see the note at the top of `tools/demo/build_report.py`). With them cached,
`--skip-tribe` re-scores in seconds — so retuning a weight never needs the GPU again.

## Re-scoring without the GPU

```bash
python demo/process_batch.py batch/manifest.json batch --skip-tribe --out-dir batch/out
```

The preds cache is keyed on a fingerprint of the stimulus bytes **plus** the padding
constants, so changing `--min-stimulus-s` or `--baseline-audio` invalidates it and says
so. (preflight.py keys on filename alone, which silently reuses predictions for a
stimulus that no longer exists.)

## Known failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `build_events returned an EMPTY dataframe` | ChunkEvents dropped a short stimulus | raise `--min-stimulus-s` |
| `predictions contain NaN or Inf` | digitally-silent padding hit a zero-variance normalization | `--baseline-audio dither` |
| `vertex mismatch` | preds aren't fsaverage5 20484 | wrong model/config |
| `Empty contrast window` | segment timing disagrees with the padding | check `timingSource` in the JSON |
| clarity all tied at 50 | no ASR and no OCR backend, so every ad scored 0 | install `faster-whisper` / `tesseract` |
| `sanity.visualPositive: false` | see the table above — **do not ship the numbers** | debug masks/timing first |

## What this does not do

Every component is a percentile **within this batch**. With n=5 each one can only take
the values 10/30/50/70/90, and batch z-scores over five items are dominated by single
outliers — treat rank order as ordinal, not the gaps between ranks. It is not a
predicted hold rate, a ROAS forecast, or measured attention. TRIBE v2 weights are
CC BY-NC 4.0: research / non-commercial use only.
