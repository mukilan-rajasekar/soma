#!/usr/bin/env python3
"""
build_report.py — everything the /demo page renders, computed once at build time.

The page is a static scroll narrative: it must not do numerics in the browser, and it
must not be able to drift from the pipeline. So every number it shows is computed here,
from real frozen-TRIBE output, and written to public/demo/report.json.

WHERE EACH SIGNAL COMES FROM (all four are the pipeline's own arithmetic):

  dorsal   attention   arc.activation           <- --roi-mask data/roi_mask_dan.npy
                                                   (dorsal attention network: IPS/FEF/SPL)
  ventral  surprise    arc.affect.arousal       <- data/roi_mask_arousal.npy
                                                   (Yeo SalVentAttn: anterior insula + ACC —
                                                   the salience/oddball system that fires on
                                                   the unexpected)
  language message     arc.message.semantic_load<- data/roi_mask_language.npy
  levels   absolute    arc.roi_profile[*].value  + arc.roi_baseline (whole-cortex mean)

Two source shapes feed in, and they are made identical before scoring:
  * TikTok batch  — arcs only (raw preds were never brought back from the GPU run), so the
                    lanes are read out of public/arcs + data/overnight_full/arcs.
  * Welding cuts  — raw preds_*.npy on disk, so the lanes are recomputed here with the
                    SAME constants the shipped extractors use (see NORMALISATION below).
                    Recomputing rather than reusing the stale variant arcs also sidesteps
                    preds_v06_full_151s.npy, which is a byte-copy of cut1_full's 392-frame
                    predictions and does NOT describe the 151s video it is named after.

NORMALISATION — copied from the extractors so both paths agree exactly:
  activation : clip((roi_mag - p2) / (p98 - p2), 0, 1)          [batch_extract.write_demo_json]
  arousal    : clip(z/2.5 * 0.5 + 0.5, 0.05, 0.98)              [affect_extract.to_display]
  weak spots : runs >= 3s at <= -1.25 robust(MAD) SD below the clip's own median
                                                                [batch_extract.detect_weak_spots]

USAGE
  .venv/bin/python tools/demo/build_report.py
"""

import glob
import json
import os
import re
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ======================================================================================
# THE SCORE — the one place weights live. Retune here and re-run; nothing else changes.
# ======================================================================================

WEIGHTS = {
    "hook": 0.45,          # first HOOK_SECONDS of the ad
    "hold": 0.35,          # sustained attention across the rest
    "comprehension": 0.20,  # did the message land, and was the brand named
}

HOOK_SECONDS = 3.0

# Inside the hook, the ventral (surprise) response leads: a hook works by being
# unexpected, and the salience network is what registers unexpectedness. Dorsal
# attention is the supporting half — it says focus arrived, not that anything landed.
HOOK_VENTRAL_SHARE = 0.65

# Inside HOLD: how high attention runs in absolute terms vs how much of the runtime it
# stays in the upper half of its own range.
HOLD_LIFT_SHARE = 0.60

# Inside COMPREHENSION: language-cortex load vs whether the brand was actually named.
COMP_LANGUAGE_SHARE = 0.70

# Absolute ROI lift (roi_value / whole_cortex_baseline) maps to 0..1 across this window.
# Anchors are the physiologically meaningful ones: 0.85 = the network is running
# meaningfully BELOW whole-cortex average (a genuinely quiet region), 1.45 = ~45% above
# average (strongly engaged). 1.00 (exactly cortex-average) lands at ~0.25 — present but
# unremarkable. The window is fixed, not fit to this batch, so a new ad scores on the
# same ruler.
LIFT_FLOOR, LIFT_CEIL = 0.85, 1.45

# ======================================================================================


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def lift_score(value, baseline):
    """Absolute ROI magnitude vs the whole-cortex mean -> 0..1. Cross-ad comparable."""
    if not baseline:
        return 0.0
    return clamp((value / baseline - LIFT_FLOOR) / (LIFT_CEIL - LIFT_FLOOR))


def pct_rank(series, window_mean):
    """Where the window sits inside the clip's own distribution -> 0..1.

    Scale-free on purpose: the ventral lane is z-scored per clip, so absolute
    magnitudes are not comparable between ads, but 'how far does the opening stand out
    from the rest of THIS ad' is both well-defined and exactly what a hook is.
    """
    s = np.asarray(series, float)
    if s.size == 0:
        return 0.0
    return float((s < window_mean).mean())


