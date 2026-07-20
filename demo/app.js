/* Soma demo player.
 * Loads an arc.json (from batch_extract.py) and draws three time-synced lanes on
 * one shared playhead: attention, valence, arousal (+ an optional coarse-state
 * lane). No GPU, no backend: arc.json is a static asset. Live arcs published to
 * Supabase are folded into the picker on load (mergeLiveArcs). The roadmap panel
 * previews the path toward named emotions.
 */
(function () {
  // ---- ads (hero1-3 are illustrative samples; real1 is a REAL frozen-TRIBE run) ----
  const VIDEOS = [
    { id: "real1", title: "Real TRIBE run · TVSum clip", src: "real · TRIBE v2", arc: "arcs/real_esJrBWj2d8.json",
      grad: "linear-gradient(140deg,#1c2e3a,#0a0f16 60%,#05070b)" },
    { id: "real2", title: "Real run · TVSum clip", src: "real · TRIBE v2", arc: "arcs/real_EE-bNr36nyA.json",
      grad: "linear-gradient(140deg,#22303a,#0a0f16 60%,#05070b)" },
    { id: "real3", title: "Real run · TVSum clip", src: "real · TRIBE v2", arc: "arcs/real_3eYKfiOEJNs.json",
      grad: "linear-gradient(150deg,#1e2c36,#0b1017 60%,#05070b)" },
    { id: "hero1", title: "Skincare launch", src: "DTC · sample", arc: "arcs/sample_arc.json",
      grad: "linear-gradient(135deg,#2b3d4c,#0c1119 62%,#05070b)" },
    { id: "hero2", title: "App promo", src: "performance · sample", arc: "arcs/hero2.json",
      grad: "linear-gradient(120deg,#20313e,#0a0f16 58%,#05070b)" },
    { id: "hero3", title: "Snack brand", src: "social · sample", arc: "arcs/hero3.json",
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

  // ---- cortical read-out: a lateral hemisphere outline over a vertex mesh, plus a live
  // magnitude readout + activation colorbar. The ENTIRE mesh warms UNIFORMLY off ONE global
  // scalar (valAt(arc.activation, t)); nothing is per-region and NO per-region numbers are
  // ever printed — the only value shown is that single whole-cortex magnitude.
  const CORTEX_PATH = "M262,120 C262,80 232,52 190,46 C168,43 150,42 132,44 C96,48 60,64 46,96 C38,114 40,128 54,138 C64,145 78,146 92,150 C98,160 108,172 126,176 C150,182 178,180 200,170 C226,158 250,150 262,120 Z";
  const SULCI = [
    "M62,102 C98,90 150,88 196,98 C224,104 244,108 256,114",
    "M66,124 C104,120 150,124 198,130 C222,133 240,134 252,131",
    "M94,150 C122,150 150,152 182,149",
  ];
  let brainBuilt = false, brainEls = null;
  // deterministic vertex mesh: a grid of dots clipped to the cortex outline — evokes the
  // fsaverage vertex surface (technical, not an abstract blob). Each dot's baseline alpha is
  // fixed decorative texture; the whole GROUP's opacity is what tracks activation, so every
  // "vertex" brightens together off the single global magnitude (never per-region).
  function meshDots() {
    let out = "";
    for (let gy = 50; gy <= 180; gy += 10) {
      for (let gx = 30; gx <= 258; gx += 10) {
        const seed = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        const a = 0.30 + (seed % 1000) / 1000 * 0.6;                 // fixed per-dot texture
        const r = (1.0 + ((seed >> 10) % 100) / 100 * 0.8).toFixed(2);
        out += `<circle cx="${gx}" cy="${gy}" r="${r}" fill="#BFE0EC" fill-opacity="${a.toFixed(2)}"/>`;
      }
    }
    return out;
  }
  function setupBrain() {
    // built ONCE; drawBrain() then only sets a few attributes/textContent (no per-frame reparse)
    const sulci = SULCI.map((d) => `<path d="${d}" fill="none" stroke="#8FB3C0" stroke-width="1" opacity=".14"/>`).join("");
    els.brain.innerHTML =
      `<defs>` +
        `<clipPath id="brClip"><path d="${CORTEX_PATH}"/></clipPath>` +
        `<linearGradient id="brBarGrad" x1="0" y1="1" x2="0" y2="0">` +
          `<stop offset="0" stop-color="#20242a"/><stop offset=".45" stop-color="#8FB3C0"/><stop offset="1" stop-color="#EAF6FA"/>` +
        `</linearGradient>` +
      `</defs>` +
      // live whole-cortex magnitude readout (0–1) + running peak
      `<text id="brMag" x="14" y="30" fill="#EAF6FA" font-family="ui-monospace,monospace" font-size="21" font-weight="600">0.00</text>` +
      `<text x="14" y="43" fill="#7C7C82" font-family="ui-monospace,monospace" font-size="8" letter-spacing=".8">GLOBAL ACTIVATION · NORM</text>` +
      `<text id="brPk" x="252" y="24" text-anchor="end" fill="#8FB3C0" font-family="ui-monospace,monospace" font-size="9">PK 0.00</text>` +
      // cortex glow + outline + sulci + vertex mesh
      `<path id="brGlow" d="${CORTEX_PATH}" fill="none" stroke="#BFE0EC" stroke-width="7" opacity="0"/>` +
      `<path id="brShell" d="${CORTEX_PATH}" fill="rgba(143,179,192,.05)" stroke="#8FB3C0" stroke-width="1.1" stroke-opacity=".6"/>` +
      sulci +
      `<g id="brMesh" clip-path="url(#brClip)" opacity="0.12">${meshDots()}</g>` +
      // activation colorbar + moving marker
      `<rect x="270" y="56" width="6" height="122" rx="3" fill="url(#brBarGrad)" opacity=".72"/>` +
      `<rect x="270" y="56" width="6" height="122" rx="3" fill="none" stroke="#8FB3C0" stroke-opacity=".3"/>` +
      `<text x="266" y="59" text-anchor="end" fill="#7C7C82" font-family="ui-monospace,monospace" font-size="8">1.0</text>` +
      `<text x="266" y="181" text-anchor="end" fill="#7C7C82" font-family="ui-monospace,monospace" font-size="8">0</text>` +
      `<rect id="brMark" x="267" y="176" width="12" height="2.2" rx="1" fill="#EAF6FA"/>`;
    brainEls = {
      glow: els.brain.querySelector("#brGlow"),
      shell: els.brain.querySelector("#brShell"),
      mesh: els.brain.querySelector("#brMesh"),
      mark: els.brain.querySelector("#brMark"),
      mag: els.brain.querySelector("#brMag"),
      pk: els.brain.querySelector("#brPk"),
    };
    brainBuilt = true;
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
    // parallel arrays: a length mismatch draws a silently WRONG-but-plausible curve
    // (points indexed off the wrong axis), so reject rather than render it.
    if (d.timestamps.length !== d.activation.length) return false;
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
    // a failed load must not leave the previous arc's honesty badge stranded over the error
    // frame (it would assert a lane state no longer shown).
    document.querySelectorAll(".headbadge").forEach((b) => b.remove());
    [els.cAtt, els.cVal, els.cAro].filter(Boolean).forEach((c) => {
      const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = "#ff7a7a"; x.font = "13px ui-monospace,monospace";
      x.fillText("Could not load " + label + " — " + ((e && e.message) || "error"), 14, 26);
    });
  }

  function init() {
    const ts = arc.timestamps || [];
    duration = arc.duration_sec || ts[ts.length - 1] || 0;
    computeStats();  // descriptive per-lane metrics (peak / mean / min) for the read-out overlays
    // when head_apply.py has written a trained-head lane, the demoted arithmetic arc rides
    // along as arc.baseline — drawn faint under the headline head arc (honest before/after).
    arc._baseline = (arc.baseline && Array.isArray(arc.baseline.activation)) ? arc.baseline.activation : null;
    setHeadBadge();  // (c) head-arc honesty badge on the attention lane (no-op if absent)
    setupVideo();   // (a) real footage sync if arc.video_src is non-empty; else timer
    setupCoarse();  // (b) coarse discrete-state distribution if arc.affect.coarse_states present
    if (!started) { started = true; startLoop(); } // one loop, not one-per-pick (gated + re-armable)
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

  // ---- geometry + instrument helpers ----
  const PADL = 30, PADR = 12;                 // left gutter holds the y-axis tick labels
  function xAt(c, t) { return PADL + (duration ? t / duration : 0) * (c.width - PADL - PADR); }
  function timeTicks() {                       // evenly-spaced time gridlines (0..duration)
    if (!duration) return [];
    const n = 4, out = [];
    for (let i = 0; i <= n; i++) out.push((duration * i) / n);
    return out;
  }
  // per-lane summary stats, computed ONCE per clip. Honest: peak/mean/min are plain
  // descriptive statistics of the very same scalar the curve plots — nothing fabricated,
  // nothing per-region.
  let arcStats = null;
  function statOf(arr) {
    if (!Array.isArray(arr) || !arr.length) return null;
    let mn = Infinity, mx = -Infinity, s = 0, ai = 0;
    for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v < mn) mn = v; if (v > mx) { mx = v; ai = i; } s += v; }
    return { min: mn, max: mx, mean: s / arr.length, argmax: ai };
  }
  function computeStats() {
    const af = arc.affect || {};
    arcStats = { att: statOf(arc.activation), val: statOf(af.valence), aro: statOf(af.arousal) };
  }
  // (c) head-arc honesty badges. When head_apply.py has written trained-head lanes, surface
  // each lane's badge under its title (attention + valence + arousal). Absent => nothing
  // shown (sample cards + pre-head arcs unaffected). It NEVER asserts validation: any status
  // that is not the validated tier ("learned-hypothesis") shows in warning red, so a smoke /
  // unvalidated / poisoned head can't be mistaken for a validated result.
  function setLaneBadge(canvasEl, txt, st) {
    const lane = canvasEl && canvasEl.closest && canvasEl.closest(".lane");
    const h = lane && lane.querySelector(".lane-h");
    const nameEl = (h && h.querySelector(".name")) || h;
    if (!nameEl) return;
    let b = nameEl.querySelector(".headbadge");
    if (!txt) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("small"); b.className = "headbadge"; nameEl.appendChild(b); }
    b.textContent = txt;
    b.style.cssText = "display:block;margin-top:5px;font:11px/1.35 ui-monospace,monospace;" +
      "max-width:62ch;letter-spacing:.2px;opacity:.9;color:" +
      ((st === "learned-hypothesis") ? "#8FB3C0" : "#ff9a9a");
  }
  function setHeadBadge() {
    const laneA = arc.lanes && arc.lanes.attention;
    setLaneBadge(els.cAtt, arc.attention_badge || (laneA && laneA.badge) || "",
      arc.attention_status || (laneA && laneA.status) || "");
    const af = arc.affect || {}, lv = arc.lanes && arc.lanes.valence, la = arc.lanes && arc.lanes.arousal;
    setLaneBadge(els.cVal, af.valence_badge || (lv && lv.badge) || "",
      af.valence_status || (lv && lv.status) || "");
    setLaneBadge(els.cAro, af.arousal_badge || (la && la.badge) || "",
      af.arousal_status || (la && la.status) || "");
  }
  // faint instrument grid: horizontal y-gridlines + tick labels, vertical time gridlines + labels
  function drawGrid(x, c, W, top, bot, yTicks, Yfn) {
    x.save();
    x.font = "9px ui-monospace, monospace"; x.lineWidth = 1;
    x.textBaseline = "middle"; x.textAlign = "right";
    yTicks.forEach((tk) => {
      const py = Yfn(tk.v);
      x.strokeStyle = "rgba(255,255,255,.055)";
      x.beginPath(); x.moveTo(PADL, py); x.lineTo(W - PADR, py); x.stroke();
      x.fillStyle = "rgba(124,124,130,.85)"; x.fillText(tk.label, PADL - 6, py);
    });
    x.textAlign = "center"; x.textBaseline = "alphabetic";
    timeTicks().forEach((tt) => {
      const px = xAt(c, tt);
      x.strokeStyle = "rgba(255,255,255,.035)";
      x.beginPath(); x.moveTo(px, top); x.lineTo(px, bot); x.stroke();
      x.fillStyle = "rgba(124,124,130,.7)"; x.fillText(fmt(tt), px, bot + 12);
    });
    x.restore();
  }
  // live NOW / PEAK / mean readout, top-right of a lane
  function drawStats(x, W, cur, s) {
    if (!s) return;
    x.save();
    x.font = "9px ui-monospace, monospace"; x.textAlign = "right"; x.textBaseline = "top";
    x.fillStyle = "rgba(191,224,236,.85)";
    x.fillText("NOW " + cur.toFixed(2) + "   PK " + s.max.toFixed(2) + "   μ " + s.mean.toFixed(2), W - PADR, 2);
    x.restore();
  }

  function drawAttention(t) {
    const c = els.cAtt, x = c.getContext("2d"), W = c.width, H = c.height, top = 14, bot = H - 22;
    const xs = arc.timestamps, ys = arc.activation;
    x.clearRect(0, 0, W, H);
    const Y = (v) => bot - clamp01(v) * (bot - top);
    drawGrid(x, c, W, top, bot, [{ v: 1, label: "1.0" }, { v: 0.5, label: "0.5" }, { v: 0, label: "0" }], Y);
    // weak-spot warning bands
    (arc.weak_spots || []).forEach((w) => {
      x.fillStyle = "rgba(255,122,122,0.09)";
      x.fillRect(xAt(c, w.start), top, xAt(c, w.end) - xAt(c, w.start), bot - top);
    });
    // area fill under the curve
    x.beginPath();
    xs.forEach((tt, i) => { const px = xAt(c, tt), py = Y(ys[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.lineTo(xAt(c, xs[xs.length - 1]), bot); x.lineTo(xAt(c, xs[0]), bot); x.closePath();
    x.fillStyle = "rgba(191,224,236,.06)"; x.fill();
    // demoted arithmetic baseline (present only once a trained-head arc replaced it as the
    // headline) — faint dashed grey so the honest before/after is visible, not hidden.
    if (arc._baseline && arc._baseline.length === xs.length) {
      x.save(); x.setLineDash([5, 4]); x.lineWidth = 1.1; x.strokeStyle = "rgba(124,124,130,.55)";
      x.beginPath();
      xs.forEach((tt, i) => { const px = xAt(c, tt), py = Y(clamp01(arc._baseline[i])); i ? x.lineTo(px, py) : x.moveTo(px, py); });
      x.stroke(); x.restore();
    }
    // ice line
    const grad = x.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#8FB3C0"); grad.addColorStop(0.5, "#EAF6FA"); grad.addColorStop(1, "#8FB3C0");
    x.save();
    x.beginPath(); x.lineWidth = 2.1; x.strokeStyle = grad;
    x.shadowColor = "rgba(191,224,236,.5)"; x.shadowBlur = 9;
    xs.forEach((tt, i) => { const px = xAt(c, tt), py = Y(ys[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    x.restore();
    // peak marker (drops a stem to the highest predicted sample)
    const s = arcStats && arcStats.att;
    if (s) {
      const pkx = xAt(c, xs[s.argmax]), pky = Y(s.max);
      x.strokeStyle = "rgba(191,224,236,.32)"; x.lineWidth = 1;
      x.beginPath(); x.moveTo(pkx, top); x.lineTo(pkx, pky); x.stroke();
      x.fillStyle = "rgba(191,224,236,.9)"; x.beginPath(); x.arc(pkx, pky, 2.3, 0, 7); x.fill();
    }
    // playhead + current-sample dot + live metrics
    playhead(x, c, t, top, bot);
    const cur = clamp01(valAt(ys, t));
    x.fillStyle = "#EAF6FA"; x.beginPath(); x.arc(xAt(c, t), Y(cur), 3, 0, 7); x.fill();
    drawStats(x, W, cur, s);
  }

  function drawSigned(canvas, seq, lo, hi, t, colorCss, mode, statKey) {
    // mode 'center' => baseline mid (valence, range ~[-1,1]); 'bottom' => baseline bottom (arousal, [0,1])
    const c = canvas, x = c.getContext("2d"), W = c.width, H = c.height, top = 14, bot = H - 20;
    x.clearRect(0, 0, W, H);
    if (!seq) { return; }   // no affect track on this clip → leave the lane clean
    const base = mode === "center" ? (top + bot) / 2 : bot;
    const scale = mode === "center" ? (bot - top) / 2 : (bot - top);
    const Y = (v) => base - v * scale;
    const yTicks = mode === "center"
      ? [{ v: 1, label: "+1" }, { v: 0, label: "0" }, { v: -1, label: "−1" }]
      : [{ v: 1, label: "1.0" }, { v: 0.5, label: "0.5" }, { v: 0, label: "0" }];
    drawGrid(x, c, W, top, bot, yTicks, Y);
    // emphasized zero/baseline
    x.strokeStyle = "rgba(255,255,255,.2)"; x.lineWidth = 1;
    x.beginPath(); x.moveTo(PADL, base); x.lineTo(W - PADR, base); x.stroke();
    // uncertainty band
    if (lo && hi) {
      x.beginPath();
      arc.timestamps.forEach((tt, i) => { const px = xAt(c, tt), py = Y(hi[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
      for (let i = arc.timestamps.length - 1; i >= 0; i--) x.lineTo(xAt(c, arc.timestamps[i]), Y(lo[i]));
      x.closePath(); x.fillStyle = colorCss.replace("COLOR", ".13"); x.fill();
    }
    // line
    x.beginPath(); x.lineWidth = 2.1; x.strokeStyle = colorCss.replace("COLOR", "1");
    arc.timestamps.forEach((tt, i) => { const px = xAt(c, tt), py = Y(seq[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    // playhead + current-sample dot + live metrics
    playhead(x, c, t, top, bot);
    const cur = valAt(seq, t);
    x.fillStyle = colorCss.replace("COLOR", "1"); x.beginPath(); x.arc(xAt(c, t), Y(cur), 3, 0, 7); x.fill();
    drawStats(x, W, cur, arcStats && arcStats[statKey]);
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
    if (!brainBuilt) setupBrain();
    const a = clamp01(valAt(arc.activation, t));
    // shell always visible (floor clears the panel bg); the whole mesh brightens uniformly
    brainEls.shell.setAttribute("fill", `rgba(143,179,192,${(0.05 + a * 0.1).toFixed(3)})`);
    brainEls.glow.setAttribute("opacity", (a * 0.35).toFixed(3));
    brainEls.mesh.setAttribute("opacity", (0.12 + a * 0.8).toFixed(3));   // uniform — one global value
    brainEls.mark.setAttribute("y", (176 - a * 120).toFixed(1));          // colorbar marker: 0 bottom → 1 top
    brainEls.mag.textContent = a.toFixed(2);
    const s = arcStats && arcStats.att;
    if (s) brainEls.pk.textContent = "PK " + s.max.toFixed(2);
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
  // rAF gate: pause the playback loop while the console is scrolled off-screen
  // (IntersectionObserver) or the tab is hidden (visibilitychange). loopRunning is a
  // single-frame guard so re-entry (scroll back / regain focus) never starts a 2nd loop.
  let loopRunning = false, consoleOnScreen = true;
  function loopActive() { return consoleOnScreen && !document.hidden; }
  function startLoop() {
    if (loopRunning || !loopActive()) return;   // never double-arm; never run while parked
    loopRunning = true;
    requestAnimationFrame(loop);
  }
  function loop() {
    loopRunning = false;        // this frame is executing; a fresh one is armed only via startLoop()
    if (!loopActive()) return;  // parked off-screen / tab hidden — startLoop() re-arms on re-entry
    // a failed load left an error frame on the canvases — keep the loop alive but don't
    // repaint stale data over it (a later successful pick clears `failed`).
    if (failed) { startLoop(); return; }
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
      drawSigned(els.cVal, af.valence, af.valence_lo, af.valence_hi, t, "rgba(234,244,255,COLOR)", "center", "val");
      drawSigned(els.cAro, af.arousal, af.arousal_lo, af.arousal_hi, t, "rgba(143,179,192,COLOR)", "bottom", "aro");
      drawCoarse(t);
      drawBrain(t);
      const ws = activeWeakSpot(t);
      if (ws) { els.callout.classList.remove("hidden"); els.callout.innerHTML = '<svg class="cico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.2v3.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="11.6" r=".6" fill="currentColor"/></svg><strong>Weak spot at ' + fmt(ws.start) + "</strong> — " + ws.label; }
      else els.callout.classList.add("hidden");
    } catch (e) {
      // defense-in-depth: a draw error must never kill the rAF chain (it re-arms below),
      // so the demo recovers on the next pick instead of freezing. Warn once, not at 60fps.
      if (!loopErrLogged) { loopErrLogged = true; console.warn("Soma loop draw error (suppressed after first):", e); }
    }
    startLoop();   // re-armed (guarded), even after a draw error — parks itself when off-screen/hidden
  }
  // pause the loop when it can't be seen. NOT gated on prefers-reduced-motion: this is the
  // visitor's own playback UI, not decoration. Both signals feed loopActive(); startLoop()
  // is guarded, so a re-entry from either source can never spin up a duplicate loop.
  (function gateLoop() {
    const stage = document.getElementById("console");
    if (stage && "IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        consoleOnScreen = entries.some((en) => en.isIntersecting);
        startLoop();
      }, { threshold: 0 }).observe(stage);
    }
    document.addEventListener("visibilitychange", () => { if (!document.hidden) startLoop(); });
  })();

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
    setSampleWatermark(v);
  }

  // Honesty guard: illustrative/sample cards animate the SAME authoritative NOW/PK/μ overlays
  // as the real run, so mark the stage plainly when one is active (real1 = the only real run).
  function setSampleWatermark(v) {
    const stage = document.getElementById("console");
    if (!stage) return;
    const isSample = /sample/i.test((v && v.src) || "") || (v && v.id) !== "real1";
    let wm = stage.querySelector(".sample-wm");
    if (!isSample) { if (wm) wm.remove(); return; }
    if (!wm) {
      wm = document.createElement("div");
      wm.className = "sample-wm";
      wm.textContent = "◆ ILLUSTRATIVE SAMPLE — synthetic data, not model output";
      wm.style.cssText = "position:absolute;top:10px;left:50%;transform:translateX(-50%);" +
        "z-index:6;pointer-events:none;font:11px/1 ui-monospace,monospace;letter-spacing:.4px;" +
        "color:#ffce6b;background:rgba(20,15,4,.74);border:1px solid rgba(255,203,92,.45);" +
        "padding:5px 11px;border-radius:999px;white-space:nowrap";
      if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
      stage.appendChild(wm);
    }
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
    // one clean deterministic sparkline (no double-echo, no sine wobble → less gimmicky)
    const ys = []; for (let i = 0; i < pts; i++) ys.push(H * 0.46 + (rnd() - 0.5) * H * 0.34);
    x.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, f = u * (pts - 1), k = Math.floor(f), fr = f - k;
      const a = ys[k], b = ys[Math.min(k + 1, pts - 1)];
      const sm = fr * fr * (3 - 2 * fr);
      const y = a + (b - a) * sm;
      const px = 6 + u * (W - 12);
      i ? x.lineTo(px, y) : x.moveTo(px, y);
    }
    x.strokeStyle = "rgba(191,224,236,.55)"; x.lineWidth = 1.5; x.stroke();
  }

  function renderVids() {
    $("vids").innerHTML = VIDEOS.map((v) => `
      <div class="vid" data-id="${escapeHtml(v.id)}" role="button" tabindex="0" aria-pressed="false" aria-label="Analyze ${escapeHtml(v.title)}">
        <div class="vthumb" style="background:${v.grad}">
          <canvas class="vthumb-arc" width="300" height="188" aria-hidden="true"></canvas>
          <div class="play"><svg viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11"/></svg></div>
          <div class="vmeta"><span>${escapeHtml(durLabel(v))}</span></div>
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
      // append live arcs at the END (not unshift-to-front): keeps the featured real-run card in
      // place and never re-orders the sample cards under the visitor, so nothing "jumps" when the
      // async fetch resolves late. New cards land on row 2+.
      VIDEOS.push.apply(VIDEOS, live);
      renderVids();
      if (refreshCompare) refreshCompare();
      markActive(currentId);                // re-render dropped the highlight; restore it
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

  // start — open on the REAL TRIBE run (honesty: never default to a synthetic/illustrative
  // card; a first impression of authoritative overlays on sample data reads as fabricated).
  pickVideo(VIDEOS.find(function (v) { return v.id === "real1"; }) || VIDEOS[0]);
  mergeLiveArcs();   // fold in any live Supabase arcs (async; no-op if unconfigured)
})();
