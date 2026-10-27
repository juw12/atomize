/* Lingua — Read picture page (laptop browser, iPhone, Android).
 *
 * Take a photo, upload one or many pictures, paste (Ctrl+V) or drop them.
 * Crop / rotate, then read: the words and letters come back with a count, a
 * translation tab (16 languages, model fallback), read-aloud, copy / share /
 * save, and a searchable on-device history. OCR + translate go through
 * lingua-core.js (readPicture, a port of engine/image_text.py).
 */

import {
  DEFAULT_SETTINGS,
  detectLaptopRelay,
  explainError,
  guessSpeechLang,
  LANGUAGES,
  loadSettings,
  MaasClient,
  MODELS,
  readPicture,
  saveSettings,
  SPEECH_LANGS,
  textStats,
} from "./lingua-core.js";

const $ = (id) => document.getElementById(id);
const els = {};
for (const id of [
  "stage", "emptyState", "editor", "cameraInput", "cameraLabel", "fileInput", "pasteBtn",
  "rotateLeftBtn", "rotateRightBtn", "cropBtn", "resetBtn", "clearBtn", "canvasWrap", "canvas",
  "cropBox", "scanning", "queue", "readBtn", "readLabel", "readAllBtn",
  "tabText", "tabTrans", "targetQuick", "translateBtn", "banner", "paneText", "paneTrans",
  "resultText", "translationText", "statWords", "statLetters", "statLines", "statTime",
  "copyBtn", "speakBtn", "speakLabel", "shareBtn", "downloadBtn", "status",
  "historyBtn", "historyCount", "historyDrawer", "historySearch", "historyList", "keepHistory",
  "clearHistoryBtn", "settingsBtn", "settingsDrawer", "scrim", "toasts", "themeToggle",
  "sourceLang", "targetLang", "autoTranslate", "llmModel", "ocrModel", "gatewayFields",
  "gatewayOcrBase", "gatewayLlmBase", "apiKey", "relayHint",
]) {
  els[id] = $(id);
}

const HISTORY_KEY = "lingua.history.v1";
const PREFS_KEY = "lingua.picture.prefs.v1";
const HISTORY_MAX = 40;
const WORK_MAX_SIDE = 2400; // keep phone photos manageable in memory

let settings = loadSettings();
let relay = null;
let models = MODELS.slice();
const prefs = Object.assign({ autoTranslate: false, keepHistory: true }, readJSON(PREFS_KEY, {}));
const effectiveSettings = () => (relay ? Object.assign({}, settings, relay) : settings);

const state = {
  queue: [],          // [{ file, name, thumb, done, result }]
  index: -1,
  original: null,     // canvas, upright, as loaded
  work: null,         // canvas after rotation
  crop: null,         // {x, y, w, h} in work-canvas pixels
  cropping: false,
  busy: false,
  tab: "text",
  lastTiming: "",
};

// ================================================================== helpers

const isNarrow = () => window.matchMedia && window.matchMedia("(max-width: 900px)").matches;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false; // quota or private mode
  }
}

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.classList.remove("ok", "warn", "err");
  if (kind) els.status.classList.add(kind);
}

function toast(text) {
  const node = document.createElement("div");
  node.className = "lp-toast";
  node.textContent = text;
  els.toasts.appendChild(node);
  setTimeout(() => node.remove(), 2200);
}

function banner(text, kind) {
  if (!text) {
    els.banner.hidden = true;
    return;
  }
  els.banner.hidden = false;
  els.banner.textContent = text;
  els.banner.classList.toggle("err", kind === "err");
}

function fillSelect(select, values, skipAuto) {
  select.innerHTML = "";
  for (const value of values) {
    if (skipAuto && value === "Auto (detect)") continue;
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
}

function canvasFrom(source, width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  c.getContext("2d").drawImage(source, 0, 0, width, height);
  return c;
}

function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not encode picture"))), type, quality);
  });
}

