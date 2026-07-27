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
- [x] De-fork `src/components/preflight/TwoRegionBrain3D.tsx` (680 lines) from
      `src/components/demo2/TwoRegionBrain3D.tsx` (693 lines). `diff` between
      the two is 35 lines and only five real knobs: the `TwoRegionBrain` import
      path, `reach` on two insula seed points (0.27/0.30 vs 0.21/0.24),
      `SPIN_RATE` (0.06 vs 0.19), the `uGrey` lerp (0.7 vs 0.52) and
      `uBaseAlpha` (0.44 vs 0.48). Everything else, including a whole GLSL
      shader, is identical. Make those five props, default them to the demo2
      values, and have /preflight pass its own. The preflight copy already
      imports `../demo2/TwoRegionBrain`, so cross-directory import is an
      established pattern here. Removes ~660 duplicated lines.
- [x] Collapse the duplicated 6.4 MB video set. sha256 confirms
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
      Resolved by keeping public/campaign/ (its names match the source cuts in
      data/ads/variants/talk_ad/) and pointing the preflight artifact there. Neither
      Python default moved: the preflight report reaches its media by basename
      (story_hook.mp4) and campaign by variant id (v01_30s_story_hook.mp4), so no
      prefix change can bridge them — and --web-videos names transcodes by ad id
      (ad_01.mp4), a third scheme. Set the five `video` fields instead (they take
      precedence over the basename fallback) and wrote the reason into
      demo/README.md, where a re-run would hit it.
- [x] `git rm public/preflight/batch_report_old.json` (12 KB). It is tracked and
      referenced by nothing in `src/`, `scripts/`, `tools/` or `demo/`. The live
      artifact is `batch_report.json`, named at `preflight/report.ts:15`.
      Confirmed and removed. It was 8.8 KB on disk, not 12, and it entered the repo in
      the same commit as batch_report.json (ed7aac2) as a superseded snapshot: same
      schemaVersion, same five ads, different order. Its five `video` fields still
      pointed at `/preflight/videos/v0*.mp4`, which loop(8) deleted — so it was stale as
      well as orphaned. Removing it also drops it from
      `.next/server/app/preflight/page.js.nft.json`: report.ts builds its path with
      `path.join(...)`, so Next traces the whole directory and was bundling the dead
      file into the /preflight function.
- [x] Give the repo a discoverable dev loop. `package.json` exposes only
      `dev`/`build`/`start`/`lint`, so the only way to learn how to typecheck or
      how to run the Python suite is to read `scripts/verify.sh`. Add
      `"typecheck": "tsc --noEmit"` (1s incremental here, against ~40s for a full
      build) and `"test": "pytest -q"`. Do not touch `verify.sh` — this only makes
      the commands it already runs reachable by name.
      Added as `typecheck` and `test`. Shipped `test` as
      `.venv/bin/python -m pytest -q`, not the bare `pytest -q` the item asked for:
      there is no `pytest` on PATH (it lives at `.venv/bin/pytest`) and the system
      python3 has neither pytest nor numpy, so `pytest -q` would have been a
      discoverable command that always fails. This is the exact command verify.sh
      runs. `typecheck` exits 2 on a real type error, so it is a usable pre-build
      check and not a decoration.
