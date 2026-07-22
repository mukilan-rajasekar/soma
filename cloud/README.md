# Headless GPU extraction — ~3–4× faster than Colab, fully unattended

Colab is the wrong tool for a multi-hour batch: ~2 CPU cores starve the GPU, the
`drive.mount` popup + bot-checks need a human, and sessions die at ~90 min. A plain
GPU box over SSH has none of that. The **only** step I can't do for you is spinning
up + paying for the box (I'm walled off from payment). Everything after that is one paste.

**Why it's faster and still honest:** the speed knob is `--workers`. Colab pins it to 2;
here we set it to the box's core count. `predict()` runs the frozen model in eval mode with
`shuffle=False`, so the `(n_sec, 20484)` preds are **bit-identical** to Colab — `--workers`
changes wall-clock, never a validated number. fps / resolution / precision are untouched.

Rough numbers: ~4,900 video-seconds at ~5.7× realtime ≈ 8 h on Colab → **~2 h** on an
A100 + 24 vCPU, unattended.

---

## The 3 steps

### 1. Launch a pod (you — the payment step)
- **[RunPod](https://runpod.io)** → Deploy → **A100 (80GB)** or **A40**, template **"RunPod PyTorch 2.x"**.
  Pick a machine with **≥16 vCPU** (more cores = faster; that's the whole point). Add ~50 GB volume.
- Or **Vast.ai** / **Lambda** — anything with a modern NVIDIA GPU, ≥16 vCPU, and PyTorch preinstalled.
- Open the pod's **Web Terminal** (RunPod: "Connect" → "Start Web Terminal").

### 2. Get the files onto the box
You need `extract.py`, `bootstrap.sh`, and the clips into `~/soma/`. Easiest is `runpodctl`:

```bash
# on the box:
mkdir -p ~/soma/clips && cd ~/soma
```
Then from **your Mac** (install once: `brew install runpod/runpodctl/runpodctl`), send each:
```bash
runpodctl send cloud/extract.py
runpodctl send cloud/bootstrap.sh
runpodctl send ~/Downloads/soma_mrhisum.zip     # JOB B — the 39 clips
runpodctl send ~/Downloads/soma_talkad.zip      # JOB A — optional, trimodal
```
`runpodctl send` prints a one-line `runpodctl receive <code>` — paste that on the box to pull each file.
(No runpodctl? Use the RunPod web file browser, or `scp` if the pod exposes SSH.)

Unpack the clips into place on the box:
```bash
cd ~/soma
unzip -q soma_mrhisum.zip     # -> clips/mrhisum/*.mp4
unzip -q soma_talkad.zip      # -> clips/talk_ad/*.mp4   (only if you sent it)
```

### 3. Run it (one paste, then walk away)
```bash
cd ~/soma && bash bootstrap.sh 2>&1 | tee run.log
```
That installs the stack, runs **JOB B (Mr.HiSum, AV)** then **JOB A (talk_ad, trimodal)** on
all cores, and zips both to `~/soma/out/*.zip`. Pull them back:
```bash
runpodctl send ~/soma/out/arcs_mrhisum.zip
runpodctl send ~/soma/out/arcs_talk_trimodal.zip
```
Drop those in your Mac's `Downloads/` and **terminate the pod** (billing stops). Hand them to me —
I run `compare_cuts.py` (message + attention lanes) and `retention_head.py` (the first honest
retention read) locally, in seconds.

---

## Notes
- **`--workers` = the box's core count** is set automatically (`bootstrap.sh` uses `$(nproc)`).
  If CPU-bound (likely), that's where the ~3–4× comes from — not the GPU tier.
- **YouTube still can't be scraped from a datacenter IP** (same bot-block as Colab), so the clips
  are uploaded from your Mac — exactly why they're pre-zipped in `~/Downloads/`.
- **Resume-safe:** re-running skips any clip whose `preds_<id>.npy` already exists. A crash mid-batch
  loses nothing.
- **Cost:** ~$1–2/hr × ~2 h ≈ $3–5. Terminate the pod the moment the zips are off it.
- **Rotate the HF token** after the run (it's baked into `bootstrap.sh` for convenience).
- Prefer to skip the trimodal JOB A? Just don't send `soma_talkad.zip`; JOB B runs alone.
