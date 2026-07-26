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
- **Autoplay:** the live-player video (§09) is muted and does **not** autoplay — you press
  play. Everything else animates on its own.
- Load the page fresh (`⌘R`) right before recording so the hero animation plays from zero.

## The scroll is no longer one constant speed

Total page height is now **≈ 12,400px** at 1440×900 — the page grew when §07 Generation and
§08 AI ad editing were added. Sixty seconds of constant-speed scrolling would be 207px/s
everywhere, which is too fast to read a beat and too slow to get past the tail.

So the take has **three gears**:

| Gear | Where | Speed | Feel |
|---|---|---|---|
| Read | hero, §01–§04, §07, §08, §09 | ~110px/s with pauses | slow, deliberate |
| Travel | §05 → §06 (the bridge) | ~500px/s | a visible sweep past two charts |
| Exit | §09 → CTA (§10, §11, §12) | ~700px/s, or a hard cut | a scroll-to-bottom |

The exit is the one that needs a decision. Scrolling 8,163 → 11,965 at readable speed costs
30 seconds you do not have. Two options, both fine:

1. **`End` key** after §09 finishes — jumps to the CTA instantly. On tape it reads as a cut,
   which is what it is.
2. **Scroll fast and accept the blur** — §10/§11/§12 pass as texture. This is slightly better
   for a viewer who will scrub back, because it shows there is more page than the take covers.

## Section anchors (scroll-Y at 1440×900)

| Beat | Section | Scroll-Y | Height | Pause? |
|---|---|---|---|---|
| 0 | Hero — "Anyone can make a hundred ads" | 68 | 523 | start here, let the hero arc draw |
| — | The three-act strip (measure / generate / edit) | 591 | 152 | no pause — it reads in passing |
| — | Beta marquee (corpus brands) | 743 | 172 | no pause |
| 1 | §01 The science (two-region brain) | 915 | 719 | 1s — the regions light |
| 2 | §02 Hook scoring | 1,634 | 774 | 1.5s — watch the ventral spike in the hook zone |
| 3 | §03 Comprehension | 2,408 | 637 | 1s — the two-channel pins land |
| 4 | §04 Ten ads → ranking | 3,045 | 1,230 | 1.5s — let the bars race in |
| — | §05 Compare the cuts | 4,275 | 666 | **no pause — travel through** |
| — | §06 Weak-spot + shot diagnosis | 4,940 | 881 | **no pause — travel through** |
| 5 | **§07 Generation** | 5,822 | 1,218 | **4s — the biggest pause in the take** |
| 6 | **§08 AI ad editing** | 7,039 | 1,124 | **4s — the strongest beat** |
| 7 | §09 Watch it live | 8,163 | 749 | **press play here** (see below) |
| — | The read-out recap | 8,912 | 568 | no pause |
| — | §10 The moat | 9,480 | 527 | no pause |
| — | §11 Working with us | 10,007 | 1,006 | no pause |
| — | §12 Buyer's checklist | 11,013 | 952 | no pause |
| 8 | CTA — "Stop guessing" | 11,965 | 434 | hold to end |

## The two new sections — how they actually play

Both `GenerateStudio` and `EditStudio` **own their own reveal**. They do not fire when the
heading enters; they fire when the panel itself is 22% on screen. This was a deliberate
change: at over 1,100px each, a section-level trigger would start the animation while the
panel was still below the fold and finish it before the panel was on camera.

Practical consequence: **stop scrolling when the panel is in frame, not when the heading
is.** Then wait.

**§07 Generation** — a 5.2s clock, four phases:

1. the brief types itself into the input card (constant rate — the ease is inverted for it)
2. twenty-four columns rise, each at its predicted score
3. the dashed pass bar drops across them
4. nineteen columns dim to 30%, five stay ink, and the five ranked cards land underneath

Stop where the chart and the survivor board are both in frame — the section is built so
they fit one 900px screen together. That framing is the whole beat.

*Optional click:* the runner-up rows are buttons. Clicking one swaps the promoted candidate
(and its arc, and its "why the generator chose it" panel). Nice if you have a spare two
seconds; the section is complete without it.

**§08 AI ad editing** — a 5.4s clock:

1. the instruction types in
2. three candidate edits land and their delta bars fill
3. the winner is outlined and tagged **Applied**; the losers drop to 45%
4. the score counts 62 → 66, the shot collapses out of the filmstrip, the arc redraws
   ending at 0:25 with the old curve behind it as a ghost, and the timeline read-out rows
   fade in underneath

Everything after step 2 happens together. Do not scroll during it.

## The one interaction (§09, "Watch it live")

1. Stop scrolling with the player fully in frame.
2. Click the **play button**. The clip plays; the attention/surprise readouts and the
   playhead dot track it in real time.
3. Let it run ~3 seconds, then continue.
4. (Optional) click **Unmute** if you want the ad's audio — it's muted by default.

## If a take goes wrong

- **Chart looked half-drawn:** it won't — animations complete regardless of scroll speed.
  If you genuinely caught nothing, you scrolled past before the panel entered the viewport
  at all. Each section fires once per page load, so a fresh `⌘R` gives you a clean slate.
- **§07 or §08 was already finished when you got there:** you scrolled past and came back.
  They fire once. `⌘R` and re-approach.
- **Scroll felt jerky:** trackpad two-finger drag is smoother than a mouse wheel, or
  `⌥`+scroll for finer steps. Reveal-on-enter means jerkiness never corrupts an animation.
- **Reduced motion:** if your OS has "Reduce motion" on, every animation renders instantly
  with no draw-in — including both new sections, which will look finished before you arrive.
  Turn it off in System Settings → Accessibility → Display for the recording.

## Standalone-artifact check (for the YC link itself)

The page is fully server-rendered — a partner who opens `usesoma.work/demo` and never
watches the video still gets every section, every number, the generation and editing
walkthroughs, and the live player. The three-act strip under the hero gives them anchors
(`#generate`, `#edit`) so they can jump to acts two and three without scrolling past
5,000px of measurement. No walkthrough required. That's the bar the page was built to
clear.
