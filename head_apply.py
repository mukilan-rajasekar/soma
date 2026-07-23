#!/usr/bin/env python3
"""
head_apply.py — SCORE a new video with a saved head (the inference path).

train_head.py / affect_head.py VALIDATE (leave-one-VIDEO-out); this APPLIES a saved head
(head_io) to preds_<id>.npy and writes the head-predicted arc into arc_<id>.json as the
HEADLINE lane, demoting the untrained arithmetic arc to a labeled baseline (never deletes
it). Each lane carries the head's honest badge, and a POISONED head is refused outright.

HONESTY: a head arc on a NEW ad is OUT-OF-DISTRIBUTION from the training proxy, i.e. a
HYPOTHESIS, not a validated result. The lane badge (from head_io.badge_text) says exactly
that, and this tool prints the same before it writes anything.

USAGE:
  # attention head onto every clip's preds in a dir:
  python head_apply.py --preds-dir data/arcs --arc-dir data/arcs \
      --head validation/head_attn.json

  # attention + both affect heads (comma-separated):
  python head_apply.py --preds-dir data/arcs --arc-dir data/arcs \
      --head validation/head_attn.json,validation/head_valence.json,validation/head_arousal.json
"""
import argparse
import glob
import json
import os

import numpy as np

import head_io
from honest_corr_timeseries import _read_csv

# lane -> (display mapping, arc.affect key). attention promotes to the top-level headline;
# valence is signed [-1,1]; arousal is magnitude [0,1].
LANE_DISPLAY = {"attention": "unit", "valence": "signed", "arousal": "unit"}


def _baseline_series(head, vid, preds, arc_dir):
    """Return (t, v) for the head's nested baseline, computed the SAME way training was.

    - 'proxy'  : recompute the affect proxy straight from preds (affect_extract convention).
    - roi_mag / global_mag : read from arc_<id>.csv (what train_head.video_data used).
    Never fabricated: if the required arc csv column is missing, we stop rather than
    silently swap in a different baseline than the head was fit against.
    """
    col = head["baseline_col"]
    if col == "proxy":
        import affect_head
        v = affect_head._proxy_arc(preds, head["_masks"], head["kind"])
        if v is None:
            raise SystemExit(f"[{vid}] head '{head['kind']}' has no matching affect mask "
                             "to recompute its proxy baseline.")
        return np.arange(preds.shape[0], dtype=float), v
    arcp = os.path.join(arc_dir, f"arc_{vid}.csv")
    if not os.path.exists(arcp):
        raise SystemExit(f"[{vid}] need arc_{vid}.csv for the '{col}' baseline (written by "
                         "batch_extract / colab Cell 4) — refusing to fake it.")
    _, ac = _read_csv(arcp)
    if col not in ac:
        avail = sorted(k for k in ac if k != "t_sec")
        raise SystemExit(f"[{vid}] head was fit on the {col!r} baseline, but arc_{vid}.csv "
                         f"has no {col!r} column (only {avail}). roi_mag and global_mag are "
                         "DIFFERENT physical quantities (DMN ROI vs whole-cortex) — feeding a "
                         f"{col!r}-fitted weight the wrong one would silently corrupt the "
                         "score. Re-extract this clip with the SAME baseline "
                         "(batch_extract --roi-mask ...). Refusing.")
    return np.asarray(ac["t_sec"], float), np.asarray(ac[col], float)


