# Loop backlog

One item per iteration, top-down. Keep items small, concrete, and
independently shippable. Every item should be something you could review in
under five minutes.

Seed items below were found by inspecting the repo — each one is a verified,
real condition, not a guess. Keep authoring these by hand for the first week;
only let the loop refill this file once you have read a few of its critique
passes and agree with its taste.

## Now

- [ ] Declare playwright as a devDependency (`npm i -D playwright@1.61.1`). It
      is `extraneous` today — installed in node_modules but absent from
      package.json — so any `npm ci` deletes it and the smoke gate breaks.
- [ ] Restore eslint's default ignores in `eslint.config.mjs`. The
      `globalIgnores([...])` override drops them, so a bare `npx eslint .`
      walks `.venv/lib/python3.13/site-packages/` and reports 17,046 problems
      (2,005 errors) from vendored Python package JS. Add `node_modules/**`,
      `.venv/**`, `**/__pycache__/**` alongside the existing entries. Verify
      with `npx eslint .` — it should be quiet — and confirm `npx eslint src`
      still passes.
- [ ] Set `metadataBase` in the root metadata export. `next build` warns that
      open-graph and twitter images resolve against `http://localhost:3000`,
      which means link previews for /demo and /demo-short are wrong wherever
      they are shared. Use the production origin (usesoma.work).
- [ ] Add the first `test_*.py` for the Python pipeline. Pick one pure,
      dependency-free function (start with `head_io.py` or the mask-shaping
      logic in `build_roi_mask.py`) and test it against a small fixture.
      This is the highest-leverage item in the file: the pytest step in
      `scripts/verify.sh` is dormant until a `test_*.py` exists, so this is
      what arms the gate for every future iteration on the science code.
- [ ] Decide what to do with the root scratch scripts `_shoot.mjs` and
      `_verify.mjs` — either move them to `scripts/` as named, documented
      tools, or add them to `.gitignore`. They are untracked clutter at the
      repo root today.

## Done

<!-- completed items get moved down here with their commit sha -->