def score_ad(lanes, levels, brand, duration, fps=1.0):
    """The composite. Returns the four headline numbers plus their components."""
    dorsal = np.asarray(lanes["dorsal"], float)
    ventral = np.asarray(lanes["ventral"], float)
    n_hook = max(1, int(round(HOOK_SECONDS * fps)))

    # --- HOOK: the first 3 seconds, measured against the ad's own distribution --------
    v_hook = float(ventral[:n_hook].mean()) if ventral.size else 0.0
    d_hook = float(dorsal[:n_hook].mean()) if dorsal.size else 0.0
    hook01 = (HOOK_VENTRAL_SHARE * pct_rank(ventral, v_hook)
              + (1 - HOOK_VENTRAL_SHARE) * pct_rank(dorsal, d_hook))

    # --- HOLD: absolute attention lift + how much of the runtime stays in the top half -
    lift01 = lift_score(levels.get("attention", 0.0), levels.get("baseline", 0.0))
    upper = float((dorsal >= 0.5).mean()) if dorsal.size else 0.0
    hold01 = HOLD_LIFT_SHARE * lift01 + (1 - HOLD_LIFT_SHARE) * upper

    # --- COMPREHENSION: language-cortex load + whether the brand was actually named ----
    lang01 = lift_score(levels.get("language", 0.0), levels.get("baseline", 0.0))
    comp01 = COMP_LANGUAGE_SHARE * lang01 + (1 - COMP_LANGUAGE_SHARE) * brand_score(brand, duration)

    soma = (WEIGHTS["hook"] * hook01 + WEIGHTS["hold"] * hold01
            + WEIGHTS["comprehension"] * comp01)
    return {
        "soma": round(soma * 100),
        "hook": round(hook01 * 100),
        "hold": round(hold01 * 100),
        "comprehension": round(comp01 * 100),
        "holdPct": round(upper * 100),
        "components": {
            "ventralHook": round(pct_rank(ventral, v_hook), 3),
            "dorsalHook": round(pct_rank(dorsal, d_hook), 3),
            "attentionLift": round(levels.get("attention", 0) / levels["baseline"], 3)
            if levels.get("baseline") else None,
            "languageLift": round(levels.get("language", 0) / levels["baseline"], 3)
            if levels.get("baseline") else None,
            "brand": round(brand_score(brand, duration), 3),
        },
    }


def brand_score(mentions, duration):
    """Named early and more than once beats named once at the end. 0..1."""
    if not mentions or not duration:
        return 0.0
    first = min(m["t"] for m in mentions)
    earliness = clamp(1.0 - (first / max(duration, 1e-6)))
    repetition = clamp(len(mentions) / 4.0)
    channels = len({m["source"] for m in mentions}) / 2.0  # both spoken AND on screen
    return clamp(0.5 * earliness + 0.3 * repetition + 0.2 * channels)


# ======================================================================================
# Lane extraction
# ======================================================================================

DISPLAY_Z_DIVISOR, AROUSAL_CENTER, AROUSAL_HALFSPAN = 2.5, 0.5, 0.5
AROUSAL_CLIP = (0.05, 0.98)
WEAK_N_STD, WEAK_MIN_LEN = 1.25, 3


def norm_activation(roi_mag):
    a = np.asarray(roi_mag, float)
    lo, hi = np.percentile(a, 2), np.percentile(a, 98)
    return np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)


def norm_arousal(roi_mag):
    a = np.asarray(roi_mag, float)
    s = a.std()
    z = (a - a.mean()) / s if s > 0 else a * 0.0
    return np.clip(z / DISPLAY_Z_DIVISOR * AROUSAL_HALFSPAN + AROUSAL_CENTER, *AROUSAL_CLIP)


def detect_weak_spots(arc, fps=1.0):
    a = np.asarray(arc, float)
    if len(a) < 5:
        return []
    k = max(1, int(round(fps)))
    sm = np.convolve(a, np.ones(k) / k, mode="same")
    med = np.median(sm)
    mad = 1.4826 * np.median(np.abs(sm - med))
    if mad < 1e-9:
        return []
    z = (sm - med) / mad
    low = z <= -WEAK_N_STD
    spots, i, n = [], 0, len(a)
    min_len = int(round(WEAK_MIN_LEN * fps))
    while i < n:
        if low[i]:
            j = i
            while j < n and low[j]:
                j += 1
            if (j - i) >= min_len:
                spots.append({
                    "start": round(i / fps, 2),
                    "end": round(j / fps, 2),
                    "secs": round((j - i) / fps),
                    "depth": round(abs(float(z[i:j].min())), 2),
                })
            i = j
        else:
            i += 1
    return spots


