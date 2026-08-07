import csv
import datetime as dt
import hashlib
import json
import math
import os
import re
import subprocess
from pathlib import Path

import joblib
import numpy as np
from neuralset.segments import Segment

from scipy.stats import spearmanr
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import make_scorer
from sklearn.model_selection import GridSearchCV, GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from process_simple import TribeConfig, TribePredictor, probe_video


YEO_TAGS = ("Vis", "SomMot", "DorsAttn", "SalVentAttn", "Limbic", "Cont", "Default")
CONTROL_NAMES = ("loudness", "cuts", "luminance", "motion")
HOOK_WINDOW_S = 3.0
BASELINE_LEAD_SKIP_S = 1.0
BASELINE_TAIL_SKIP_S = 3.0
BASELINE_TAIL_SPAN_S = 5.0
ALPHAS = (0.1, 1.0, 10.0, 100.0, 1000.0)
VIDEO_EXTENSIONS = (".mp4", ".mov", ".webm", ".m4v", ".mkv")
MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}

LANE_NAMES = tuple(
    f"{tag}|{kind}"
    for tag in YEO_TAGS
    for kind in ("mag", "sgn")
)


def build_masks(
    parcel_names: np.ndarray,
) -> dict[str, np.ndarray]:
    names = parcel_names.astype(str)
    return {tag: np.char.find(names, f"_{tag}_") >= 0 for tag in YEO_TAGS}


def preds_to_lanes(
    preds: np.ndarray,  # t x 20484
    segments: list[Segment],
    duration: float,
    masks: dict[str, np.ndarray],
    lead_pad: float,
    standardize: bool = False,
):
    # baseline are periods of black screen to measure "empty" brain activity from
    times = np.fromiter((segment.start for segment in segments), dtype=float)
    content_end = lead_pad + duration
    content = (times >= lead_pad) & (times < content_end)
    baseline = (
        ((times >= BASELINE_LEAD_SKIP_S) & (times < lead_pad)) |
        (
            (times >= content_end + BASELINE_TAIL_SKIP_S)
            & (
                times
                < content_end
                + BASELINE_TAIL_SKIP_S
                + BASELINE_TAIL_SPAN_S
            )
        )
    )

    if not content.any() or not baseline.any():
        raise ValueError("Content or baseline window is empty")

    # calculating network activity
    lanes = {}
    for tag, mask in masks.items():  # loop through 7 yeo brain networks
        signed = preds[:, mask].mean(axis=1)
        magnitude = np.abs(preds[:, mask]).mean(axis=1)

        for kind, roi_series in (("mag", magnitude), ("sgn", signed)):
            # subtract by baseline
            baseline_series = roi_series[baseline]
            lane = (roi_series[content] - baseline_series.mean())
            if standardize:
                baseline_sd = baseline_series.std()
                if baseline_sd <= 1e-6:
                    raise ValueError(f"{tag}|{kind} has zero baseline variance")
                lane = lane / baseline_sd
            lanes[f"{tag}|{kind}"] = lane

    return lanes, times[content] - lead_pad


def _per_second(values, seconds, n):
    sums = np.bincount(seconds, weights=values, minlength=n)
    counts = np.bincount(seconds, minlength=n)
    return sums / np.maximum(counts, 1)


def _normalize(values):
    values = np.asarray(values, float)
    return (values - values.min()) / (np.ptp(values) + 1e-9)


def _summaries(values):
    values = np.asarray(values, float)
    if len(values) < 4:
        return float("nan"), float("nan")
    middle = len(values) // 2
    return float(values.mean()), float(values[middle:].mean() - values[:middle].mean())


