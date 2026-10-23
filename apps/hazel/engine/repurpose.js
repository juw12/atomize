'use strict';

// Hazel repurpose engine.
//
// Turns one edited clip into the platform formats: 9:16 (vertical), 1:1
// (square) and 16:9 (wide). Vertical/square use a blurred-pad framing that
// keeps the subject inside the platform "safe zone" (clear of the UI overlays);
// wide is a plain cover crop.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { ffmpegPath } = require('./ffmpeg');
const { probe } = require('./autocut');

const RATIOS = {
  vertical: { key: 'vertical', label: '9x16', width: 1080, height: 1920, safe: { top: 0.10, bottom: 0.18, left: 0.06, right: 0.06 } },
  square: { key: 'square', label: '1x1', width: 1080, height: 1080, safe: { top: 0.06, bottom: 0.12, left: 0.06, right: 0.06 } },
  wide: { key: 'wide', label: '16x9', width: 1920, height: 1080, safe: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 } }
};

const DEFAULT_RATIOS = ['vertical', 'square', 'wide'];

function even(n) { return Math.max(2, Math.round(n / 2) * 2); }

function pickRatios(names) {
  const keys = names && names.length ? names : DEFAULT_RATIOS;
  return keys.map((k) => RATIOS[k]).filter(Boolean);
}

// Usable (safe) size inside a target once platform UI insets are removed.
function safeSize(target) {
  const s = target.safe || { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    w: even(target.width * (1 - s.left - s.right)),
    h: even(target.height * (1 - s.top - s.bottom))
  };
}

// Build an ffmpeg filtergraph that ends with a labelled [v] video stream.
function buildFilter(target, opts = {}) {
  const W = even(target.width);
  const H = even(target.height);
  const mode = opts.mode || (target.safe ? 'blurpad' : 'cover');

  if (mode === 'blurpad') {
    const { w: sw, h: sh } = safeSize(target);
    return (
      `[0:v]split=2[bg][fg];` +
      `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=28[bgb];` +
      `[fg]scale=${sw}:${sh}:force_original_aspect_ratio=decrease[fgs];` +
      `[bgb][fgs]overlay=(W-w)/2:(H-h)/2[v]`
    );
  }
  return `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[v]`;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg failed\n' + err.slice(-1500)))));
  });
}

async function repurpose(file, outDir, opts = {}, onProgress) {
  const info = await probe(file);
  const targets = pickRatios(opts.ratios);
  if (!targets.length) throw new Error('No target ratios selected.');

  fs.mkdirSync(outDir, { recursive: true });
  const base = opts.baseName || path.basename(file, path.extname(file));
  const outputs = [];

  for (const t of targets) {
    const out = path.join(outDir, `${base}-${t.label}.mp4`);
    if (onProgress) onProgress({ phase: 'repurpose', ratio: t.label, target: t.key });
    await runFfmpeg([
      '-y', '-i', file,
      '-filter_complex', buildFilter(t, opts),
      '-map', '[v]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', out
    ]);
    outputs.push({ ratio: t.label, key: t.key, path: out, width: t.width, height: t.height, source: info.width && info.height ? `${info.width}x${info.height}` : null });
  }

  return outputs;
}

module.exports = { RATIOS, DEFAULT_RATIOS, pickRatios, safeSize, buildFilter, repurpose };
