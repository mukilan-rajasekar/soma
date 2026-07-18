/* scrollbrain.js — a FRONT-VIEW brain filling the page background, with FLASHES OF
 * NEURAL ACTIVITY that fire as you scroll. The resting cortex is a dim neon
 * point-cloud in a coronal (front) brain silhouette; scrolling sweeps a band of
 * activation down the cortex and pops bright neon blooms, which rise and fade.
 * Pure canvas 2D, no libraries, no external assets.
 *
 * Honesty note: DECORATION, not data. This is the hero visual — it is not a real
 * brain map and encodes no prediction. The real data-driven brain viz is the small
 * SVG inside the console (app.js), tied to actual arc values. Kept separate so the
 * eye-candy can never be mistaken for a result.
 */
(function () {
  var canvas = document.getElementById("scrollBrain");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // deterministic PRNG so the resting cortex looks identical each load
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(0x5013EE7);

  // ---- coronal (front-view) brain mask in normalized coords x,y in [-1,1], y up ----
  function inBrain(x, y) {
    var e1 = ((x - 0.30) / 0.56) * ((x - 0.30) / 0.56) + (y / 0.74) * (y / 0.74) <= 1;
    var e2 = ((x + 0.30) / 0.56) * ((x + 0.30) / 0.56) + (y / 0.74) * (y / 0.74) <= 1;
    var inside = e1 || e2;
    // longitudinal fissure: a notch down the top-centre
    if (Math.abs(x) < 0.05 && y > 0.30) inside = false;
    // brainstem nub at the bottom centre
    var stem = (x / 0.14) * (x / 0.14) + ((y + 0.82) / 0.24) * ((y + 0.82) / 0.24) <= 1;
    return inside || stem;
  }

  // ---- resting-cortex point cloud (rejection-sampled inside the mask) ----
  // fewer points on small screens so phones stay smooth
  var N = (window.innerWidth < 640 ? 750 : 1400);
  var pts = [];               // {x,y,rim,gy}
  var guard = 0;
  while (pts.length < N && guard < N * 40) {
    guard++;
    var x = rnd() * 2 - 1, y = rnd() * 2 - 1;
    if (!inBrain(x, y)) continue;
    var rim = !inBrain(x * 1.05, y * 1.05) || !inBrain(x + Math.sign(x) * 0.04, y);
    var gy = 0.5 + 0.5 * Math.sin(11 * x + 7 * y) * Math.cos(9 * y);  // gyri shimmer phase
    pts.push({ x: x, y: y, rim: rim, gy: gy });
  }

  // ---- flashes of activity ----
  var flashes = [];           // {x,y,born,dur,peak}
  function spawnFlash(bandY, spread) {
    // pick a resting-cortex point near the scroll band so activity sits ON the cortex
    var best = null, bestd = Infinity;
    for (var k = 0; k < 7; k++) {
      var p = pts[(Math.random() * pts.length) | 0];
      var d = Math.abs(p.y - bandY) + Math.abs(p.x) * 0.15 * Math.random();
      if (d < bestd) { bestd = d; best = p; }
    }
    if (!best) return;
    flashes.push({
      x: best.x + (Math.random() - 0.5) * spread,
      y: best.y + (Math.random() - 0.5) * spread,
      born: _t, dur: 620 + Math.random() * 720, peak: 0.6 + Math.random() * 0.4,
    });
    if (flashes.length > 60) flashes.splice(0, flashes.length - 60);
  }

  // ---- sizing ----
  var W = 0, H = 0, DPR = 1, cx = 0, cy = 0, scale = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W * 0.5; cy = H * 0.5; scale = Math.min(W * 0.72, H * 0.66);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- scroll -> activation band + flash spawning ----
  function scrollProgress() {
    var max = (document.documentElement.scrollHeight || 0) - window.innerHeight;
    return max <= 0 ? 0 : Math.max(0, Math.min(1, (window.pageYOffset || 0) / max));
  }
  var sp = scrollProgress(), lastY = window.pageYOffset || 0, scrollAccum = 0, _t = 0;

  function onScroll() {
    var y = window.pageYOffset || 0;
    scrollAccum += Math.abs(y - lastY);
    lastY = y;
    // spawn flashes proportional to how far you scrolled (capped), on the sweep band
    var band = 0.85 - scrollProgress() * 1.7;   // top(+0.85) -> bottom(-0.85) as you scroll
    var n = Math.min(9, Math.floor(scrollAccum / 24));
    if (n > 0) { scrollAccum -= n * 24; for (var i = 0; i < n; i++) spawnFlash(band, 0.18); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // union of two hemisphere ellipses + a brainstem nub, scaled by k about (cx,cy).
  // Filled (never stroked), so overlapping subpaths just merge into the silhouette.
  function unionPath(k) {
    var s = scale * k, p = new Path2D();
    // moveTo before each ellipse => 3 separate closed subpaths (no connecting lines,
    // which would otherwise enclose spurious triangles under the nonzero fill rule)
    p.moveTo(cx + 0.30 * s + 0.56 * s, cy);
    p.ellipse(cx + 0.30 * s, cy, 0.56 * s, 0.74 * s, 0, 0, 6.2832);
    p.moveTo(cx - 0.30 * s + 0.56 * s, cy);
    p.ellipse(cx - 0.30 * s, cy, 0.56 * s, 0.74 * s, 0, 0, 6.2832);
    p.moveTo(cx + 0.14 * s, cy + 0.82 * s);
    p.ellipse(cx, cy + 0.82 * s, 0.14 * s, 0.24 * s, 0, 0, 6.2832);
    return p;
  }

  // ---- render ----
  function draw(nowMs) {
    _t = nowMs || 0;
    sp += (scrollProgress() - sp) * 0.12;
    var band = 0.85 - sp * 1.7;                  // eased sweep band
    var shimmer = reduce ? 1 : 0.6 + 0.4 * Math.sin(_t * 0.001);

    ctx.clearRect(0, 0, W, H);

    // 0) brain silhouette — a clean glowing rim (via inset punch-out) + faint interior
    //    mass, so the shape unmistakably reads as a front-view brain.
    var outer = unionPath(1.0), inner = unionPath(0.955);
    ctx.save();
    ctx.shadowColor = "rgba(127,212,255,0.45)"; ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(150,214,250,0.38)"; ctx.fill(outer);       // ring base
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "destination-out"; ctx.fill(inner); // punch -> ring
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(70,130,190,0.028)"; ctx.fill(inner);        // faint interior mass
    // carve the longitudinal fissure notch at the top centre
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.74 * scale);
    ctx.lineTo(cx - 0.05 * scale, cy - 0.40 * scale);
    ctx.lineTo(cx + 0.05 * scale, cy - 0.40 * scale);
    ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    // 1) resting cortex — neon dots forming the brain silhouette; rim glows, and a
    //    band of extra activation follows your scroll position down the cortex
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var sx = cx + p.x * scale, sy = cy - p.y * scale;
      var nearBand = Math.exp(-((p.y - band) * (p.y - band)) / (2 * 0.10));  // glow along sweep
      var base = (p.rim ? 0.42 : 0.16) + 0.07 * p.gy * shimmer + 0.30 * nearBand;
      if (base > 0.85) base = 0.85;
      ctx.fillStyle = "rgba(160,216,248," + base.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(sx, sy, p.rim ? 1.7 : 1.15, 0, 6.2832);
      ctx.fill();
    }

    // 2) flashes — bright neon blooms, additive, rise then fade
    ctx.globalCompositeOperation = "lighter";
    for (var f = flashes.length - 1; f >= 0; f--) {
      var fl = flashes[f];
      var age = (_t - fl.born) / fl.dur;
      if (age >= 1) { flashes.splice(f, 1); continue; }
      var env = age < 0.18 ? age / 0.18 : 1 - (age - 0.18) / 0.82;   // fast rise, slow decay
      var a = env * fl.peak;
      var fx = cx + fl.x * scale, fy = cy - fl.y * scale;
      var R = (14 + 48 * age) * (0.8 + 0.7 * fl.peak);               // bloom grows as it fades
      var g = ctx.createRadialGradient(fx, fy, 0, fx, fy, R);
      g.addColorStop(0, "rgba(240,252,255," + (0.9 * a).toFixed(3) + ")");
      g.addColorStop(0.35, "rgba(150,215,255," + (0.5 * a).toFixed(3) + ")");
      g.addColorStop(1, "rgba(120,200,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx, fy, R, 0, 6.2832); ctx.fill();
      // hot core
      ctx.fillStyle = "rgba(255,255,255," + (0.8 * a).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(fx, fy, 1.6 + 1.4 * env, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    if (!reduce) requestAnimationFrame(draw);
  }

  if (reduce) {
    // motion-sensitive: NO flashing at all — just the static resting cortex, once,
    // redrawn on scroll so the sweep-band glow still tracks position without motion.
    draw(0);
    window.addEventListener("scroll", function () { sp = scrollProgress(); draw(0); },
      { passive: true });
  } else {
    // a gentle idle heartbeat so it breathes even when not scrolling
    setInterval(function () { if (!reduce) spawnFlash(0.85 - sp * 1.7, 0.5); }, 620);
    requestAnimationFrame(draw);
  }
})();
