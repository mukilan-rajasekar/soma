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
    { lvl: "Rung 0", live: true,  text: "<b>Attention arc</b> — relative moment-to-moment salience. Pre-registered vs TVSum with a circular-shift null — <b>test not yet run</b> (may return null)." },
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
    videoFile: $("videoFile"), uploadEmail: $("uploadEmail"),
    uploadStatus: $("uploadStatus"), fileLabel: $("fileLabel"),
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
  // A video item carries EITHER `arc` (a URL to a static sample json) OR
  // `arcData` (an arc object already in memory — e.g. fetched live from Supabase).
  function loadArc(item) {
    if (item && item.arcData) return Promise.resolve(item.arcData);
    return fetch(item.arc).then((r) => { if (!r.ok) throw new Error("arc " + r.status); return r.json(); });
  }
  function load(item) {
    const label = (item && (item.title || item.id || item.arc)) || "arc";
    loadArc(item)
      .then((data) => { arc = data; init(); })
      .catch((e) => bail(label, e));
  }
  function bail(label, e) {
    [els.cAtt, els.cVal, els.cAro].forEach((c) => {
      const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = "#ff6b6b"; x.font = "13px monospace";
      x.fillText("Could not load " + label + " — " + e.message, 14, 26);
    });
  }

  function init() {
    duration = arc.duration_sec || (arc.timestamps[arc.timestamps.length - 1] || 0);
    // attention badge — data-driven like the affect badges below. DEFAULT honest state
    // is "validation pending": no GPU run / results.json exists yet, so nothing is
    // validated. Only upgrade to "validated vs TVSum" when the arc carries a real
    // permutation-tested result (arc.attention.status === "permutation-tested").
    const attSt = (arc.attention && arc.attention.status) || "pending";
    const attBadge = attSt === "permutation-tested" ? ["badge a", "validated vs TVSum"]
      : attSt === "testing" ? ["badge a", "pre-registered · test running"]
      : ["badge r", "validation pending · not yet run"];
    els.badgeAtt.className = attBadge[0];
    els.badgeAtt.textContent = attBadge[1];
    // affect badges reflect status
    const st = (arc.affect && arc.affect.status) || "illustrative";
    const affectBadge = st === "permutation-tested" ? ["badge a", "proxy tracks · perm-tested"]
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
  let refreshCompare = null;   // set by initCompare(); called after live arcs merge

  function pickVideo(v) {
    if (!v) return;
    document.querySelectorAll(".vid").forEach((el) => el.classList.toggle("active", el.dataset.id === v.id));
    seek(0); setPlaying(false); load(v);
  }

  function durLabel(v) {
    const d = v.arcData && v.arcData.duration_sec;
    if (typeof d === "number" && d > 0) { const s = Math.round(d); return s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : s + "s"; }
    return "30s";
  }

  function renderVids() {
    $("vids").innerHTML = VIDEOS.map((v) => `
      <div class="vid" data-id="${escapeHtml(v.id)}">
        <div class="vthumb" style="background:${v.grad}">
          <div class="play"><svg viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11"/></svg></div>
          <div class="vmeta"><span>${escapeHtml(v.src)}</span><span>${escapeHtml(durLabel(v))}</span></div>
        </div>
        <div class="vtitle">${escapeHtml(v.title)}<span>${escapeHtml(v.src)}</span></div>
      </div>`).join("");
    document.querySelectorAll(".vid").forEach((el) =>
      el.addEventListener("click", () => pickVideo(VIDEOS.find((v) => v.id === el.dataset.id))));
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
        if (!id || have.has(id) || !r.arc) return;   // never shadow a sample id
        have.add(id);
        const tag = r.meta && (r.meta.dataset || r.meta.source);
        live.push({ id: id, title: r.title || id, src: "live · " + (tag || "Supabase"),
          arcData: r.arc, grad: gradFor(id) });
      });
      if (!live.length) return;
      VIDEOS.unshift.apply(VIDEOS, live);   // newest-first from the API → lead the picker
      renderVids();
      if (refreshCompare) refreshCompare();
      pickVideo(VIDEOS[0]);                 // surface the newest live arc
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
    const cache = {};
    const itemById = (id) => VIDEOS.find((v) => v.id === id);
    // key by id, resolve via loadArc() so inline (Supabase) arcs work like URL ones
    const getArc = (id) => {
      const it = itemById(id);
      if (!it) return Promise.reject(new Error("no item " + id));
      return cache[id] || (cache[id] = loadArc(it));
    };
    const titleFor = (id) => (itemById(id) || {}).title || "—";
    function fillOpts() {
      const prevA = selA.value, prevB = selB.value;
      const opts = VIDEOS.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.title)}</option>`).join("");
      selA.innerHTML = opts; selB.innerHTML = opts;
      if (VIDEOS.some((v) => v.id === prevA)) selA.value = prevA; else selA.selectedIndex = 0;
      if (VIDEOS.some((v) => v.id === prevB)) selB.value = prevB; else selB.selectedIndex = Math.min(1, VIDEOS.length - 1);
    }
    const COL_A = "#EAF9FF", COL_B = "#7FD4FF", N = 120;
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
    fillOpts();
    render();
    refreshCompare = function () { fillOpts(); render(); };
  })();

  // start
  pickVideo(VIDEOS[0]);
  mergeLiveArcs();   // fold in any live Supabase arcs (async; no-op if unconfigured)
})();
