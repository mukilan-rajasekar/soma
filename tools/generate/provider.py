#!/usr/bin/env python3
"""
provider.py — the seam between "make a clip" and "which clip wins".

WHY THERE IS A SEAM AT ALL. Generation is a commodity that changes vendor every few
months; the filter in front of it is the product. Wiring a specific vendor's SDK through
the pipeline would make the replaceable half structural and the durable half incidental,
which is backwards. So everything downstream of here — the direction taxonomy, the
scoring, the ranking, the delivery — talks to one four-line interface and knows nothing
about who rendered the pixels.

Swapping vendors is this file. Nothing else moves.

WHAT SHIPS TODAY. `StubProvider` renders a real, playable, correctly-shaped mp4 with
ffmpeg: a slate carrying the direction's own name and its opening line. It is not a
pretend adapter that returns a fixture path — it produces a file the encoder can actually
score, so the WHOLE loop (brief -> directions -> N clips -> score each -> rank) runs and
is testable end to end today, with no key and no vendor. When a real provider lands, the
only thing that changes is which class is instantiated; every test around it still holds.

That is deliberate. The claim worth making is not "we can call a video model" — anyone
can. It is "we generate against a read-out and kill the losers before you see them," and
that claim is only demonstrable if the filter half is real and exercised.

`VeoProvider` is the first real vendor behind the same four-line interface: submit, poll,
download. It needs GEMINI_API_KEY and it bills per generation. Everything the pipeline
does around it is unchanged, which is the point of the seam — and the two places Veo's
shape does not fit a ClipSpec (durations are 4/6/8 seconds only, and there is no 1:1) are
handled by snapping and by refusing, never by substituting something uncomparable.
"""

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass
class ClipSpec:
    """One thing to generate. Vendor-neutral by construction: no model name, no sampler
    settings, no aspect-ratio dialect. An adapter translates this into its own request."""

    #: Stable id, used as the filename and as the ad id when the batch is scored.
    id: str
    #: Human label that survives into the ranking a customer reads.
    label: str
    #: What to make, in plain language.
    prompt: str
    duration_s: float = 15.0
    #: "9:16" | "1:1" | "16:9". Kept as a string because that is how every vendor
    #: expresses it and parsing it here would only invite a second dialect.
    aspect: str = "9:16"
    #: Free-form vendor hints (seed, style, negative prompt). Adapters ignore what they
    #: do not understand; nothing downstream reads this.
    extra: dict | None = None


class VideoProvider(Protocol):
    """Make a clip. That is the entire contract."""

    name: str

    def generate(self, spec: ClipSpec, dst: Path) -> Path:
        """Render `spec` to `dst` and return the path. Raise RuntimeError on failure —
        the pipeline catches per-clip so one bad generation cannot lose the batch."""
        ...


# ── the stub ────────────────────────────────────────────────────────────────────

# Deterministic slate colours, so a direction always renders the same shade and a
# side-by-side of two runs is comparable. Deliberately drab: a stub that looked designed
# would get mistaken for output.
_SLATE = ["0x1b1b1b", "0x232a33", "0x2b2320", "0x1f2b26", "0x2a2530", "0x332a23"]


class StubProvider:
    """Renders a real mp4 slate. No vendor, no key, no network.

    The point is not the picture — it is that the file is a genuine, correctly-shaped,
    encoder-scoreable video, so the pipeline around it is exercised for real rather than
    mocked. A run using this provider produces honest plumbing and meaningless creative,
    which is exactly the right failure mode: nobody will mistake it for a result.
    """

    name = "stub"

    def __init__(self, fps: int = 24):
        self.fps = fps

    def generate(self, spec: ClipSpec, dst: Path) -> Path:
        if shutil.which("ffmpeg") is None:
            raise RuntimeError("ffmpeg is required for the stub provider.")
        dst = Path(dst)
        dst.parent.mkdir(parents=True, exist_ok=True)

        w, h = _dims(spec.aspect)

        # MOVING CONTENT, NOT A SOLID CARD, and this is a correctness requirement rather
        # than a nicety. process_batch.py's hardest sanity check is that content minus a
        # black screen MUST drive occipital cortex; a near-black slate barely differs from
        # the baseline, so a batch of solid cards would fail that gate and the pipeline
        # could never be exercised end to end. testsrc2 has real spatial detail and real
        # motion, so it scores like a video — while looking so obviously synthetic that
        # nobody will mistake a stub run for a result.
        rate = 1 + _stable_index(spec.id, 4)          # deterministic per-clip variation
        src = f"testsrc2=size={w}x{h}:duration={spec.duration_s}:rate={self.fps}"
        tint = _SLATE[_stable_index(spec.id, len(_SLATE))]

        base = ["ffmpeg", "-v", "error", "-y",
                "-f", "lavfi", "-i", src,
                # A silent-but-present track: process_batch.py flags an ad with NO audio
                # stream, and a stub batch should not trip a flag that means something.
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-shortest"]
        enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "64k", str(dst)]

        # The caption is an ENHANCEMENT, tried first and dropped if unavailable: drawtext
        # needs libfreetype, which plenty of ffmpeg builds ship without (this repo's
        # Homebrew build does). Losing a label must not lose the clip, so the fallback is
        # the same render without it.
        text = _escape(f"{spec.label} - {spec.prompt[:90]}")
        captioned = [
            "-vf",
            f"hue=s=0.35,colorbalance=rs={rate * 0.05:.2f},"
            f"drawbox=c={tint}@0.45:t=fill,"
            f"drawtext=text='{text}':fontcolor=white@0.9:fontsize={max(18, w // 30)}:"
            f"x=(w-text_w)/2:y=h*0.82",
        ]
        plain = ["-vf", f"hue=s=0.35,drawbox=c={tint}@0.45:t=fill"]

        proc = subprocess.run(base + captioned + enc, capture_output=True, text=True)
        if proc.returncode != 0:
            proc = subprocess.run(base + plain + enc, capture_output=True, text=True)
        if proc.returncode != 0 or not dst.exists():
            tail = " ".join((proc.stderr or "").strip().splitlines()[-3:])
            raise RuntimeError(f"stub render failed: {tail[:300]}")
        return dst


