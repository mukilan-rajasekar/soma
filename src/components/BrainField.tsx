"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * BrainField — the fused cortical hero, now a DIRECTLY CONTROLLABLE 3D model.
 *
 * ONE brain that is "Point Firing MAINLY, with elements of Pulse & Drift", rendered on the
 * dotted point-cloud geometry. The user orbits + zooms it like a model viewer; the firing keeps
 * animating in place, and the firing colour is a single hue that slowly cycles through the
 * spectrum over time.
 *
 *   BASE (dominant)  — the fsaverage6 surface (81,924 vertices) as a fine grey POINT CLOUD.
 *                      Activation travels as expanding ripples: a few seeds fire in sequence,
 *                      each radiating a soft wavefront; points caught by an advancing front
 *                      brighten to the current firing hue and scale up, then settle.
 *   FOLDED-IN (quieter)
 *     · BREATHE — a handful of regions gently pulse UNDER the firing on golden-ratio phase
 *                 offsets, always quieter than the firing.
 *   MOOD      — a slow macro cycle eases the emphasis between loud firing and calmer breathing
 *               and back (firing dominant overall).
 *
 * INTERACTION — scroll scrubs the FLOW, it does not orbit the model (BrainField owns all input):
 *   · Two-finger trackpad SCROLL (wheel, no ctrlKey) → scrub the flow timeline forward / back:
 *     the colour sweeps the spectrum, the firing pulses advance, and the cortex gently rotates,
 *     all coupled. Input injects VELOCITY; friction glides it to rest (fluid, never janky).
 *   · POINTER DRAG (mouse / single-finger touch) → scrub the same flow 1:1, with a release fling.
 *   · PINCH (ctrl+wheel on Mac trackpad; two-finger distance on touch) → camera DOLLY zoom.
 *   At idle the scrub holds (no yaw drift) but the cortex gently NODS top-bottom for life; that
 *   nod resets to level the moment you scroll again. A slow baseline keeps the pulse + colour alive.
 *
 * HARD visual rules: NO post-processing (no EffectComposer / UnrealBloom), NO dark stage /
 * vignette. Transparent canvas over the pure-white page (alpha:true, clearAlpha 0). Glow reads
 * as colour bleeding through paper — NormalBlending (source-over) on a sub-white colour, never
 * additive, never a blown-out white core. Camera / scale / placement reuse Brain.tsx.
 */

// ── INTERACTION — scroll scrubs the FLOW, it does not orbit the model ────────────────────────
// The wheel (and drag) don't grab the cortex — they scrub a living TIMELINE. Advancing the flow
// sweeps the colour through the spectrum, pushes the firing pulses along, AND gently rotates the
// cortex, all coupled together. Input injects VELOCITY into the scrub and friction bleeds it off,
// so the flow surges then glides to rest — fluid, never janky (trackpad deltas arrive noisy +
// quantised + with a momentum tail; here they only nudge a velocity that's always smoothed). At
// idle the scrub holds still (no drift); a slow baseline keeps the pulse + colour quietly alive.

// Wheel (two-finger trackpad scroll) → flow-seconds/sec of scrub velocity injected per px of delta.
const SCROLL_IMPULSE = 0.02;
// Pointer-drag pixels → flow-seconds of scrub, applied 1:1 while dragging.
const DRAG_SCRUB = 0.01;
// Friction (1/sec): how fast injected scrub velocity bleeds off. Higher = settles sooner.
const FRICTION = 5.0;
// Hard cap on scrub speed (flow-seconds/sec) so a violent flick can't blur the whole piece.
const MAX_VEL = 4.5;
// Clamp per wheel event so one momentum spike / mouse-wheel notch can't over-inject.
const MAX_EVENT_DELTA = 100;
// Radians of cortex rotation per flow-second of scrub — how tightly the spin tracks the flow.
const YAW_PER_SCRUB = 0.35;

