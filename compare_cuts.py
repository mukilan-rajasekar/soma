#!/usr/bin/env python3
"""
compare_cuts.py — "COMPARE YOUR CUTS": a PREDICTED, WITHIN-ITEM variant ranker.

THE PRODUCT CORE. A brand uploads N cuts of the SAME creative (a 15s / 22s / 30s
edit, an A/B hook swap, an alternate CTA). This ranks those cuts by predicted
ATTENTION-HOLD and, when the message lane is available, predicted SEMANTIC-
INTEGRATION LOAD — and calls out, per cut, the seconds where a lane is predicted
to dip ("attention drops at 0:12"). No human panel; scored from the cached TRIBE
predictions alone.

THE HONESTY LINE (absolute — read before trusting a single number):
  * This is a PREDICTED, RELATIVE, WITHIN-ITEM ranking. It rank-orders a brand's
    OWN variants against each other. It is NOT an absolute "this cut will win"
    score — the cross-brand / absolute-performance axis tested NULL, so we do not
    make it. Rank your own cuts; do not compare one brand's cut to another's.
  * It is a HYPOTHESIS, not a validated result. There is NO retention/ThruPlay
    validation wired in yet (see VALIDATION_HOOK below — the documented place a
    real brand-ThruPlay check plugs in). Every payload/table is badged as such.
  * ATTENTION-HOLD = the mean of the predicted attention arc. With a trained head
    (train_head.py's TVSum read-out) it is the head arc; the head is validated for
    WITHIN-VIDEO SHAPE only, and its per-video z-scored output has ~zero mean by
    construction, so to make cuts COMPARABLE we standardize the head's features on
    the POOLED set of variants (valid precisely because they are cuts of the SAME
    creative — same feature distribution). Without a head we fall back to the
    a-priori DAN (dorsal-attention) ROI magnitude, which is already cross-cut
    comparable. Either way this is the TVSum-proxy attention lane: importance !=
    retention, a hypothesis.
  * MESSAGE-LOAD = mean of the a-priori LANGUAGE-ROI arc (message_extract.py). It
    is "predicted SEMANTIC-INTEGRATION LOAD", never "the viewer understood it", and
    it is only meaningful on TRIMODAL preds (the text branch drives it). If no
    language mask is supplied it is skipped with a clear note — never faked.
  * WEAK SPOTS are PREDICTED dips (a lane sitting < median - k*MAD, robust, within
    each cut), badged as predictions — never measured attention.

USAGE (CPU, local — after batch_extract.py cached the preds):
  # rank the cuts of one creative by the trained-head attention lane:
  python compare_cuts.py --preds-dir data/ads/arcs --ids meta_00,meta_01,meta_05 \
      --head validation/head_attn.json --arc-dir data/ads/arcs \
      --creative-id my_spot --out validation/compare_cuts.json

  # no head -> a-priori DAN attention lane (cross-cut comparable magnitude):
  python compare_cuts.py --preds-dir data/ads/arcs --glob 'preds_*.npy' \
      --dan-mask data/roi_mask_dan.npy --out validation/compare_cuts.json

  # add the MESSAGE lane (needs TRIMODAL preds + the language ROI mask):
  python compare_cuts.py --preds-dir data/arcs_trimodal --glob 'preds_*.npy' \
      --head validation/head_attn.json --arc-dir data/arcs_trimodal \
      --language-mask data/roi_mask_language.npy --out validation/compare_cuts.json
"""
import argparse
import glob
import json
import os
from datetime import date

import numpy as np

import head_io
import train_head as T
from honest_corr_timeseries import resample_to_grid
from batch_extract import (arc_from_preds, detect_weak_spots,
                           WEAK_SPOT_N_STD, WEAK_SPOT_MIN_LEN_SEC)

SCHEMA_VERSION = "compare-cuts-1.0"

# The badge stamped on every ranking payload/table. Non-negotiable framing.
RANKING_BADGE = (
    "PREDICTED · RELATIVE · WITHIN-ITEM. Rank-orders a brand's OWN cuts of one "
    "creative against each other; NOT an absolute performance prediction, NOT "
    "validated vs retention/ThruPlay. A hypothesis, not a result.")

