#!/usr/bin/env python3
"""
head_io.py — persist a trained read-out head and APPLY it to a NEW video.

train_head.py / affect_head.py only VALIDATE (leave-one-VIDEO-out). This module is the
missing inference path: it serializes a fitted head and scores an UNSEEN ad's preds.

A saved head is a self-contained JSON: the ridge weights PLUS the a-priori masks packed
inside it, so the feature definition travels WITH the head — there is no external mask
file to drift out of sync between fit and apply. Read save_head() for the exact contract.

HONESTY (non-negotiable):
- The head's `stamp` is its TRACK RECORD on the TRAINING proxy (TVSum interest / LIRIS
  affect), measured leave-one-VIDEO-out. Scoring a brand-new ad is OUT-OF-DISTRIBUTION,
  so a head arc on a new ad is a HYPOTHESIS, never "validated for this ad".
- badge_text() encodes exactly that and REFUSES a validated badge for a head that is
  poisoned (its leakage control failed), underpowered (n<8), or null (didn't beat chance).
- apply_head() never fabricates the nested baseline — the caller must supply the same
  baseline series training used, or it raises.
"""
import base64
import hashlib
import json
import math
import os

import numpy as np

import train_head as T
from honest_corr_timeseries import resample_to_grid

SCHEMA_VERSION = "head-1.0"


# -----------------------------------------------------------------------------
# mask (de)serialization — packed into the head so features can't drift
# -----------------------------------------------------------------------------
def _pack_mask(mask):
    m = np.asarray(mask, bool)
    packed = np.packbits(m).tobytes()
    return dict(length=int(m.shape[0]), n_true=int(m.sum()),
                sha1=hashlib.sha1(packed).hexdigest(),
                bits=base64.b64encode(packed).decode("ascii"))


def _unpack_mask(spec):
    raw = np.frombuffer(base64.b64decode(spec["bits"]), dtype=np.uint8)
    m = np.unpackbits(raw)[: spec["length"]].astype(bool)
    if int(m.sum()) != spec["n_true"]:
        raise ValueError(f"mask '{spec.get('name')}' unpacked to {int(m.sum())} true "
                         f"vertices != saved {spec['n_true']} — corrupt head file")
    return m


# -----------------------------------------------------------------------------
# save / load
# -----------------------------------------------------------------------------
def clean_stamp(stamp):
    """Replace non-finite floats (NaN/Inf — a null head's median_r/stouffer_p/paired_p come
    back NaN) with None, so neither the saved head nor any browser-bound JSON can contain a
    literal `NaN` token (which json.dump writes by default and strict JSON.parse rejects,
    bailing the whole demo render)."""
    out = {}
    for k, v in (stamp or {}).items():
        out[k] = None if (isinstance(v, float) and not math.isfinite(v)) else v
    return out


def save_head(path, kind, w, b, alpha, masks, baseline_col, shot_sec, stamp):
    """Serialize a fitted head.

    kind         : "attention" | "valence" | "arousal"  (picks demo lane + badge)
    w, b         : ridge weights + intercept (the learned head itself)
    alpha        : ridge penalty chosen by nested LOVO
    masks        : [(name, bool_mask), ...] in FEATURE ORDER (pool_features order)
    baseline_col : "roi_mag" | "global_mag" | "proxy" — the nested baseline (last feature)
    shot_sec     : shot-grid resolution used at fit time (rebuild the same grid at apply)
    stamp        : {median_r, stouffer_p, paired_p, n_videos, leak_check, dataset, date}
                   — the head's honest TRACK RECORD, badged truthfully at apply.
    """
    mask_specs = []
    for name, m in masks:
        spec = _pack_mask(m)
        spec["name"] = name
        mask_specs.append(spec)
    # feature layout MUST equal train_head.pool_features (2 cols/mask) + baseline (last col)
    feat_names = []
    for name, _m in masks:
        feat_names += [f"{name}|mag", f"{name}|sgn"]
    feat_names.append(f"{baseline_col}(nested baseline)")
    w = np.asarray(w, float).ravel()
    if w.shape[0] != len(feat_names):
        raise ValueError(f"weight length {w.shape[0]} != {len(feat_names)} feature columns "
                         "— masks/baseline do not match the fitted weights")
    payload = dict(schema_version=SCHEMA_VERSION, kind=kind, masks=mask_specs,
                   baseline_col=baseline_col, feature_names=feat_names,
                   shot_sec=float(shot_sec), alpha=float(alpha),
                   w=w.tolist(), b=float(b), stamp=clean_stamp(stamp))
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(payload, f, indent=2, allow_nan=False)  # never emit a literal NaN token
    return path


def load_head(path):
    with open(path) as f:
        head = json.load(f)
    if head.get("schema_version") != SCHEMA_VERSION:
        print(f"[head_io] warn: head schema {head.get('schema_version')!r} != "
              f"{SCHEMA_VERSION!r} — loading anyway, but the contract may differ.")
    head["_masks"] = [(s["name"], _unpack_mask(s)) for s in head["masks"]]
    head["_w"] = np.asarray(head["w"], float)
    head["_b"] = float(head["b"])
    return head


# -----------------------------------------------------------------------------
# apply — score one new video (mirrors train_head.video_data so fit == apply)
# -----------------------------------------------------------------------------
def _shot_edges(n_sec, shot_sec):
    """Shot-bin boundaries [0, shot, 2*shot, ...] covering the clip (mirrors edges in
    train_head.video_data, which are the human shot starts + the final duration)."""
    # ceil (not round) so the final bin edge >= n_sec and the last second is never dropped
    # from feature pooling (a 29 s clip at shot_sec=2 must still cover t=28).
    n_shots = max(1, int(np.ceil(n_sec / shot_sec)))
    return np.arange(n_shots + 1, dtype=float) * shot_sec


