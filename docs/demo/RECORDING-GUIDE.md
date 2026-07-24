# /demo — screen-recording guide

How to get a clean ~60s take. The page is built so this is hard to mess up: **every
section animates once when it enters the viewport, and scroll speed does not affect
playback.** Scroll too fast or too slow — the animations still run at their own pace. You
cannot "outrun" an animation and get a half-drawn chart on camera.

## Setup

- **Window:** 1440 × 900, browser zoom 100%. This is what the page was tuned and verified
  at. (It's responsive down to phone, but record at 1440×900.)
- **Hide browser chrome:** full-screen the page or crop the bookmarks/URL bar in post. The
  page has its own sticky header (wordmark + nav) — that's meant to be visible.
- **Retina:** record on the laptop's built-in display for a 2× capture; the charts are
  crisp at 2×.
- **Autoplay:** the live-player video (§7) is muted and does **not** autoplay — you press
  play. Everything else animates on its own.
- Load the page fresh (`⌘R`) right before recording so the hero animation plays from zero.

## The scroll

Total page height ≈ **7,620px** at 1440×900. Scroll **smoothly and continuously** at
roughly **130px/sec** (a slow, steady trackpad drag or a scroll-wheel held gently). Pause
~1 second each time a new section's heading reaches the upper third — that's the beat where
its animation fires and where the voiceover for that section lands.

Section anchors (scroll-Y where each section starts, 1440×900):

| Beat | Section | Scroll-Y | Pause? |
|---|---|---|---|
| 0 | Hero — "Anyone can make a hundred ads" | 0 | start here, let hero arc draw |
| 1 | The science (two-region brain) | ~590 | 1s — brain regions light |
| 2 | Hook scoring | ~1,310 | 1.5s — watch the ventral spike in the hook zone |
| 3 | Comprehension | ~2,060 | 1s — the two-channel pins land |
| 4 | Ten ads → ranking | ~2,680 | 1.5s — let the bars race in |
| 5 | Same-campaign cuts | ~3,780 | 1s — the five arcs draw |
| 6 | Dip + shot diagnosis | ~4,430 | **2s** — the strongest beat; let the filmstrip appear |
| 7 | Watch it live | ~5,300 | **press play here** (see below) |
| — | The read-out (4 metrics recap) | ~6,040 | 1s — numbers count up |
| 8 | The moat (800+ / 3,115) | ~6,610 | 1s — counters land |
| 9 | CTA — "Stop guessing" | ~7,120 | hold to end |

## The one interaction (§7, "Watch it live")

When you reach the live player:
1. Stop scrolling with the player fully in frame.
2. Click the **play button** on the video. The clip plays; the attention/surprise readouts
   and the playhead dot track it in real time. The "Surprise" tile is outlined while inside
   the 0–3s hook.
3. Let it run ~4–5 seconds so the playhead visibly moves across the arc, then continue.
4. (Optional) click **Unmute** if you want the ad's audio in the recording — it's muted by
   default.

That's the only click in the whole take. Everything else is scroll.

## If a take goes wrong

- **Chart looked half-drawn:** it won't — animations complete regardless of scroll speed.
  If you genuinely caught nothing, you scrolled past before the section entered the
  viewport at all; scroll back up past it and back down to re-trigger (each section fires
  once per page load, so a fresh `⌘R` gives you a clean slate).
- **Scroll felt jerky:** trackpad two-finger drag is smoother than a mouse wheel. Or use
  `⌥`+scroll for finer steps. Reveal-on-enter means jerkiness never corrupts an animation —
  it only affects how the *scroll itself* looks, so a steady hand is all you need.
- **Reduced motion:** if your OS has "Reduce motion" on, animations render instantly (no
  draw-in). Turn it off in System Settings → Accessibility → Display for the recording.

## Standalone-artifact check (for the YC link itself)

The page is fully server-rendered — a partner who opens `usesoma.work/demo` and never
watches the video still gets every section, every number, and the live player. No walkthrough
required. That's the bar the page was built to clear.
