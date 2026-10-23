'use strict';

const publish = require('../engine/publish');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }
function ok(msg) { console.log('ok  - ' + msg); }

(function run() {
  const platforms = publish.listPlatforms();
  if (platforms.length < 5) fail('expected >= 5 platforms, got ' + platforms.length);
  if (!publish.getPlatform('tiktok') || !publish.getPlatform('x')) fail('missing core platforms');
  ok('lists ' + platforms.length + ' platforms');

  const cap = publish.buildCaption('Hello world', 'tiktok');
  if (!/Hello world/.test(cap) || !/#fyp/.test(cap)) fail('tiktok caption: ' + cap);
  ok('buildCaption joins text + platform hashtags');

  const xcap = publish.buildCaption('x'.repeat(400), 'x');
  if (xcap.length > 280) fail('X caption not clamped: ' + xcap.length);
  if (!/\u2026$/.test(xcap)) fail('X caption missing ellipsis tail');
  ok('buildCaption clamps to the platform limit (X = 280)');

  const readme = publish.packageReadme(publish.getPlatform('tiktok'), cap, 'clip.mp4');
  if (!/Upload:/.test(readme) || !/tiktok\.com/.test(readme)) fail('readme missing upload url');
  ok('packageReadme points at the platform upload page');

  console.log('\nALL CHECKS PASSED');
})();
