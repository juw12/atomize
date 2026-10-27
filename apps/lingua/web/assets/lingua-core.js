/* Lingua — shared engine for the web and mobile PWAs.
 *
 * Direct port of apps/lingua/engine/pipeline.py, engine/maas.py, and
 * engine/capture.py into a vanilla ES module so the web/mobile front-ends can
 * reuse the exact same caption state machine and MaaS gateway calls as the
 * Python desktop app.
 *
 * No third-party dependencies. Runs in any modern browser or as a Web Worker.
 */

// ------------------------------------------------------------------ constants

export const LANGUAGES = {
  "Auto (detect)": null,
  "English": "English",
  "繁體中文": "Traditional Chinese (繁體中文)",
  "简体中文": "Simplified Chinese (简体中文)",
  "Bahasa Indonesia": "Indonesian (Bahasa Indonesia)",
  "日本語": "Japanese (日本語)",
  "한국어": "Korean (한국어)",
  "Tiếng Việt": "Vietnamese (Tiếng Việt)",
  "ไทย": "Thai (ไทย)",
  "Bahasa Melayu": "Malay (Bahasa Melayu)",
  "Español": "Spanish (Español)",
  "Français": "French (Français)",
  "Deutsch": "German (Deutsch)",
  "Português": "Portuguese (Português)",
  "Русский": "Russian (Русский)",
  "العربية": "Arabic (العربية)",
  "हिन्दी": "Hindi (हिन्दी)",
};

// BCP-47 tags for read-aloud (speechSynthesis), keyed like LANGUAGES.
export const SPEECH_LANGS = {
  "English": "en-US", "繁體中文": "zh-TW", "简体中文": "zh-CN", "Bahasa Indonesia": "id-ID",
  "日本語": "ja-JP", "한국어": "ko-KR", "Tiếng Việt": "vi-VN", "ไทย": "th-TH", "Bahasa Melayu": "ms-MY",
  "Español": "es-ES", "Français": "fr-FR", "Deutsch": "de-DE", "Português": "pt-BR",
  "Русский": "ru-RU", "العربية": "ar-SA", "हिन्दी": "hi-IN",
};

// Best-effort script detection for read-aloud of OCR text (no network).
export function guessSpeechLang(text) {
  const s = String(text || "");
  if (/[\u3040-\u30ff]/.test(s)) return "ja-JP";
  if (/[\uac00-\ud7af]/.test(s)) return "ko-KR";
  if (/[\u0e00-\u0e7f]/.test(s)) return "th-TH";
  if (/[\u0600-\u06ff]/.test(s)) return "ar-SA";
  if (/[\u0900-\u097f]/.test(s)) return "hi-IN";
  if (/[\u0400-\u04ff]/.test(s)) return "ru-RU";
  if (/[\u4e00-\u9fff]/.test(s)) return "zh-TW";
  return "en-US";
}

export const MODELS = [
  "translate-default",
  "translate-fast",
  "translate-quality",
];

// The set of characters that mark a line as a completed sentence in the
// speaker heuristic. Matches Python's _SENTENCE_END exactly.
const SENTENCE_END = ".?!。？！:：,，;；\"'”）)";

// Regexes match the Python originals one-for-one.
const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i;
const HANDLE_RE = /^@\w[\w.\-]*$/;
const TOKEN_RE = /<\|[^|]*\|>/g;
const WS_RE = /\s+/g;
const ALNUM_RE = /[A-Za-z0-9\u4e00-\u9fff]/;
const CJK_RE = /[\u4e00-\u9fff]/;

// ------------------------------------------------------------------ Line

export class Line {
  constructor(speaker, original, translation, live) {
    this.speaker = speaker || null;
    this.original = original;
    this.translation = translation;
    this.live = !!live;
  }
}

// ------------------------------------------------------------------ normalize

function isJunk(text) {
  if (URL_RE.test(text) || HANDLE_RE.test(text)) return true;
  // Lines with no letters/digits/CJK at all are pure OCR noise.
  return ALNUM_RE.test(text) === false;
}

