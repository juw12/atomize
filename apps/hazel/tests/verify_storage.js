'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const storage = require('../engine/storage');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }
function ok(msg) { console.log('ok  - ' + msg); }

(function run() {
  const files = [
    { path: 'a.mp4', size: 100 },
    { path: 'b.mp4', size: 300 },
    { path: 'c.mov', size: 100 }
  ];

  const u = storage.summarizeUsage(files);
  if (u.count !== 3) fail('count: ' + u.count);
  if (u.totalBytes !== 500) fail('totalBytes: ' + u.totalBytes);
  if (u.byExt[0].ext !== '.mp4' || u.byExt[0].bytes !== 400) fail('byExt: ' + JSON.stringify(u.byExt));
  ok('summarizeUsage aggregates count, bytes and by-extension');

  const groups = storage.groupDuplicates(files, (f) => String(f.size));
  if (groups.length !== 1 || groups[0].length !== 2) fail('groupDuplicates: ' + JSON.stringify(groups.length));
  ok('groupDuplicates groups files sharing a signature');

  const tmp = path.join(os.tmpdir(), 'hazel-stor-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'one.mp4'), Buffer.alloc(10));
  fs.writeFileSync(path.join(tmp, 'two.mp4'), Buffer.alloc(10));
  fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x');

  const scanned = storage.scanDir(tmp);
  if (scanned.length !== 2) fail('scanDir should find 2 videos, got ' + scanned.length);
  ok('scanDir finds videos and skips non-video files');

  const dupes = storage.groupDuplicates(scanned, (f) => storage.signature(f.path));
  if (dupes.length !== 1 || dupes[0].length !== 2) fail('signature duplicate detection: ' + JSON.stringify(dupes.length));
  ok('signature detects identical raws');

  const arch = storage.archiveFiles([dupes[0][0], dupes[0][1]], path.join(tmp, '_hazel-archive'));
  if (arch.archived.length !== 2) fail('archiveFiles count: ' + arch.archived.length);
  if (fs.existsSync(path.join(tmp, 'one.mp4'))) fail('raw should have been moved out of the scan dir');
  if (!fs.existsSync(path.join(tmp, '_hazel-archive', 'one.mp4'))) fail('raw missing from the archive folder');
  ok('archiveFiles moves raws into the archive folder');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nALL CHECKS PASSED');
})();
