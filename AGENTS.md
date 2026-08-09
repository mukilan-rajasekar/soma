<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ
from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before
writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent map (start here)

Cold agents: read this block before grepping. Full index: [`docs/INDEX.md`](docs/INDEX.md).

| Need | Go here |
|---|---|
| What the repo is / how to run | [`README.md`](README.md) |
| **What to build next (product)** | [`docs/strategy/BUILD-PLAN-FULL-SERVICE.md`](docs/strategy/BUILD-PLAN-FULL-SERVICE.md) (living A→I→S plan) |
| **Revenue / weekly pricing** | [`docs/strategy/BUILD-PLAN-REVENUE.md`](docs/strategy/BUILD-PLAN-REVENUE.md) |
| Science / GTM spine (Jul 30) | [`docs/strategy/PLAN.md`](docs/strategy/PLAN.md) — still valid for Tracks A/C; Serve destination is the BUILD-PLAN |
| Architecture (site / box / DB) | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Canonical scorer | `demo/process_batch.py` (do not invent a second batch scorer) |
| Ship gate | `scripts/verify.sh` (`npm run verify`) |
| Python role catalog | [`pipeline/README.md`](pipeline/README.md) |
| Migrations / intentional gaps | [`supabase/migrations/README.md`](supabase/migrations/README.md) — **do not invent `0009` or `0013`** |
| Demo naming (six “demo” trees) | [`docs/INDEX.md`](docs/INDEX.md)#demo-names |
| Canonical production origin | `https://www.usesoma.work` (with the `www`) |

**Local-only trees (gitignored):** `/data/`, `/tests/`, `/cloud/`. They are not in this
checkout by design. Do not invent imports that only exist on a machine with a private
corpus. Older notes that pointed at `muki/oldlandingpage` are obsolete — that branch is
gone; treat those paths as operator-local only.

**Author:** Mukilan Rajasekar \<mukilan.rajasekar@gmail.com\>. Agent commits must use that
author/committer identity — never Cursor Agent / Codex co-author lines.

## Gotchas (learned)

- `next build` locks `.next/lock`; a concurrent build in this checkout fails, not queues.
- Any `globalIgnores([...])` entry replaces eslint's defaults; restate `node_modules` yourself.
- Canonical production origin is `https://www.usesoma.work` — with the `www`.
- Bare `pytest` also collects `*_test.py`: `head_null_test.py` must stay importable.
- `scripts/loop.sh` runs `git add -A`: any untracked file lands in the iteration commit.
- `/data/`, `/tests/`, `/cloud/` are gitignored local-only (operator corpus / scratch).
- Untracked `.impeccable/hook.cache.json` names old components; repo-wide greps hit it.
- Identical `./tokens` import lines in demo2/ and preflight/ resolve to different modules.
- `smoke.mjs` misses 404 media: a 404 is not a Playwright `requestfailed`.
- report.ts's `path.join` read makes Next trace all of `public/preflight/` into the function.
- No `pytest` on PATH and system python3 lacks numpy: always `.venv/bin/python -m pytest`.
- nilearn is installed, but its `fetch_atlas_*` download: monkeypatch them in tests.
- Write/Edit under `.claude/` is refused as sensitive; go through Bash `tee`/`perl` instead.
- `pearson`'s zero-variance guard is exact `std()==0`; residualized constants slip through.
- Constant first-diffs make score_r NaN: linear test arcs need curvature.
- Pipeline guards raise SystemExit; head_io raises ValueError — check before `pytest.raises`.
- numpy 2.5 in `.venv`: `arr.ptp()` is gone, only `np.ptp(arr)` works.
- `_proxy_arc` signs only `valence`; every other dim silently takes the `|.|` branch.
- resample_to_grid pools with nanmean: only an all-NaN shot reaches the lane as NaN.
- `npm run lint` is bare eslint (whole tree); prefer the gate's scope when judging ship.
- A loop commit can name a backlog item without doing it — check the diff.
- verify.sh requires `.venv`; do not fall back to system python3.
- requirements.txt's active `torch` line can pull a CUDA wheel into a CPU venv — read its header.
- package.json `engines` overrides `.vercel/project.json`'s nodeVersion on deploys.
- Next reads `.env.local` then `.env`; the Python half reads `.env` only.
- Session refresh is `src/proxy.ts`, not `middleware.ts` (Next 16).
- `@supabase/ssr` 0.12 defaults BOTH clients to PKCE; `/auth/callback` must bind its
  cookie adapter to the redirect response it returns (not `cookies()`), and it stays out
  of the proxy matcher — the proxy's `getUser()` would run before the exchange.
- A `<Link>` to any route in the proxy matcher (`/sign-in`, `/sign-up`, ...) needs
  `prefetch={false}` or the viewport prefetch surfaces as a failed request in smoke.
- Serve live Meta writes need `SOMA_SERVE_LIVE=1`; `--activate` needs a spend-cap fixture.
- Corpus meta: `rho(ad age, days_running)=+0.54`; duration+age+ffmpeg alone reach rho 0.515.
- An OOF prediction partialled on its own covariates runs ~-0.25 under a shuffled label:
  that is shrinkage, not leakage, so a shuffle-control gate must be ONE-SIDED.
- train.py drops an ad whose video find_video() cannot resolve with NO message: a
  half-populated videos/ trains on fewer ads and reports the smaller n as the plan.
- `demo/train.py train` re-extracts from the mp4 and never reads the features JSONs;
  the cache key is a sha1 of the source video, so no file means no cache hit either.
- `pricing.margin_micros` does `int(margin_pct * 100)`: 287 of the 5001 two-decimal
  margins in [0,50] lose a basis point (2.01% bills 200bp, not 201), against a docstring
  promising it rounds UP. `cases()` only uses 0/12.5/20/50 — all exactly representable —
  and `src/lib/pricing.ts` does `Math.trunc` on the same product, so check-pricing-parity
  passes while BOTH sides are wrong. Fixing it means both languages plus 0016's check.
- Three copies of `load_dotenv`/`env_any` (`publish_to_supabase.py`, `tools/concierge/
  run_batch.py`, `scripts/ingest_partner_ad.py`) whose docstrings claim to be identical
  and are not: the first two skip values ending `...`, ingest_partner_ad only skips
  `PASTE`. A truncated paste (`KEY=eyJhbGci...`) is rejected by two and accepted by one.