// Split/normalise a frame into clean, non-empty caption lines.
export function normalizeLines(rawText) {
  if (!rawText) return [];
  const out = [];
  for (const raw of String(rawText).split("\n")) {
    // Tokens must be stripped before the whitespace collapse, else a
    // removed token leaves a double space in the normalised line.
    const stripped = raw.replace(TOKEN_RE, "");
    const text = stripped.replace(WS_RE, " ").trim();
    if (!text || isJunk(text)) continue;
    out.push(text);
  }
  return out;
}

// Longest k with a[-k:] === b[:k]; 0 when none.
function commonPrefixLen(a, b) {
  let n = 0;
  const max = Math.min(a.length, b.length);
  for (; n < max; n++) {
    if (a[n] !== b[n]) break;
  }
  return n;
}

// Heuristic: does `text` look like a speaker name for `nextLine`?
function looksLikeSpeaker(text, nextLine) {
  if (!text || nextLine === null || nextLine === undefined) return false;
  if (text.length > 30) return false;
  const lastChar = text.charAt(text.length - 1);
  if (SENTENCE_END.indexOf(lastChar) >= 0) return false;

  // text.split() in Python splits on any whitespace and drops empties.
  const words = text.match(/\S+/g) || [];
  if (words.length < 1 || words.length > 3) return false;

  if (CJK_RE.test(text)) return text.length <= 8;

  // Latin-script names: every word starts with an uppercase letter.
  for (const word of words) {
    const head = word.charAt(0);
    if (!/[A-Za-z]/.test(head) || head !== head.toUpperCase()) return false;
  }
  const nextLast = nextLine.charAt(nextLine.length - 1);
  return nextLine.length > text.length || SENTENCE_END.indexOf(nextLast) >= 0;
}

function detectSpeaker(lines, index) {
  if (index <= 0) return null;
  const prev = lines[index - 1];
  if (looksLikeSpeaker(prev, lines[index])) return prev;
  return null;
}

// ------------------------------------------------------------------ CaptionPipeline

export class CaptionPipeline {
  constructor(translateFn, cache = null, maxLines = 200) {
    this.translateFn = translateFn;
    this.cache = cache || {};
    this.maxLines = maxLines;
    this._prevNorm = [];
    this._window = [];
  }

  _translateCached(original, onChunk) {
    if (Object.prototype.hasOwnProperty.call(this.cache, original)) {
      return this.cache[original];
    }
    const result = this.translateFn(original, onChunk);
    this.cache[original] = result;
    return result;
  }

  update(rawText, onChunk) {
    const norm = normalizeLines(rawText);
    if (norm.length === 0) return this._window.slice();

    let prefix = commonPrefixLen(this._prevNorm, norm);
    if (prefix > this._window.length) prefix = this._window.length;

    // Copy reused lines so mutating the new window never rewrites a list
    // already handed back to a caller.
    const reused = this._window.slice(0, prefix).map(
      (ln) => new Line(ln.speaker, ln.original, ln.translation, false),
    );
    const tail = norm.slice(prefix);

    const built = [];
    for (let offset = 0; offset < tail.length; offset++) {
      const text = tail[offset];
      const index = prefix + offset;
      const speaker = detectSpeaker(norm, index);
      const live = offset === tail.length - 1;
      const translation = this._translateCached(text, live ? onChunk : null);
      built.push(new Line(speaker, text, translation, false));
    }

    let window = reused.concat(built);
    if (window.length > 0) {
      for (const line of window) line.live = false;
      window[window.length - 1].live = true;
    }
    if (this.maxLines && window.length > this.maxLines) {
      window = window.slice(-this.maxLines);
    }

    this._window = window;
    this._prevNorm = this.maxLines ? norm.slice(-this.maxLines) : norm;
    return window.slice();
  }

  reset() {
    this._prevNorm = [];
    this._window = [];
  }
}

// ------------------------------------------------------------------ Transcript

