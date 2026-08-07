import sys
import json
import pickle
import hashlib
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import nibabel as nib
from neuralset.segments import Segment
from neuralset.events.utils import standardize_events
from neuralset.events.transforms import (
    ExtractAudioFromVideo, ChunkEvents,
    AddText, AddSentenceToWords, AddContextToWords,
    RemoveMissing,
)
from tribev2.eventstransforms import ExtractWordsFromAudio
from tribev2.demo_utils import TribeModel


_MPS_PATCHED = False


def _force_extractors_to_mps():
    """Route neuralset feature extractors onto Apple MPS.

    The pretrained TRIBE config pins each extractor to ``device: cuda`` and the
    extractor ``device`` field is a pydantic ``Literal`` (auto/cpu/cuda/accelerate),
    so ``"mps"`` cannot be supplied through config. Instead we wrap ``model_post_init``
    on every extractor class that owns a ``device`` field and, after the original
    (which resolves e.g. auto->cpu) runs, overwrite the resolved device with ``"mps"``.
    pydantic invokes only the most-derived ``model_post_init`` last, so this wins over
    any ancestor resolution. Set ``PYTORCH_ENABLE_MPS_FALLBACK=1`` so ops MPS lacks
    fall back to CPU rather than raising.
    """
    global _MPS_PATCHED
    if _MPS_PATCHED:
        return []
    from neuralset.extractors import audio as _a, video as _v, base as _b

    def _wrap(orig):
        def model_post_init(self, context):
            out = orig(self, context)
            # bypass pydantic validation (the Literal forbids "mps") by writing __dict__
            object.__setattr__(self, "device", "mps")
            return out
        return model_post_init

    patched = []
    for mod in (_a, _v, _b):
        for name in dir(mod):
            cls = getattr(mod, name)
            if (
                isinstance(cls, type)
                and "model_post_init" in cls.__dict__
                and "device" in getattr(cls, "model_fields", {})
            ):
                cls.model_post_init = _wrap(cls.__dict__["model_post_init"])
                patched.append(f"{mod.__name__.split('.')[-1]}.{name}")
    _MPS_PATCHED = True
    return patched


# HF_MODEL = "facebook/tribev2"
# HOOK_WINDOW_SECONDS = 3.0
# LEAD_PAD_SECONDS = 5.0
# TAIL_PAD_SECONDS = 8.0
# AUDIO_RATE = 48000

# MODEL = TribeModel.from_pretrained(
#     HF_MODEL,
#     cache_model=Path("./cache"),
#     config_update={
#         "data": {
#             "features_to_use": ["audio", "video"],
#         }
#     }
# )


# def load_parcel_names(cache_dir):
#     cbig = ("https://raw.githubusercontent.com/ThomasYeoLab/CBIG/master/"
#              "stable_projects/brain_parcellation/Schaefer2018_LocalGlobal/"
#              "Parcellations/FreeSurfer5.3/fsaverage5/label")
#     annot = {h: f"{cbig}/{h}.Schaefer2018_400Parcels_7Networks_order.annot" for h in ("lh", "rh")}
#     d = Path(cache_dir) / "atlas"
#     d.mkdir(parents=True, exist_ok=True)
#     out = []
#     for hemisphere in ("lh", "rh"):
#         path = d / Path(annot[hemisphere]).name
#         if not path.exists():
#             import urllib.request
#             print(f"  downloading {path.name} ...")
#             urllib.request.urlretrieve(annot[hemisphere], path)
#         vert_labels, _, names = nib.freesurfer.read_annot(str(path))
#         parcel = [n.decode() if isinstance(n, bytes) else n for n in names]
#         out.extend(parcel[v] for v in vert_labels)   # label 0 = medial wall
#     return np.array(out)


# PARCEL_NAMES = load_parcel_names("./cache")
# N_VERTICES = PARCEL_NAMES.shape[0]


@dataclass
class Ad:
    ad_id: str
    filename: str
    path: str
    width: int = 0
    height: int = 0
    fps: float = 30.0
    duration: float = 0.0
    has_audio: bool = False

def content_duration(ad: Ad, mode: str, hook_window_seconds: float):
    return min(hook_window_seconds, ad.duration) if mode == "hook" else ad.duration


