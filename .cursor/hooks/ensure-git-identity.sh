#!/usr/bin/env bash
# beforeShellExecution: ensure git identity before any git write.
# Matcher in .cursor/hooks.json limits this to git commands.
set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("command",""))' 2>/dev/null || true)"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Always allow; side-effect is the policy enforcement.
if printf '%s' "$command" | grep -Eq '(^|[[:space:]])git([[:space:]]|$)'; then
  "$ROOT/scripts/agent-git-identity.sh" >/dev/null 2>&1 || true
fi

printf '%s\n' '{"continue":true,"permission":"allow"}'
exit 0
