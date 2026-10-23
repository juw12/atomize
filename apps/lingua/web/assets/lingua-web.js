/* Lingua — desktop web capture (screen-read caption strip -> OCR -> translate).
 *
 * Boots the page, wires the start/stop buttons, lets the user drag a crop
 * rectangle over the captured video, then runs a requestVideoFrameCallback
 * loop that grabs the crop, dedupes via changeHash, OCRs, and translates.
 * The transcript panel floats on top of the page so it can sit over Teams
 * in the user's existing window layout.
 */

import {
  CaptionPipeline,
  Transcript,
  MaasClient,
  LANGUAGES,
  MODELS,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  explainError,
  changeHash,
  drawVideoRegion,
  downscaleCanvas,
  speakerRows,
} from "./lingua-core.js";

// ----------------------------------------------------------------- settings UI

const $ = (id) => document.getElementById(id);
const els = {
  startBtn: $("startBtn"),
  stopBtn: $("stopBtn"),
  clearBtn: $("clearBtn"),
  hideBtn: $("hideBtn"),
  themeToggle: $("themeToggle"),
  sourceLang: $("sourceLang"),
  targetLang: $("targetLang"),
  llmModel: $("llmModel"),
  ocrModel: $("ocrModel"),
  pollMs: $("pollMs"),
  pollMsVal: $("pollMsVal"),
  opacity: $("opacity"),
  opacityVal: $("opacityVal"),
  gatewayOcrBase: $("gatewayOcrBase"),
  gatewayLlmBase: $("gatewayLlmBase"),
  apiKey: $("apiKey"),
  video: $("video"),
  stage: $("stage"),
  crop: $("crop"),
  placeholder: $("placeholder"),
  status: $("status"),
  overlay: $("overlay"),
  overlayBody: $("overlayBody"),
  overlayBadge: $("overlayBadge"),
  overlayClear: $("overlayClear"),
  overlayHide: $("overlayHide"),
};

let settings = loadSettings();

function populateLanguages(select, includeAuto) {
  select.innerHTML = "";
  for (const label of Object.keys(LANGUAGES)) {
    if (!includeAuto && label === "Auto (detect)") continue;
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    select.appendChild(opt);
  }
}
function populateModels(select, list) {
  select.innerHTML = "";
  for (const m of list) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  }
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.classList.add("theme-light");
    els.themeToggle.textContent = "Dark";
  } else {
    document.documentElement.classList.remove("theme-light");
    els.themeToggle.textContent = "Light";
  }
}

function applySettingsToUI() {
  populateLanguages(els.sourceLang, true);
  populateLanguages(els.targetLang, false);
  populateModels(els.llmModel, MODELS);
  populateModels(els.ocrModel, [settings.ocrModel || DEFAULT_SETTINGS.ocrModel]);

  els.sourceLang.value = settings.sourceLang;
  els.targetLang.value = settings.targetLang;
  els.llmModel.value = settings.llmModel;
  els.ocrModel.value = settings.ocrModel || DEFAULT_SETTINGS.ocrModel;
  els.pollMs.value = settings.pollMs;
  els.pollMsVal.textContent = String(settings.pollMs);
  els.opacity.value = Math.round((settings.opacity || 0.92) * 100);
  els.opacityVal.textContent = els.opacity.value;
  applyOpacity(settings.opacity || 0.92);
  els.gatewayOcrBase.value = settings.gatewayOcrBase;
  els.gatewayLlmBase.value = settings.gatewayLlmBase;
  els.apiKey.value = settings.apiKey;
  applyTheme(settings.theme);
  updateBadge();
}

function applyOpacity(o) {
  const alpha = Math.max(0.55, Math.min(1, o));
  els.overlay.style.background = `color-mix(in srgb, var(--card) ${Math.round(alpha * 100)}%, transparent)`;
}

