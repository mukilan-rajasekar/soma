"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Soma cortex — Variant 2, "Point Firing".
 *
 * The real fsaverage6 surface (81,924 vertices) rendered as a fine grey POINT CLOUD.
 * Activation travels the cortex as expanding ripples: a few seed points fire in sequence,
 * each radiating a soft wavefront. Points caught by an advancing front briefly brighten to a
 * muted accent hue and scale up, then settle back to grey — neurons firing across the surface.
 *
 * On-brand constraints (shared spec):
 *  - No post-processing. Scene renders straight to a transparent canvas over the white page.
 *  - No dark stage/vignette. renderer alpha + clearAlpha 0 keep the page pure white.
 *  - Glow reads as colour bleeding through paper, so we use NORMAL (source-over) blending with
 *    a sub-white colour, not additive: added light over white clips to white and vanishes, which
 *    is the exact washout the previous attempt hit. premultipliedAlpha:false keeps straight-alpha
 *    source-over so the muted accent tints the white instead of blowing it out.
 *  - At most ~1–2 fronts bright at once (staggered seed phases + max() over seeds, so intensity
 *    per point is bounded by 1 → never a blown-out core). Mostly grey, one soft accent hue.
 *  - Self-animating on a THREE.Clock, own rAF loop, dt-smoothed (framerate-independent), with a
 *    slow multi-axis organic drift (never a single-axis spin). prefers-reduced-motion → one
 *    calm static frame, no loop.
 *
 * Camera / scale / placement reuse Brain.tsx (upright z-up cortex, brain in the left ~2/3).
 */

const NSEED = 3;
// Seconds for one ripple to travel from seed to the far edge of the cortex.
const SEED_PERIOD = 4.6;
// Staggered launch phases → their peaks never coincide, so firing reads as a sequence.
const PHASE_OFFSET = [0, 1 / 3, 2 / 3] as const;
// Gentle constant nod so the cortex sits at a natural editorial angle.
const BASE_TILT = -0.12;

const VERT = /* glsl */ `
  precision highp float;
  #define NSEED ${NSEED}
  uniform vec3 uSeedCenter[NSEED];
  uniform float uSeedRadius[NSEED];
  uniform float uSeedAmp[NSEED];
  uniform float uShellWidth;
  uniform float uBasePx;
  uniform float uGrow;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  attribute float aRand;
  varying float vFire;
  varying float vRand;

  void main() {
    vRand = aRand;

    // Intensity = the strongest single wavefront touching this point (max, not sum → bounded by 1,
    // so overlapping fronts can never pile up into a blown-out core).
    float fire = 0.0;
    for (int i = 0; i < NSEED; i++) {
      float d = distance(position, uSeedCenter[i]);
      float x = (d - uSeedRadius[i]) / uShellWidth;
      float shell = exp(-x * x);          // soft Gaussian ring around the advancing front
      fire = max(fire, uSeedAmp[i] * shell);
    }
    vFire = clamp(fire, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    // Fine points, with per-point size jitter and a soft scale-up on firing. Perspective
    // attenuation (uSizeScale = drawingBufferHeight/2) so far points shrink; capped for safety.
    float sizeVar = mix(0.82, 1.18, aRand);
    float px = uBasePx * sizeVar * (1.0 + vFire * uGrow);
    float ps = px * (uSizeScale / max(-mv.z, 0.001));
    gl_PointSize = clamp(ps, 0.0, 7.0 * uPixelRatio);

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uAccent;
  uniform vec3 uGrey;
  uniform float uBaseAlpha;
  uniform float uFireAlpha;
  varying float vFire;
  varying float vRand;

  void main() {
    // Round, soft point sprite.
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float mask = smoothstep(0.5, 0.12, r);

    // Mostly grey (with a hair of per-point tone variation); firing lerps toward the muted accent.
    vec3 base = uGrey * mix(0.92, 1.06, vRand);
    vec3 col = mix(base, uAccent, vFire);

    float a = mix(uBaseAlpha, uFireAlpha, smoothstep(0.0, 1.0, vFire)) * mask;
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

export default function BrainPointFiring() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    // outer group: brain in the left ~2/3 of the frame (matches the hero placement/scale).
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

    const uniforms = {
      uSeedCenter: { value: seedCenters },
      uSeedRadius: { value: seedRadius },
      uSeedAmp: { value: seedAmp },
      uShellWidth: { value: 0.2 },
      uBasePx: { value: 0.011 },
      uGrow: { value: 1.7 },
      uSizeScale: { value: 1 },
      uPixelRatio: { value: 1 },
      // Colours are authored as literal sRGB values (numeric Color ctor = no colour-management
      // conversion), so what the shader writes is what the sRGB framebuffer shows.
      uGrey: { value: new THREE.Color(0.62, 0.62, 0.63) },
      uAccent: { value: new THREE.Color(0.4, 0.46, 0.78) }, // muted indigo/slate
      uBaseAlpha: { value: 0.62 },
      uFireAlpha: { value: 0.9 },
    };

    const clock = new THREE.Clock();
    let raf = 0;
    let disposed = false;
    let ready = false;
    let tAccum = 0;
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
        (Math.imul((cycle + 1) | 0, 2654435761) ^ Math.imul((i + 3) | 0, 40503)) >>>
        0;
      return anchors[h % anchors.length];
    }

    // Advance the seeds: each cycles through birth→travel→fade; staggered so ~1–2 peak at a time.
    function updateSeeds(t: number) {
      for (let i = 0; i < NSEED; i++) {
        const local = t / SEED_PERIOD + PHASE_OFFSET[i];
        const cycle = Math.floor(local);
        const u = local - cycle; // 0..1 progress of this ripple
        // Envelope: 0 at birth and death, peaks mid-travel (raised sine, slightly sharpened).
        seedAmp[i] = Math.pow(Math.max(Math.sin(Math.PI * u), 0), 1.5);
        seedRadius[i] = u * maxR; // wavefront expands outward
        seedCenters[i].copy(pickAnchor(cycle, i));
      }
    }

    // Slow organic multi-axis drift — a gentle tumble, never a monotonous spin.
    function updatePose(t: number) {
      rotator.rotation.z = 0.1 * Math.sin(t * 0.11);
      rotator.rotation.x = BASE_TILT + 0.06 * Math.sin(t * 0.075 + 0.6);
      rotator.rotation.y = 0.05 * Math.sin(t * 0.045);
    }

    function renderStatic() {
      if (!ready) return;
      // A calm, representative frame (one front mid-travel) for prefers-reduced-motion.
      updateSeeds(3.4);
      updatePose(3.4);
      renderer.render(scene, camera);
    }

    function resize() {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const pr = Math.min(window.devicePixelRatio || 1, 2); // cap pixelRatio at 2
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
      updateSeeds(tAccum);
      updatePose(tAccum);
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

    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      geo.dispose();
      mat?.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