function overlap(recorded, incoming) {
  for (let k = Math.min(recorded.length, incoming.length); k > 0; k--) {
    let match = true;
    for (let i = 0; i < k; i++) {
      if (recorded[recorded.length - k + i] !== incoming[i]) {
        match = false;
        break;
      }
    }
    if (match) return k;
  }
  return 0;
}

function commit(line) {
  return new Line(line.speaker, line.original, line.translation, false);
}

// True when `current` looks like the same line as `previous`, grown.
function grows(previous, current) {
  if (!previous || !current) return false;
  if (previous === current) return true;
  const len = Math.min(previous.length, current.length);
  let shared = 0;
  for (let i = 0; i < len; i++) {
    if (previous.charAt(i) !== current.charAt(i)) break;
    shared++;
  }
  return shared >= Math.max(3, Math.floor(0.6 * Math.min(previous.length, current.length)));
}

export class Transcript {
  constructor(maxLines = 500) {
    this.maxLines = maxLines;
    this._history = [];
    this._pending = null;
  }

  add(frameLines) {
    if (!frameLines || frameLines.length === 0) return this.lines();

    const incoming = frameLines.map((l) => l.original);
    const known = this._history.map((l) => l.original);
    if (this._pending !== null) known.push(this._pending.original);
    const overlapK = overlap(known, incoming);
    const tail = frameLines.slice(overlapK);

    if (tail.length > 0) {
      if (this._pending !== null) {
        const grew = overlapK === 0 && grows(this._pending.original, tail[tail.length - 1].original);
        if (!grew) this._history.push(commit(this._pending));
      }
      this._pending = null;
      for (let i = 0; i < tail.length - 1; i++) {
        this._history.push(commit(tail[i]));
      }
      const last = tail[tail.length - 1];
      if (this._history.length > 0 && this._history[this._history.length - 1].original === last.original) {
        this._pending = null;
      } else {
        this._pending = new Line(last.speaker, last.original, last.translation, true);
      }
      if (this.maxLines && this._history.length > this.maxLines) {
        this._history = this._history.slice(-this.maxLines);
      }
    }
    return this.lines();
  }

  lines() {
    if (this._pending === null) return this._history.slice();
    return this._history.concat([this._pending]);
  }

  reset() {
    this._history = [];
    this._pending = null;
  }
}

// Collapse a name plate (a line whose original is the next line's speaker)
// so the speaker label is shown exactly once.
export function speakerRows(lines) {
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      i + 1 < lines.length &&
      line.original &&
      lines[i + 1].speaker === line.original
    ) {
      continue;
    }
    rows.push([line.speaker, line.translation]);
  }
  return rows;
}

// ------------------------------------------------------------------ clean (output)

function isMatchingQuotePair(open, close) {
  return (
    (open === '"' && close === '"') ||
    (open === "'" && close === "'") ||
    (open === "\u201c" && close === "\u201d") ||
    (open === "\u2018" && close === "\u2019")
  );
}

// Strip leading blank lines and cosmetic wrapping quotes from model output.
export function clean(text) {
  if (typeof text !== "string") return "";
  let lines = text.split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  let out = lines.join("\n").trim();
  if (out.length >= 2 && isMatchingQuotePair(out.charAt(0), out.charAt(out.length - 1))) {
    out = out.substring(1, out.length - 1).trim();
  }
  return out;
}

// ------------------------------------------------------------------ changeHash

const HASH_WIDTH = 64;

