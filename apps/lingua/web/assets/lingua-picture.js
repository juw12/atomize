/* Lingua — Read picture PWA page (laptop, iPhone, Android).
 *
 * Take a photo, choose a file, paste (Ctrl+V / Paste button) or drop an image;
 * Lingua OCRs it (readPicture in lingua-core.js, a port of
 * engine/image_text.py) and shows the words and letters, optionally translated.
 */

import {
  DEFAULT_SETTINGS,
  detectLaptopRelay,
  LANGUAGES,
  MODELS,
  explainError,
  loadSettings,
  MaasClient,
  readPicture,
  saveSettings,
  textStats,
} from "./lingua-core.js";

const $ = (id) => document.getElementById(id);
const els = {
  dropZone: $("dropZone"),
  cameraInput: $("cameraInput"),
  cameraLabel: $("cameraLabel"),
  fileInput: $("fileInput"),
  pasteBtn: $("pasteBtn"),
  preview: $("preview"),
  previewImg: $("previewImg"),
  previewHint: $("previewHint"),
  translateToggle: $("translateToggle"),
  targetLabel: $("targetLabel"),
  readBtn: $("readBtn"),
  clearBtn: $("clearBtn"),
  status: $("status"),
  resultText: $("resultText"),
  stats: $("stats"),
  translationBlock: $("translationBlock"),
  translationText: $("translationText"),
  copyBtn: $("copyBtn"),
  shareBtn: $("shareBtn"),
  downloadBtn: $("downloadBtn"),
  themeToggle: $("themeToggle"),
  sourceLang: $("sourceLang"),
  targetLang: $("targetLang"),
  llmModel: $("llmModel"),
  ocrModel: $("ocrModel"),
  gatewayOcrBase: $("gatewayOcrBase"),
  gatewayLlmBase: $("gatewayLlmBase"),
  apiKey: $("apiKey"),
};

let settings = loadSettings();
let relay = null; // overrides when served by the paired laptop app
const effectiveSettings = () => (relay ? Object.assign({}, settings, relay) : settings);
let currentPicture = null; // File / Blob
let previewUrl = null;
let busy = false;

// ----------------------------------------------------------------- settings

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

function applyTheme(theme) {
  document.documentElement.classList.toggle("theme-light", theme === "light");
  els.themeToggle.textContent = theme === "light" ? "Dark" : "Light";
}

function applySettingsToUI() {
  fillSelect(els.sourceLang, Object.keys(LANGUAGES), false);
  fillSelect(els.targetLang, Object.keys(LANGUAGES), true);
  fillSelect(els.llmModel, MODELS, false);
  fillSelect(els.ocrModel, [settings.ocrModel || DEFAULT_SETTINGS.ocrModel], false);
  els.sourceLang.value = settings.sourceLang;
  els.targetLang.value = settings.targetLang;
  els.llmModel.value = settings.llmModel;
  els.ocrModel.value = settings.ocrModel || DEFAULT_SETTINGS.ocrModel;
  els.gatewayOcrBase.value = settings.gatewayOcrBase;
  els.gatewayLlmBase.value = settings.gatewayLlmBase;
  els.apiKey.value = settings.apiKey;
  els.targetLabel.textContent = settings.targetLang;
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
  els.targetLabel.textContent = settings.targetLang;
  saveSettings(settings);
}

// ----------------------------------------------------------------- helpers

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.classList.remove("ok", "warn", "err");
  if (kind) els.status.classList.add(kind);
}

function showStats(text, extra) {
  const s = textStats(text);
  const parts = [`${s.words} words`, `${s.letters} letters`, `${s.lines} lines`];
  if (extra) parts.push(extra);
  els.stats.textContent = parts.join(" · ");
}

function outputText() {
  const text = els.resultText.value.trim();
  const translation = els.translationBlock.hidden ? "" : els.translationText.value.trim();
  return translation ? `${text}\n\n--- ${settings.targetLang} ---\n${translation}` : text;
}

// ----------------------------------------------------------------- picture input

function setPicture(file, label) {
  if (!file || !(file.type || "").startsWith("image/")) {
    setStatus("That is not a picture. Pick a PNG, JPEG, HEIC/WebP or screenshot.", "warn");
    return;
  }
  currentPicture = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  els.previewImg.src = previewUrl;
  els.previewImg.hidden = false;
  els.previewHint.hidden = true;
  els.readBtn.disabled = false;
  setStatus(`${label || file.name || "picture"} ready.`, null);
  readCurrent();
}

async function pasteFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    setStatus("Press Ctrl+V (or long-press → Paste) to paste a picture here.", "warn");
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) {
        setPicture(await item.getType(type), "pasted picture");
        return;
      }
    }
    setStatus("No picture on the clipboard. Copy an image or take a screenshot first.", "warn");
  } catch (err) {
    setStatus("Clipboard blocked by the browser. Press Ctrl+V instead.", "warn");
  }
}

