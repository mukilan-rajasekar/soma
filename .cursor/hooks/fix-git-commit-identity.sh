#!/usr/bin/env bash
# afterShellExecution: if a git commit still landed with Cursor Agent author
# or a Co-authored-by trailer, rewrite HEAD to policy.
set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("command",""))')"
exit_code="$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("exitCode", d.get("exit_code", 0)))')"

# Only care about successful commits.
if ! printf '%s' "$command" | grep -Eq '(^|[[:space:]])git[[:space:]]+([^[:space:]]+[[:space:]]+)*commit([[:space:]]|$)'; then
  exit 0
fi
if [ "${exit_code}" != "0" ]; then
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
"$ROOT/scripts/agent-git-identity.sh" >/dev/null 2>&1 || true

author_email="$(git log -1 --format='%ae' 2>/dev/null || true)"
author_name="$(git log -1 --format='%an' 2>/dev/null || true)"
msg="$(git log -1 --format='%B' 2>/dev/null || true)"

need_rewrite=0
if [ "$author_email" = "cursoragent@cursor.com" ] || [ "$author_name" = "Cursor Agent" ]; then
  need_rewrite=1
fi
if printf '%s' "$msg" | grep -q '^Co-authored-by:'; then
  need_rewrite=1
fi
if printf '%s' "$msg" | grep -qi '^Made-with: Cursor'; then
  need_rewrite=1
fi

if [ "$need_rewrite" -eq 0 ]; then
  exit 0
fi

clean_msg="$(printf '%s\n' "$msg" | grep -v -E '^(Co-authored-by:|Made-with: Cursor)' | awk 'NF {p=1} p')"
export GIT_AUTHOR_NAME="Mukilan Rajasekar"
export GIT_AUTHOR_EMAIL="mukilan.rajasekar@gmail.com"
export GIT_COMMITTER_NAME="Mukilan Rajasekar"
export GIT_COMMITTER_EMAIL="mukilan.rajasekar@gmail.com"
# Bypass Cursor hooksPath so the co-author injector cannot re-append during amend.
git -c core.hooksPath=/dev/null commit --amend -m "$clean_msg" --cleanup=strip >/dev/null 2>&1 || true

exit 0