# ── real adapters ───────────────────────────────────────────────────────────────
#
# Each is a class with a `name` and a `generate`. They are NOT written speculatively: an
# adapter guessed from memory against an API that moves monthly is worse than no adapter,
# because it looks finished and fails at the one moment it matters. The one below was
# written against the published REST reference, and every shape in it — the header name,
# the method suffix, the body layout, the polling field, the path the file URI sits at —
# is quoted from there rather than remembered.
#
# Everything downstream already works: the pipeline scores whatever files come back.

VEO_BASE = "https://generativelanguage.googleapis.com/v1beta"
VEO_DEFAULT_MODEL = "veo-3.1-generate-preview"

# The API takes a STRING, and only these. This is not a range with a granularity — asking
# for 15 seconds does not get you 15 seconds, it gets you an error, so the request is
# snapped and the caller is told what it was snapped to.
VEO_DURATIONS = ("4", "6", "8")

# 1:1 is absent on purpose: Veo does not offer it. ClipSpec allows it because other
# vendors do, so this adapter refuses rather than quietly shipping a 16:9 clip that the
# batch will then be length- and shape-mismatched against.
VEO_ASPECTS = ("16:9", "9:16")


def veo_duration(seconds: float) -> str:
    """Nearest allowed duration, as the string the API wants.

    Ties round DOWN — a hook is scored on its first three seconds and everything after is
    hold, so when a request sits between two options the shorter one wastes less of the
    clip on material the score barely weighs."""
    return min(VEO_DURATIONS, key=lambda d: (abs(float(d) - seconds), float(d)))


def veo_request(spec: "ClipSpec") -> dict:
    """The POST body. Split out from the network call so its shape is testable without
    a key, which is the only way this stays honest between vendor revisions."""
    if spec.aspect not in VEO_ASPECTS:
        raise RuntimeError(
            f"Veo has no {spec.aspect} output (it offers {', '.join(VEO_ASPECTS)}). "
            "Generating a different shape and calling it this one would put a clip in the "
            "batch that cannot be compared with the others."
        )
    params = {
        "aspectRatio": spec.aspect,
        "durationSeconds": veo_duration(spec.duration_s),
        "resolution": "720p",
    }
    extra = spec.extra or {}
    for key in ("negativePrompt", "personGeneration", "resolution", "seed"):
        if key in extra:
            params[key] = extra[key]
    return {"instances": [{"prompt": spec.prompt}], "parameters": params}


def veo_video_uri(operation: dict) -> str:
    """Pull the file URI out of a finished operation, or explain what happened instead.

    A completed operation with NO sample is the normal shape of a safety refusal, not a
    bug — surfacing it as "no video" would send someone hunting through the pipeline for
    a fault that is really a rejected prompt."""
    if operation.get("error"):
        msg = (operation["error"] or {}).get("message") or "unknown error"
        raise RuntimeError(f"Veo rejected the job: {msg}")

    resp = (operation.get("response") or {}).get("generateVideoResponse") or {}
    samples = resp.get("generatedSamples") or []
    if not samples:
        filtered = resp.get("raiMediaFilteredCount") or 0
        reasons = "; ".join(resp.get("raiMediaFilteredReasons") or [])
        if filtered:
            raise RuntimeError(
                f"Veo filtered all {filtered} generation(s) before returning them"
                + (f": {reasons}" if reasons else "")
                + ". The prompt has to change; retrying it will not."
            )
        raise RuntimeError("Veo finished but returned no video and gave no reason.")

    uri = ((samples[0] or {}).get("video") or {}).get("uri")
    if not uri:
        raise RuntimeError("Veo returned a sample with no file URI.")
    return uri


