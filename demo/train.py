import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
import re
import subprocess
from pathlib import Path

import numpy as np

from process_simple import TribeConfig, TribePredictor, probe_video


SCHEMA_VERSION = "adhead-2.0"
TR_SECONDS = 1.0
HOOK_WINDOW_S = 3.0
BASELINE_LEAD_SKIP_S = 1.0
BASELINE_TAIL_SKIP_S = 3.0
BASELINE_TAIL_SPAN_S = 5.0

YEO_TAGS = ("Vis", "SomMot", "DorsAttn", "SalVentAttn", "Limbic", "Cont", "Default")
CONTROL_FEATURES = ("loudness", "cuts", "luminance", "motion")
CONTROL_NAMES = tuple(f"{name}_{stat}" for name in CONTROL_FEATURES for stat in ("mean", "trend"))
BLOCK_ORDER = ("mean", "shape", "leaky")
LAMBDAS = (0.0, 0.5, 0.8, 0.95)
ALPHAS = (0.1, 1.0, 10.0, 100.0, 1000.0)
N_BASIS_BINS = 16
NAN_DROP_FRAC = 0.05

_MONTHS = {month: i + 1 for i, month in enumerate(
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
)}


# -----------------------------------------------------------------------------
# TRIBE predictions -> network time series
# -----------------------------------------------------------------------------

def build_masks(parcel_names: np.ndarray):
    names = parcel_names.astype(str)
    masks = {}
    hashes = {}
    for tag in YEO_TAGS:
        mask = np.char.find(names, f"_{tag}_") >= 0
        if not mask.any():
            raise ValueError(f"No atlas vertices matched Yeo tag {tag!r}")
        masks[tag] = mask
        hashes[tag] = hashlib.sha1(np.packbits(mask).tobytes()).hexdigest()
    return masks, hashes


def _segment_column(segments, name):
    if segments is None:
        return None
    if hasattr(segments, "columns") and name in segments.columns:
        return segments[name].to_numpy()
    if isinstance(segments, dict) and name in segments:
        return segments[name]
    dtype = getattr(segments, "dtype", None)
    if dtype is not None and dtype.names and name in dtype.names:
        return segments[name]
    if isinstance(segments, (list, tuple)) and segments and isinstance(segments[0], dict):
        if name in segments[0]:
            return [row.get(name) for row in segments]
    return None


def timepoint_onsets(preds: np.ndarray, segments) -> np.ndarray:
    n = preds.shape[0]
    for name in ("onset", "start", "start_time", "time", "t"):
        values = _segment_column(segments, name)
        if values is not None and len(values) == n:
            values = np.asarray(values, dtype=float)
            if np.all(np.isfinite(values)):
                return values

    try:
        values = np.asarray(segments, dtype=float).squeeze()
        if values.ndim == 1 and len(values) == n and np.all(np.isfinite(values)):
            return values
        if values.ndim == 2 and values.shape[0] == n and np.all(np.isfinite(values[:, 0])):
            return values[:, 0]
    except (TypeError, ValueError):
        pass

    return np.arange(n, dtype=float) * TR_SECONDS


def lane_names():
    return [f"{tag}|{kind}" for tag in YEO_TAGS for kind in ("mag", "sgn")]


def preds_to_lanes(
    preds: np.ndarray,
    onsets: np.ndarray,
    duration: float,
    masks: dict[str, np.ndarray],
    lead_pad: float,
    lane_scale: str,
):
    content_start = lead_pad
    content_end = lead_pad + duration
    t = np.asarray(onsets, dtype=float)

    content = (t >= content_start) & (t < content_end)
    lead = (t >= BASELINE_LEAD_SKIP_S) & (t < content_start)
    tail = (
        (t >= content_end + BASELINE_TAIL_SKIP_S)
        & (t < content_end + BASELINE_TAIL_SKIP_S + BASELINE_TAIL_SPAN_S)
    )
    baseline = lead | tail

    if not content.any() or not baseline.any():
        raise ValueError(
            f"Invalid content/baseline windows: content={content.sum()}, baseline={baseline.sum()}"
        )

    lanes = {}
    abs_preds = np.abs(preds)
    for tag, mask in masks.items():
        for kind, source in (("mag", abs_preds), ("sgn", preds)):
            name = f"{tag}|{kind}"
            baseline_series = source[baseline][:, mask].mean(axis=1)
            series = source[content][:, mask].mean(axis=1) - baseline_series.mean()
            if lane_scale == "psc":
                sd = baseline_series.std()
                if sd > 1e-6:
                    series = series / sd
            lanes[name] = series

    return lanes, t[content] - content_start


