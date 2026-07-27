"use client";

// The play control for the read-out. One click runs the whole page as a STEPPED take: a lead-in
// long enough to start a screen recorder, then travel to a beat, hold while that beat plays,
// travel to the next. It is the recording, authored — not a scroll that happens to be automated.
//
// WHY STEPPED AND NOT A CONTINUOUS GLIDE
// A constant-rate pass gives every element exactly viewportHeight/rate on camera regardless of
// what it is doing, so a 1.4 s chart draw sits still for the remaining 7 s while an empty heading
// band gets the same 8 s as the densest figure on the page. Holding still on a beat and then
// moving deliberately to the next reads as authored; drifting through both reads as a demo reel.
//
// NOTHING HERE IS A PIXEL CONSTANT
// Every stop is derived from the live DOM on click, so editing a section, cutting copy or adding
// a beat retimes the take automatically. The mechanism is `data-reveal`, which useReveal stamps
// onto every element it observes (see useReveal.ts): it records the bottom root-margin of that
// element's own IntersectionObserver, which is exactly the scroll position at which the element
// starts animating. The planner will not stop above a figure's fire line, because that frames a
// chart that has not begun to draw — the single worst frame a recording can hold on.
//
// Holds are arithmetic over that same gate map, not settle-detection. A recording has to be
// reproducible frame for frame, and two things on this page never stop moving anyway (the cortex
// spins forever, the marquee loops), so "wait until the page is still" would hang on them.

import { useCallback, useEffect, useRef, useState } from "react";

// ── motion ────────────────────────────────────────────────────────────────────────────
// Quintic smootherstep: zero velocity AND zero acceleration at both ends, no piecewise
// midpoint. That is the boundary condition a hold→travel→hold model creates, and it is why
// this beats a cosine (which steps to full acceleration instantly at t=0) or a cubic (whose
// acceleration reverses hard at the midpoint). Peak velocity is 1.875x mean, and ~16% of each
// leg is spent inside the last 3% of the distance, which is what reads as "settling".
const ease = (t: number) => t * t * t * (t * (6 * t - 15) + 10);
const invEase = (y: number) => {
  let lo = 0, hi = 1;
  for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (ease(mid) < y) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
};
// Duration from distance. A fixed duration makes a 240px hop crawl and an 870px hop sprint; a
// fixed speed makes every arrival feel identical and drains the sense that a long move is a
// bigger event. The sqrt is solved rather than chosen — anchoring a power law on two points in
// this page's real gap band gives an exponent of 0.487. Floor stops a short re-framing hop
// reading as a twitch; ceiling stops a long leg dragging; the d/850 term never binds today but
// degrades a future very long leg to a speed cap instead of forcing it through the ceiling.
const travelMs = (d: number) =>
  TRAVEL_SCALE * 1000 * Math.max(Math.min(Math.max(0.042 * Math.sqrt(d), 0.45), 1.35), d / 850);

// ── planner ───────────────────────────────────────────────────────────────────────────
const GATE_MARGIN = 4, CLEAR = 12, PAD_MIN = 24, MIN_FIG = 90;
// ── holds ─────────────────────────────────────────────────────────────────────────────
// beatMs is a linear fit to this page's real component clocks, accurate to ~450 ms and always
// long rather than short — a beat cut off mid-animation is a far worse defect than half a
// second of stillness. A component can override with data-beat if it ever leaves the line.
const BEAT_FLOOR = 900, BEAT_PER_PX = 3.9, SETTLE = 300;
const READ_BASE = 300, MS_WORD = 6.5, READ_MIN = 700, READ_MAX = 1500;
const HOLD_MIN = 1800, HOLD_MAX = 5200, CLOSE_EXTRA = 1600;
// The derived holds are MINIMA — each is exactly its beat's remaining animation plus reading
// time, which on /demo-short sums to ~40s. TARGET_MS is what the take should actually run to.
// The surplus is distributed across the holds in proportion to how long each already is, so a
// dense beat gains more than a sparse one and nothing is ever shortened below what its
// animation needs. Travel is slowed by a flat factor: legs are what read as "pace", and
// scaling them with the holds would make long moves crawl.
const TARGET_MS = 55000;
const TRAVEL_SCALE = 1.22;
// The hero build is replayed on cue after the lead-in, so the recording opens on the headline
// arriving rather than on a page that finished animating before the recorder was running.
const HERO_BUILD = 1500;
// The founder's lead-in: dead still, long enough to hit record. The marquee keeps the opening
// frame from being inert, so the head of the take can be trimmed anywhere inside it.
const LEAD_IN = 3000;

