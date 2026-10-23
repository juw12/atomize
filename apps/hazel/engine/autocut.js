'use strict';

// Hazel auto-cut engine.
//
// v1 removes silences / long pauses with ffmpeg's `silencedetect`.
// v1.1 adds filler-word removal ("um", "uh", ...) from Whisper word timestamps,
// and merges both kinds of cut before rendering.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { ffmpegPath, ffprobePath } = require('./ffmpeg');
const { transcribeWords } = require('./transcribe');

const DEFAULT_FILLERS = ['um', 'uh', 'erm', 'ah', 'hmm', 'mm', 'er', 'uhh', 'umm', 'huh', 'mmm'];

function run(bin, args, onStderr) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (onStderr) onStderr(d.toString());
    });
    child.on('error', (err) => reject(new Error(`could not run ${path.basename(bin)}: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} exited with ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

async function probe(file) {
  const { stdout } = await run(ffprobePath, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file
  ]);
  const data = JSON.parse(stdout);
  const streams = data.streams || [];
  const v = streams.find((s) => s.codec_type === 'video') || {};
  const a = streams.find((s) => s.codec_type === 'audio') || {};
  const duration = parseFloat((data.format && data.format.duration) || v.duration || '0') || 0;
  return {
    duration,
    width: v.width || null,
    height: v.height || null,
    fps: v.r_frame_rate || null,
    videoCodec: v.codec_name || null,
    audioCodec: a.codec_name || null,
    hasAudio: Boolean(a.codec_type),
    sizeBytes: data.format ? parseInt(data.format.size || '0', 10) || 0 : 0,
    formatName: data.format ? data.format.format_name || null : null
  };
}

async function detectSilences(file, opts, onProgress) {
  const noiseDb = opts.noiseDb != null ? opts.noiseDb : -32;
  const minSilence = opts.minSilence != null ? opts.minSilence : 0.35;
  if (onProgress) onProgress({ phase: 'detect' });

  const { stderr } = await run(ffmpegPath, [
    '-hide_banner',
    '-nostats',
    '-i', file,
    '-af', `silencedetect=noise=${noiseDb}dB:d=${minSilence}`,
    '-f', 'null',
    '-'
  ]);

  const starts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => parseFloat(m[1]));

  const silences = [];
  for (let i = 0; i < starts.length; i += 1) {
    silences.push({ start: Math.max(0, starts[i]), end: ends[i] != null ? ends[i] : null });
  }
  return silences;
}

// --- pure helpers --------------------------------------------------------

function normalizeWord(text) {
  return String(text || '').toLowerCase().replace(/[^a-z']/g, '').trim();
}

// Whisper words -> filler cut intervals (kind: 'filler').
function fillerCuts(words, opts = {}) {
  const set = new Set((opts.fillers || DEFAULT_FILLERS).map(normalizeWord));
  const cuts = [];
  for (const w of words || []) {
    const norm = normalizeWord(w.text);
    if (!norm || !set.has(norm)) continue;
    const start = Number(w.start);
    const end = Number(w.end);
    if (!isFinite(start) || !isFinite(end) || end <= start) continue;
    cuts.push({ start, end, kind: 'filler', word: norm });
  }
  return cuts;
}

// Merge overlapping / near-adjacent intervals into a minimal set.
function mergeCuts(cuts, gapTolerance = 0.06) {
  const sorted = (cuts || [])
    .map((c) => [Number(c.start), Number(c.end)])
    .filter(([s, e]) => isFinite(s) && isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s - last[1] <= gapTolerance) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

// Invert cut intervals into the segments we KEEP.
// `padding` shrinks each cut by N seconds (keeps a little breath).
function segmentsFromCuts(duration, cuts, opts = {}) {
  const padding = opts.padding != null ? opts.padding : 0.08;
  const minKeep = opts.minKeep != null ? opts.minKeep : 0.20;
  const gap = opts.gap != null ? opts.gap : 0;

  const holes = mergeCuts(cuts, gap)
    .map(([s, e]) => [Math.max(0, s + padding), Math.min(duration, e - padding)])
    .filter(([s, e]) => e - s > 0);

  const keep = [];
  let cursor = 0;
  for (const [s, e] of holes) {
    if (s > cursor) keep.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < duration) keep.push([cursor, duration]);

  return keep.filter(([s, e]) => e - s >= minKeep);
}

// Back-compat name (silences are just cut intervals).
function segmentsFromSilences(duration, silences, opts = {}) {
  return segmentsFromCuts(duration, silences, opts);
}

// --- orchestration -------------------------------------------------------

async function detectCuts(file, opts = {}, onProgress) {
  const info = await probe(file);
  const duration = info.duration;
  const silences = await detectSilences(file, opts, onProgress);

  const silPad = opts.padding != null ? opts.padding : 0.08;
  const silenceCuts = silences
    .map((s) => {
      const end = s.end != null ? s.end : duration;
      return { start: s.start + silPad, end: end - silPad, kind: 'silence', label: 'silence' };
    })
    .filter((c) => c.end - c.start > 0.02);

  let fillerList = [];
  let filler = { available: false, words: [] };
  if (opts.removeFillers) {
    filler = await transcribeWords(file, opts, onProgress);
    const filPad = opts.fillerPadding != null ? opts.fillerPadding : 0.0;
    fillerList = fillerCuts(filler.words, opts)
      .map((c) => ({
        start: c.start + filPad,
        end: Math.max(c.start + filPad, c.end - filPad),
        kind: 'filler',
        label: `\u201C${c.word}\u201D`
      }))
      .filter((c) => c.end - c.start > 0.01);
  }

  const allCuts = [...silenceCuts, ...fillerList];
  const minKeep = opts.minKeep != null ? opts.minKeep : 0.2;
  const segments = segmentsFromCuts(duration, allCuts, { padding: 0, minKeep, gap: 0.06 });

  const keptDuration = segments.reduce((acc, [s, e]) => acc + (e - s), 0);

  return {
    duration,
    cuts: allCuts.map((c) => ({ start: c.start, end: c.end, kind: c.kind, label: c.label })),
    segments,
    keptDuration,
    removed: Math.max(0, duration - keptDuration),
    filler: {
      requested: Boolean(opts.removeFillers),
      available: filler.available,
      found: fillerList.length,
      backend: filler.backend || null,
      error: filler.error || null
    }
  };
}

async function render(file, segments, out, opts = {}, onProgress) {
  if (!segments || segments.length === 0) throw new Error('Nothing to render - no segments kept.');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (onProgress) onProgress({ phase: 'render' });

  const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];

  if (segments.length === 1) {
    const [s, e] = segments[0];
    await run(ffmpegPath, ['-y', '-ss', String(s), '-to', String(e), '-i', file, ...encode, out]);
    return out;
  }

  const filterParts = [];
  segments.forEach(([s, e], i) => {
    filterParts.push(`[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${i}]`);
    filterParts.push(`[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[a${i}]`);
  });
  const pairs = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  const filter = `${filterParts.join(';')};${pairs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

  await run(ffmpegPath, [
    '-y', '-i', file,
    '-filter_complex', filter,
    '-map', '[outv]', '-map', '[outa]',
    ...encode, out
  ]);
  return out;
}

module.exports = {
  DEFAULT_FILLERS,
  probe,
  detectSilences,
  normalizeWord,
  fillerCuts,
  mergeCuts,
  segmentsFromCuts,
  segmentsFromSilences,
  detectCuts,
  render
};