function thumbnail(canvas, side = 160) {
  const scale = side / Math.max(canvas.width, canvas.height);
  const t = canvasFrom(canvas, Math.max(1, Math.round(canvas.width * scale)), Math.max(1, Math.round(canvas.height * scale)));
  return t.toDataURL("image/jpeg", 0.6);
}

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (_) {
      // fall back to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ================================================================== settings

function applyTheme(theme) {
  document.documentElement.classList.toggle("theme-light", theme === "light");
  if (els.themeToggle) els.themeToggle.textContent = theme === "light" ? "Dark" : "Light";
}

function applySettingsToUI() {
  fillSelect(els.sourceLang, Object.keys(LANGUAGES), false);
  fillSelect(els.targetLang, Object.keys(LANGUAGES), true);
  fillSelect(els.targetQuick, Object.keys(LANGUAGES), true);
  fillSelect(els.llmModel, models, false);
  fillSelect(els.ocrModel, [settings.ocrModel || DEFAULT_SETTINGS.ocrModel], false);
  if (!LANGUAGES[settings.targetLang]) settings.targetLang = DEFAULT_SETTINGS.targetLang;
  els.sourceLang.value = settings.sourceLang;
  els.targetLang.value = settings.targetLang;
  els.targetQuick.value = settings.targetLang;
  els.llmModel.value = models.includes(settings.llmModel) ? settings.llmModel : models[0];
  els.ocrModel.value = settings.ocrModel || DEFAULT_SETTINGS.ocrModel;
  els.gatewayOcrBase.value = settings.gatewayOcrBase;
  els.gatewayLlmBase.value = settings.gatewayLlmBase;
  els.apiKey.value = settings.apiKey;
  els.autoTranslate.checked = !!prefs.autoTranslate;
  els.keepHistory.checked = prefs.keepHistory !== false;
  applyTheme(settings.theme);
}

function commitSettings() {
  settings.sourceLang = els.sourceLang.value;
  settings.targetLang = els.targetLang.value;
  settings.llmModel = els.llmModel.value;
  settings.ocrModel = els.ocrModel.value;
  settings.gatewayOcrBase = els.gatewayOcrBase.value.trim() || DEFAULT_SETTINGS.gatewayOcrBase;
  settings.gatewayLlmBase = els.gatewayLlmBase.value.trim() || DEFAULT_SETTINGS.gatewayLlmBase;
  settings.apiKey = els.apiKey.value.trim();
  els.targetQuick.value = settings.targetLang;
  prefs.autoTranslate = els.autoTranslate.checked;
  prefs.keepHistory = els.keepHistory.checked;
  saveSettings(settings);
  writeJSON(PREFS_KEY, prefs);
}

// ================================================================== picture loading

async function addFiles(fileList, label) {
  const files = Array.from(fileList || []).filter((f) => f && (f.type || "").startsWith("image/"));
  if (!files.length) {
    setStatus("That is not a picture. Use PNG, JPEG, HEIC/WebP or a screenshot.", "warn");
    return;
  }
  const start = state.queue.length;
  for (const file of files) {
    state.queue.push({ file, name: file.name || label || "picture", thumb: URL.createObjectURL(file), done: false, result: null });
  }
  renderQueue();
  await selectPicture(start);
  if (files.length > 1) toast(`${files.length} pictures added — press Read all`);
  else if (state.queue.length === 1 || label) readCurrent();
}

async function selectPicture(index) {
  const item = state.queue[index];
  if (!item) return;
  state.index = index;
  try {
    const bitmap = await decode(item.file);
    const w = bitmap.width || bitmap.naturalWidth;
    const h = bitmap.height || bitmap.naturalHeight;
    const scale = Math.min(1, WORK_MAX_SIDE / Math.max(w, h));
    state.original = canvasFrom(bitmap, Math.round(w * scale), Math.round(h * scale));
    if (typeof bitmap.close === "function") bitmap.close();
  } catch (err) {
    setStatus("This file could not be opened as a picture.", "err");
    return;
  }
  state.work = canvasFrom(state.original, state.original.width, state.original.height);
  state.crop = null;
  setCropping(false);
  els.emptyState.hidden = true;
  els.editor.hidden = false;
  drawWork();
  renderQueue();
  if (isNarrow()) els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  if (item.result) showResult(item.result, false);
  setStatus(`${item.name} · ${state.original.width}×${state.original.height} px`, null);
}

function drawWork() {
  const c = els.canvas;
  c.width = state.work.width;
  c.height = state.work.height;
  c.getContext("2d").drawImage(state.work, 0, 0);
  drawCropBox();
}

function renderQueue() {
  const many = state.queue.length > 1;
  els.queue.hidden = !many;
  els.readAllBtn.hidden = !many;
  els.queue.innerHTML = "";
  state.queue.forEach((item, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = item.name;
    b.className = (i === state.index ? "active " : "") + (item.done ? "done" : "");
    const img = document.createElement("img");
    img.src = item.thumb;
    img.alt = item.name;
    b.appendChild(img);
    b.addEventListener("click", () => selectPicture(i));
    els.queue.appendChild(b);
  });
}

function clearPictures() {
  for (const item of state.queue) URL.revokeObjectURL(item.thumb);
  state.queue = [];
  state.index = -1;
  state.original = state.work = null;
  state.crop = null;
  setCropping(false);
  els.editor.hidden = true;
  els.emptyState.hidden = false;
  els.cameraInput.value = "";
  els.fileInput.value = "";
  setStatus("Lingua: pick a picture to read.", null);
}

// ================================================================== rotate / crop

function rotate(direction) {
  if (!state.work) return;
  const src = state.work;
  const out = document.createElement("canvas");
  out.width = src.height;
  out.height = src.width;
  const ctx = out.getContext("2d");
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((direction * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  state.work = out;
  state.crop = null;
  drawWork();
}

function resetEdits() {
  if (!state.original) return;
  state.work = canvasFrom(state.original, state.original.width, state.original.height);
  state.crop = null;
  setCropping(false);
  drawWork();
}

function setCropping(on) {
  state.cropping = on;
  els.cropBtn.setAttribute("aria-pressed", on ? "true" : "false");
  els.canvasWrap.classList.toggle("cropping", on);
  if (on) setStatus("Drag a box over the text you want to read.", null);
}

function canvasScale() {
  const rect = els.canvas.getBoundingClientRect();
  return { rect, sx: rect.width / els.canvas.width, sy: rect.height / els.canvas.height };
}

function drawCropBox() {
  const box = els.cropBox;
  if (!state.crop || !state.work) {
    box.hidden = true;
    return;
  }
  const { rect, sx, sy } = canvasScale();
  const wrap = els.canvasWrap.getBoundingClientRect();
  box.hidden = false;
  box.style.left = `${rect.left - wrap.left + state.crop.x * sx}px`;
  box.style.top = `${rect.top - wrap.top + state.crop.y * sy}px`;
  box.style.width = `${state.crop.w * sx}px`;
  box.style.height = `${state.crop.h * sy}px`;
}

let dragStart = null;
function toCanvasPoint(event) {
  const { rect, sx, sy } = canvasScale();
  const x = Math.min(Math.max((event.clientX - rect.left) / sx, 0), els.canvas.width);
  const y = Math.min(Math.max((event.clientY - rect.top) / sy, 0), els.canvas.height);
  return { x, y };
}
els.canvasWrap.addEventListener("pointerdown", (event) => {
  if (!state.cropping || !state.work) return;
  els.canvasWrap.setPointerCapture(event.pointerId);
  dragStart = toCanvasPoint(event);
  state.crop = { x: dragStart.x, y: dragStart.y, w: 0, h: 0 };
  drawCropBox();
});
els.canvasWrap.addEventListener("pointermove", (event) => {
  if (!dragStart) return;
  const p = toCanvasPoint(event);
  state.crop = {
    x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y),
    w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y),
  };
  drawCropBox();
});
els.canvasWrap.addEventListener("pointerup", () => {
  if (!dragStart) return;
  dragStart = null;
  if (!state.crop || state.crop.w < 12 || state.crop.h < 12) {
    state.crop = null;
    drawCropBox();
    return;
  }
  setCropping(false);
  setStatus("Crop set. Press Read picture (Reset to undo).", "ok");
});
window.addEventListener("resize", drawCropBox);

async function currentBlob() {
  if (!state.work) return null;
  if (!state.crop) return canvasToBlob(state.work);
  const { x, y, w, h } = state.crop;
  const region = document.createElement("canvas");
  region.width = Math.round(w);
  region.height = Math.round(h);
  region.getContext("2d").drawImage(state.work, x, y, w, h, 0, 0, region.width, region.height);
  return canvasToBlob(region);
}

// ================================================================== read / translate

function client() {
  return new MaasClient(effectiveSettings());
}

function setBusy(on, label) {
  state.busy = on;
  els.readBtn.classList.toggle("lp-busy", on);
  els.readBtn.disabled = on;
  els.readAllBtn.disabled = on;
  els.translateBtn.disabled = on;
  els.scanning.hidden = !on;
  els.readLabel.textContent = on ? (label || "Reading…") : "Read picture";
}

function needKey() {
  if (effectiveSettings().apiKey) return false;
  setStatus("No API key yet: open Settings (gear) and paste it, or scan the QR code from Lingua on your laptop.", "err");
  openDrawer(els.settingsDrawer);
  return true;
}

async function readCurrent() {
  if (state.busy || state.index < 0) return;
  if (needKey()) return;
  const item = state.queue[state.index];
  setBusy(true);
  banner(null);
  setStatus(prefs.autoTranslate ? "Reading and translating…" : "Reading picture…", "warn");
  try {
    const blob = await currentBlob();
    const result = await readPicture(client(), blob, {
      targetLang: prefs.autoTranslate ? LANGUAGES[settings.targetLang] : null,
      sourceLang: LANGUAGES[settings.sourceLang] || null,
      models,
    });
    item.done = true;
    item.result = result;
    renderQueue();
    showResult(result, true);
    saveToHistory(result, state.crop ? cropThumb() : thumbnail(state.work));
    if (result.text) {
      setStatus(`Done · ${result.stats.words} words found.`, "ok");
      if (isNarrow()) document.querySelector(".lp-result").scrollIntoView({ behavior: "smooth", block: "start" });
      if (navigator.vibrate) navigator.vibrate(20);
    } else {
      setStatus("No words or letters found. Try cropping closer or a sharper photo.", "warn");
    }
  } catch (err) {
    setStatus(`Could not read picture: ${explainError(err)}`, "err");
  } finally {
    setBusy(false);
  }
}

function cropThumb() {
  const { x, y, w, h } = state.crop;
  const region = document.createElement("canvas");
  region.width = Math.max(1, Math.round(w));
  region.height = Math.max(1, Math.round(h));
  region.getContext("2d").drawImage(state.work, x, y, w, h, 0, 0, region.width, region.height);
  return thumbnail(region);
}

async function readAll() {
  if (state.busy || !state.queue.length) return;
  if (needKey()) return;
  const parts = [];
  for (let i = 0; i < state.queue.length; i++) {
    await selectPicture(i);
    setBusy(true, `Reading ${i + 1} of ${state.queue.length}…`);
    try {
      const result = await readPicture(client(), await currentBlob(), {
        sourceLang: LANGUAGES[settings.sourceLang] || null,
      });
      state.queue[i].done = true;
      state.queue[i].result = result;
      parts.push(`— ${state.queue[i].name} —\n${result.text || "(no text found)"}`);
      saveToHistory(result, thumbnail(state.work));
    } catch (err) {
      parts.push(`— ${state.queue[i].name} —\n(error: ${explainError(err)})`);
    } finally {
      setBusy(false);
    }
    renderQueue();
  }
  const combined = { text: parts.join("\n\n"), translation: null, stats: null, ocrSeconds: 0 };
  combined.stats = textStats(combined.text);
  showResult(combined, true);
  setStatus(`Read ${state.queue.length} pictures.`, "ok");
  toast("Batch finished");
}

async function translateNow() {
  const text = els.resultText.value.trim();
  if (!text) {
    toast("Nothing to translate yet");
    return;
  }
  if (needKey()) return;
  setBusy(true, "Translating…");
  banner(null);
  try {
    const started = performance.now();
    const { translation, model } = await client().translateWithFallback(
      text, LANGUAGES[settings.targetLang], LANGUAGES[settings.sourceLang] || null, "document", models);
    els.translationText.value = translation;
    setTab("trans");
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(`Translated to ${settings.targetLang} in ${secs}s${model !== settings.llmModel ? ` (fallback model ${model})` : ""}.`, "ok");
    updateHistoryTranslation(translation);
  } catch (err) {
    banner(`Translation is unavailable right now — the text above is still yours to copy. (${explainError(err)})`, "err");
    setStatus("Translation service unavailable.", "err");
  } finally {
    setBusy(false);
  }
}

function showResult(result, fresh) {
  els.resultText.value = result.text || "";
  els.translationText.value = result.translation || "";
  if (result.translationError) {
    banner(`Picture read, but translation is unavailable right now. (${result.translationError})`, "err");
  } else if (fresh) {
    banner(null);
  }
  const timing = [];
  if (result.ocrSeconds) timing.push(`OCR ${result.ocrSeconds.toFixed(1)}s`);
  if (result.translateSeconds && result.translation) timing.push(`translate ${result.translateSeconds.toFixed(1)}s`);
  state.lastTiming = timing.join(" · ");
  setTab(result.translation ? "trans" : "text");
  updateStats();
}

function updateStats() {
  const s = textStats(state.tab === "trans" ? els.translationText.value : els.resultText.value);
  els.statWords.textContent = s.words;
  els.statLetters.textContent = s.letters;
  els.statLines.textContent = s.lines;
  els.statTime.hidden = !state.lastTiming;
  els.statTime.textContent = state.lastTiming;
}

function setTab(tab) {
  state.tab = tab;
  const trans = tab === "trans";
  els.tabText.classList.toggle("active", !trans);
  els.tabTrans.classList.toggle("active", trans);
  els.tabText.setAttribute("aria-selected", String(!trans));
  els.tabTrans.setAttribute("aria-selected", String(trans));
  els.paneText.hidden = trans;
  els.paneTrans.hidden = !trans;
  updateStats();
}

function activeText() {
  return (state.tab === "trans" ? els.translationText.value : els.resultText.value).trim();
}

// ================================================================== output

async function copyText() {
  const text = activeText();
  if (!text) {
    toast("Nothing to copy yet");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const area = state.tab === "trans" ? els.translationText : els.resultText;
    area.select();
    document.execCommand("copy");
  }
  toast(`Copied ${text.length} characters`);
}

function speak() {
  if (!("speechSynthesis" in window)) {
    toast("Read aloud is not supported in this browser");
    return;
  }
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    return;
  }
  const text = activeText();
  if (!text) {
    toast("Nothing to read aloud yet");
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = state.tab === "trans" ? (SPEECH_LANGS[settings.targetLang] || "en-US") : guessSpeechLang(text);
  utter.rate = 0.95;
  utter.onstart = () => { els.speakLabel.textContent = "Stop"; };
  utter.onend = utter.onerror = () => { els.speakLabel.textContent = "Listen"; };
  speechSynthesis.speak(utter);
}

async function shareText() {
  const text = activeText();
  if (!text) return;
  try {
    await navigator.share({ title: "Text from picture", text });
  } catch (_) {
    // cancelled
  }
}

function downloadText() {
  const text = els.resultText.value.trim();
  const translation = els.translationText.value.trim();
  if (!text && !translation) {
    toast("Nothing to save yet");
    return;
  }
  const body = translation ? `${text}\n\n--- ${settings.targetLang} ---\n${translation}\n` : `${text}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  a.href = url;
  a.download = `lingua-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Saved");
}

// ================================================================== history

function loadHistory() {
  const list = readJSON(HISTORY_KEY, []);
  return Array.isArray(list) ? list : [];
}

let lastHistoryId = null;
function saveToHistory(result, thumb) {
  if (!prefs.keepHistory || !result.text) return;
  const list = loadHistory();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    at: Date.now(),
    text: result.text,
    translation: result.translation || "",
    target: result.translation ? settings.targetLang : "",
    words: result.stats ? result.stats.words : textStats(result.text).words,
    thumb,
  };
  list.unshift(entry);
  while (list.length > HISTORY_MAX) list.pop();
  while (!writeJSON(HISTORY_KEY, list) && list.length > 1) list.pop(); // shrink on quota errors
  lastHistoryId = entry.id;
  renderHistory();
}