// ── IDLE PITCH NOD (top-bottom life when you're not scrolling; resets the moment you do) ──────
// Yaw holds at idle, but pitch gently nods so the cortex still feels alive. It fades in after a
// short stillness and snaps back to level as soon as you scroll / drag again.
const IDLE_NOD_AMP = 0.22; //   radians (~13°) of peak top-bottom nod
const IDLE_NOD_W1 = 0.483; //   rad/sec — slow wander component A (~13s period)
const IDLE_NOD_W2 = 0.739; //   rad/sec — slow wander component B (~8.5s, incommensurate → no loop)
const IDLE_NOD_DELAY = 0.7; //  seconds of stillness before the nod begins fading in
const IDLE_ONSET_RATE = 0.7; // ease rate (1/sec) fading the nod IN  (gentle)
const IDLE_RESET_RATE = 7.0; // ease rate (1/sec) fading the nod OUT (quick reset on scroll)

// Pinch (ctrl+wheel) delta → world units of camera dolly. Higher = pinch zooms faster.
const ZOOM_GAIN = 0.012;
// Two-finger TOUCH pinch: pixels of finger-spread → world units of dolly (mobile only).
const PINCH_GAIN = 0.01;
// Camera dolly clamp (distance from the lookAt target). Smaller = closer = bigger cortex.
const ZOOM_MIN = 1.6; // closest the camera may dolly in
const ZOOM_MAX = 4.6; // furthest the camera may dolly out
// Ease rate (1/sec) for current → target ZOOM (zoom stays position-eased; scrub is velocity-driven).
const DAMP = 9;

// ── FIRING (dominant) ──────────────────────────────────────────────────────────────────────
// Idle advance: seconds of firing phase per real second. The firing self-animates at this calm
// rate forever (the geometry only moves when the user orbits/zooms it).
const IDLE_RATE = 0.32;
const NSEED = 3;
const SEED_PERIOD = 4.6; // seconds for one ripple to travel seed → far edge
const PHASE_OFFSET = [0, 1 / 3, 2 / 3] as const; // staggered so ~1–2 fronts peak at once

// ── BREATHING (secondary, quieter) ─────────────────────────────────────────────────────────
const NREG = 6;
const REGION_RADIUS = 0.6; // spatial reach of each region's breath (local units)
const BREATH_PERIOD = 8.0; // seconds for one region's full rise-and-fall
const PULSE_WIDTH = 0.22; // fraction of the cycle a region spends lit (soft, gentle)
const PHI = 0.6180339887498949; // golden-ratio phase spacing → scatters, never sweeps a ring

// ── MOOD (macro cycle: rotate between the two) ─────────────────────────────────────────────
const MACRO_PERIOD = 24; // seconds for one loud-firing → calm-breath → loud-firing swing
const FIRE_GAIN_MIN = 0.6; //   firing loudness floor (still dominant at its quietest)
const FIRE_GAIN_MAX = 1.0; //   firing loudness peak
const BREATH_GAIN_MIN = 0.25; // breathing floor
const BREATH_GAIN_MAX = 0.5; //  breathing lift when firing eases back (still under the firing)

// ── COLOUR (ONE hue that rotates through the spectrum over time) ────────────────────────────
// Every firing point shares a single hue at any instant; that hue cycles steadily through the
// whole spectrum on a wall clock (independent of the firing phase). ~one full cycle every ~30s.
const HUE_RATE = 0.033; // spectrum cycles per second (1 / HUE_RATE ≈ 30s per full rotation)
const FIRE_SAT = 0.5; // muted saturation — a soft spectrum on white, never neon
const FIRE_VAL = 0.72; // sub-white value so source-over never clips

// ── POSE ────────────────────────────────────────────────────────────────────────────────────
const BASE_TILT = -0.12; // resting pitch (added to the user's pitch)

// Static pose (seconds of phase) held under prefers-reduced-motion — a calm representative frame.
const STATIC_PHASE = 3.4;