// Average-hash key: 64px-wide grayscale, compared against the mean.
// Two frames with the same hash are "unchanged".
export function changeHash(imageDataOrCanvas) {
  if (!imageDataOrCanvas) return "";
  let canvas;
  if (imageDataOrCanvas instanceof HTMLCanvasElement) {
    canvas = imageDataOrCanvas;
  } else if (imageDataOrCanvas instanceof ImageData) {
    canvas = document.createElement("canvas");
    canvas.width = imageDataOrCanvas.width;
    canvas.height = imageDataOrCanvas.height;
    canvas.getContext("2d").putImageData(imageDataOrCanvas, 0, 0);
  } else if (imageDataOrCanvas instanceof HTMLImageElement) {
    canvas = document.createElement("canvas");
    canvas.width = imageDataOrCanvas.naturalWidth || imageDataOrCanvas.width;
    canvas.height = imageDataOrCanvas.naturalHeight || imageDataOrCanvas.height || 0;
    canvas.getContext("2d").drawImage(imageDataOrCanvas, 0, 0);
  } else {
    return "";
  }
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return "";

  // Downscale to a 64px-wide grayscale strip.
  const newH = Math.max(1, Math.round(h * HASH_WIDTH / w));
  const tmp = document.createElement("canvas");
  tmp.width = HASH_WIDTH;
  tmp.height = newH;
  const ctx = tmp.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, HASH_WIDTH, newH);
  const data = ctx.getImageData(0, 0, HASH_WIDTH, newH).data;
  const pxCount = HASH_WIDTH * newH;
  const lum = new Uint8ClampedArray(pxCount);
  let sum = 0;
  for (let i = 0; i < pxCount; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Rec.601 luminance.
    const y = (r * 299 + g * 587 + b * 114) / 1000;
    lum[i] = y;
    sum += y;
  }
  const mean = sum / pxCount;
  let bits = "";
  for (let i = 0; i < pxCount; i++) bits += lum[i] >= mean ? "1" : "0";
  const pad = (4 - bits.length % 4) % 4;
  if (pad > 0) bits += "0".repeat(pad);
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.substring(i, i + 4), 2).toString(16);
  }
  return hex;
}

// ------------------------------------------------------------------ settings

export const DEFAULT_SETTINGS = {
  gatewayOcrBase: "https://gateway.example.com/ocr/v1",
  gatewayLlmBase: "https://gateway.example.com/llm/v1",
  apiKey: "",
  ocrModel: "deepseek-ai/DeepSeek-OCR-2",
  llmModel: "translate-default",
  sourceLang: "Auto (detect)",
  targetLang: "繁體中文",
  pollMs: 200,
  opacity: 0.92,
  theme: "dark",
};

const SETTINGS_KEY = "lingua.settings.v1";

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = Object.assign({}, DEFAULT_SETTINGS, parsed);
    // Defensive: every known key must exist.
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (!(k in merged)) merged[k] = DEFAULT_SETTINGS[k];
    }
    return merged;
  } catch (_) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("[lingua] could not save settings:", err);
  }
}

// Default OCR instruction (plain text, no layout markup).
export const OCR_PROMPT = "<image>\nFree OCR.";

// ------------------------------------------------------------------ MaasClient

export class MaasError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "MaasError";
    if (cause) this.cause = cause;
  }
}

async function blobToDataUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof Blob) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(input);
    });
  }
  if (input instanceof HTMLCanvasElement) return input.toDataURL("image/png");
  if (input instanceof ImageData) {
    const c = document.createElement("canvas");
    c.width = input.width;
    c.height = input.height;
    c.getContext("2d").putImageData(input, 0, 0);
    return c.toDataURL("image/png");
  }
  throw new MaasError("Unsupported image type for OCR");
}

function describeNetworkError(err, url) {
  // Mixed content: page is HTTPS but the gateway is HTTP.
  if (
    typeof location !== "undefined" &&
    location.protocol === "https:" &&
    typeof url === "string" &&
    url.startsWith("http://")
  ) {
    return "Blocked by the browser: this page is HTTPS but the gateway is HTTP (mixed content). Run this page locally over http, or use an https gateway.";
  }
  // CORS preflight / response blocked by the gateway.
  const causeMsg = (err && (err.message || String(err))) || "network error";
  if (/Failed to fetch|NetworkError|Load failed/i.test(causeMsg) && typeof url === "string" && url.startsWith("http://")) {
    return `Could not reach the gateway at ${url}. The browser may be blocking the request as mixed content (HTTPS page → HTTP gateway), or the gateway is down. ${causeMsg}`;
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(causeMsg)) {
    return `Could not reach the gateway at ${url}. The gateway may be offline, or CORS may be blocking the request. ${causeMsg}`;
  }
  if (err && err.name === "AbortError") {
    return `Request to the gateway timed out. The gateway at ${url} did not respond in time.`;
  }
  return `Could not reach the gateway (${url}): ${causeMsg}`;
}