def control_features(video_path: str | Path, baseline_dir=None, ad_id=None):
    # add loudness, cuts, luminance, motion features to model

    if baseline_dir and ad_id:
        path = Path(baseline_dir) / f"baseline_{ad_id}.csv"
        if path.exists():
            with path.open() as fh:
                rows = list(csv.DictReader(fh))
            return {
                f"{name}_{stat}": value
                for name in CONTROL_NAMES
                for stat, value in zip(("mean", "trend"), _summaries([float(r[name]) for r in rows]))
            }

    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("Install opencv-python-headless to compute video controls") from exc

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    lum, lum_sec, cuts, cut_sec, motion, motion_sec = [], [], [], [], [], []
    previous = None
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        second = int(i / fps)
        gray = cv2.cvtColor(cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY).astype(float)
        lum.append(gray.mean() / 255.0)
        lum_sec.append(second)
        if previous is not None:
            delta = np.abs(gray - previous)
            cuts.append((delta > 40).mean())
            cut_sec.append(second)
            motion.append(delta.mean() / 255.0)
            motion_sec.append(second)
        previous = gray
        i += 1
    cap.release()
    if not lum:
        return {f"{name}_{stat}": float("nan") for name in CONTROL_NAMES for stat in ("mean", "trend")}

    n = max(lum_sec) + 1
    series = {
        "luminance": _per_second(lum, lum_sec, n),
        "cuts": _per_second(cuts, cut_sec, n),
        "motion": _per_second(motion, motion_sec, n),
    }

    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video_path), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
        capture_output=True,
        check=False,
    ).stdout
    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    loudness = np.sqrt((audio[: len(audio) // 16000 * 16000].reshape(-1, 16000) ** 2).mean(1) + 1e-9) if len(audio) >= 16000 else np.zeros(n)
    if len(loudness) != n:
        loudness = np.interp(np.arange(n), np.linspace(0, n - 1, max(len(loudness), 1)), loudness if len(loudness) else [0.0])
    series["loudness"] = loudness

    return {
        f"{name}_{stat}": value
        for name, values in series.items()
        for stat, value in zip(("mean", "trend"), _summaries(_normalize(values)))
    }


def feature_vector(
    lanes,
    times: np.ndarray,
    duration: float,
    controls,
    log_age: float = float("nan"),
):
    values, names = [], []
    hook = times < HOOK_WINDOW_S
    for name in LANE_NAMES:
        series = lanes[name]
        values += [float(series.mean()), float(series[hook].mean())]
        names += [f"{name}.mean", f"{name}.hook"]

    values += [duration, log_age]
    names += ["cov.duration_s", "cov.log_age"]
    for name in CONTROL_NAMES:
        for stat in ("mean", "trend"):
            key = f"{name}_{stat}"
            values.append(controls.get(key, float("nan")))
            names.append(f"cov.{key}")
    return np.asarray(values, float), names


def extract_features(
    video_path: str | Path,
    predictor: TribePredictor,
    masks,
    *,
    log_age=float("nan"),
    baseline_dir=None,
    baseline_audio="dither",
    standardize_lanes=False,
    force=False,
    ad_id=None,
):
    video_path = Path(video_path)
    ad_id = ad_id or video_path.stem
    duration = float(probe_video(video_path).duration)
    preds, segments = predictor.predict_video(
        video_path,
        mode="full",
        baseline_audio=baseline_audio,
        force_rerun=force,
    )
    lanes, times = preds_to_lanes(
        np.asarray(preds), segments, duration, masks,
        predictor.config.lead_pad, standardize_lanes,
    )
    return feature_vector(
        lanes, times, duration,
        control_features(video_path, baseline_dir, ad_id),
        log_age,
    )


def load_labels(corpus_dir: str | Path, target: str, as_of: dt.date):
    path = Path(corpus_dir) / f"ad_manifest_{target}.csv"
    labels = []
    with path.open() as fh:
        for row in csv.DictReader(fh):
            try:
                ad_id, outcome = row["ad_id"].strip(), float(row["outcome"])
            except (KeyError, TypeError, ValueError):
                continue
            note = row.get("note", "")
            advertiser = (re.search(r"page_([^;]+)", note) or [None, f"__solo__{ad_id}"])[1].strip()
            start_match = re.search(r"start_([A-Za-z]{3})_(\d{1,2})_(\d{4})", note)
            start = None
            if start_match and start_match[1] in MONTHS:
                try:
                    start = dt.date(int(start_match[3]), MONTHS[start_match[1]], int(start_match[2]))
                except ValueError:
                    pass
            labels.append({
                "ad_id": ad_id,
                "advertiser": advertiser,
                "y": math.log1p(outcome) if target == "meta" else outcome,
                "log_age": math.log(max((as_of - start).days, 1)) if target == "meta" and start else float("nan"),
            })
    return labels


def find_video(corpus_dir: str | Path, ad_id: str):
    root = Path(corpus_dir) / "videos"
    return next((root / f"{ad_id}{ext}" for ext in VIDEO_EXTENSIONS if (root / f"{ad_id}{ext}").exists()), None)


def make_predictor(cache_dir: str | Path, saved_config=None):
    return TribePredictor(TribeConfig(cache_dir=Path(cache_dir), **(saved_config or {})))


def make_model(cv):
    pipeline = make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True), StandardScaler(), Ridge())
    scorer = make_scorer(lambda y, p: np.nan_to_num(spearmanr(y, p).statistic))
    return GridSearchCV(pipeline, {"ridge__alpha": ALPHAS}, cv=cv, scoring=scorer)


def fit_model(X, y, groups, folds=5):
    n_folds = min(folds, len(np.unique(groups)))
    outer = GroupKFold(n_splits=n_folds)
    oof = np.full(len(y), np.nan)

    for train, test in outer.split(X, y, groups):
        inner = GroupKFold(n_splits=min(4, len(np.unique(groups[train]))))
        model = make_model(inner)
        model.fit(X[train], y[train], groups=groups[train])
        oof[test] = model.predict(X[test])

    final = make_model(GroupKFold(n_splits=n_folds))
    final.fit(X, y, groups=groups)
    return final.best_estimator_, float(spearmanr(y, oof).statistic), float(final.best_params_["ridge__alpha"])


def build_dataset(labels, corpus_dir, predictor, masks, args):
    X, y, groups, names = [], [], [], None
    for i, label in enumerate(labels, 1):
        video = find_video(corpus_dir, label["ad_id"])
        if video is None:
            continue
        try:
            row, row_names = extract_features(
                video, predictor, masks,
                log_age=label["log_age"],
                baseline_dir=args.baseline_dir,
                baseline_audio=args.baseline_audio,
                standardize_lanes=args.standardize_lanes,
                force=args.force,
                ad_id=label["ad_id"],
            )
            X.append(row)
            y.append(label["y"])
            groups.append(label["advertiser"])
            names = row_names
            print(f"[{i}/{len(labels)}] {label['ad_id']}")
        except Exception as exc:
            print(f"skipping {label['ad_id']}: {exc}")
    if not X:
        raise ValueError("No videos produced usable features")
    return np.vstack(X), np.asarray(y), np.asarray(groups), names



