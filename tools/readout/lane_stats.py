#!/usr/bin/env python3
"""
lane_stats.py — the lane geometry and lane time-series figures, re-derived instead of remembered.

    data/arcs/preds_*.npy + Schaefer annots  ──▶  validation/lane_stats.json

    # recompute the committed artifact (needs data/, i.e. the scorer box)
    .venv/bin/python tools/readout/lane_stats.py --write

    # does the committed artifact still equal a fresh fold of its inputs?
    .venv/bin/python tools/readout/lane_stats.py --check

    # the same figures over a different stimulus set (e.g. the scored ads)
    .venv/bin/python tools/readout/lane_stats.py --preds-dir data/ads/arcs \
        --out validation/lane_stats_ads.json --write

WHY THIS EXISTS. Strategy and application material quotes numbers about the lanes: how many
vertices each network covers, how much of cortex the four shipped lanes actually span, how
correlated the per-second lanes are with each other, how much of their joint variance is one
component, how hard the visual lane drives the rest, how long a lane remembers its own past.
Every one of those is arithmetic over files in this repo — and none of them had a script or an
artifact. That is precisely the failure docs/strategy/PLAN.md section 0.3 catalogues: a figure on
a public surface with nothing behind it but someone's memory of having computed it once.
docs/strategy/PRODUCT.md:100 makes the rule explicit, so this file makes the numbers gate-checkable.

WHAT THE AUDIT CAUGHT, AND WHY THIS EMITS TWO OF EVERYTHING. The correlation and PC1 figures
were computed across the SEVEN Yeo networks and then quoted as if they described the FOUR lanes
the product ships. They are not the same number and the four-lane version is the LESS flattering
one: dropping SomMot, Limbic and half of Cont removes the least-correlated columns, so both the
mean off-diagonal correlation and the PC1 share go UP. Every such figure below is therefore
emitted twice, named `across_seven_yeo_networks` and `across_four_shipped_lanes`. Quote the one
that matches the sentence you are writing, and never let a set label go missing.

NOTHING IS HARDCODED THAT CAN BE DERIVED. The lane definitions come from
demo/process_batch.py's ARC_ROIS, the masks from its mask_for, the vertex labels from its
load_parcel_names, the sample period from its TR_SECONDS. If someone retunes a lane there, this
artifact changes and --check says so. The Yeo-7 membership is parsed out of the annot files
themselves rather than typed in, so an atlas swap cannot pass silently.

PROVENANCE, BECAUSE THE INPUTS ARE NOT COMMITTED. /data/ is gitignored (it holds predictions and
corpus material that are large and not all ours to redistribute), so unlike
tools/capture/summarize.py this fold cannot re-run on a fresh clone. The artifact therefore
carries the SHA-256 of every input it read plus the stimulus list and each stimulus's T, so a
number can never be quoted without knowing what it was computed over, and so --check on the box
that has the data proves the committed file came from exactly these bytes. On a checkout without
data/ this exits non-zero and says why. It does not skip: a guard that quietly stops guarding is
worse than no guard (tools/demo/check_coherence.py makes the same argument).

THE DEFAULT STIMULUS SET IS NOT ADS. data/arcs/ holds fifteen ~2-minute web clips and four
COGNIMUSE feature films — the stimuli the readout work was done on. The scored ads live in
data/ads/arcs/. These are properties of the lanes, not of the corpus, but they do move with
stimulus length, so --preds-dir/--out exist to fold a second set into its own artifact rather
than tempting anyone to reuse this one's numbers for a different set. The folded directory is
recorded in the artifact, so checking one artifact against the other's inputs fails loudly.

Floats are quantized before serialization. The fold is pure arithmetic, but eigenvalues and
correlations differ in the last bits across BLAS builds, and a check that fails on the twelfth
decimal teaches people to ignore it.
"""