- [x] Record that `tests/` is local-only, and stop leaning on an uncommitted file
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
      Moved `/data/`, `/tests/`, `/cloud/` and `.gstack/` into `.gitignore`, each with
      the reason written above it; `git check-ignore -v` now names `.gitignore` rather
      than `.git/info/exclude` for all four. Two corrections to the item. (1) `/demo/`
      must NOT move: demo/ holds three tracked files (README.md, process_batch.py,
      manifest.example.json), so a committed blanket ignore would silently swallow the
      next real file added there. It stays in the local exclude, where all it hides is
      demo/vendor/ and demo/.gstack/. (2) The eleven test modules are not gone —
      tests/*.py is tracked on branch `muki/oldlandingpage` (12 files, including
      make_synthetic_data.py, which regenerates tests/synth/). Only tests/synth/ itself
      has never been in git on any branch. Trimming the now-shadowed lines out of
      `.git/info/exclude` was refused by the sensitive-file guard; harmless, since that
      file is per-machine and `.gitignore` already takes precedence over it.

## Test coverage — the Python pipeline (critique pass, 2026-07-27)

Seven items, one per module, no overlap: each is a single new `test_*.py` that
can ship on its own. Every assertion below was run against the real code before
being written down, so the expected values are measured, not guessed.

Three constraints that apply to all of them:
- **Build fixtures inline.** A fresh clone has no `tests/` (it is gitignored,
  local-only), so a test that reads `tests/synth/` is green here and red
  everywhere else. `test_head_io.py` is the pattern to copy.
- **Never touch the network.** `nilearn` 0.14.0 *is* installed, but every
  `datasets.fetch_atlas_*` downloads. Monkeypatch the fetcher instead.
- ~~**Declare `pytest` in `requirements.txt`.**~~ DONE, in the same commit as
  `test_honest_corr.py` (the first of these taken). It was absent — `scipy` and
  `nilearn` were declared, `pytest` was not — so a fresh
  `pip install -r requirements.txt` produced an environment where `npm test` and
  `scripts/verify.sh`'s pytest step both failed. Nothing further to do here.

- [x] Add `test_honest_corr.py` for the shared stats/alignment core in
      `honest_corr_timeseries.py`. Highest leverage in this block: all four
      pipeline modules import from it, and none of it is tested. Four verified
      properties. (1) `circular_shift_p` enumerates rather than samples when
      M <= n_perm, so it is deterministic with no RNG — and its honest p-floor is
      1/(M+1), not 1/(n_perm+1): for `x=y=arange(20.)` with the default
      `min_shift=3` there are exactly 15 distinct shifts and it returns p=0.0625
      == 1/16, r=1.0. Assert the floor by that identity, and assert two calls with
      different `seed=` give the identical p (the enumerate branch ignores seed).
      (2) `resample_to_grid` bins are HALF-OPEN at the top:
      `resample_to_grid([0,1,2], [10,20,30], [0,1,2])` returns `[10., 20.]` — the
      sample sitting exactly on the last edge is dropped. That is load-bearing and
      undocumented; pin it. Also assert an empty bin comes back NaN, not 0.
      (3) `_rankdata` averages ties — cross-check against
      `scipy.stats.rankdata(..., method="average")` (scipy 1.18.0 is in the venv
      and in requirements.txt). (4) `pearson` returns NaN, never a number, for
      len<3 and for a zero-variance input.
      Shipped as 15 tests; all four properties held exactly as measured (p == 1/16,
      `[10., 20.]`, scipy parity, NaN guards). Added three the item did not name,
      because each pins a claim the four leave open: the SAMPLING branch is
      seed-dependent and its denominator is `n_perm + 1` (forced with `n_perm=5` —
      which is what makes the enumerate branch's seed-invariance a demonstrated
      branch rather than a coincidence); `circular_shift_p` returns `(nan, r, 0)`
      for n<8 and `(nan, nan, 0)` for a flat series; and `pearson` still returns a
      real number for the smallest legitimate input, so the NaN guards are not
      over-eager. Also asserted `spearman` against `scipy.stats.spearmanr`
      directly, not only `_rankdata` against `rankdata`.
- [x] Add `test_incremental_validity.py`. This module answers "why not just use
      ffmpeg?", and its central claim — that the partial correlation collapses when
      the brain arc is only re-deriving the edit — has never been executed by a
      test. Three verified properties. (1) Construct `z` (the baseline) and make
      BOTH the brain arc and the human arc equal `z` plus 1% noise: raw rank r is
      1.000 while `partial_spearman(x, y, z)` drops to 0.14. Assert raw > 0.9 and
      partial < 0.3 — that is the whole "no lift over baseline" verdict. Then flip
      it: give the brain arc a signal orthogonal to `z` that the human also has,
      and assert the partial correlation SURVIVES. (2) `_residualize` returns
      residuals orthogonal to Z — `abs(res @ z)` is 1.1e-13, so assert < 1e-8.
      (3) Regression test for the bug `_align`'s docstring describes: pass a
      baseline whose timebase is a DIFFERENT length from the arc's (39 baseline
      samples vs 42 arc samples over 20 human shots) and assert it returns
      `(19,), (19,), (19, 2)` instead of raising. Also assert the both-endpoints-
      valid contiguity rule: punch a NaN into an interior bin and check the two
      shots either side of it never produce a diff.
      Shipped as 12 tests; all three properties held. Two of the item's numbers were
      realisation-dependent rather than wrong: with the fixture built inline the raw r
      is 0.9988 and the partial is -0.0003, not 1.000/0.14 — so the assertions are the
      thresholds the item specified (raw > 0.9, |partial| < 0.3), not the point values.
      `_residualize`'s orthogonality is 1.9e-14 here, and it is orthogonal to the
      INTERCEPT as well as to each covariate column, so both are asserted. `_align`
      returned exactly `(19,), (19,), (19, 2)`, and the contiguity punch-out drops to 17
      diffs with no bridged 2. Added four the item did not name: partialling against a
      zero-column Z degenerates to plain `spearman` (the path a baseline CSV missing all
      four feature columns takes); `_residualize` with no covariates is mean-centring;
      the "signal SURVIVES partialling" case is a separate named test rather than a
      second half of the collapse test, because a module that always said "no lift" would
      pass the collapse assertion while being useless; and `partial_shift_p`'s shift
      policy, which its docstring claims mirrors `circular_shift_p` exactly — verified
      enumerate-branch floor 1/16 at n=20, seed-invariance there, denominator n_perm+1 in
      the sampling branch, and NaN for n<8 and for min_shift too large to leave a shift.
      One finding did NOT become a test, because pinning it would enshrine a bug: a FLAT
      brain arc does not make `partial_spearman` return NaN. `pearson`'s guard is
      `x.std() == 0`, an exact comparison, but residualising a constant against a
      covariate leaves ~1e-15 of float noise rather than exact zeros — so the guard
      misses and `partial_spearman(ones(20), arange(20.), arange(20.))` returns 0.90, and
      `partial_shift_p` then reports p=0.0625 on it. A degenerate arc can score
      "adds signal". Worth its own item; not fixable inside a test-only change.
- [x] Add `test_train_head.py` for the leakage-safety of the fit machinery.
      `train_head.py` is what `affect_head.py` reuses wholesale, so a leak here is
      a leak in both. Three verified properties. (1) `_standardize` is per-video
      and uses ONLY `good` shots: standardize X, then set a masked-out row to 1e6
      and standardize again — the good rows must be bit-identical (they are). That
      is the leakage claim in the docstring, executed. (2) `pool_features` emits
      exactly 2 columns per mask in `[mean|preds|, mean signed preds]` order —
      assert with a hand-built 2-mask fixture where the two differ in sign — and
      raises `ValueError` when a mask length does not match `preds.shape[1]`.
      (3) `paired_sign_perm` is exact for n<=18: for five equal positive deltas
      only the all-+ and all-- sign vectors reach the observed mean, so it returns
      p = 2/32 = 0.0625 exactly, median 0.2. Assert both, and assert n<3 returns
      NaN rather than a p-value.
      Shipped as 19 tests; all three properties held exactly as measured (good rows
      bit-identical after a masked-out row is set to 1e6, `[mag, sgn]` per mask with
      the ValueError on a length mismatch, p == 2/32 with median 0.2 and NaN for n<3).
      Added six the item did not name. Three close leakage holes the item leaves open:
      `_ztarget` is the same per-video good-shots-only rule on the TARGET side and was
      equally unexecuted (a leak in y is as bad as one in X); and both `_standardize`
      and `_ztarget` have an `sd > 1e-9` fallback that turns a dead feature into a
      column of zeros instead of inf, which nothing asserted. Two pin `ridge_fit`'s
      "intercept unpenalized" docstring claim, which is what makes an over-regularized
      head predict mean(y) rather than 0: alpha~0 recovers OLS to 1e-6, alpha=1e9
      drives every weight to 0 while the intercept stays at `y.mean()`. One pins
      `_diff_pair`'s contiguity rule and its floor — a punched interior shot drops 11
      diffs to 9 (not 10) with no bridged step, and `score_r` returns NaN at 7 usable
      diffs but a real number at 8. Also asserted `feature_names` against what
      `pool_features` actually emits, so changing the pooling breaks the names test
      rather than shipping stale labels, and that the magnitude column of an
      all-negative ROI is positive while its signed column is negative — the swap that
      would silently invert every direction feature.
- [x] Add `test_build_roi_mask.py` — offline, via a monkeypatched atlas. The
      mask-shaping logic is pure and currently unexecuted; only the fetch is
      heavy. Monkeypatch `nilearn.datasets.fetch_atlas_surf_destrieux` (the
      function does `from nilearn import datasets` at CALL time, so patching the
      module attribute works — verified) with a tiny fake atlas and assert:
      vertex order is `[left; right]` concatenated in that order; region matching
      is case-insensitive substring, so `"g_precuneus"` in the atlas matches the
      `"G_precuneus"` entry in `DMN_REGIONS`; a wrong total length raises
      `SystemExit` naming 20484; and a region set that matches nothing raises
      `SystemExit` rather than returning an all-False mask. `build_mask_schaefer1000`
      takes `n_rois`, so it can be tested with an 8-label fake and no size fiction.
      Also cover the two pure helpers: `build_mask(n_units=999)` raises `SystemExit`
      naming both valid spaces, and `detect_n_units` reads 20484 off a
      `(3, 20484)` `.npy` header by mmap without loading it.
      Shipped as 17 tests; every property the item named held. The monkeypatch lands
      exactly as predicted — both builders do `from nilearn import datasets` at CALL
      time, so `monkeypatch.setattr(datasets, "fetch_atlas_*", fake)` intercepts the
      download and nothing here touches the network (0.9s for the file). Added six the
      item did not name. Three close real holes: the mask selects by LABEL INDEX
      (`map_arr == i` over `enumerate(labels)`), so a fixture with decoy labels either
      side of the match catches an off-by-one that would pool the wrong anatomy rather
      than nothing; the substring test is `region.lower() in atlas_label.lower()`, in
      THAT direction, so a longer atlas label matches and a shorter one does not —
      reversing it would make short atlas names match many ROIs at once; and the
      Schaefer `n_rois` count guard is what stops a leading `Background` label (nilearn
      has varied on this) from shifting every parcel by one and silently misaligning the
      whole 1000-dim vector. Two more: `NETWORKS` and `YEO7_FOR_NETWORK` must carry the
      same keys, since `main()` builds `--network`'s choices from `NETWORKS` alone and a
      network in one dict but not the other dies on a raw `KeyError` at `--n-units 1000`
      instead of any of this file's guided `SystemExit`s; and the length guard fires
      BEFORE the empty guard, so a wrong-sized atlas reports its size rather than
      "matched 0 vertices". Also asserted the `[lh; rh]` order positionally, not just by
      count, with the two hemispheres given different vertex counts — a `[rh; lh]` swap
      keeps both shape and sum identical and would silently mirror every ROI.
      Verified the suite bites: seven hand-applied mutations to `build_roi_mask.py`
      (hemisphere swap, case-sensitive match, reversed substring direction, deleted empty
      guard, deleted parcel-count guard, plain `np.load`, label-index off-by-one) each
      turn the file red; the source was restored clean afterwards.
- [x] Add `test_head_badge.py` for `head_io.badge_text` + the display mappings —
      the half of `head_io.py` that `test_head_io.py` does NOT cover (it stops at
      save/load/pack). `badge_text` is the gate `head_apply` refuses on, and it is
      a fail-closed ladder worth pinning at every rung: a stamp with NO
      `leak_check` key returns `"poisoned"` (absence must not be waved through);
      `leak_check="FAIL"` returns `"poisoned"`; `n_videos=5` returns `"smoke"`;
      `median_r<=0` or `stouffer_p>=0.05` returns `"unvalidated"`; a non-numeric
      `median_r` returns `"unvalidated"`, never `"learned-hypothesis"`. Then
      `to_unit` clips into [0,1] and maps non-finite entries to 0.0 (not NaN — the
      demo JSON cannot carry NaN), and `to_signed` is bounded in (-1,1), maps the
      median to ~0, and survives an all-identical input without dividing by a zero
      MAD.
      Shipped as 36 tests; every rung the item named held exactly — no `leak_check`
      key and `leak_check="FAIL"` both give `poisoned`, `n_videos=5` gives `smoke`,
      `median_r<=0` and `stouffer_p>=0.05` give `unvalidated`, a non-numeric
      `median_r` never reaches `learned-hypothesis`, `to_unit` clips into [0,1] and
      sends every non-finite entry to 0.0, and `to_signed` puts the median at exactly
      0.0 and survives a zero MAD. One correction: `to_signed` is NOT open-bounded in
      (-1,1). When MAD is 0 the scale falls back to 1.0 and float `tanh` saturates, so
      `[5,5,5,5,5,100]` returns exactly 1.0 — the assertion is the closed bound
      `|out| <= 1`, also checked at 1e300. Added beyond the item: `leak_check` must be
      the exact lowercase `"pass"`, so `"PASS"`, `"passed"` and `True` are all poisoned
      (fail-closed on a near miss); the poison gate outranks a perfect stamp AND the
      poisoned badge does not print the inflated r; all three verdicts
      `train_head.leak_check()` can return are covered; the smoke boundary is exactly 8;
      a missing `n_videos` is smoke but a numeric string still counts; the badge never
      renders the word `None` (unreadable numbers print `?`, a missing dataset prints
      "the training proxy"); the four statuses are exactly `head_apply`'s `STATUS_RANK`
      keys, which matters because `.get(s, 0)` there sends an unknown status to the
      WORST rank — a rename silently demotes a lane instead of erroring; and a null head
      SAVED and RELOADED is `unvalidated`, which is the composition that actually runs in
      production (`clean_stamp` rewrites NaN to None, and None is what `badge_text` then
      reads) and which nothing had executed. For `to_unit` the percentile window is the
      point: a 1e6 spike clips to 1.0 while the bulk keeps the whole lane and the median
      stays at 0.5, where min-max would crush it to ~1e-4. Flat input is pinned as an
      invariant (flat, finite, in range) rather than at its exact floor value, since
      flat-at-0 vs flat-at-0.5 is a design choice and not a contract. Verified the suite
      bites: 13 hand-applied mutations to `head_io.py` (poison gate firing only on FAIL,
      `leak_check` defaulting to "pass", smoke threshold 5, `>=`/`or` in the is_real
      test, unreadable stamp treated as real, n-parse failure defaulting to 99, both
      non-finite guards dropped, min-max instead of p2..p98, clip dropped, zero-MAD
      fallback dropped, tanh dropped, mean instead of median) each turn the file red; the
      source was restored clean afterwards.
- [x] Add `test_affect_head.py` for `_proxy_arc`, the nested baseline the whole
      affect claim is measured against. Small and exact: with a hand-built preds
      array and one mask, `valence` must be the SIGNED mean over the mask (so an
      all-negative ROI gives a negative arc — assert it actually goes below zero)
      while `arousal` must be the `|.|` mean (assert the same all-negative input
      gives a positive arc). Getting these two swapped would silently invert every
      valence lane, and nothing today would catch it. Also assert `_proxy_arc`
      returns `None` — not a fabricated zero arc — for a dim with no matching mask,
      since `head_apply._baseline_series` branches on exactly that None.
      Shipped as 18 tests; every property the item named held exactly — valence is the
      SIGNED mean (an all-negative ROI gives [-2, -3, -0.5], strictly below zero), arousal
      is the `|.|` mean of that same input ([2, 3, 0.5], strictly above), and a dim with no
      matching mask returns None rather than a fabricated zero arc. Added beyond the item,
      in rough order of how much they close: the proxy for a dim is BIT-IDENTICAL to one of
      `pool_features`' own columns (valence -> `valence|sgn`, arousal -> `arousal|mag`),
      which is what makes it a NESTED baseline and is the coupling that breaks first if
      either convention drifts; an exactly-cancelling ROI separates the two branches (signed
      mean 0, `|.|` mean 3/5), so no single fixture can satisfy both by accident; valence is
      antisymmetric in preds and arousal symmetric, which pins the conventions for every
      input rather than for one hand-computed row; and `head_apply._baseline_series` is
      executed on BOTH sides of that None — the proxy recomputed at t = arange(n_sec)
      through a real `save_head`/`load_head` round-trip, and `SystemExit` when the head's
      dim has no mask. Also covered `load_affect_masks`, since it is what actually builds
      the (name, mask) list `_proxy_arc` looks up: valence always precedes arousal even when
      the arousal filename sorts first (that order is the feature-column order `save_head`
      serializes, so a flip swaps every valence weight with an arousal one), masks are cast
      to bool, non-affect `roi_*.npy` files are ignored, and sorted-glob-first-hit wins. The
      bool cast is the sharpest of those: numpy fancy-indexes an INT array BY POSITION, so
      an uncast 0/1 mask selects columns [0, 1, 1] — a different, differently-sized ROI that
      still returns a perfectly plausible arc. One behaviour is pinned as DOCUMENTED rather
      than as desirable: the branch is `if dim == "valence"`, so every other dim silently
      takes the `|.|` branch, including a third lane added later. And an all-False mask
      gives all-NaN (with numpy's mean-of-empty-slice RuntimeWarning), not zeros — asserted,
      because zeros would be indistinguishable from a genuinely silent ROI. Verified the
      suite bites: nine hand-applied mutations to `affect_head.py` (conventions swapped,
      valence always `|.|`, arousal always signed, None -> zeros, mask lookup by position
      instead of by name, bool cast dropped, dim order flipped, last-hit-wins, key filter
      dropped) each turn the file red; the source was restored clean afterwards.
- [ ] Add `test_head_apply.py` for the `arc_<id>.json` contract in `apply_one`.
      Bigger than the others (it needs a head fixture, which `head_io.save_head`
      can build in-test) but it is the only writer of the file the demo renders.
      Four behaviours, all already implemented and all unverified: an existing
      arithmetic `activation` array is DEMOTED into `arc["baseline"]` with its
      label, never deleted; an affect-only apply onto an arc whose existing
      activation length disagrees with `preds.shape[0]` raises `SystemExit` rather
      than misaligning the lanes; the block-level `arc["affect"]["status"]` is the
      WORST status among applied dims, so one `smoke` valence head plus one
      `learned-hypothesis` arousal head yields `smoke`; and the emitted JSON parses
      with `json.loads(..., parse_constant=<raise>)`, proving `allow_nan=False`
      held and no bare `NaN` token reached the browser.

## Done

<!-- completed items get moved down here with their commit sha -->