# Emitted when the message lane cannot be computed (no language mask supplied).
MESSAGE_SKIP_NOTE = (
    "message lane requires TRIMODAL preds (audio+video+TEXT) + a language ROI mask "
    "(build_roi_mask.py --network language) — omitted here; not faked.")

# The documented hook where a real brand-outcome (ThruPlay / retention) validation
# plugs in. Until it does, the ranking stays a HYPOTHESIS (no label is emitted for
# the ranking itself — see CLAUDE.md: validation vs ThruPlay is a separate step).
VALIDATION_HOOK = {
    "status": "not_validated",
    "outcome": "per-cut ThruPlay% / avg-%-viewed (brand-supplied), matched by variant id",
    "test": ("within-creative rank agreement: Spearman(predicted attention-hold rank, "
             "observed ThruPlay rank) across a brand's cuts, permutation-nulled; a "
             "future step, not run here"),
    "note": ("no held-out retention data is wired in — this ranking is a prediction "
             "only. Do NOT present a validated-vs-ThruPlay number until this hook is "
             "filled and passes."),
}


# -----------------------------------------------------------------------------
# small helpers
# -----------------------------------------------------------------------------
def mmss(sec):
    """Seconds -> 'M:SS' timestamp (the '...drops at 0:12' display form)."""
    sec = int(round(float(sec)))
    return f"{sec // 60}:{sec % 60:02d}"


def _sanitize_for_weakspots(arc):
    """Replace non-finite samples with the finite median so a stray NaN (an empty
    tail shot in a head arc) can't silently swallow the whole weak-spot scan."""
    a = np.asarray(arc, float)
    finite = a[np.isfinite(a)]
    if finite.size == 0:
        return None
    med = float(np.median(finite))
    return np.where(np.isfinite(a), a, med)


def lane_weak_spots(arc, lane, n_std=WEAK_SPOT_N_STD, min_len_sec=WEAK_SPOT_MIN_LEN_SEC):
    """Per-second weak-spot callouts for one lane's arc (1 Hz).

    Reuses batch_extract.detect_weak_spots (robust within-clip MAD threshold: a
    sustained run < median - n_std*MAD), then reformats each span into a
    timestamped, lane-named PREDICTED-dip callout. A flat/steady arc yields ZERO
    spots (MAD guard) — no forced bottom quartile, so a null cut stays quiet.
    """
    a = _sanitize_for_weakspots(arc)
    if a is None:
        return []
    spots = detect_weak_spots(a, fps=1.0, min_len_sec=min_len_sec, n_std=n_std)
    out = []
    for s in spots:
        start, end = float(s["start"]), float(s["end"])
        dur = int(round(end - start))
        # recover the dip depth (SD below median) from the span label's tail, robustly
        seg = a[int(round(start)):max(int(round(start)) + 1, int(round(end)))]
        med = float(np.median(a))
        mad = 1.4826 * float(np.median(np.abs(a - med))) or 1.0
        drop_sd = float((med - np.min(seg)) / mad) if seg.size else 0.0
        out.append({
            "lane": lane,
            "at_sec": round(start, 2),
            "at": mmss(start),
            "end_sec": round(end, 2),
            "dur_sec": dur,
            "drop_sd": round(drop_sd, 2),
            "text": (f"{lane} drops at {mmss(start)} "
                     f"(predicted dip — hypothesis, not measured; lasts {dur}s, "
                     f"~{drop_sd:.1f} SD below this cut's own median)"),
        })
    return out


# -----------------------------------------------------------------------------
# attention lane
# -----------------------------------------------------------------------------
def dan_attention_arc(preds, dan_mask):
    """A-priori DAN (dorsal-attention) ROI magnitude arc — mean |activation| in the
    attention network, per second. Cross-cut comparable (raw magnitude, no per-video
    normalization), so it ranks cuts directly. The default when no head is given."""
    _g, roi = arc_from_preds(preds, dan_mask)
    return roi


def _find_head_mask(head, name):
    for nm, m in head["_masks"]:
        if nm == name:
            return m
    return None


