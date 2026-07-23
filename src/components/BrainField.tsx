"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

/**
 * BrainField — the fused cortical hero.
 *
 * ONE brain that is "Point Firing MAINLY, with elements of Pulse & Drift", rendered on the
 * dotted point-cloud geometry and gently scroll-reactive.
 *
 *   BASE (dominant)  — the fsaverage6 surface (81,924 vertices) as a fine grey POINT CLOUD.
 *                      Activation travels as expanding ripples: a few seeds fire in sequence,
 *                      each radiating a soft wavefront; points caught by an advancing front
 *                      brighten to a muted indigo/slate accent and scale up, then settle.
 *   FOLDED-IN (quieter)
 *     · DRIFT   — a slow organic multi-axis tumble (summed low-frequency incommensurate sines,
 *                 never a plain single-axis spin), amplitudes small so the cortex stays upright.
 *     · BREATHE — a handful of regions gently pulse UNDER the firing on golden-ratio phase
 *                 offsets, always quieter than the firing.
 *   MOOD      — a slow macro cycle eases the emphasis between loud firing and calmer
 *               drift+breathing and back, so it feels like it rotates between the two moods
 *               (firing dominant overall).
 *
 * SCROLL — an optional progressRef (same contract as Brain.tsx) scrubs the whole activity +
 *   rotation forward; an idle clock keeps it alive when the user stops. Framerate-independent
 *   (THREE.Clock getDelta clamped) and damped. With no progressRef (lab mode) the component
 *   attaches its own wheel + touch listeners so scroll can be demonstrated standalone.
 *
 * HARD visual rules: NO post-processing (no EffectComposer / UnrealBloom), NO dark stage /
 * vignette. Transparent canvas over the pure-white page (alpha:true, clearAlpha 0). Glow reads
 * as colour bleeding through paper — NormalBlending (source-over) on a sub-white colour, never
 * additive, never a blown-out white core. Camera / scale / placement reuse Brain.tsx.
 */

// ── SCROLL REACTIVITY (tune these) ─────────────────────────────────────────────────────────
// How strongly accumulated scroll progress scrubs the activity + rotation forward. Higher =
// scrolling jumps the firing/tumble further ahead per unit of scroll. Landing feeds ~1 unit of
// progress per vigorous scroll gesture, so this is roughly "seconds of phase per full scroll".
const SCROLL_GAIN = 3.5;
// Idle advance: seconds of phase per real second when nobody scrolls. Kept LOW so very little
// happens without scrolling — the cortex is mostly calm at rest and comes alive as you scroll.
const IDLE_RATE = 0.32;
// dt-damping rate (1/sec) applied to the scroll accumulator so scrubbing glides, never snaps.
const SCROLL_DAMP = 6;
// Lab-mode (no progressRef) input gains — mirror Landing's own accumulator.
const WHEEL_GAIN = 0.0007;
const TOUCH_GAIN = 0.0018;
// Direct per-axis rotation added by scroll (radians per unit of accumulated scroll), so every
// scroll also tumbles the cortex a little in ALL THREE dimensions, accumulating as you go.
// Different per-axis gains → it tumbles in 3D rather than spinning about one axis. Tune freely.
const SCROLL_ROT_X = 0.5;
const SCROLL_ROT_Y = 0.45;
const SCROLL_ROT_Z = 0.85;

// ── FIRING (dominant) ──────────────────────────────────────────────────────────────────────
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
const MACRO_PERIOD = 24; // seconds for one loud-firing → calm-drift → loud-firing swing
const FIRE_GAIN_MIN = 0.6; //   firing loudness floor (still dominant at its quietest)
const FIRE_GAIN_MAX = 1.0; //   firing loudness peak
const BREATH_GAIN_MIN = 0.25; // breathing floor
const BREATH_GAIN_MAX = 0.5; //  breathing lift when firing eases back (still under the firing)

// ── COLOUR (firing sweeps through the spectrum) ────────────────────────────────────────────
// The firing colour is a muted HSV rainbow: hue varies smoothly around the cortex (azimuth), so
// travelling wavefronts sweep through the spectrum, and the whole wheel turns slowly with phase.
const HUE_RATE = 0.05; // spectrum turns per unit of phase (slow → idle stays calm)
const FIRE_SAT = 0.52; // muted saturation — a soft spectrum on white, never neon
const FIRE_VAL = 0.72; // sub-white value so source-over never clips

