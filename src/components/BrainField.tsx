"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * BrainField — the fused cortical hero: the point-cloud brain on the ORIGINAL scroll tour.
 *
 * TWO things are fused here, and the split is deliberate:
 *
 *   LOOK  — the point-cloud cortex (kept). The fsaverage6 surface (81,924 vertices) as a fine
 *           grey POINT CLOUD, alive with firing ripples + a quieter breathing pulse under a slow
 *           mood cycle. Nothing about the dots changed.
 *   MOTION — the original scroll tour (restored, from the first hero). Scroll does NOT free-spin
 *           the cortex; it walks a bounded 0→1 timeline through five POSES. Pose 0 is the bare
 *           front view; poses 1–4 each rotate a cortical region to face you and BLOOM it in its
 *           own two-stop colour gradient. Scroll back and the tour rewinds. Rotation and highlight
 *           are driven purely by scroll — the pose never animates on its own.
 *
 * The colour lands on the DOTS (not on a fill under a wireframe, as the original did): every point
 * inside an active region is tinted by that region's gradient — centre colour at the core, edge
 * colour at the rim — and lifted in size + opacity, so the highlight reads as a bloom in the cloud.
 *
 * COLOUR IS EARNED BY SCROLLING. At rest the whole cortex is monochrome: grey dots, graphite firing,
 * not a hint of hue anywhere. Colour exists only as a function of tour progress — the region bloom
 * fades in as its pose comes to front, and the firing/breathing tints are pulled off neutral by the
 * same weight, so the cortex agrees with itself. Scroll back to the top and all colour drains away.
 *
 * INTERACTION (BrainField owns all input):
 *   · Two-finger trackpad SCROLL / wheel → walk the tour forward / back (clamped 0..1, damped).
 *   · POINTER DRAG (mouse / single-finger touch) → drag up to advance the tour, down to rewind.
 *   · PINCH (ctrl+wheel on Mac trackpad; two-finger distance on touch) → camera DOLLY zoom.
 *   The pose NEVER moves on its own: at idle the cortex holds exactly where you left it — no spin,
 *   no drift, no nod. Only the firing keeps breathing in place, and only scroll turns the cortex.
 *
 * HARD visual rules: NO post-processing (no EffectComposer / UnrealBloom), NO dark stage /
 * vignette. Transparent canvas over the pure-white page (alpha:true, clearAlpha 0). Glow reads
 * as colour bleeding through paper — NormalBlending (source-over) on a sub-white colour, never
 * additive, never a blown-out white core. Camera / scale / placement reuse Brain.tsx.
 */

// ── THE SCROLL TOUR ─────────────────────────────────────────────────────────────────────────
// Region centres in fsaverage6 local space (x = L→R, y = posterior→anterior, z = inf→sup), each
// with a two-stop gradient (centre colour → edge colour). Straight from the original hero.
const TOUR = [
  { center: [0.0, 0.66, -0.46], a: 0x8b5cf6, b: 0xec4899 }, // frontal   — violet → magenta
  { center: [0.66, -0.05, -0.34], a: 0x22d3ee, b: 0x6366f1 }, // temporal  — cyan → indigo
  { center: [0.0, -0.92, -0.06], a: 0xf59e0b, b: 0xef4444 }, // occipital — amber → red
  { center: [0.0, -0.52, 0.42], a: 0x34d399, b: 0x0ea5e9 }, // parietal  — emerald → sky
] as const;
const NTOUR = TOUR.length;

// Scroll stops. STOPS[0] is the bare front view (no region). STOPS[i+1] faces TOUR[i]. rotZ spins
// the upright cortex left/right (turntable about the superior axis); rotX tilts to reveal the crown.
const STOPS = [
  { rotZ: 0.0, rotX: 0.0 }, //        bare front
  { rotZ: 0.0, rotX: -0.12 }, //      frontal
  { rotZ: Math.PI / 2, rotX: 0.02 }, // temporal  (bring +x to front)
  { rotZ: Math.PI, rotX: 0.02 }, //   occipital (bring -y to front)
  { rotZ: Math.PI, rotX: -0.55 }, //  parietal  (back + tilt to show the crown)
];
const N_STOPS = STOPS.length;

// Spatial reach of a region's bloom in the cloud (local units).
const TOUR_RADIUS = 0.62;
// How completely an active region's gradient overrides the grey/firing colour of its dots.
const TOUR_MIX = 0.95;
// Extra point-size lift for dots inside an active region (on top of the firing/breath lift).
const TOUR_GROW = 0.75;