# -----------------------------------------------------------------------------
# Basic audiovisual controls
# -----------------------------------------------------------------------------

def audio_loudness_per_sec(video_path: str | Path, sample_rate: int = 16_000):
    cmd = [
        "ffmpeg", "-v", "error", "-i", str(video_path),
        "-ac", "1", "-ar", str(sample_rate), "-f", "s16le", "-",
    ]
    try:
        raw = subprocess.run(cmd, capture_output=True, check=False).stdout
    except FileNotFoundError:
        return None
    if not raw:
        return None

    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    n_seconds = len(audio) // sample_rate
    if n_seconds == 0:
        return None
    audio = audio[: n_seconds * sample_rate].reshape(n_seconds, sample_rate)
    return np.sqrt((audio ** 2).mean(axis=1) + 1e-9)


def video_features_per_sec(video_path: str | Path):
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("Install opencv-python-headless to compute video controls") from exc

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    luminance, cuts, motion = {}, {}, {}
    previous = None
    frame_index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        second = int(frame_index / fps)
        gray = cv2.cvtColor(
            cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY
        ).astype(np.float32)
        luminance.setdefault(second, []).append(gray.mean() / 255.0)
        if previous is not None:
            delta = np.abs(gray - previous)
            motion.setdefault(second, []).append(delta.mean() / 255.0)
            cuts.setdefault(second, []).append((delta > 40).mean())
        previous = gray
        frame_index += 1

    cap.release()
    if not luminance:
        return None

    n = max(luminance) + 1
    aggregate = lambda values: np.array(  # noqa: E731
        [np.mean(values.get(second, [0.0])) for second in range(n)]
    )
    return aggregate(luminance), aggregate(cuts), aggregate(motion)


def _normalize(values: np.ndarray):
    values = np.asarray(values, dtype=float)
    return (values - values.min()) / (np.ptp(values) + 1e-9)


def control_series(video_path: str | Path, baseline_dir=None, ad_id=None):
    if baseline_dir and ad_id:
        csv_path = Path(baseline_dir) / f"baseline_{ad_id}.csv"
        if csv_path.exists():
            columns = {name: [] for name in CONTROL_FEATURES}
            with csv_path.open() as fh:
                for row in csv.DictReader(fh):
                    for name in CONTROL_FEATURES:
                        columns[name].append(float(row[name]))
            return {name: np.asarray(values) for name, values in columns.items()}

    video = video_features_per_sec(video_path)
    if video is None:
        return None
    luminance, cuts, motion = video

    loudness = audio_loudness_per_sec(video_path)
    n = len(luminance)
    if loudness is None or len(loudness) == 0:
        loudness = np.zeros(n)
    elif len(loudness) != n:
        loudness = np.interp(
            np.arange(n), np.linspace(0, n - 1, len(loudness)), loudness
        )

    return {
        "loudness": _normalize(loudness),
        "cuts": _normalize(cuts),
        "luminance": _normalize(luminance),
        "motion": _normalize(motion),
    }


def control_summaries(series):
    output = {}
    for name in CONTROL_FEATURES:
        values = np.asarray(series[name], dtype=float) if series else np.array([])
        if values.size < 4 or not np.all(np.isfinite(values)):
            output[f"{name}_mean"] = float("nan")
            output[f"{name}_trend"] = float("nan")
            continue
        middle = len(values) // 2
        output[f"{name}_mean"] = float(values.mean())
        output[f"{name}_trend"] = float(
            values[middle:].mean() - values[:middle].mean()
        )
    return output


# -----------------------------------------------------------------------------
# Network time series -> fixed feature vector
# -----------------------------------------------------------------------------