function bindSettings() {
  function commit() {
    settings.sourceLang = els.sourceLang.value;
    settings.targetLang = els.targetLang.value;
    settings.llmModel = els.llmModel.value;
    settings.ocrModel = els.ocrModel.value;
    settings.pollMs = Number(els.pollMs.value);
    settings.opacity = Number(els.opacity.value) / 100;
    settings.gatewayOcrBase = els.gatewayOcrBase.value.trim() || DEFAULT_SETTINGS.gatewayOcrBase;
    settings.gatewayLlmBase = els.gatewayLlmBase.value.trim() || DEFAULT_SETTINGS.gatewayLlmBase;
    settings.apiKey = els.apiKey.value.trim();
    saveSettings(settings);
    updateBadge();
  }

  for (const el of [els.sourceLang, els.targetLang, els.llmModel, els.ocrModel]) {
    el.addEventListener("change", commit);
  }
  els.pollMs.addEventListener("input", () => {
    els.pollMsVal.textContent = String(els.pollMs.value);
    commit();
  });
  els.opacity.addEventListener("input", () => {
    els.opacityVal.textContent = els.opacity.value;
    applyOpacity(Number(els.opacity.value) / 100);
    commit();
  });
  els.gatewayOcrBase.addEventListener("change", commit);
  els.gatewayLlmBase.addEventListener("change", commit);
  els.apiKey.addEventListener("change", commit);
  els.themeToggle.addEventListener("click", () => {
    settings.theme = settings.theme === "light" ? "dark" : "light";
    applyTheme(settings.theme);
    saveSettings(settings);
  });
}

function updateBadge() {
  const src = (settings.sourceLang || "Auto").split(" ")[0].slice(0, 2).toUpperCase();
  const tgt = (settings.targetLang || "").split(" ")[0].slice(0, 2).toUpperCase();
  els.overlayBadge.textContent = `${src} → ${tgt}`;
}

// ----------------------------------------------------------------- status

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.classList.remove("ok", "warn", "err");
  if (kind) els.status.classList.add(kind);
}

// ----------------------------------------------------------------- transcript render

const transcript = new Transcript();
let pipeline = null;

function getSourceHint() {
  const label = settings.sourceLang;
  return LANGUAGES[label] === undefined ? LANGUAGES[label] : LANGUAGES[label];
}

function rebuildPipeline() {
  const client = new MaasClient(settings);
  pipeline = new CaptionPipeline((text) => client.translate(text, settings.targetLang, getSourceHint()));
  transcript.reset();
}

function renderTranscript(transcriptLines, rows) {
  const body = els.overlayBody;
  const wasAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 24;
  body.innerHTML = "";
  if (!rows || rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Lingua: waiting for captions…";
    body.appendChild(empty);
  } else {
    const liveFlags = computeLiveFlags(transcriptLines, rows);
    for (let r = 0; r < rows.length; r++) {
      const [speaker, translation] = rows[r];
      const isLive = liveFlags[r];
      if (speaker) {
        const sp = document.createElement("div");
        sp.className = "row speaker";
        sp.textContent = speaker;
        body.appendChild(sp);
      }
      const tr = document.createElement("div");
      tr.className = "row text" + (isLive ? " live" : "");
      tr.textContent = translation;
      body.appendChild(tr);
    }
  }
  if (wasAtBottom) body.scrollTop = body.scrollHeight;
}

function computeLiveFlags(transcriptLines, rows) {
  const flags = new Array(rows.length).fill(false);
  if (!transcriptLines || transcriptLines.length === 0) return flags;
  let liveIdx = -1;
  for (let i = transcriptLines.length - 1; i >= 0; i--) {
    if (transcriptLines[i] && transcriptLines[i].live) { liveIdx = i; break; }
  }
  if (liveIdx < 0) return flags;
  let rowIdx = 0;
  for (let i = 0; i < transcriptLines.length; i++) {
    const collapsed =
      i + 1 < transcriptLines.length &&
      transcriptLines[i].original &&
      transcriptLines[i + 1].speaker === transcriptLines[i].original;
    if (!collapsed) {
      if (i === liveIdx && rowIdx < flags.length) flags[rowIdx] = true;
      rowIdx++;
    }
  }
  return flags;
}

function renderEmpty() {
  const body = els.overlayBody;
  body.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "Lingua: waiting for captions…";
  body.appendChild(empty);
}

rebuildPipeline();
renderEmpty();

// ----------------------------------------------------------------- region picker

let stream = null;
let track = null;
let region = null;
let dragging = null;

function showVideo() {
  els.video.hidden = false;
  els.placeholder.hidden = true;
  els.stage.classList.add("ready");
}

function clearCrop() {
  region = null;
  els.crop.hidden = true;
  els.crop.style.left = "0";
  els.crop.style.top = "0";
  els.crop.style.width = "0";
  els.crop.style.height = "0";
}

