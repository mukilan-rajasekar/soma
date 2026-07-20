# COGNIMUSE clip alignment fix — end-credit offset (2026-07-20)

**A silent, validation-invalidating bug in every COGNIMUSE clip. Found, proven, and fixed.**
All 7 COGNIMUSE affect clips were re-cut. No results were contaminated (see "Blast radius").

## The bug

`cognimuse_films.py` cut each clip as the **last D seconds of the film file** (`ffmpeg -sseof -D`,
where D = the annotation duration from `human_affect_<code>.csv`). The assumption baked into the
code was "COGNIMUSE annotates the last ~30 min, so the file's tail == the annotation window."

That assumption is half right in the worst way:
- COGNIMUSE **does** annotate the last ~30 min of each film's **story**, ending at the final shot
  (Zlatintsi et al. 2017: *"half-hour continuous segments … with the final shot/scene included"*).
- But a commercial film **file** does not end at the final story shot — it rolls **3–9 minutes of
  end credits** after it. `-sseof` anchors on the file's final frame (end of credits), so each
  clip's window was shifted **later** than the annotation window by that film's credit length.

Because the clip and the annotation are the same *length* (both D seconds), everything *looked*
fine, while `affect_head` compared the brain's prediction of the credit roll against the human
rating of the story ~5–9 min earlier — every second misaligned. This is exactly the
"present activation as a result without checking alignment" failure the project warns about.

## The proof (The Departed, frame-verified)

- Clip `t=1406s` → the film's final story shot (gold-domed MA State House, the rat scene).
- Clip `t=1765s` → an end-credits card ("Filmed with ARRI Cameras … American Humane Association").
- Human annotation runs to `t=1800.5s` with a **live** arousal value (−0.113 vs the −0.317 mean) —
  impossible if it were rating the black credit screen at the clip's actual end.
- Source film: State House at 8680s, "Directed by Martin Scorsese" card at 8690s, EOF 9078.7s →
  **~392s of credits** were baked into the old clip's tail. Measured offset ≈ 393.7s.

The `-sseof` mechanism is identical for all 7 films, so the failure generalized to every clip.

## The fix

1. **Code** (`cognimuse_films.py`): added `--story-end CODE=SECONDS`. When set, the window becomes
   `[story_end - D, story_end]` (input-seek + `-t`) instead of anchoring on file-EOF, dropping the
   credit tail. Also hardened: reject short/truncated output (ffmpeg can exit 0 with a clip shorter
   than D when a source is short); delete partials on error; only downmix-retry on a real channel-
   layout failure; surface ffmpeg's real stderr.
2. **Boundaries**: per-film story-end timestamps detected by luminance + contact-sheet review and
   **eyeball-verified** (each corrected clip's last frame confirmed to be a story shot, not a
   credit). Stored in `data/cognimuse/story_end.csv`.
3. **Re-cut** all 7 and swapped them into `data/clips_cognimuse/` (CHI/FNE/GLA) and
   `data/clips_cognimuse_batch2/` (BMI/CRA/DEP/LOR). The misaligned originals are archived in
   `data/_ARCHIVE_misaligned_credits_bug/`.

### Reproduce
```bash
# batch-1 (films in ~/cog_films_batch1 as CHI.avi / FNE.mkv / GLA.mp4)
.venv/bin/python cognimuse_films.py --films-dir ~/cog_films_batch1 \
  --affect-dir data/cognimuse --out data/clips_cognimuse \
  --story-end "CHI=6345,FNE=5538,GLA=9845"
# batch-2 (films in ~/cog_films_batch2)
.venv/bin/python cognimuse_films.py --films-dir ~/cog_films_batch2 \
  --affect-dir data/cognimuse --out data/clips_cognimuse_batch2 \
  --story-end "BMI=7718,CRA=6628,DEP=8687,LOR=11535"
```
(Existing full-duration clips are skip-exist'd; delete or re-`--out` to force a redo.)

## Per-film verification (last frame of each corrected clip)

| code | story_end | last frame (verified by eye) | boundary |
|------|-----------|------------------------------|----------|
| DEP  | 8687s  | State House dome (final shot)         | clean |
| BMI  | 7718s  | epilogue card "…live in Princeton…"   | clean |
| LOR  | 11535s | Bag End door → "THE END"              | clean |
| FNE  | 5538s  | "the end" card over water            | clean |
| GLA  | 9845s  | Rome/Colosseum sunset vista          | clean anchor, **Extended-cut caveat** |
| CRA  | 6628s  | overhead closing crash/aerial         | soft (credits over closing shot) |
| CHI  | 6345s  | purple-lit finale number             | soft (credits over finale vignettes) |

**Caveats to keep honest:**
- **GLA is the Extended cut**; COGNIMUSE used the theatrical. The final act (the last ~30 min) is
  near-identical between cuts, so the anchor is clean, but any extended scene inside the window
  would desync it. If GLA is an outlier in the affect result, re-cut from a theatrical source.
- **CHI and CRA** roll credits *over* the closing footage, so their story→credit boundary is soft
  (±~20s). Treat with mild caution; the ~2–3s FeelTrace lag already tolerates small offsets.

## Blast radius (why nothing was contaminated)

At the time of the fix, `MyDrive/soma/arcs/` held `preds_*` for the **15 TVSum clips only** — no
`preds_CHI/FNE/GLA`, no `preds_veatic*`. So Colab had **never run the affect (COGNIMUSE) track**;
the misaligned clips produced zero results. TVSum (attention track) is unaffected — those are short
web videos trimmed from t=0, no credits. The fix therefore required only replacing the clips before
the next Colab run. **Action: in `MyDrive/soma/clips/`, delete the old CHI/FNE/GLA.mp4 and upload
all 7 corrected clips before running Colab.**
