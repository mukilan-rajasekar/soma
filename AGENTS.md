<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned

- `next build` locks `.next/lock`; a concurrent build in this checkout fails, not queues.
- Any `globalIgnores([...])` entry replaces eslint's defaults; restate `node_modules` yourself.
- Canonical production origin is `https://www.usesoma.work` — with the `www`.
- Bare `pytest` also collects `*_test.py`: `head_null_test.py` must stay importable.