def build_stimulus(
    ad: Ad,
    output_path: Path,
    mode: str,
    tail_pad: float,
    audio_rate: float,
    lead_pad_seconds: float,
    hook_duration: float,
    baseline_audio: str = "silence",
) -> Path:
    # build output path
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # extract metadata for ffmpeg
    content_dur = content_duration(ad, mode, hook_duration)
    w, h, fps = ad.width, ad.height, ad.fps
    vpad = f"color=c=black:s={w}x{h}:r={fps}"

    # ml audio pipelines run audio normalization (x - mu) / std.dev
    # making really quiet noise (0.0002) makes it so that division by zero error doesn't happen
    if baseline_audio == "dither":
        apad =  "anoisesrc=amplitude=0.0002:color=white:sample_rate=%d" % audio_rate
    else:
        apad = f"anullsrc=channel_layout=stereo:sample_rate={audio_rate}"
    # force the generated padding to match the specs of the video
    afmt = f"aformat=sample_fmts=fltp:sample_rates={audio_rate}:channel_layouts=stereo"

    # tail pad is dynamic because tribe expects min_duration
    # so tail_pad is dynamically calculated
    cmd = ["ffmpeg", "-y", "-v", "error",
           "-i", str(ad.path),                                          # 0 source video
           "-f", "lavfi", "-t", f"{lead_pad_seconds}", "-i", vpad,      # 1 lead video
           "-f", "lavfi", "-t", f"{lead_pad_seconds}", "-i", apad,      # 2 lead audio
           "-f", "lavfi", "-t", f"{tail_pad}", "-i", vpad,              # 3 tail video
           "-f", "lavfi", "-t", f"{tail_pad}", "-i", apad]              # 4 tail audio
    if not ad.has_audio:
        cmd += ["-f", "lavfi", "-t", f"{content_dur}", "-i", apad]   # 5 silent content audio

    vtrim = f"trim=0:{content_dur}," if mode == "hook" else ""
    atrim = f"atrim=0:{content_dur}," if mode == "hook" else ""
    audio_src = "[5:a]" + afmt if not ad.has_audio else f"[0:a]{atrim}asetpts=PTS-STARTPTS,{afmt}"

    graph = (
        f"[0:v]{vtrim}setpts=PTS-STARTPTS,fps={fps},scale={w}:{h},setsar=1,format=yuv420p[vc];"
        f"{audio_src}[ac];"
        f"[1:v]fps={fps},scale={w}:{h},setsar=1,format=yuv420p[vl];"
        f"[2:a]{afmt}[al];"
        f"[3:v]fps={fps},scale={w}:{h},setsar=1,format=yuv420p[vt];"
        f"[4:a]{afmt}[at];"
        f"[vl][al][vc][ac][vt][at]concat=n=3:v=1:a=1[v][a]"
    )
    cmd += ["-filter_complex", graph, "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", str(audio_rate), "-ac", "2",
            "-movflags", "+faststart", str(output_path)]

    # run ffmpeg command
    try:
        subprocess.run(cmd, capture_output=True, check=True, text=True)
    except subprocess.CalledProcessError as e:
        output_path.unlink(missing_ok=True)
        sys.exit(f"ffmpeg failed building {mode} stimulus for {ad.filename}:\n{e.stderr}")
    except FileNotFoundError:
        sys.exit("ffmpeg not found on PATH — required to build padded stimuli.")

    return output_path


def build_events(video_path, trimodal=False):
    # this function runs because tribev2 expects data
    # in a certain format

    transforms = [
        ExtractAudioFromVideo(),
        ChunkEvents(event_type_to_chunk="Audio", max_duration=60, min_duration=30),
        ChunkEvents(event_type_to_chunk="Video", max_duration=60, min_duration=30),
    ]
    if trimodal:
        transforms += [
            ExtractWordsFromAudio(),
            AddText(),
            AddSentenceToWords(max_unmatched_ratio=0.05),
            AddContextToWords(sentence_only=False, max_context_len=1024, split_field=""),
            RemoveMissing(),
        ]

    # apply transforms
    initial = {
        "type" : "Video",
        "filepath" : str(video_path),
        "start" : 0,
        "timeline": "default",
        "subject": "default",
    }
    df = standardize_events(pd.DataFrame([initial]))
    for t in transforms:
        df = t(df)
    return standardize_events(df)


def sha1_file(path, chunk=1 << 20):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def fingerprint(stimulus_path, mode, lead_pad, tail_pad, baseline_audio):
    parts = [
        sha1_file(stimulus_path),
        mode,
        str(lead_pad),
        str(tail_pad),
        baseline_audio,
    ]
    return hashlib.sha1("|".join(parts).encode()).hexdigest()


