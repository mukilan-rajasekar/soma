"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Variant 3 — "Pulse & Drift".
 *
 * The calmest, most on-brand cortical hero: the REAL fsaverage6 surface (81,924 vertices)
 * as a delicate grey WIREFRAME, with a soft coloured fill breathing UNDER it — colour bleeding
 * through paper on a pure-white page.
 *
 * Two independent, infinite, dt-smoothed motions keep it alive with no input and no scroll:
 *
 *   1) DRIFT — a gentle organic multi-axis tumble. Each rotation axis is a sum of two
 *      low-frequency sines at incommensurate rates, so the pose never repeats and never reads
 *      as a plain turntable; amplitudes stay small so the cortex stays upright and legible.
 *
 *   2) PULSE — 7 cortical regions each breathe on a phase-offset raised cosine. Offsets are
 *      spread by the golden ratio (not sequential) so activation scatters across the cortex
 *      like firing rather than sweeping in a circle; the pulse window is narrow enough that only
 *      1–2 regions are near-peak at any instant. Each region owns ONE muted accent hue
 *      (slate / indigo / teal family — no neon, no rainbow).
 *
 * Deliberately NO post-processing (no bloom), NO dark stage/vignette. The canvas is transparent
 * over the white page (alpha:true, clearAlpha 0). Glow is a low-opacity additive-feeling fill
 * kept under the wireframe so the mesh stays readable. prefers-reduced-motion renders one calm
 * static frame and skips the rAF loop. Reuses Brain.tsx's geometry load, upright camera, group
 * placement, resize and dispose; strips everything that made the previous attempt blow out.
 */

// Number of breathing regions.
const N = 7;

// Spatial reach of each region's glow across the cortex surface (local units).
const REGION_RADIUS = 0.62;

// Peak alpha of the colour fill — low, so it tints like ink through paper, never a bright core.
const FILL_OPACITY = 0.42;

// Breathing: seconds for one region's full rise-and-fall cycle, and the fraction of that cycle
// it spends lit. NARROW window (~19% each side) × 7 regions → ~1–2 near-peak at any moment.
const BREATH_PERIOD = 7.2;
const PULSE_WIDTH = 0.19;

// Golden-ratio phase spacing → activation scatters across the cortex instead of sweeping a ring.
const PHI = 0.6180339887498949;

// Static pose (seconds) held under prefers-reduced-motion — a calm frame with a couple lit.
const STATIC_T = 2.4;

// Drift: gentle multi-axis tumble as summed low-frequency sines. [amp(rad), rate, phase] pairs.
// Small amplitudes keep the cortex upright & anatomically legible; incommensurate rates never
// repeat → organic, infinite, framerate-independent (sampled from accumulated clamped time).
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

// 7 regions hugging the lateral surface across both hemispheres (frontal / temporal / parietal /
// occipital / motor), each with ONE muted accent hue in the slate–indigo–teal family.
const REGIONS: { center: [number, number, number]; hsl: [number, number, number] }[] = [
  { center: [-0.46, 0.74, 0.12], hsl: [0.62, 0.4, 0.52] }, // L frontal — indigo-slate
  { center: [0.46, 0.72, 0.1], hsl: [0.58, 0.42, 0.52] }, // R frontal — muted blue
  { center: [-0.62, 0.04, -0.24], hsl: [0.5, 0.36, 0.48] }, // L temporal — dusty teal
  { center: [0.62, -0.08, -0.2], hsl: [0.47, 0.34, 0.5] }, // R temporal — teal-green
  { center: [0.4, -0.36, 0.34], hsl: [0.66, 0.35, 0.55] }, // R parietal — slate-blue
  { center: [-0.3, -0.84, 0.06], hsl: [0.72, 0.32, 0.55] }, // L occipital — muted violet
  { center: [0.06, 0.2, 0.55], hsl: [0.68, 0.34, 0.58] }, // superior/motor — periwinkle
];