// Wheel px → tour progress. 1/SCROLL_GAIN px of scroll walks the whole tour (~1430px end to end).
const SCROLL_GAIN = 0.0007;
// Pointer-drag px → tour progress (drag up advances). Coarser than the wheel: fingers travel less.
const DRAG_GAIN = 0.0018;
// Clamp per wheel event so one trackpad momentum spike can't jump a whole region.
const MAX_EVENT_DELTA = 100;
// Ease rate (1/sec) chasing the scroll target — the glide that makes the tour feel scrubbed, not cut.
const TOUR_DAMP = 5.5;

// Pinch (ctrl+wheel) delta → world units of camera dolly. Higher = pinch zooms faster.
const ZOOM_GAIN = 0.012;
// Two-finger TOUCH pinch: pixels of finger-spread → world units of dolly (mobile only).
const PINCH_GAIN = 0.01;
// Camera dolly clamp (distance from the lookAt target). Smaller = closer = bigger cortex.
const ZOOM_MIN = 1.6; // closest the camera may dolly in
const ZOOM_MAX = 4.6; // furthest the camera may dolly out
// Ease rate (1/sec) for current → target ZOOM.
const DAMP = 9;

// ── FIRING (dominant) ──────────────────────────────────────────────────────────────────────
// The firing self-animates on the wall clock at this calm rate forever — it is ambient life, not
// scroll-driven: scroll owns the POSE and the region highlight, nothing else.
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

// ── COLOUR (scroll is the ONLY source of hue) ───────────────────────────────────────────────
// At tour 0 the cortex is strictly monochrome: firing reads as denser graphite ink on the white
// page and breathing as a barely-there grey shift — no hue anywhere. Both tints are then lerped
// toward the active region's palette by that region's own activation, so hue only ever exists in
// proportion to how far the scroll has pushed a region to the front.
const FIRE_NEUTRAL: [number, number, number] = [0.38, 0.39, 0.42]; //  cool graphite (colourless firing)
const BREATH_NEUTRAL: [number, number, number] = [0.52, 0.53, 0.55]; // a whisper under the grey

// Static pose held under prefers-reduced-motion: the frontal region facing front, mid-bloom.
const STATIC_PROGRESS = 0.25;
const STATIC_PHASE = 3.4; // seconds of firing phase for that frame

