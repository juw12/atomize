/* Lingua — mobile PWA: paste text or upload an image and translate it.
 *
 * Mobile browsers have no getDisplayMedia, so the user pastes a caption (or
 * uploads a screenshot). The image path runs OCR first, then the translation
 * call — same two-stage pipeline as the desktop app.
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
  speakerRows,
} from "./lingua-core.js";

const $ = (id) => document.getElementById(id);
const els = {
  textTab: $("textTab"),
  imageTab: $("imageTab"),
  pasteInput: $("pasteInput"),
  translateTextBtn: $("translateTextBtn"),
  clearTextBtn: $("clearTextBtn"),
  imageInput: $("imageInput"),
  ocrBtn: $("ocrBtn"),
  clearImageBtn: $("clearImageBtn"),
  status: $("status"),
  transcript: $("transcript"),
  emptyState: $("emptyState"),
  themeToggle: $("themeToggle"),
  sourceLang: $("sourceLang"),
  targetLang: $("targetLang"),
  llmModel: $("llmModel"),
  ocrModel: $("ocrModel"),
  gatewayOcrBase: $("gatewayOcrBase"),
  gatewayLlmBase: $("gatewayLlmBase"),
  apiKey: $("apiKey"),
  tabButtons: document.querySelectorAll(".tab-bar button"),
};

let settings = loadSettings();
const pipeline = new CaptionPipeline((text) => translateFn(text));
const transcript = new Transcript();

function getSourceHint() {
  return LANGUAGES[settings.sourceLang];
}

async function translateFn(text) {
  const client = new MaasClient(settings);
  return client.translate(text, settings.targetLang, getSourceHint());
}

// ----------------------------------------------------------------- settings UI

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
  els.gatewayOcrBase.value = settings.gatewayOcrBase;
  els.gatewayLlmBase.value = settings.gatewayLlmBase;
  els.apiKey.value = settings.apiKey;
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
  saveSettings(settings);
}

function bindSettings() {
  for (const el of [els.sourceLang, els.targetLang, els.llmModel, els.ocrModel, els.gatewayOcrBase, els.gatewayLlmBase, els.apiKey]) {
    el.addEventListener("change", commitSettings);
  }
  els.themeToggle.addEventListener("click", () => {
    settings.theme = settings.theme === "light" ? "dark" : "light";
    applyTheme(settings.theme);
    saveSettings(settings);
  });
}

// ----------------------------------------------------------------- status

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.classList.remove("ok", "warn", "err");
  if (kind) els.status.classList.add(kind);
}

// ----------------------------------------------------------------- render

function renderEmpty() {
  els.transcript.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "No translations yet.";
  els.transcript.appendChild(empty);
}

function renderRows(rows) {
  els.transcript.innerHTML = "";
  if (!rows || rows.length === 0) {
    renderEmpty();
    return;
  }
  for (const [speaker, translation] of rows) {
    if (speaker) {
      const sp = document.createElement("div");
      sp.className = "row speaker";
      sp.textContent = speaker;
      els.transcript.appendChild(sp);
    }
    const tr = document.createElement("div");
    tr.className = "row text";
    tr.textContent = translation;
    els.transcript.appendChild(tr);
  }
}

// ----------------------------------------------------------------- actions

async function translatePastedText() {
  const text = (els.pasteInput.value || "").trim();
  if (!text) {
    setStatus("Paste some caption text first.", "warn");
    return;
  }
  if (!settings.apiKey) {
    setStatus("No API key set. Open Settings and paste your MaaS API key.", "err");
    return;
  }
  setStatus("Translating…", "warn");
  els.translateTextBtn.disabled = true;
  try {
    // Feed the pasted text into the pipeline as a single OCR frame so the
    // dedup + live + speaker logic is identical to the desktop path.
    const lines = pipeline.update(text);
    const transcriptLines = transcript.add(lines);
    renderRows(speakerRows(transcriptLines));
    setStatus("Translated.", "ok");
    els.pasteInput.value = "";
  } catch (err) {
    setStatus(`Translate failed: ${explainError(err)}`, "err");
  } finally {
    els.translateTextBtn.disabled = false;
  }
}

async function ocrAndTranslate() {
  const file = els.imageInput.files && els.imageInput.files[0];
  if (!file) {
    setStatus("Pick an image first.", "warn");
    return;
  }
  if (!settings.apiKey) {
    setStatus("No API key set. Open Settings and paste your MaaS API key.", "err");
    return;
  }
  setStatus("OCR + translate…", "warn");
  els.ocrBtn.disabled = true;
  try {
    const client = new MaasClient(settings);
    const text = await client.ocr(file);
    if (!text || !text.trim()) {
      setStatus("OCR returned no text.", "warn");
      return;
    }
    const lines = pipeline.update(text);
    const transcriptLines = transcript.add(lines);
    renderRows(speakerRows(transcriptLines));
    setStatus(`OCR + translate done (${text.split("\n").length} line(s)).`, "ok");
  } catch (err) {
    setStatus(`OCR/translate failed: ${explainError(err)}`, "err");
  } finally {
    els.ocrBtn.disabled = false;
  }
}

function clearTranscript() {
  pipeline.reset();
  transcript.reset();
  renderEmpty();
  setStatus("Transcript cleared.", null);
}

// ----------------------------------------------------------------- tab switching

function setTab(name) {
  for (const btn of els.tabButtons) {
    btn.classList.toggle("active", btn.dataset.tab === name);
  }
  els.textTab.classList.toggle("hidden", name !== "text");
  els.imageTab.classList.toggle("hidden", name !== "image");
}

for (const btn of els.tabButtons) {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
}

// ----------------------------------------------------------------- wire

els.translateTextBtn.addEventListener("click", translatePastedText);
els.clearTextBtn.addEventListener("click", () => {
  els.pasteInput.value = "";
});
els.ocrBtn.addEventListener("click", ocrAndTranslate);
els.clearImageBtn.addEventListener("click", () => {
  els.imageInput.value = "";
});

// ----------------------------------------------------------------- boot

applySettingsToUI();
bindSettings();
renderEmpty();