def _head_baseline_arc(preds, head, arc_dir=None, vid=None):
    """The head's nested baseline series, computed the SAME way training was.

    - 'roi_mag'    : the DMN-ROI magnitude arc (this repo's roi_mag convention). Read
                     from arc_<id>.csv when --arc-dir is given (exact, what train_head
                     used); else recomputed from preds via the head's packed mask_dmn.
    - 'global_mag' : whole-cortex magnitude (from arc csv or recomputed from preds).
    Never fabricated: if neither an arc csv column nor a matching packed mask is
    available, we stop rather than feed the head a different baseline than it was fit
    against (that would silently corrupt the score)."""
    col = head["baseline_col"]
    # prefer the exact arc-csv baseline train_head used, if available
    if arc_dir and vid is not None:
        from honest_corr_timeseries import _read_csv
        arcp = os.path.join(arc_dir, f"arc_{vid}.csv")
        if os.path.exists(arcp):
            _, ac = _read_csv(arcp)
            if col in ac:
                return np.asarray(ac["t_sec"], float), np.asarray(ac[col], float)
    tsec = np.arange(preds.shape[0], dtype=float)
    if col == "global_mag":
        return tsec, arc_from_preds(preds)[0]
    if col == "roi_mag":
        dmn = _find_head_mask(head, "mask_dmn")
        if dmn is None:
            raise SystemExit(
                f"head baseline is 'roi_mag' (the DMN ROI) but the head packs no "
                f"'mask_dmn' to recompute it, and no arc_<id>.csv with a roi_mag column "
                f"was found (--arc-dir). Refusing to guess the baseline.")
        return tsec, arc_from_preds(preds, dmn)[1]
    raise SystemExit(
        f"head baseline_col={col!r} unsupported here (attention heads use roi_mag/"
        f"global_mag). For a 'proxy' baseline use head_apply.py.")


def _variant_feature_matrix(preds, head, arc_dir=None, vid=None):
    """One variant -> (X on the head's shot grid, edges, n_sec). Mirrors
    head_io.apply_head's feature assembly EXACTLY (pool_features + nested baseline as
    the last column), but WITHOUT the per-video standardization — that is applied
    later on POOLED statistics so the cuts are comparable."""
    preds = np.asarray(preds, float)
    n_sec = preds.shape[0]
    shot_sec = float(head["shot_sec"])
    edges = head_io._shot_edges(n_sec, shot_sec)
    tsec = np.arange(n_sec, dtype=float)
    feat_ps = T.pool_features(preds, head["_masks"])              # (n_sec, 2*n_masks)
    feat_grid = np.column_stack([resample_to_grid(tsec, feat_ps[:, j], edges)
                                 for j in range(feat_ps.shape[1])])
    bt, bv = _head_baseline_arc(preds, head, arc_dir=arc_dir, vid=vid)
    base_grid = resample_to_grid(np.asarray(bt, float), np.asarray(bv, float), edges)
    X = np.column_stack([feat_grid, base_grid])
    if X.shape[1] != head["_w"].shape[0]:
        raise SystemExit(f"[{vid}] feature count {X.shape[1]} != head weights "
                         f"{head['_w'].shape[0]} — wrong head file for these preds?")
    return X, edges, n_sec


