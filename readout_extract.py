#!/usr/bin/env python3
"""
readout_extract.py — the three ad-producer read-out lanes:
COMPREHENSION, RECALL, and PURCHASE-INTENT, each as a per-second proxy arc derived
from cached frozen-TRIBE predictions, written into the demo's arc_<id>.json.

This is the sibling of affect_extract.py (valence/arousal) and message_extract.py
(the language "message" lane). It bundles the three product-facing dimensions an ad
producer actually asks about, computes each as an a-priori ROI arithmetic arc, and
badges every one as a PROXY-HYPOTHESIS — never a validated result.

WHAT EACH LANE IS (and its honest ceiling):
  comprehension  mean |activation| in the a-priori LANGUAGE ROI (Broca/IFG, STS, pMTG,
                 angular). = "predicted semantic-integration load" — how hard the
                 language system is predicted to work. NEVER "the viewer understood it."
                 Needs trimodal preds (the TEXT branch drives this ROI); on video/audio
                 -only preds it is a shape/plumbing demo, under-driven.
  recall         mean |activation| in the a-priori CORTICAL MEMORY-ENCODING ROI
                 (parahippocampal/MTL cortex, fusiform/lingual ventral stream, posterior-
                 medial PCC/precuneus/angular). = "predicted cortical encoding
                 engagement" — a PROXY for ad recall. HARD CEILING: the hippocampus (the
                 subsequent-memory-effect structure) is SUBCORTICAL and NOT in TRIBE's
                 cortical output, so the subcortical encoding core is missing.
  purchase_intent mean SIGNED activation in the a-priori CORTICAL VALUE ROI (vmPFC/medial
                 OFC). = "predicted cortical value signal" — a PROXY for purchase intent.
                 HARD CEILING: the nucleus accumbens (Knutson's neuroforecasting "buy
                 signal") is SUBCORTICAL and NOT in TRIBE's output. Also overlaps the
                 valence ROI (shared vmPFC) — at the surface, value and positive valence
                 are not cleanly separable, and we say so.

None of these is a trained/validated decoder. They are the exact analogue of the null
arithmetic attention arc: transparent arithmetic over fixed a-priori masks, shown so the
demo can DISPLAY the dimension honestly today, and upgraded to a trained head later (see
train_head.py / the overnight Colab) once a public per-second proxy target exists
(memorability for recall; there is no clean public per-second purchase-intent target, so
that lane is expected to stay a proxy the longest).

OUTPUT: merges a `readout` block into arc_<id>.json:
  arc["readout"] = {
    status, method,
    comprehension:   [..0..1 per sec..],  comprehension_badge, comprehension_status,
    recall:          [..0..1 per sec..],  recall_badge,        recall_status,
    purchase_intent: [..-1..1 per sec..], purchase_intent_badge, purchase_intent_status,
  }
and adds/refreshes roi_profile rows for comprehension/recall/purchase_intent so the
"cortical network profile" figure shows them (all strong=False — proxy, not validated).

USAGE (CPU, after batch_extract cached the preds):
  python build_roi_mask.py --network language --out data/roi_mask_language.npy
  python build_roi_mask.py --network memory   --out data/roi_mask_memory.npy
  python build_roi_mask.py --network value    --out data/roi_mask_value.npy
  python readout_extract.py --preds-glob "data/ads/arcs/preds_*.npy" \
      --arc-dir data/ads/arcs \
      --language-mask data/roi_mask_language.npy \
      --memory-mask   data/roi_mask_memory.npy \
      --value-mask    data/roi_mask_value.npy
"""
import argparse
import glob
import json
import os

import numpy as np

FSAVERAGE5_N = 20484
SCHAEFER1000_N = 1000

# display-only shaping (mirrors affect_extract's constants; touches no analysis path)
DISPLAY_Z_DIVISOR = 2.5      # squash z toward the plottable range
UNIT_CLIP = (0.03, 0.98)     # keep 0..1 lanes off the rails
SIGNED_CLIP = (-0.9, 0.9)    # keep the signed lane inside ~[-1,1]

STATUS = "proxy-hypothesis"