function updateHistoryTranslation(translation) {
  if (!lastHistoryId) return;
  const list = loadHistory();
  const entry = list.find((e) => e.id === lastHistoryId);
  if (!entry) return;
  entry.translation = translation;
  entry.target = settings.targetLang;
  writeJSON(HISTORY_KEY, list);
}

function renderHistory() {
  const list = loadHistory();
  els.historyCount.hidden = list.length === 0;
  els.historyCount.textContent = String(list.length);
  const q = els.historySearch.value.trim().toLowerCase();
  const shown = q ? list.filter((e) => (e.text + " " + e.translation).toLowerCase().includes(q)) : list;
  els.historyList.innerHTML = "";
  if (!shown.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = list.length ? "No scans match your search." : "Your scans will appear here.";
    els.historyList.appendChild(li);
    return;
  }
  for (const entry of shown) {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = entry.thumb || "";
    img.alt = "";
    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "t";
    title.textContent = entry.text.split("\n").find((l) => l.trim()) || "(empty)";
    const meta = document.createElement("div");
    meta.className = "m";
    meta.textContent = `${new Date(entry.at).toLocaleString()} · ${entry.words} words${entry.target ? " · " + entry.target : ""}`;
    body.append(title, meta);
    const del = document.createElement("button");
    del.className = "x";
    del.setAttribute("aria-label", "Delete scan");
    del.textContent = "×";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      writeJSON(HISTORY_KEY, loadHistory().filter((e) => e.id !== entry.id));
      renderHistory();
    });
    li.append(img, body, del);
    li.addEventListener("click", () => {
      lastHistoryId = entry.id;
      showResult({ text: entry.text, translation: entry.translation, ocrSeconds: 0 }, true);
      state.lastTiming = "";
      updateStats();
      closeDrawers();
      toast("Scan restored");
    });
    els.historyList.appendChild(li);
  }
}