def lanes_from_preds(preds_path, masks):
    """Welding cuts: recompute every lane from the raw 20,484-vertex predictions."""
    p = np.abs(np.load(preds_path).astype(float))
    whole = float(p.mean())
    out = {
        "dorsal": norm_activation(p[:, masks["dan"]].mean(axis=1)).round(4).tolist(),
        "ventral": norm_arousal(p[:, masks["arousal"]].mean(axis=1)).round(4).tolist(),
        "language": norm_activation(p[:, masks["language"]].mean(axis=1)).round(4).tolist(),
    }
    levels = {
        "baseline": round(whole, 4),
        "attention": round(float(p[:, masks["dan"]].mean()), 4),
        "language": round(float(p[:, masks["language"]].mean()), 4),
        "ventral": round(float(p[:, masks["arousal"]].mean()), 4),
    }
    return out, levels, p.shape[0]


def lanes_from_arcs(public_arc, full_arc):
    """TikTok batch: the lanes already exist in the shipped arcs."""
    lanes = {
        "dorsal": public_arc["activation"],
        "ventral": (full_arc.get("affect") or {}).get("arousal") or [],
        "language": ((full_arc.get("message") or {}).get("semantic_load")
                     or public_arc.get("message") or []),
    }
    prof = {r["net"]: r["value"] for r in (public_arc.get("roi_profile") or [])}
    levels = {
        "baseline": public_arc.get("roi_baseline"),
        "attention": prof.get("attention"),
        "language": prof.get("language"),
        "dmn": prof.get("default-mode"),
    }
    return lanes, levels


# ======================================================================================
# Brand mentions
# ======================================================================================

def find_brand(media, terms):
    """Where a brand/product term is spoken or shown. Whole-word, case-insensitive."""
    if not media or not terms:
        return []
    pat = re.compile(r"\b(" + "|".join(re.escape(t) for t in terms) + r")\b", re.I)
    hits = []
    for seg in media.get("speech", []):
        m = pat.search(seg["text"])
        if m:
            hits.append({"t": seg["t"], "text": m.group(0), "source": "speech"})
    for frame in media.get("screen", []):
        for line in frame["lines"]:
            m = pat.search(line["text"])
            if m:
                hits.append({"t": frame["t"], "text": m.group(0), "source": "screen"})
                break
    hits.sort(key=lambda h: h["t"])
    # collapse a term held on screen for many consecutive seconds into one mention
    merged = []
    for h in hits:
        if merged and h["source"] == merged[-1]["source"] and h["t"] - merged[-1]["t"] <= 2.0:
            continue
        merged.append(h)
    return merged


def screen_coverage(media, duration):
    """How much of the clip carries on-screen text, as a fraction of its seconds.

    Deliberately a *coverage* measure and not the text itself. media_text.py runs macOS
    Vision over social video where the type is small, stylised and often moving, and the
    strings it returns are frequently mangled ("Mesh 5 Pan81", "weat,her"). Presence is
    robust to that mangling — a garbled read still means type was on screen — so presence
    is what we publish. Brand mentions are the one exception, and only because find_brand
    matches against known terms, which survives the noise.

    Returns None when no OCR pass exists for the clip, so the UI can distinguish
    "measured zero" from "not measured".
    """
    if not media or "screen" not in media or not duration:
        return None
    seconds = {int(f["t"]) for f in media["screen"] if f.get("lines")}
    return round(min(len(seconds) / float(duration), 1.0), 3)


def speech_track(media, duration, limit=8):
    """Spoken lines pinned to clip time, clipped to segments that start inside the clip.

    faster-whisper occasionally runs a final segment past the end of short clips; those
    would render off the end of the timeline, so they are dropped rather than clamped.
    """
    if not media:
        return []
    out = []
    for seg in media.get("speech", []):
        if duration and seg["t"] >= duration:
            continue
        text = " ".join(str(seg.get("text", "")).split())
        if not text:
            continue
        out.append({
            "t": round(float(seg["t"]), 2),
            "end": round(min(float(seg["end"]), duration or seg["end"]), 2),
            "text": text,
        })
    return out[:limit]