const VERT = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Soft region fill: each vertex takes the distance-weighted blend of nearby active regions.
// Alpha rises only with activation and is capped low, so inactive cortex is fully transparent
// and active patches read as a gentle colour bleed — never a blown-out white core.
const FRAG = /* glsl */ `
  precision highp float;
  #define NREG ${N}
  uniform vec3 uRegion[NREG];
  uniform vec3 uColor[NREG];
  uniform float uAct[NREG];
  uniform float uRadius;
  uniform float uOpacity;
  varying vec3 vLocal;

  void main() {
    vec3 col = vec3(0.0);
    float a = 0.0;
    for (int i = 0; i < NREG; i++) {
      float d = distance(vLocal, uRegion[i]);
      float falloff = smoothstep(uRadius, 0.0, d);
      falloff *= falloff;               // soft core, gentle edges
      float w = uAct[i] * falloff;
      col += uColor[i] * w;
      a += w;
    }
    col /= max(a, 0.0001);              // clean blend where active regions overlap
    float alpha = clamp(a, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, alpha);
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

// Narrow, periodic, C1 raised-cosine bump: 1 at phase 0, smoothly to 0 by ±PULSE_WIDTH, flat 0
// through the rest of the cycle. phase01 ∈ [0,1). Distance wraps so the breath is seamless.
function bump(phase01: number) {
  const d = Math.min(phase01, 1 - phase01); // 0 … 0.5 from nearest cycle boundary
  const t = Math.min(d / PULSE_WIDTH, 1);
  return 0.5 * (1 + Math.cos(t * Math.PI));
}

function fract(x: number) {
  return x - Math.floor(x);
}

function driftAngle(terms: [number, number, number][], t: number) {
  let a = 0;
  for (const [amp, rate, phase] of terms) a += amp * Math.sin(t * rate + phase);
  return a;
}

export default function BrainPulseDrift() {
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
        powerPreference: "high-performance",
      });
    } catch {
      return; // no WebGL — bail gracefully, the white page still stands
    }
    // Straight to the canvas, transparent over the white page — no composer, no vignette.
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();

    // Upright anatomical camera (reused verbatim from Brain.tsx).
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.up.set(0, 0, 1); // superior (+z) is up
    camera.position.set(0, 3.05, 0.15);
    camera.lookAt(0, 0, 0.02);

    // outer group — brain in the left ~2/3 (text lives on the right).
    const group = new THREE.Group();
    group.position.x = 0.35;
    group.scale.setScalar(1.1);
    scene.add(group);

    // inner group — the part the drift tumbles.
    const rotator = new THREE.Group();
    group.add(rotator);

    // Muted accent colours built as sRGB HSL.
    const centers = REGIONS.map(
      (r) => new THREE.Vector3(r.center[0], r.center[1], r.center[2]),
    );
    const colors = REGIONS.map((r) =>
      new THREE.Color().setHSL(r.hsl[0], r.hsl[1], r.hsl[2], THREE.SRGBColorSpace),
    );

    const uniforms = {
      uRegion: { value: centers },
      uColor: { value: colors },
      uAct: { value: new Array<number>(N).fill(0) },
      uRadius: { value: REGION_RADIUS },
      uOpacity: { value: FILL_OPACITY },
    };

    const clock = new THREE.Clock();
    let raf = 0;
    let disposed = false;
    let tAccum = 0; // accumulated, tab-spike-clamped time drives both motions
    const geo = new THREE.BufferGeometry();
    let fillMat: THREE.ShaderMaterial | null = null;
    let wireMat: THREE.MeshBasicMaterial | null = null;

    (async () => {
      const [pos, idx] = await Promise.all([
        loadBin("/brain/fs6_pos.bin", Float32Array),
        loadBin("/brain/fs6_idx.bin", Uint32Array),
      ]);
      if (disposed) return;

      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();

      // Colour fill — sits "inside" and writes depth so the near cortex hides the far wireframe;
      // polygonOffset pushes it a hair back so the wireframe wins the co-planar depth test.
      fillMat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const fill = new THREE.Mesh(geo, fillMat);
      fill.renderOrder = 0;
      rotator.add(fill);

      // Delicate grey wireframe — drawn on top of the colour, always readable.
      wireMat = new THREE.MeshBasicMaterial({
        color: 0xacacac,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const wire = new THREE.Mesh(geo, wireMat);
      wire.renderOrder = 1;
      rotator.add(wire);

      resize();
      start();
    })();

    function stageSize() {
      return {
        w: Math.max(1, window.innerWidth),
        h: Math.max(1, window.innerHeight),
      };
    }

    function resize() {
      const { w, h } = stageSize();
      const pr = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.5 : 2);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (reduceMotion) renderOnce(STATIC_T); // keep the static pose crisp after a resize
    }

    // Pure, continuous function of time → framerate-independent & infinite.
    function updatePose(t: number) {
      rotator.rotation.x = BASE_TILT + driftAngle(DRIFT_X, t);
      rotator.rotation.y = driftAngle(DRIFT_Y, t);
      rotator.rotation.z = driftAngle(DRIFT_Z, t);

      const acts = uniforms.uAct.value;
      for (let i = 0; i < N; i++) {
        // Each region breathes at BREATH_PERIOD, offset by a golden-ratio phase so activation
        // scatters across the cortex rather than sweeping a ring.
        const phase = fract(t / BREATH_PERIOD - i * PHI);
        acts[i] = bump(phase);
      }
    }

    function renderOnce(t: number) {
      updatePose(t);
      renderer.render(scene, camera);
    }

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05); // clamp tab-switch spikes
      tAccum += dt;
      updatePose(tAccum);
      renderer.render(scene, camera);
    }

    function start() {
      if (reduceMotion) {
        renderOnce(STATIC_T); // one calm frame, no rAF churn
        return;
      }
      if (raf) return;
      clock.getDelta(); // discard the load-time gap so the first dt is sane
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      geo.dispose();
      fillMat?.dispose();
      wireMat?.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
    />
  );
}