export class MaasClient {
  constructor(settings) {
    this.settings = settings;
  }

  _requireKey() {
    const key = (this.settings && this.settings.apiKey) || "";
    if (!key) {
      throw new MaasError("No API key set. Open Settings and paste your MaaS API key.");
    }
    return key;
  }

  async _postJSON(url, payload, timeoutMs) {
    const ms = timeoutMs || 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this._requireKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        mode: "cors",
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === "AbortError") {
        throw new MaasError(`Request to the gateway timed out after ${Math.round(ms / 1000)}s. The gateway may be slow or unreachable.`, err);
      }
      // Network-level failure: CORS, mixed content, DNS, offline.
      // Distinguish CORS vs mixed content vs generic offline.
      const msg = String((err && err.message) || "");
      const isCors = /Failed to fetch|NetworkError|Load failed|TypeError/i.test(msg) &&
        !url.startsWith("http:"); // HTTP→HTTPS gateway from an HTTP page fails too, not mixed content
      const isMixedContent = typeof location !== "undefined" &&
        location.protocol === "https:" && url.startsWith("http://");
      let detail;
      if (isMixedContent) {
        detail = "Blocked by the browser: this page is HTTPS but the gateway is HTTP (mixed content). Run this page locally over http, or use an https gateway.";
      } else if (isCors) {
        detail = "Blocked by CORS: the gateway did not allow this origin. Ask the gateway operator to allow your origin, or use a CORS proxy.";
      } else {
        detail = describeNetworkError(err, url);
      }
      throw new MaasError(detail, err);
    }
    clearTimeout(timer);

    if (!response.ok) {
      let body = "";
      try {
        body = (await response.text()).slice(0, 200);
      } catch (_) {
        body = "";
      }
      throw new MaasError(`HTTP ${response.status}: ${body || response.statusText}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new MaasError(`Invalid JSON response from gateway: ${err.message}`, err);
    }
    return data;
  }

  static _content(data) {
    try {
      const text = data.choices[0].message.content;
      return clean(text);
    } catch (_) {
      throw new MaasError("Unexpected response shape from gateway (missing choices[0].message.content).");
    }
  }

  async ocr(blobOrDataUrl, prompt = OCR_PROMPT) {
    const dataUrl = await blobToDataUrl(blobOrDataUrl);
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx < 0) throw new MaasError("OCR: image data URL is malformed.");
    const b64 = dataUrl.substring(commaIdx + 1);
    const header = dataUrl.substring(0, commaIdx); // data:<mime>;base64
    const mimeMatch = header.match(/^data:([^;]+)/);
    const mime = (mimeMatch && mimeMatch[1]) || "image/png";

    const payload = {
      model: this.settings.ocrModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
    };
    const base = String(this.settings.gatewayOcrBase || "").replace(/\/+$/, "");
    const url = `${base}/chat/completions`;
    const data = await this._postJSON(url, payload);
    return MaasClient._content(data);
  }

  // Try the configured model first, then the others, until one answers.
  async translateWithFallback(text, targetLang, sourceLang, purpose = "meeting", models = null) {
    const order = [];
    for (const m of [this.settings.llmModel].concat(models || MODELS)) {
      if (m && !order.includes(m)) order.push(m);
    }
    const original = this.settings.llmModel;
    let lastError = null;
    try {
      for (const model of order) {
        this.settings = Object.assign({}, this.settings, { llmModel: model });
        try {
          return { translation: await this.translate(text, targetLang, sourceLang, purpose), model };
        } catch (err) {
          lastError = err;
        }
      }
    } finally {
      this.settings = Object.assign({}, this.settings, { llmModel: original });
    }
    const tried = `${order.length} model${order.length === 1 ? "" : "s"}`;
    throw new MaasError(`Translation unavailable (tried ${tried}): ${lastError ? lastError.message : "no model"}`, lastError);
  }

  async translate(text, targetLang, sourceLang, purpose = "meeting") {
    const system = purpose === "document"
      ? `Translator. The text was read from a picture by OCR. Translate it into ${targetLang}, keeping its line breaks. Output ONLY the translation.`
      : `Real-time meeting interpreter. Translate into ${targetLang}. Output ONLY the translation.`;
    let user = String(text || "").trim();
    if (sourceLang) user = `(source language: ${sourceLang}) ${user}`;
    const payload = {
      model: this.settings.llmModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
    };
    const base = String(this.settings.gatewayLlmBase || "").replace(/\/+$/, "");
    const url = `${base}/chat/completions`;
    const data = await this._postJSON(url, payload);
    return MaasClient._content(data);
  }
}

// ------------------------------------------------------------------ picture reader
// Port of engine/image_text.py: turn any picture (photo, screenshot, scan)
// into text. Same OCR model as captions, prepared for documents.

// Longest side the picture is downscaled to before OCR (small print survives).
export const DOC_MAX_SIDE = 1600;
// Pictures whose longest side is smaller are enlarged to this.
export const DOC_MIN_SIDE = 768;

const REF_RE = /<\|ref\|>([\s\S]*?)<\|\/ref\|>/g;
const DET_RE = /<\|det\|>[\s\S]*?<\|\/det\|>/g;
const ANY_TOKEN_RE = /<\|[^|>]*\|>/g;
const CJK_CHARS = "\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff";
const WORD_RE = new RegExp(
  `[${CJK_CHARS}]|(?:(?![${CJK_CHARS}])[\\p{L}\\p{N}])+(?:['\u2019\\-][\\p{L}\\p{N}]+)*`,
  "gu",
);
const LETTER_RE = /[\p{L}\p{N}]/gu;

// Strip OCR markup tokens and tidy whitespace, keeping the line layout.
export function cleanOcrText(raw) {
  if (typeof raw !== "string") return "";
  const text = raw
    .replace(REF_RE, "$1")
    .replace(DET_RE, "")
    .replace(ANY_TOKEN_RE, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Blank line between every line (OCR artefact) -> tight lines; real
  // paragraphs (a mix of single and double breaks) are left alone.
  return text.includes("\n\n") && !/[^\n]\n[^\n]/.test(text) ? text.replace(/\n\n/g, "\n") : text;
}

// Count words (CJK: one per character), letters (alphanumerics) and lines.
export function textStats(text) {
  if (!text) return { words: 0, letters: 0, lines: 0 };
  const words = (text.match(WORD_RE) || []).length;
  const letters = (text.match(LETTER_RE) || []).length;
  const lines = text.split("\n").filter((line) => line.trim()).length;
  return { words, letters, lines };
}

async function decodePicture(file) {
  // Browsers apply EXIF orientation when decoding, so phone photos come out upright.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (_) {
      // fall through to <img> decoding (older Safari, unusual formats)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch (err) {
    throw new MaasError("This file is not a picture the browser can open.", err);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Upright, white-backed, resized PNG canvas ready for document OCR.
export async function preparePicture(file, maxSide = DOC_MAX_SIDE, minSide = DOC_MIN_SIDE) {
  const source = await decodePicture(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new MaasError("The picture has no pixels.");
  const longest = Math.max(width, height);
  let scale = 1;
  if (maxSide && longest > maxSide) scale = maxSide / longest;
  else if (minSide && longest < minSide) scale = minSide / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // transparent PNGs: dark text stays readable
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (typeof source.close === "function") source.close();
  return canvas;
}

// OCR a picture and optionally translate it. Returns
// { text, translation, ocrSeconds, translateSeconds, stats }.
export async function readPicture(client, file, options = {}) {
  const { targetLang = null, sourceLang = null } = options;
  const canvas = await preparePicture(file);
  let started = performance.now();
  const text = cleanOcrText(await client.ocr(canvas, OCR_PROMPT));
  const result = {
    text,
    translation: null,
    ocrSeconds: (performance.now() - started) / 1000,
    translateSeconds: 0,
    stats: textStats(text),
  };
  if (targetLang && text) {
    started = performance.now();
    try {
      const { translation, model } = await client.translateWithFallback(
        text, targetLang, sourceLang, "document", options.models || null);
      result.translation = translation;
      result.modelUsed = model;
    } catch (err) {
      // Keep the picture text even when the translation service is down.
      result.translationError = (err && err.message) || String(err);
    }
    result.translateSeconds = (performance.now() - started) / 1000;
  }
  return result;
}

// ------------------------------------------------------------------ laptop relay
// When the page is served by the Lingua desktop app ("Share to phone"), the
// laptop relays OCR/translate calls to the gateway and keeps the API key.
// The pairing token arrives once in the link (?pair=...) and is remembered.

const PAIR_KEY = "lingua.pair.v1";

// Returns relay overrides ({gatewayOcrBase, gatewayLlmBase, apiKey, models,
// llmModel}) or null when the page is not served by a paired laptop.
export async function detectLaptopRelay() {
  let pair = null;
  try {
    pair = new URLSearchParams(location.search).get("pair");
    if (pair) localStorage.setItem(PAIR_KEY, pair);
    else pair = localStorage.getItem(PAIR_KEY);
  } catch (_) {
    // storage blocked: only the link token is usable
  }
  if (!pair) return null;
  try {
    const resp = await fetch(`local-config.json?pair=${encodeURIComponent(pair)}`, { cache: "no-store" });
    if (!resp.ok) return null;
    const cfg = await resp.json();
    if (!cfg || !cfg.relay) return null;
    return {
      gatewayOcrBase: location.origin + cfg.gatewayOcrBase,
      gatewayLlmBase: location.origin + cfg.gatewayLlmBase,
      apiKey: cfg.apiKey,
      models: Array.isArray(cfg.models) && cfg.models.length ? cfg.models : null,
      llmModel: cfg.llmModel || null,
    };
  } catch (_) {
    return null; // not served by the laptop app (e.g. GitHub Pages)
  }
}

// ------------------------------------------------------------------ helpers

// Downscale an HTMLCanvasElement keeping aspect, matching capture.downscale().
export function downscaleCanvas(source, maxWidth) {
  if (!source) return null;
  const w = source.width;
  const h = source.height;
  if (!maxWidth || maxWidth <= 0 || w <= maxWidth) return source;
  const newH = Math.max(1, Math.round(h * maxWidth / w));
  const out = document.createElement("canvas");
  out.width = maxWidth;
  out.height = newH;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, maxWidth, newH);
  return out;
}

// Draw a normalised {x,y,w,h} rectangle from `video` onto a fresh canvas.
export function drawVideoRegion(video, region) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const x = Math.max(0, Math.floor(region.x * vw));
  const y = Math.max(0, Math.floor(region.y * vh));
  const w = Math.max(1, Math.min(vw - x, Math.floor(region.w * vw)));
  const h = Math.max(1, Math.min(vh - y, Math.floor(region.h * vh)));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(video, x, y, w, h, 0, 0, w, h);
  return c;
}

// Format an error into something human-readable for the status line.
export function explainError(err) {
  if (!err) return "Unknown error.";
  if (err instanceof MaasError) return err.message;
  if (err.name === "NotAllowedError") return "Screen capture was denied. Click Start capture again and choose a window or tab to share.";
  if (err.name === "NotFoundError") return "No capture source found.";
  if (err.name === "NotReadableError") return "The selected capture source is already in use.";
  return (err.message || String(err));
}