def run_tribe(
    ad: Ad,
    mode: str,
    tail_pad: float,
    cache_dir: Path,
    stimulus_path: Path,
    cache_key: str,
    baseline_audio: str, # "silence" | "dither"
    model,
    n_vertices: int,
    lead_pad: float,
    hook_duration: float,
    force_rerun: bool = False,
):
    pred_dir = Path(cache_dir) / "preds"
    pred_dir.mkdir(parents=True, exist_ok=True)
    npy = pred_dir / f"{cache_key}.npy"
    pkl=  pred_dir / f"{cache_key}.segments.pkl"
    meta = pred_dir / f"{cache_key}.meta.json"
    fp = fingerprint(stimulus_path, mode, lead_pad, tail_pad, baseline_audio)

    # check cache
    cached = False
    if npy.exists() and meta.exists() and not force_rerun:
        old = json.loads(meta.read_text())
        if old.get("fingerprint") == fp:
            cached = True
        else:
            print(f"  cache MISS for {cache_key}: fingerprint changed "
                  f"({old.get('fingerprint', '?')[:8]} -> {fp[:8]}) — recomputing")

    # load cached values
    if cached:
        preds = np.load(npy)
        segments = None
        if pkl.exists():
            with open(pkl, "rb") as f:
                segments = pickle.load(f)
    else:   # no cached values --> rerun model
        events = build_events(str(stimulus_path), trimodal=False)
        n_rows = len(events) if hasattr(events, "__len__") else -1
        if n_rows == 0:
            sys.exit(
                f"build_events returned an EMPTY dataframe for {ad.ad_id} ({mode}, "
                f"{stimulus_path.stat().st_size} bytes, "
                f"{lead_pad + content_duration(ad, mode, hook_duration) + tail_pad:.1f}s).\n"
                "This is the ChunkEvents(min_duration=30) failure mode. Raise\n"
                "--min-stimulus-s, and run `--probe-events 16` to see the real semantics."
            )
        preds, segments = model.predict(events=events)
        preds = np.asarray(preds)
        np.save(npy, preds.astype(np.float32))   # cache predictions

        try:
            with open(pkl, "wb") as f:
                pickle.dump(segments, f)
        except (pickle.PicklingError, TypeError):
            pkl.write_bytes(pickle.dumps(None))
        meta.write_text(json.dumps({
            "fingerprint": fp, "mode": mode, "tailPad": tail_pad,
            "T": int(preds.shape[0]),
            "segmentsType": type(segments).__name__,
            "segmentsColumns": (list(segments.columns)
                                if hasattr(segments, "columns") else None),
        }, indent=1))

    # check that preds are valid
    if preds.ndim != 2 or preds.shape[1] != n_vertices:
        sys.exit(f"vertex mismatch for {cache_key}: preds has shape {preds.shape}, atlas "
                 f"has {n_vertices}. Revisit the LH/RH vertex-order assumption.")
    if not np.isfinite(preds).all():
        sys.exit(f"{cache_key}: predictions contain NaN or Inf. The most likely cause is "
                 "the digitally-silent padding hitting a zero-variance normalization in "
                 "the audio front-end. Retry with --baseline-audio dither.")

    return preds, segments




def probe_video(video_path: str | Path) -> Ad:
    # convert video file to ad object

    # check if path exists
    path = Path(video_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)

    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries",
        "format=duration:"
        "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,duration",
        "-of", "json",
        str(path),
    ]

    # run ffprobe command
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            check=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffprobe was not found on PATH") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"ffprobe failed for {path}:\n{exc.stderr}"
        ) from exc

    # read data from command run
    info = json.loads(result.stdout)
    streams = info.get("streams", [])

    video = next(
        (stream for stream in streams
         if stream.get("codec_type") == "video"),
        None,
    )
    if video is None:
        raise ValueError(f"No video stream found in {path}")

    def parse_fps(value):
        try:
            numerator, denominator = value.split("/")
            denominator = float(denominator)
            return float(numerator) / denominator if denominator else 0.0
        except (AttributeError, ValueError, ZeroDivisionError):
            return 0.0

    fps = (
        parse_fps(video.get("avg_frame_rate"))
        or parse_fps(video.get("r_frame_rate"))
        or 30.0
    )

    duration = float(
        info.get("format", {}).get("duration")
        or video.get("duration")
        or 0.0
    )
    if duration <= 0:
        raise ValueError(f"Could not determine duration for {path}")

    return Ad(
        ad_id=path.stem,
        filename=path.name,
        path=str(path),
        width=int(video["width"]),
        height=int(video["height"]),
        fps=fps,
        duration=duration,
        has_audio=any(
            stream.get("codec_type") == "audio"
            for stream in streams
        ),
    )



@dataclass
class TribeConfig:
    hook_duration: float = 3.0
    lead_pad: float = 5.0
    tail_pad: float = 8.0
    min_stimulus_duration: float = 30.0
    audio_rate: int = 48_000
    # annotated, so it is a real field: TribeConfig(cache_dir=...) is how callers set it
    cache_dir: Path = Path('./cache')