def apply_one(vid, preds, heads, arc_dir, out_dir):
    """Apply every head to one clip; update (or create) its arc_<id>.json."""
    jpath = os.path.join(arc_dir, f"arc_{vid}.json")
    arc = json.load(open(jpath)) if os.path.exists(jpath) else {}

    # demote (never delete) the existing arithmetic arc to a labeled baseline trace
    if isinstance(arc.get("activation"), list) and "baseline" not in arc:
        arc["baseline"] = {
            "label": "untrained arithmetic arc (|activation| over ROI; NULL on real TVSum)",
            "activation": arc["activation"],
        }

    n_sec = preds.shape[0]                          # every head lane is per-second, length n_sec
    attention_applied = any(h["kind"] == "attention" for h in heads)
    # an affect-only apply keeps the existing arithmetic headline; refuse if its length
    # disagrees with the freshly scored preds, or the lanes would silently misalign.
    existing = arc.get("activation")
    if (not attention_applied and isinstance(existing, list) and existing
            and len(existing) != n_sec):
        raise SystemExit(f"[{vid}] existing arc activation is {len(existing)}s but preds are "
                         f"{n_sec}s — affect lanes would misalign. Re-extract arc_{vid}.json "
                         "from the SAME preds, or include an attention head to replace it.")

    lanes = arc.get("lanes", {})
    applied, affect_status = [], []
    STATUS_RANK = {"poisoned": 0, "smoke": 1, "unvalidated": 2, "learned-hypothesis": 3}
    for head in heads:
        kind = head["kind"]
        bt, bv = _baseline_series(head, vid, preds, arc_dir)
        res = head_io.apply_head(head, preds, bt, bv)
        disp = LANE_DISPLAY.get(kind, "unit")
        series = (head_io.to_signed(res["per_sec"]) if disp == "signed"
                  else head_io.to_unit(res["per_sec"]))
        values = [round(float(x), 4) for x in series]
        status, badge = head_io.badge_text(head)
        lanes[kind] = dict(source="head", status=status, badge=badge,
                           values=values, stamp=head_io.clean_stamp(head.get("stamp", {})))
        if kind == "attention":                     # promote to the headline the demo reads
            arc["activation"] = values
            arc["attention_status"] = status
            arc["attention_badge"] = badge
        else:                                       # affect lanes render from arc.affect
            af = arc.setdefault("affect", {})
            af[kind] = values
            af[f"{kind}_badge"] = badge
            af[f"{kind}_status"] = status
            affect_status.append(status)
        applied.append(kind)

    # block-level affect status = the WORST (least-validated) applied dim — never a hardcoded
    # 'learned-hypothesis'. A smoke/unvalidated valence head must not read as validated.
    if affect_status:
        arc.setdefault("affect", {})["status"] = min(
            affect_status, key=lambda s: STATUS_RANK.get(s, 0))

    arc["lanes"] = lanes
    n = len(arc.get("activation", [])) or n_sec     # headline length (head arc, or kept arithmetic)
    if not isinstance(arc.get("timestamps"), list) or len(arc["timestamps"]) != n:
        arc["timestamps"] = [round(float(i), 2) for i in range(n)]
    arc.setdefault("fps_arc", 1.0)
    arc["duration_sec"] = round(n / (arc.get("fps_arc") or 1.0), 2)
    arc["video_id"] = vid

    os.makedirs(out_dir, exist_ok=True)
    outp = os.path.join(out_dir, f"arc_{vid}.json")
    with open(outp, "w") as f:
        json.dump(arc, f, indent=2, allow_nan=False)  # never emit a literal NaN token
    return outp, applied


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-dir", required=True, help="dir with preds_<id>.npy")
    ap.add_argument("--arc-dir", required=True,
                    help="dir with arc_<id>.csv (baseline) + arc_<id>.json (updated in place)")
    ap.add_argument("--out-dir", default=None, help="where to write arc_<id>.json (default: --arc-dir)")
    ap.add_argument("--head", required=True, help="comma-separated saved head JSON path(s)")
    ap.add_argument("--glob", default="preds_*.npy")
    args = ap.parse_args()

    out_dir = args.out_dir or args.arc_dir
    heads = [head_io.load_head(p.strip()) for p in args.head.split(",") if p.strip()]

    usable = []
    for h in heads:
        status, badge = head_io.badge_text(h)
        print(f"[head] {h['kind']:<9} status={status:<18} {badge}")
        if status == "poisoned":
            print(f"  !! refusing to apply the poisoned {h['kind']} head — fix leakage first.")
        else:
            usable.append(h)
    if not usable:
        raise SystemExit("No usable heads (all poisoned, or none given).")

    preds_files = sorted(glob.glob(os.path.join(args.preds_dir, args.glob)))
    if not preds_files:
        raise SystemExit(f"No preds match {os.path.join(args.preds_dir, args.glob)!r} — run "
                         "the GPU extract step first (batch_extract / colab).")

    # fail fast on an output-space mismatch (fsaverage5 20484 vs Schaefer-1000 parcels)
    # instead of a raw ValueError mid-batch on the first clip.
    nv = int(np.load(preds_files[0]).shape[1])
    for h in usable:
        ml = int(h["_masks"][0][1].shape[0])
        if ml != nv:
            raise SystemExit(f"head '{h['kind']}' masks are length {ml} but preds have {nv} "
                             "vertices — output-space mismatch. Run check_preds_space.py and "
                             "rebuild masks with build_roi_mask.py --n-units.")

    for pf in preds_files:
        vid = os.path.basename(pf)[len("preds_"):-len(".npy")]
        preds = np.load(pf).astype(float)
        try:
            outp, applied = apply_one(vid, preds, usable, args.arc_dir, out_dir)
            print(f"[apply] {vid}: lanes={applied} -> {outp}")
        except SystemExit:
            raise                                   # config-level refusal (baseline mismatch) stops the run
        except Exception as e:                      # one degenerate clip must not kill the batch
            print(f"[apply] {vid}: SKIPPED — {e!r}")

    print("\nReminder: a head arc on a NEW ad is OUT-OF-DISTRIBUTION from its training "
          "proxy → a HYPOTHESIS, not a validated result. Each lane's badge says so.")


if __name__ == "__main__":
    main()
