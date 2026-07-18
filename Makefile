# Soma — repo tasks. All targets use the project venv Python.
# GPU inference (batch_extract on a rented A100) is intentionally NOT a target
# here: it needs a GPU box + gated weights. See PIPELINE.md for that runbook.
# Everything below is CPU / browser only.

# ROOT/PY were hardcoded to a laptop path (was /Users/mukilan/.../Brain Project) —
# not portable. Derive ROOT from THIS Makefile's own location instead. The repo path
# contains a literal SPACE and every recipe below uses UNQUOTED $(ROOT)/... and $(PY),
# so we re-insert backslash-escaping on the space after deriving the plain path.
# PY ?= makes it overridable (e.g. PY=python3 make test) without editing this file.
empty :=
space := $(empty) $(empty)
MKFILE_DIR := $(shell cd "$(dir $(lastword $(MAKEFILE_LIST)))" >/dev/null 2>&1 && pwd)
ROOT := $(subst $(space),\$(space),$(MKFILE_DIR))
PY ?= $(ROOT)/.venv/bin/python

.DEFAULT_GOAL := help
.PHONY: help synth dryrun test demo baseline publish pipeline pipeline-demo report ingest trim head head-demo

help:  ## show this help
	@echo "Soma make targets:"
	@echo "  make synth      generate synthetic test fixtures (tests/synth/)"
	@echo "  make dryrun     run the full pipeline on synthetic data (asserts signal+null)"
	@echo "  make test       synth + dryrun (the CPU smoke test)"
	@echo "  make baseline   dumb-baseline features on the synthetic clip"
	@echo "  make trim       laptop prep: download+trim TVSum to small clips for the light Colab path (N=3 SEC=120)"
	@echo "  make pipeline-demo  run the whole analysis chain on synthetic fixtures"
	@echo "  make pipeline   run the CPU analysis chain on ./data (DEMO=1 to publish)"
	@echo "  make head       train the read-out head on ./data (needs real preds + roi_*.npy masks)"
	@echo "  make head-demo  smoke-test train_head.py on the synthetic fixtures (no GPU)"
	@echo "  make report     rebuild validation/report.html from validation CSVs"
	@echo "  make publish    publish a REAL run into demo/results.json (never synthetic)"
	@echo "  make demo       serve the static demo player at http://localhost:8000"

synth:  ## generate synthetic fixtures under tests/synth/
	$(PY) $(ROOT)/tests/make_synthetic_data.py

dryrun:  ## run the whole analysis pipeline on the synthetic fixtures
	$(PY) $(ROOT)/tests/dry_run.py

test: synth dryrun  ## generate fixtures then run the end-to-end dry run

baseline:  ## extract dumb baseline (loudness/cuts/luminance/motion) from the synth clip
	$(PY) $(ROOT)/baseline_extract.py \
		--video-dir $(ROOT)/tests/synth \
		--out $(ROOT)/tests/synth/baseline \
		--glob 'synth_clip.mp4'

demo:  ## serve the self-contained static demo (Ctrl-C to stop)
	@echo "Serving demo at http://localhost:8000/  (open ?arc=arcs/arc_<id>.json)"
	cd $(ROOT)/demo && $(PY) -m http.server 8000

publish:  ## publish a REAL validation run into demo/results.json (never synthetic)
	@echo "Publishing validation/results.csv -> demo/results.json (roi feature)."
	@echo "ONLY run this after a real honest_corr_timeseries.py run — a null is fine, a fake win is not."
	$(PY) $(ROOT)/publish_results.py --results $(ROOT)/validation/results.csv \
		--feature roi --out $(ROOT)/demo/results.json

trim:  ## laptop prep for the light Colab path: download+trim TVSum to small clips (make trim N=3 SEC=120 HEIGHT=360)
	$(PY) $(ROOT)/tvsum_trim.py --n $(or $(N),3) --sec $(or $(SEC),120) --height $(or $(HEIGHT),360)
	@echo ""
	@echo ">>> Upload  data/clips_trimmed/  to Google Drive at  MyDrive/soma/clips"
	@echo ">>> Then in Colab: Cell 1 -> restart -> Cell 2B -> Cell 3 -> Cell 4 -> Cell 5"