// ================================================================== drawers

function openDrawer(drawer) {
  closeDrawers();
  drawer.hidden = false;
  els.scrim.hidden = false;
  if (drawer === els.historyDrawer) {
    renderHistory();
    els.historySearch.focus();
  }
}

function closeDrawers() {
  els.historyDrawer.hidden = true;
  els.settingsDrawer.hidden = true;
  els.scrim.hidden = true;
}

// ================================================================== wiring

for (const el of [els.sourceLang, els.targetLang, els.llmModel, els.ocrModel, els.gatewayOcrBase,
  els.gatewayLlmBase, els.apiKey, els.autoTranslate, els.keepHistory]) {
  el.addEventListener("change", commitSettings);
}
els.targetQuick.addEventListener("change", () => {
  els.targetLang.value = els.targetQuick.value;
  commitSettings();
});
if (els.themeToggle) {
  els.themeToggle.addEventListener("click", () => {
    settings.theme = settings.theme === "light" ? "dark" : "light";
    applyTheme(settings.theme);
    saveSettings(settings);
  });
}

els.cameraInput.addEventListener("change", () => addFiles(els.cameraInput.files, "photo"));
els.fileInput.addEventListener("change", () => addFiles(els.fileInput.files));
els.pasteBtn.addEventListener("click", async () => {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast("Press Ctrl+V (or long-press → Paste)");
    return;
  }
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) {
        const blob = await item.getType(type);
        addFiles([new File([blob], "pasted.png", { type })], "pasted picture");
        return;
      }
    }
    toast("No picture on the clipboard");
  } catch (_) {
    toast("Clipboard blocked — press Ctrl+V instead");
  }
});
els.rotateLeftBtn.addEventListener("click", () => rotate(-1));
els.rotateRightBtn.addEventListener("click", () => rotate(1));
els.cropBtn.addEventListener("click", () => setCropping(!state.cropping));
els.resetBtn.addEventListener("click", resetEdits);
els.clearBtn.addEventListener("click", clearPictures);
els.readBtn.addEventListener("click", readCurrent);
els.readAllBtn.addEventListener("click", readAll);
els.translateBtn.addEventListener("click", translateNow);
els.tabText.addEventListener("click", () => setTab("text"));
els.tabTrans.addEventListener("click", () => setTab("trans"));
els.resultText.addEventListener("input", updateStats);
els.translationText.addEventListener("input", updateStats);
els.copyBtn.addEventListener("click", copyText);
els.speakBtn.addEventListener("click", speak);
els.downloadBtn.addEventListener("click", downloadText);
if (navigator.share) {
  els.shareBtn.hidden = false;
  els.shareBtn.addEventListener("click", shareText);
}
els.historyBtn.addEventListener("click", () => openDrawer(els.historyDrawer));
els.settingsBtn.addEventListener("click", () => openDrawer(els.settingsDrawer));
els.scrim.addEventListener("click", closeDrawers);
for (const btn of document.querySelectorAll("[data-close]")) btn.addEventListener("click", closeDrawers);
els.historySearch.addEventListener("input", renderHistory);
els.clearHistoryBtn.addEventListener("click", () => {
  if (!confirm("Delete all saved scans on this device?")) return;
  writeJSON(HISTORY_KEY, []);
  renderHistory();
  toast("History cleared");
});