// Stage-pixel rect of where the video is actually drawn (object-fit: contain).
// Falls back to the full stage when video dimensions are not yet known.
function getVideoContentRect() {
  const stageW = els.stage.clientWidth;
  const stageH = els.stage.clientHeight;
  const vw = els.video.videoWidth;
  const vh = els.video.videoHeight;
  if (!vw || !vh || !stageW || !stageH) return { x: 0, y: 0, w: stageW, h: stageH };
  const videoAR = vw / vh;
  const stageAR = stageW / stageH;
  if (videoAR > stageAR) {
    const w = stageW;
    const h = stageW / videoAR;
    return { x: 0, y: (stageH - h) / 2, w, h };
  }
  const h = stageH;
  const w = stageH * videoAR;
  return { x: (stageW - w) / 2, y: 0, w, h };
}

function relPoint(evt) {
  const stageRect = els.stage.getBoundingClientRect();
  const mx = evt.clientX - stageRect.left;
  const my = evt.clientY - stageRect.top;
  const contentRect = getVideoContentRect();
  const fx = Math.max(0, Math.min(1, (mx - contentRect.x) / contentRect.w));
  const fy = Math.max(0, Math.min(1, (my - contentRect.y) / contentRect.h));
  return { fx, fy, contentRect, stageW: stageRect.width, stageH: stageRect.height };
}

function applyCropVisual(r, contentRect, stageW, stageH) {
  els.crop.hidden = false;
  const leftPx = contentRect.x + r.x * contentRect.w;
  const topPx = contentRect.y + r.y * contentRect.h;
  const widthPx = r.w * contentRect.w;
  const heightPx = r.h * contentRect.h;
  els.crop.style.left = (100 * leftPx / stageW).toFixed(3) + "%";
  els.crop.style.top = (100 * topPx / stageH).toFixed(3) + "%";
  els.crop.style.width = (100 * widthPx / stageW).toFixed(3) + "%";
  els.crop.style.height = (100 * heightPx / stageH).toFixed(3) + "%";
}

function attachDragHandlers() {
  els.stage.addEventListener("mousedown", (evt) => {
    if (evt.button !== 0) return;
    if (!stream) return;
    const p = relPoint(evt);
    dragging = {
      startFX: p.fx,
      startFY: p.fy,
      contentRect: p.contentRect,
      stageW: p.stageW,
      stageH: p.stageH,
    };
    els.stage.classList.add("dragging");
    region = { x: p.fx, y: p.fy, w: 0, h: 0 };
    applyCropVisual(region, p.contentRect, p.stageW, p.stageH);
    evt.preventDefault();
  });
  window.addEventListener("mousemove", (evt) => {
    if (!dragging) return;
    const p = relPoint(evt);
    const fx0 = Math.min(dragging.startFX, p.fx);
    const fy0 = Math.min(dragging.startFY, p.fy);
    const fx1 = Math.max(dragging.startFX, p.fx);
    const fy1 = Math.max(dragging.startFY, p.fy);
    region = { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 };
    applyCropVisual(region, p.contentRect, p.stageW, p.stageH);
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = null;
    els.stage.classList.remove("dragging");
    if (!region || region.w < 0.02 || region.h < 0.02) {
      clearCrop();
      setStatus("Drag a rectangle over the caption strip to begin.", "warn");
      return;
    }
    setStatus(`Lingua: listening — crop ${(region.w * 100).toFixed(0)}% × ${(region.h * 100).toFixed(0)}% of the frame.`, "ok");
    startLoop();
  });
}

// ----------------------------------------------------------------- capture

async function startCapture() {
  setStatus("Lingua: requesting screen capture…", "warn");
  els.startBtn.disabled = true;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 5 } },
      audio: false,
    });
  } catch (err) {
    els.startBtn.disabled = false;
    if (err && (err.name === "NotAllowedError" || err.message?.includes("Permission denied"))) {
      setStatus("Screen capture was cancelled. Click Start capture again when ready.", "warn");
    } else {
      setStatus(`Capture failed: ${explainError(err)}`, "err");
    }
    return;
  }

  track = stream.getVideoTracks()[0];
  if (!track) {
    setStatus("No video track in the captured stream.", "err");
    cleanup();
    return;
  }
  track.addEventListener("ended", () => {
    setStatus("Screen share ended.", "warn");
    cleanup();
  });

  clearCrop();
  lastHash = null;

  els.video.srcObject = stream;
  try { await els.video.play(); } catch (_) { /* autoplay can be skipped */ }
  showVideo();
  els.stopBtn.disabled = false;
  setStatus("Drag a rectangle over the caption strip, then captions will appear here.", "ok");
}