def _legendre_basis(n_bins=N_BASIS_BINS):
    x = np.linspace(-1.0, 1.0, n_bins)
    return np.column_stack([
        x,
        (3 * x ** 2 - 1) / 2,
        (5 * x ** 3 - 3 * x) / 2,
    ])


_LEGENDRE = _legendre_basis()


def _normalized_grid(series, n_bins=N_BASIS_BINS):
    series = np.asarray(series, dtype=float)
    if len(series) == 0:
        return np.full(n_bins, np.nan)
    if len(series) == 1:
        return np.full(n_bins, series[0])
    return np.interp(
        np.linspace(0.0, 1.0, n_bins),
        np.linspace(0.0, 1.0, len(series)),
        series,
    )


def _lag1(series):
    series = np.asarray(series, dtype=float)
    if len(series) < 3 or series[:-1].std() <= 1e-10 or series[1:].std() <= 1e-10:
        return float("nan")
    return float(np.corrcoef(series[:-1], series[1:])[0, 1])


def _leaky(series, lam):
    series = np.asarray(series, dtype=float)
    if len(series) == 0:
        return float("nan")
    if lam == 0:
        return float(np.nanmean(series))
    state = 0.0
    states = []
    for value in series:
        if np.isfinite(value):
            state = lam * state + (1 - lam) * value
            states.append(state)
    return float(np.mean(states)) if states else float("nan")


def feature_row(feature, blocks, lam, has_age, log_age=None):
    values = []
    names = []
    times = np.asarray(feature["times"], dtype=float)

    for lane_name in lane_names():
        series = np.asarray(feature["lanes"][lane_name], dtype=float)

        if "mean" in blocks:
            values.extend([
                float(np.nanmean(series)),
                float(np.nanmean(series[times < HOOK_WINDOW_S])),
            ])
            names.extend([f"{lane_name}.mean", f"{lane_name}.hook"])

        if "shape" in blocks:
            grid = _normalized_grid(series)
            centered = grid - np.nanmean(grid)
            for i, basis in enumerate(_LEGENDRE.T, start=1):
                values.append(float(basis @ centered / (basis @ basis)))
                names.append(f"{lane_name}.L{i}")

        if "leaky" in blocks:
            values.extend([_lag1(series), _leaky(series, lam)])
            names.extend([f"{lane_name}.ac1", f"{lane_name}.leak"])

    covariates = feature["covariates"]
    values.extend([covariates["duration_s"], covariates["n_sec"]])
    names.extend(["cov.duration_s", "cov.n_sec"])

    if has_age:
        values.append(float(log_age) if log_age is not None else float("nan"))
        names.append("cov.log_age")

    for name in CONTROL_NAMES:
        values.append(float(covariates.get(name, float("nan"))))
        names.append(f"cov.{name}")

    return np.asarray(values, dtype=float), names


def extract_features(
    video_path: str | Path,
    predictor: TribePredictor,
    masks,
    *,
    baseline_audio="dither",
    baseline_dir=None,
    lane_scale="raw",
    force=False,
    ad_id=None,
):
    video_path = Path(video_path)
    ad_id = ad_id or video_path.stem
    spec = probe_video(video_path)
    duration = float(spec.duration)
    if duration <= 0:
        raise ValueError(f"Could not determine video duration for {video_path}")

    preds, segments = predictor.predict_video(
        video_path,
        mode="full",
        baseline_audio=baseline_audio,
        force_rerun=force,
    )
    preds = np.asarray(preds, dtype=float)
    if preds.ndim != 2 or preds.shape[1] != predictor.n_vertices:
        raise ValueError(
            f"{ad_id}: predictions have shape {preds.shape}; "
            f"expected (T, {predictor.n_vertices})"
        )
    if not np.isfinite(preds).all():
        raise ValueError(f"{ad_id}: predictions contain NaN or Inf")

    onsets = timepoint_onsets(preds, segments)
    lanes, times = preds_to_lanes(
        preds,
        onsets,
        duration,
        masks,
        predictor.config.lead_pad,
        lane_scale,
    )
    controls = control_summaries(control_series(video_path, baseline_dir, ad_id))
    controls.update({"duration_s": duration, "n_sec": float(len(times))})

    return {
        "ad_id": ad_id,
        "video": str(video_path.resolve()),
        "lanes": {name: values.tolist() for name, values in lanes.items()},
        "times": times.tolist(),
        "covariates": controls,
    }