ingest:  ## stage a Colab results zip + run everything: make ingest ZIP=~/Downloads/soma_arcs.zip
	@test -n "$(ZIP)" || (echo "Usage: make ingest ZIP=~/Downloads/soma_arcs.zip  (add DEMO=1 to publish a real signal)" && exit 1)
	@cd $(ROOT) && mkdir -p data/arcs data/tvsum
	cd $(ROOT) && unzip -o "$(ZIP)" -d data/arcs
	@cd $(ROOT) && if [ -f data/arcs/ydata-tvsum50.mat ]; then mv data/arcs/ydata-tvsum50.mat data/; fi
	@cd $(ROOT) && test -f data/ydata-tvsum50.mat || (echo "!! ydata-tvsum50.mat not found in the zip or data/ — did Cell 2 copy it into OUT_DIR?" && exit 1)
	cd $(ROOT) && $(PY) tvsum_prep.py --mat data/ydata-tvsum50.mat --out data/tvsum
	cd $(ROOT) && $(PY) run_pipeline.py --arc-dir data/arcs --human-dir data/tvsum \
		--arc-json-dir data/arcs --out-dir validation $(if $(DEMO),--demo,--no-demo)
	@echo ""
	@echo ">>> Open validation/report.html for the verdict. If it's a real signal (not null),"
	@echo ">>> re-run with DEMO=1 to light up the demo:  make ingest ZIP=$(ZIP) DEMO=1"

head:  ## train the read-out head on ./data (needs preds_*.npy + arc_*.csv + human_* + roi_*.npy masks)
	$(PY) $(ROOT)/train_head.py --preds-dir $(ROOT)/data/arcs --arc-dir $(ROOT)/data/arcs \
		--human-dir $(ROOT)/data/tvsum --masks-dir $(ROOT)/data --out $(ROOT)/validation/head

head-demo:  ## smoke-test train_head.py on synthetic fixtures (recovers signal; shuffle control collapses)
	$(PY) $(ROOT)/tests/make_synthetic_data.py >/dev/null
	$(PY) $(ROOT)/train_head.py --preds-dir $(ROOT)/tests/synth --arc-dir $(ROOT)/tests/synth/arcs \
		--human-dir $(ROOT)/tests/synth/human --masks-dir $(ROOT)/tests/synth --out $(ROOT)/tests/synth/head

pipeline:  ## run the full CPU analysis chain on ./data (corr->incr->affect->report). Add DEMO=1 to publish.
	$(PY) $(ROOT)/run_pipeline.py --arc-dir $(ROOT)/data/arcs --human-dir $(ROOT)/data/tvsum \
		--baseline-dir $(ROOT)/data/baseline --arc-json-dir $(ROOT)/data/arcs \
		--liris-dir $(ROOT)/data/liris --out-dir $(ROOT)/validation $(if $(DEMO),--demo,--no-demo)

pipeline-demo:  ## smoke-test the whole pipeline on the synthetic fixtures (no GPU, no demo write)
	$(PY) $(ROOT)/tests/make_synthetic_data.py >/dev/null
	$(PY) $(ROOT)/run_pipeline.py --arc-dir $(ROOT)/tests/synth/arcs --human-dir $(ROOT)/tests/synth/human \
		--baseline-dir $(ROOT)/tests/synth/baseline --arc-json-dir $(ROOT)/tests/synth/arcs \
		--liris-dir $(ROOT)/tests/synth --out-dir $(ROOT)/tests/synth/validation --no-demo --n-perm 1500

report:  ## rebuild validation/report.html from existing validation CSVs
	$(PY) $(ROOT)/make_report.py --results $(ROOT)/validation/results.csv \
		--affect $(ROOT)/validation/affect_results.csv \
		--incremental $(ROOT)/validation/incremental.csv --out $(ROOT)/validation/report.html
