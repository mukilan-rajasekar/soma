/* Soma demo player — honest rebuild.
 * Loads an arc.json (from batch_extract.py) and draws three time-synced lanes on
 * one shared playhead: attention, valence, arousal. Every lane carries an evidence
 * badge; affect lanes are marked HYPOTHESIS until affect.status flips. No GPU, no
 * backend: arc.json is a static asset. Named-emotion percentages are deliberately
 * NOT rendered as results — they live only in the greyed "Vision" roadmap panel.
 */
(function () {
  // ---- sample ads (illustrative; each points at a static arc file) ----
  const VIDEOS = [
    { id: "hero1", title: "Skincare launch (30s)", src: "sample · DTC", arc: "arcs/sample_arc.json",
      grad: "linear-gradient(135deg,#2b3d4c,#0c1119 62%,#05070b)" },
    { id: "hero2", title: "App promo (30s)", src: "sample · performance", arc: "arcs/hero2.json",
      grad: "linear-gradient(120deg,#20313e,#0a0f16 58%,#05070b)" },
    { id: "hero3", title: "Snack brand (30s)", src: "sample · social", arc: "arcs/hero3.json",
      grad: "linear-gradient(150deg,#354a58,#0d141c 60%,#05070b)" },
  ];

  // ---- honest claim ladder (shown in the Vision panel) ----
  const LADDER = [
    { lvl: "Rung 0", live: true,  text: "<b>Attention arc</b> — relative moment-to-moment salience. Validated vs TVSum, circular-shift null. (shipped)" },
    { lvl: "Rung 1", next: true,  text: "<b>2D affect arc</b> — relative valence + arousal. Earned by held-out test vs LIRIS-ACCEDE that beats a null AND a stimulus-only baseline. (near-term)" },
    { lvl: "Rung 2", text: "<b>Calibrated affect on real ads</b> — with confidence bands, validated on our own held-out ads vs self-report dials + wearable arousal." },
    { lvl: "Rung 3", text: "<b>A few discrete states</b> (amusement, tension, boredom…) — each shipped only after held-out AUROC clears a preset bar; the model abstains when unsure." },
    { lvl: "Rung 4", text: "<b>Specific named emotions</b> — per-second probabilities over a validated subset of the 27-emotion taxonomy, fMRI-earned, with a published accuracy table + a list of what we can't detect." },
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    video: $("adVideo"),
    cAtt: $("cAtt"), cVal: $("cVal"), cAro: $("cAro"), brain: $("brainSvg"),
    playBtn: $("playBtn"), scrub: $("scrub"), clock: $("clock"),
    callout: $("callout"), brainT: $("brainT"), upload: $("uploadBtn"),
    badgeAtt: $("badgeAtt"), badgeVal: $("badgeVal"), badgeAro: $("badgeAro"),
    coarseWrap: $("coarseWrap"), cCoarse: $("cCoarse"), coarseLegend: $("coarseLegend"),
  };

  const PLAY_SVG = '<svg viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9"/><rect x="7" y="1.5" width="3" height="9"/></svg>';

  let arc = null, duration = 0, playing = false;
  let timerBase = 0, timerT0 = 0;
  // hasVideo: real-footage sync mode (arc.video_src set); else timer fallback.
  // hasCoarse: arc.affect.coarse_states present. started: single-run loop guard.
  let hasVideo = false, hasCoarse = false, started = false;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- brain nodes (illustrative fire-blob viz tied to attention) ----
  const NODES = [];
  (function seedBrain() {
    const cx = 150, cy = 112, rx = 116, ry = 82, n = 44;
    // deterministic scatter (no Math.random needed at draw time)
    for (let i = 0; i < n; i++) {
      const ang = (i * 2.399963); // golden angle
      const rr = Math.sqrt((i + 0.5) / n);
      NODES.push({ x: cx + Math.cos(ang) * rx * rr * 0.92, y: cy + Math.sin(ang) * ry * rr * 0.92,
        ph: (i % 7) * 0.9, off: ((i % 5) - 2) * 0.12, r: 1.6 + (i % 4) * 0.6 });
    }
  })();
  const BLOB = "M150,26 C205,26 262,52 268,106 C272,144 250,190 196,200 C150,208 96,204 58,176 C24,152 28,102 44,72 C64,36 100,26 150,26 Z";
  function fireColor(a) {
    a = Math.max(0, Math.min(1, a));
    const s = [[8,12,18],[22,42,60],[70,120,152],[150,215,240],[240,252,255]];
    const x = a * (s.length - 1), i = Math.floor(x), f = x - i;
    const c1 = s[i], c2 = s[Math.min(i + 1, s.length - 1)];
    const m = (k) => Math.round(c1[k] + (c2[k] - c1[k]) * f);
    return `rgb(${m(0)},${m(1)},${m(2)})`;
  }

  // ---- load ----
  function load(url) {
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error("arc " + r.status); return r.json(); })
      .then((data) => { arc = data; init(); })
      .catch((e) => bail(url, e));
  }
  function bail(url, e) {
    [els.cAtt, els.cVal, els.cAro].forEach((c) => {
      const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = "#ff6b6b"; x.font = "13px monospace";
      x.fillText("Could not load " + url + " — " + e.message, 14, 26);
    });
  }

  function init() {
    duration = arc.duration_sec || (arc.timestamps[arc.timestamps.length - 1] || 0);
    // badge for attention (from claim)
    els.badgeAtt.textContent = "weakly validated · vs TVSum";
    // affect badges reflect status
    const st = (arc.affect && arc.affect.status) || "illustrative";
    const affectBadge = st === "permutation-tested" ? ["badge a", "weakly validated"]
      : st === "hypothesis" ? ["badge r", "hypothesis · testing"]
      : ["badge r", "illustrative · not run"];
    [els.badgeVal, els.badgeAro].forEach((b) => { b.className = affectBadge[0]; b.textContent = affectBadge[1]; });

    setupVideo();   // (a) real footage sync if arc.video_src is non-empty; else timer
    setupCoarse();  // (b) coarse discrete-state distribution if arc.affect.coarse_states present
    if (!started) { started = true; requestAnimationFrame(loop); } // one loop, not one-per-pick
  }

  // ---- (a) real footage sync -------------------------------------------------
  // If arc.video_src is a non-empty URL, drive the shared clock from an HTML5
  // <video>'s currentTime and mirror play/pause/seek to it. Empty => timer.
  function setupVideo() {
    const v = els.video;
    hasVideo = false;
    if (!v) return;
    const src = (arc.video_src || "").trim();
    if (!src) {                      // timer fallback: unload + hide the element
      try { v.pause(); } catch (e) {}
      v.removeAttribute("src");
      v.load && v.load();
      v.classList.add("hidden");
      return;
    }
    hasVideo = true;
    if (v.getAttribute("src") !== src) { v.setAttribute("src", src); v.load && v.load(); }
    v.classList.remove("hidden");
    // adopt the true media length only when the arc did not declare one
    v.onloadedmetadata = () => { if (!arc.duration_sec && isFinite(v.duration) && v.duration > 0) duration = v.duration; };
    // keep the transport button honest if the native <video> controls are used
    v.onplay = () => setBtn(true);
    v.onpause = () => setBtn(false);
    v.onended = () => setBtn(false);
    try { v.currentTime = currentTime(); } catch (e) {}
  }

  function currentTime() {
    if (hasVideo && els.video) return Math.min(duration || Infinity, els.video.currentTime || 0);
    if (!playing) return timerBase;
    return Math.min(duration, timerBase + (performance.now() - timerT0) / 1000);
  }
  // setBtn: update only the flag + icon (used by native <video> events too).
  function setBtn(on) { playing = on; els.playBtn.innerHTML = on ? PAUSE_SVG : PLAY_SVG; }
  function setPlaying(on) {
    if (hasVideo && els.video) {         // video mode: command it; events sync the button
      if (on) { const p = els.video.play(); if (p && p.catch) p.catch(() => {}); }
      else els.video.pause();
      return;
    }
    setBtn(on);
    if (on) timerT0 = performance.now(); else timerBase = currentTime();
  }
  function seek(t) {
    t = Math.max(0, Math.min(duration, t));
    timerBase = t; timerT0 = performance.now();
    if (hasVideo && els.video) { try { els.video.currentTime = t; } catch (e) {} }
  }

  // ---- geometry helpers ----
  function xAt(c, t) { const pad = 8; return pad + (t / duration) * (c.width - 2 * pad); }

  function drawAttention(t) {
    const c = els.cAtt, x = c.getContext("2d"), W = c.width, H = c.height, pad = 8, top = 10, bot = H - 14;
    const xs = arc.timestamps, ys = arc.activation;
    x.clearRect(0, 0, W, H);
    const Y = (v) => bot - v * (bot - top);
    (arc.weak_spots || []).forEach((w) => {
      x.fillStyle = "rgba(255,107,107,0.10)";   // faint red = warning band (kept: semantic)
      x.fillRect(xAt(c, w.start), top, xAt(c, w.end) - xAt(c, w.start), bot - top);
    });
    const grad = x.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#7FD4FF"); grad.addColorStop(0.5, "#FFFFFF"); grad.addColorStop(1, "#7FD4FF");
    x.save();
    x.beginPath(); x.lineWidth = 2.2; x.strokeStyle = grad;
    x.shadowColor = "rgba(127,212,255,.75)"; x.shadowBlur = 10;   // neon glow
    xs.forEach((tt, i) => { const px = xAt(c, tt), py = Y(ys[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    x.restore();
    x.lineTo(xAt(c, xs[xs.length - 1]), bot); x.lineTo(xAt(c, xs[0]), bot); x.closePath();
    x.fillStyle = "rgba(127,212,255,.09)"; x.fill();
    playhead(x, c, t, top, bot);
  }

  function drawSigned(canvas, seq, lo, hi, t, colorCss, mode) {
    // mode 'center' => baseline mid (valence, range ~[-1,1]); 'bottom' => baseline bottom (arousal, [0,1])
    const c = canvas, x = c.getContext("2d"), W = c.width, H = c.height, top = 10, bot = H - 12;
    x.clearRect(0, 0, W, H);
    if (!seq) { x.fillStyle = "#5C6788"; x.font = "12px monospace"; x.fillText("no affect data", 12, 24); return; }
    const base = mode === "center" ? (top + bot) / 2 : bot;
    const scale = mode === "center" ? (bot - top) / 2 : (bot - top);
    const Y = (v) => base - v * scale;
    // baseline
    x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 1;
    x.beginPath(); x.moveTo(8, base); x.lineTo(W - 8, base); x.stroke();
    // uncertainty band
    if (lo && hi) {
      x.beginPath();
      arc.timestamps.forEach((tt, i) => { const px = xAt(c, tt), py = Y(hi[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
      for (let i = arc.timestamps.length - 1; i >= 0; i--) x.lineTo(xAt(c, arc.timestamps[i]), Y(lo[i]));
      x.closePath(); x.fillStyle = colorCss.replace("COLOR", ".14"); x.fill();
    }
    // line
    x.beginPath(); x.lineWidth = 2.2; x.strokeStyle = colorCss.replace("COLOR", "1");
    arc.timestamps.forEach((tt, i) => { const px = xAt(c, tt), py = Y(seq[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    playhead(x, c, t, top, bot);
  }

  function playhead(x, c, t, top, bot) {
    const px = xAt(c, t);
    x.beginPath(); x.moveTo(px, top - 4); x.lineTo(px, bot); x.strokeStyle = "#EAF9FF"; x.lineWidth = 1.4; x.stroke();
  }

  // ---- (b) coarse discrete-state distribution --------------------------------
  // arc.affect.coarse_states = { labels:[...], probs:[[...], ...] } where each
  // row sums to ~1. Rendered as a stacked probability band over time — a whole
  // distribution, never a single confident named-emotion %. Absent => hidden.
  // Monochrome cool-grey ramp (no rainbow) to fit the neon-white theme.
  function coarseColor(i, n) { const l = 38 + (i / Math.max(1, n - 1)) * 46; return `hsl(202 24% ${l}%)`; }

  function setupCoarse() {
    hasCoarse = false;
    if (!els.coarseWrap) return;
    const cs = arc.affect && arc.affect.coarse_states;
    const ok = cs && Array.isArray(cs.labels) && cs.labels.length
      && Array.isArray(cs.probs) && cs.probs.length && Array.isArray(cs.probs[0]);
    if (!ok) { els.coarseWrap.classList.add("hidden"); if (els.coarseLegend) els.coarseLegend.innerHTML = ""; return; }
    hasCoarse = true;
    els.coarseWrap.classList.remove("hidden");
    if (els.coarseLegend) els.coarseLegend.innerHTML = cs.labels.map((lb, i) =>
      `<span class="cs-key"><i style="background:${coarseColor(i, cs.labels.length)}"></i>${escapeHtml(lb)}</span>`).join("");
  }

  function drawCoarse(t) {
    const c = els.cCoarse; if (!c || !hasCoarse) return;
    const cs = arc.affect.coarse_states, x = c.getContext("2d"), W = c.width, H = c.height, top = 6, bot = H - 6;
    x.clearRect(0, 0, W, H);
    const labels = cs.labels, probs = cs.probs, n = probs.length, nb = labels.length;
    const useTs = arc.timestamps && probs.length === arc.timestamps.length;
    const pxAt = (i) => useTs ? xAt(c, arc.timestamps[i]) : (8 + (i / Math.max(1, n - 1)) * (W - 16));
    const Y = (v) => bot - clamp01(v) * (bot - top);
    // stacked bands: band b spans cumulative[b-1] .. cumulative[b]
    for (let b = 0; b < nb; b++) {
      x.beginPath();
      for (let i = 0; i < n; i++) {
        let cum = 0; for (let k = 0; k <= b; k++) cum += clamp01((probs[i] || [])[k] || 0);
        const px = pxAt(i), py = Y(cum); i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      for (let i = n - 1; i >= 0; i--) {
        let cum = 0; for (let k = 0; k < b; k++) cum += clamp01((probs[i] || [])[k] || 0);
        x.lineTo(pxAt(i), Y(cum));
      }
      x.closePath(); x.fillStyle = coarseColor(b, nb); x.globalAlpha = 0.82; x.fill(); x.globalAlpha = 1;
    }
    // playhead
    const phx = useTs ? xAt(c, t) : (8 + (duration ? t / duration : 0) * (W - 16));
    x.beginPath(); x.moveTo(phx, top - 2); x.lineTo(phx, bot); x.strokeStyle = "#EBEEF8"; x.lineWidth = 1.4; x.stroke();
  }

  function drawBrain(t) {
    const a = valAt(arc.activation, t);
    let s = `<path d="${BLOB}" fill="rgba(20,26,52,.5)" stroke="${fireColor(a * 0.7 + 0.15)}" stroke-width="1.2" opacity=".7"/>`;
    NODES.forEach((n) => {
      const local = Math.max(0, Math.min(1, a + n.off + 0.1 * Math.sin(t * 2 + n.ph)));
      const col = fireColor(local), R = n.r * (0.8 + local * 1.3);
      s += `<circle cx="${n.x}" cy="${n.y}" r="${(R * 3).toFixed(1)}" fill="${col}" opacity="${(0.05 + local * 0.13).toFixed(2)}"/>`;
      s += `<circle cx="${n.x}" cy="${n.y}" r="${R.toFixed(1)}" fill="${col}" opacity="${(0.35 + local * 0.55).toFixed(2)}"/>`;
    });
    s += `<text class="roi" x="66" y="140">visual</text><text class="roi" x="196" y="92">auditory</text><text class="roi" x="124" y="188">assoc.</text>`;
    els.brain.innerHTML = s;
    els.brainT.textContent = t.toFixed(1) + "s";
  }

  function valAt(seq, t) {
    const f = t / duration * (seq.length - 1), i = Math.floor(f), fr = f - i;
    const a = seq[i] ?? 0, b = seq[Math.min(i + 1, seq.length - 1)] ?? a;
    return a + (b - a) * fr;
  }
  function activeWeakSpot(t) { return (arc.weak_spots || []).find((w) => t >= w.start && t <= w.end) || null; }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  function loop() {
    const t = currentTime();
    if (playing && !hasVideo && t >= duration) setPlaying(false); // video mode ends via 'ended'
    els.scrub.value = duration ? (t / duration) * 100 : 0;
    els.clock.textContent = fmt(t) + " / " + fmt(duration);
    drawAttention(t);
    const af = arc.affect || {};
    drawSigned(els.cVal, af.valence, af.valence_lo, af.valence_hi, t, "rgba(234,244,255,COLOR)", "center");
    drawSigned(els.cAro, af.arousal, af.arousal_lo, af.arousal_hi, t, "rgba(150,180,205,COLOR)", "bottom");
    drawCoarse(t);
    drawBrain(t);
    const ws = activeWeakSpot(t);
    if (ws) { els.callout.classList.remove("hidden"); els.callout.innerHTML = "⚠ <strong>You lose them at " + fmt(ws.start) + "</strong> — " + ws.label + " <em>(predicted, to A/B test)</em>"; }
    else els.callout.classList.add("hidden");
    requestAnimationFrame(loop);
  }

  // ---- wiring ----
  function pickVideo(v) {
    document.querySelectorAll(".vid").forEach((el) => el.classList.toggle("active", el.dataset.id === v.id));
    seek(0); setPlaying(false); load(v.arc);
  }

  $("vids").innerHTML = VIDEOS.map((v) => `
    <div class="vid" data-id="${v.id}">
      <div class="vthumb" style="background:${v.grad}">
        <div class="play"><svg viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11"/></svg></div>
        <div class="vmeta"><span>${v.src}</span><span>30s</span></div>
      </div>
      <div class="vtitle">${v.title}<span>${v.src}</span></div>
    </div>`).join("");
  document.querySelectorAll(".vid").forEach((el) =>
    el.addEventListener("click", () => pickVideo(VIDEOS.find((v) => v.id === el.dataset.id))));

  els.playBtn.addEventListener("click", () => setPlaying(!playing));
  els.scrub.addEventListener("input", () => seek((els.scrub.value / 100) * duration));
  [els.cAtt, els.cVal, els.cAro, els.cCoarse].filter(Boolean).forEach((c) =>
    c.addEventListener("click", (e) => { const r = c.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duration); }));
  els.upload.addEventListener("click", (e) => { e.preventDefault(); });

  // roadmap ladder + flywheel (honest: nothing collected yet)
  $("ladder").innerHTML = LADDER.map((r) =>
    `<div class="rung ${r.live ? "live" : ""} ${r.next ? "next" : ""}"><span class="lvl">${r.lvl}</span><span>${r.text}</span></div>`).join("");

  // ---- (c) results auto-fill -------------------------------------------------
  // On load, try to fetch results.json. If present, populate the validation
  // strip with the REAL honest_corr_timeseries.py numbers. If absent (default),
  // the strip keeps its "illustrative — not yet run" state. A null pre-registered
  // result is displayed honestly (never upgraded to a "validated" claim).
  //
  // results.json shape (all fields optional; app degrades gracefully):
  //   {
  //     "n":            18,        // videos/timepoints tested  -> #vN  (alias: n_videos)
  //     "attention_r":  0.31,      // Spearman r pred-vs-human   -> #vR  (alias: r; null-safe)
  //     "permutation_p": 0.004,    // circular-shift perm p      -> #vP  (alias: p; null-safe)
  //     "beats_baseline": true,    // vs the ffmpeg dumb baseline-> #vBase ("yes"/"no")
  //     "feature":      "roi",     // pre-registered feature (roi|global) — for the tag
  //     "null_result":  false,     // explicit: pre-registered test returned null
  //     "tag":          "n=18 · measured (roi)"  // optional override for #validTag
  //   }
  function fmtNum(v, dp) { return typeof v === "number" ? v.toFixed(dp) : String(v); }
  function fmtP(p) { return typeof p === "number" ? (p < 0.001 ? "<0.001" : p.toFixed(3)) : String(p); }
  function applyResults(res) {
    if (!res || typeof res !== "object") return;
    const n = res.n != null ? res.n : res.n_videos;
    const r = res.attention_r != null ? res.attention_r : res.r;
    const p = res.permutation_p != null ? res.permutation_p : res.p;
    const beats = res.beats_baseline;
    if (n != null && $("vN")) $("vN").textContent = String(n);
    if (r != null && $("vR")) $("vR").textContent = fmtNum(r, 2);
    if (p != null && $("vP")) $("vP").textContent = fmtP(p);
    if (beats != null && $("vBase")) $("vBase").textContent = beats ? "yes" : "no";
    const tag = $("validTag");
    if (tag) {
      // honest: only "measured" when it's a real positive; otherwise "null result"
      const isNull = res.null_result === true
        || (typeof r === "number" && (p == null || (typeof p === "number" && p >= 0.05)))
        || beats === false;
      const feat = res.feature ? ` (${res.feature})` : "";
      tag.textContent = res.tag || (n != null ? `n=${n} · ` : "") + (isNull ? "null result — as pre-registered" : "measured") + feat;
      tag.classList.remove("illus");
      tag.classList.add(isNull ? "nulltag" : "realtag");
    }
  }
  fetch("results.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no results.json"))))
    .then(applyResults)
    .catch(() => { /* no real run yet — keep the illustrative state */ });

  // ---- (d) A/B compare — overlay two predicted attention arcs on one timeline ----
  (function initCompare() {
    const selA = $("cmpA"), selB = $("cmpB"), cv = $("cmpCanvas");
    if (!selA || !selB || !cv) return;
    const opts = VIDEOS.map((v) => `<option value="${v.arc}">${escapeHtml(v.title)}</option>`).join("");
    selA.innerHTML = opts; selB.innerHTML = opts;
    selA.selectedIndex = 0; selB.selectedIndex = 1;
    const cache = {};
    const getArc = (url) => cache[url] || (cache[url] = fetch(url).then((r) => r.json()));
    const COL_A = "#EAF9FF", COL_B = "#7FD4FF", N = 120;
    const titleFor = (url) => (VIDEOS.find((v) => v.arc === url) || {}).title || "—";
    function sampleAt(arc, u) {
      const seq = arc.activation || []; if (!seq.length) return 0;
      const f = u * (seq.length - 1), i = Math.floor(f), fr = f - i;
      const a = seq[i] ?? 0, b = seq[Math.min(i + 1, seq.length - 1)] ?? a;
      return a + (b - a) * fr;
    }
    function render() {
      Promise.all([getArc(selA.value), getArc(selB.value)]).then(([A, B]) => {
        const x = cv.getContext("2d"), W = cv.width, H = cv.height, pad = 10, top = 12, bot = H - 26;
        x.clearRect(0, 0, W, H);
        const X = (u) => pad + u * (W - 2 * pad), Y = (v) => bot - v * (bot - top);
        // baseline
        x.strokeStyle = "rgba(255,255,255,.10)"; x.lineWidth = 1;
        x.beginPath(); x.moveTo(pad, bot); x.lineTo(W - pad, bot); x.stroke();
        // "who leads" strip along the bottom
        let aWins = 0;
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1), av = sampleAt(A, u), bv = sampleAt(B, u);
          if (av >= bv) aWins++;
          x.fillStyle = av >= bv ? "rgba(234,249,255,.55)" : "rgba(127,212,255,.55)";
          x.fillRect(X(u), bot + 6, (W - 2 * pad) / N + 0.8, 7);
        }
        const curve = (arc, col, dash) => {
          x.save(); x.setLineDash(dash || []); x.beginPath(); x.lineWidth = 2.2;
          x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = 8;
          for (let i = 0; i < N; i++) { const u = i / (N - 1), px = X(u), py = Y(sampleAt(arc, u)); i ? x.lineTo(px, py) : x.moveTo(px, py); }
          x.stroke(); x.restore();
        };
        curve(B, COL_B, [6, 5]); curve(A, COL_A, []);
        $("cmpLegend").innerHTML =
          `<span class="k"><i style="border-top-color:${COL_A}"></i>A · ${escapeHtml(titleFor(selA.value))}</span>` +
          `<span class="k"><i style="border-top-color:${COL_B};border-top-style:dashed"></i>B · ${escapeHtml(titleFor(selB.value))}</span>` +
          `<span class="k">bottom strip = who's predicted higher, each moment</span>`;
        const pa = Math.round(100 * aWins / N);
        $("cmpSummary").innerHTML = (selA.value === selB.value)
          ? "Pick two <b>different</b> ads to compare."
          : `<b>A</b> holds higher predicted attention <b>${pa}%</b> of the clip; <b>B</b> <b>${100 - pa}%</b>. ` +
            "<em>Predicted from the file — illustrative until a real run, and not a substitute for an in-market A/B test.</em>";
      }).catch(() => { $("cmpSummary").textContent = "Could not load one of the arcs."; });
    }
    selA.addEventListener("change", render);
    selB.addEventListener("change", render);
    render();
  })();

  // start
  pickVideo(VIDEOS[0]);
})();
