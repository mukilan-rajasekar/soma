#!/usr/bin/env bash
# agent-git-identity.sh — force every Cursor agent commit to be yours.
#
# Cloud Agents default to author "Cursor Agent <cursoragent@cursor.com>" and a
# managed commit-msg hook that appends Co-authored-by. Neither is configurable
# in the Cursor product today. This script is the repo's permanent override:
#
#   1. Sets user.name / user.email (global + this repo) to Mukilan Rajasekar.
#   2. Replaces Cursor's commit-msg.cursor.co-author injector with a no-op.
#
# Idempotent. Safe to run from environment install, before every git commit
# (via .cursor/hooks.json), or by hand.
#
# Usage: ./scripts/agent-git-identity.sh

set -euo pipefail

NAME="Mukilan Rajasekar"
EMAIL="mukilan.rajasekar@gmail.com"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git config --global user.name "$NAME"
git config --global user.email "$EMAIL"
git config user.name "$NAME"
git config user.email "$EMAIL"

# Cursor points core.hooksPath at a per-workspace agent-hooks dir and runs
# commit-msg.cursor.co-author from there. Overwrite every copy we can see with
# a no-op so the dispatcher still finds an executable file, but nothing is
# appended. chmod -x alone is not enough — a fresh agent boot can recreate it.
noop_coauthor() {
  local f="$1"
  cat >"$f" <<'EOF'
#!/bin/bash
# Soma policy: do not append Co-authored-by on agent commits.
# Replaces Cursor's managed commit-msg.cursor.co-author injector.
exit 0
EOF
  chmod +x "$f"
}

shopt -s nullglob
for f in \
  /home/ubuntu/.cursor/agent-hooks/*/commit-msg.cursor.co-author \
  /home/cursor/.cursor/agent-hooks/*/commit-msg.cursor.co-author \
  "$HOME"/.cursor/agent-hooks/*/commit-msg.cursor.co-author
do
  noop_coauthor "$f"
done
shopt -u nullglob

# Belt: a repo-native commit-msg that strips any Co-authored-by that still
# sneaks in. Cursor's dispatcher runs ORIGINAL_HOOKS_PATH first, then its own
# hooks — so this alone cannot beat a live co-author injector, but together
# with the no-op above it covers both orders and plain `git commit` without
# the agent hooksPath.
HOOKS_DIR="$ROOT/.git/hooks"
mkdir -p "$HOOKS_DIR"
cat >"$HOOKS_DIR/commit-msg" <<'EOF'
#!/bin/bash
# Strip Co-authored-by / Made-with-Cursor trailers from the commit message.
msg="$1"
tmp="$(mktemp)"
grep -v -E '^(Co-authored-by:|Made-with: Cursor)' "$msg" | awk 'NF {p=1} p' >"$tmp" || true
# Trim trailing blank lines
awk 'NF {p=1} p' "$tmp" | perl -00 -pe 's/\n+\z/\n/' >"$msg" 2>/dev/null || cp "$tmp" "$msg"
rm -f "$tmp"
exit 0
EOF
chmod +x "$HOOKS_DIR/commit-msg"

echo "git identity -> $NAME <$EMAIL>"
echo "co-author injector neutralized"
