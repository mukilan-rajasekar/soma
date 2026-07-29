#!/usr/bin/env bash
#
# provision.sh — turn a bare Ubuntu + CUDA box into a scorer box, in one command.
#
# Run from the repo root ON THE BOX:
#
#     bash tools/concierge/provision.sh
#     bash tools/concierge/provision.sh --cuda cu124      # override wheel index
#     bash tools/concierge/provision.sh --skip-apt        # no sudo available
#
# Idempotent: re-running is how you repair a half-finished install, not a mistake.
#
# THE ONE THING THAT WILL BREAK THIS INSTALL, and it is worth reading before you debug
# anything else: numpy is pinned BELOW 2.1 because >=2.1 segfaults neuralset's C-ABI. The
# trap is that pip will happily satisfy a later package by UPGRADING numpy past the pin,
# silently, and the failure then shows up as a segfault in a scoring run rather than as an
# error here. So the pin is asserted first, re-asserted last, and VERIFIED at the end —
# and this script exits non-zero if it drifted. A box that fails this check does not score.
#
# What it does not do: log you into Hugging Face. facebook/tribev2 is gated behind
# accepting CC BY-NC terms, which is a human agreeing to a licence, so it stays manual.

set -euo pipefail

CUDA_TAG=""
SKIP_APT=0
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NUMPY_SPEC="numpy>=1.26,<2.1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cuda) CUDA_TAG="$2"; shift 2 ;;
    --skip-apt) SKIP_APT=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarn\033[0m  %s\n' "$*"; }
die()  { printf '\033[31mstop\033[0m  %s\n' "$*" >&2; exit 1; }

cd "$REPO_ROOT"

# ── 0 · the tree the scorer actually needs ────────────────────────────────────
# batch_extract.py is IMPORTED AT RUNTIME by demo/process_batch.py and the script refuses
# to start without it. Checking now costs a second; discovering it after a GPU install
# costs an hour.
say "checking the repo tree"
[[ -f batch_extract.py ]]        || die "batch_extract.py missing from the repo root — process_batch.py imports it at runtime."
[[ -f demo/process_batch.py ]]   || die "demo/process_batch.py missing."
[[ -f tools/concierge/run_batch.py ]] || die "tools/concierge/run_batch.py missing."
echo "ok    batch_extract.py, demo/process_batch.py, run_batch.py"

# ── 1 · system packages ───────────────────────────────────────────────────────
# tesseract and faster-whisper are NOT optional in any sense that matters. Without them
# Communication Clarity — 25% of the score — measures nothing, every ad ties at 50, and
# the report tells the customer a quarter of their score carried no signal.
if [[ "$SKIP_APT" == "0" ]]; then
  say "system packages"
  if command -v apt-get >/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq ffmpeg tesseract-ocr tesseract-ocr-eng python3-venv python3-pip git
  else
    warn "no apt-get here. Install ffmpeg, tesseract-ocr and python3-venv yourself, or pass --skip-apt."
  fi
fi
command -v ffmpeg    >/dev/null || die "ffmpeg not on PATH."
command -v ffprobe   >/dev/null || die "ffprobe not on PATH."
command -v tesseract >/dev/null || warn "tesseract missing — OCR is off, and clarity is 25% of the score."

# ── 2 · the virtualenv ────────────────────────────────────────────────────────
say "virtualenv"
[[ -d .venv ]] || python3 -m venv .venv
PY=".venv/bin/python"
$PY -m pip install -qq --upgrade pip wheel
echo "ok    $($PY -V)"

# ── 3 · numpy FIRST ───────────────────────────────────────────────────────────
say "numpy (hard pin, before anything that links against it)"
$PY -m pip install -qq "$NUMPY_SPEC"
echo "ok    numpy $($PY -c 'import numpy; print(numpy.__version__)')"

# ── 4 · torch, matched to the driver ──────────────────────────────────────────
# The wheel index has to match the box's CUDA. Detected rather than assumed, because
# guessing gives you a torch that imports fine and then cannot see the GPU — which looks
# like a model problem for about an hour before you check.
say "torch"
if [[ -z "$CUDA_TAG" ]]; then
  if command -v nvidia-smi >/dev/null; then
    DRIVER_CUDA="$(nvidia-smi | sed -n 's/.*CUDA Version: \([0-9.]*\).*/\1/p' | head -1)"
    case "${DRIVER_CUDA%%.*}" in
      13|12) CUDA_TAG="cu124" ;;
      11)    CUDA_TAG="cu118" ;;
      *)     CUDA_TAG="" ;;
    esac
    echo "      driver reports CUDA ${DRIVER_CUDA:-unknown} -> ${CUDA_TAG:-cpu wheels}"
  else
    warn "no nvidia-smi. Installing CPU torch — scoring will work and be very slow."
  fi