# -----------------------------------------------------------------------------
# Labels
# -----------------------------------------------------------------------------

def parse_note(note):
    advertiser = None
    start = None

    match = re.search(r"page_([^;]+)", note or "")
    if match:
        advertiser = match.group(1).strip()

    match = re.search(r"start_([A-Za-z]{3})_(\d{1,2})_(\d{4})", note or "")
    if match and match.group(1) in _MONTHS:
        try:
            start = dt.date(
                int(match.group(3)),
                _MONTHS[match.group(1)],
                int(match.group(2)),
            )
        except ValueError:
            pass

    return advertiser, start


def load_labels(corpus_dir, target, as_of):
    filename = {
        "meta": "ad_manifest_meta.csv",
        "tiktok": "ad_manifest_tiktok.csv",
    }[target]
    path = Path(corpus_dir) / filename
    labels = []

    with path.open() as fh:
        for row in csv.DictReader(fh):
            try:
                outcome = float(row["outcome"])
            except (KeyError, TypeError, ValueError):
                continue

            ad_id = row["ad_id"].strip()
            advertiser, start = parse_note(row.get("note", ""))
            label = {
                "ad_id": ad_id,
                "advertiser": advertiser or f"__solo__{ad_id}",
            }

            if target == "meta":
                age = (as_of - start).days if start else None
                label.update({
                    "y": math.log1p(outcome),
                    "log_age": math.log(max(age, 1)) if age is not None else float("nan"),
                })
            else:
                label.update({"y": outcome, "log_age": float("nan")})

            labels.append(label)

    if not labels:
        raise ValueError(f"No usable labels found in {path}")
    return labels


def find_video(corpus_dir, ad_id):
    videos = Path(corpus_dir) / "videos"
    for extension in (".mp4", ".mov", ".webm", ".m4v", ".mkv"):
        path = videos / f"{ad_id}{extension}"
        if path.exists():
            return path
    return None


# -----------------------------------------------------------------------------
# Ridge model and grouped validation
# -----------------------------------------------------------------------------

def _rankdata(values):
    values = np.asarray(values, dtype=float)
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(len(values), dtype=float)
    sorted_values = values[order]
    i = 0
    while i < len(values):
        j = i
        while j + 1 < len(values) and sorted_values[j + 1] == sorted_values[i]:
            j += 1
        ranks[order[i:j + 1]] = 0.5 * (i + j) + 1.0
        i = j + 1
    return ranks


