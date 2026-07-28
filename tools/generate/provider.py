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
"""

import shutil
import subprocess
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
# Each is a class with a `name` and a `generate`. They are NOT written speculatively:
# an adapter guessed from memory against an API that moves monthly is worse than no
# adapter, because it looks finished and fails at the one moment it matters.
#
# To add one, in full:
#
#     class VeoProvider:
#         name = "veo"
#         def __init__(self, api_key: str, model: str = "..."):
#             ...
#         def generate(self, spec: ClipSpec, dst: Path) -> Path:
#             # 1. translate ClipSpec -> the vendor's request (prompt, duration, aspect)
#             # 2. submit, poll until the job is done
#             # 3. stream the result to `dst`
#             # 4. raise RuntimeError with the vendor's own message on failure
#             return dst
#
#     PROVIDERS["veo"] = lambda: VeoProvider(os.environ["GOOGLE_API_KEY"])
#
# Everything downstream already works: the pipeline scores whatever files come back.

PROVIDERS: dict[str, callable] = {
    "stub": StubProvider,
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