// 6 regions hugging the lateral surface across both hemispheres (a subset of Pulse & Drift's).
const REGIONS: [number, number, number][] = [
  [-0.46, 0.74, 0.12], // L frontal
  [0.46, 0.72, 0.1], // R frontal
  [-0.62, 0.04, -0.24], // L temporal
  [0.62, -0.08, -0.2], // R temporal
  [0.4, -0.36, 0.34], // R parietal
  [0.06, 0.2, 0.55], // superior / motor
];

const VERT = /* glsl */ `
  precision highp float;
  #define NSEED ${NSEED}
  #define NREG ${NREG}
  uniform vec3 uSeedCenter[NSEED];
  uniform float uSeedRadius[NSEED];
  uniform float uSeedAmp[NSEED];
  uniform float uShellWidth;
  uniform vec3 uRegion[NREG];
  uniform float uRegAct[NREG];
  uniform float uRegRadius;
  uniform float uFireGain;
  uniform float uBreathGain;
  uniform float uBasePx;
  uniform float uGrow;
  uniform float uBreathGrow;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  attribute float aRand;
  varying float vFire;
  varying float vBreath;
  varying float vRand;

  void main() {
    vRand = aRand;

    // Firing = the strongest single wavefront touching this point (max, not sum → bounded by 1,
    // so overlapping fronts can never pile up into a blown-out core). Scaled by the mood gain.
    float fire = 0.0;
    for (int i = 0; i < NSEED; i++) {
      float d = distance(position, uSeedCenter[i]);
      float x = (d - uSeedRadius[i]) / uShellWidth;
      float shell = exp(-x * x);          // soft Gaussian ring around the advancing front
      fire = max(fire, uSeedAmp[i] * shell);
    }
    vFire = clamp(fire * uFireGain, 0.0, 1.0);

    // Breathing = distance-weighted nearest active region (max → bounded), kept quiet under the
    // firing by the mood gain and a smaller scale-up. A gentle secondary pulse, never a hotspot.
    float breath = 0.0;
    for (int i = 0; i < NREG; i++) {
      float dr = distance(position, uRegion[i]);
      float fall = smoothstep(uRegRadius, 0.0, dr);
      fall *= fall;                       // soft core, gentle edges
      breath = max(breath, uRegAct[i] * fall);
    }
    vBreath = clamp(breath * uBreathGain, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    // Fine points with per-point size jitter; firing scales up strongly, breathing softly.
    float sizeVar = mix(0.82, 1.18, aRand);
    float px = uBasePx * sizeVar * (1.0 + vFire * uGrow + vBreath * uBreathGrow);
    float ps = px * (uSizeScale / max(-mv.z, 0.001));
    gl_PointSize = clamp(ps, 0.0, 7.0 * uPixelRatio);

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uBreathCol;
  uniform vec3 uGrey;
  uniform float uBaseAlpha;
  uniform float uFireAlpha;
  uniform float uHueBase;
  uniform float uSat;
  uniform float uVal;
  varying float vFire;
  varying float vBreath;
  varying float vRand;

  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }

  void main() {
    // Round, soft point sprite.
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float mask = smoothstep(0.5, 0.12, r);

    // Mostly grey (a hair of per-point tone variation); breathing tints subtly first, firing
    // tints strongly on top. All targets are sub-white, so source-over never clips to white.
    vec3 base = uGrey * mix(0.92, 1.06, vRand);
    vec3 col = mix(base, uBreathCol, vBreath * 0.6);
    // Firing tints toward ONE muted hue shared by every point — that hue cycles through the
    // spectrum over time (driven by uHueBase), spatially uniform at any instant.
    vec3 fireCol = hsv2rgb(vec3(fract(uHueBase), uSat, uVal));
    col = mix(col, fireCol, vFire);

    // Firing dominates the alpha lift; breathing contributes only a gentle rise.
    float act = max(vFire, vBreath * 0.5);
    float a = mix(uBaseAlpha, uFireAlpha, smoothstep(0.0, 1.0, act)) * mask;
    gl_FragColor = vec4(col, a);
  }
`;

async function loadBin<T>(
  url: string,
  Type: { new (buf: ArrayBuffer): T },
): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return new Type(await res.arrayBuffer());
}

