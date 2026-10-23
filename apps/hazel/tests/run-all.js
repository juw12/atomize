'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const files = ['verify_autocut.js', 'verify_repurpose.js', 'verify_publish.js', 'verify_analytics.js', 'verify_storage.js'];
let failed = 0;

for (const f of files) {
  console.log('=== ' + f + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
}

if (failed) {
  console.error('\n' + failed + ' test file(s) failed');
  process.exit(1);
}
console.log('\nALL TEST FILES PASSED');
