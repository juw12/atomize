'use strict';

// Pluggable transcription backend for filler-word detection.
//
// Primary backend: Python `faster-whisper` (CPU, int8) via engine/whisper_transcribe.py,
// run from the project's local .venv when present.
//
// Model resolution:
//   1. engine/models/faster-whisper-<model>/  (local, works fully offline)
//   2. otherwise the model name (faster-whisper downloads it — needs network)
//
// If the backend is unavailable, we return { available: false } and the engine
// simply produces no filler cuts, so the rest of Hazel keeps working.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { ffmpegPath } = require('./ffmpeg');

const SCRIPT = path.join(__dirname, 'whisper_transcribe.py');
const VENV_PY = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');

function pickPython() {
  if (process.env.HAZEL_PYTHON) return process.env.HAZEL_PYTHON;
  if (fs.existsSync(VENV_PY)) return VENV_PY;
  return 'python';
}

function localModelDir(model) {
  const dir = path.join(__dirname, 'models', `faster-whisper-${model}`);
  return fs.existsSync(path.join(dir, 'model.bin')) ? dir : null;
}

function run(cmd, args, { timeoutMs = 300000, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, env: env || process.env });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { try { p.kill(); } catch { /* ignore */ } }, timeoutMs);
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

async function extractWav(file, wav) {
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-y', '-i', file, '-ac', '1', '-ar', '16000', '-vn', wav], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg audio extract failed\n' + err.slice(-800)))));
  });
}

async function transcribeWords(file, opts = {}, onProgress) {
  const model = opts.whisperModel || 'tiny.en';
  const wav = path.join(os.tmpdir(), `hazel-whisper-${Date.now()}.wav`);
  try {
    if (onProgress) onProgress({ phase: 'extract-audio' });
    await extractWav(file, wav);

    if (onProgress) onProgress({ phase: 'transcribe' });
    const dir = localModelDir(model);
    const target = dir || model;

    // With no local model, avoid a long network stall: fail fast and let the
    // UI report "backend not installed". Fetch the model with scripts/fetch-model.
    const env = { ...process.env };
    if (!dir) env.HF_HUB_OFFLINE = '1';

    const { code, out, err } = await run(pickPython(), [SCRIPT, wav, target], { timeoutMs: 300000, env });

    let parsed = null;
    try { parsed = JSON.parse(out.trim().split('\n').pop()); } catch { /* not json */ }

    if (parsed && parsed.error) return { available: false, words: [], backend: 'faster-whisper', error: parsed.error };
    if (code !== 0 || !parsed || !Array.isArray(parsed.words)) {
      return { available: false, words: [], backend: 'faster-whisper', error: (err || 'transcriber failed').slice(-300) };
    }
    return { available: true, words: parsed.words, backend: 'faster-whisper', local: Boolean(dir) };
  } catch (e) {
    return { available: false, words: [], backend: 'faster-whisper', error: e.message };
  } finally {
    try { fs.unlinkSync(wav); } catch { /* ignore */ }
  }
}

module.exports = { transcribeWords, pickPython, localModelDir };