def apply_head(head, preds, baseline_t, baseline_v):
    """Score preds (n_sec, 20484) with a loaded head.

    baseline_(t, v): the nested-baseline series (arc_<id>.csv roi_mag/global_mag, or the
    affect proxy) the caller must supply — the SAME baseline training used. Required; we
    never silently substitute a different baseline than the fitted head expects.

    Returns dict(pred_shots, edges, good, per_sec, n_sec).
    """
    preds = np.asarray(preds, float)
    n_sec = preds.shape[0]
    masks = head["_masks"]
    shot_sec = head["shot_sec"]
    edges = _shot_edges(n_sec, shot_sec)
    tsec = np.arange(n_sec, dtype=float)

    feat_ps = T.pool_features(preds, masks)                      # (n_sec, 2*n_masks)
    feat_grid = np.column_stack([resample_to_grid(tsec, feat_ps[:, j], edges)
                                 for j in range(feat_ps.shape[1])])
    if baseline_t is None or baseline_v is None:
        raise ValueError(f"apply_head needs the '{head['baseline_col']}' baseline series "
                         "— refusing to fabricate the nested baseline.")
    base_grid = resample_to_grid(np.asarray(baseline_t, float),
                                 np.asarray(baseline_v, float), edges)
    X = np.column_stack([feat_grid, base_grid])
    if X.shape[1] != head["_w"].shape[0]:
        raise ValueError(f"feature count {X.shape[1]} != head weights "
                         f"{head['_w'].shape[0]} — head/masks mismatch (wrong head file?)")
    good = ~np.isnan(X).any(axis=1)
    if not good.any():
        raise ValueError(f"apply_head: the '{head['baseline_col']}' baseline / pooled "
                         "features are entirely NaN for this clip (empty ROI mask or all-NaN "
                         "baseline) — refusing to emit a flat all-zero arc as a prediction.")
    Xs = T._standardize(X, good)                                 # per-video z, leakage-safe
    pred_shots = Xs @ head["_w"] + head["_b"]
    pred_shots[~good] = np.nan
    # expand per-shot level -> per-second (each second takes its shot's predicted value)
    idx = np.clip(np.searchsorted(edges, tsec, side="right") - 1, 0, len(pred_shots) - 1)
    per_sec = pred_shots[idx]
    return dict(pred_shots=pred_shots, edges=edges, good=good, per_sec=per_sec, n_sec=n_sec)


# -----------------------------------------------------------------------------
# display mapping + honest badge
# -----------------------------------------------------------------------------
def to_unit(per_sec):
    """0..1 display normalization (2nd..98th percentile), matching write_demo_json."""
    a = np.asarray(per_sec, float)
    finite = a[np.isfinite(a)]
    if finite.size == 0:
        return np.zeros_like(a)
    lo, hi = np.percentile(finite, 2), np.percentile(finite, 98)
    out = np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)
    return np.where(np.isfinite(a), out, 0.0)


def to_signed(per_sec):
    """Map a z-scored level to ~[-1, 1] for a signed lane (valence): robust tanh so
    the display is bounded without inventing a hard scale."""
    a = np.asarray(per_sec, float)
    finite = a[np.isfinite(a)]
    if finite.size == 0:
        return np.zeros_like(a)
    med = float(np.median(finite))
    mad = 1.4826 * float(np.median(np.abs(finite - med))) or 1.0
    out = np.tanh((a - med) / (2 * mad))
    return np.where(np.isfinite(a), out, 0.0)


def _num(x, fmt="{:.2f}"):
    try:
        return fmt.format(float(x))
    except (TypeError, ValueError):
        return "?"


def badge_text(head):
    """(status, human badge) for a head, honest by construction.

    status in: poisoned | smoke | unvalidated | learned-hypothesis. head_apply REFUSES
    to apply a 'poisoned' head, and never prints a validated claim for smoke/unvalidated.
    """
    st = head.get("stamp", {}) or {}
    kind = head.get("kind", "signal")
    n, r, p = st.get("n_videos"), st.get("median_r"), st.get("stouffer_p")
    ds = st.get("dataset", "the training proxy")
    # FAIL CLOSED: a head with no recorded leakage verdict is treated as poisoned, not
    # waved through. Only an explicit 'pass' clears the poison gate.
    leak = st.get("leak_check", "unknown")

    if leak != "pass":
        return ("poisoned", f"POISONED {kind} head — leakage control not passed "
                f"(leak_check={leak}). DO NOT TRUST.")
    try:
        n_int = int(n)
    except (TypeError, ValueError):
        n_int = 0
    if n_int < 8:
        return ("smoke", f"predicted {kind} · trained-head SMOKE TEST "
                f"(n={n} < 8 videos, not validated)")
    try:
        is_real = float(r) > 0 and float(p) < 0.05
    except (TypeError, ValueError):
        is_real = False
    if not is_real:
        return ("unvalidated", f"predicted {kind} · trained head did NOT beat chance on "
                f"{ds} (r≈{_num(r)}, p≈{_num(p, '{:.2g}')}, n={n}) — shown as a hypothesis only")
    return ("learned-hypothesis", f"predicted {kind} · trained head "
            f"({ds} leave-one-video-out r≈{_num(r)}, p≈{_num(p, '{:.2g}')}, n={n}). "
            "This ad is out-of-distribution → a prediction, not a validated result.")
