/* brain3d.js — Soma's cortical hero (v2, "clinical" redesign).
 *
 * A front-facing, matte-white 3D cortex on pure black — the REAL fsaverage5 surface
 * TRIBE v2 predicts on (20,484 vertices). Deeply defined gyri/sulci (sulcal-depth
 * shading bakes in the fold contrast). Scrolling dollies the camera INTO each region;
 * as it arrives, a warm fMRI-style "hot" heatmap blooms on that patch of cortex and a
 * panel explains the matching Soma feature. No neon, minimal glow — aesthetic tuned to
 * Meta's TRIBE v2 site (black bg, white brain, hot activation colormap).
 *
 * HONESTY: this is DECORATION — a product tour, not a prediction. No real numbers are
 * ever drawn on it; the heatmap is procedural, never bound to model output. The evidence
 * TIER of each claim lives in the panel badge (green/amber/red), never faked on the mesh.
 * The real, data-driven read-out lives in the .console section below, kept deliberately
 * separate. A persistent watermark says so.
 *
 * Self-contained: three.js r185 vendored locally (import map), no build step. Loaded only
 * when WebGL is present (probe in index.html); degrades to a static frame under
 * prefers-reduced-motion and to no camera-flight on mobile.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ASSETS = './assets/';

// ---- device / motion tiers ---------------------------------------------------
const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const NARROW = window.innerWidth < 820;
const MOBILE = COARSE || NARROW;              // "static brain, no camera flight"
const DPR_CAP = MOBILE ? 1.5 : 2;

// ---- the tour: one hero + six region stops -----------------------------------
// cam/target/region are in unit-brain space (centre at origin, radius ~1).
// x=L→R, y=posterior→anterior (front = +y), z=inferior→superior (up = +z).
// Hero is a near-frontal "someone standing in front of you" view; each stop dollies
// the camera closer (smaller radius) so the region fills frame — reads as flying in.
const CH = [
  { id: 'hero',   cam: [ 0.30,  3.08,  0.21], target: [0.00,  0.00,  0.06], fov: 27, region: null },
  { id: 'occ',    cam: [ 0.04, -2.14,  0.17], target: [0.00, -0.45, -0.02], fov: 27, region: [ 0.00, -0.92, -0.06] },
  { id: 'sts',    cam: [ 2.15, -0.05,  0.02], target: [0.40, -0.05, -0.24], fov: 27, region: [ 0.66, -0.05, -0.34] },
  { id: 'dmn',    cam: [ 0.10, -1.85,  1.28], target: [0.00, -0.28,  0.30], fov: 27, region: [ 0.00, -0.52,  0.42] },
  { id: 'affect', cam: [ 0.04,  2.09, -0.68], target: [0.00,  0.40, -0.30], fov: 27, region: [ 0.00,  0.66, -0.46] },
  { id: 'valid',  cam: [ 0.78,  2.72,  0.65], target: [0.00,  0.00,  0.02], fov: 30, region: null },
  { id: 'road',   cam: [ 1.88,  1.60,  0.34], target: [0.42,  0.42, -0.03], fov: 27, region: [ 0.62,  0.55, -0.04] },
];
const N = CH.length;

// ============================================================================
let renderer, scene, camera, composer, bloom, clock;
let brainGroup, cortexMat;
let running = false, inView = true;
let progress = 0, target = 0;      // 0..1 along the whole tour
let activeCh = 0, actEase = 0;     // heatmap activation envelope (0..1)
let lastBare = true;               // true = at the very top: bare brain, no bubble
const panels = [];
let railTicks = [];
let tourEl = null, stageEl = null;
let lenis = null;

// precomputed camera dirs/radii for slerp-free arc interpolation (stays outside brain)
const camDir = CH.map(c => new THREE.Vector3(...c.cam).normalize());
const camRad = CH.map(c => new THREE.Vector3(...c.cam).length());
const camTgt = CH.map(c => new THREE.Vector3(...c.target));

const _pos = new THREE.Vector3(), _tgt = new THREE.Vector3(), _dir = new THREE.Vector3();

// ---- binary loader -----------------------------------------------------------
async function loadBin(name, Type) {
  const res = await fetch(ASSETS + name);
  if (!res.ok) throw new Error('asset ' + name + ' -> ' + res.status);
  return new Type(await res.arrayBuffer());
}

// ---- cortex shader: matte grey brain (sulcal-depth shaded) + hot heatmap blob --
const CORTEX_VS = `
  attribute float aSulc;
  uniform vec3 uRegion;
  varying vec3 vN; varying vec3 vWorld; varying float vSulc; varying float vDist;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vSulc = aSulc;
    vDist = distance(position, uRegion);        // local-space, unaffected by breathing scale
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const CORTEX_FS = `
  precision highp float;
  uniform vec3 uLightDir; uniform float uAmbient;
  uniform float uAct; uniform float uRadius; uniform float uRimGain;
  uniform vec3 uBaseLo; uniform vec3 uBaseHi;
  uniform float uBaseAlpha; uniform float uEdgeAlpha;
  varying vec3 vN; varying vec3 vWorld; varying float vSulc; varying float vDist;

  // MUTED fMRI heatmap — desaturated warm ramp (deep red → orange → amber → warm off-white).
  // No pure white, no neon: reads as data-viz activation, not a glow.
  vec3 hot(float t){
    t = clamp(t, 0.0, 1.0);
    vec3 c1 = vec3(0.42, 0.12, 0.10);   // deep muted red
    vec3 c2 = vec3(0.78, 0.33, 0.15);   // muted orange
    vec3 c3 = vec3(0.90, 0.63, 0.33);   // muted amber
    vec3 c4 = vec3(0.95, 0.83, 0.64);   // warm off-white (capped below pure white)
    vec3 c = mix(c1, c2, smoothstep(0.00, 0.40, t));
    c = mix(c, c3, smoothstep(0.35, 0.72, t));
    c = mix(c, c4, smoothstep(0.70, 1.00, t));
    return c;
  }
  void main(){
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;               // DoubleSide: correct lighting on inner wall
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);   // 0 face-on → 1 at grazing silhouette
    // base grey shaded by sulcal depth → gyral crowns bright, deep sulci dark (defined folds)
    float gy = smoothstep(0.10, 0.95, 1.0 - vSulc);
    vec3 base = mix(uBaseLo, uBaseHi, gy);
    float diff = max(dot(N, normalize(uLightDir)), 0.0);
    float lit = uAmbient + 0.80 * diff;
    vec3 grey = base * lit;
    grey += vec3(0.30, 0.40, 0.55) * fres * uRimGain;   // cool rim traces the silhouette
    // heatmap activation blob (one region hot at a time): focal core, folds show through
    float falloff = pow(smoothstep(uRadius, 0.0, vDist), 1.6);
    float act = clamp(uAct * falloff, 0.0, 1.0);
    vec3 heat = hot(0.12 + 0.72 * act);
    vec3 heatShaded = heat * (0.60 + 0.40 * clamp(lit, 0.0, 1.3));
    vec3 col = mix(grey, heatShaded, smoothstep(0.03, 0.40, act));
    col += heat * pow(act, 4.0) * 0.20;        // faint core emission (muted)
    // TRANSLUCENT/HOLLOW: see-through face-on, opaque at the rim (defined silhouette); the
    // active patch firms up so the heatmap reads solid rather than ghostly.
    float alpha = mix(uBaseAlpha, uEdgeAlpha, fres);
    alpha = max(alpha, act * 0.80);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }`;

// ---- build -------------------------------------------------------------------
async function init() {
  const canvas = document.getElementById('brainCanvas');
  if (!canvas) throw new Error('no #brainCanvas');
  tourEl = document.getElementById('brain-tour');
  stageEl = document.getElementById('brainStage');
  document.querySelectorAll('#brain-tour .chapter').forEach(el => panels.push(el));
  railTicks = Array.from(document.querySelectorAll('#brain-tour .hud-rail i'));

  renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 1);       // pure black stage

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(27, 1, 0.01, 100);
  camera.up.set(0, 0, 1);                     // superior (+z) is up → upright anatomical brain

  // ---- geometry from the fsaverage5 binaries ----
  const [pos, idx, sulc] = await Promise.all([
    loadBin('fs6_pos.bin', Float32Array),   // fsaverage6 (81,924 vtx) — crisper DECORATIVE surface
    loadBin('fs6_idx.bin', Uint32Array),
    loadBin('fs6_sulc.bin', Float32Array),
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSulc', new THREE.BufferAttribute(sulc, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  brainGroup = new THREE.Group();

  // translucent, hollow glass cortex — see-through face-on, defined at the rim/folds.
  // DoubleSide + depthWrite:false lets the far wall read faintly through the near one.
  cortexMat = new THREE.ShaderMaterial({
    vertexShader: CORTEX_VS, fragmentShader: CORTEX_FS,
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: {
      uLightDir: { value: new THREE.Vector3(0.35, 0.78, 0.55).normalize() },
      uAmbient: { value: 0.34 },
      uBaseLo: { value: new THREE.Color(0.05, 0.055, 0.075) },    // deep sulcus
      uBaseHi: { value: new THREE.Color(0.82, 0.85, 0.92) },      // gyral crown
      uRimGain: { value: 0.55 },
      uBaseAlpha: { value: 0.13 },              // see-through centre (hollow)
      uEdgeAlpha: { value: 0.90 },              // opaque silhouette
      uRegion: { value: new THREE.Vector3(0, 0, 0) },
      uAct: { value: 0 }, uRadius: { value: 0.58 },
    },
  });
  const cortex = new THREE.Mesh(geo, cortexMat);
  cortex.renderOrder = 1;
  brainGroup.add(cortex);
  scene.add(brainGroup);

  // ---- post: whisper of bloom, thresholded so ONLY the hot cores glow ----
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const size = stageSize();
  bloom = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), MOBILE ? 0.22 : 0.26, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  clock = new THREE.Clock();
  resize();
  target = progress = computeProgress();      // snap to restored scroll before first paint
  setRegion(Math.round(progress * (N - 1)));
  applyCamera(progress);
  updatePanels(true);

  new ResizeObserver(resize).observe(stageEl);
  const io = new IntersectionObserver((e) => { inView = e[0].isIntersecting; if (inView && !REDUCE) start(); },
    { threshold: 0 });
  io.observe(tourEl);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

  if (REDUCE) { renderOnce(); wireStaticScroll(); return; }
  if (!MOBILE) initLenis();
  window.addEventListener('scroll', onScroll, { passive: true });
  start();
}

// ---- smooth scroll (desktop) -------------------------------------------------
function initLenis() {
  try {
    if (!window.Lenis) return;
    lenis = new window.Lenis({ lerp: 0.075, wheelMultiplier: 1.0, smoothWheel: true });
    window.__lenis = lenis;
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        const el = id.length > 1 && document.querySelector(id);
        if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -24, duration: 1.4 }); }
      });
    });
  } catch (e) { lenis = null; }
}

// ---- scroll → target progress ------------------------------------------------
function computeProgress() {
  if (!tourEl) return 0;
  const rect = tourEl.getBoundingClientRect();
  const total = tourEl.offsetHeight - window.innerHeight;
  const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
  return total > 0 ? scrolled / total : 0;
}
function onScroll() { target = computeProgress(); if (!running) start(); }

// ---- camera pose interpolation (arcs around the brain, never through it) -----
function applyCamera(p) {
  const seg = Math.min(Math.max(p, 0), 1) * (N - 1);
  const i = Math.min(Math.floor(seg), N - 2);
  const t = smooth(seg - i);
  _dir.copy(camDir[i]).lerp(camDir[i + 1], t).normalize();     // normalized ⇒ stays outside surface
  const rad = camRad[i] + (camRad[i + 1] - camRad[i]) * t;
  _pos.copy(_dir).multiplyScalar(rad);
  _tgt.copy(camTgt[i]).lerp(camTgt[i + 1], t);
  camera.position.copy(_pos);
  camera.lookAt(_tgt);
  const fov = CH[i].fov + (CH[i + 1].fov - CH[i].fov) * t;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
function smooth(t) { return t * t * (3 - 2 * t); }             // smoothstep ease

// ---- panels + active chapter -------------------------------------------------
function updatePanels(force) {
  const a = Math.round(progress * (N - 1));
  const bare = progress < 0.02;            // very top: no bubble, just the empty brain
  if (a === activeCh && bare === lastBare && !force) return;
  lastBare = bare;
  activeCh = a;
  panels.forEach((el, i) => el.classList.toggle('is-active', !bare && i === a));
  railTicks.forEach((el, i) => el.classList.toggle('on', !bare && i === a));
  setRegion(a);
}
function setRegion(i) {
  const c = CH[i];
  if (c.region) { cortexMat.uniforms.uRegion.value.set(...c.region); actEase = 0; }  // re-bloom at the new patch
  else { actEase = 0; }
}

// ---- main loop ---------------------------------------------------------------
function frame() {
  if (!running) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (lenis) lenis.raf(performance.now());

  // frame-rate-independent damping toward the scroll target — softened so a fast scroll
  // glides the camera in instead of snapping between poses.
  progress += (target - progress) * (1 - Math.pow(0.06, dt));
  if (Math.abs(target - progress) < 1e-4) progress = target;

  applyCamera(MOBILE ? 0 : progress);         // mobile: hold the hero pose (no camera flight)
  updatePanels(false);

  // gentle "breathing" so the resting brain feels alive (subtle — calm, not flashy)
  const breathe = 1 + 0.006 * Math.sin(time * 0.7);
  brainGroup.scale.setScalar(breathe);

  // ease the heatmap up when a region is active; hold lit with a faint shimmer
  const wantAct = CH[activeCh].region ? 1 : 0;
  actEase += (wantAct - actEase) * (1 - Math.pow(0.02, dt));
  cortexMat.uniforms.uAct.value = actEase * (0.92 + 0.08 * Math.sin(time * 1.5));

  composer.render();
  requestAnimationFrame(frame);
}

// ---- sizing ------------------------------------------------------------------
function stageSize() {
  const r = stageEl.getBoundingClientRect();
  return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
}
function resize() {
  const { w, h } = stageSize();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  if (bloom) bloom.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!running) renderOnce();
}

// ---- lifecycle ---------------------------------------------------------------
function start() { if (running || !inView || REDUCE) return; running = true; clock.getDelta(); requestAnimationFrame(frame); }
function renderOnce() {
  if (!composer) return;
  applyCamera(progress);
  cortexMat.uniforms.uAct.value = CH[activeCh].region ? 1 : 0;   // static frame: region simply lit
  composer.render();
}

function wireStaticScroll() {
  // reduced-motion: no rAF loop; re-render one frame when the user scrolls so the
  // camera still rests on each region, without any animation.
  window.addEventListener('scroll', () => {
    target = progress = computeProgress();
    updatePanels(false);
    renderOnce();
  }, { passive: true });
}

function onContextLost(e) {
  e.preventDefault(); running = false;
  document.documentElement.classList.remove('brain3d-on');     // reveal 2D fallback
  document.documentElement.classList.add('brain3d-failed');
}

// ---- boot --------------------------------------------------------------------
init().catch(err => {
  console.warn('[brain3d] init failed, keeping 2D fallback:', err);
  document.documentElement.classList.remove('brain3d-on');
  document.documentElement.classList.add('brain3d-failed');
});