type Stop = { s: number; anchor: HTMLElement; dy: number; hold: number; isLast: boolean };

function buildPlan(m: HTMLElement): Stop[] {
  const vh = m.clientHeight;
  const hdr = (m.querySelector(":scope > header") as HTMLElement | null)?.offsetHeight ?? 0;
  const usable = vh - hdr;
  const maxScroll = Math.max(0, m.scrollHeight - vh);
  const mT = m.getBoundingClientRect().top, st0 = m.scrollTop;
  const doc = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top - mT + st0), bot: Math.round(r.bottom - mT + st0) };
  };

  type G = { top: number; bot: number; el: Element; pct: number; isSection: boolean; fireAt: number };
  const gated: G[] = [...m.querySelectorAll<HTMLElement>("[data-reveal]")].map((el) => {
    const d = doc(el);
    const pct = parseFloat(el.dataset.reveal ?? "0") || 0;
    return { ...d, el, pct, isSection: el.tagName === "SECTION", fireAt: Math.round(d.top - vh * (1 - pct / 100)) };
  }).sort((a, b) => a.top - b.top || b.bot - a.bot);

  const figGates = gated.filter((g) => g.pct >= 40 && !g.isSection);
  const secGates = gated.filter((g) => g.isSection);
  const figs = figGates.filter((g) => g.bot - g.top >= MIN_FIG && !g.el.closest("[data-eager]"));
  // Real DOM nesting, never a rectangle test: sibling Stat tiles share an identical rect and a
  // rect test makes them swallow each other, which silently drops whole beats.
  const inside = (a: G, b: G) => a.el !== b.el && b.el.contains(a.el);
  const paintedAt = (el: Element) => secGates.find((s) => s.el.contains(el))?.fireAt ?? -1e9;

  // units: each top-level figure grown to its widest single-figure wrapper
  type U = { top: number; bot: number; el: Element | null; members: G[] };
  const topLevel = figs.filter((f) => !figs.some((o) => inside(f, o)));
  const groups: U[] = [];
  for (const f of topLevel) {
    const g = groups.find((x) => Math.abs(x.top - f.top) < 8);
    if (g) { g.bot = Math.max(g.bot, f.bot); g.members.push(f); }
    else groups.push({ top: f.top, bot: f.bot, el: f.el, members: [f] });
  }
  for (const g of groups) {
    let node: Element = g.members[0].el, best = node;
    while (node.parentElement && node.parentElement !== m) {
      const p: HTMLElement = node.parentElement;
      // Never swallow the heading band, and never grow past a single frame — without both caps
      // the growth eats the whole section and the beat disappears.
      if (p.tagName === "SECTION" || p.querySelector(":scope > h1, :scope > h2")) break;
      const pd = doc(p);
      if (pd.bot - pd.top > usable) break;
      const extra = figs.some((f) => f.top >= pd.top && f.bot <= pd.bot
        && !g.members.includes(f) && !g.members.some((mm) => inside(f, mm)));
      if (extra) break;
      best = p; node = p;
    }
    Object.assign(g, doc(best), { el: best });
  }

  const gatesIn = (t: number, b: number) => figGates.filter((x) => x.top >= t && x.top < b);
  const floorOf = (t: number, b: number) => {
    const gs = gatesIn(t, b);
    return gs.length ? Math.max(...gs.map((x) => x.fireAt)) + GATE_MARGIN : 0;
  };

  type F = { top: number; bot: number; sec: HTMLElement; h2d: { top: number; bot: number } | null;
             chromeOnly: boolean; textOnly: boolean; hasH2: boolean };
  const frames: F[] = [];
  // Every section's bottom edge, beat or not. The debris clamp below needs this because the
  // things that end up sliced across the top of a frame are not only previous BEATS: the beta
  // marquee is skipped as "a band, not a beat" and therefore has no frame of its own, so a
  // clamp that only knew about frames let it sit at the top of the science beat.
  const sectionBots = [...m.querySelectorAll<HTMLElement>("section")].map((s) => doc(s).bot);
  for (const sec of m.querySelectorAll<HTMLElement>("section")) {
    const inner = sec.querySelector(":scope > div") ?? sec;
    const id = doc(inner);
    const h2 = sec.querySelector("h1,h2");
    const h2d = h2 ? doc(h2) : null;
    const mine = groups.filter((g) => g.top >= id.top - 4 && g.top < id.bot);
    if (!mine.length && !h2d) continue; // a band, not a beat — this is how the marquee is skipped

    // Pre-split a unit whose own inner gate would bury its top edge: revealing the thing you
    // must reveal would push the panel's head off the top of the frame.
    const units: U[] = [];
    for (const g0 of mine) {
      const stack: U[] = [g0];
      while (stack.length) {
        const u = stack.shift()!;
        if (floorOf(u.top, u.bot) <= u.top - hdr || !u.el) { units.push(u); continue; }
        const worst = gatesIn(u.top, u.bot).reduce((a, b) => (b.fireAt > a.fireAt ? b : a));
        let node: Element = worst.el, split: number | null = null;
        while (node.parentElement && node.parentElement !== u.el && u.el.contains(node.parentElement)) {
          node = node.parentElement;
          const nd = doc(node);
          if (nd.top > u.top + 40 && nd.top < u.bot - 40) split = nd.top;
        }
        if (split == null || split <= u.top + 40 || split >= u.bot - 40) { units.push(u); continue; }
        stack.unshift({ top: u.top, bot: split, el: u.el, members: u.members },
                      { top: split, bot: u.bot, el: u.el, members: u.members });
      }
    }

    const seq = units.length
      ? [{ top: id.top, bot: units[0].top, chrome: true, textOnly: false }, ...units.map((u) => ({ ...u, chrome: false, textOnly: false }))]
      : [{ top: id.top, bot: id.bot, chrome: true, textOnly: true }];

    let f: F | null = null;
    const close = () => { if (f && (!f.chromeOnly || f.textOnly)) frames.push(f); f = null; };
    for (const u of seq) {
      const merged = f && u.bot - f.top <= usable
        && floorOf(f.top, u.bot) <= ((f.hasH2 || (h2d && h2d.top >= f.top && h2d.bot <= u.bot)) ? h2d!.top : f.top) - hdr;
      if (merged && f) f.bot = u.bot;
      else { close(); f = { top: u.top, bot: u.bot, sec, h2d, chromeOnly: true, textOnly: !!(u as { textOnly?: boolean }).textOnly, hasH2: false }; }
      if (!(u as { chrome?: boolean }).chrome && f) f.chromeOnly = false;
      if (f) f.hasH2 = !!(h2d && h2d.top >= f.top && h2d.bot <= f.bot);
    }
    close();
  }

  // Anything that must never be sliced by the header band or the bottom edge: the running
  // marquee track, and every heading.
  const straddlers = [
    ...document.getAnimations().filter((a) => a.playState === "running")
      .map((a) => (a.effect as KeyframeEffect | null)?.target).filter((t): t is Element => !!t && t.isConnected && m.contains(t)),
    ...m.querySelectorAll("h1,h2"),
  ].map((el) => ({ ...doc(el), paint: paintedAt(el) }));

  const raw = frames.map((f, fi) => {
    const span = f.bot - f.top;
    const slack = Math.max(PAD_MIN, (usable - span) / 2);
    const want = Math.round(f.top - hdr - slack);
    const floor = Math.max(0, floorOf(f.top, f.bot));
    // Keyed on the H2, not the eyebrow — an eyebrow is allowed to tuck under the header.
    const ceil = Math.max(floor, (f.hasH2 && f.h2d ? f.h2d.top : f.top) - hdr);
    // When the gate floor and the heading ceiling conflict, THE GATE WINS: a blank figure on
    // camera is much worse than an eyebrow slipping under the header.
    let s = Math.min(Math.max(want, floor), ceil);
    // ── clear the PREVIOUS beat off the top edge ──────────────────────────────────────
    // Three constraints above decide where the incoming beat sits. None of them says anything
    // about the outgoing one, and the recording showed the cost: five of nine stops opened with
    // the previous beat sliced in half across the header band. The worst was the five-arc
    // overlay, whose frame was 290px of leftovers above it and 259px of empty paper below, so
    // the best single visual on the page owned 37% of the frame it was supposed to own.
    //
    // Expressed as a floor (raise s until the previous frame's bottom is behind the header) and
    // capped at `ceil`, so it can only ever tighten the frame inside the band the constraints
    // above already agreed on: it can never push this beat's own heading under the header, and
    // it can never drop below the gate floor, because it only raises s.
    // `prevBot` is the lowest edge of everything that belongs to an EARLIER beat: the previous
    // frame, plus any whole section that has already finished above this frame's top. The
    // second term is what catches the marquee, which is not a beat and so never appears in
    // `frames` at all.
    const doneAbove = sectionBots.filter((b) => b <= f.top + 4);
    const prevBot = Math.max(fi > 0 ? frames[fi - 1].bot : -1e9, ...(doneAbove.length ? doneAbove : [-1e9]));
    if (prevBot > -1e9) s = Math.max(s, Math.min(ceil, prevBot - hdr + CLEAR));
    let fix: number | null = null;
    for (const b of straddlers) {
      if (b.paint > s) continue; // not painted yet — at opacity 0 it cannot be "cut"
      const cutTop = b.top - s < hdr && b.bot - s > 0;
      const cutBot = b.top - s < vh && b.bot - s > vh;
      if (!cutTop && !cutBot) continue;
      for (const cand of [b.bot + CLEAR, b.top - hdr - CLEAR, b.bot - vh + CLEAR, b.top - vh - CLEAR]) {
        const c = Math.round(cand);
        if (c < floor || c > ceil) continue;
        if ((b.top - c < hdr && b.bot - c > 0) || (b.top - c < vh && b.bot - c > vh)) continue;
        if (fix == null || Math.abs(c - s) < Math.abs(fix - s)) fix = c;
      }
    }
    if (fix != null) s = fix;
    // ── nothing ON CAMERA may still be below its own fire line ────────────────────────
    // The gate floor above only considers figures INSIDE the frame, [f.top, f.bot). But a frame
    // is a subject, not a viewport: the camera always shows `vh` pixels, and whatever sits
    // between the frame's bottom edge and the bottom of the screen is on camera too. Those
    // figures were never required to have fired, so they sat in shot in their zero state. That
    // is what put "0 /100" under the hook arc on a settle frame, the same defect class as the
    // survivor count, and it is also the main reason frames read as underfull: the planner was
    // composing for a box smaller than the picture.
    //
    // Raising s pulls those figures up into the frame AND fires them, so this fills the frame
    // and kills the dead numeral in one move. Iterated, because moving up can bring a new figure
    // into shot; three passes converge on this page and the loop is bounded regardless.
    //
    // Deliberately allowed to exceed `ceil`, on the same principle the gate floor already uses:
    // an eyebrow tucked under the header is a far smaller defect than a live figure frozen at
    // zero in the middle of the shot. Where both can be satisfied, the section is sized so they
    // are (see the hook arc's height).
    for (let pass = 0; pass < 3; pass++) {
      const onCamera = figs.filter((g) => g.top >= s && g.top < s + vh && g.fireAt > s);
      if (!onCamera.length) break;
      const need = Math.max(...onCamera.map((g) => g.fireAt)) + GATE_MARGIN;
      if (need <= s) break;
      s = Math.min(need, maxScroll);
    }
    s = Math.min(maxScroll, Math.max(0, s));
    return { s, sec: f.sec, top: f.top, bot: f.bot };
  });

  const kept: typeof raw = [];
  // Two stops closer together than about a quarter of the frame are not two beats, they are one
  // beat photographed twice. 60px was a duplicate filter; it is not a composition rule, and the
  // on-camera gate pass above makes near-neighbours much more common because it pulls stops
  // toward each other. The editor beat was the case that showed it: two stops 196px apart, 7.9s
  // apart, showing the same panel with the score reading 64 on one and 66 on the other. That
  // plays as a twitch between two long holds. Merged, the camera holds still and the number
  // climbs in place, which is the whole premise of a stepped take.
  const MIN_HOP = Math.max(60, Math.round(usable * 0.27));
  for (const st of raw) if (!kept.length || st.s - kept[kept.length - 1].s > MIN_HOP) kept.push(st);
  if (!kept.length) return [];
  kept[0].s = 0;
  kept[kept.length - 1].s = maxScroll;

  // ── schedule the holds ──────────────────────────────────────────────────────────────
  const fired = new Set<Element>();
  const wordsIn = (top: number, bot: number) => {
    let n = 0;
    const walk = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walk.nextNode())) {
      const t = node.textContent?.trim();
      if (!t) continue;
      const p = node.parentElement;
      if (!p) continue;
      const d = doc(p);
      if (d.top >= top - 20 && d.bot <= bot + 20) n += t.split(/\s+/).filter(Boolean).length;
    }
    return n;
  };

  const plan = kept.map((st, i) => {
    const prev = i === 0 ? 0 : kept[i - 1].s;
    const dist = Math.abs(st.s - prev);
    const legMs = i === 0 ? 0 : travelMs(dist);
    let residual = 0;
    // Whether any figure in this frame DECLARED its beat length rather than being estimated.
    // A declared length is ground truth, and HOLD_MAX must not truncate it: the cap exists to
    // stop the height-based estimator running away on a tall panel, not to overrule a component
    // that knows its own clock. EditStudio is the case that forced this — its real animation is
    // 4400ms, the estimator read ~3600ms, and the 5200ms cap then clipped what was left.
    let declaredBeat = false;
    for (const g of figs) {
      if (g.fireAt > st.s || fired.has(g.el)) continue;
      fired.add(g.el);
      // How far into this leg the gate opened — arrival deliberately lands on something
      // already building rather than on a dead frame waiting to start.
      const phi = dist > 0 ? (g.fireAt - prev) / (st.s - prev) : 1;
      const fireTime = legMs - (1 - invEase(Math.min(1, Math.max(0, phi)))) * legMs;
      // Only the pixels inside THIS frame count, which is what sizes a split panel's two
      // halves correctly.
      const onCam = Math.min(g.bot, st.s + vh) - Math.max(g.top, st.s);
      const declared = Number((g.el as HTMLElement).closest("[data-beat]")?.getAttribute("data-beat"));
      const isDeclared = Number.isFinite(declared) && declared > 0;
      if (isDeclared) declaredBeat = true;
      const beatMs = isDeclared ? declared : BEAT_FLOOR + BEAT_PER_PX * Math.max(0, onCam);
      residual = Math.max(residual, fireTime + beatMs - legMs);
    }
    const read = Math.min(READ_MAX, Math.max(READ_MIN, READ_BASE + MS_WORD * wordsIn(st.top, st.bot)));
    const isLast = i === kept.length - 1;
    const want = residual + SETTLE + read;
    const hold = i === 0 ? LEAD_IN + HERO_BUILD + read
      : isLast ? Math.max(HOLD_MIN, read + CLOSE_EXTRA)
      // A declared beat is exempt from the ceiling: see `declaredBeat` above.
      : Math.max(HOLD_MIN, declaredBeat ? want : Math.min(HOLD_MAX, want));
    return { s: st.s, anchor: st.sec, dy: doc(st.sec).top - st.s, hold, isLast };
  });

  // Stretch to the target. The derived holds are minima — never shorten below them — so the
  // surplus is added, distributed in proportion to how long each hold already is. A dense beat
  // therefore gains more seconds than a sparse one, which is the right way round: the beats
  // that earned a long hold are the ones worth lingering on. The lead-in is excluded, since
  // its length is the founder's recorder window and not a pacing decision.
  let total = 0;
  for (let i = 0; i < plan.length; i++) {
    total += plan[i].hold;
    if (i > 0) total += travelMs(Math.abs(plan[i].s - plan[i - 1].s));
  }
  const surplus = TARGET_MS - total;
  if (surplus > 0 && plan.length > 1) {
    const base = plan.slice(1).reduce((a, p) => a + p.hold, 0);
    if (base > 0) for (let i = 1; i < plan.length; i++) plan[i].hold += surplus * (plan[i].hold / base);
  }
  return plan;
}