def head_attention_arcs(variants, head, arc_dir=None):
    """Apply the head to ALL variants with feature standardization POOLED across the
    variant set, so the per-second attention LEVELS are comparable across cuts of the
    same creative (a within-video z-scored head has ~zero mean by construction — see
    the module honesty note). Weak-spot SHAPE is unaffected by the pooling (it is a
    within-arc median/MAD test). Returns {id: per_sec_arc}.
    """
    mats = {v["id"]: _variant_feature_matrix(v["preds"], head, arc_dir, v["id"])
            for v in variants}
    # pooled per-column mean/std over the good (finite) rows of ALL variants
    pooled = np.vstack([X[~np.isnan(X).any(axis=1)] for X, _e, _n in mats.values()])
    if pooled.size == 0:
        raise SystemExit("every variant's head features are all-NaN (empty ROI / "
                         "all-NaN baseline) — refusing to emit a flat prediction.")
    mu = pooled.mean(axis=0)
    sd = pooled.std(axis=0)
    sd = np.where(sd > 1e-9, sd, 1.0)
    w, b = head["_w"], head["_b"]
    arcs = {}
    for v in variants:
        X, edges, n_sec = mats[v["id"]]
        good = ~np.isnan(X).any(axis=1)
        Xs = (X - mu) / sd
        pred_shots = Xs @ w + b
        pred_shots[~good] = np.nan
        tsec = np.arange(n_sec, dtype=float)
        idx = np.clip(np.searchsorted(edges, tsec, side="right") - 1,
                      0, len(pred_shots) - 1)
        arcs[v["id"]] = pred_shots[idx]
    return arcs


# -----------------------------------------------------------------------------
# per-variant assembly + ranking
# -----------------------------------------------------------------------------
def _mean(arc):
    a = np.asarray(arc, float)
    finite = a[np.isfinite(a)]
    return float(finite.mean()) if finite.size else float("nan")


def compare(variants, head=None, dan_mask=None, language_mask=None, arc_dir=None,
            n_std=WEAK_SPOT_N_STD, min_len_sec=WEAK_SPOT_MIN_LEN_SEC):
    """Score + rank a set of variants (list of {id, preds}). Returns the payload dict.

    variants : [{"id": str, "preds": (n_sec, n_units) array}, ...]
    head     : loaded head (head_io.load_head) or None. If given -> pooled head arc;
               else the DAN a-priori ROI arc (dan_mask REQUIRED in that case).
    language_mask : bool mask -> message lane (else skipped with MESSAGE_SKIP_NOTE).
    """
    if not variants:
        raise SystemExit("no variants to compare.")

    # ---- attention lane (the ranking driver) ----
    if head is not None:
        attn_arcs = head_attention_arcs(variants, head, arc_dir=arc_dir)
        hstatus, hbadge = head_io.badge_text(head)
        attn_source = (f"trained-head:{head.get('_path', head.get('kind', 'head'))} "
                       f"(pooled-standardized across the {len(variants)} cuts so levels "
                       f"are comparable)")
        head_badge = {"status": hstatus, "badge": hbadge}
    else:
        if dan_mask is None:
            raise SystemExit("no --head given, so the attention lane needs --dan-mask "
                             "(the a-priori DAN ROI). Provide one or a head.")
        attn_arcs = {v["id"]: dan_attention_arc(v["preds"], dan_mask) for v in variants}
        attn_source = ("a-priori DAN (dorsal-attention) ROI mean |activation| — "
                       "TVSum-proxy attention lane, cross-cut comparable magnitude")
        head_badge = None

    # ---- message lane (optional; needs trimodal preds + language mask) ----
    msg_arcs, message_source = {}, None
    if language_mask is not None:
        import message_extract
        for v in variants:
            msg_arcs[v["id"]] = message_extract.semantic_load_arc(v["preds"], language_mask)
        message_source = message_extract.METHOD
        message_status = message_extract.STATUS
    else:
        message_status = None

    # ---- per-variant records ----
    records = []
    for v in variants:
        vid = v["id"]
        attn = np.asarray(attn_arcs[vid], float)
        n_sec = int(attn.shape[0])
        rec = {
            "id": vid,
            "n_sec": n_sec,
            "duration_sec": round(n_sec / 1.0, 2),
            "attention_hold": round(_mean(attn), 6),
            "message_load": None,
            "weak_spots": lane_weak_spots(attn, "attention", n_std, min_len_sec),
        }
        if language_mask is not None:
            msg = np.asarray(msg_arcs[vid], float)
            rec["message_load"] = round(_mean(msg), 6)
            rec["weak_spots"] += lane_weak_spots(msg, "message", n_std, min_len_sec)
        records.append(rec)

    # ---- rank by predicted attention-hold (message is a secondary column) ----
    records.sort(key=lambda r: (-(r["attention_hold"] if np.isfinite(r["attention_hold"])
                                  else -np.inf), r["id"]))
    for i, r in enumerate(records):
        r["rank"] = i + 1

    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated": date.today().isoformat(),
        "badge": RANKING_BADGE,
        "attention_source": attn_source,
        "head_badge": head_badge,
        "message_source": message_source,
        "message_status": message_status,
        "message_note": None if language_mask is not None else MESSAGE_SKIP_NOTE,
        "weak_spot_rule": (f"per-cut robust threshold: a lane sitting < median - "
                           f"{n_std}*MAD for >= {min_len_sec}s (PREDICTED dip, not "
                           f"measured attention)"),
        "ranking_metric": "attention_hold (higher = predicted to hold attention better)",
        "note_values_relative": ("attention_hold / message_load are RELATIVE within this "
                                 "set only — compare cuts to each other, not across sets "
                                 "or brands."),
        "validation_hook": VALIDATION_HOOK,
        "n_variants": len(records),
        "ranking": [{"rank": r["rank"], "id": r["id"], "n_sec": r["n_sec"],
                     "duration_sec": r["duration_sec"],
                     "attention_hold": r["attention_hold"],
                     "message_load": r["message_load"],
                     "weak_spots": r["weak_spots"]} for r in records],
    }
    return payload