class TribePredictor:
    def __init__(self, config: TribeConfig):
        self.config = config
        self.hook_duration = config.hook_duration
        self.lead_pad = config.lead_pad
        self.tail_pad = config.tail_pad
        self.min_stimulus_duration = config.min_stimulus_duration
        self.audio_rate = config.audio_rate
        self.cache_dir = config.cache_dir

        self.model = self.load_tribe()
        self.parcel_names = self.load_parcel_names()
        self.n_vertices = self.parcel_names.shape[0]


    def load_tribe(self):
        # The pretrained config pins every feature extractor to device: cuda.
        # Pick a device that actually exists on this box (Apple MPS > CUDA > CPU)
        # and override the extractor + brain-model devices to match.
        # NB: the extractor `device` field is a pydantic Literal limited to
        # auto/cpu/cuda/accelerate, so "mps" cannot be passed through config.
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        # When Apple MPS is present, force the extractors onto the GPU at runtime:
        # VJEPA2 ViT-giant / w2v-bert forward passes are ~orders slower on pure CPU.
        if torch.backends.mps.is_available():
            _force_extractors_to_mps()
        return TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder=Path(self.cache_dir),
            device=device,
            config_update={
                "data.features_to_use": ["audio", "video"],
                "data.audio_feature.device": device,
                "data.video_feature.image.device": device,
                "data.text_feature.device": device,
            },
        )

    def load_parcel_names(self):
        cbig = ("https://raw.githubusercontent.com/ThomasYeoLab/CBIG/master/"
                "stable_projects/brain_parcellation/Schaefer2018_LocalGlobal/"
                "Parcellations/FreeSurfer5.3/fsaverage5/label")
        annot = {h: f"{cbig}/{h}.Schaefer2018_400Parcels_7Networks_order.annot" for h in ("lh", "rh")}
        d = self.cache_dir / "atlas"
        d.mkdir(parents=True, exist_ok=True)
        out = []
        for hemisphere in ("lh", "rh"):
            path = d / Path(annot[hemisphere]).name
            if not path.exists():
                import urllib.request
                print(f"  downloading {path.name} ...")
                urllib.request.urlretrieve(annot[hemisphere], path)
            vert_labels, _, names = nib.freesurfer.read_annot(str(path))
            parcel = [n.decode() if isinstance(n, bytes) else n for n in names]
            out.extend(parcel[v] for v in vert_labels)   # label 0 = medial wall
        return np.array(out)


    def predict_video(self, video_path: str | Path, *, mode: str = "full", baseline_audio: str = "silence", force_rerun: bool = False) -> tuple[np.ndarray, list[Segment]]:
        if mode not in {"full", "hook"}:
            raise ValueError("mode must be in 'full' or 'hook'")
        if baseline_audio not in {"silence", "dither"}:
            raise ValueError("baseline audio must be in 'silence' or 'dither'")

        ad = probe_video(video_path)
        content_dur = content_duration(ad, mode, self.hook_duration)
        tail_pad = max(self.tail_pad, self.min_stimulus_duration - self.lead_pad - content_dur)
        key_data = "|".join([sha1_file(ad.path), mode, str(self.hook_duration), str(self.lead_pad), str(tail_pad), str(self.audio_rate), baseline_audio])
        digest = hashlib.sha1(key_data.encode()).hexdigest()[:16]
        cache_key = f"{Path(ad.path).stem}-{digest}"
        stimulus_path = (self.cache_dir / "stimuli" / f"{cache_key}.mp4")
        if not stimulus_path.exists():
            build_stimulus(
                ad=ad,
                output_path=stimulus_path,
                mode=mode,
                tail_pad=tail_pad,
                baseline_audio=baseline_audio,
                hook_duration=self.hook_duration,
                lead_pad_seconds=self.lead_pad,
                audio_rate=self.audio_rate,
            )

        return run_tribe(
            ad=ad,
            mode=mode,
            tail_pad=tail_pad,
            cache_dir=self.cache_dir,
            stimulus_path=stimulus_path,
            cache_key=cache_key,
            baseline_audio=baseline_audio,
            model=self.model,
            n_vertices=self.n_vertices,
            lead_pad=self.lead_pad,
            hook_duration=self.hook_duration,
            force_rerun=force_rerun,
        )


    def predict_many(self, video_paths, *, mode: str = "full", baseline_audio: str = "silence", force_rerun: bool = False):
        paths = [
            Path(path).expanduser().resolve()
            for path in video_paths
        ]

        return {
            path: self.predict_video(
                path,
                mode=mode,
                baseline_audio=baseline_audio,
                force_rerun=force_rerun,
            )
            for path in paths
        }

    def predict_directory(
        self,
        directory: str | Path,
        *,
        recursive: bool = False,
        mode: str = "full",
        baseline_audio: str = "dither",
        force_rerun: bool = False,
    ):
        directory = Path(directory).expanduser().resolve()

        if not directory.is_dir():
            raise NotADirectoryError(directory)

        iterator = (
            directory.rglob("*")
            if recursive
            else directory.iterdir()
        )

        video_paths = sorted(
            path
            for path in iterator
            if path.is_file()
        )

        return self.predict_many(
            video_paths,
            mode=mode,
            baseline_audio=baseline_audio,
            force_rerun=force_rerun,
        )
