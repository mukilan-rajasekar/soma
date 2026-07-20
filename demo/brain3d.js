/* brain3d.js — Soma's cortical hero (v2, "clinical" redesign).
 *
 * A front-facing, matte-white 3D cortex on pure black — the REAL fsaverage6 surface
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

const ASSETS = './assets/';

// ---- device / motion tiers ---------------------------------------------------
const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const NARROW = window.innerWidth < 820;
const MOBILE = COARSE || NARROW;              // "static brain, no camera flight"
const DPR_CAP = MOBILE ? 1.5 : 2;

// ---- the tour: one hero + four region stops -----------------------------------
// cam/target/region are in unit-brain space (centre at origin, radius ~1).
// x=L→R, y=posterior→anterior (front = +y), z=inferior→superior (up = +z).
// Hero is a near-frontal "someone standing in front of you" view; each stop dollies
// the camera closer (smaller radius) so the region fills frame — reads as flying in.
const CH = [
  { id: 'hero',   cam: [ 0.30,  3.08,  0.21], target: [0.00,  0.00,  0.06], fov: 27, region: null },
  { id: 'occ',    cam: [ 0.04, -2.14,  0.17], target: [0.00, -0.45, -0.02], fov: 27, region: [ 0.00, -0.92, -0.06] },
  { id: 'sts',    cam: [ 2.15, -0.05,  0.02], target: [0.40, -0.05, -0.24], fov: 27, region: [ 0.66, -0.05, -0.34] },
  { id: 'dmn',    cam: [ 0.10, -1.85,  1.28], target: [0.00, -0.28,  0.30], fov: 27, region: [ 0.00, -0.52,  0.42] },
  { id: 'affect', cam: [ 0.04,  2.30, -0.05], target: [0.00,  0.40, -0.20], fov: 27, region: [ 0.00,  0.66, -0.46] },
];
const N = CH.length;

// ============================================================================
let renderer, scene, camera, clock;
let brainGroup, cortexMat;
let running = false, inView = true;
let progress = 0, target = 0;      // 0..1 along the whole tour
let activeCh = 0, actEase = 0;     // heatmap activation envelope (0..1)
let lastRegionCh = -1;             // last chapter whose heatmap region was set (avoid per-frame reset)
let lastBare = true;               // true = at the very top: bare brain, no bubble
const panels = [];                 // .chapter scroll containers (is-active drives the scrim)
const panelBoxes = [];             // the .panel bubble inside each chapter (JS drives its opacity)
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
    float head = max(dot(N, V), 0.0);          // camera-relative fill: back-of-head views never collapse to black
    float lit = uAmbient + 0.55 * diff + 0.25 * head;
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
  document.querySelectorAll('#brain-tour .chapter').forEach(el => { panels.push(el); panelBoxes.push(el.querySelector('.panel')); });

  renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x060608, 1);       // near-black (not pure 0) so translucent edges never composite to a hard black

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(27, 1, 0.01, 100);
  camera.up.set(0, 0, 1);                     // superior (+z) is up → upright anatomical brain

  // ---- geometry from the fsaverage6 binaries ----
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
  // FrontSide + depthWrite:FALSE is the combination that fixes BOTH problems:
  //  • FrontSide culls the back wall → no hollow see-through-to-black → no "black flashes"
  //  • depthWrite:false → the mesh writes no depth → no z-fighting between folds → no
  //    continuous shimmer as the camera turns (depthWrite:true was causing that flicker).
  // Front faces blend in fixed geometry order (stable under camera motion), giving a calm
  // translucent surface that stays ethereal at low alpha without strobing.
  cortexMat = new THREE.ShaderMaterial({
    vertexShader: CORTEX_VS, fragmentShader: CORTEX_FS,
    side: THREE.FrontSide, transparent: true, depthWrite: false,
    uniforms: {
      uLightDir: { value: new THREE.Vector3(0.35, 0.78, 0.55).normalize() },
      uAmbient: { value: 0.42 },
      uBaseLo: { value: new THREE.Color(0.05, 0.055, 0.075) },    // deep sulcus
      uBaseHi: { value: new THREE.Color(0.82, 0.85, 0.92) },      // gyral crown
      uRimGain: { value: 0.55 },
      uBaseAlpha: { value: 0.32 },              // translucent / ethereal
      uEdgeAlpha: { value: 0.90 },              // defined silhouette
      uRegion: { value: new THREE.Vector3(0, 0, 0) },
      uAct: { value: 0 }, uRadius: { value: 0.58 },
    },
  });
  const cortex = new THREE.Mesh(geo, cortexMat);
  cortex.renderOrder = 1;
  brainGroup.add(cortex);
  scene.add(brainGroup);

  // No post-processing: render the scene straight to the canvas. The EffectComposer +
  // UnrealBloom chain (multi render-target downsample/blur) was the one constant across
  // every material we tried, and an intermittently-black composite target is the classic
  // cause of "random black flashes". Direct rendering removes that entire failure surface;
  // the bloom was only a faint whisper, so the look barely changes.
  clock = new THREE.Clock();
  resize();
  target = progress = computeProgress();      // snap to restored scroll before first paint
  setRegion(Math.round(progress * (N - 1)));
  applyCamera(progress);
  updatePanels(true);

  new ResizeObserver(resize).observe(stageEl);
  const io = new IntersectionObserver((e) => {
    inView = e[0].isIntersecting;
    if (REDUCE) return;               // reduced-motion: static frame, no rAF loop either way
    if (inView) start();              // re-entering the viewport re-arms the render loop
    else running = false;             // off-screen: stop rendering (frame() bails; lenis keeps its own rAF)
  }, { threshold: 0 });
  io.observe(tourEl);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

  if (REDUCE) { renderOnce(); wireStaticScroll(); return; }
  // Page Visibility guard: the IntersectionObserver pauses the loop off-screen, but a
  // backgrounded (hidden) tab still intersects — so also halt the rAF loop when the tab
  // is hidden, and re-arm it on return if the tour is still in view.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (inView) start();
  });
  if (!MOBILE) initLenis();
  window.addEventListener('scroll', onScroll, { passive: true });
  start();
}

// ---- smooth scroll (desktop) -------------------------------------------------
function initLenis() {
  try {
    if (!window.Lenis) return;
    lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1.0, smoothWheel: true });
    window.__lenis = lenis;
    // Drive lenis from its OWN persistent rAF, independent of the WebGL render loop,
    // so pausing the brain tour off-screen (the IntersectionObserver above) never
    // stalls page smooth-scroll. rAF's timestamp is performance.now()-equivalent.
    const lenisLoop = (t) => { if (lenis) { lenis.raf(t); requestAnimationFrame(lenisLoop); } };
    requestAnimationFrame(lenisLoop);
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
// slerp two UNIT vectors → CONSTANT angular velocity. nlerp (lerp+normalize) of
// near-antipodal dirs whips through the mid-arc: at the tour's 163°–169° legs the
// normalized midpoint swings ~4–5× the segment average in a sliver of scroll — that
// whip is the "fast end-spin" AND (front-lit → near-black back face in a couple frames)
// the black flash. slerp removes the spike entirely; max arc 163° (sin≈0.29), no blow-up.
function slerpDir(out, a, b, t) {
  const d = Math.max(-1, Math.min(1, a.dot(b)));
  const th = Math.acos(d);
  if (th < 1e-3) return out.copy(a).lerp(b, t).normalize();     // ~parallel: plain lerp is fine
  const s = Math.sin(th), w0 = Math.sin((1 - t) * th) / s, w1 = Math.sin(t * th) / s;
  return out.set(a.x * w0 + b.x * w1, a.y * w0 + b.y * w1, a.z * w0 + b.z * w1);  // stays unit length
}
function applyCamera(p) {
  const seg = Math.min(Math.max(p, 0), 1) * (N - 1);
  const i = Math.min(Math.floor(seg), N - 2);
  const t = smooth(seg - i);
  slerpDir(_dir, camDir[i], camDir[i + 1], t);                  // constant-rate arc, no mid-swing whip
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
// Panels crossfade off the REAL scroll position (`target`), never the damped camera
// `progress`. That is the whole fix for "cards load in weird / rushed / inconsistent
// up vs down": a panel's opacity is now a pure, continuous function of where it physically
// sits in the viewport, so it is (a) identical scrolling both ways, (b) locked 1:1 to the
// scrollbar (can't lag behind the eased camera and pop in late), and (c) impossible to
// flicker at a boundary — there is no class toggle mid-transition to restart, just a value.
// P_HOLD = full-opacity dead-band around each chapter centre; P_FADE = crossfade width
// (in chapter units); P_HYST = dead-band for the binary scrim/heatmap so they don't twitch.
const P_HOLD = 0.30, P_FADE = 0.56, P_HYST = 0.12;
function updatePanels(force) {
  const pos = Math.min(Math.max(target, 0), 1);
  const f = pos * (N - 1);                  // continuous chapter coordinate, 0..N-1
  const bare = pos < 0.02;                  // very top: no bubble, just the empty brain
  // Hysteretic dominant chapter — drives ONLY the binary scrim + heatmap region. The
  // dead-band keeps them from switching when scroll settles right on a .5 boundary.
  const near = Math.round(f);
  if (near !== activeCh && Math.abs(f - activeCh) > 0.5 + P_HYST) activeCh = near;
  // Hero (i=0) rises up out of the bare top instead of being present at scrollY 0.
  // Start the ramp exactly at the bare cutoff (0.02) so opacity is continuous through it.
  const enter = Math.max(0, Math.min(1, (pos - 0.02) / 0.05));
  for (let i = 0; i < panelBoxes.length; i++) {
    const box = panelBoxes[i]; if (!box) continue;
    let op;
    if (REDUCE) { op = (!bare && i === activeCh) ? 1 : 0; }   // reduced-motion: snap, no fade
    else {
      op = Math.max(0, Math.min(1, 1 - (Math.abs(f - i) - P_HOLD) / P_FADE));
      if (i === 0) op *= enter;
      if (bare) op = 0;
    }
    box.style.opacity = op.toFixed(3);
    box.style.transform = (REDUCE || op > 0.999) ? 'none' : 'translateY(' + ((1 - op) * 8).toFixed(1) + 'px)';
    panels[i].classList.toggle('is-active', !bare && i === activeCh);
  }
  if (activeCh !== lastRegionCh) { setRegion(activeCh); lastRegionCh = activeCh; }
  lastBare = bare;
}
function setRegion(i) {
  // relocate the hot patch; do NOT reset actEase — frame() eases uAct toward the new
  // target so the heatmap travels/fades smoothly instead of blinking off at each boundary.
  const c = CH[i];
  if (c.region) cortexMat.uniforms.uRegion.value.set(...c.region);
}

// ---- main loop ---------------------------------------------------------------
function frame() {
  if (!running) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  // lenis is driven by its own persistent rAF (see initLenis), so this render loop
  // can pause when the tour scrolls off-screen without freezing page smooth-scroll.

  // frame-rate-independent damping toward the scroll target — softened so a fast scroll
  // glides the camera in instead of snapping between poses. Higher base = more glide/lag,
  // so a flick-scroll eases the zoom in rather than strobing there in a couple of frames.
  progress += (target - progress) * (1 - Math.pow(0.14, dt));
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

  renderer.render(scene, camera);
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
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!running) renderOnce();
}

// ---- lifecycle ---------------------------------------------------------------
function start() { if (running || !inView || REDUCE || document.hidden) return; running = true; clock.getDelta(); requestAnimationFrame(frame); }
function renderOnce() {
  if (!renderer) return;
  applyCamera(progress);
  cortexMat.uniforms.uAct.value = CH[activeCh].region ? 1 : 0;   // static frame: region simply lit
  renderer.render(scene, camera);
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
  if (window.__loadScrollBrain) window.__loadScrollBrain();    // spin up the 2D brain on demand
}

// ---- boot --------------------------------------------------------------------
init().catch(err => {
  console.warn('[brain3d] init failed, keeping 2D fallback:', err);
  document.documentElement.classList.remove('brain3d-on');
  document.documentElement.classList.add('brain3d-failed');
  if (window.__loadScrollBrain) window.__loadScrollBrain();   // asset/geometry load failed → 2D brain
});