document.addEventListener("paste", (event) => {
  const files = [];
  for (const item of (event.clipboardData && event.clipboardData.items) || []) {
    if (item.kind === "file" && item.type.startsWith("image/")) files.push(item.getAsFile());
  }
  if (files.length) {
    event.preventDefault();
    addFiles(files, "pasted picture");
  }
});
document.addEventListener("keydown", (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (event.key === "Escape") closeDrawers();
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    readCurrent();
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copyText();
  }
  if (!typing && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "h") openDrawer(els.historyDrawer);
});
for (const type of ["dragenter", "dragover"]) {
  els.stage.addEventListener(type, (event) => {
    event.preventDefault();
    els.stage.classList.add("dragging");
  });
}
for (const type of ["dragleave", "drop"]) {
  els.stage.addEventListener(type, () => els.stage.classList.remove("dragging"));
}
els.stage.addEventListener("drop", (event) => {
  event.preventDefault();
  if (event.dataTransfer && event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
});
window.addEventListener("offline", () => setStatus("You are offline — reading needs a connection to the gateway.", "warn"));

// Laptops have no rear camera: the camera input just opens the file picker.
if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) {
  els.cameraLabel.querySelector("span").textContent = "Open picture";
}

// ================================================================== boot

applySettingsToUI();
renderHistory();
updateStats();

detectLaptopRelay().then((found) => {
  if (!found) return;
  if (found.models) {
    models = found.models;
    fillSelect(els.llmModel, models, false);
    els.llmModel.value = models.includes(settings.llmModel) ? settings.llmModel : (found.llmModel || models[0]);
    settings.llmModel = els.llmModel.value;
  }
  delete found.models;
  delete found.llmModel;
  relay = found;
  els.gatewayFields.hidden = true;
  els.relayHint.hidden = false;
  setStatus("Connected to Lingua on your laptop. Take a photo or pick a picture.", "ok");
});

// Small hook for automated UI tests and power users.
window.linguaPicture = { addFiles, readCurrent, state };
