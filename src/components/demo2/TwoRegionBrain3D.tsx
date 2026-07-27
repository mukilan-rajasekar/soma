"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import TwoRegionBrain from "./TwoRegionBrain";
import { readVizTokens } from "./tokens";

/**
 * TwoRegionBrain3D — the science figure, on the real cortex.
 *
 * The 3D counterpart of demo2/TwoRegionBrain (the flat SVG it replaces): the SAME
 * fsaverage6 point cloud the landing hero renders (/brain/fs6_pos.bin, 81,924 vertices),
 * shrunk into a section card, turning on its own, with the two networks /preflight reads
 * marked in their lane colours and named on the model.
 *
 * Deliberately unlike the hero (BrainField.tsx, which stays untouched):
 *   · HANDS-OFF. No wheel / drag / pinch listeners at all and `pointer-events-none` on
 *     both layers. The hero is a toy you grab; this is a figure you read.
 *   · It TURNS on its own — one steady rotation about the superior axis, so both
 *     hemispheres and both networks come round without the reader doing anything.
 *   · LIGHTER cloud: paler grey, lower alpha, a fraction of the vertices, and the far
 *     half faded back. The dots are the paper the two networks are printed on.
 *   · FIXED colours, never the hero's cycling spectrum: dorsal is ink, ventral is
 *     accent-2 — the same two colours as the arcs, the legend and the RegionCards, so the
 *     brain and the charts read as one instrument. A patch never changes hue, so "the
 *     dark one" and "the teal one" stay reliable names for the whole scroll.
 *   · Per docs/DESIGN-SYSTEM.md ("colour must not be the only encoding") each network is
 *     also NAMED, on a chip pinned to the card, with hairline leaders that track its
 *     patches as the model turns and fade out as a patch rotates to the far side. Both
 *     hemispheres get a leader, because both networks are bilateral.
 *
 * HONESTY: this is a FIGURE, not a read-out. The patches are textbook peak coordinates
 * for the two networks placed on the surface — not the per-vertex Destrieux mask
 * build_roi_mask.py extracts from, and never a prediction value. It says "here is where
 * these two systems live", which is exactly the claim the section makes.
 */

type Props = {
  /** Eases the network colours + leaders in when the section reveals. */
  active?: boolean;
  /** Canvas height in CSS px. */
  height?: number;
};

// ── MODEL FRAME ───────────────────────────────────────────────────────────────────────
// tools/export_brain.py centres the fsaverage pial surface on its vertex centroid and
// divides by its max radius, KEEPING FreeSurfer RAS axes (x = L→R, y = P→A, z = I→S).
// These two constants invert that: they map the model's unit box back onto fsaverage's
// bounding box in millimetres (x ±70, y −103…+71, z −48…+80), so a textbook MNI peak can
// be dropped straight onto the surface.
const MM_PER_UNIT = 93.5;
const CENTROID_MM = [0, -19.6, 18.2] as const;

const toModel = (mm: readonly [number, number, number]) =>
  new THREE.Vector3(
    (mm[0] - CENTROID_MM[0]) / MM_PER_UNIT,
    (mm[1] - CENTROID_MM[1]) / MM_PER_UNIT,
    (mm[2] - CENTROID_MM[2]) / MM_PER_UNIT,
  );

/** 0 = dorsal attention, 1 = ventral salience. Two networks, two colours, forever. */
type Net = 0 | 1;

type Node = {
  net: Net;
  /** Textbook MNI peak in mm, RIGHT hemisphere — mirrored to the left at build time. */
  mm: readonly [number, number, number];
  /** Patch reach in model units (1 unit ≈ 93.5 mm), so 0.2 ≈ 19 mm. */
  reach: number;
};