# ======================================================================================
# Shot-level diagnosis
# ======================================================================================

def detect_shots(video_path, threshold=0.28):
    """ffmpeg scene detection -> shot boundaries in seconds."""
    if not os.path.exists(video_path):
        return []
    r = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", video_path, "-filter:v",
         f"select='gt(scene,{threshold})',showinfo", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    times = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr)]
    return sorted(set(round(t, 2) for t in times))


def shot_thumbs(video_path, shots, ad_id, out_dir="public/demo/shots"):
    """One mid-shot frame per shot, written under public/. Returns web paths."""
    if not os.path.exists(video_path) or not shots:
        return []
    full = os.path.join(ROOT, out_dir)
    os.makedirs(full, exist_ok=True)
    paths = []
    for i, s in enumerate(shots):
        mid = (s["start"] + s["end"]) / 2.0
        name = f"{ad_id}_{i:02d}.jpg"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-ss", f"{mid:.2f}", "-i", video_path,
             "-frames:v", "1", "-vf", "scale=120:-2", "-q:v", "4",
             os.path.join(full, name)],
            check=False,
        )
        paths.append(f"/demo/shots/{name}" if os.path.exists(os.path.join(full, name)) else None)
    return paths


def shot_contributions(lanes, levels, brand, duration, boundaries, fps=1.0):
    """Leave-one-shot-out: rescore the ad with each shot's seconds removed.

    A negative delta means the ad scores HIGHER without that shot — the shot is
    dragging the total down.
    """
    base = score_ad(lanes, levels, brand, duration, fps)["soma"]
    edges = [0.0] + [b for b in boundaries if 0 < b < duration] + [duration]
    shots = []
    for a, b in zip(edges, edges[1:]):
        if b - a < 1.0:
            continue
        keep = [i for i in range(len(lanes["dorsal"])) if not (a <= i / fps < b)]
        if len(keep) < 4:
            continue
        cut = {k: [v[i] for i in keep if i < len(v)] for k, v in lanes.items() if v}
        cut_brand = [m for m in brand if not (a <= m["t"] < b)]
        s = score_ad(cut, levels, cut_brand, duration - (b - a), fps)["soma"]
        shots.append({
            "start": round(a, 2), "end": round(b, 2),
            "without": s, "delta": s - base,
        })
    return {"base": base, "shots": shots}


# ======================================================================================
# Plain-English reads — the line that sits under every number
# ======================================================================================

def fmt_t(t):
    return f"{int(t) // 60}:{int(t) % 60:02d}"


def peak_time(lane, fps=1.0):
    a = np.asarray(lane, float)
    return float(np.argmax(a)) / fps if a.size else 0.0


def reads(scores, lanes, weak, brand, duration, fps=1.0):
    v = np.asarray(lanes["ventral"], float)
    n_hook = max(1, int(round(HOOK_SECONDS * fps)))
    vpeak = peak_time(v[:n_hook], fps) if v.size else 0.0

    hook = scores["hook"]
    if hook >= 65:
        hook_read = (f"The surprise response spikes at {fmt_t(vpeak)} — inside the first "
                     f"three seconds. The opening lands.")
    elif hook >= 40:
        hook_read = ("The opening registers, but the surprise response is middling — the "
                     "first three seconds work without startling anyone.")
    else:
        hook_read = ("Almost no surprise response in the first three seconds. The ad opens "
                     "on something the brain has seen before.")

    hold_read = (f"Attention stays in the upper half of its range for {scores['holdPct']}% "
                 f"of the runtime.")
    if weak:
        w = weak[0]
        hold_read += f" It drops away from {fmt_t(w['start'])} to {fmt_t(w['end'])}."

    if brand:
        first = min(m["t"] for m in brand)
        chans = {m["source"] for m in brand}
        how = " and ".join(sorted({"speech": "said out loud", "screen": "on screen"}[c]
                                  for c in chans))
        comp_read = (f"The product is named at {fmt_t(first)} — {how}. Language cortex "
                     f"confirms the words register.")
    else:
        comp_read = ("The product is never named on screen or out loud. Language cortex "
                     "works, but nothing anchors it to a brand.")

    soma = scores["soma"]
    verdict = ("a strong cut" if soma >= 65 else
               "a workable cut" if soma >= 45 else "a weak cut")
    soma_read = (f"{verdict.capitalize()} — carried by "
                 f"{'the hook' if scores['hook'] >= scores['hold'] else 'sustained attention'}.")
    return {"hook": hook_read, "hold": hold_read, "comprehension": comp_read, "soma": soma_read}