# per-lane honest method + badge. Each names the ROI, that it is a proxy, and the
# hard subcortical ceiling where one exists.
LANES = {
    "comprehension": dict(
        network="language", mode="unit",
        method="mean |activation| in the a-priori LANGUAGE ROI (IFG/Broca, STS, pMTG, "
               "angular). Predicted semantic-integration load, not measured understanding.",
        badge="predicted comprehension load · a-priori language ROI · PROXY-HYPOTHESIS, "
              "not measured understanding (needs trimodal preds to be fully driven)"),
    "recall": dict(
        network="memory", mode="unit",
        method="mean |activation| in the a-priori CORTICAL memory-encoding ROI "
               "(parahippocampal/MTL cortex, fusiform/lingual, PCC/precuneus/angular).",
        badge="predicted recall · a-priori cortical memory-encoding ROI · PROXY-"
              "HYPOTHESIS. Hippocampus is subcortical & NOT in TRIBE's output — the "
              "subcortical encoding core is missing."),
    "purchase_intent": dict(
        network="value", mode="signed",
        method="mean SIGNED activation in the a-priori CORTICAL value ROI (vmPFC/medial "
               "OFC). Predicted cortical value signal.",
        badge="predicted purchase-intent · a-priori cortical value ROI (vmPFC/OFC) · "
              "PROXY-HYPOTHESIS. Nucleus accumbens (the 'buy signal') is subcortical & "
              "NOT in TRIBE's output; overlaps valence (shared vmPFC)."),
}


def space_name(n):
    return {FSAVERAGE5_N: "fsaverage5-surface",
            SCHAEFER1000_N: "schaefer1000-mni"}.get(n, f"unknown-{n}")


def _z(x):
    x = np.asarray(x, float)
    mu, sd = float(np.nanmean(x)), float(np.nanstd(x))
    return (x - mu) / (sd if sd > 1e-9 else 1.0)


def unit_arc(preds, mask):
    """0..1 engagement/load lane: z of mean |activation| in the ROI, squashed to [0,1]."""
    z = _z(np.abs(preds[:, mask]).mean(axis=1))
    u = 0.5 + z / (2 * DISPLAY_Z_DIVISOR)
    return np.clip(u, *UNIT_CLIP)


def signed_arc(preds, mask):
    """-1..1 value lane: z of mean SIGNED activation in the ROI, squashed to ~[-1,1]."""
    z = _z(preds[:, mask].mean(axis=1))
    return np.clip(z / DISPLAY_Z_DIVISOR, *SIGNED_CLIP)


def raw_profile_value(preds, mask):
    """Mean |activation| in the ROI (the roi_profile bar value, same units as the
    existing attention/language bars — NOT the display-squashed lane)."""
    return float(np.abs(preds[:, mask]).mean())


def load_mask(path, n_units):
    m = np.asarray(np.load(path), bool)
    if m.shape[0] != n_units:
        raise SystemExit(
            f"mask {path} has length {m.shape[0]} but preds are {n_units} "
            f"({space_name(n_units)}) — rebuild it with build_roi_mask.py --n-units {n_units}.")
    return m