// The nodes each network is marked by. Same two systems as build_roi_mask.py's
// DORSAL_ATTN_REGIONS (IPS · precentral/FEF · superior parietal) and AROUSAL_REGIONS
// (anterior insula · ACC). The ACC node is left off on purpose: it sits on the medial
// wall, invisible from every angle a turning lateral view offers, so drawing it would
// only fog the midline. The RegionCard beside this figure names it.
const NODES: readonly Node[] = [
  { net: 0, mm: [30, -58, 48], reach: 0.23 }, // intraparietal sulcus
  { net: 0, mm: [22, -66, 56], reach: 0.19 }, // superior parietal lobule
  { net: 0, mm: [28, -6, 54], reach: 0.19 }, //  frontal eye fields (superior precentral)
  { net: 1, mm: [38, 18, 2], reach: 0.27 }, //   anterior insula
  { net: 1, mm: [46, 14, -4], reach: 0.30 }, //  frontal operculum, the insula's lateral face
];

// ── MOTION ────────────────────────────────────────────────────────────────────────────
// Slower here than on /preflight (0.19 rad/s, ~33 s per turn). That rate is right for a page
// a reader dwells on, but this figure gets ~7 s of a 50-second scroll take, and 0.19 turns it
// 76° in that window — far enough to swing the ventral patch onto the far side, leaving its
// pinned VENTRAL chip pointing a leader line into empty space on the one beat whose entire
// claim is "two networks". At 0.06 the same window turns ~24°: enough parallax to read as a
// solid object rather than a picture, while both networks stay square-on for the whole take.
const SPIN_RATE = 0.06; //   rad/sec about the superior axis (~105 s per full turn)
const BASE_TILT = -0.2; //   resting pitch: a slight look-down, so the superior surface
//                           (where the dorsal network lives) is never edge-on
// The pose the rotation starts from, and the only one prefers-reduced-motion ever shows:
// a right lateral view, where both networks sit square-on to the reader (facing ≈ 0.62 for
// the dorsal nodes, ≈ 0.67 for the ventral ones — the best simultaneous view there is).
const STATIC_YAW = Math.PI / 2;
// The two networks breathe very gently, out of phase, on ALPHA and SIZE only — never on
// colour, so "one fixed colour each" survives the animation.
const BREATH_D = 7.0; //     seconds per dorsal breath
const BREATH_V = 9.0; //     seconds per ventral breath (incommensurate → never in lockstep)
const BREATH_DEPTH = 0.12; // peak-to-peak fraction
const REVEAL_RATE = 2.2; //  ease rate (1/sec) for the colour + leader fade-in

// ── FRAMING / CLOUD ───────────────────────────────────────────────────────────────────
const FOV = 30;
// Half-extents the camera must clear. Vertical: the superior-inferior reach plus what the
// tilt swings in. Horizontal: the anterior-posterior length, which swings into screen
// width as the model turns — frame for that and it never clips mid-rotation.
const FIT_V = 0.87;
const FIT_H = 0.98;
const FIT_MARGIN = 1.02;
const POINT_PX = 2.0; //   dot diameter in CSS px, held constant at any canvas size / dpr
// At this size the cortex is ~300 px across, so the full 81,924 vertices would pack several
// deep per pixel and read as a solid fog. A fifth of them reads as what it is: a stipple.
const KEEP = 0.22;
// Aerial perspective — how much of its alpha a dot keeps at the far face of the cortex.
// Base cloud drops hard so the near surface reads as a surface; a network patch keeps more,
// so when it swings to the far side it stays visible as a ghost rather than vanishing.
const FAR_FADE = 0.2;
const FAR_FADE_LIT = 0.5;
const LEADER_GAP = 4; //   px the leader stops short of the chip and of the patch