fi
if [[ -n "$CUDA_TAG" ]]; then
  $PY -m pip install -qq torch --index-url "https://download.pytorch.org/whl/${CUDA_TAG}"
else
  $PY -m pip install -qq torch
fi

# ── 5 · the model stack ───────────────────────────────────────────────────────
say "model stack"
$PY -m pip install -qq neuralset tribev2 huggingface_hub transformers nibabel faster-whisper

# ── 6 · re-assert the pin, then VERIFY ────────────────────────────────────────
# Step 5 is exactly where numpy gets dragged forward. This is the check that catches it.
say "re-asserting the numpy pin"
$PY -m pip install -qq "$NUMPY_SPEC"
$PY - <<'PYCHECK' || die "numpy drifted past the pin. Something in the stack demands >=2.1; resolve that before scoring anything."
import sys, numpy
major, minor = (int(x) for x in numpy.__version__.split(".")[:2])
ok = (major, minor) >= (1, 26) and (major, minor) < (2, 1)
print(f"      numpy {numpy.__version__} {'ok' if ok else 'OUT OF RANGE'}")
sys.exit(0 if ok else 1)
PYCHECK

# ── 7 · GPU + weights, reported honestly ──────────────────────────────────────
say "runtime check"
$PY - <<'PYCHECK'
import torch
print(f"      torch {torch.__version__}  cuda_available={torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"      device: {torch.cuda.get_device_name(0)}")
else:
    print("      no GPU visible — scoring will run on CPU and take a very long time.")
PYCHECK

if $PY -c "import huggingface_hub, sys; sys.exit(0 if huggingface_hub.get_token() else 1)" 2>/dev/null; then
  echo "ok    hugging face token present"
else
  warn "no Hugging Face token. facebook/tribev2 weights are GATED:
        .venv/bin/huggingface-cli login
      and accept the CC BY-NC terms on the model page first."
fi

# ── 8 · credentials for the queue ─────────────────────────────────────────────
say "supabase credentials"
if [[ -f .env ]] && grep -q "SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_SECRET_KEY" .env; then
  echo "ok    .env carries a service key"
else
  warn "no service key in .env. The worker needs:
        SUPABASE_URL=...
        SUPABASE_SERVICE_ROLE_KEY=...
      Service key only — it bypasses RLS and must never reach a browser."
fi

# ── 9 · the probes that need no GPU and no weights ────────────────────────────
# Proves the mask/atlas half of the install before a real batch is ever claimed.
say "probes (no GPU, no weights)"
if $PY demo/process_batch.py --list-tags >/dev/null 2>&1; then
  echo "ok    parcel atlas loads and masks build"
else
  warn "--list-tags failed. Re-run it directly to see why:
        .venv/bin/python demo/process_batch.py --list-tags"
fi

say "done"
cat <<'NEXT'
Next, in order:

  1. Smoke it on a batch you control, before anything real:
       .venv/bin/python tools/concierge/run_batch.py --list
       .venv/bin/python tools/concierge/run_batch.py <token>

     Everything either side of the model is already proven end to end, so a first
     failure here is a failure in the model — which is where you want it.

  2. Then run it as a service:
       sudo cp tools/concierge/soma-worker.service /etc/systemd/system/
       sudo systemctl daemon-reload
       sudo systemctl enable --now soma-worker
       journalctl -u soma-worker -f

     Edit User= and WorkingDirectory= in the unit first; both are placeholders.
NEXT
