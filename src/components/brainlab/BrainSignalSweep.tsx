"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Soma — brain-lab variant 1: "Signal Sweep".
 *
 * A delicate grey wireframe cortex (the real fsaverage6 surface, 81,924 vertices) with a
 * single luminous activation FRONT that sweeps across the surface over time — like a signal
 * propagating through tissue. The front is a plane travelling along a fixed anatomical axis;
 * a soft ShaderMaterial fill UNDER the wireframe lights the vertices the front is crossing
 * (raised-cosine falloff), with a sharp leading edge and a long trailing fade so it reads as
 * a wave, not a stripe. Colour is a gentle 2-stop indigo→teal gradient across the band.
 *
 * On-brand rules (Swiss/editorial, pure-white page):
 *   - No post-processing, no bloom, no dark stage/vignette. Rendered straight to the canvas,
 *     which is transparent over the white page (alpha:true, clearAlpha 0).
 *   - Glow is soft, low-opacity colour bleeding UNDER the grey wire — never a blown-out core.
 *     At most one band (a brief second at the seam) is bright at a time.
 *   - Self-animating on a THREE.Clock + its own rAF loop; dt-smoothed → framerate independent,
 *     infinite and seamless (the front wraps by exactly one period). A slow organic tumble on
 *     two axes keeps it alive. prefers-reduced-motion holds one calm static frame.
 *
 * Camera / scale / placement reuse the working hero (Brain.tsx): upright camera (up = +z,
 * pos (0, 3.05, 0.15)), brain in the left ~2/3 (x offset 0.35, scale 1.1). Bloom & vignette
 * stripped — this file is self-contained and imports only `three` (no addons).
 */

// --- sweep shape (anatomical units; brain half-width ~0.8) ---------------------------------
const LEAD_HALF = 0.3; // sharp leading edge: the front the signal is approaching
const TRAIL_HALF = 0.78; // long trailing fade: the wake the signal leaves behind
const SWEEP_SECONDS = 5.5; // seconds for the front to traverse one period
const PEAK_ALPHA = 0.55; // max glow opacity — soft colour bleed, never opaque

// Sweep axis in anatomical space: mostly left→right (screen-horizontal) with a gentle
// posterior + superior tilt so the wavefront crosses on a diagonal rather than a flat slice.
const SWEEP_DIR = new THREE.Vector3(1, 0.3, 0.35).normalize();

// A gentle 2-stop gradient along the band — one soft accent hue family (blue), low saturation.
const TRAIL_COLOR = new THREE.Vector3(0.24, 0.62, 0.7); // muted teal (the wake)
const LEAD_COLOR = new THREE.Vector3(0.36, 0.42, 0.86); // soft indigo (the front)

// Slow organic tumble (2 axes), gentle amplitudes about the natural upright pose.
const DRIFT_X_AMP = 0.06;
const DRIFT_X_SPEED = 0.19;
const DRIFT_Z_AMP = 0.11;
const DRIFT_Z_SPEED = 0.13;

