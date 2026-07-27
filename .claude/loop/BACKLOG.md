# Loop backlog

One item per iteration, top-down. Keep items small, concrete, and
independently shippable. Every item should be something you could review in
under five minutes.

Seed items below were found by inspecting the repo — each one is a verified,
real condition, not a guess. Keep authoring these by hand for the first week;
only let the loop refill this file once you have read a few of its critique
passes and agree with its taste.

## Now

- [x] Declare playwright as a devDependency (`npm i -D playwright@1.61.1`). It
      is `extraneous` today — installed in node_modules but absent from
      package.json — so any `npm ci` deletes it and the smoke gate breaks.
- [x] Restore eslint's default ignores in `eslint.config.mjs`. The
      `globalIgnores([...])` override drops them, so a bare `npx eslint .`
      walks `.venv/lib/python3.13/site-packages/` and reports 17,046 problems
      (2,005 errors) from vendored Python package JS. Add `node_modules/**`,
      `.venv/**`, `**/__pycache__/**` alongside the existing entries. Verify
      with `npx eslint .` — it should be quiet — and confirm `npx eslint src`
      still passes.
- [x] Set `metadataBase` in the root metadata export. `next build` warns that
      open-graph and twitter images resolve against `http://localhost:3000`,
      which means link previews for /demo and /demo-short are wrong wherever
      they are shared. Use the production origin (usesoma.work).
- [x] Add the first `test_*.py` for the Python pipeline. Pick one pure,
      dependency-free function (start with `head_io.py` or the mask-shaping
      logic in `build_roi_mask.py`) and test it against a small fixture.
      This is the highest-leverage item in the file: the pytest step in
      `scripts/verify.sh` is dormant until a `test_*.py` exists, so this is
      what arms the gate for every future iteration on the science code.
- [x] Decide what to do with the root scratch scripts `_shoot.mjs` and
      `_verify.mjs` — either move them to `scripts/` as named, documented
      tools, or add them to `.gitignore`. They are untracked clutter at the
      repo root today.
      Resolved as gitignore. By the time this ran the family was
      `_brain/_shoot2/_sq/_text2/_verify2.mjs`, and loop.sh's `git add -A` had
      already committed all five — so .gitignore alone was a no-op and they
      needed `git rm --cached` first. Each is pinned to the :3055 dev server and
      to a `/tmp` scratchpad that no longer exists, and each carries one-session
      baselines ("was 6220", "was 53395ms") in its output strings; none is
      promotable without a rewrite. The keeper of that family already exists:
      `tools/demo/shoot.mjs`, which takes out-dir and URL as argv.

- [x] Delete `src/components/demo2/RankBoard.tsx` (128 lines) and
      `src/components/demo2/RegionTable.tsx` (101 lines). Neither is imported
      anywhere in `src` — the only occurrences of either name in the repo are
      three prose comments (`DemoScrollPage.tsx:801`, `useReveal.ts:20`,
      `Stat.tsx:41`) that cite RankBoard as a past reveal-timing example. Both
      files are still typechecked and linted on every build. Delete them and
      reword those three comments so they stop naming a file that is gone.
- [ ] De-fork `src/components/preflight/TwoRegionBrain3D.tsx` (680 lines) from
      `src/components/demo2/TwoRegionBrain3D.tsx` (693 lines). `diff` between
      the two is 35 lines and only five real knobs: the `TwoRegionBrain` import
      path, `reach` on two insula seed points (0.27/0.30 vs 0.21/0.24),
      `SPIN_RATE` (0.06 vs 0.19), the `uGrey` lerp (0.7 vs 0.52) and
      `uBaseAlpha` (0.44 vs 0.48). Everything else, including a whole GLSL
      shader, is identical. Make those five props, default them to the demo2
      values, and have /preflight pass its own. The preflight copy already
      imports `../demo2/TwoRegionBrain`, so cross-directory import is an
      established pattern here. Removes ~660 duplicated lines.
- [ ] Collapse the duplicated 6.4 MB video set. sha256 confirms
      `public/campaign/v0{1..5}_30s_*.mp4` and `public/preflight/videos/`'s
      `{story_hook,deal_first,product_first,urgency_first,weak_open}.mp4` are
      the same five files under two naming schemes — 6.4 MB shipped twice in
      every clone and every deploy. /demo reaches them through absolute
      `/campaign/...` URLs that `tools/demo/build_report.py:589` bakes into
      `public/demo/report.json`; /preflight builds `${VIDEO_URL_PREFIX}/${filename}`
      in `src/components/preflight/report.ts:18` (all five `video` fields in
      `batch_report.json` are null, so the basename path is the live one). Pick
      one directory and one naming scheme, `git rm` the loser, and update
      whichever Python default feeds it — `build_report.py:589` or
      `process_batch.py`'s `--video-url-prefix` (line 1299) — or the next
      regeneration re-creates the fork. Confirm both routes still play.
- [ ] `git rm public/preflight/batch_report_old.json` (12 KB). It is tracked and
      referenced by nothing in `src/`, `scripts/`, `tools/` or `demo/`. The live
      artifact is `batch_report.json`, named at `preflight/report.ts:15`.
- [ ] Give the repo a discoverable dev loop. `package.json` exposes only
      `dev`/`build`/`start`/`lint`, so the only way to learn how to typecheck or
      how to run the Python suite is to read `scripts/verify.sh`. Add
      `"typecheck": "tsc --noEmit"` (1s incremental here, against ~40s for a full
      build) and `"test": "pytest -q"`. Do not touch `verify.sh` — this only makes
      the commands it already runs reachable by name.
- [ ] Record that `tests/` is local-only, and stop leaning on an uncommitted file
      to hide it. `.git/info/exclude` lives inside `.git`, so it exists on this
      machine and nowhere else; it hides `/tests/`, `/data/`, `/cloud/`, `/demo/`,
      `/__pycache__/` and the colab notebooks. `tests/` alone is 26 MB of
      synthetic fixtures (`tests/synth/*.npy`, `ydata-tvsum50.mat`,
      `synth_clip.mp4`) plus stale `__pycache__` for eleven test modules whose
      `.py` files are gone. Two consequences worth writing down: a fresh clone has
      no `tests/` at all, so any `test_*.py` reading `tests/synth/` passes here and
      fails everywhere else; and on any other checkout that hiding is absent, so
      `scripts/loop.sh`'s `git add -A` would sweep those dirs into a commit. Move
      the durable patterns into `.gitignore`.

## Done

<!-- completed items get moved down here with their commit sha -->
