#!/usr/bin/env bash
# =============================================================================
# Soma / TRIBE v2 -- one-paste headless extraction bootstrap for a GPU box.
# Paste this whole thing into the pod's web terminal (RunPod / Vast / Lambda).
# It installs the stack, runs BOTH jobs on however many CPU cores the box has,
# and zips the outputs. No Colab, no popups, no 90-min timeout.
#
# Before pasting, you must have on the box (see cloud/README.md):
#   ~/soma/extract.py                  (this repo's cloud/extract.py)
#   ~/soma/clips/mrhisum/*.mp4         (39 clips -- JOB B)
#   ~/soma/clips/talk_ad/*.mp4         (5 clips  -- JOB A, only if you want trimodal)
# and set your HF token below (needed only for the trimodal JOB A).
# =============================================================================
set -euo pipefail

export HF_TOKEN="${HF_TOKEN:-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}"
export HUGGING_FACE_HUB_TOKEN="$HF_TOKEN"
export HUGGINGFACEHUB_API_TOKEN="$HF_TOKEN"
export HF_HUB_DOWNLOAD_TIMEOUT=300

SOMA="${SOMA:-$HOME/soma}"
cd "$SOMA"
CORES="$(nproc)"
echo "== box has $CORES CPU cores; GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo none) =="

# --- install: TRIBE stack, then force NumPy/SciPy back to its compiled-dep range ----------
if ! python -c "import tribev2" 2>/dev/null; then
  echo "== installing TRIBE v2 stack (a few minutes) =="
  pip install -q --upgrade \
    "tribev2[plotting] @ git+https://github.com/facebookresearch/tribev2.git" \
    exca yt-dlp pillow pandas matplotlib moviepy nilearn
  pip install -q --force-reinstall "numpy>=1.26.4,<2.1" "scipy>=1.13,<1.16"
fi

mkdir -p out

# --- JOB B: Mr.HiSum retention (AV, the ~8h-on-Colab job) --------------------------------
if compgen -G "clips/mrhisum/*.mp4" > /dev/null; then
  echo "== JOB B: Mr.HiSum AV extract on $CORES cores =="
  python extract.py --clips clips/mrhisum --out out/arcs_mrhisum \
      --feature av --roi dan --workers "$CORES" --masks-dir out --cache ./cache
else
  echo "== JOB B skipped: no clips/mrhisum/*.mp4 =="
fi

# --- JOB A: talk-ad variants (trimodal, the message-lane win) ----------------------------
if compgen -G "clips/talk_ad/*.mp4" > /dev/null; then
  echo "== JOB A: talk_ad TRIMODAL extract =="
  python extract.py --clips clips/talk_ad --out out/arcs_talk_trimodal \
      --feature trimodal --roi language --workers "$CORES" --masks-dir out --cache ./cache
else
  echo "== JOB A skipped: no clips/talk_ad/*.mp4 =="
fi

# --- package for download ---------------------------------------------------------------
cd out
[ -d arcs_mrhisum ]       && zip -qr arcs_mrhisum.zip arcs_mrhisum             && echo "[zip] out/arcs_mrhisum.zip"
[ -d arcs_talk_trimodal ] && zip -qr arcs_talk_trimodal.zip arcs_talk_trimodal && echo "[zip] out/arcs_talk_trimodal.zip"
echo "== DONE. Download out/*.zip (runpodctl send, or the pod file browser). =="