function clearAll() {
  currentPicture = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  els.previewImg.hidden = true;
  els.previewImg.removeAttribute("src");
  els.previewHint.hidden = false;
  els.cameraInput.value = "";
  els.fileInput.value = "";
  els.resultText.value = "";
  els.translationText.value = "";
  els.translationBlock.hidden = true;
  els.readBtn.disabled = true;
  showStats("");
  setStatus("Lingua: pick a picture to read.", null);
}

// ----------------------------------------------------------------- read

async function readCurrent() {
  if (!currentPicture || busy) return;
  if (!effectiveSettings().apiKey) {
    setStatus("No API key set. Open Settings below and paste your MaaS API key, or open the phone link from Lingua on your laptop.", "err");
    return;
  }
  busy = true;
  els.readBtn.disabled = true;
  const wantTranslation = els.translateToggle.checked;
  setStatus(wantTranslation ? "Reading and translating picture…" : "Reading picture…", "warn");
  try {
    const client = new MaasClient(effectiveSettings());
    const result = await readPicture(client, currentPicture, {
      targetLang: wantTranslation ? LANGUAGES[settings.targetLang] || settings.targetLang : null,
      sourceLang: LANGUAGES[settings.sourceLang] || null,
    });
    els.resultText.value = result.text;
    els.translationBlock.hidden = !result.translation;
    els.translationText.value = result.translation || "";
    let timing = `OCR ${result.ocrSeconds.toFixed(1)}s`;
    if (result.translation) timing += ` · translate ${result.translateSeconds.toFixed(1)}s`;
    showStats(result.text, timing);
    if (result.text) setStatus("Done.", "ok");
    else setStatus("No words or letters found in this picture.", "warn");
  } catch (err) {
    setStatus(`Could not read picture: ${explainError(err)}`, "err");
  } finally {
    busy = false;
    els.readBtn.disabled = !currentPicture;
  }
}

// ----------------------------------------------------------------- output

async function copyResult() {
  const text = outputText();
  if (!text) {
    setStatus("Nothing to copy yet.", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`Copied ${text.length} characters.`, "ok");
  } catch (_) {
    els.resultText.select();
    document.execCommand("copy");
    setStatus("Copied.", "ok");
  }
}

async function shareResult() {
  const text = outputText();
  if (!text) return;
  try {
    await navigator.share({ title: "Text from picture", text });
  } catch (_) {
    // user cancelled the share sheet
  }
}

function downloadResult() {
  const text = outputText();
  if (!text) {
    setStatus("Nothing to save yet.", "warn");
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "lingua-picture-text.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ----------------------------------------------------------------- wire

for (const el of [els.sourceLang, els.targetLang, els.llmModel, els.ocrModel, els.gatewayOcrBase, els.gatewayLlmBase, els.apiKey]) {
  el.addEventListener("change", commitSettings);
}
els.themeToggle.addEventListener("click", () => {
  settings.theme = settings.theme === "light" ? "dark" : "light";
  applyTheme(settings.theme);
  saveSettings(settings);
});

els.cameraInput.addEventListener("change", () => setPicture(els.cameraInput.files[0], "photo"));
els.fileInput.addEventListener("change", () => setPicture(els.fileInput.files[0]));
els.pasteBtn.addEventListener("click", pasteFromClipboard);
els.readBtn.addEventListener("click", readCurrent);
els.clearBtn.addEventListener("click", clearAll);
els.translateToggle.addEventListener("change", () => {
  if (els.translateToggle.checked && currentPicture && els.resultText.value) readCurrent();
  if (!els.translateToggle.checked) els.translationBlock.hidden = true;
});
els.resultText.addEventListener("input", () => showStats(els.resultText.value));
els.copyBtn.addEventListener("click", copyResult);
els.downloadBtn.addEventListener("click", downloadResult);
if (navigator.share) {
  els.shareBtn.hidden = false;
  els.shareBtn.addEventListener("click", shareResult);
}

document.addEventListener("paste", (event) => {
  const items = (event.clipboardData && event.clipboardData.items) || [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      event.preventDefault();
      setPicture(item.getAsFile(), "pasted picture");
      return;
    }
  }
});

for (const type of ["dragenter", "dragover"]) {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
}
for (const type of ["dragleave", "drop"]) {
  els.dropZone.addEventListener(type, () => els.dropZone.classList.remove("dragging"));
}
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) setPicture(file);
});

// Laptops have no rear camera: "Take photo" just opens the file picker there,
// so only label it as a camera button on touch devices.
if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) {
  els.cameraLabel.textContent = "Open picture";
}

applySettingsToUI();
showStats("");

detectLaptopRelay().then((found) => {
  if (!found) return;
  relay = found;
  if (found.models) {
    fillSelect(els.llmModel, found.models, false);
    els.llmModel.value = found.models.includes(settings.llmModel) ? settings.llmModel : (found.llmModel || found.models[0]);
    settings.llmModel = els.llmModel.value;
  }
  delete relay.models;
  delete relay.llmModel;
  for (const el of [els.gatewayOcrBase, els.gatewayLlmBase, els.apiKey]) {
    el.closest("div").hidden = true;
  }
  setStatus("Connected to Lingua on your laptop. Take a photo or pick a picture.", "ok");
});
