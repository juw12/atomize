'use strict';

// Resolves the ffmpeg / ffprobe binaries. Prefers the bundled static builds
// (so the app works with no system ffmpeg); falls back to PATH names.

const fs = require('node:fs');

function resolveBinary(mod, fallback) {
  try {
    const raw = typeof mod === 'string' ? mod : mod && mod.path;
    if (!raw) return fallback;
    // In a packaged app the binaries live outside the asar archive.
    const unpacked = raw.replace('app.asar', 'app.asar.unpacked');
    return fs.existsSync(unpacked) ? unpacked : raw;
  } catch {
    return fallback;
  }
}

let ffmpegPath = 'ffmpeg';
let ffprobePath = 'ffprobe';

try {
  ffmpegPath = resolveBinary(require('ffmpeg-static'), 'ffmpeg');
} catch {
  /* fall back to PATH */
}

try {
  ffprobePath = resolveBinary(require('ffprobe-static'), 'ffprobe');
} catch {
  /* fall back to PATH */
}

module.exports = { ffmpegPath, ffprobePath };