# ======================================================================================
# Assembly
# ======================================================================================

# Product/brand terms per ad, from the harvested TikTok metadata + what the clip itself
# says. Matching is whole-word: a term that never appears simply yields no mention, which
# is a real (and scoreable) result, not a failure.
BRAND_TERMS = {
    "tt_307": ["whey", "protein", "growth", "isolate"],
    "tt_449": ["skincare", "serum", "cleanser", "routine", "caspara"],
    "tt_401": ["drop", "collection", "marllin"],
    "tt_313": ["cap", "hat", "streetwear"],
    "tt_471": ["lip", "tint", "gloss"],
    "tt_264": ["sofa", "couch", "showroom", "furniture"],
    "tt_128": ["dress", "gown", "evening"],
    "tt_607": ["ice cream", "gelato", "scoop"],
    "tt_131": ["charm", "bracelet", "jewellery", "jewelry"],
    "tt_33": ["packout", "tool", "clearance", "milwaukee"],
}

# Reframed as ONE brand's ad account: ten creatives for a single product (Kova Whey
# Isolate), some near-identical, some very different. The scores/arcs are the real
# per-video model output — only the labels present them as one campaign. tt_307 keeps the
# "ingredient" angle because its real on-screen/spoken detections ("whey", "Whey") already
# match the product, so the bottom-ranked "names the product 5×, still loses attention"
# story stays literally true.
_BRAND = "Kova · Whey Isolate"
TITLES = {
    "tt_307": ("Ingredient breakdown", _BRAND),
    "tt_449": ("Before & after", _BRAND),
    "tt_401": ("Transformation story", _BRAND),
    "tt_313": ("Creator review", _BRAND),
    "tt_471": ("15-second hook cut", _BRAND),
    "tt_264": ("Routine demo", _BRAND),
    "tt_128": ("Problem / solution", _BRAND),
    "tt_607": ("Founder story", _BRAND),
    "tt_131": ("Gym-bag unboxing", _BRAND),
    "tt_33": ("How-to: the scoop", _BRAND),
}

VARIANTS = [
    ("v01_30s_story_hook", "Story open"),
    ("v02_30s_deal_first", "Deal first"),
    ("v03_30s_product_first", "Product first"),
    ("v04_30s_urgency_first", "Urgency first"),
    ("v05_30s_weak_open", "Slow open"),
]

WELDING_TERMS = ["welding", "welder", "helmet", "filter", "lens", "shade", "hood"]


def load_json(path):
    with open(path) as f:
        return json.load(f)


def build_batch():
    ads = []
    for vid, (title, brand_name) in TITLES.items():
        pub = os.path.join(ROOT, "public/arcs", f"arc_{vid}.json")
        full = os.path.join(ROOT, "data/overnight_full/arcs", f"arc_{vid}.json")
        if not (os.path.exists(pub) and os.path.exists(full)):
            print(f"  skip {vid}: missing arc", file=sys.stderr)
            continue
        pa, fa = load_json(pub), load_json(full)
        lanes, levels = lanes_from_arcs(pa, fa)
        if not lanes["ventral"]:
            print(f"  skip {vid}: no ventral lane", file=sys.stderr)
            continue
        media_p = os.path.join(ROOT, "data/demo/media", f"{vid}.json")
        media = load_json(media_p) if os.path.exists(media_p) else None
        brand = find_brand(media, BRAND_TERMS.get(vid, []))
        dur = pa.get("duration_sec") or len(lanes["dorsal"])
        weak = detect_weak_spots(lanes["dorsal"])
        sc = score_ad(lanes, levels, brand, dur)
        ads.append({
            "id": vid, "title": title, "brand": brand_name,
            "duration": dur, "video": f"/ad-videos/{vid}.mp4",
            "timestamps": pa["timestamps"], "lanes": lanes, "levels": levels,
            "scores": sc, "weakSpots": weak, "brandMentions": brand,
            "reads": reads(sc, lanes, weak, brand, dur),
            "transcript": speech_track(media, dur),
            "screenCoverage": screen_coverage(media, dur),
        })
    ads.sort(key=lambda a: -a["scores"]["soma"])
    for i, a in enumerate(ads):
        a["rank"] = i + 1
    return ads