# -----------------------------------------------------------------------------
# rendering
# -----------------------------------------------------------------------------
def print_table(payload):
    r = payload["ranking"]
    has_msg = payload["message_source"] is not None
    W = 78
    print("\n" + "=" * W)
    print("COMPARE YOUR CUTS" + (f"  creative={payload.get('creative_id')}"
                                 if payload.get("creative_id") else "")
          + f"  n_variants={payload['n_variants']}")
    print("PREDICTED · RELATIVE · WITHIN-ITEM ranking (a hypothesis, not absolute perf)")
    print("=" * W)
    print(f"attention: {payload['attention_source']}")
    if payload["head_badge"]:
        print(f"head     : {payload['head_badge']['badge']}")
    print(f"message  : {payload['message_source'] if has_msg else payload['message_note']}")
    print("-" * W)
    msg_h = "message" if has_msg else ""
    print(f"{'rank':>4}  {'variant':<18}{'dur':>6}{'attn-hold':>12}{msg_h:>12}  weak-spots")
    print("-" * W)
    for row in r:
        msg = f"{row['message_load']:.4f}" if row["message_load"] is not None else ""
        dur = mmss(row["duration_sec"])
        print(f"{row['rank']:>4}  {row['id']:<18}{dur:>6}{row['attention_hold']:>12.4f}"
              f"{msg:>12}  {len(row['weak_spots'])}")
    print("-" * W)
    print("predicted weak spots (dips — HYPOTHESIS, not measured attention):")
    any_spot = False
    for row in r:
        for ws in row["weak_spots"]:
            any_spot = True
            print(f"  {row['id']}: {ws['text']}")
    if not any_spot:
        print("  (none flagged — no lane dipped below its within-cut robust threshold)")
    print("-" * W)
    print("RANKING IS PREDICTED + RELATIVE + WITHIN-ITEM — rank a brand's OWN cuts; "
          "NOT an absolute\nwin score, NOT validated vs ThruPlay (see validation_hook). "
          "A hypothesis, not a result.")


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------
def _load_variants(preds_dir, ids, glob_pat):
    """Resolve the variant preds files -> [{id, preds}]. Either --ids (explicit,
    ordered) or --glob within --preds-dir."""
    files = []
    if ids:
        for vid in [s.strip() for s in ids.split(",") if s.strip()]:
            p = os.path.join(preds_dir, f"preds_{vid}.npy")
            if not os.path.exists(p):
                raise SystemExit(f"missing preds for id {vid!r}: {p}")
            files.append((vid, p))
    else:
        for p in sorted(glob.glob(os.path.join(preds_dir, glob_pat))):
            base = os.path.basename(p)
            vid = base[len("preds_"):-len(".npy")] if base.startswith("preds_") \
                else os.path.splitext(base)[0]
            files.append((vid, p))
    if not files:
        raise SystemExit(f"no variant preds found (dir={preds_dir!r} ids={ids!r} "
                         f"glob={glob_pat!r}).")
    variants = []
    n_units = None
    for vid, p in files:
        arr = np.load(p).astype(float)
        if n_units is None:
            n_units = arr.shape[1]
        elif arr.shape[1] != n_units:
            raise SystemExit(f"variant {vid} has {arr.shape[1]} units != {n_units} "
                             "(mixed output spaces — re-extract in one space).")
        variants.append({"id": vid, "preds": arr})
    return variants, n_units


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds-dir", required=True, help="dir with preds_<id>.npy variants")
    ap.add_argument("--ids", default=None,
                    help="comma-separated variant ids (preds_<id>.npy); else use --glob")
    ap.add_argument("--glob", default="preds_*.npy")
    ap.add_argument("--head", default=None,
                    help="attention head JSON (head_io). If omitted -> --dan-mask lane.")
    ap.add_argument("--arc-dir", default=None,
                    help="dir with arc_<id>.csv for the head's exact roi_mag/global_mag "
                         "baseline (else recomputed from preds via the head's DMN mask)")
    ap.add_argument("--dan-mask", default="data/roi_mask_dan.npy",
                    help="a-priori DAN ROI mask (used when no --head)")
    ap.add_argument("--language-mask", default=None,
                    help="a-priori LANGUAGE ROI mask -> the message lane (TRIMODAL preds)")
    ap.add_argument("--creative-id", default=None, help="label for the creative")
    ap.add_argument("--k", type=float, default=WEAK_SPOT_N_STD,
                    help="weak-spot threshold: median - k*MAD (robust)")
    ap.add_argument("--min-dip-sec", type=float, default=WEAK_SPOT_MIN_LEN_SEC,
                    help="ignore predicted dips shorter than this")
    ap.add_argument("--out", default="validation/compare_cuts.json")
    args = ap.parse_args()

    variants, n_units = _load_variants(args.preds_dir, args.ids, args.glob)
    print(f"[compare] {len(variants)} variant(s): "
          f"{', '.join(v['id'] for v in variants)}  (n_units={n_units})")

    head = None
    if args.head:
        head = head_io.load_head(args.head)
        head["_path"] = os.path.basename(args.head)
        status, badge = head_io.badge_text(head)
        print(f"[head] {head.get('kind')} status={status}: {badge}")
        if status == "poisoned":
            raise SystemExit("refusing to rank with a POISONED head — fix leakage first.")
        ml = int(head["_masks"][0][1].shape[0])
        if ml != n_units:
            raise SystemExit(f"head masks are length {ml} but preds have {n_units} units "
                             "— output-space mismatch (check_preds_space.py + rebuild).")

    dan_mask = None
    if head is None:
        if not os.path.exists(args.dan_mask):
            raise SystemExit(f"--dan-mask {args.dan_mask!r} not found (needed without a "
                             "head). Build it: build_roi_mask.py --network dan.")
        dan_mask = np.load(args.dan_mask)
        if dan_mask.shape[0] != n_units:
            raise SystemExit(f"DAN mask length {dan_mask.shape[0]} != preds units {n_units}.")

    language_mask = None
    if args.language_mask:
        if not os.path.exists(args.language_mask):
            raise SystemExit(f"--language-mask {args.language_mask!r} not found. Build it: "
                             "build_roi_mask.py --network language.")
        language_mask = np.load(args.language_mask)
        if language_mask.shape[0] != n_units:
            raise SystemExit(f"language mask length {language_mask.shape[0]} != preds units "
                             f"{n_units}.")
    else:
        print(f"[message] {MESSAGE_SKIP_NOTE}")

    payload = compare(variants, head=head, dan_mask=dan_mask, language_mask=language_mask,
                      arc_dir=args.arc_dir, n_std=args.k, min_len_sec=args.min_dip_sec)
    if args.creative_id:
        payload["creative_id"] = args.creative_id

    print_table(payload)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=2, allow_nan=False)
    print(f"\n[wrote] {args.out}")


if __name__ == "__main__":
    main()