def process(vid, preds, masks, arc_dir, out_dir):
    jpath = os.path.join(arc_dir, f"arc_{vid}.json")
    arc = json.load(open(jpath)) if os.path.exists(jpath) else {"video_id": vid}

    # whole-cortex magnitude = the honest baseline every ROI bar is compared against, so
    # the panel can show "how much MORE than baseline this system lights up".
    whole_cortex = float(np.abs(preds).mean())
    readout = {"status": STATUS,
               "method": "a-priori ROI arithmetic over frozen-TRIBE preds; every lane is "
                         "a PROXY-HYPOTHESIS, never a validated result.",
               "baseline": round(whole_cortex, 4)}

    for lane, spec in LANES.items():
        m = masks.get(spec["network"])
        if m is None:
            continue
        if spec["mode"] == "signed":
            series = signed_arc(preds, m)
        else:
            series = unit_arc(preds, m)
        readout[lane] = [round(float(x), 4) for x in series]
        readout[f"{lane}_badge"] = spec["badge"]
        readout[f"{lane}_status"] = STATUS
        # raw ROI magnitude (same units as the validated roi_profile bars) for the panel's
        # summary bar — kept INSIDE the readout block, NOT merged into the validated
        # roi_profile chart, so a proxy lane can never masquerade as the positive thesis.
        readout[f"{lane}_level"] = round(raw_profile_value(preds, m), 4)

    arc["readout"] = readout

    # per-network cortical profile — the positive-thesis bars the /demo panel renders:
    # mean |activation| in each a-priori network vs the whole-cortex baseline. Only the
    # attention / language / default-mode networks go here (kept separate from the proxy
    # readout lanes above, which live under readout.*_level). Emitted whenever those masks
    # are available so every arc, not just the flagship, carries the cortical panel.
    profile = []
    for net in ("attention", "language", "default-mode"):
        m = masks.get(net)
        if m is None:
            continue
        val = raw_profile_value(preds, m)
        profile.append({"net": net, "value": round(val, 4), "strong": bool(val > whole_cortex)})
    if profile:
        arc["roi_profile"] = profile
        arc["roi_baseline"] = round(whole_cortex, 4)

    # keep timestamps consistent if this is the first thing writing the arc
    n = len(readout.get("comprehension") or readout.get("recall") or [])
    if n and (not isinstance(arc.get("timestamps"), list) or len(arc["timestamps"]) != n):
        arc["timestamps"] = [round(float(i), 2) for i in range(n)]
        arc.setdefault("fps_arc", 1.0)
        arc.setdefault("duration_sec", round(n / (arc.get("fps_arc") or 1.0), 2))

    os.makedirs(out_dir, exist_ok=True)
    outp = os.path.join(out_dir, f"arc_{vid}.json")
    with open(outp, "w") as f:
        json.dump(arc, f, indent=2, allow_nan=False)
    return outp


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-glob", required=True, help="glob for preds_<id>.npy")
    ap.add_argument("--arc-dir", required=True,
                    help="dir with arc_<id>.json to merge into (created if absent)")
    ap.add_argument("--out-dir", default=None, help="where to write (default: --arc-dir)")
    ap.add_argument("--language-mask", default="data/roi_mask_language.npy")
    ap.add_argument("--memory-mask", default="data/roi_mask_memory.npy")
    ap.add_argument("--value-mask", default="data/roi_mask_value.npy")
    # profile-only networks (drive roi_profile, not a readout lane)
    ap.add_argument("--attention-mask", default="data/roi_mask_dan.npy")
    ap.add_argument("--dmn-mask", default="data/roi_mask_dmn.npy")
    ap.add_argument("--n-units", type=int, default=None,
                    help="hard-assert the preds space (else auto-detected per file)")
    args = ap.parse_args()

    out_dir = args.out_dir or args.arc_dir
    preds_files = sorted(glob.glob(args.preds_glob))
    if not preds_files:
        raise SystemExit(f"no preds match {args.preds_glob!r} — run batch_extract first.")

    n_units = args.n_units or int(np.load(preds_files[0], mmap_mode="r").shape[-1])
    print(f"[space] {space_name(n_units)} ({n_units} units)")
    mask_paths = {"language": args.language_mask, "memory": args.memory_mask,
                  "value": args.value_mask,
                  # profile-only nets: keyed by the arc's roi_profile net names
                  "attention": args.attention_mask, "default-mode": args.dmn_mask}
    masks = {}
    for net, p in mask_paths.items():
        if os.path.exists(p):
            masks[net] = load_mask(p, n_units)
            print(f"[mask] {net:<8} {int(masks[net].sum())}/{n_units} vertices <- {p}")
        else:
            print(f"[mask] {net:<8} MISSING ({p}) — its lane will be skipped. Build it with "
                  f"build_roi_mask.py --network {net}.")
    if not masks:
        raise SystemExit("no masks found — build them with build_roi_mask.py first.")

    for pf in preds_files:
        vid = os.path.basename(pf)[len("preds_"):-len(".npy")]
        preds = np.load(pf).astype(float)
        if preds.shape[-1] != n_units:
            print(f"[skip] {vid}: {preds.shape[-1]} units != {n_units}")
            continue
        outp = process(vid, preds, masks, args.arc_dir, out_dir)
        lanes = [l for l in LANES if LANES[l]["network"] in masks]
        print(f"[readout] {vid}: lanes={lanes} -> {outp}")

    print("\nReminder: comprehension / recall / purchase-intent here are a-priori PROXY-"
          "HYPOTHESES over cortical ROIs. Recall misses the subcortical hippocampus; "
          "purchase-intent misses the subcortical nucleus accumbens. Displayed as "
          "hypotheses, never validated results.")


if __name__ == "__main__":
    main()
