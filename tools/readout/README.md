# tools/readout

Diagnostic-layer helpers for network lanes and weak windows (BUILD-PLAN Stage 2).

| Module | Status |
|---|---|
| `lane_stats.py` | Live — folds committed figures into `validation/lane_stats.json`; gated in `verify.sh` |
| `windows.py` | **Library + unit tests.** Same weak-spot rule as `demo/process_batch.detect_weak_spots`, plus shot snap and `vis_partial`. The customer scorer still calls its **inlined** copy so report semantics cannot drift until Stage 2.7 wires `--emit-readout`. Prefer importing `find_windows` for new code; do not add a fourth copy of the MAD rule. |

Phrase rendering for windows lives in TypeScript: `src/lib/readout-phrase.ts`
(dashboard weak-spot copy). Shot **content** claims (faces, product cards) are out of scope.
