#!/usr/bin/env bash
#
# The self-improving loop runner.
#
#   ./scripts/loop.sh 3            3 iterations, prompts on risky tool calls
#   LOOP_YOLO=1 ./scripts/loop.sh 20   unattended (see the warning below)
#   touch .claude/loop/STOP        stop after the current iteration
#
# Each iteration is a FRESH claude context. That is deliberate: nothing rots
# across 20 runs. All continuity lives on disk in .claude/loop/.
#
# The contract: the agent proposes, scripts/verify.sh disposes. The gate runs
# out here in the shell where the agent cannot reach it, and any edit the agent
# makes to the gate itself is reverted before the gate runs.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

MAX="${1:-5}"
LOOP_DIR=".claude/loop"
PROTECTED=(scripts/verify.sh scripts/smoke.mjs scripts/loop.sh "$LOOP_DIR/PROMPT.md")

say()  { printf '\n\033[1;36m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }
die()  { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

command -v claude > /dev/null || die "claude CLI not found on PATH"
[[ -f "$LOOP_DIR/PROMPT.md" ]] || die "missing $LOOP_DIR/PROMPT.md"
[[ -x scripts/verify.sh ]] || die "scripts/verify.sh is not executable (chmod +x it)"

# ---- precondition: clean tree ----------------------------------------------
# Non-negotiable. The loop commits with `git add -A` and rolls back with
# `git reset --hard` + `git clean`. Starting dirty means either sweeping your
# uncommitted work into a robot commit or deleting it on a failed iteration.
if [[ -n "$(git status --porcelain --untracked-files=all | grep -v '\.claude/loop/')" ]]; then
  warn "working tree is dirty. Commit or stash first:"
  git status --short | head -20
  die "refusing to start"
fi

BRANCH="loop/$(git rev-parse --short HEAD)-$MAX"
git checkout -B "$BRANCH" > /dev/null 2>&1 || die "could not create branch $BRANCH"
say "branch: $BRANCH   iterations: $MAX"

rm -f "$LOOP_DIR/STOP"
mkdir -p "$LOOP_DIR"

PERM_ARGS=(--permission-mode acceptEdits)
if [[ "${LOOP_YOLO:-0}" == "1" ]]; then
  PERM_ARGS=(--dangerously-skip-permissions)
  warn "LOOP_YOLO=1 — running unattended with permissions bypassed on branch $BRANCH"
fi

passed=0
rolled_back=0

for i in $(seq 1 "$MAX"); do
  if [[ -f "$LOOP_DIR/STOP" ]]; then
    say "STOP file present — halting before iteration $i"
    break
  fi

  say "──── iteration $i / $MAX ────"
  : > "$LOOP_DIR/LAST_TASK"

  claude -p "$(cat "$LOOP_DIR/PROMPT.md")" \
    --append-system-prompt "You are iteration $i of $MAX in an unattended loop on branch $BRANCH. No human is watching this run. Leave the repo in a committable state. Do exactly one backlog item." \
    --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Skill" \
    "${PERM_ARGS[@]}" \
    --max-turns 60

  # ---- guard: the agent must not move its own goalposts --------------------
  for f in "${PROTECTED[@]}"; do
    if ! git diff --quiet -- "$f" 2>/dev/null; then
      warn "!! iteration $i modified $f — reverting that file"
      git checkout -- "$f"
    fi
  done

  # ---- the gate ------------------------------------------------------------
  if ./scripts/verify.sh; then
    task="$(head -1 "$LOOP_DIR/LAST_TASK" 2>/dev/null)"
    [[ -z "$task" ]] && task="iteration $i"
    git add -A
    if git diff --cached --quiet; then
      warn "iteration $i produced no changes"
    else
      git commit -q -m "loop($i): $task"
      passed=$((passed + 1))
      printf '\033[32mcommitted: %s\033[0m\n' "$task"
    fi
  else
    warn "gate failed — rolling back iteration $i"
    # Safe because we required a clean tree at start: the only untracked files
    # are this iteration's. -e keeps the loop's own journal/backlog alive.
    git reset --hard HEAD > /dev/null
    git clean -fd -e "$LOOP_DIR" > /dev/null
    rolled_back=$((rolled_back + 1))
  fi
done

say "done — $passed committed, $rolled_back rolled back, on $BRANCH"
echo "review with:  git log --oneline main..$BRANCH"
