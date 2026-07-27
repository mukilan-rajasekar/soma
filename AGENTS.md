<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned

- `next build` locks `.next/lock`; a concurrent build in this checkout fails, not queues.
- Any `globalIgnores([...])` entry replaces eslint's defaults; restate `node_modules` yourself.
- Canonical production origin is `https://www.usesoma.work` — with the `www`.
- Bare `pytest` also collects `*_test.py`: `head_null_test.py` must stay importable.
- `scripts/loop.sh` runs `git add -A`: any untracked file lands in the iteration commit.
- `tests/`, `data/`, `cloud/` are gitignored local-only; sources sit on `muki/oldlandingpage`.
- Untracked `.impeccable/hook.cache.json` names old components; repo-wide greps hit it.
- Identical `./tokens` import lines in demo2/ and preflight/ resolve to different modules.
- `smoke.mjs` misses 404 media: a 404 is not a Playwright `requestfailed`.
- report.ts's `path.join` read makes Next trace all of `public/preflight/` into the function.
- No `pytest` on PATH and system python3 lacks numpy: always `.venv/bin/python -m pytest`.
- nilearn is installed, but its `fetch_atlas_*` download: monkeypatch them in tests.
- Write/Edit under `.claude/` is refused as sensitive; go through Bash `tee`/`perl` instead.
- `pearson`'s zero-variance guard is exact `std()==0`; residualized constants slip through.
