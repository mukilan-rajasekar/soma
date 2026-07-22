"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Soma's cortical hero — infinite turntable.
 *
 * The REAL fsaverage6 surface (81,924 vertices) — the same cortex geometry the pipeline
 * predicts on — rendered as a fine grey wireframe with a coloured emissive fill underneath.
 * An unbounded scroll accumulator (owned by Landing, damped here) spins the brain forever
 * about its superior (+z) axis; a ring of 12 regions lights up by angular proximity to the
 * front, so 2-3 bloom at once and cycle seamlessly as it turns. A slow idle drift keeps it
 * breathing with no input.
 *
 * ── Bloom approach (the anti-black-flash fix) ──────────────────────────────────────────────
 * Chosen recipe: the RECOMMENDED "keep the white editorial page" variant from the build spec.
 * Bloom is *added light* — it only reads against darkness, and a glow over pure white clips
 * to white and vanishes. So the area behind the brain is darkened INSIDE the render by a
 * fullscreen dark radial-vignette quad (dark where the brain sits on the left ~2/3, alpha → 0
 * toward the right so the white page + text still show through the transparent canvas there).
 *
 * Two composers reconstruct transparency deterministically so no frame can ever flash black:
 *   1) bloomComposer renders the scene into an OPAQUE HDR target (clearAlpha = 1). Because the
 *      target is opaque, UnrealBloom never samples an ambiguous (…,0) pixel — a flash is
 *      impossible there.
 *   2) finalComposer renders the scene again with a TRANSPARENT clear (clearAlpha = 0), then a
 *      mix pass adds the bloom texture and rebuilds the canvas alpha as coverage =
 *      max(base coverage, bloom luminance) — a pure function of THIS frame, so it cannot
 *      oscillate. OutputPass does tone-map + linear→sRGB, keeping colour correct without an
 *      opaque black background.
 * renderer.autoClear = false + each RenderPass clearing explicitly means no frame ever samples
 * an uncleared ping-pong buffer; the getDelta() clamp guards tab-switch spikes. Net: a real
 * white page on the right, a dark bloom stage under the brain, and zero black frames.
 */

const TAU = Math.PI * 2;

// 12 regions on an even azimuthal ring about the superior (+z) axis.
const N = 12;

// One full turntable per 1.0 of accumulated (unbounded) scroll progress.
const ROT_PER_UNIT = TAU;

// Front-facing azimuth in rotator-local space (camera sits on +y).
const FRONT = Math.PI / 2;

// dt-damping rate (1/sec): ~5 glidey … ~10 snappy.
const K = 7;

// Slow idle turntable so it breathes with no input (units/sec, dt-scaled → frame-rate free).
const IDLE_DRIFT = 0.02;

// Static pose used under prefers-reduced-motion (a region sits at front, neighbours half-lit).
const STATIC_PROGRESS = 0.25;

// Spatial size of each region's glow on the cortex surface.
const REGION_RADIUS = 0.72;

// Angular half-width of the activation window (~1.4 region-gaps each side → 2-3 lit at once).
const HALF = (1.4 * TAU) / N;

// Emissive gain at a region's hot core (bloom threshold headroom).
const EMISSIVE_GAIN = 1.9;

// Crown tilt: a constant base plus a slow sinusoidal nod (continuous → no velocity jump).
const BASE_TILT = -0.15;
const TILT_AMP = 0.08;
const TILT_SPEED = 0.35;

const VERT = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  #define NREG ${N}
  uniform vec3 uRegion[NREG];
  uniform vec3 uColorA[NREG];
  uniform vec3 uColorB[NREG];
  uniform float uAct[NREG];
  uniform float uRadius;
  uniform float uGain;
  varying vec3 vLocal;

  void main() {
    vec3 col = vec3(0.0);
    float a = 0.0;
    for (int i = 0; i < NREG; i++) {
      float d = distance(vLocal, uRegion[i]);
      float falloff = pow(smoothstep(uRadius, 0.0, d), 1.4);
      float w = uAct[i] * falloff;
      float t = clamp(d / uRadius, 0.0, 1.0);
      vec3 c = mix(uColorA[i], uColorB[i], t);
      col += c * w;
      a += w;
    }
    // Weighted average so overlapping active regions mix cleanly.
    col /= max(a, 0.0001);
    // Emissive gain at the hot core pushes it above the bloom threshold → brighter highlights.
    float core = pow(clamp(a, 0.0, 1.0), 2.0);
    col *= (1.0 + uGain * core);
    // Write depth everywhere (near cortex occludes far wireframe) but stay visually transparent
    // where no region is active — alpha rises only with activation.
    gl_FragColor = vec4(col, clamp(a * 1.4, 0.0, 0.95));
  }