const VERT = /* glsl */ `
  precision highp float;
  uniform float uBasePx;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uCamDist;
  uniform float uBreathD;
  uniform float uBreathV;
  attribute float aRand;
  attribute float aDorsal;
  attribute float aVentral;
  varying float vD;
  varying float vV;
  varying float vBreath;
  varying float vDepth;
  varying float vRand;

  void main() {
    vRand = aRand;
    vD = aDorsal;
    vV = aVentral;
    // The breath belongs to whichever network owns this point. It drives alpha and size
    // downstream — never the mix toward the network's colour.
    vBreath = aDorsal >= aVentral ? uBreathD : uBreathV;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // 0 at the near face of the cortex, 1 at the far one (the model's radius is 1.0).
    vDepth = clamp((-mv.z - (uCamDist - 1.0)) * 0.5, 0.0, 1.0);

    // A lit dot grows as well as darkens. Weight, not just hue, is what makes a patch
    // read at this size — and it keeps the slate network legible next to the ink one,
    // which would otherwise win on contrast alone.
    float lit = max(vD, vV) * vBreath;
    float px = uBasePx * mix(0.85, 1.15, aRand) * (1.0 + lit * 0.9);
    gl_PointSize = clamp(px * (uSizeScale / max(-mv.z, 0.001)), 0.0, 6.0 * uPixelRatio);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uGrey;
  uniform vec3 uDorsal;
  uniform vec3 uVentral;
  uniform float uBaseAlpha;
  uniform float uLitAlpha;
  uniform float uFarFade;
  uniform float uFarFadeLit;
  uniform float uReveal;
  varying float vD;
  varying float vV;
  varying float vBreath;
  varying float vDepth;
  varying float vRand;

  void main() {
    // Round, soft point sprite.
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float mask = smoothstep(0.5, 0.14, r);

    // Base cloud: pale grey with a hair of per-point tone variation. Each network keeps
    // ONE fixed colour and the stronger membership wins outright, so where two patches
    // meet they can never blend into a third hue.
    vec3 col = uGrey * mix(0.94, 1.05, vRand);
    float w = max(vD, vV) * uReveal;
    col = mix(col, vD >= vV ? uDorsal : uVentral, w);

    // Every target is sub-white and blending is source-over, so colour bleeds through the
    // paper instead of blowing out. The far half fades back so the near surface reads as a
    // surface — but a patch fades less, so it ghosts through instead of disappearing.
    float fade = mix(1.0, mix(uFarFade, uFarFadeLit, w), vDepth);
    float a = mix(uBaseAlpha, uLitAlpha, w * vBreath) * fade * mask;
    gl_FragColor = vec4(col, a);
  }
`;

/** #rrggbb → a literal-sRGB Color. The numeric ctor skips colour management, and the
 *  shaders above don't encode either, so what is written is what the framebuffer shows. */
