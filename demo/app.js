/* Soma demo player.
 * Loads an arc.json (from batch_extract.py) and draws three time-synced lanes on
 * one shared playhead: attention, valence, arousal (+ an optional coarse-state
 * lane). No GPU, no backend: arc.json is a static asset. Live arcs published to
 * Supabase are folded into the picker on load (mergeLiveArcs). The roadmap panel
 * previews the path toward named emotions.
 */
(function () {
  // ---- sample ads (illustrative; each points at a static arc file) ----
  const VIDEOS = [
    { id: "hero1", title: "Skincare launch", src: "DTC", arc: "arcs/sample_arc.json",
      grad: "linear-gradient(135deg,#2b3d4c,#0c1119 62%,#05070b)" },
    { id: "hero2", title: "App promo", src: "performance", arc: "arcs/hero2.json",
      grad: "linear-gradient(120deg,#20313e,#0a0f16 58%,#05070b)" },
    { id: "hero3", title: "Snack brand", src: "social", arc: "arcs/hero3.json",
      grad: "linear-gradient(150deg,#354a58,#0d141c 60%,#05070b)" },
  ];

  // ---- product roadmap (shown in the Vision panel) ----
  const LADDER = [
    { lvl: "Rung 0", live: true,  text: "<b>Attention arc</b> — moment-to-moment salience across the clip, with weak-spot callouts. <b>Live today.</b>" },
    { lvl: "Rung 1", next: true,  text: "<b>2D affect arc</b> — valence + arousal, beat by beat. Shipping now." },
    { lvl: "Rung 2", text: "<b>Calibrated affect on real ads</b> — with confidence bands, tuned on your own campaigns and outcomes." },
    { lvl: "Rung 3", text: "<b>A few discrete states</b> — amusement, tension, boredom — flagged when the signal is clear." },
    { lvl: "Rung 4", text: "<b>Specific named emotions</b> — per-second probabilities over a rich emotion taxonomy, learned from real audience reactions." },
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    video: $("adVideo"),
    cAtt: $("cAtt"), cVal: $("cVal"), cAro: $("cAro"), brain: $("brainSvg"),
    playBtn: $("playBtn"), scrub: $("scrub"), clock: $("clock"),
    callout: $("callout"), brainT: $("brainT"), upload: $("uploadBtn"),
    videoFile: $("videoFile"), uploadEmail: $("uploadEmail"),
    uploadStatus: $("uploadStatus"), fileLabel: $("fileLabel"),
    coarseWrap: $("coarseWrap"), cCoarse: $("cCoarse"), coarseLegend: $("coarseLegend"),
  };

  const PLAY_SVG = '<svg viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9"/><rect x="7" y="1.5" width="3" height="9"/></svg>';

  let arc = null, duration = 0, playing = false;
  let timerBase = 0, timerT0 = 0;
  // hasVideo: real-footage sync mode (arc.video_src set); else timer fallback.
  // hasCoarse: arc.affect.coarse_states present. started: single-run loop guard.
  // failed: last load errored — loop() holds the error frame instead of redrawing
  // stale data. userPicked: the visitor has chosen a card, so a late live-arc fetch
  // won't yank their selection out from under them.
  let hasVideo = false, hasCoarse = false, started = false, failed = false, userPicked = false;

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
  // A video item carries EITHER `arc` (a URL to a static sample json) OR
  // `arcData` (an arc object already in memory — e.g. fetched live from Supabase).
  function loadArc(item) {
    if (item && item.arcData) return Promise.resolve(item.arcData);
    return fetch(item.arc).then((r) => { if (!r.ok) throw new Error("arc " + r.status); return r.json(); });
  }
  // an arc is drawable only if it has parallel timestamps + activation arrays and a
  // real duration; anything else (esp. an unvalidated live Supabase row) is rejected
  // up front so it can never brick the render loop mid-frame.
  function validArc(d) {
    if (!d || typeof d !== "object") return false;
    if (!Array.isArray(d.timestamps) || !d.timestamps.length) return false;
    if (!Array.isArray(d.activation) || !d.activation.length) return false;
    const dur = d.duration_sec || d.timestamps[d.timestamps.length - 1] || 0;
    return dur > 0;
  }
  function load(item) {
    const label = (item && (item.title || item.id || item.arc)) || "arc";
    loadArc(item)
      .then((data) => {
        if (!validArc(data)) { bail(label, new Error("malformed arc data")); return; }
        arc = data; failed = false;
        if (item && item.arc && typeof data.duration_sec === "number") { item.dur = data.duration_sec; updateCardDur(item); }
        init();
      })
      .catch((e) => bail(label, e));
  }
  function bail(label, e) {
    failed = true;
    [els.cAtt, els.cVal, els.cAro].filter(Boolean).forEach((c) => {
      const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = "#ff7a7a"; x.font = "13px ui-monospace,monospace";
      x.fillText("Could not load " + label + " — " + ((e && e.message) || "error"), 14, 26);
    });
  }

  function init() {
    const ts = arc.timestamps || [];
    duration = arc.duration_sec || ts[ts.length - 1] || 0;
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
  function setBtn(on) { playing = on; els.playBtn.innerHTML = on ? PAUSE_SVG : PLAY_SVG; els.playBtn.setAttribute("aria-label", on ? "Pause" : "Play"); }
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
      x.fillStyle = "rgba(255,122,122,0.10)";   // faint red = weak-spot warning band
      x.fillRect(xAt(c, w.start), top, xAt(c, w.end) - xAt(c, w.start), bot - top);
    });
    const grad = x.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#8FB3C0"); grad.addColorStop(0.5, "#EAF6FA"); grad.addColorStop(1, "#8FB3C0");   // ice ramp
    x.save();
    x.beginPath(); x.lineWidth = 2.2; x.strokeStyle = grad;
    x.shadowColor = "rgba(191,224,236,.6)"; x.shadowBlur = 12;   // ice glow
    xs.forEach((tt, i) => { const px = xAt(c, tt), py = Y(ys[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    x.restore();
    x.lineTo(xAt(c, xs[xs.length - 1]), bot); x.lineTo(xAt(c, xs[0]), bot); x.closePath();
    x.fillStyle = "rgba(191,224,236,.08)"; x.fill();
    playhead(x, c, t, top, bot);
  }

  function drawSigned(canvas, seq, lo, hi, t, colorCss, mode) {
    // mode 'center' => baseline mid (valence, range ~[-1,1]); 'bottom' => baseline bottom (arousal, [0,1])
    const c = canvas, x = c.getContext("2d"), W = c.width, H = c.height, top = 10, bot = H - 12;
    x.clearRect(0, 0, W, H);
    if (!seq) { x.fillStyle = "#ADADB2"; x.font = "12px ui-monospace,monospace"; x.fillText("no affect data", 12, 24); return; }
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
    x.beginPath(); x.moveTo(px, top - 4); x.lineTo(px, bot); x.strokeStyle = "#EAF6FA"; x.lineWidth = 1.4; x.stroke();
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
    x.beginPath(); x.moveTo(phx, top - 2); x.lineTo(phx, bot); x.strokeStyle = "#EAF6FA"; x.lineWidth = 1.4; x.stroke();
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

  let loopErrLogged = false;   // warn once, not per-frame, if a draw ever throws
  function loop() {
    // a failed load left an error frame on the canvases — keep the loop alive but don't
    // repaint stale data over it (a later successful pick clears `failed`).
    if (failed) { requestAnimationFrame(loop); return; }
    try {
      const t = currentTime();
      if (playing && !hasVideo && t >= duration) setPlaying(false); // video mode ends via 'ended'
      const pct = duration ? (t / duration) * 100 : 0;
      els.scrub.value = pct;
      els.scrub.style.setProperty("--val", pct.toFixed(2) + "%");   // ice progress fill tracks the playhead
      els.scrub.setAttribute("aria-valuetext", fmt(t) + " of " + fmt(duration));   // announce time, not %
      els.clock.textContent = fmt(t) + " / " + fmt(duration);
      drawAttention(t);
      const af = arc.affect || {};
      drawSigned(els.cVal, af.valence, af.valence_lo, af.valence_hi, t, "rgba(234,244,255,COLOR)", "center");
      drawSigned(els.cAro, af.arousal, af.arousal_lo, af.arousal_hi, t, "rgba(143,179,192,COLOR)", "bottom");
      drawCoarse(t);
      drawBrain(t);
      const ws = activeWeakSpot(t);
      if (ws) { els.callout.classList.remove("hidden"); els.callout.innerHTML = "⚠ <strong>Weak spot at " + fmt(ws.start) + "</strong> — " + ws.label; }
      else els.callout.classList.add("hidden");
    } catch (e) {
      // defense-in-depth: a draw error must never kill the rAF chain (it re-arms below),
      // so the demo recovers on the next pick instead of freezing. Warn once, not at 60fps.
      if (!loopErrLogged) { loopErrLogged = true; console.warn("Soma loop draw error (suppressed after first):", e); }
    }
    requestAnimationFrame(loop);   // re-armed unconditionally, even after a draw error
  }

  // ---- wiring ----
  let refreshCompare = null;   // set by initCompare(); called after live arcs merge

  let currentId = null;
  function markActive(id) {
    document.querySelectorAll(".vid").forEach((el) => {
      const on = el.dataset.id === id;
      el.classList.toggle("active", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  function pickVideo(v) {
    if (!v) return;
    currentId = v.id;
    markActive(v.id);
    seek(0); setPlaying(false); load(v);
  }

  function durLabel(v) {
    const d = (typeof v.dur === "number" && v.dur) || (v.arcData && v.arcData.duration_sec);
    if (typeof d === "number" && d > 0) { const s = Math.round(d); return s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : s + "s"; }
    return "30s";
  }
  // once a URL-based arc has loaded we know its true length — correct that card's label
  // in place (no full re-render, so we don't disturb the current selection/playback).
  function updateCardDur(v) {
    const sel = (window.CSS && CSS.escape) ? CSS.escape(v.id) : v.id;
    const meta = document.querySelector('.vid[data-id="' + sel + '"] .vmeta');
    if (meta && meta.lastElementChild) meta.lastElementChild.textContent = durLabel(v);
  }

  // deterministic hash → seeded PRNG, so each card's decorative motif is stable per id
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // paint a faint, DECORATIVE cortical-signal motif on a card thumb (not real data —
  // an abstract identity mark, like the gradient behind it; no axes, no numbers).
  function paintThumb(canvas, id) {
    if (!canvas || !canvas.getContext) return;
    const x = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    const rnd = seeded(hashStr(id)), pts = 7;
    x.clearRect(0, 0, W, H);
    const line = (amp, yb, alpha, wob) => {
      const ys = []; for (let i = 0; i < pts; i++) ys.push(yb + (rnd() - 0.5) * amp);
      x.beginPath();
      for (let i = 0; i <= 60; i++) {
        const u = i / 60, f = u * (pts - 1), k = Math.floor(f), fr = f - k;
        const a = ys[k], b = ys[Math.min(k + 1, pts - 1)];
        const sm = fr * fr * (3 - 2 * fr);
        const y = a + (b - a) * sm + Math.sin(u * 9 + wob) * 2;
        const px = 6 + u * (W - 12);
        i ? x.lineTo(px, y) : x.moveTo(px, y);
      }
      x.strokeStyle = "rgba(191,224,236," + alpha + ")"; x.lineWidth = 1.4; x.stroke();
    };
    line(H * 0.34, H * 0.44, 0.5, 0);          // main ice contour
    line(H * 0.22, H * 0.66, 0.18, 2.1);       // faint echo
  }

  function renderVids() {
    $("vids").innerHTML = VIDEOS.map((v) => `
      <div class="vid" data-id="${escapeHtml(v.id)}" role="button" tabindex="0" aria-pressed="false" aria-label="Analyze ${escapeHtml(v.title)}">
        <div class="vthumb" style="background:${v.grad}">
          <canvas class="vthumb-arc" width="300" height="188" aria-hidden="true"></canvas>
          <div class="play"><svg viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11"/></svg></div>
          <div class="vmeta"><span>${escapeHtml(v.src)}</span><span>${escapeHtml(durLabel(v))}</span></div>
        </div>
        <div class="vtitle">${escapeHtml(v.title)}<span>${escapeHtml(v.src)}</span></div>
      </div>`).join("");
    document.querySelectorAll(".vid").forEach((el) => {
      const v = VIDEOS.find((vv) => vv.id === el.dataset.id);
      paintThumb(el.querySelector(".vthumb-arc"), el.dataset.id);
      el.addEventListener("click", () => { userPicked = true; pickVideo(v); });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); userPicked = true; pickVideo(v); }
      });
    });
  }
  renderVids();

  els.playBtn.addEventListener("click", () => setPlaying(!playing));
  els.scrub.addEventListener("input", () => seek((els.scrub.value / 100) * duration));
  [els.cAtt, els.cVal, els.cAro, els.cCoarse].filter(Boolean).forEach((c) =>
    c.addEventListener("click", (e) => { const r = c.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duration); }));

  // ---- live arcs from Supabase ----------------------------------------------
  // Any arc published with publish_to_supabase.py appears here on load — no
  // redeploy. Deterministic gradient from the id keeps the picker on-palette.
  function gradFor(id) {
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const hue = 188 + (h % 42);   // teal→blue band, matches the neon theme
    return `linear-gradient(135deg,hsl(${hue} 30% 25%),#0b1119 60%,#05070b)`;
  }
  function mergeLiveArcs() {
    const sb = window.Soma && window.Soma.supabase;
    if (!sb || !sb.enabled || typeof sb.fetchArcs !== "function") return;
    sb.fetchArcs().then((rows) => {
      if (!Array.isArray(rows) || !rows.length) return;
      const have = new Set(VIDEOS.map((v) => v.id));
      const live = [];
      rows.forEach((r) => {
        const id = r && r.ad_id;
        // skip dupes AND malformed live rows: gate the untrusted arc with validArc here
        // so a bad row never enters the picker, the auto-pick, or the compare dropdown.
        if (!id || have.has(id) || !validArc(r.arc)) return;
        have.add(id);
        const tag = r.meta && (r.meta.dataset || r.meta.source);
        live.push({ id: id, title: r.title || id, src: "live · " + (tag || "Supabase"),
          arcData: r.arc, grad: gradFor(id) });
      });
      if (!live.length) return;
      VIDEOS.unshift.apply(VIDEOS, live);   // newest-first from the API → lead the picker
      renderVids();
      if (refreshCompare) refreshCompare();
      // surface the newest live arc ONLY if the visitor hasn't engaged yet — never
      // interrupt an in-progress selection or playback (the fetch can resolve late).
      if (!userPicked && !playing) pickVideo(VIDEOS[0]);
      else markActive(currentId);           // re-render dropped the highlight; restore it
    }).catch(() => { /* offline / not set up yet — keep the samples */ });
  }

  // ---- upload box (concierge intake) ----------------------------------------
  (function initUpload() {
    const btn = els.upload, fileInp = els.videoFile, emailInp = els.uploadEmail,
      statusEl = els.uploadStatus, fileLabel = els.fileLabel;
    if (!btn) return;
    const sb = window.Soma && window.Soma.supabase;
    const MAX = 150 * 1024 * 1024;
    function setStatus(msg, kind) { if (!statusEl) return; statusEl.textContent = msg || ""; statusEl.className = "uploadstatus" + (kind ? " " + kind : ""); }
    if (fileInp && fileLabel) {
      fileInp.addEventListener("change", () => {
        const f = fileInp.files && fileInp.files[0];
        fileLabel.textContent = f ? f.name : "Choose a video…";
        if (f) setStatus("");
      });
    }
    if (!sb || !sb.enabled) setStatus("Concierge intake isn't configured yet — it turns on once Supabase is wired.", "muted");
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const f = fileInp && fileInp.files && fileInp.files[0];
      const email = (emailInp && emailInp.value || "").trim();
      if (!f) { setStatus("Pick a video first.", "err"); return; }
      if (f.size > MAX) { setStatus("That file is over 150 MB — trim it and try again.", "err"); return; }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setStatus("That email doesn't look right.", "err"); return; }
      if (!sb || !sb.enabled) { setStatus("Intake isn't configured — send the file to the team directly for now.", "muted"); return; }
      btn.disabled = true;
      setStatus("Uploading " + f.name + "…", "busy");
      try {
        await sb.uploadVideo(f, email, null);
        setStatus("Got it. We'll run " + f.name + " through the brain and " + (email ? "email your read to " + email : "get your read back") + " shortly.", "ok");
        if (fileInp) fileInp.value = "";
        if (fileLabel) fileLabel.textContent = "Choose a video…";
      } catch (err) {
        setStatus("Upload failed (" + ((err && err.message) || "unknown") + "). The team can take the file directly for now.", "err");
      } finally {
        btn.disabled = false;
      }
    });
  })();

  // roadmap ladder
  const ladderEl = $("ladder");
  if (ladderEl) ladderEl.innerHTML = LADDER.map((r) =>
    `<div class="rung ${r.live ? "live" : ""} ${r.next ? "next" : ""}"><span class="lvl">${r.lvl}</span><span>${r.text}</span></div>`).join("");

  // ---- (d) A/B compare — overlay two predicted attention arcs on one timeline ----
  (function initCompare() {
    const selA = $("cmpA"), selB = $("cmpB"), cv = $("cmpCanvas");
    if (!selA || !selB || !cv) return;
    const cache = {};
    const itemById = (id) => VIDEOS.find((v) => v.id === id);
    // key by id, resolve via loadArc() so inline (Supabase) arcs work like URL ones
    const getArc = (id) => {
      const it = itemById(id);
      if (!it) return Promise.reject(new Error("no item " + id));
      // memoize SUCCESSES only — evict a rejected arc so a later render retries instead
      // of staying stuck on the error string after one transient failure (no reload needed).
      if (!cache[id]) cache[id] = loadArc(it).catch((e) => { delete cache[id]; throw e; });
      return cache[id];
    };
    const titleFor = (id) => (itemById(id) || {}).title || "—";
    function fillOpts() {
      const prevA = selA.value, prevB = selB.value;
      const opts = VIDEOS.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.title)}</option>`).join("");
      selA.innerHTML = opts; selB.innerHTML = opts;
      if (VIDEOS.some((v) => v.id === prevA)) selA.value = prevA; else selA.selectedIndex = 0;
      if (VIDEOS.some((v) => v.id === prevB)) selB.value = prevB; else selB.selectedIndex = Math.min(1, VIDEOS.length - 1);
    }
    const COL_A = "#EAF6FA", COL_B = "#BFE0EC", N = 120;
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
        // "who leads" strip along the bottom — A leads = tall bright bar, B leads = short
        // dim bar, so the two states differ by height AND luminance (not near-identical hue).
        let aWins = 0;
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1), av = sampleAt(A, u), bv = sampleAt(B, u), aLead = av >= bv;
          if (aLead) aWins++;
          const h = aLead ? 9 : 4;
          x.fillStyle = aLead ? "rgba(234,246,250,.85)" : "rgba(143,179,192,.7)";
          x.fillRect(X(u), bot + 6, (W - 2 * pad) / N + 0.8, h);
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
          : `<b>A</b> holds higher predicted attention <b>${pa}%</b> of the clip; <b>B</b> the other <b>${100 - pa}%</b>.`;
      }).catch(() => { $("cmpSummary").textContent = "Could not load one of the arcs."; });
    }
    selA.addEventListener("change", render);
    selB.addEventListener("change", render);
    fillOpts();
    render();
    refreshCompare = function () { fillOpts(); render(); };
  })();

  // ---- (e) scroll reveals ----------------------------------------------------
  // Enhance already-visible sections with a gentle rise-in. SAFE: the .reveal class
  // (which sets opacity:0) is added by JS only, so a no-JS / no-IO render shows
  // everything. A failsafe reveals anything still hidden after load, so nothing can
  // ever ship blank if an observer never fires (hidden tab / headless).
  (function initReveals() {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = Array.prototype.slice.call(document.querySelectorAll(".compare,.vision"));
    if (!targets.length) return;
    if (reduce || !("IntersectionObserver" in window)) return;   // leave fully visible
    targets.forEach((el) => el.classList.add("reveal"));
    const revealNow = (el) => el.classList.add("in");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { revealNow(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    targets.forEach((el) => io.observe(el));
    // failsafe: never let a target stay hidden
    const flush = () => targets.forEach(revealNow);
    window.addEventListener("load", () => setTimeout(flush, 1600));
    setTimeout(flush, 3500);
  })();

  // start
  pickVideo(VIDEOS[0]);
  mergeLiveArcs();   // fold in any live Supabase arcs (async; no-op if unconfigured)
})();