function fract(x: number) {
  return x - Math.floor(x);
}

// Narrow, periodic, C1 raised-cosine bump: 1 at phase 0, smoothly to 0 by ±PULSE_WIDTH.
function bump(phase01: number) {
  const d = Math.min(phase01, 1 - phase01);
  const t = Math.min(d / PULSE_WIDTH, 1);
  return 0.5 * (1 + Math.cos(t * Math.PI));
}

export default function BrainField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        // Straight (non-premultiplied) alpha so NormalBlending is classic source-over: the muted
        // accent tints the white page instead of the additive-over-white washout.
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      return; // no WebGL — the page still renders as plain white
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.up.set(0, 0, 1); // superior (+z) up → upright anatomical cortex

    // Camera dollies along a FIXED sight-line through the lookAt target: position stays on the
    // ray LOOK + camDir * distance, so only the distance (zoom) changes and orientation is stable.
    const LOOK = new THREE.Vector3(0, 0, 0.02);
    camera.position.set(0, 3.05, 0.15);
    const camDir = camera.position.clone().sub(LOOK);
    const BASE_DIST = camDir.length(); // resting camera distance (~3.05)
    camDir.normalize();
    camera.lookAt(LOOK); // orientation set once; dolly below never changes the sight-line

    // outer group: brain in the left ~2/3 of the frame (text lives on the right).
    const group = new THREE.Group();
    group.position.x = 0.35;
    group.scale.setScalar(1.1);
    scene.add(group);

    // inner group: carries the user-controlled orientation (turntable yaw about +z, tilt about x).
    const rotator = new THREE.Group();
    group.add(rotator);

    // ── Firing state (a handful of moving seeds; updated on CPU, evaluated in the shader) ──
    const seedCenters: THREE.Vector3[] = Array.from(
      { length: NSEED },
      () => new THREE.Vector3(),
    );
    const seedRadius = new Array<number>(NSEED).fill(0);
    const seedAmp = new Array<number>(NSEED).fill(0);

    const regionCenters = REGIONS.map(
      (r) => new THREE.Vector3(r[0], r[1], r[2]),
    );

    const uniforms = {
      uSeedCenter: { value: seedCenters },
      uSeedRadius: { value: seedRadius },
      uSeedAmp: { value: seedAmp },
      uShellWidth: { value: 0.2 },
      uRegion: { value: regionCenters },
      uRegAct: { value: new Array<number>(NREG).fill(0) },
      uRegRadius: { value: REGION_RADIUS },
      uFireGain: { value: FIRE_GAIN_MAX },
      uBreathGain: { value: BREATH_GAIN_MIN },
      uBasePx: { value: 0.011 },
      uGrow: { value: 1.7 },
      uBreathGrow: { value: 0.7 },
      uSizeScale: { value: 1 },
      uPixelRatio: { value: 1 },
      // Colours authored as literal sRGB values (numeric Color ctor = no colour-management
      // conversion), so what the shader writes is what the sRGB framebuffer shows.
      uGrey: { value: new THREE.Color(0.62, 0.62, 0.63) },
      uHueBase: { value: 0 }, // single firing hue; cycled steadily through the spectrum by time
      uSat: { value: FIRE_SAT },
      uVal: { value: FIRE_VAL },
      uBreathCol: { value: new THREE.Color(0.42, 0.52, 0.58) }, // quieter dusty teal (breathing)
      uBaseAlpha: { value: 0.62 },
      uFireAlpha: { value: 0.9 },
    };

    const clock = new THREE.Clock();
    let raf = 0;
    let disposed = false;
    let ready = false;
    let tAccum = 0; // idle clock — accumulated, tab-spike-clamped time (drives firing + hue)
    let maxR = 1;
    let anchors: THREE.Vector3[] = [];
    const geo = new THREE.BufferGeometry();
    let mat: THREE.ShaderMaterial | null = null;

    // ── Scroll-driven flow: a scrub timeline with inertia + eased zoom ──
    // `scrub` is your position on the flow timeline (a slow idle baseline is added on top each
    // frame). Input injects velocity into it; friction bleeds off. Rotation, hue and pulse all read
    // the resulting flow, so scrolling sweeps them together — it is not a camera orbit.
    let scrub = 0;
    let scrubVel = 0; // flow-seconds per second, friction-decayed
    let idleTime = 0; // seconds since the last scroll / drag (drives the idle pitch nod)
    let idlePitchGain = 0; // eased 0..1 envelope for the nod (0 while you interact, 1 when idle)
    const pitchPhase = Math.random() * 100; // per-load phase so the nod isn't identical every visit
    let curZoom = BASE_DIST;
    let tgtZoom = BASE_DIST;

    const clampZoom = (v: number) =>
      Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
    const clampVel = (v: number) => Math.max(-MAX_VEL, Math.min(MAX_VEL, v));

    (async () => {
      const [pos, idx] = await Promise.all([
        loadBin("/brain/fs6_pos.bin", Float32Array),
        loadBin("/brain/fs6_idx.bin", Uint32Array),
      ]);
      if (disposed) return;

      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));

      const vCount = pos.length / 3;

      // Per-point pseudo-random for size + tone variation (keeps the cloud from looking uniform).
      const rand = new Float32Array(vCount);
      for (let i = 0; i < vCount; i++) rand[i] = Math.random();
      geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));

      // Scale ripple travel + shell thickness to the actual cortex size.
      geo.computeBoundingSphere();
      const R = geo.boundingSphere ? geo.boundingSphere.radius : 1;
      maxR = R * 1.1;
      uniforms.uShellWidth.value = R * 0.16;

      // Anchor set for seed origins — evenly spaced in index space scatters them across both
      // hemispheres, so ripples are born all over the surface, not one hotspot.
      const nAnchor = 48;
      anchors = Array.from({ length: nAnchor }, (_, k) => {
        const vi = Math.floor(((k + 0.5) / nAnchor) * vCount);
        return new THREE.Vector3(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
      });

      mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        transparent: true,
        depthTest: true,
        depthWrite: true,
        blending: THREE.NormalBlending,
      });
      const points = new THREE.Points(geo, mat);
      rotator.add(points);

      ready = true;
      resize();
      start();
    })();

    // Deterministic roam: a different anchor each ripple, scattered by a hash of (cycle, seed).
    function pickAnchor(cycle: number, i: number): THREE.Vector3 {
      const h =
        (Math.imul((cycle + 1) | 0, 2654435761) ^
          Math.imul((i + 3) | 0, 40503)) >>>
        0;
      return anchors[h % anchors.length];
    }

    // Advance the firing seeds along the effective phase: each cycles birth→travel→fade,
    // staggered so ~1–2 peak at a time. The idle clock feeds `phase`.
    function updateSeeds(phase: number) {
      for (let i = 0; i < NSEED; i++) {
        const local = phase / SEED_PERIOD + PHASE_OFFSET[i];
        const cycle = Math.floor(local);
        const u = local - cycle; // 0..1 progress of this ripple
        seedAmp[i] = Math.pow(Math.max(Math.sin(Math.PI * u), 0), 1.5);
        seedRadius[i] = u * maxR; // wavefront expands outward
        seedCenters[i].copy(pickAnchor(cycle, i));
      }
    }

    // Secondary breathing regions along the same effective phase (quieter than the firing).
    function updateBreath(phase: number) {
      const acts = uniforms.uRegAct.value;
      for (let i = 0; i < NREG; i++) {
        const p = fract(phase / BREATH_PERIOD - i * PHI);
        acts[i] = bump(p);
      }
    }

    // Mood macro cycle (driven by the steady idle clock so the two moods swing predictably):
    // eases emphasis between loud firing and calmer breathing. Firing dominant overall.
    function updateMood(t: number) {
      const macro = 0.5 + 0.5 * Math.sin((Math.PI * 2 * t) / MACRO_PERIOD);
      uniforms.uFireGain.value =
        FIRE_GAIN_MIN + (FIRE_GAIN_MAX - FIRE_GAIN_MIN) * macro;
      uniforms.uBreathGain.value =
        BREATH_GAIN_MIN + (BREATH_GAIN_MAX - BREATH_GAIN_MIN) * (1 - macro);
    }

    function renderStatic() {
      if (!ready) return;
      // A calm, representative frame for prefers-reduced-motion — fixed pose, no rAF.
      uniforms.uFireGain.value = 0.85;
      uniforms.uBreathGain.value = 0.4;
      uniforms.uHueBase.value = STATIC_PHASE * HUE_RATE;
      updateSeeds(STATIC_PHASE);
      updateBreath(STATIC_PHASE);
      rotator.rotation.z = 0;
      rotator.rotation.x = BASE_TILT;
      camera.position.copy(LOOK).addScaledVector(camDir, BASE_DIST);
      renderer.render(scene, camera);
    }

    function resize() {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const pr = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.5 : 2);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.uPixelRatio.value = pr;
      uniforms.uSizeScale.value = h * pr * 0.5; // matches three's size-attenuation convention
      if (reduceMotion) renderStatic();
    }

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05); // clamp tab-switch spikes → dt-smoothed
      tAccum += dt;

      // Integrate the scrub flywheel: velocity advances the flow, friction bleeds it off (both
      // framerate-independent). While dragging we freeze this and drive scrub directly so the
      // finger stays glued; release hands the drag's velocity back for a fling.
      if (!dragging) {
        scrub += scrubVel * dt;
        scrubVel *= Math.exp(-dt * FRICTION);
      }
      // Zoom eases toward its target (position control — smooth + precise for a dolly).
      curZoom += (tgtZoom - curZoom) * (1 - Math.exp(-dt * DAMP));

      // The master flow = a slow idle baseline (keeps the pulse + colour quietly alive) plus your
      // scrub. Colour, pulse AND rotation all read it, so scrolling sweeps them together.
      const flow = tAccum + scrub;
      const phase = flow * IDLE_RATE;
      updateSeeds(phase);
      updateBreath(phase);
      updateMood(tAccum); // mood balance stays steady (independent of scrub) so gains don't jump

      // ONE hue for all firing points, swept through the spectrum by the flow.
      uniforms.uHueBase.value = flow * HUE_RATE;

      // Idle pitch nod: fades in after a beat of stillness, snaps back to level the moment you
      // scroll (idleTime is reset to 0 in the input handlers). A slow two-sine wander reads "random".
      idleTime += dt;
      const nodTarget = idleTime > IDLE_NOD_DELAY ? 1 : 0;
      const nodRate = nodTarget < idlePitchGain ? IDLE_RESET_RATE : IDLE_ONSET_RATE;
      idlePitchGain += (nodTarget - idlePitchGain) * (1 - Math.exp(-dt * nodRate));
      const nod =
        Math.sin((tAccum + pitchPhase) * IDLE_NOD_W1) * 0.6 +
        Math.sin((tAccum + pitchPhase) * IDLE_NOD_W2 + 1.3) * 0.4;

      // Rotation is COUPLED to the scrub (not a free orbit): the cortex turns as the flow moves.
      // At idle scrub holds → yaw rests where you left it; scroll advances flow → it rotates along.
      rotator.rotation.z = scrub * YAW_PER_SCRUB;
      rotator.rotation.x = BASE_TILT + idlePitchGain * IDLE_NOD_AMP * nod;
      // Dolly the camera along its fixed sight-line: smaller distance = closer = bigger cortex.
      camera.position.copy(LOOK).addScaledVector(camDir, curZoom);

      renderer.render(scene, camera);
    }

    function start() {
      if (reduceMotion) {
        renderStatic(); // one static frame, no rAF churn
        return;
      }
      if (raf) return;
      clock.getDelta(); // discard the load-time gap so the first dt is sane
      raf = requestAnimationFrame(frame);
    }

    // ── Direct-manipulation input (BrainField owns it all) ──────────────────────────────────
    // Two-finger trackpad scroll rotates; Mac pinch (ctrl+wheel) dollies. preventDefault the
    // wheel — the hero is a fixed full-screen page, so there is no page scroll to lose.
    const normDelta = (d: number, mode: number) => {
      // Normalise wheel units to pixels (Firefox mouse wheels report lines / pages), then clamp so
      // one momentum spike or mouse-wheel notch can't over-inject scrub.
      const px = mode === 1 ? d * 16 : mode === 2 ? d * window.innerHeight : d;
      return Math.max(-MAX_EVENT_DELTA, Math.min(MAX_EVENT_DELTA, px));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      idleTime = 0; // any wheel input (scroll or pinch) resets the idle nod back to level
      if (e.ctrlKey) {
        // Pinch: trackpad pinch-out emits deltaY<0 → dolly closer (zoom in); pinch-in zooms out.
        tgtZoom = clampZoom(tgtZoom + e.deltaY * ZOOM_GAIN);
      } else {
        // Scroll scrubs the flow: vertical is primary, horizontal adds in. Scroll-down pushes the
        // flow forward (colour + pulse advance, cortex rotates along). Sign is trivially flippable.
        const d = normDelta(e.deltaY, e.deltaMode) + normDelta(e.deltaX, e.deltaMode);
        scrubVel = clampVel(scrubVel + d * SCROLL_IMPULSE);
      }
    };

    // Pointer drag = mouse drag AND single-finger touch (pointer events unify both). Dragging
    // scrubs the same flow 1:1 and estimates a release velocity, so a flick keeps the flow gliding.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastMoveT = 0;
    let dragScrubVel = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      lastMoveT = e.timeStamp;
      idleTime = 0; // grabbing counts as interaction → reset the idle nod
      scrubVel = 0; // stop any coasting so the grab is precise
      dragScrubVel = 0;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      idleTime = 0; // sustained drag keeps the nod suppressed
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      // Drag right / up pushes the flow forward (one coherent scrub gesture, both axes projected).
      const ds = (dx - dy) * DRAG_SCRUB;
      scrub += ds; // 1:1 while held
      const mdt = Math.max((e.timeStamp - lastMoveT) / 1000, 1 / 240);
      lastMoveT = e.timeStamp;
      dragScrubVel = dragScrubVel * 0.7 + (ds / mdt) * 0.3; // smoothed release velocity
    };
    const endDrag = (e: PointerEvent) => {
      if (dragging) scrubVel = clampVel(dragScrubVel); // fling: hand momentum to the flywheel
      dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
      canvas.style.cursor = "grab";
    };

    // Optional two-finger TOUCH pinch (mobile): track finger spread → dolly. Single-finger touch
    // is already handled by the pointer path above, so we only act on exactly two touches.
    let pinchDist: number | null = null;
    const touchDist = (e: TouchEvent) => {
      const a = e.touches[0];
      const b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        dragging = false; // a second finger cancels the single-finger orbit
        pinchDist = touchDist(e);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchDist != null) {
        e.preventDefault();
        idleTime = 0; // two-finger pinch is interaction → reset the idle nod
        const d = touchDist(e);
        // Fingers apart (d grows) → dolly closer (zoom in); pinch together → zoom out.
        tgtZoom = clampZoom(tgtZoom - (d - pinchDist) * PINCH_GAIN);
        pinchDist = d;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchDist = null;
    };

    // Reduced motion → static frame only: no rAF, and skip every input listener too.
    const interactive = !reduceMotion;
    if (interactive) {
      canvas.style.cursor = "grab";
      window.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", endDrag);
      canvas.addEventListener("pointercancel", endDrag);
      canvas.addEventListener("touchstart", onTouchStart, { passive: true });
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
      canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    }

    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (interactive) {
        window.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", endDrag);
        canvas.removeEventListener("pointercancel", endDrag);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
      }
      geo.dispose();
      mat?.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full cursor-grab touch-none"
    />
  );
}