import argparse
import contextlib
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
for _p in (str(ROOT), str(ROOT / "demo")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from process_batch import (ANNOT, ARC_ROIS, TR_SECONDS,          # noqa: E402
                           load_parcel_names, mask_for)

OUT = ROOT / "validation" / "lane_stats.json"
PREDS_DIR = ROOT / "data" / "arcs"
CACHE_DIR = ROOT / "demo" / ".cache"          # load_parcel_names appends /atlas
LEGACY_MASKS = ROOT / "data"                  # roi_mask_<name>.npy

SCHEMA_VERSION = "lane-stats-1.0"
N_VERTICES = 20484                            # fsaverage5 [lh; rh]
LAGS_S = (1.0, 5.0)
ROUND = 6                                     # see the docstring's last paragraph

# The parcel-name prefix that marks a real Schaefer parcel. Anything else in the annot
# (the FreeSurfer medial wall) is not a network and is counted separately rather than
# folded into one, which is how a 20,484 denominator stays honest.
PARCEL_PREFIX = "7Networks_"

# The legacy data/roi_mask_*.npy masks are Destrieux ANATOMICAL selections
# (build_roi_mask.py), not Schaefer network selections. They are still read by
# tools/demo/build_report.py and validation/recheck/C-*/, and they are named after networks,
# so the interesting question is how close each one actually is to the network its name
# claims. `None` means the repo asserts no single Yeo-7 counterpart — Yeo-7 has no language,
# memory or value network — and the row is reported against all seven instead of pretending.
NOMINAL_NETWORK = {
    "dan": "DorsAttn",           # build_roi_mask.py DORSAL_ATTN_REGIONS
    "dmn": "Default",            # build_roi_mask.py DMN_REGIONS
    "arousal": "SalVentAttn",    # docs/demo/BUILD-NOTES.md:29 "salience net"
    "valence": "Limbic",         # OFC / vmPFC / gyrus rectus
    "language": None,
    "memory": None,
    "value": None,
}


# ================================================================================
# provenance
# ================================================================================
def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def rel(path: Path) -> str:
    """Repo-relative when it can be — an artifact full of one laptop's absolute paths is
    not portable, and a path outside the repo must still be recorded exactly as given."""
    p = Path(path).resolve()
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


# ================================================================================
# masks — every one of them through process_batch's own mask_for
# ================================================================================
def quiet_mask(parcel_names, tags, label):
    """mask_for, minus its per-ROI stdout line, plus its warnings kept.

    mask_for prints a formatted ROI line meant for a pipeline log; this tool prints its
    own summary. The `!` warning lines are the ones that mean something went wrong, so
    they are forwarded to stderr rather than swallowed with the rest.
    """
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        mask = mask_for(parcel_names, tags, label)
    for line in buf.getvalue().splitlines():
        if "!" in line:
            print(line, file=sys.stderr)
    return mask


def yeo_networks(parcel_names):
    """The Yeo-7 tags actually present in the annot, read out of the labels."""
    nets = set()
    for name in set(parcel_names.astype(str).tolist()):
        if not name.startswith(PARCEL_PREFIX):
            continue
        parts = name.split("_")
        if len(parts) >= 4:                    # 7Networks_<HEMI>_<Net>_<Sub>_<idx>
            nets.add(parts[2])
    return sorted(nets)


def unassigned_vertices(parcel_names):
    """Vertices carrying no Schaefer parcel — the FreeSurfer medial wall."""
    strs = parcel_names.astype(str)
    return int((~np.char.startswith(strs, PARCEL_PREFIX)).sum())


# ================================================================================
# the arithmetic
# ================================================================================
def lane_series(preds, masks, keys):
    """(T, k) per-second lane means — the same spatial average the arc is built from.

    The arc subtracts a baseline scalar per lane; correlation, PC1 and autocorrelation are
    all invariant to a constant per-lane offset, so this reads the lanes before that
    subtraction and the numbers are unaffected by which baseline window was used.
    """
    return np.column_stack([
        np.asarray(preds[:, masks[k]], dtype=np.float64).mean(axis=1) for k in keys
    ])


def set_stats(X, keys, drive_key):
    """Every per-stimulus figure for one set of lanes."""
    k = len(keys)
    corr = np.corrcoef(X, rowvar=False)
    iu = np.triu_indices(k, 1)

    # PC1 both ways. On z-scored lanes (eigenvalues of the correlation matrix) every lane
    # counts the same; on raw lanes (covariance) the loudest lane dominates. They differ by
    # a lot here, so the label carries which one it is.
    ev_z = np.linalg.eigvalsh(corr)[::-1]
    ev_raw = np.linalg.eigvalsh(np.cov(X, rowvar=False))[::-1]

    di = keys.index(drive_key)
    drive = {key: float(corr[di, j]) for j, key in enumerate(keys) if j != di}

    autocorr = {}
    for lag_s in LAGS_S:
        lag = int(round(lag_s / TR_SECONDS))
        per = {}
        for j, key in enumerate(keys):
            x = X[:, j]
            per[key] = float(np.corrcoef(x[:-lag], x[lag:])[0, 1]) if len(x) > lag + 1 else None
        autocorr[lag_s] = per

    return {
        "mean_offdiag_r": float(corr[iu].mean()),
        "pc1_share_zscored": float(ev_z[0] / ev_z.sum()),
        "pc1_share_raw": float(ev_raw[0] / ev_raw.sum()),
        "drive_r": drive,
        "autocorr": autocorr,
    }


def agg(values):
    """Unweighted across stimuli — one stimulus, one vote, regardless of its length.

    Weighting by T would let the four COGNIMUSE features (1,598-1,878 s each) outvote the
    fifteen ~2-minute clips fourteen to one, which would quietly turn every headline number
    into a statement about long-form film.
    """
    vals = [v for v in values if v is not None]
    if not vals:
        return {"n": 0}
    a = np.asarray(vals, dtype=np.float64)
    return {
        "n": int(a.size),
        "mean": float(a.mean()),
        "median": float(np.median(a)),
        "sd": float(a.std(ddof=1)) if a.size > 1 else 0.0,
        "min": float(a.min()),
        "max": float(a.max()),
    }


def dice(a, b):
    denom = int(a.sum()) + int(b.sum())
    return float(2.0 * int((a & b).sum()) / denom) if denom else 0.0


# ================================================================================
# the fold
# ================================================================================
def fold(preds_dir):
    parcel_names = load_parcel_names(CACHE_DIR)
    if parcel_names.shape[0] != N_VERTICES:
        raise SystemExit(f"atlas is {parcel_names.shape[0]} vertices, not {N_VERTICES} — "
                         "the masks and the predictions are not in the same space.")

    nets = yeo_networks(parcel_names)
    net_masks = {n: quiet_mask(parcel_names, (n,), n) for n in nets}
    lane_keys = sorted(ARC_ROIS)
    lane_masks = {k: quiet_mask(parcel_names, ARC_ROIS[k], k) for k in lane_keys}

    union = np.zeros(N_VERTICES, dtype=bool)
    for m in lane_masks.values():
        union |= m

    lanes = {}
    for k in lane_keys:
        tags = tuple(ARC_ROIS[k])
        lanes[k] = {
            "tags": list(tags),
            "vertices": int(lane_masks[k].sum()),
            "share_of_cortex": float(lane_masks[k].sum() / N_VERTICES),
            "vertices_per_tag": {t: int(quiet_mask(parcel_names, (t,), t).sum()) for t in tags},
        }

    overlaps = {}
    for i, a in enumerate(lane_keys):
        for b in lane_keys[i + 1:]:
            n = int((lane_masks[a] & lane_masks[b]).sum())
            if n:
                overlaps[f"{a}|{b}"] = n

    atlas = {
        "n_vertices": N_VERTICES,
        "space": "fsaverage5 surface, [lh; rh]",
        "parcellation": "Schaefer2018 400Parcels 7Networks order",
        "annots": [
            {"path": rel(Path(CACHE_DIR) / "atlas" / Path(ANNOT[h]).name),
             "url": ANNOT[h],
             "sha256": sha256(Path(CACHE_DIR) / "atlas" / Path(ANNOT[h]).name)}
            for h in ("lh", "rh")
        ],
        "yeo7_networks": nets,
        "vertices_per_network": {n: int(net_masks[n].sum()) for n in nets},
        "vertices_in_networks": int(sum(int(net_masks[n].sum()) for n in nets)),
        "vertices_unassigned_medial_wall": unassigned_vertices(parcel_names),
    }

    # --- stimuli -----------------------------------------------------------------
    preds_dir = Path(preds_dir)
    files = sorted(preds_dir.glob("preds_*.npy")) if preds_dir.is_dir() else []
    if not files:
        raise SystemExit(
            f"no preds_*.npy under {preds_dir}.\n"
            "     /data/ is gitignored, so these figures can only be re-derived where the\n"
            "     predictions live (the scorer box). This is not a fresh-clone check.")

    stimuli, series7, series4 = [], {}, {}
    for f in files:
        preds = np.load(f, mmap_mode="r")
        if preds.ndim != 2 or preds.shape[1] != N_VERTICES:
            raise SystemExit(f"{rel(f)} is {preds.shape}, not (T, {N_VERTICES}) — it is not in "
                             "the space these masks are defined on. Move it out of data/arcs/.")
        sid = f.stem[len("preds_"):]
        stimuli.append({"id": sid, "file": rel(f), "T": int(preds.shape[0]),
                        "n_units": int(preds.shape[1]),
                        "duration_s": float(preds.shape[0] * TR_SECONDS),
                        "sha256": sha256(f)})
        series7[sid] = lane_series(preds, net_masks, nets)
        series4[sid] = lane_series(preds, lane_masks, lane_keys)
        del preds

    def summarize(series, keys, drive_key, label):
        per = {sid: set_stats(X, keys, drive_key) for sid, X in series.items()}
        out = {
            "members": list(keys),
            "n_members": len(keys),
            "n_stimuli": len(per),
            "visual_lane": drive_key,
            "mean_offdiag_r": agg([p["mean_offdiag_r"] for p in per.values()]),
            "pc1_share_zscored": agg([p["pc1_share_zscored"] for p in per.values()]),
            "pc1_share_raw": agg([p["pc1_share_raw"] for p in per.values()]),
            "visual_drive": {},
            "autocorr": {},
            "per_stimulus": {},
        }
        for key in keys:
            if key == drive_key:
                continue
            rs = [p["drive_r"][key] for p in per.values()]
            # r and r^2 are both reported because they disagree about this set: a lane whose
            # correlation with Vis flips sign across stimuli has a mean r near zero and a mean
            # r^2 that is not. mean(r^2) != mean(r)^2, and quoting one as the other overstates
            # or understates the drive depending on which way you err.
            out["visual_drive"][key] = {
                "r": agg(rs),
                "abs_r": agg([abs(v) for v in rs]),
                "r2": agg([v * v for v in rs]),
            }
        for lag_s in LAGS_S:
            out["autocorr"][f"lag_{lag_s:g}s"] = {
                key: agg([p["autocorr"][lag_s][key] for p in per.values()]) for key in keys
            }
        for sid, p in per.items():
            out["per_stimulus"][sid] = {
                "mean_offdiag_r": p["mean_offdiag_r"],
                "pc1_share_zscored": p["pc1_share_zscored"],
                "pc1_share_raw": p["pc1_share_raw"],
                "visual_drive_r": p["drive_r"],
                **{f"autocorr_lag_{lag_s:g}s": p["autocorr"][lag_s] for lag_s in LAGS_S},
            }
        out["label"] = label
        return out

    vis_lane = next(k for k in lane_keys if tuple(ARC_ROIS[k]) == ("Vis",))

    sets = {
        "across_seven_yeo_networks": summarize(
            series7, nets, "Vis",
            "all seven Yeo-7 networks — NOT what the product ships"),
        "across_four_shipped_lanes": summarize(
            series4, lane_keys, vis_lane,
            "the four lanes demo/process_batch.py ARC_ROIS actually ships"),
    }

    # --- legacy masks -------------------------------------------------------------
    legacy_files = sorted(LEGACY_MASKS.glob("roi_mask_*.npy"))
    legacy = {"present": bool(legacy_files), "dir": rel(LEGACY_MASKS), "masks": {}}
    for f in legacy_files:
        name = f.stem[len("roi_mask_"):]
        m = np.load(f)
        if m.shape != (N_VERTICES,):
            legacy["masks"][name] = {"file": rel(f), "error": f"shape {m.shape}, not ({N_VERTICES},)"}
            continue
        m = m.astype(bool)
        d_net = {n: dice(m, net_masks[n]) for n in nets}
        d_lane = {k: dice(m, lane_masks[k]) for k in lane_keys}
        best = max(d_net, key=lambda n: (d_net[n], n))
        nominal = NOMINAL_NETWORK.get(name)
        legacy["masks"][name] = {
            "file": rel(f),
            "sha256": sha256(f),
            "vertices": int(m.sum()),
            "source": "Destrieux anatomical labels (build_roi_mask.py), not Schaefer",
            "nominal_network": nominal,
            "dice_vs_nominal": d_net[nominal] if nominal else None,
            "best_match_network": best,
            "dice_vs_best_match": d_net[best],
            "name_matches_best_overlap": (nominal == best) if nominal else None,
            "dice_vs_yeo7_networks": d_net,
            "dice_vs_shipped_lanes": d_lane,
        }

    return {
        "schema_version": SCHEMA_VERSION,
        "generator": "tools/readout/lane_stats.py",
        "preds_dir": rel(preds_dir),
        "tr_seconds": TR_SECONDS,
        "atlas": atlas,
        "shipped_lanes": {
            "lanes": lanes,
            "union_vertices": int(union.sum()),
            "union_share_of_cortex": float(union.sum() / N_VERTICES),
            "pairwise_overlap_vertices": overlaps,
            "disjoint": not overlaps,
        },
        "stimuli": stimuli,
        "sets": sets,
        "legacy_roi_masks": legacy,
        "notes": {
            "sets": "Correlation, PC1, visual drive and autocorrelation are emitted TWICE — "
                    "across the seven Yeo networks and across the four shipped lanes. They are "
                    "different numbers; quote the one whose label matches the sentence.",
            "aggregation": "Aggregates are unweighted across stimuli (one stimulus, one vote), "
                           "not pooled over timepoints.",
            "stimulus_set": "Every figure here is over `preds_dir` and nothing else. "
                            "data/arcs/ is fifteen ~2-minute web clips plus four COGNIMUSE "
                            "feature films; the scored ads are in data/ads/arcs/ and are a "
                            "SEPARATE fold. Lane correlation rises with stimulus length, so a "
                            "figure quoted without its stimulus set is a figure about nothing.",
            "pc1": "pc1_share_zscored is the leading eigenvalue share of the lane CORRELATION "
                   "matrix (every lane weighted equally); pc1_share_raw is the same for the "
                   "COVARIANCE matrix (the highest-variance lane dominates).",
            "baseline": "Lanes are read as raw per-second spatial means. Correlation, PC1 and "
                        "autocorrelation are invariant to the per-lane baseline subtraction the "
                        "arc applies, so no baseline window is involved in these figures.",
            "scope": "These are properties of the predicted-response lanes over this stimulus "
                     "set. They say nothing about whether any lane predicts a commercial "
                     "outcome — see validation/recheck/B-ads-temporal/.",
            "inputs_not_committed": "/data/ is gitignored. The SHA-256 of every input is "
                                    "recorded above so this artifact can be tied to the exact "
                                    "bytes it was folded from.",
        },
    }


# ================================================================================
# serialization / check
# ================================================================================
def quantize(obj):
    """Round every float to ROUND places, recursively. One spelling per value."""
    if isinstance(obj, float):
        r = round(obj, ROUND)
        return 0.0 if r == 0 else r          # no -0.0, which serializes differently
    if isinstance(obj, dict):
        return {k: quantize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [quantize(v) for v in obj]
    return obj


def serialize(obj):
    """One spelling, so --check compares content and never formatting."""
    return json.dumps(quantize(obj), indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def diff(old, new, path=""):
    """Every leaf where the committed artifact and a fresh fold disagree."""
    out = []
    if isinstance(old, dict) and isinstance(new, dict):
        for k in sorted(set(old) | set(new)):
            p = f"{path}.{k}" if path else k
            if k not in old:
                out.append(f"{p}: absent in committed, fresh has {new[k]!r}")
            elif k not in new:
                out.append(f"{p}: committed has {old[k]!r}, absent in fresh")
            else:
                out.extend(diff(old[k], new[k], p))
    elif isinstance(old, list) and isinstance(new, list):
        if len(old) != len(new):
            out.append(f"{path}: {len(old)} entries committed, {len(new)} fresh")
        else:
            for i, (a, b) in enumerate(zip(old, new)):
                out.extend(diff(a, b, f"{path}[{i}]"))
    elif old != new:
        out.append(f"{path}: committed {old!r} != fresh {new!r}")
    return out


def headline(stats):
    s4 = stats["sets"]["across_four_shipped_lanes"]
    s7 = stats["sets"]["across_seven_yeo_networks"]
    lanes = stats["shipped_lanes"]
    return "\n".join([
        f"  stimuli            {len(stats['stimuli'])} preds files, "
        f"{sum(s['T'] for s in stats['stimuli'])} timepoints total",
        f"  4 shipped lanes    {lanes['union_vertices']} vertices "
        f"({lanes['union_share_of_cortex'] * 100:.1f}% of {N_VERTICES})",
        f"  mean off-diag r    {s4['mean_offdiag_r']['mean']:.3f} (4 lanes)   "
        f"{s7['mean_offdiag_r']['mean']:.3f} (7 networks)",
        f"  PC1 share (z)      {s4['pc1_share_zscored']['mean']:.3f} (4 lanes)   "
        f"{s7['pc1_share_zscored']['mean']:.3f} (7 networks)",
    ])


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true", help="update the artifact")
    ap.add_argument("--check", action="store_true",
                    help="fail if the committed artifact drifted from a fresh fold")
    ap.add_argument("--preds-dir", type=Path, default=PREDS_DIR,
                    help=f"stimulus set to fold (default: {PREDS_DIR.relative_to(ROOT)})")
    ap.add_argument("--out", type=Path, default=OUT,
                    help=f"artifact to write/check (default: {OUT.relative_to(ROOT)})")
    args = ap.parse_args()

    out = Path(args.out)
    stats = fold(args.preds_dir)

    if args.write:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(serialize(stats), encoding="utf-8")
        print(f"wrote {rel(out)}")
        print(headline(stats))
        return 0

    if args.check:
        if not out.exists():
            return fail(f"no {rel(out)} — the quoted lane figures have no artifact.\n"
                        "     Fix: .venv/bin/python tools/readout/lane_stats.py --write")
        fresh = serialize(stats)
        committed = out.read_text(encoding="utf-8")
        if committed != fresh:
            try:
                deltas = diff(json.loads(committed), json.loads(fresh))
            except json.JSONDecodeError as e:
                deltas = [f"committed file is not JSON ({e})"]
            print(f"\033[31mFAIL\033[0m  {rel(out)} does not match a fresh fold "
                  f"of {rel(args.preds_dir)}.", file=sys.stderr)
            for d in deltas[:40]:
                print(f"     {d}", file=sys.stderr)
            if len(deltas) > 40:
                print(f"     ... and {len(deltas) - 40} more", file=sys.stderr)
            if not deltas:
                print("     (values agree; the file's formatting differs — rewrite it)",
                      file=sys.stderr)
            print("     Fix: .venv/bin/python tools/readout/lane_stats.py --write",
                  file=sys.stderr)
            return 1
        print(f"ok    {rel(out)} matches a fresh fold of "
              f"{len(stats['stimuli'])} preds files in {rel(args.preds_dir)}")
        return 0

    print(serialize(stats), end="")
    return 0


def fail(msg):
    print(f"\033[31mFAIL\033[0m  {msg}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