function cleanup() {
  if (stream) {
    for (const t of stream.getTracks()) t.stop();
  }
  stream = null;
  track = null;
  stopLoop();
  els.video.srcObject = null;
  els.video.hidden = true;
  els.placeholder.hidden = false;
  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;
  clearCrop();
  renderEmpty();
  setStatus("Lingua: idle. Press Start capture to begin.", null);
}

function stopCapture() {
  cleanup();
}

// ----------------------------------------------------------------- capture loop

let lastHash = null;
let processing = false;
let rafHandle = null;
let rvfcHandle = null;
let loopMode = null;
let lastPollAt = 0;

function stopLoop() {
  if (loopMode === "rvfc" && rvfcHandle != null && typeof els.video.cancelVideoFrameCallback === "function") {
    els.video.cancelVideoFrameCallback(rvfcHandle);
  } else if (loopMode === "raf" && rafHandle != null) {
    cancelAnimationFrame(rafHandle);
  }
  loopMode = null;
  rvfcHandle = null;
  rafHandle = null;
  lastHash = null;
  processing = false;
}

async function processFrame() {
  if (!stream || !region) return;
  if (processing) return;
  const canvas = drawVideoRegion(els.video, region);
  if (!canvas) return;
  const hash = changeHash(canvas);
  if (hash && hash === lastHash) return; // dedupe
  lastHash = hash;
  if (!settings.apiKey) {
    setStatus("No API key set. Open Settings and paste your MaaS API key.", "err");
    return;
  }
  processing = true;
  try {
    const downscaled = downscaleCanvas(canvas, 640) || canvas;
    const client = new MaasClient(settings);
    const t0 = performance.now();
    const text = await client.ocr(downscaled);
    const ocrMs = Math.round(performance.now() - t0);
    if (!text || !text.trim()) {
      setStatus(`Lingua: listening — OCR ${ocrMs}ms (no text).`, "ok");
      return;
    }
    const t1 = performance.now();
    const lines = pipeline.update(text);
    const transcriptLines = transcript.add(lines);
    const rows = speakerRows(transcriptLines);
    renderTranscript(transcriptLines, rows);
    const trMs = Math.round(performance.now() - t1);
    setStatus(`Lingua: listening — OCR ${ocrMs}ms · translate ${trMs}ms · ${transcriptLines.length} line(s).`, "ok");
  } catch (err) {
    setStatus(`Lingua error: ${explainError(err)}`, "err");
  } finally {
    processing = false;
  }
}

function startLoop() {
  if (!region) return;
  stopLoop();
  lastPollAt = 0;
  const pollMs = Math.max(50, Number(settings.pollMs) || 200);
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    loopMode = "rvfc";
    const rvfc = (now, metadata) => {
      rvfcHandle = els.video.requestVideoFrameCallback(rvfc);
      if (!region || !stream) return;
      if (now - lastPollAt < pollMs) return;
      lastPollAt = now;
      void processFrame();
    };
    rvfcHandle = els.video.requestVideoFrameCallback(rvfc);
  } else {
    loopMode = "raf";
    const tick = (now) => {
      rafHandle = requestAnimationFrame(tick);
      if (!region || !stream) return;
      if (now - lastPollAt < pollMs) return;
      lastPollAt = now;
      void processFrame();
    };
    rafHandle = requestAnimationFrame(tick);
  }
}

// ----------------------------------------------------------------- buttons

els.startBtn.addEventListener("click", startCapture);
els.stopBtn.addEventListener("click", stopCapture);
els.clearBtn.addEventListener("click", () => {
  if (pipeline) pipeline.reset();
  transcript.reset();
  renderEmpty();
});
els.hideBtn.addEventListener("click", () => {
  els.overlay.classList.toggle("hidden");
});
els.overlayHide.addEventListener("click", () => els.overlay.classList.add("hidden"));
els.overlayClear.addEventListener("click", () => {
  if (pipeline) pipeline.reset();
  transcript.reset();
  renderEmpty();
});

// ----------------------------------------------------------------- boot

applySettingsToUI();
bindSettings();
attachDragHandlers();

// Surface a friendly "no getDisplayMedia" message if the API isn't there.
if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
  setStatus("This browser does not support screen capture (navigator.mediaDevices.getDisplayMedia). Use Chrome, Edge, or Firefox 66+.", "err");
  els.startBtn.disabled = true;
}