type Phase = "idle" | "playing" | "done";

export default function AutoScroll({
  scrollRef,
  onHeroCue,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Blanks the hero at click and builds it after the lead-in, so the recording opens on the
   *  headline arriving rather than on a page that finished animating before the recorder ran. */
  onHeroCue?: (cue: "blank" | "build") => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState<number | null>(null);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  // Label the button with the real length of the take, computed from the page. A hardcoded
  // number is a promise the page can break by being edited.
  useEffect(() => {
    const m = scrollRef.current;
    if (!m) return;
    const measure = () => {
      try {
        const plan = buildPlan(m);
        if (!plan.length) return;
        let total = 0;
        for (let i = 0; i < plan.length; i++) {
          total += plan[i].hold;
          if (i > 0) total += travelMs(Math.abs(plan[i].s - plan[i - 1].s));
        }
        setSecs(Math.round(total / 1000));
      } catch { /* a plan that cannot be built just leaves the label blank */ }
    };
    const id = setTimeout(measure, 600); // let reveals stamp themselves first
    window.addEventListener("resize", measure);
    return () => { clearTimeout(id); window.removeEventListener("resize", measure); };
  }, [scrollRef]);

  const stop = useCallback(() => {
    cancelled.current = true;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    if (timer.current != null) clearTimeout(timer.current);
    if (heroTimer.current != null) clearTimeout(heroTimer.current);
    raf.current = null; timer.current = null; heroTimer.current = null;
    // Never leave the hero blanked: a cancelled take must not strand the page mid-cue.
    onHeroCue?.("build");
    setPhase("idle");
  }, [onHeroCue]);

  useEffect(() => {
    if (phase !== "playing") return;
    const m = scrollRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift" || e.key === "Meta" || e.key === "Control" || e.key === "Alt") return;
      stop();
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", onKey);
    m?.addEventListener("pointerdown", stop);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", onKey);
      m?.removeEventListener("pointerdown", stop);
    };
  }, [phase, scrollRef, stop]);

  // The take ends with the control still hidden — it would otherwise fade back over the closing
  // frame. Any interaction afterwards restores it for a replay.
  useEffect(() => {
    if (phase !== "done") return;
    const back = () => setPhase("idle");
    const opts = { once: true } as const;
    window.addEventListener("wheel", back, { passive: true, ...opts });
    window.addEventListener("touchmove", back, { passive: true, ...opts });
    window.addEventListener("keydown", back, opts);
    window.addEventListener("pointerdown", back, opts);
    return () => {
      window.removeEventListener("wheel", back);
      window.removeEventListener("touchmove", back);
      window.removeEventListener("keydown", back);
      window.removeEventListener("pointerdown", back);
    };
  }, [phase]);

  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    if (timer.current != null) clearTimeout(timer.current);
    if (heroTimer.current != null) clearTimeout(heroTimer.current);
  }, []);

  const play = useCallback(() => {
    const m = scrollRef.current;
    if (!m) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      m.scrollTo({ top: m.scrollHeight - m.clientHeight, behavior: "auto" });
      setPhase("done");
      return;
    }
    cancelled.current = false;
    setPhase("playing");
    m.scrollTop = 0;
    // Blank the hero for the recorder window, then build it on cue. The build lands at exactly
    // LEAD_IN, so the first thing the recording shows moving is the headline.
    onHeroCue?.("blank");
    heroTimer.current = setTimeout(() => { if (!cancelled.current) onHeroCue?.("build"); }, LEAD_IN);

    const plan = buildPlan(m);
    if (!plan.length) { setPhase("done"); return; }

    let i = 0;
    const runHold = () => {
      if (cancelled.current) return;
      const step = plan[i];
      timer.current = setTimeout(() => {
        if (cancelled.current) return;
        i += 1;
        if (i >= plan.length) { setPhase("done"); return; }
        runLeg();
      }, step.hold);
    };

    const runLeg = () => {
      if (cancelled.current) return;
      const step = plan[i];
      const from = m.scrollTop;
      const lim = m.scrollHeight - m.clientHeight;
      // LIVE RE-RESOLUTION. The document grows mid-take (a paragraph rewraps as its panel
      // animates), so a stop baked at plan time lands short and can guillotine a heading.
      // Re-derive from the section that stop was anchored to, at the moment the leg begins.
      const anchorTop = step.anchor.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop;
      const to = step.isLast ? lim : Math.min(lim, Math.max(0, Math.round(anchorTop - step.dy)));
      const dist = Math.abs(to - from);
      if (dist < 2) { runHold(); return; }
      const dur = travelMs(dist);
      const t0 = performance.now();
      const tick = (now: number) => {
        if (cancelled.current) return;
        const p = Math.min(1, (now - t0) / dur);
        m.scrollTop = Math.min(m.scrollHeight - m.clientHeight, from + (to - from) * ease(p));
        if (p < 1) { raf.current = requestAnimationFrame(tick); return; }
        raf.current = null;
        runHold();
      };
      raf.current = requestAnimationFrame(tick);
    };

    runHold(); // the first "hold" is the lead-in: dead still at the top
  }, [scrollRef, onHeroCue]);

  // The control is its own countdown. A number on screen would be IN the recording and a
  // mistimed trim would flash it; a draining ring that fades to nothing by the time the page
  // moves reads as an ordinary UI control even if a frame of it survives.
  const R = 7, C = 2 * Math.PI * R;
  return (
    <button
      type="button"
      onClick={play}
      aria-label={`Play the ${secs ?? ""}-second read-out`.replace("  ", " ")}
      className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-line bg-paper/90 py-2 pl-3 pr-4 text-[12.5px] text-ink-2 shadow-[0_1px_2px_rgba(10,10,10,0.04)] backdrop-blur hover:border-line-2 hover:text-ink ${
        phase === "idle"
          ? "opacity-100 transition-[opacity,transform] duration-500"
          : "pointer-events-none translate-y-2 opacity-0 transition-[opacity,transform] duration-[600ms] delay-[2400ms]"
      }`}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="absolute inset-0 -rotate-90">
          <circle
            cx="8" cy="8" r={R} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            style={{
              strokeDasharray: C,
              strokeDashoffset: phase === "playing" ? C : 0,
              opacity: phase === "playing" ? 0.5 : 0,
              transition: phase === "playing" ? `stroke-dashoffset ${LEAD_IN}ms linear, opacity .2s` : "none",
            }}
          />
        </svg>
        <svg width="7" height="9" viewBox="0 0 7 9" aria-hidden="true">
          <path d="M0 0.5 L7 4.5 L0 8.5 Z" fill="currentColor" />
        </svg>
      </span>
      <span className="tabular-nums">{secs == null ? "Play" : `${secs}s`}</span>
    </button>
  );
}