const VERT = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vLocal;

  uniform vec3  uDir;        // normalised sweep axis (anatomical space)
  uniform float uFront;      // front position along uDir, wrapped to [0, uPeriod)
  uniform float uPeriod;     // spacing between successive fronts → seamless wrap
  uniform float uLeadHalf;   // window half-width ahead of the front
  uniform float uTrailHalf;  // window half-width behind the front (longer → trailing fade)
  uniform vec3  uLeadColor;
  uniform vec3  uTrailColor;
  uniform float uPeak;

  const float PI = 3.14159265;

  void main() {
    // Signed distance along the sweep axis, then distance to the NEAREST front (periodic).
    float s = dot(vLocal, uDir);
    float dw = s - uFront;
    dw -= uPeriod * floor(dw / uPeriod + 0.5); // wrap into (-uPeriod/2, uPeriod/2]

    // Asymmetric raised-cosine: sharp ahead of the front (dw > 0), long fade behind (dw < 0).
    float hw = dw >= 0.0 ? uLeadHalf : uTrailHalf;
    float t = clamp(abs(dw) / hw, 0.0, 1.0);
    float glow = 0.5 * (1.0 + cos(t * PI)); // 1 at the front, smooth to 0 at the edge

    // Gentle 2-stop gradient: teal in the wake → indigo at the leading edge.
    float mixT = clamp(dw / uTrailHalf * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uTrailColor, uLeadColor, mixT);

    // Soft, low-opacity bleed. Depth is still written everywhere (alpha 0 off-band) so the near
    // cortex occludes the far wireframe, exactly like the hero's fill.
    float a = pow(glow, 0.9) * uPeak;
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

export default function BrainSignalSweep() {
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
      return; // no WebGL — the page still reads fine over pure white
    }
    // Transparent over the white page: no clear colour, no dark stage.
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.up.set(0, 0, 1); // superior (+z) up → upright anatomical brain
    camera.position.set(0, 3.05, 0.15);
    camera.lookAt(0, 0, 0.02);

    // outer group: brain in the left ~2/3 of the frame (text lives on the right).
    const group = new THREE.Group();
    group.position.x = 0.35;
    group.scale.setScalar(1.1);
    scene.add(group);

    // inner group: the part the organic tumble rotates.
    const rotator = new THREE.Group();
    group.add(rotator);

    const uniforms = {
      uDir: { value: SWEEP_DIR },
      uFront: { value: 0 },
      uPeriod: { value: 2.1 }, // refined once real geometry extent is known
      uLeadHalf: { value: LEAD_HALF },
      uTrailHalf: { value: TRAIL_HALF },
      uLeadColor: { value: LEAD_COLOR },
      uTrailColor: { value: TRAIL_COLOR },
      uPeak: { value: PEAK_ALPHA },
    };

    const clock = new THREE.Clock();
    let raf = 0;
    let disposed = false;
    let frontAccum = 0; // wrapped front position, [0, period)
    let tAccum = 0; // elapsed (clamped) for the tumble
    let sweepSpeed = 0.38; // units/sec, set from measured extent at load
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

      // Measure the cortex's extent along the sweep axis so the front spacing (period) keeps
      // ~one band on the brain at a time and the speed gives an even, elegant traversal.
      let sMin = Infinity;
      let sMax = -Infinity;
      const dx = SWEEP_DIR.x;
      const dy = SWEEP_DIR.y;
      const dz = SWEEP_DIR.z;
      for (let i = 0; i < pos.length; i += 3) {
        const s = pos[i] * dx + pos[i + 1] * dy + pos[i + 2] * dz;
        if (s < sMin) sMin = s;
        if (s > sMax) sMax = s;
      }
      const extent = sMax - sMin;
      const period = extent + (LEAD_HALF + TRAIL_HALF) * 0.5;
      uniforms.uPeriod.value = period;
      sweepSpeed = period / SWEEP_SECONDS;
      frontAccum = sMin - TRAIL_HALF; // start with the front just off the posterior edge

      // colour fill — sits "inside", writes depth so the near cortex hides the far wireframe;
      // polygonOffset nudges it back a hair so the wire wins the co-planar depth test.
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

      // delicate grey wireframe — drawn on top of the colour.
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
      if (reduceMotion) renderStaticFrame();
    }

    // Pure function of accumulators — no per-frame velocity discontinuity anywhere.
    function updatePose() {
      uniforms.uFront.value = frontAccum;
      rotator.rotation.x = DRIFT_X_AMP * Math.sin(tAccum * DRIFT_X_SPEED);
      rotator.rotation.z = DRIFT_Z_AMP * Math.sin(tAccum * DRIFT_Z_SPEED);
    }

    function renderStaticFrame() {
      // A calm frame: one soft band sitting a little anterior of centre, no tumble.
      const period = uniforms.uPeriod.value;
      uniforms.uFront.value = frontAccum + period * 0.55;
      rotator.rotation.x = 0;
      rotator.rotation.z = 0;
      renderer.render(scene, camera);
    }

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05); // clamp tab-switch spikes
      tAccum += dt;
      const period = uniforms.uPeriod.value;
      // Advance the front and keep it wrapped in [0, period) to preserve float precision over
      // arbitrarily long sessions; the shader's periodic wrap makes the seam invisible.
      frontAccum += sweepSpeed * dt;
      if (frontAccum >= period) frontAccum -= period * Math.floor(frontAccum / period);
      updatePose();
      renderer.render(scene, camera);
    }

    function start() {
      if (reduceMotion) {
        renderStaticFrame(); // hold a static pose, no rAF churn
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
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
  );
}
