#!/usr/bin/env bash
#
# The gate. Exit 0 means "this working tree is not a regression."
#
# This file is the loop's only source of truth about whether an iteration was
# good. The loop is explicitly forbidden from editing it, and scripts/loop.sh
# reverts any change to it. If you want the loop to be able to do more, widen
# the gate here, deliberately, by hand.
#
# Usage: ./scripts/verify.sh          full gate
#        SKIP_SMOKE=1 ./scripts/verify.sh   build + lint + pytest only

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

PORT="${VERIFY_PORT:-3099}"
SERVER_PID=""
FAILED=0

step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$1"; FAILED=1; }

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

# ---- 1. build ---------------------------------------------------------------
step "next build"
BUILD_OK=1
if ! npm run build > /tmp/soma-verify-build.log 2>&1; then
  # `next build` takes an exclusive .next/lock and fails rather than queues.
  # Another agent or a stray build in this checkout is an environment problem,
  # not a regression in the change under test — wait it out once before judging.
  if grep -q "Another next build process is already running" /tmp/soma-verify-build.log; then
    echo "build lock held by another process — waiting 45s and retrying once"
    sleep 45
    if ! npm run build > /tmp/soma-verify-build.log 2>&1; then
      tail -40 /tmp/soma-verify-build.log
      fail "next build (after lock retry)"
      BUILD_OK=0
    fi
  else
    tail -40 /tmp/soma-verify-build.log
    fail "next build"
    BUILD_OK=0
  fi
fi

# ---- 2. lint ----------------------------------------------------------------
# Whole repo, the same scope as `npm run lint` — a gate that lints less than the
# local command lets scripts/ and config files rot unchecked. Safe now because
# eslint.config.mjs restates every default ignore (node_modules/, .venv/, .next/)
# that globalIgnores() would otherwise drop; this used to be scoped to src/ when
# it did not.
step "eslint"
if ! npx eslint .; then
  fail "eslint"
fi

# ---- 3. python tests --------------------------------------------------------
# Conditional: bare pytest exits 5 ("no tests collected") when the pipeline has
# no tests yet, which would wedge the gate closed forever. Once you add the
# first test_*.py this starts enforcing automatically.
step "pytest"
PYTEST_TARGETS=$(find . -name 'test_*.py' -not -path './.venv/*' -not -path './node_modules/*' -not -path './.next/*' 2>/dev/null | head -1)
if [[ -z "$PYTEST_TARGETS" ]]; then
  echo "no test_*.py found — skipping (add one and this gate arms itself)"
elif [[ -x .venv/bin/python ]]; then
  .venv/bin/python -m pytest -q || fail "pytest"
else
  python3 -m pytest -q || fail "pytest"
fi

# ---- 4. demo artifact coherence ---------------------------------------------
# A handful of figures on /demo are hand-kept TS literals transcribed from a build
# of report.json (the cull chart's candidates, the pass line, the predicted edit).
# They go stale SILENTLY on a weight retune: the board re-ranks itself correctly
# while the chart above it keeps showing the old scores. Pure arithmetic over two
# committed JSONs — no GPU, no network, no build — so it costs nothing to always run.
step "demo artifact coherence"
if [[ -x .venv/bin/python ]]; then
  .venv/bin/python tools/demo/check_coherence.py || fail "demo artifact coherence"
else
  python3 tools/demo/check_coherence.py || fail "demo artifact coherence"
fi

# ---- 5. smoke ---------------------------------------------------------------
if [[ "$BUILD_OK" == "0" ]]; then
  step "smoke (skipped — build failed, smoke would only echo it)"
elif [[ "${SKIP_SMOKE:-0}" == "1" ]]; then
  step "smoke (skipped)"
else
  step "smoke"
  if ! node -e "require.resolve('playwright')" 2>/dev/null; then
    fail "playwright not installed — run: npm i -D playwright@1.61.1"
  elif lsof -ti "tcp:$PORT" > /dev/null 2>&1; then
    fail "port $PORT already in use — free it or set VERIFY_PORT"
  else
    npx next start -p "$PORT" > /tmp/soma-verify-server.log 2>&1 &
    SERVER_PID=$!

    ready=0
    for _ in $(seq 1 45); do
      if curl -sf -o /dev/null "http://localhost:$PORT/"; then ready=1; break; fi
      if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
      sleep 1
    done

    if [[ "$ready" != "1" ]]; then
      tail -30 /tmp/soma-verify-server.log
      fail "server never came up on :$PORT"
    else
      SMOKE_URL="http://localhost:$PORT" node scripts/smoke.mjs || fail "smoke"
    fi
  fi
fi

# ---- verdict ----------------------------------------------------------------
if [[ "$FAILED" == "1" ]]; then
  printf '\n\033[31m✗ verify failed\033[0m\n'
  exit 1
fi
printf '\n\033[32m✓ verify passed\033[0m\n'
