#!/usr/bin/env bash
#
# Warm the TRIBE preds cache over a corpus, one ad at a time.
#
#   ./scripts/warm_arcs.sh ~/soma-corpus-meta meta
#   ./scripts/warm_arcs.sh ~/soma-corpus-meta tiktok
#
# WHY THIS EXISTS
#   `demo/train.py train` does extraction and fitting in one process. On an H200
#   the extraction half measures ~7x realtime, so the meta corpus is ~77 hours of
#   encoder time and the fit at the end is minutes. Running them as one process
#   means three days of work behind a single point of failure.
#
#   So: warm the cache here, then run `train` separately. `train` re-walks every
#   ad but hits the cache, and finishes in minutes.
#
# RESTARTABLE ON PURPOSE — no tmux required
#   Every ad is independent and skipped outright if its feature JSON already
#   exists, so re-running after a dropped SSH session, an OOM, or a JupyterHub
#   idle-cull picks up where it stopped. There is no partial state to repair.
#   That matters more than session persistence: on JupyterHub the single-user
#   server can be culled from under you, taking nohup'd children with it, and
#   the answer is a loop that is cheap to restart rather than one that must not
#   die. If you want it detached anyway:
#
#     nohup ./scripts/warm_arcs.sh ~/soma-corpus-meta meta > warm.log 2>&1 &
#     tail -f warm.log
#
# WHY --baseline-dir IS NOT OPTIONAL HERE
#   Without it, control_series() decodes the video with opencv. In `features`
#   that raises ModuleNotFoundError; in `train` the RuntimeError is CAUGHT per-ad
#   and every one of the 652 ads is silently skipped, ending in a bare "No ads
#   have both extracted features and labels". The corpus ships the four control
#   series per ad already, so this script requires the directory and fails loudly
#   if it is missing.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

CORPUS="${1:-}"
TARGET="${2:-meta}"

if [[ -z "$CORPUS" ]]; then
    echo "usage: $0 <corpus-dir> [meta|tiktok]" >&2
    exit 2
fi

case "$TARGET" in
    meta)   PREFIX="meta_" ;;
    tiktok) PREFIX="tt_" ;;
    *)      echo "target must be 'meta' or 'tiktok', got '$TARGET'" >&2; exit 2 ;;
esac

# The repo convention: never silently fall back to a system python that lacks
# numpy. Override with PYTHON= only if your venv lives elsewhere.
PYTHON="${PYTHON:-.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
    echo "no python at '$PYTHON' — activate the venv or set PYTHON=" >&2
    exit 1
fi

VIDEO_DIR="$CORPUS/videos"
BASELINE_DIR="$CORPUS/baseline"
CACHE_DIR="${CACHE_DIR:-data/ad_head}"
FEATURE_DIR="${FEATURE_DIR:-$CACHE_DIR/features}"

for d in "$VIDEO_DIR" "$BASELINE_DIR"; do
    [[ -d "$d" ]] || { echo "missing directory: $d" >&2; exit 1; }
done
mkdir -p "$FEATURE_DIR"

shopt -s nullglob
VIDEOS=("$VIDEO_DIR/$PREFIX"*.mp4)
shopt -u nullglob
TOTAL=${#VIDEOS[@]}
if (( TOTAL == 0 )); then
    echo "no ${PREFIX}*.mp4 under $VIDEO_DIR" >&2
    exit 1
fi

echo "corpus   $CORPUS"
echo "target   $TARGET ($TOTAL ads)"
echo "cache    $CACHE_DIR"
echo "features $FEATURE_DIR"
echo

DONE=0
SKIPPED=0
FAILED=0
START=$(date +%s)

for video in "${VIDEOS[@]}"; do
    ad_id="$(basename "$video" .mp4)"
    out="$FEATURE_DIR/${ad_id}_features.json"
    i=$(( DONE + SKIPPED + FAILED + 1 ))

    # Skip before touching python: the in-process cache still sha1s the mp4 and
    # the built stimulus, which is real I/O across 652 files.
    if [[ -s "$out" ]]; then
        SKIPPED=$(( SKIPPED + 1 ))
        continue
    fi

    printf '[%d/%d] %s ... ' "$i" "$TOTAL" "$ad_id"
    if "$PYTHON" demo/train.py features \
        --video "$video" \
        --ad-id "$ad_id" \
        --baseline-dir "$BASELINE_DIR" \
        --cache-dir "$CACHE_DIR" \
        --out "$out" > "$FEATURE_DIR/${ad_id}.log" 2>&1
    then
        DONE=$(( DONE + 1 ))
        printf 'ok (%s elapsed)\n' "$(( ($(date +%s) - START) / 60 ))m"
    else
        FAILED=$(( FAILED + 1 ))
        rm -f "$out"          # never leave a truncated JSON that a rerun would skip
        printf 'FAILED — see %s\n' "$FEATURE_DIR/${ad_id}.log"
        echo "$ad_id" >> "$FEATURE_DIR/failures.txt"
    fi
done

echo
echo "extracted $DONE, already cached $SKIPPED, failed $FAILED, of $TOTAL"
if (( FAILED > 0 )); then
    echo "failures listed in $FEATURE_DIR/failures.txt — rerunning this script retries only those"
    exit 1
fi
echo
echo "next:"
echo "  $PYTHON demo/train.py train --corpus $CORPUS --target $TARGET \\"
echo "    --temporal shape --folds 5 --as-of 2026-07-29 \\"
echo "    --baseline-dir $BASELINE_DIR --cache-dir $CACHE_DIR \\"
echo "    --out $CACHE_DIR/ad_head_$TARGET.json"
