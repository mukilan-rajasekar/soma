# TRIMODAL.md — running TRIBE v2 at full strength (audio + video + **text**)

The whole project so far runs the model in **audio+video** mode. This doc is the complete,
verified path to running it **trimodal** — adding the dialogue/**text** branch, which is the
exact configuration Meta's TRIBE v2 won **Algonauts-2025** with. Everything here is grounded in
the actual `facebook/tribev2` source (`demo_utils.py`, `eventstransforms.py`, `grids/defaults.py`)
and the checkpoint's own `config.yaml`, not guessed.

---

## TL;DR

- The shipped `facebook/tribev2` checkpoint's **default is already trimodal**
  (`features_to_use: ["text","audio","video"]`). Our AV run *overrides it down* to save VRAM
  and dodge the gated LLM. Trimodal is the model at full strength.
- **Transcription is built in.** `tribev2` ships `ExtractWordsFromAudio`, which transcribes the
  clip's dialogue itself with **whisperx** (`uvx whisperx --model large-v3` + WAV2VEC2 word
  alignment). **You provide no transcript.** (Earlier I thought we'd have to bolt on an external
  Whisper — that was wrong: `neuralset` can't transcribe, but `tribev2` already can.)
- Two prerequisites gate it: **(1)** `uv` on PATH (for `uvx whisperx`), and **(2)** gated access
  to **`meta-llama/Llama-3.2-3B`** (the text embedder — this is the real reason trimodal is
  "gated"). Plus **an A100** (~28–32 GB VRAM).
- It's already wired up in two places: **`colab_run.ipynb` Cells T1/T3/T4** and
  **`batch_extract.py --modality trimodal`**. Both write to a **separate** output folder so you
  can compare av vs trimodal on the same clips.

---

## What "text" actually adds (the exact pipeline)

The reference build is `tribev2.demo_utils.get_audio_and_text_events(events, audio_only=False)`.
Our AV path is its `audio_only=True` branch; trimodal is `audio_only=False`:

```
ExtractAudioFromVideo()                      # add an Audio stream derived from the video
ChunkEvents("Audio", max=60, min=30)         # split into 30–60s spans
ChunkEvents("Video", max=60, min=30)
# --- text branch (trimodal only) ---
ExtractWordsFromAudio()                       # whisperx transcript -> word-level "Word" events
AddText()                                     # attach running text
AddSentenceToWords(max_unmatched_ratio=0.05)  # group words into sentences
AddContextToWords(sentence_only=False, max_context_len=1024, split_field="")
RemoveMissing()                               # drop words that never got context
```

`ExtractWordsFromAudio` (in `tribev2/eventstransforms.py`) runs, per audio span:

```
uvx whisperx <audio.wav> --model large-v3 --language en \
    --align_model WAV2VEC2_ASR_LARGE_LV60K_960H --output_format json ...
```

→ words `{text, start, duration, sequence_id, sentence}`, cached to `<audio>.tsv` (a re-run
reuses it and skips whisperx). Language is **hard-coded to English** in the transform (auto-detect
is unreliable on the first 30 s of movies). Non-English dialogue would need a code change.

The `Word` events are then embedded by the **text feature extractor**, and all three modality
embeddings feed the brain encoder.

### The exact models (from the checkpoint config — do not substitute)

| modality | model | why it matters |
|----------|-------|----------------|
| text  | **`meta-llama/Llama-3.2-3B`** (base, gated), layers `[0,.2,.4,.6,.8,1.0]`, agg `sum` | the checkpoint was **trained** with this LLM; swapping it (e.g. to Qwen3-0.6B from the `mini` config) feeds the brain decoder features from a different model → degraded/garbage. **Use exactly this one.** |
| audio | `facebook/w2v-bert-2.0`, layers `[.75,1.0]` | same as AV path |
| video | `facebook/vjepa2-vitg-fpc64-256` (giant), layers `[.75,1.0]` | same as AV path |

The model was trained with `modality_dropout: 0.3`, so it tolerates a missing modality — which is
*why* the AV override runs at all — but all three present is the full, benchmarked model.

---

## Prerequisites

1. **A100 + High-RAM.** ~28–32 GB VRAM (LLaMA-3.2-3B + w2v-BERT + V-JEPA2-giant). T4/L4 OOM.
   whisperx (large-v3, ~3 GB) runs as a *subprocess during event-build* and exits before the
   feature extractors load, so it doesn't stack onto the predict-time peak.
2. **Gated `meta-llama/Llama-3.2-3B`.** Request access (see below), and be logged in with a token
   that has it.
3. **`uv`** → provides `uvx` (`pip install -U uv`). First clip pulls whisperx + its model weights.

### Requesting Llama-3.2-3B access (plain steps)

1. Sign in to HuggingFace, go to **<https://huggingface.co/meta-llama/Llama-3.2-3B>** — this exact
   repo (the **base** model, *not* `Llama-3.2-3B-Instruct`; that's a different, also-gated repo the
   model does **not** use).
2. Click **"Agree and access repository"**, fill Meta's short form (name/affiliation/use).
   Approval is usually **minutes to a few hours**, occasionally a day. You'll get an email.
3. Create a **token** at <https://huggingface.co/settings/tokens> (a *read* token is enough).
4. In Colab, Cell **T1** calls `login()` — paste that token. It then verifies access and prints
   `[OK]` (or tells you it's still gated). Don't run T3/T4 until it says `[OK]`.

---

## How to run it

### A) Colab (`colab_run.ipynb`) — the trimodal cells

Fresh session, in this order (the four trimodal cells live **after Cell 5**):

```
Cell 1   install pinned deps  -> RESTART runtime
Cell T1  trimodal deps (uv + whisperx) + HF login   -> wait for "[OK] ... access confirmed"
Cell 2B  mount Drive + discover clips (+ ROI mask)
Cell T3  load model_tri  (features_to_use = audio,video,text)
Cell T4  extract  -> MyDrive/soma/arcs_trimodal/preds_<id>.npy + arc_<id>.csv/json
```

(Skip Cell 2 and Cells 3–4 — those are the AV path.) T4 writes to **`arcs_trimodal/`**, never
touching your AV `arcs/`, and resumes/skips exactly like Cell 4.

### B) GPU box (`batch_extract.py`)

```bash
pip install -U uv                       # provides uvx (whisperx)
huggingface-cli login                   # token with Llama-3.2-3B access
python batch_extract.py --video-dir ./clips --out ./data/arcs_trimodal \
    --roi-mask ./data/roi_mask_dmn.npy --modality trimodal
```

`--modality trimodal` now (fixed 2026-07-20) actually builds the text events — previously it set
`features_to_use=[...,"text"]` but still built AV-only events, so the text branch got no input.
It pre-flights `uvx` + Llama access at startup and exits with a clear message if either is missing.

---

## Comparing av vs trimodal (the honest analysis)

Run the **same clips** through both, into `arcs/` (av) and `arcs_trimodal/` (trimodal). Because
both are per-second `(T, 20484)` on the same time grid, they line up second-by-second. Then run the
identical downstream test on each and report **both**:

- Attention track: `honest_corr_timeseries.py` on each arcs folder vs TVSum.
- Affect track: `make affect-head-save TARGET=data/cognimuse` on each (leave-one-movie-out).

**Honesty rule (unchanged):** the only validated link is *stimulus → brain activation*. Trimodal
should predict the **brain** more faithfully (it's the full benchmarked model), but whether that
improves *our* downstream attention/affect correlation is a separate empirical question. **Report
av and trimodal side by side. A tie — or trimodal doing worse on our downstream metric — is a real
result. Do not cherry-pick the better number.**

---

## Cost / timing (rough, A100)

- **whisperx** large-v3 on ~30 min of movie audio: a few minutes/clip (first clip also downloads
  the whisper + wav2vec2 weights). Cached to `.tsv`, so re-runs skip it.
- **predict** with the text branch is somewhat slower than AV (an extra LLM feature pass), but the
  V-JEPA2-giant video pass still dominates wall-clock.
- Everything caches to Drive (Cell T3) → resumes across disconnects like the AV path.

---

## Failure modes & fixes

| symptom | cause | fix |
|---------|-------|-----|
| `uvx: not found` / whisperx step errors | `uv` not installed | `pip install -U uv` (Cell T1 does this) |
| every clip `[ERROR] ... whisperx failed` | ctranslate2/cuDNN can't init on the box | confirm GPU runtime; re-run T1's `uvx whisperx --help` check; worst case pre-transcribe and drop `<audio>.tsv` files with columns `text,start,duration,sequence_id,sentence` |
| `GatedRepoError` / 401 on Llama | no access or wrong token | finish the access request; `login()` with a token that has it; wait for approval |
| OOM at predict | not on A100 / High-RAM off | switch to A100, enable High-RAM; do **not** downgrade the text/video model to fit (breaks the numbers) |
| trimodal arc length ≠ av arc length | a clip failed whisperx in one run only | delete that clip's `preds_*` in the odd-one-out folder and re-run so both come from a clean build |

---

## Provenance (so this is reproducible, not folklore)

- `features_to_use` default, model names, layers, `modality_dropout`: `facebook/tribev2` →
  `config.yaml` + `tribev2/grids/defaults.py`.
- Trimodal event build + whisperx invocation: `tribev2/demo_utils.py::get_audio_and_text_events`
  and `tribev2/eventstransforms.py::ExtractWordsFromAudio`.
- Verified 2026-07-20 against the upstream `main` branch.