// 6 regions hugging the lateral surface across both hemispheres (the breathing set — distinct
// from the TOUR set above, which scroll drives).
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
  #define NTOUR ${NTOUR}
  uniform vec3 uSeedCenter[NSEED];
  uniform float uSeedRadius[NSEED];
  uniform float uSeedAmp[NSEED];
  uniform float uShellWidth;
  uniform vec3 uRegion[NREG];
  uniform float uRegAct[NREG];
  uniform float uRegRadius;
  uniform vec3 uTourCenter[NTOUR];
  uniform vec3 uTourA[NTOUR];
  uniform vec3 uTourB[NTOUR];
  uniform float uTourAct[NTOUR];
  uniform float uTourRadius;
  uniform float uTourGrow;
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
  varying float vTour;
  varying vec3 vTourCol;
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

    // SCROLL TOUR — the region the tour currently faces blooms in its own two-stop gradient:
    // centre colour at the core of the region, edge colour out at the rim. Contributions are
    // summed then normalised by their own weight, so neighbouring regions cross-fade cleanly
    // during the walk between two stops instead of stacking into a brighter blob.
    vec3 tourCol = vec3(0.0);
    float tourW = 0.0;
    for (int i = 0; i < NTOUR; i++) {
      float d = distance(position, uTourCenter[i]);
      float t = clamp(d / uTourRadius, 0.0, 1.0);
      float falloff = pow(smoothstep(uTourRadius, 0.0, d), 1.4);
      float w = uTourAct[i] * falloff;
      tourCol += mix(uTourA[i], uTourB[i], t) * w;
      tourW += w;
    }
    vTourCol = tourCol / max(tourW, 0.0001);
    vTour = clamp(tourW, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    // Fine points with per-point size jitter; firing scales up strongly, breathing softly, and a
    // highlighted region lifts its dots so the bloom has body as well as colour.
    float sizeVar = mix(0.82, 1.18, aRand);
    float px = uBasePx * sizeVar * (1.0 + vFire * uGrow + vBreath * uBreathGrow + vTour * uTourGrow);
    float ps = px * (uSizeScale / max(-mv.z, 0.001));
    gl_PointSize = clamp(ps, 0.0, 7.0 * uPixelRatio);

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uBreathCol;
  uniform vec3 uFireCol;
  uniform vec3 uGrey;
  uniform float uBaseAlpha;
  uniform float uFireAlpha;
  uniform float uTourMix;
  varying float vFire;
  varying float vBreath;
  varying float vTour;
  varying vec3 vTourCol;
  varying float vRand;

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
    // Firing tints toward ONE muted hue shared by every point — cycling the spectrum off-tour,
    // pulled into the active region's palette while the tour holds on a region.
    col = mix(col, uFireCol, vFire);
    // The scroll tour paints last: dots inside the region the tour faces take its gradient.
    col = mix(col, vTourCol, vTour * uTourMix);

    // Firing dominates the alpha lift; the tour highlight lifts nearly as hard so the region
    // reads as a bloom; breathing contributes only a gentle rise.
    float act = max(max(vFire, vTour * 0.85), vBreath * 0.5);
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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function smoothstep01(t: number) {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}

// Narrow, periodic, C1 raised-cosine bump: 1 at phase 0, smoothly to 0 by ±PULSE_WIDTH.
function bump(phase01: number) {
  const d = Math.min(phase01, 1 - phase01);
  const t = Math.min(d / PULSE_WIDTH, 1);
  return 0.5 * (1 + Math.cos(t * Math.PI));
}

// Literal sRGB triple from a hex literal (no colour-management conversion).
function hexToColor(hex: number) {
  return new THREE.Color(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  );
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

    // inner group: carries the tour orientation (turntable yaw about +z, tilt about x).
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

    // ── Tour state (the scroll-driven region highlight) ──
    const tourCenters = TOUR.map((r) => new THREE.Vector3(...r.center));
    const tourA = TOUR.map((r) => hexToColor(r.a));
    const tourB = TOUR.map((r) => hexToColor(r.b));
    // Live tints, rewritten each frame from tour activation alone (neutral until you scroll).
    const fireCol = new THREE.Color(...FIRE_NEUTRAL);
    const breathCol = new THREE.Color(...BREATH_NEUTRAL);

    const uniforms = {
      uSeedCenter: { value: seedCenters },
      uSeedRadius: { value: seedRadius },
      uSeedAmp: { value: seedAmp },
      uShellWidth: { value: 0.2 },
      uRegion: { value: regionCenters },
      uRegAct: { value: new Array<number>(NREG).fill(0) },
      uRegRadius: { value: REGION_RADIUS },
      uTourCenter: { value: tourCenters },
      uTourA: { value: tourA },
      uTourB: { value: tourB },
      uTourAct: { value: new Array<number>(NTOUR).fill(0) },
      uTourRadius: { value: TOUR_RADIUS },
      uTourGrow: { value: TOUR_GROW },
      uTourMix: { value: TOUR_MIX },
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
      uFireCol: { value: fireCol }, //   firing tint  — neutral graphite until the tour earns hue
      uBreathCol: { value: breathCol }, // breath tint — neutral grey until the tour earns hue
      uBaseAlpha: { value: 0.62 },
      uFireAlpha: { value: 0.9 },
    };

    const clock = new THREE.Clock();
    let raf = 0;
    let disposed = false;
    let ready = false;
    let tAccum = 0; // wall clock — accumulated, tab-spike-clamped time (drives firing + hue)
    let maxR = 1;
    let anchors: THREE.Vector3[] = [];
    const geo = new THREE.BufferGeometry();
    let mat: THREE.ShaderMaterial | null = null;

    // ── The scroll tour: a bounded 0..1 timeline, damped toward wherever scroll left it ──
    // `tourTarget` is where the wheel / drag has pushed you; `tour` chases it so the walk between
    // two poses glides instead of cutting. Rotation AND region highlight read `tour` — nothing else.
    let tour = 0;
    let tourTarget = 0;
    let curZoom = BASE_DIST;
    let tgtZoom = BASE_DIST;

    const clampZoom = (v: number) =>
      Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));

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
    // staggered so ~1–2 peak at a time. The wall clock feeds `phase`.
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

    // Mood macro cycle: eases emphasis between loud firing and calmer breathing. Firing dominant.
    function updateMood(t: number) {
      const macro = 0.5 + 0.5 * Math.sin((Math.PI * 2 * t) / MACRO_PERIOD);
      uniforms.uFireGain.value =
        FIRE_GAIN_MIN + (FIRE_GAIN_MAX - FIRE_GAIN_MIN) * macro;
      uniforms.uBreathGain.value =
        BREATH_GAIN_MIN + (BREATH_GAIN_MAX - BREATH_GAIN_MIN) * (1 - macro);
    }

    // ── The tour itself: progress 0..1 → pose + which region is blooming ──
    // p maps onto N_STOPS poses; region r peaks exactly when the tour sits on stop r+1, and
    // neighbours cross-fade in between so the colour hands off as the cortex turns.
    function applyTour(p: number) {
      const f = clamp01(p) * (N_STOPS - 1);
      const i = Math.min(Math.floor(f), N_STOPS - 2);
      const t = smoothstep01(f - i);
      const acts = uniforms.uTourAct.value;
      for (let r = 0; r < NTOUR; r++) {
        acts[r] = smoothstep01(1 - Math.abs(f - (r + 1)));
      }
      return {
        rotZ: lerp(STOPS[i].rotZ, STOPS[i + 1].rotZ, t),
        rotX: lerp(STOPS[i].rotX, STOPS[i + 1].rotX, t),
      };
    }

    // Firing + breathing tints, derived ENTIRELY from tour activation: colourless neutrals at
    // tour 0, lerped toward the active region's palette (centre colour for the firing, edge colour
    // for the breath) by that region's weight. No wall clock anywhere — sit still and no hue can
    // appear; the only way to get colour on this cortex is to scroll a region to the front.
    function updateTints() {
      const acts = uniforms.uTourAct.value as number[];
      let w = 0;
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let br = 0;
      let bg = 0;
      let bb = 0;
      for (let i = 0; i < NTOUR; i++) {
        const a = acts[i];
        if (a <= 0) continue;
        w += a;
        ar += tourA[i].r * a;
        ag += tourA[i].g * a;
        ab += tourA[i].b * a;
        br += tourB[i].r * a;
        bg += tourB[i].g * a;
        bb += tourB[i].b * a;
      }
      if (w <= 1e-4) {
        fireCol.setRGB(...FIRE_NEUTRAL);
        breathCol.setRGB(...BREATH_NEUTRAL);
        return;
      }
      const k = Math.min(w, 1); // how much hue this frame has earned
      fireCol.setRGB(
        lerp(FIRE_NEUTRAL[0], ar / w, k),
        lerp(FIRE_NEUTRAL[1], ag / w, k),
        lerp(FIRE_NEUTRAL[2], ab / w, k),
      );
      breathCol.setRGB(
        lerp(BREATH_NEUTRAL[0], br / w, k),
        lerp(BREATH_NEUTRAL[1], bg / w, k),
        lerp(BREATH_NEUTRAL[2], bb / w, k),
      );
    }

    function renderStatic() {
      if (!ready) return;
      // A calm, representative frame for prefers-reduced-motion — fixed pose, no rAF.
      uniforms.uFireGain.value = 0.85;
      uniforms.uBreathGain.value = 0.4;
      updateSeeds(STATIC_PHASE);
      updateBreath(STATIC_PHASE);
      const pose = applyTour(STATIC_PROGRESS);
      updateTints();
      rotator.rotation.z = pose.rotZ;
      rotator.rotation.x = pose.rotX;
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

      // Ease the tour toward wherever scroll left it, and the camera toward its zoom target
      // (both framerate-independent).
      tour += (tourTarget - tour) * (1 - Math.exp(-dt * TOUR_DAMP));
      curZoom += (tgtZoom - curZoom) * (1 - Math.exp(-dt * DAMP));

      // Ambient life runs on the wall clock — the firing never stops, whether you scroll or not.
      const phase = tAccum * IDLE_RATE;
      updateSeeds(phase);
      updateBreath(phase);
      updateMood(tAccum);

      // Scroll owns the pose AND the colour: this is the whole tour. Nothing else touches the
      // rotation, so a cortex nobody is scrolling sits perfectly still.
      const pose = applyTour(tour);
      updateTints();
      rotator.rotation.z = pose.rotZ;
      rotator.rotation.x = pose.rotX;
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
    // Two-finger trackpad scroll walks the tour; Mac pinch (ctrl+wheel) dollies. preventDefault
    // the wheel — the hero is a fixed full-screen page, so there is no page scroll to lose.
    const normDelta = (d: number, mode: number) => {
      // Normalise wheel units to pixels (Firefox mouse wheels report lines / pages), then clamp so
      // one momentum spike or mouse-wheel notch can't jump a whole region.
      const px = mode === 1 ? d * 16 : mode === 2 ? d * window.innerHeight : d;
      return Math.max(-MAX_EVENT_DELTA, Math.min(MAX_EVENT_DELTA, px));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        // Pinch: trackpad pinch-out emits deltaY<0 → dolly closer (zoom in); pinch-in zooms out.
        tgtZoom = clampZoom(tgtZoom + e.deltaY * ZOOM_GAIN);
      } else {
        // Scroll down walks the tour forward through the regions; scroll up rewinds it.
        const d = normDelta(e.deltaY, e.deltaMode);
        tourTarget = clamp01(tourTarget + d * SCROLL_GAIN);
      }
    };

    // Pointer drag = mouse drag AND single-finger touch (pointer events unify both). Dragging UP
    // advances the tour, matching the direction a scroll-down gesture moves content.
    let dragging = false;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      tourTarget = clamp01(tourTarget + (lastY - e.clientY) * DRAG_GAIN);
      lastY = e.clientY;
    };
    const endDrag = (e: PointerEvent) => {
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
        dragging = false; // a second finger cancels the single-finger scrub
        pinchDist = touchDist(e);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchDist != null) {
        e.preventDefault();
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