`;

// Fullscreen dark radial vignette — the bloom stage. Positions straight to clip space so it
// always fills the viewport regardless of camera/aspect; drawn first, no depth interaction.
const VIGNETTE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const VIGNETTE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uAspect;
  void main() {
    // Dark core sits under the brain (left-of-centre); tall on wide screens.
    vec2 p = vUv - vec2(0.36, 0.5);
    p.y /= max(uAspect, 1.0);
    float r = length(p);
    float dark = 1.0 - smoothstep(0.22, 0.78, r);
    // Hard fade on the right so the white page + text column stay pure white.
    float rightFade = 1.0 - smoothstep(0.55, 0.75, vUv.x);
    // Dark values are LINEAR (OutputPass encodes → sRGB); kept low so nothing here blooms.
    gl_FragColor = vec4(vec3(0.02, 0.025, 0.045), clamp(dark, 0.0, 1.0) * rightFade * 0.97);
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

// Wrap to (-π, π] so region i re-blooms every full turn — no start, no end, no clamp.
function wrapPi(x: number) {
  return Math.atan2(Math.sin(x), Math.cos(x));
}

// Wide, periodic, C1 window (raised cosine): peak 1 at front, smooth to 0 at the edges.
function activationWindow(d: number) {
  const t = Math.min(Math.abs(d) / HALF, 1);
  return 0.5 * (1 + Math.cos(t * Math.PI));
}

export default function Brain({
  progressRef,
}: {
  progressRef: RefObject<number>;
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
        powerPreference: "high-performance",
      });
    } catch {
      return; // no WebGL — the overlay UI still works over a plain white page
    }
    // Canvas transparent for the page; each RenderPass clears explicitly (anti-flash guarantee).
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.up.set(0, 0, 1); // superior (+z) is up → upright anatomical brain
    camera.position.set(0, 3.05, 0.15);
    camera.lookAt(0, 0, 0.02);

    // outer group: places the brain in the left ~2/3 of the frame (text lives on the right).
    const group = new THREE.Group();
    group.position.x = 0.35;
    group.scale.setScalar(1.1);
    scene.add(group);

    // inner group: the part scroll rotates (the turntable).
    const rotator = new THREE.Group();
    group.add(rotator);

    // Even azimuthal ring of regions about +z. Radii 0.62 (x, L-R) / 0.92 (y, post-ant) hug
    // the lateral surface. Colours are built as sRGB HSL → stored LINEAR for the HDR pipeline.
    const RING = Array.from({ length: N }, (_, i) => {
      const th = (i / N) * TAU;
      return {
        theta: th,
        center: new THREE.Vector3(
          0.62 * Math.cos(th),
          0.92 * Math.sin(th),
          -0.05,
        ),
        a: new THREE.Color().setHSL(i / N, 0.85, 0.62, THREE.SRGBColorSpace),
        b: new THREE.Color().setHSL(
          (i / N + 0.06) % 1,
          0.9,
          0.5,
          THREE.SRGBColorSpace,
        ),
      };
    });

    const uniforms = {
      uRegion: { value: RING.map((r) => r.center) },
      uColorA: { value: RING.map((r) => r.a) },
      uColorB: { value: RING.map((r) => r.b) },
      uAct: { value: new Array<number>(N).fill(0) },
      uRadius: { value: REGION_RADIUS },
      uGain: { value: EMISSIVE_GAIN },
    };

    // Dark bloom stage — a fullscreen clip-space quad, drawn first, no depth interaction.
    const vignetteMat = new THREE.ShaderMaterial({
      vertexShader: VIGNETTE_VERT,
      fragmentShader: VIGNETTE_FRAG,
      uniforms: { uAspect: { value: 1 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const vignette = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vignetteMat);
    vignette.frustumCulled = false;
    vignette.renderOrder = -1;
    scene.add(vignette);

    const clock = new THREE.Clock();
    let raf = 0;
    let disposed = false;
    let progress = 0; // damped, unbounded scroll position
    let driftAccum = 0; // ever-growing idle turntable
    let tAccum = 0; // elapsed (clamped) for the crown nod
    const geo = new THREE.BufferGeometry();
    let fillMat: THREE.ShaderMaterial | null = null;
    let wireMat: THREE.MeshBasicMaterial | null = null;

    // ── Two-composer, transparency-reconstructed bloom (see top-of-file comment) ──
    const { w: iw, h: ih } = stageSize();

    // 1) BLOOM composer — scene → OPAQUE HDR target. Opaque = flash is impossible.
    const bloomComposer = new EffectComposer(renderer); // r185 targets default to HalfFloatType
    bloomComposer.renderToScreen = false;
    const bloomRender = new RenderPass(scene, camera);
    bloomRender.clearColor = new THREE.Color(0x000000);
    bloomRender.clearAlpha = 1; // OPAQUE clear
    bloomComposer.addPass(bloomRender);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(iw, ih),
      0.95, // strength
      0.5, // radius
      0.6, // threshold
    );
    bloomComposer.addPass(bloomPass);

    // 2) FINAL composer — scene again (transparent clear) + mix pass rebuilds alpha as coverage.
    const finalComposer = new EffectComposer(renderer);
    const baseRender = new RenderPass(scene, camera);
    baseRender.clearColor = new THREE.Color(0x000000);
    baseRender.clearAlpha = 0; // base keeps real transparency
    finalComposer.addPass(baseRender);
    const mixMat = new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null }, // ShaderPass fills this from the read buffer
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        void main(){
          vec4 base  = texture2D(baseTexture,  vUv);
          vec3 bloom = texture2D(bloomTexture, vUv).rgb;
          float bl = dot(bloom, vec3(0.2126, 0.7152, 0.0722)); // bloom luminance = extra coverage
          gl_FragColor = vec4(base.rgb + bloom, clamp(max(base.a, bl), 0.0, 1.0));
        }`,
    });
    const mixPass = new ShaderPass(mixMat, "baseTexture");
    finalComposer.addPass(mixPass);
    const outputPass = new OutputPass(); // tone-map + colorspace, final blit
    finalComposer.addPass(outputPass);

    (async () => {
      const [pos, idx] = await Promise.all([
        loadBin("/brain/fs6_pos.bin", Float32Array),
        loadBin("/brain/fs6_idx.bin", Uint32Array),
      ]);
      if (disposed) return;

      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();

      // colour fill — sits "inside", writes depth so the near cortex hides the far wireframe,
      // pushed back a hair by polygonOffset so the wireframe wins the co-planar depth test.
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

      // grey wireframe — drawn "outside", on top of the colour.
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
      vignetteMat.uniforms.uAspect.value = w / h;
      // Composers honour logical size × pixelRatio, and forward device px to each pass
      // (UnrealBloomPass.resolution included) — so no manual bloomPass.resolution.set needed.
      bloomComposer.setPixelRatio(pr);
      bloomComposer.setSize(w, h);
      finalComposer.setPixelRatio(pr);
      finalComposer.setSize(w, h);
      if (reduceMotion) renderOnce(STATIC_PROGRESS); // keep the static pose crisp after resize
    }

    // Pure, continuous function of progress — angular velocity is continuous everywhere.
    function updatePose(p: number, t: number) {
      const alpha = p * ROT_PER_UNIT;
      rotator.rotation.z = alpha; // turntable about superior axis, forever
      rotator.rotation.x = BASE_TILT + TILT_AMP * Math.sin(t * TILT_SPEED);
      const acts = uniforms.uAct.value;
      for (let i = 0; i < N; i++) {
        const d = wrapPi(RING[i].theta + alpha - FRONT);
        acts[i] = activationWindow(d);
      }
    }

    function renderOnce(p: number) {
      updatePose(p, 0);
      bloomComposer.render();
      finalComposer.render();
    }

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05); // clamp tab-switch spikes (also anti-flash)
      tAccum += dt;
      driftAccum += IDLE_DRIFT * dt; // breathe with no input
      const target = (progressRef.current ?? 0) + driftAccum; // unbounded
      progress += (target - progress) * (1 - Math.exp(-dt * K));
      updatePose(progress, tAccum);
      bloomComposer.render();
      finalComposer.render();
    }

    function start() {
      if (reduceMotion) {
        renderOnce(STATIC_PROGRESS); // hold a static pose, no rAF churn
        return;
      }
      if (raf) return;
      clock.getDelta(); // discard the load-time gap so the first frame's dt is sane
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      geo.dispose();
      vignetteMat.dispose();
      vignette.geometry.dispose();
      fillMat?.dispose();
      wireMat?.dispose();
      mixMat.dispose();
      bloomPass.dispose();
      bloomComposer.dispose();
      finalComposer.dispose();
      renderer.dispose();
    };
  }, [progressRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 block h-full w-full"
    />
  );
}
