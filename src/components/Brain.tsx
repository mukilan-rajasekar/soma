"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

/**
 * Soma's cortical hero.
 *
 * The REAL fsaverage6 surface (81,924 vertices) — the same cortex geometry the pipeline
 * predicts on — rendered as a fine wireframe in a single neutral grey (#c9c9c9), on white.
 * As the user scrolls, the brain rotates to bring a sequence of cortical regions to the
 * front, and each region blooms with its own colour gradient. The wireframe is drawn ON
 * TOP of the colour (the fill sits "inside", the mesh "outside"), so highlights read as a
 * gradient painted under the wire. Rotation + highlight are driven purely by scroll —
 * nothing animates on its own.
 */

const N_REGIONS = 4;

// Region centres in fsaverage6 local space (x = L→R, y = posterior→anterior, z = inf→sup),
// each with a two-stop gradient (centre colour → edge colour) and the brain pose that
// turns it toward the viewer. rotZ spins the upright brain left/right (turntable about the
// superior axis); rotX tilts it to reveal the crown.
const REGIONS = [
  { center: [0.0, 0.66, -0.46], a: 0x8b5cf6, b: 0xec4899 }, // frontal  — violet → magenta
  { center: [0.66, -0.05, -0.34], a: 0x22d3ee, b: 0x6366f1 }, // temporal — cyan → indigo
  { center: [0.0, -0.92, -0.06], a: 0xf59e0b, b: 0xef4444 }, // occipital — amber → red
  { center: [0.0, -0.52, 0.42], a: 0x34d399, b: 0x0ea5e9 }, // parietal — emerald → sky
];

// Scroll stops. STOPS[0] is the bare front view (no region). STOPS[i+1] faces REGIONS[i].
const STOPS = [
  { rotZ: 0.0, rotX: 0.0 }, // bare front
  { rotZ: 0.0, rotX: -0.12 }, // frontal
  { rotZ: Math.PI / 2, rotX: 0.02 }, // temporal (bring +x to front)
  { rotZ: Math.PI, rotX: 0.02 }, // occipital (bring -y to front)
  { rotZ: Math.PI, rotX: -0.55 }, // parietal (back + tilt to show crown)
];
const N_STOPS = STOPS.length;

const REGION_RADIUS = 0.62;

const VERT = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  #define NREG ${N_REGIONS}
  uniform vec3 uRegion[NREG];
  uniform vec3 uColorA[NREG];
  uniform vec3 uColorB[NREG];
  uniform float uAct[NREG];
  uniform float uRadius;
  varying vec3 vLocal;

  void main() {
    vec3 col = vec3(0.0);
    float a = 0.0;
    for (int i = 0; i < NREG; i++) {
      float d = distance(vLocal, uRegion[i]);
      float t = clamp(d / uRadius, 0.0, 1.0);
      float falloff = pow(smoothstep(uRadius, 0.0, d), 1.4);
      float w = uAct[i] * falloff;
      vec3 c = mix(uColorA[i], uColorB[i], t);
      col += c * w;
      a += w;
    }
    col /= max(a, 0.0001);
    // Write depth everywhere (so the opaque front cortex occludes the far wireframe) but
    // stay visually transparent where no region is active — alpha rises only with activation.
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.9));
  }
`;

function hexToVec3(hex: number) {
  return new THREE.Vector3(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  );
}

async function loadBin<T>(
  url: string,
  Type: { new (buf: ArrayBuffer): T },
): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return new Type(await res.arrayBuffer());
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function smoothstep(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
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
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.up.set(0, 0, 1); // superior (+z) is up → upright anatomical brain
    camera.position.set(0, 3.05, 0.15);
    camera.lookAt(0, 0, 0.02);

    // outer group: places the brain in the left ~2/3 of the frame (text lives on the right).
    // With this camera (at +y, up +z) world +x maps to screen-left, so a positive offset
    // slides the brain left; +0.95 lands its right edge near the 2/3 mark.
    const group = new THREE.Group();
    group.position.x = 0.35;
    group.scale.setScalar(1.1);
    scene.add(group);

    // inner group: the part scroll rotates
    const rotator = new THREE.Group();
    group.add(rotator);

    const uniforms = {
      uRegion: { value: REGIONS.map((r) => new THREE.Vector3(...r.center)) },
      uColorA: { value: REGIONS.map((r) => hexToVec3(r.a)) },
      uColorB: { value: REGIONS.map((r) => hexToVec3(r.b)) },
      uAct: { value: new Array(N_REGIONS).fill(0) },
      uRadius: { value: REGION_RADIUS },
    };

    let raf = 0;
    let disposed = false;
    let progress = 0; // damped scroll position, 0..1
    const geo = new THREE.BufferGeometry();

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
      const fillMat = new THREE.ShaderMaterial({
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

      // grey wireframe — drawn "outside", on top of the colour
      const wireMat = new THREE.MeshBasicMaterial({
        // color: 0xc9c9c9,
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function applyScroll(p: number) {
      const f = Math.min(Math.max(p, 0), 1) * (N_STOPS - 1);
      const i = Math.min(Math.floor(f), N_STOPS - 2);
      const t = smoothstep(f - i);
      rotator.rotation.z = lerp(STOPS[i].rotZ, STOPS[i + 1].rotZ, t);
      rotator.rotation.x = lerp(STOPS[i].rotX, STOPS[i + 1].rotX, t);
      // region r peaks when the tour sits on stop r+1; neighbours cross-fade
      const acts = uniforms.uAct.value as number[];
      for (let r = 0; r < N_REGIONS; r++) {
        acts[r] = smoothstep(1 - Math.abs(f - (r + 1)));
      }
    }

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const target = progressRef.current ?? 0;
      progress += (target - progress) * 0.08;
      if (Math.abs(target - progress) < 1e-4) progress = target;
      applyScroll(progress);
      renderer.render(scene, camera);
    }
    function start() {
      if (raf) return;
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      geo.dispose();
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
