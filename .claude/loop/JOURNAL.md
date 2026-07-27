# Loop journal

Append-only. One entry per iteration, newest at the bottom. This is what you
read to decide whether the loop is earning its keep — and what the loop reads
to decide which critique lens is due.

Format:

```
## <iso date> — <item>
changed: <files touched, one line>
why: <one line>
surprised: <anything that did not work as expected, or "nothing">
```

---

## 2026-07-27 — scaffold
changed: scripts/{loop,verify}.sh, scripts/smoke.mjs, .claude/loop/*
why: establish a gate before running any unattended iterations
surprised: eslint was walking .venv and reporting 17k problems; playwright was
extraneous; the two ERR_ABORTED mp4 requests on /demo and /preflight are benign
preload cancellations, not 404s — all four videos serve 200

## 2026-07-27 — Declare playwright as a devDependency
changed: package.json, package-lock.json
why: playwright was `extraneous` — present in node_modules but undeclared, so any
`npm ci` would delete it and scripts/verify.sh's smoke step would fail closed.
Now pinned as devDependency ^1.61.1; lockfile diff is purely additive
(playwright, playwright-core, fsevents). Full gate green: all 4 routes ok.
surprised: two things. (1) A CONCURRENT agent session is editing this same
working tree right now — src/components/demo2/useReveal.ts (ON_SCREEN
rootMargin, -45% -> -32% -> -40%) changed under me mid-iteration, and I left it
alone rather than reverting someone else's in-flight work. loop.sh's `git add
-A` will sweep it into this commit even though it is not my item; loop.sh's
clean-tree precondition only holds at loop start, not per iteration. (2) That
other session's `next build` holds `.next/lock`, which made one verify.sh run
fail with "Another next build process is already running" — a transient,
environmental failure, not a code one. It passed on retry. If the loop's own
post-iteration gate races that lock, a good change gets rolled back for no
reason; running the loop while another agent works in the same checkout is not
safe.