function literalColor(hex: string) {
  const h = hex.trim().replace("#", "");
  if (h.length !== 6) return new THREE.Color(0.5, 0.5, 0.5);
  return new THREE.Color(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const SVG_NS = "http://www.w3.org/2000/svg";

export default function TwoRegionBrain3D({ active = true, height = 320 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /** The two key chips, indexed by network — where each network's leaders start. */
  const chipRefs = useRef<Array<HTMLDivElement | null>>([null, null]);
  const activeRef = useRef(active);
  /** Set only under prefers-reduced-motion, where there is no loop to pick the prop up. */
  const redrawRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);

  // The reveal is a prop but the scene is built once, so hand it to the loop by ref.
  useEffect(() => {
    activeRef.current = active;
    redrawRef.current?.();
  }, [active]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    const chipD = chipRefs.current[0];
    const chipV = chipRefs.current[1];
    if (!wrap || !canvas || !svg || !chipD || !chipV) return;
    const chips = [chipD, chipV];

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tokens = readVizTokens();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        // Straight (non-premultiplied) alpha so NormalBlending is classic source-over.
        premultipliedAlpha: false,
      });
    } catch {
      // No WebGL → the flat SVG figure carries the section instead. Queued rather than set
      // inline so the swap isn't a cascading render inside this effect's commit.
      queueMicrotask(() => setFailed(true));
      return;
    }
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
    camera.up.set(0, 0, 1); // superior (+z) up → an upright anatomical cortex
    camera.position.set(0, 3.5, 0); // looks down −y; the distance is set by fit()
    camera.lookAt(0, 0, 0);

    const rotator = new THREE.Group(); // carries the rotation (yaw about +z) and the tilt
    scene.add(rotator);

    const uniforms = {
      uBasePx: { value: 0.03 },
      uSizeScale: { value: 1 },
      uPixelRatio: { value: 1 },
      uCamDist: { value: 3.5 },
      uBreathD: { value: 1 },
      uBreathV: { value: 1 },
      // A pale cloud: ink-3 lifted most of the way to the hairline grey. Lighter than the
      // hero's cortex on purpose — here the dots are background, not the subject.
      // Pushed paler and fainter than it was (0.52 / 0.55). At 1:1 the old cloud was fine, but
      // this figure is watched at ~640px in the recording, and there the two lit patches were
      // a slightly darker smudge inside a grey mass: the beat whose entire claim is "two
      // networks, measured separately" could not show two networks. Nothing about the regions
      // themselves changed, which matters — their size is anatomy, not a design decision. Only
      // the field they sit in got quieter, so the same patches read as figure instead of as
      // texture. Verified at 640px, not at 1:1.
      uGrey: { value: literalColor(tokens.ink3).lerp(literalColor(tokens.line2), 0.7) },
      uDorsal: { value: literalColor(tokens.ink) },
      uVentral: { value: literalColor(tokens.accent2) },
      uBaseAlpha: { value: 0.44 },
      uLitAlpha: { value: 1.0 },
      uFarFade: { value: FAR_FADE },
      uFarFadeLit: { value: FAR_FADE_LIT },
      uReveal: { value: 0 },
    };

    // Timer, not the deprecated Clock (three r183+). `connect` wires up the Page
    // Visibility API, so a backgrounded tab reports dt 0 instead of one huge jump.
    const timer = new THREE.Timer();
    timer.connect(document);
    const geo = new THREE.BufferGeometry();
    let mat: THREE.ShaderMaterial | null = null;
    let raf = 0;
    let disposed = false;
    let ready = false;
    let onScreen = true;
    let yaw = STATIC_YAW;
    let t = 0; //      accumulated animation clock (tab-spike clamped)
    let reveal = 0; // eased 0..1 colour + leader fade

    // One hairline per network per hemisphere, from the network's chip to whichever of its
    // nodes is facing the reader right now. A network is several patches, so a leader tied
    // to one fixed node would point at nothing for a third of every turn; instead it picks
    // the best-facing node each frame and GLIDES between them, which reads as the line
    // sweeping to the patch that just came round.
    type Leader = {
      net: Net;
      anchors: THREE.Vector3[];
      /** Eased endpoint, in canvas px. */
      ex: number;
      ey: number;
      placed: boolean;
      line: SVGLineElement;
      dot: SVGCircleElement;
    };
    const leaders: Leader[] = [];
    const LEADER_GLIDE = 6; // ease rate (1/sec) as the endpoint moves between nodes

    // ── Framing: sized to the CARD, not the window ─────────────────────────────────
    let cssW = 1;
    let cssH = 1;
    /** Chip boxes in wrapper-local px, where each network's leaders start. */
    const chipBox = [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 0 },
    ];
    const fit = () => {
      cssW = Math.max(1, wrap.clientWidth);
      cssH = Math.max(1, wrap.clientHeight);
      const pr = Math.min(window.devicePixelRatio || 1, 2.5);
      renderer.setPixelRatio(pr);
      renderer.setSize(cssW, cssH, false);
      svg.setAttribute("viewBox", `0 0 ${cssW} ${cssH}`);

      const wrapBox = wrap.getBoundingClientRect();
      chips.forEach((chip, i) => {
        const b = chip.getBoundingClientRect();
        chipBox[i] = { x: b.x - wrapBox.x, y: b.y - wrapBox.y, w: b.width, h: b.height };
      });

      // Pull the camera back just far enough that the cortex clears the frame at EVERY
      // yaw (see FIT_H), so the rotation never clips.
      const aspect = cssW / cssH;
      const tanHalf = Math.tan((FOV * Math.PI) / 360);
      const dist = (Math.max(FIT_V, FIT_H / aspect) / tanHalf) * FIT_MARGIN;
      camera.aspect = aspect;
      camera.position.set(0, dist, 0);
      camera.updateProjectionMatrix();

      uniforms.uPixelRatio.value = pr;
      uniforms.uCamDist.value = dist;
      uniforms.uSizeScale.value = cssH * pr * 0.5; // three's size-attenuation convention
      // Solve uBasePx so a dot is POINT_PX css px whatever the canvas height or dpr.
      uniforms.uBasePx.value = (2 * POINT_PX * dist) / cssH;
      if (reduceMotion && ready) drawStatic();
    };

    // ── Load the cortex, thin it, and paint the two networks onto it ────────────────
    (async () => {
      const res = await fetch("/brain/fs6_pos.bin");
      if (!res.ok) throw new Error(`fs6_pos.bin → ${res.status}`);
      const full = new Float32Array(await res.arrayBuffer());
      if (disposed) return;
      const nFull = full.length / 3;

      // Snap every node to its nearest actual surface vertex, against the FULL cloud, so a
      // textbook coordinate that sits a centimetre under the pial surface still lands on
      // it. Both hemispheres are snapped independently — the surface isn't symmetric.
      const nodes = NODES.flatMap((node) => [
        { ...node, side: 0, at: toModel(node.mm) },
        { ...node, side: 1, at: toModel([-node.mm[0], node.mm[1], node.mm[2]]) },
      ]);
      for (const node of nodes) {
        let best = Infinity;
        let bi = 0;
        for (let i = 0; i < nFull; i++) {
          const dx = full[i * 3] - node.at.x;
          const dy = full[i * 3 + 1] - node.at.y;
          const dz = full[i * 3 + 2] - node.at.z;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < best) {
            best = d;
            bi = i;
          }
        }
        node.at.set(full[bi * 3], full[bi * 3 + 1], full[bi * 3 + 2]);
      }

      // Thin the cloud with an avalanching hash. A fixed stride would sample the
      // icosahedral vertex order structurally and band the surface.
      const cap = Math.ceil(nFull * KEEP * 1.1);
      const pos = new Float32Array(cap * 3);
      let n = 0;
      for (let i = 0; i < nFull && n < cap; i++) {
        let h = i + 1;
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        if (((h ^ (h >>> 16)) >>> 0) / 4294967296 > KEEP) continue;
        pos[n * 3] = full[i * 3];
        pos[n * 3 + 1] = full[i * 3 + 1];
        pos[n * 3 + 2] = full[i * 3 + 2];
        n++;
      }

      const rand = new Float32Array(n);
      const wD = new Float32Array(n);
      const wV = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        rand[i] = Math.random();
        for (const node of nodes) {
          const dx = pos[i * 3] - node.at.x;
          const dy = pos[i * 3 + 1] - node.at.y;
          const dz = pos[i * 3 + 2] - node.at.z;
          let f = 1 - Math.sqrt(dx * dx + dy * dy + dz * dz) / node.reach;
          if (f <= 0) continue;
          f = f * f * (3 - 2 * f); // soft core, feathered edge
          const w = node.net === 0 ? wD : wV;
          if (f > w[i]) w[i] = f;
        }
      }

      geo.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
      geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
      geo.setAttribute("aDorsal", new THREE.BufferAttribute(wD, 1));
      geo.setAttribute("aVentral", new THREE.BufferAttribute(wV, 1));

      mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        transparent: true,
        depthTest: true,
        depthWrite: true,
        blending: THREE.NormalBlending,
      });
      rotator.add(new THREE.Points(geo, mat));

      // One leader per network per hemisphere, carrying that group's nodes as candidates.
      for (const net of [0, 1] as const) {
        for (const side of [0, 1] as const) {
          const anchors = nodes
            .filter((node) => node.net === net && node.side === side)
            .map((node) => node.at.clone());
          const color = net === 0 ? tokens.ink : tokens.accent2;
          const line = document.createElementNS(SVG_NS, "line");
          line.setAttribute("stroke", color);
          line.setAttribute("stroke-opacity", "0.6");
          line.setAttribute("stroke-width", "1");
          const dot = document.createElementNS(SVG_NS, "circle");
          dot.setAttribute("r", "2");
          dot.setAttribute("fill", color);
          dot.setAttribute("fill-opacity", "0.9");
          svg.append(line, dot);
          leaders.push({ net, anchors, ex: 0, ey: 0, placed: false, line, dot });
        }
      }

      ready = true;
      fit();
      if (reduceMotion) {
        redrawRef.current = drawStatic; // the reveal prop redraws instead of easing
        drawStatic();
      } else {
        timer.reset(); // discard the load-time gap so the first dt is sane
        raf = requestAnimationFrame(frame);
      }
    })().catch(() => {
      if (!disposed) setFailed(true);
    });

    function paint(dt: number) {
      renderer.render(scene, camera); // also refreshes matrixWorld, which the leaders read
      updateLeaders(dt);
    }

    /** The whole animation, under prefers-reduced-motion: one held pose, drawn on demand. */
    function drawStatic() {
      reveal = activeRef.current ? 1 : 0; // no easing — the reveal is a cut, not a fade
      rotator.rotation.set(BASE_TILT, 0, STATIC_YAW);
      uniforms.uReveal.value = reveal;
      paint(0); // no glide: one frame, endpoints snap to where they belong
    }

    function frame(ts: number) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      timer.update(ts);
      const dt = Math.min(timer.getDelta(), 0.05); // clamp any remaining spike
      if (!onScreen) return; // scrolled away: hold the pose, spend nothing
      t += dt;

      yaw += SPIN_RATE * dt;
      rotator.rotation.set(BASE_TILT, 0, yaw);

      reveal += ((activeRef.current ? 1 : 0) - reveal) * (1 - Math.exp(-dt * REVEAL_RATE));
      uniforms.uReveal.value = reveal;

      const half = BREATH_DEPTH / 2;
      uniforms.uBreathD.value = 1 - half + half * Math.sin((Math.PI * 2 * t) / BREATH_D);
      uniforms.uBreathV.value = 1 - half + half * Math.sin((Math.PI * 2 * t) / BREATH_V + 2.1);

      paint(dt);
    }

    // ── Leaders: project each patch and run a hairline back to its chip ────────────
    const wp = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    /** Facing of a node right now: 1 = square on to the reader, ≤0 = round the back. The
     *  radial direction stands in for the surface normal, which is close enough on a
     *  convex cortex and needs no normals buffer. */
    function facingOf(anchor: THREE.Vector3) {
      nrm.copy(anchor).normalize().transformDirection(rotator.matrixWorld);
      wp.copy(anchor).applyMatrix4(rotator.matrixWorld);
      toCam.copy(camera.position).sub(wp).normalize();
      return nrm.dot(toCam);
    }
    function updateLeaders(dt: number) {
      for (const L of leaders) {
        let best = L.anchors[0];
        let bestFacing = -1;
        for (const a of L.anchors) {
          const f = facingOf(a);
          if (f > bestFacing) {
            bestFacing = f;
            best = a;
          }
        }
        const op = THREE.MathUtils.smoothstep(bestFacing, 0.15, 0.55) * reveal;

        // Track the endpoint even while hidden, so the line never fades back in mid-glide.
        wp.copy(best).applyMatrix4(rotator.matrixWorld).project(camera);
        const tx = (wp.x * 0.5 + 0.5) * cssW;
        const ty = (1 - (wp.y * 0.5 + 0.5)) * cssH;
        if (!L.placed || dt <= 0) {
          L.ex = tx;
          L.ey = ty;
          L.placed = true;
        } else {
          const k = 1 - Math.exp(-dt * LEADER_GLIDE);
          L.ex += (tx - L.ex) * k;
          L.ey += (ty - L.ey) * k;
        }
        const px = L.ex;
        const py = L.ey;

        L.line.setAttribute("opacity", op.toFixed(3));
        L.dot.setAttribute("opacity", op.toFixed(3));
        if (op < 0.01) continue; // hidden: skip the geometry writes entirely

        // Start the hairline where the ray from the chip's centre leaves the chip, so the
        // line always looks like it's coming out of the label's edge.
        const box = chipBox[L.net];
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        let dx = px - cx;
        let dy = py - cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const s = Math.min(
          Math.abs(dx) > 1e-3 ? (box.w / 2 + LEADER_GAP) / Math.abs(dx) : Infinity,
          Math.abs(dy) > 1e-3 ? (box.h / 2 + LEADER_GAP) / Math.abs(dy) : Infinity,
        );
        const sx = clamp(cx + dx * s, 0, cssW);
        const sy = clamp(cy + dy * s, 0, cssH);

        L.dot.setAttribute("cx", px.toFixed(1));
        L.dot.setAttribute("cy", py.toFixed(1));
        L.line.setAttribute("x1", sx.toFixed(1));
        L.line.setAttribute("y1", sy.toFixed(1));
        L.line.setAttribute("x2", (px - dx * LEADER_GAP).toFixed(1));
        L.line.setAttribute("y2", (py - dy * LEADER_GAP).toFixed(1));
      }
    }

    // Sized by the card, so watch the card — not the window.
    const ro = new ResizeObserver(() => fit());
    ro.observe(wrap);

    // Scrolled out of view → stop drawing. A figure nobody is looking at shouldn't be
    // spending frames next to this page's video player.
    const io = new IntersectionObserver(
      ([e]) => {
        onScreen = e.isIntersecting;
      },
      { rootMargin: "120px" },
    );
    io.observe(wrap);

    // NO input listeners of any kind — this figure is not interactive.
    return () => {
      disposed = true;
      redrawRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      for (const L of leaders) {
        L.line.remove();
        L.dot.remove();
      }
      timer.dispose();
      geo.dispose();
      mat?.dispose();
      renderer.dispose();
    };
  }, []);

  if (failed) {
    // No WebGL, or the surface didn't load: fall back to the flat figure, which makes the
    // same point. A blank card would take the section's argument down with it.
    return <TwoRegionBrain t={active ? 1 : 0} focus="both" height={height} />;
  }

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto w-full max-w-[400px] select-none"
      style={{ height }}
      role="img"
      aria-label="A slowly turning cortical surface with the dorsal attention network marked in ink and the ventral salience network in slate"
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {/* The key, pinned where each network lives: dorsal is superior, ventral inferior.
          Fixed chips rather than labels that chase the patches — only the hairline moves,
          so the names stay readable while the model turns. */}
      <Chip
        boxRef={(el) => {
          chipRefs.current[0] = el;
        }}
        label="Dorsal"
        tone="ink"
        active={active}
        className="left-0 top-0"
      />
      <Chip
        boxRef={(el) => {
          chipRefs.current[1] = el;
        }}
        label="Ventral"
        tone="accent"
        active={active}
        className="bottom-0 left-0"
      />
    </div>
  );
}

function Chip({
  boxRef,
  label,
  tone,
  active,
  className,
}: {
  boxRef: React.RefCallback<HTMLDivElement>;
  label: string;
  tone: "ink" | "accent";
  active: boolean;
  className: string;
}) {
  return (
    <div
      ref={boxRef}
      className={`pointer-events-none absolute flex items-center gap-1.5 rounded-full bg-paper/85 px-2 py-[3px] ${className}`}
      style={{ opacity: active ? 1 : 0, transition: "opacity .5s .1s" }}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${tone === "accent" ? "bg-accent-2" : "bg-ink"}`}
      />
      <span
        className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${tone === "accent" ? "text-accent-2" : "text-ink"}`}
      >
        {label}
      </span>
    </div>
  );
}