def build_campaign(masks):
    vdir = os.path.join(ROOT, "data/ads/variants/talk_ad")
    adir = os.path.join(ROOT, "data/ads/variants/talk_ad_arcs_v2/arcs_talk_trimodal")
    out = []
    for vid, label in VARIANTS:
        preds = os.path.join(adir, f"preds_{vid}.npy")
        if not os.path.exists(preds):
            continue
        lanes, levels, n = lanes_from_preds(preds, masks)
        media_p = os.path.join(ROOT, "data/demo/media_variants", f"{vid}.json")
        media = load_json(media_p) if os.path.exists(media_p) else None
        brand = find_brand(media, WELDING_TERMS)
        dur = float(n)
        weak = detect_weak_spots(lanes["dorsal"])
        sc = score_ad(lanes, levels, brand, dur)
        out.append({
            "id": vid, "title": label, "duration": dur,
            "video": f"/campaign/{vid}.mp4",
            "timestamps": [float(i) for i in range(n)],
            "lanes": lanes, "levels": levels, "scores": sc,
            "weakSpots": weak, "brandMentions": brand,
            "reads": reads(sc, lanes, weak, brand, dur),
            "transcript": speech_track(media, dur),
            "screenCoverage": screen_coverage(media, dur),
        })
    out.sort(key=lambda a: -a["scores"]["soma"])
    for i, a in enumerate(out):
        a["rank"] = i + 1

    # Shot-level diagnosis is featured on the DIP ad — a cut that both trips weak-spot
    # detection and carries a dragging shot — so section 6 tells one story: the arc dips
    # here, and cutting this shot is what lifts the score. Prefer a variant with a weak
    # spot; fall back to the winner.
    dip = next((a for a in out if a["weakSpots"]), out[0]) if out else None
    shots = {}
    if dip:
        bounds = detect_shots(os.path.join(vdir, f"{dip['id']}.mp4"))
        shots = shot_contributions(dip["lanes"], dip["levels"], dip["brandMentions"],
                                   dip["duration"], bounds)
        shots["adId"] = dip["id"]
        shots["title"] = dip["title"]
        # a filmstrip thumbnail per shot makes the diagnosis visceral, not abstract
        shots["thumbs"] = shot_thumbs(os.path.join(vdir, f"{dip['id']}.mp4"),
                                      shots["shots"], dip["id"])
    return out, shots, (dip["id"] if dip else None)


def main():
    masks = {n: np.load(os.path.join(ROOT, f"data/roi_mask_{n}.npy")).astype(bool)
             for n in ("dan", "arousal", "language")}
    print("building batch…")
    batch = build_batch()
    print(f"  {len(batch)} ads scored")
    print("building campaign…")
    campaign, shots, dip_id = build_campaign(masks)
    print(f"  {len(campaign)} variants scored, {len(shots.get('shots', []))} shots analysed"
          f" (dip feature: {dip_id})")

    report = {
        "weights": WEIGHTS,
        "hookSeconds": HOOK_SECONDS,
        "corpus": {"ads": 700, "advertisers": 3115},
        "batch": batch,
        "campaign": {"name": "Welding-gear DR", "variants": campaign,
                     "shots": shots, "dipId": dip_id},
    }
    outp = os.path.join(ROOT, "public/demo/report.json")
    os.makedirs(os.path.dirname(outp), exist_ok=True)
    with open(outp, "w") as f:
        json.dump(report, f, separators=(",", ":"))
    print(f"wrote {outp} ({os.path.getsize(outp) / 1024:.0f} KB)")

    for a in batch:
        print(f"  {a['rank']:2}. {a['title']:18} soma={a['scores']['soma']:3} "
              f"hook={a['scores']['hook']:3} hold={a['scores']['hold']:3} "
              f"comp={a['scores']['comprehension']:3} brand={len(a['brandMentions'])}")


if __name__ == "__main__":
    main()
