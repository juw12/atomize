'use strict';

// Hermetic end-to-end check for the Hazel repurpose engine.
// Verifies the filter graphs, then exports a real clip to 9:16 / 1:1 / 16:9
// and confirms each output has the correct dimensions.

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { ffmpegPath } = require('../engine/ffmpeg');
const autocut = require('../engine/autocut');
const repurpose = require('../engine/repurpose');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }
function ok(msg) { console.log('ok  - ' + msg); }

(function testPure() {
  const v = repurpose.RATIOS.vertical;
  const f = repurpose.buildFilter(v, {});
  if (!/split=2/.test(f) || !/\[v\]$/.test(f)) fail('vertical blurpad filter: ' + f);

  const w = repurpose.buildFilter(repurpose.RATIOS.wide, { mode: 'cover' });
  if (!/scale=1920:1080/.test(w) || !/\[v\]$/.test(w)) fail('wide cover filter: ' + w);

  const ss = repurpose.safeSize(v);
  if (!(ss.w < v.width && ss.h < v.height)) fail('safeSize must inset the target: ' + JSON.stringify(ss));
  ok('buildFilter + safeSize produce expected graphs');
})();

const tmp = path.join(os.tmpdir(), 'hazel-rep-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
const clip = path.join(tmp, 'wide.mp4');

const gen = spawnSync(ffmpegPath, [
  '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=25:duration=2',
  '-f', 'lavfi', '-i', 'sine=f=440:d=2',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-shortest', clip
], { encoding: 'utf8' });
if (gen.status !== 0) fail('could not generate test clip:\n' + String(gen.stderr || '').slice(-800));
ok('generated a 1280x720 test clip');

(async () => {
  const outDir = path.join(tmp, 'formats');
  const outs = await repurpose.repurpose(clip, outDir, { ratios: ['vertical', 'square', 'wide'] });
  if (outs.length !== 3) fail('expected 3 outputs, got ' + outs.length);

  for (const o of outs) {
    if (!fs.existsSync(o.path) || fs.statSync(o.path).size < 1000) fail('missing/empty output ' + o.path);
    const info = await autocut.probe(o.path);
    if (info.width !== o.width || info.height !== o.height) {
      fail(`dims mismatch for ${o.ratio}: got ${info.width}x${info.height}, want ${o.width}x${o.height}`);
    }
  }
  ok('repurpose exported ' + outs.map((o) => o.ratio).join(', ') + ' at correct dimensions');

  console.log('\nALL CHECKS PASSED');
})().catch((e) => fail(e.message));
