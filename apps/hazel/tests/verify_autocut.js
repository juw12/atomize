'use strict';

// Hermetic end-to-end check for the Hazel auto-cut engine.
// Generates a clip with a known silent gap, then verifies detection + render.
// Exit 0 = pass, 1 = fail.

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { ffmpegPath } = require('../engine/ffmpeg');
const autocut = require('../engine/autocut');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }
function ok(msg) { console.log('ok  - ' + msg); }
function near(a, b, tol = 0.05) { return Math.abs(a - b) <= tol; }

// --- pure function: invert silences into kept segments -------------------

(function testPure() {
  const s1 = autocut.segmentsFromSilences(10, [{ start: 2, end: 4 }], { padding: 0, minKeep: 0.1 });
  if (s1.length !== 2) fail('segmentsFromSilences count: ' + JSON.stringify(s1));
  if (!near(s1[0][0], 0) || !near(s1[0][1], 2)) fail('seg0: ' + JSON.stringify(s1[0]));
  if (!near(s1[1][0], 4) || !near(s1[1][1], 10)) fail('seg1: ' + JSON.stringify(s1[1]));
  ok('segmentsFromSilences inverts a middle silence');

  const s2 = autocut.segmentsFromSilences(10, [{ start: 0, end: 3 }], { padding: 0, minKeep: 0.1 });
  if (s2.length !== 1 || !near(s2[0][0], 3) || !near(s2[0][1], 10)) fail('leading silence: ' + JSON.stringify(s2));
  ok('segmentsFromSilences handles a leading silence');

  const s3 = autocut.segmentsFromSilences(10, [], { padding: 0, minKeep: 0.1 });
  if (s3.length !== 1 || !near(s3[0][0], 0) || !near(s3[0][1], 10)) fail('no silence should keep all: ' + JSON.stringify(s3));
  ok('segmentsFromSilences keeps everything when nothing is silent');
})();

// --- pure function: filler words -> cuts ---------------------------------

(function testFillers() {
  const words = [
    { text: ' So', start: 0.0, end: 0.3 },
    { text: ' um,', start: 0.35, end: 0.6 },   // filler (has punctuation)
    { text: ' this', start: 0.7, end: 1.0 },
    { text: ' is', start: 1.0, end: 1.2 },
    { text: ' uh', start: 1.25, end: 1.5 },    // filler
    { text: ' great', start: 1.6, end: 2.0 }
  ];
  const cuts = autocut.fillerCuts(words, {});
  if (cuts.length !== 2) fail('expected 2 filler cuts, got ' + JSON.stringify(cuts.map((c) => c.word)));
  if (cuts[0].word !== 'um' || !near(cuts[0].start, 0.35) || !near(cuts[0].end, 0.6)) fail('filler0: ' + JSON.stringify(cuts[0]));
  if (cuts[1].word !== 'uh') fail('filler1: ' + JSON.stringify(cuts[1]));
  ok('fillerCuts finds um/uh and ignores real words');

  const merged = autocut.mergeCuts([{ start: 1.0, end: 1.4 }, { start: 1.42, end: 1.9 }, { start: 5.0, end: 5.5 }], 0.06);
  if (merged.length !== 2) fail('mergeCuts should join near-adjacent: ' + JSON.stringify(merged));
  if (!near(merged[0][0], 1.0) || !near(merged[0][1], 1.9)) fail('merge0: ' + JSON.stringify(merged[0]));
  ok('mergeCuts joins overlapping/near cuts');
})();

// --- end-to-end: generate -> detect -> render ----------------------------

const tmp = path.join(os.tmpdir(), 'hazel-test-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
const clip = path.join(tmp, 'clip.mp4');

// 6s: tone(0-2) + silence(2-4) + tone(4-6)
const genArgs = [
  '-y',
  '-f', 'lavfi', '-i', 'color=c=0x1b2129:s=320x240:r=25:d=6',
  '-f', 'lavfi', '-i', 'sine=f=440:d=2',
  '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=2',
  '-f', 'lavfi', '-i', 'sine=f=440:d=2',
  '-filter_complex', '[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]',
  '-map', '0:v', '-map', '[a]', '-shortest',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip
];

const gen = spawnSync(ffmpegPath, genArgs, { encoding: 'utf8' });
if (gen.status !== 0) fail('could not generate test clip:\n' + String(gen.stderr || '').slice(-800));
ok('generated a 6s test clip with a 2s silent gap');

(async () => {
  const res = await autocut.detectCuts(clip, { minSilence: 0.35, padding: 0 });
  if (res.cuts.length < 1) fail('expected >= 1 cut, got ' + JSON.stringify(res.cuts));
  ok(`detected ${res.cuts.length} cut(s); removes ${res.removed.toFixed(2)}s of ${res.duration.toFixed(2)}s`);

  const out = path.join(tmp, 'out.mp4');
  await autocut.render(clip, res.segments, out, {});
  if (!fs.existsSync(out) || fs.statSync(out).size < 1000) fail('render output missing or empty');
  ok('rendered clean cut (' + fs.statSync(out).size + ' bytes)');

  console.log('\nALL CHECKS PASSED');
})().catch((e) => fail(e.message));
