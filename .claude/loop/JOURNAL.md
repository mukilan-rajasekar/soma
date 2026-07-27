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