// ── DRIFT (slow organic multi-axis tumble) ─────────────────────────────────────────────────
const BASE_TILT = -0.12;
const DRIFT_X: [number, number, number][] = [
  [0.09, 0.17, 0.0],
  [0.05, 0.29, 1.7],
];
const DRIFT_Y: [number, number, number][] = [
  [0.13, 0.13, 0.6],
  [0.06, 0.31, 2.2],
];
const DRIFT_Z: [number, number, number][] = [
  [0.18, 0.11, 0.0],
  [0.09, 0.21, 0.9],
];

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
  attribute float aHue;
  varying float vFire;
  varying float vBreath;
  varying float vRand;
  varying float vHue;

  void main() {
    vRand = aRand;
    vHue = aHue;

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
  varying float vHue;

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
    // Firing tints toward a muted spectrum colour whose hue sweeps around the cortex.
    vec3 fireCol = hsv2rgb(vec3(fract(uHueBase + vHue), uSat, uVal));
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

function driftAngle(terms: [number, number, number][], t: number) {
  let a = 0;
  for (const [amp, rate, phase] of terms) a += amp * Math.sin(t * rate + phase);
  return a;
}

export default function BrainField({
  progressRef,
}: {
  progressRef?: RefObject<number>;
}) {
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
    camera.position.set(0, 3.05, 0.15);
    camera.lookAt(0, 0, 0.02);

    // outer group: brain in the left ~2/3 of the frame (text lives on the right).
    const group = new THREE.Group();
    group.position.x = 0.35;
    group.scale.setScalar(1.1);
    scene.add(group);

    // inner group: carries the slow organic drift.
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
      uHueBase: { value: 0 }, // rotating base hue for the firing spectrum (advanced by phase)
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
    let tAccum = 0; // idle clock — accumulated, tab-spike-clamped time
    let smoothedScroll = 0; // damped scroll accumulator
    let localScroll = 0; // lab-mode own accumulator (used when no progressRef)
    let maxR = 1;
    let anchors: THREE.Vector3[] = [];
    const geo = new THREE.BufferGeometry();
    let mat: THREE.ShaderMaterial | null = null;

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

      // Per-point hue for the firing spectrum: azimuth around the vertical (+z) axis, 0..1, so the
      // firing colour sweeps smoothly through the spectrum around the cortex as wavefronts travel.
      const hue = new Float32Array(vCount);
      for (let i = 0; i < vCount; i++) {
        hue[i] = Math.atan2(pos[i * 3], -pos[i * 3 + 1]) / (Math.PI * 2) + 0.5;
      }
      geo.setAttribute("aHue", new THREE.BufferAttribute(hue, 1));

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
    // staggered so ~1–2 peak at a time. Scroll and the idle clock both feed `phase`.
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

    // Slow organic multi-axis tumble (summed incommensurate sines) PLUS a direct accumulating
    // tumble driven by scroll on all three axes (different gains → real 3D rotation), so every
    // scroll visibly rotates the cortex a little; idle leaves this term constant (no idle spin).
    function updatePose(phase: number, scroll: number) {
      rotator.rotation.x = BASE_TILT + driftAngle(DRIFT_X, phase) + scroll * SCROLL_ROT_X;
      rotator.rotation.y = driftAngle(DRIFT_Y, phase) + scroll * SCROLL_ROT_Y;
      rotator.rotation.z = driftAngle(DRIFT_Z, phase) + scroll * SCROLL_ROT_Z;
    }

    // Mood macro cycle (driven by the steady idle clock so the two moods swing predictably):
    // eases emphasis between loud firing and calmer drift+breathing. Firing dominant overall.
    function updateMood(t: number) {
      const macro = 0.5 + 0.5 * Math.sin((Math.PI * 2 * t) / MACRO_PERIOD);
      uniforms.uFireGain.value =
        FIRE_GAIN_MIN + (FIRE_GAIN_MAX - FIRE_GAIN_MIN) * macro;
      uniforms.uBreathGain.value =
        BREATH_GAIN_MIN + (BREATH_GAIN_MAX - BREATH_GAIN_MIN) * (1 - macro);
    }

    // Effective phase = idle clock (keeps it alive) + damped scroll (scrubs it forward).
    function effectivePhase() {
      return tAccum * IDLE_RATE + smoothedScroll * SCROLL_GAIN;
    }

    function renderStatic() {
      if (!ready) return;
      // A calm, representative frame for prefers-reduced-motion.
      uniforms.uFireGain.value = 0.85;
      uniforms.uBreathGain.value = 0.4;
      uniforms.uHueBase.value = STATIC_PHASE * HUE_RATE;
      updateSeeds(STATIC_PHASE);
      updateBreath(STATIC_PHASE);
      updatePose(STATIC_PHASE, 0);
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

      // Damp the raw scroll target so scrubbing glides (framerate-independent).
      const target = progressRef ? (progressRef.current ?? 0) : localScroll;
      smoothedScroll += (target - smoothedScroll) * (1 - Math.exp(-dt * SCROLL_DAMP));

      const phase = effectivePhase();
      updateSeeds(phase);
      updateBreath(phase);
      updatePose(phase, smoothedScroll);
      uniforms.uHueBase.value = phase * HUE_RATE;
      updateMood(tAccum);
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

    // ── Lab mode: no progressRef → own wheel + touch listeners on a local accumulator ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      localScroll += e.deltaY * WHEEL_GAIN;
    };
    let lastTouch: number | null = null;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      if (lastTouch != null) localScroll += (lastTouch - y) * TOUCH_GAIN;
      lastTouch = y;
    };
    const onTouchEnd = () => {
      lastTouch = null;
    };
    const selfListen = !progressRef && !reduceMotion;
    if (selfListen) {
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", onTouchEnd, { passive: true });
    }

    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (selfListen) {
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
      }
      geo.dispose();
      mat?.dispose();
      renderer.dispose();
    };
  }, [progressRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