def pearson(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if len(x) < 3 or x.std() <= 1e-10 or y.std() <= 1e-10:
        return float("nan")
    return float(np.corrcoef(x, y)[0, 1])


def spearman(x, y):
    return pearson(_rankdata(x), _rankdata(y))


def residualize(y, controls):
    controls = np.asarray(controls, dtype=float)
    design = np.column_stack([np.ones(len(y)), controls])
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    return y - design @ beta


def partial_spearman(x, y, controls):
    ranked_controls = np.column_stack([
        _rankdata(controls[:, i]) for i in range(controls.shape[1])
    ])
    return pearson(
        residualize(_rankdata(x), ranked_controls),
        residualize(_rankdata(y), ranked_controls),
    )


def ridge_fit(X, y, alpha):
    x_mean = X.mean(axis=0)
    y_mean = y.mean()
    centered_x = X - x_mean
    centered_y = y - y_mean
    weights = np.linalg.solve(
        centered_x.T @ centered_x + alpha * np.eye(X.shape[1]),
        centered_x.T @ centered_y,
    )
    return weights, float(y_mean - x_mean @ weights)


def standardize(X_train, X_test):
    mean = np.nanmean(X_train, axis=0)
    mean = np.where(np.isfinite(mean), mean, 0.0)
    sd = np.nanstd(X_train, axis=0)
    sd = np.where(np.isfinite(sd) & (sd > 1e-9), sd, 1.0)

    def transform(values):
        return (np.where(np.isnan(values), mean, values) - mean) / sd

    return transform(X_train), transform(X_test), mean, sd


def group_kfold(groups, n_splits):
    unique, counts = np.unique(groups, return_counts=True)
    n_splits = min(n_splits, len(unique))
    if n_splits < 2:
        raise ValueError("Grouped cross-validation requires at least two advertisers")
    order = np.argsort(-counts, kind="stable")
    sizes = np.zeros(n_splits, dtype=int)
    fold_for_group = {}

    for index in order:
        fold = int(np.argmin(sizes))
        fold_for_group[unique[index]] = fold
        sizes[fold] += counts[index]

    assignments = np.array([fold_for_group[group] for group in groups])
    return [
        (np.where(assignments != fold)[0], np.where(assignments == fold)[0])
        for fold in range(n_splits)
    ]


def fit_fold(X, y, train, test, alpha):
    X_train, X_test, _, _ = standardize(X[train], X[test])
    weights, intercept = ridge_fit(X_train, y[train], alpha)
    return X_test @ weights + intercept


def choose_alpha(X, y, groups, train_indices):
    local_groups = groups[train_indices]
    n_splits = min(4, len(np.unique(local_groups)))
    if n_splits < 2:
        return ALPHAS[len(ALPHAS) // 2]

    splits = group_kfold(local_groups, n_splits)
    best_alpha = ALPHAS[0]
    best_score = -np.inf

    for alpha in ALPHAS:
        predictions = []
        targets = []
        for train, test in splits:
            if len(train) < 5 or len(test) < 3:
                continue
            predictions.append(fit_fold(
                X[train_indices], y[train_indices], train, test, alpha
            ))
            targets.append(y[train_indices][test])
        if predictions:
            score = spearman(np.concatenate(predictions), np.concatenate(targets))
            if np.isfinite(score) and score > best_score:
                best_score = score
                best_alpha = alpha

    return best_alpha


def cross_validate(X, y, groups, splits):
    predictions = np.full(len(y), np.nan)
    fold_metrics = []

    for fold, (train, test) in enumerate(splits):
        if len(train) < 10 or len(test) < 3:
            continue
        alpha = choose_alpha(X, y, groups, train)
        predictions[test] = fit_fold(X, y, train, test, alpha)
        fold_metrics.append({
            "fold": fold,
            "n_test": int(len(test)),
            "alpha": alpha,
            "rho": spearman(predictions[test], y[test]),
        })

    return predictions, fold_metrics


def build_design(features, labels, blocks, lam, has_age):
    rows, y, groups, ad_ids = [], [], [], []
    names = None

    for label in labels:
        feature = features.get(label["ad_id"])
        if feature is None:
            continue
        row, row_names = feature_row(
            feature,
            blocks,
            lam,
            has_age,
            label["log_age"] if has_age else None,
        )
        rows.append(row)
        names = names or row_names
        y.append(label["y"])
        groups.append(label["advertiser"])
        ad_ids.append(label["ad_id"])

    if not rows:
        raise ValueError("No ads have both extracted features and labels")

    return (
        np.vstack(rows),
        np.asarray(y, dtype=float),
        np.asarray(groups),
        names,
        ad_ids,
    )


def drop_sparse_columns(X, names):
    keep = np.isnan(X).mean(axis=0) <= NAN_DROP_FRAC
    return X[:, keep], [name for name, use in zip(names, keep) if use]


# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

def make_predictor(cache_dir, model=None):
    values = (model or {}).get("tribe", {})
    config = TribeConfig(
        cache_dir=Path(cache_dir),
        hook_duration=float(values.get("hook_duration", 3.0)),
        lead_pad=float(values.get("lead_pad", 5.0)),
        tail_pad=float(values.get("tail_pad", 8.0)),
        min_stimulus_duration=float(values.get("min_stimulus_duration", 30.0)),
        audio_rate=int(values.get("audio_rate", 48_000)),
    )
    return TribePredictor(config)


def command_features(args):
    predictor = make_predictor(args.cache_dir)
    masks, _ = build_masks(predictor.parcel_names)
    feature = extract_features(
        args.video,
        predictor,
        masks,
        baseline_audio=args.baseline_audio,
        baseline_dir=args.baseline_dir,
        lane_scale=args.lane_scale,
        force=args.force,
        ad_id=args.ad_id,
    )
    output = args.out or f"{feature['ad_id']}_features.json"
    Path(output).write_text(json.dumps(feature, indent=2))
    print(f"wrote {output}")


def command_train(args):
    as_of = dt.date.fromisoformat(args.as_of) if args.as_of else dt.date.today()
    labels = load_labels(args.corpus, args.target, as_of)
    has_age = args.target == "meta"

    predictor = make_predictor(args.cache_dir)
    masks, mask_hashes = build_masks(predictor.parcel_names)

    features = {}
    for index, label in enumerate(labels, start=1):
        video = find_video(args.corpus, label["ad_id"])
        if video is None:
            continue
        try:
            features[label["ad_id"]] = extract_features(
                video,
                predictor,
                masks,
                baseline_audio=args.baseline_audio,
                baseline_dir=args.baseline_dir,
                lane_scale=args.lane_scale,
                force=args.force,
                ad_id=label["ad_id"],
            )
            print(f"[{index}/{len(labels)}] {label['ad_id']}")
        except (ValueError, OSError, RuntimeError) as exc:
            print(f"skipping {label['ad_id']}: {exc}")

    blocks = BLOCK_ORDER[: BLOCK_ORDER.index(args.temporal) + 1]
    best = None

    for lam in LAMBDAS if "leaky" in blocks else (0.0,):
        X, y, groups, names, ad_ids = build_design(features, labels, blocks, lam, has_age)
        X, names = drop_sparse_columns(X, names)
        splits = group_kfold(groups, args.folds)
        oof, folds = cross_validate(X, y, groups, splits)
        valid = np.isfinite(oof)
        score = spearman(oof[valid], y[valid])
        if best is None or (
            np.isfinite(score)
            and (not np.isfinite(best["score"]) or score > best["score"])
        ):
            best = {
                "X": X, "y": y, "groups": groups, "names": names,
                "ad_ids": ad_ids, "oof": oof, "folds": folds,
                "splits": splits, "lambda": lam, "score": score,
            }

    X = best["X"]
    y = best["y"]
    names = best["names"]
    groups = best["groups"]
    valid = np.isfinite(best["oof"])

    covariate_indices = [i for i, name in enumerate(names) if name.startswith("cov.")]
    controls = X[:, covariate_indices]
    control_means = np.nanmean(controls, axis=0)
    control_means = np.where(np.isfinite(control_means), control_means, 0.0)
    controls_clean = np.where(np.isnan(controls), control_means, controls)
    control_oof, _ = cross_validate(controls, y, groups, best["splits"])
    valid_control = np.isfinite(control_oof)

    rho = spearman(best["oof"][valid], y[valid])
    rho_controls = spearman(control_oof[valid_control], y[valid_control])
    rho_partial = partial_spearman(
        best["oof"][valid], y[valid], controls_clean[valid]
    )

    alpha = choose_alpha(X, y, groups, np.arange(len(y)))
    standardized, _, mean, sd = standardize(X, X)
    weights, intercept = ridge_fit(standardized, y, alpha)

    model = {
        "schema": SCHEMA_VERSION,
        "target": args.target,
        "yardstick": "log1p(days_running)" if has_age else "CTR percentile",
        "blocks": list(blocks),
        "lambda": best["lambda"],
        "alpha": alpha,
        "lane_scale": args.lane_scale,
        "baseline_audio": args.baseline_audio,
        "has_age": has_age,
        "feature_names": names,
        "feature_mean": mean.tolist(),
        "feature_sd": sd.tolist(),
        "weights": weights.tolist(),
        "intercept": intercept,
        "covariate_medians": {
            name: float(np.nanmedian(X[:, i]))
            for i, name in enumerate(names)
            if name.startswith("cov.")
        },
        "mask_sha1": mask_hashes,
        "tribe": {
            "hook_duration": predictor.config.hook_duration,
            "lead_pad": predictor.config.lead_pad,
            "tail_pad": predictor.config.tail_pad,
            "min_stimulus_duration": predictor.config.min_stimulus_duration,
            "audio_rate": predictor.config.audio_rate,
        },
        "validation": {
            "n": int(valid.sum()),
            "rho": None if not np.isfinite(rho) else round(rho, 4),
            "rho_partial": None if not np.isfinite(rho_partial) else round(rho_partial, 4),
            "rho_controls": None if not np.isfinite(rho_controls) else round(rho_controls, 4),
            "folds": best["folds"],
            "as_of": str(as_of),
        },
    }

    output = Path(args.out or Path(args.cache_dir) / f"ad_head_{args.target}.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(model, indent=2))

    print(f"n={valid.sum()} rho={rho:+.3f} partial={rho_partial:+.3f} controls={rho_controls:+.3f}")
    print(f"wrote {output}")


def command_predict(args):
    model = json.loads(Path(args.model).read_text())
    if model.get("schema") != SCHEMA_VERSION:
        raise ValueError(f"Expected model schema {SCHEMA_VERSION}")

    predictor = make_predictor(args.cache_dir, model)
    masks, mask_hashes = build_masks(predictor.parcel_names)
    if mask_hashes != model["mask_sha1"]:
        raise ValueError("Atlas masks differ from the masks used during training")

    feature = extract_features(
        args.video,
        predictor,
        masks,
        baseline_audio=model["baseline_audio"],
        baseline_dir=args.baseline_dir,
        lane_scale=model["lane_scale"],
        force=args.force,
        ad_id=args.ad_id,
    )

    log_age = None
    if model["has_age"]:
        log_age = model["covariate_medians"]["cov.log_age"]

    row, names = feature_row(
        feature,
        tuple(model["blocks"]),
        model["lambda"],
        model["has_age"],
        log_age,
    )
    index = {name: i for i, name in enumerate(names)}
    missing = [name for name in model["feature_names"] if name not in index]
    if missing:
        raise ValueError(f"Missing model features: {missing[:3]}")

    values = np.array([row[index[name]] for name in model["feature_names"]], dtype=float)
    mean = np.asarray(model["feature_mean"], dtype=float)
    sd = np.asarray(model["feature_sd"], dtype=float)
    values = np.where(np.isnan(values), mean, values)
    score = float(((values - mean) / sd) @ np.asarray(model["weights"]) + model["intercept"])

    output = {
        "ad_id": feature["ad_id"],
        "score": score,
        "target": model["target"],
        "yardstick": model["yardstick"],
        "validation": model["validation"],
    }
    print(json.dumps(output, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps(output, indent=2))


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

def add_common_arguments(parser):
    parser.add_argument("--cache-dir", default="data/ad_head")
    parser.add_argument("--baseline-dir")
    parser.add_argument("--baseline-audio", choices=("silence", "dither"), default="dither")
    parser.add_argument("--lane-scale", choices=("raw", "psc"), default="raw")
    parser.add_argument("--force", action="store_true")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    features = commands.add_parser("features")
    features.add_argument("--video", required=True)
    features.add_argument("--ad-id")
    features.add_argument("--out")
    add_common_arguments(features)

    train = commands.add_parser("train")
    train.add_argument("--corpus", required=True)
    train.add_argument("--target", choices=("meta", "tiktok"), default="meta")
    train.add_argument("--temporal", choices=BLOCK_ORDER, default="shape")
    train.add_argument("--folds", type=int, default=5)
    train.add_argument("--as-of", help="YYYY-MM-DD; defaults to today")
    train.add_argument("--out")
    add_common_arguments(train)

    predict = commands.add_parser("predict")
    predict.add_argument("--video", required=True)
    predict.add_argument("--model", required=True)
    predict.add_argument("--ad-id")
    predict.add_argument("--out")
    predict.add_argument("--cache-dir", default="data/ad_head")
    predict.add_argument("--baseline-dir")
    predict.add_argument("--force", action="store_true")

    args = parser.parse_args()
    if args.command == "features":
        command_features(args)
    elif args.command == "train":
        command_train(args)
    else:
        command_predict(args)


if __name__ == "__main__":
    main()