class VeoProvider:
    """Google's Veo, over the Gemini API's long-running-operation shape.

    submit -> poll until `done` -> download the file the operation points at. The whole
    adapter is that, plus the two places where Veo's constraints do not match a ClipSpec
    (discrete durations, no 1:1) and the pipeline would otherwise be silently misled.

    WHAT USING THIS COSTS YOU IN SCORING TERMS, and it should be said before anyone reads
    a ranking off it: Veo tops out at eight seconds. process_batch.py refuses to rank a
    batch that spans duration categories, so generated candidates are comparable with each
    other but NOT with a customer's 30-second cut. Comparing across that boundary needs
    the customer's ads re-cut to match, not a note in a footer.
    """

    name = "veo"

    def __init__(self, api_key: str, model: str = VEO_DEFAULT_MODEL,
                 poll_seconds: int = 10, timeout_s: int = 600):
        if not api_key:
            raise RuntimeError("VeoProvider needs an API key.")
        self.api_key = api_key
        self.model = model
        self.poll_seconds = poll_seconds
        self.timeout_s = timeout_s

    def _call(self, method: str, url: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            # The vendor's own message, not a paraphrase: when a key is wrong or a model
            # name has moved on, their sentence is the one that identifies it.
            raise RuntimeError(f"Veo {method} failed ({e.code}): {detail}") from None
        except urllib.error.URLError as e:
            raise RuntimeError(f"Veo unreachable: {e.reason}") from None

    def generate(self, spec: ClipSpec, dst: Path) -> Path:
        dst = Path(dst)
        dst.parent.mkdir(parents=True, exist_ok=True)

        op = self._call("POST", f"{VEO_BASE}/models/{self.model}:predictLongRunning",
                        veo_request(spec))
        name = op.get("name")
        if not name:
            raise RuntimeError("Veo accepted the request but returned no operation name.")

        deadline = time.monotonic() + self.timeout_s
        while not op.get("done"):
            if time.monotonic() > deadline:
                raise RuntimeError(
                    f"Veo did not finish {spec.id} within {self.timeout_s}s. The operation "
                    f"({name}) may still complete; nothing here retries it automatically."
                )
            time.sleep(self.poll_seconds)
            op = self._call("GET", f"{VEO_BASE}/{name}")

        uri = veo_video_uri(op)

        # The file URI needs the same key, and redirects to storage. urllib follows
        # redirects but drops nothing, so the header survives the hop.
        req = urllib.request.Request(uri, headers={"x-goog-api-key": self.api_key})
        try:
            with urllib.request.urlopen(req, timeout=300) as r, open(dst, "wb") as f:
                shutil.copyfileobj(r, f)
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            dst.unlink(missing_ok=True)
            raise RuntimeError(f"Veo produced {spec.id} but the download failed: {e}") from None

        if dst.stat().st_size < 20_000:
            size = dst.stat().st_size
            dst.unlink(missing_ok=True)
            raise RuntimeError(f"Veo returned {size} bytes for {spec.id}, which is not a video.")
        return dst


def _veo_from_env() -> VeoProvider:
    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not key:
        raise SystemExit(
            "The veo provider needs GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment.\n"
            "Get one from Google AI Studio and put it in .env. Veo is a PAID model — a "
            "six-direction run is six billed generations, so check the per-clip price "
            "before pointing a sweep at it.\n"
            "To exercise the pipeline without a key or a bill: --provider stub."
        )
    model = (os.environ.get("SOMA_VEO_MODEL") or VEO_DEFAULT_MODEL).strip()
    return VeoProvider(key, model=model)


PROVIDERS: dict[str, callable] = {
    "stub": StubProvider,
    "veo": _veo_from_env,
}


def get_provider(name: str) -> VideoProvider:
    if name not in PROVIDERS:
        known = ", ".join(sorted(PROVIDERS))
        raise SystemExit(
            f"Unknown provider {name!r}. Available: {known}.\n"
            "Adding one is a class with .name and .generate() plus a line in PROVIDERS — "
            "see the block above this function in tools/generate/provider.py."
        )
    return PROVIDERS[name]()


def _stable_index(key: str, n: int) -> int:
    """A deterministic bucket for `key`.

    NOT hash(): Python randomises string hashing per process (PYTHONHASHSEED), so a
    "deterministic" colour picked with hash() silently changes between runs and two runs
    of the same batch are no longer comparable side by side.

    Ids are minted sequentially (ad_01, ad_02, …), so the trailing number is used when
    there is one: hashing it instead collides, and three clips out of six sharing a tint
    defeats the point of tinting them. crc32 is the fallback for any other id shape —
    stable across processes, machines and versions, unlike hash().
    """
    n = max(1, n)
    digits = ""
    for ch in reversed(key):
        if ch.isdigit():
            digits = ch + digits
        elif digits:
            break
    if digits:
        return (int(digits) - 1) % n
    return zlib.crc32(key.encode("utf-8")) % n


def _dims(aspect: str) -> tuple[int, int]:
    # 720-class output: big enough that the encoder sees real detail, small enough that
    # a 24-candidate run is not a disk problem.
    return {
        "9:16": (720, 1280),
        "1:1": (960, 960),
        "16:9": (1280, 720),
    }.get(aspect, (720, 1280))


def _escape(text: str) -> str:
    """ffmpeg drawtext is its own little language; colons and quotes end the option."""
    return (text.replace("\\", "").replace(":", " ").replace("'", "")
                .replace("%", "").replace("\n", r"\n"))
